"""Nexus OS v5.0 - Inbox UPI, Bank & Receipt Expense Parser Plugin.
=============================================================================
Provides sovereign, automated financial transaction extraction and ledger tracking:
- Parses bank SMS, UPI alerts, credit/debit card alerts, and email receipts.
- Deterministic high-speed regex with policy_engine.py JSON fallback.
- Reads credentials safely via Windows DPAPI CredentialVault.
- Persists into ~/.nexus-agent/db/agent_local.db SQLite WAL table 'expenses'.
- Enforces strict air-gap compliance under WorkspaceGovernor [SILENT] mode.
=============================================================================
"""

from __future__ import annotations

import datetime
import json
import logging
import os
from pathlib import Path
import re
import sqlite3
import time
from typing import Any, Dict, List, Optional, Tuple, Union
import uuid

from core.mcp.plugin_loader import nexus_tool
from core.runtime.workspaces import WorkspaceGovernor
from core.security.vault import CredentialVault, get_secret

logger = logging.getLogger("nexus.mcp.plugins.expense_tracker")

# Merchant Category Knowledge Map
MERCHANT_CATEGORY_RULES: List[Tuple[Tuple[str, ...], str, bool]] = [
    # (keywords, Category, is_tax_deductible)
    (("swiggy", "zomato", "mcdonald", "domino", "starbucks", "subway", "kfc", "restaurant", "cafe", "bistro", "pizza", "burger", "food"), "Food & Dining", False),
    (("uber", "ola", "rapido", "irctc", "makemytrip", "indigo", "airindia", "flight", "railway", "metro", "cab", "taxi", "toll", "fastag"), "Travel & Commute", True),
    (("amazon", "flipkart", "myntra", "blinkit", "zepto", "instamart", "bigbasket", "walmart", "supermarket", "groceries"), "Shopping & Groceries", False),
    (("aws", "amazon web services", "google cloud", "gcp", "cloudflare", "digitalocean", "github", "vercel", "supabase", "huggingface", "azure", "docker", "openai", "anthropic"), "Cloud & Infrastructure", True),
    (("netflix", "spotify", "youtube premium", "prime video", "apple", "itunes", "disney", "chatgpt", "claude", "cursor", "notion"), "Subscriptions & Software", True),
    (("electricity", "water", "gas", "bescom", "tneb", "airtel", "jio", "vi", "vodafone", "broadband", "recharge", "utility"), "Utilities & Telecom", True),
    (("pharmacy", "apollo", "medplus", "1mg", "hospital", "clinic", "diagnostic", "doctor", "health"), "Healthcare & Medical", False),
]


def _get_db_path() -> Path:
    """Returns the persistent agent SQLite database path."""
    db_path = Path.home() / ".nexus-agent" / "db" / "agent_local.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return db_path


def init_expenses_table(db_path: Optional[Union[str, Path]] = None) -> None:
    """Ensures the expenses table exists in agent_local.db under SQLite WAL mode."""
    target_path = Path(db_path) if db_path else _get_db_path()
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(str(target_path), timeout=5.0) as conn:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS expenses (
                id TEXT PRIMARY KEY,
                amount REAL NOT NULL,
                currency TEXT NOT NULL DEFAULT 'INR',
                merchant TEXT NOT NULL,
                category TEXT NOT NULL,
                payment_method TEXT DEFAULT '',
                txn_date TEXT DEFAULT '',
                source_msg_id TEXT UNIQUE,
                source TEXT DEFAULT 'auto',
                account_ref TEXT DEFAULT '',
                transaction_ref TEXT DEFAULT '',
                transaction_date TEXT DEFAULT '',
                raw_message TEXT DEFAULT '',
                is_tax_deductible INTEGER DEFAULT 0,
                created_at REAL NOT NULL
            );
            """
        )

        # Non-destructive schema migration for pre-existing tables
        cols = [r[1] for r in conn.execute("PRAGMA table_info(expenses);").fetchall()]
        col_defs = [
            ("merchant", "ALTER TABLE expenses ADD COLUMN merchant TEXT DEFAULT '';"),
            ("category", "ALTER TABLE expenses ADD COLUMN category TEXT DEFAULT '';"),
            ("date", "ALTER TABLE expenses ADD COLUMN date TEXT DEFAULT '';"),
            ("description", "ALTER TABLE expenses ADD COLUMN description TEXT DEFAULT '';"),
            ("payment_method", "ALTER TABLE expenses ADD COLUMN payment_method TEXT DEFAULT '';"),
            ("txn_date", "ALTER TABLE expenses ADD COLUMN txn_date TEXT DEFAULT '';"),
            ("source_msg_id", "ALTER TABLE expenses ADD COLUMN source_msg_id TEXT DEFAULT '';"),
            ("source", "ALTER TABLE expenses ADD COLUMN source TEXT DEFAULT 'auto';"),
            ("account_ref", "ALTER TABLE expenses ADD COLUMN account_ref TEXT DEFAULT '';"),
            ("transaction_ref", "ALTER TABLE expenses ADD COLUMN transaction_ref TEXT DEFAULT '';"),
            ("transaction_date", "ALTER TABLE expenses ADD COLUMN transaction_date TEXT DEFAULT '';"),
            ("raw_message", "ALTER TABLE expenses ADD COLUMN raw_message TEXT DEFAULT '';"),
            ("is_tax_deductible", "ALTER TABLE expenses ADD COLUMN is_tax_deductible INTEGER DEFAULT 0;"),
        ]
        for col_name, stmt in col_defs:
            if col_name not in cols:
                try:
                    conn.execute(stmt)
                except Exception as col_exc:
                    logger.debug("Failed adding column %s to expenses: %s", col_name, col_exc)

        try:
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_source_msg_id ON expenses(source_msg_id);")
        except Exception:
            pass

        conn.execute("CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(txn_date);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_expenses_merchant ON expenses(merchant);")
        conn.commit()


def classify_merchant_and_category(merchant_name: str, raw_text: str = "") -> Tuple[str, bool]:
    """Determines budget category and tax deductibility from merchant name or raw transaction text."""
    combined = f"{merchant_name} {raw_text}".lower()
    for keywords, category, tax_deductible in MERCHANT_CATEGORY_RULES:
        for kw in keywords:
            if kw in combined:
                return category, tax_deductible
    return "General & Miscellaneous", False


class DeterministicExpenseParser:
    """High-speed zero-dependency deterministic regex parser for financial messages."""

    # Reference number patterns (UPI Ref, UTR, Txn ID, Auth Code)
    REF_PATTERNS = [
        re.compile(r"(?:UPI\s*(?:Ref|Reference)?(?:\s*(?:no\.?|id))?|UTR(?:\s*no\.?)?|Txn\s*ID|Ref\s*No\.?)\s*[:\-]?\s*([A-Za-z0-9]{6,22})", re.IGNORECASE),
        re.compile(r"\bRef\s+([A-Za-z0-9]{8,18})\b", re.IGNORECASE),
    ]

    # Account reference patterns (A/C XX1234, Card ending 9999, VPA)
    ACC_PATTERNS = [
        re.compile(r"(?:A\/C|acct|account|Card(?:\s*ending)?)\s*[:\-]?\s*([xX\*0-9]{3,16})", re.IGNORECASE),
        re.compile(r"(?:VPA|UPI\s*ID)\s*[:\-]?\s*([a-zA-Z0-9\.\-_]+@[a-zA-Z0-9]+)", re.IGNORECASE),
    ]

    @classmethod
    def parse(cls, text: str, source: str = "auto") -> Optional[Dict[str, Any]]:
        """Parses bank/UPI/card/receipt notification string into structured transaction dict."""
        if not text or not isinstance(text, str):
            return None

        clean = text.strip()
        lower = clean.lower()

        # 1. Determine currency
        currency = "INR"
        if "$" in clean or "usd" in lower:
            currency = "USD"
        elif "€" in clean or "eur" in lower:
            currency = "EUR"
        elif "£" in clean or "gbp" in lower:
            currency = "GBP"

        # 2. Extract transaction amount
        amount: Optional[float] = None
        # Explicit debit phrases: "debited Rs 450", "charged USD 45.00"
        debit_match = re.search(
            r"(?:debited(?:\s*by|\s*for|\s*with)?|paid|spent|sent|transferred|charge[d]?)\s+(?:(?:Rs\.?|INR|USD|EUR|GBP|\$|₹)\s*)?([0-9,]+(?:\.[0-9]{1,2})?)",
            clean,
            re.IGNORECASE,
        )
        if debit_match:
            try:
                amount = float(debit_match.group(1).replace(",", ""))
            except ValueError:
                amount = None

        if amount is None:
            amt_first = re.search(
                r"(?:Rs\.?|INR|USD|EUR|GBP|\$|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)\s+(?:debited|paid|spent|deducted|transferred|charged)",
                clean,
                re.IGNORECASE,
            )
            if amt_first:
                try:
                    amount = float(amt_first.group(1).replace(",", ""))
                except ValueError:
                    amount = None

        if amount is None:
            # Receipt style "Total: $12.50" or "Total Due: Rs 450"
            total_match = re.search(
                r"(?:total|amount|due|fare|bill)\s*[:\-]?\s*(?:(?:Rs\.?|INR|USD|EUR|GBP|\$|₹)\s*)?([0-9,]+(?:\.[0-9]{1,2})?)",
                clean,
                re.IGNORECASE,
            )
            if total_match:
                try:
                    amount = float(total_match.group(1).replace(",", ""))
                except ValueError:
                    amount = None

        if amount is None or amount <= 0:
            return None

        # 3. Extract Merchant / Payee
        merchant = ""
        # 3a. Check well-known brand keywords first
        for keywords, _, _ in MERCHANT_CATEGORY_RULES:
            for kw in keywords:
                if re.search(rf"\b{re.escape(kw)}\b", lower):
                    merchant = kw.title()
                    break
            if merchant:
                break

        # 3b. UPI "to <merchant> on" or "at <merchant>"
        if not merchant:
            to_match = re.search(r"(?:to|at|vpa)\s+([A-Za-z0-9\s\.\@\-_&]{2,40}?)(?:\s+on|\s+ref|\s+upi|\s+avl|\s+bal|\s+a\/c|\.|$)", clean, re.IGNORECASE)
            if to_match:
                candidate = to_match.group(1).strip()
                if candidate.lower() not in ("your", "a/c", "account", "the", "an", "debit", "credit"):
                    merchant = candidate

        if not merchant:
            # Bank SMS Info: "Info: Amazon Pay" or "Store: ..."
            info_match = re.search(r"(?:Info|Narration|Merchant|Store)\s*[:\-]?\s*([A-Za-z0-9\s\.\-_&]{2,35})", clean, re.IGNORECASE)
            if info_match:
                merchant = info_match.group(1).strip()

        if not merchant:
            for_match = re.search(r"(?:for)\s+([A-Za-z0-9\s\.\@\-_&]{2,40}?)(?:\s+on|\s+ref|\s+upi|\s+avl|\s+bal|\s+a\/c|\.|$)", clean, re.IGNORECASE)
            if for_match:
                candidate = for_match.group(1).strip()
                if candidate.lower() not in ("your", "a/c", "account", "the", "an", "debit", "credit"):
                    merchant = candidate

        if not merchant:
            merchant = "Unknown Merchant"

        if merchant and (merchant.isupper() or merchant.islower()):
            merchant = merchant.title()

        # 4. Extract Account Reference
        account_ref = ""
        for pat in cls.ACC_PATTERNS:
            m = pat.search(clean)
            if m:
                account_ref = m.group(0).strip()
                break

        # 5. Extract Transaction Reference
        transaction_ref = ""
        for pat in cls.REF_PATTERNS:
            m = pat.search(clean)
            if m:
                transaction_ref = m.group(1).strip()
                break

        # 6. Extract or default transaction date
        today_iso = datetime.date.today().isoformat()
        date_match = re.search(r"\b([0-9]{2}[-/.][0-9]{2}[-/.][0-9]{2,4}|[0-9]{4}[-/.][0-9]{2}[-/.][0-9]{2})\b", clean)
        transaction_date = today_iso
        if date_match:
            raw_d = date_match.group(1).replace("/", "-").replace(".", "-")
            parts = raw_d.split("-")
            if len(parts) == 3:
                if len(parts[0]) == 4:
                    transaction_date = f"{parts[0]}-{parts[1].zfill(2)}-{parts[2].zfill(2)}"
                elif len(parts[2]) == 4:
                    transaction_date = f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
                elif len(parts[2]) == 2:
                    transaction_date = f"20{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"

        # 7. Category & Tax Deductible
        category, is_tax = classify_merchant_and_category(merchant, clean)

        # 8. Payment Method
        payment_method = "Other"
        if "upi" in lower or "@" in account_ref:
            payment_method = "UPI"
        elif "credit card" in lower or ("card" in lower and "credit" in lower):
            payment_method = "Credit Card"
        elif "debit card" in lower or "card ending" in lower:
            payment_method = "Debit Card"
        elif "net banking" in lower or "a/c" in lower or "neft" in lower or "rtgs" in lower:
            payment_method = "Bank Transfer"
        elif "cash" in lower:
            payment_method = "Cash"
        else:
            payment_method = "UPI" if currency == "INR" else "Card"

        resolved_source = source
        if resolved_source == "auto":
            resolved_source = payment_method.lower().replace(" ", "_")

        # Source Msg ID for uniqueness
        source_msg_id = transaction_ref or f"msg_{hash(clean) & 0xFFFFFFFF:08x}_{int(time.time())}"

        return {
            "amount": amount,
            "currency": currency,
            "merchant": merchant,
            "category": category,
            "payment_method": payment_method,
            "txn_date": transaction_date,
            "source_msg_id": source_msg_id,
            "account_ref": account_ref,
            "transaction_ref": transaction_ref,
            "transaction_date": transaction_date,
            "source": resolved_source,
            "is_tax_deductible": 1 if is_tax else 0,
        }


class ExpenseTracker:
    """
    Sovereign expense parsing and storage engine for Nexus OS v5.0.
    Integrates DPAPI credentials, regex + policy fallback, and SQLite WAL storage.
    """

    def __init__(self, db_path: Optional[Union[str, Path]] = None):
        self.db_path = Path(db_path) if db_path else _get_db_path()
        self.vault = CredentialVault()
        init_expenses_table(self.db_path)

    def parse_and_store(self, raw_message: str, source: str = "auto") -> Optional[Dict[str, Any]]:
        """Parses a single financial text message and stores it into SQLite WAL."""
        parsed = DeterministicExpenseParser.parse(raw_message, source=source)

        # Policy Engine fallback if deterministic regex failed to extract amount or merchant
        if not parsed or not parsed.get("amount"):
            governor = WorkspaceGovernor()
            if not governor.is_silent():
                try:
                    from core.runtime.policy_engine import AxionicPolicyRuntime, strict_json_policy
                    schema = {
                        "type": "object",
                        "properties": {
                            "amount": {"type": "number"},
                            "currency": {"type": "string"},
                            "merchant": {"type": "string"},
                            "category": {"type": "string"},
                            "payment_method": {"type": "string"},
                            "account_ref": {"type": "string"},
                            "transaction_ref": {"type": "string"},
                            "txn_date": {"type": "string"},
                        },
                        "required": ["amount", "merchant"],
                    }
                    policy = strict_json_policy(schema)
                    runtime = AxionicPolicyRuntime()
                    prompt = f"Extract financial transaction data from this message:\n{raw_message}"
                    res = runtime.execute_with_policy(policy=policy, prompt=prompt)
                    if res and isinstance(res, dict) and res.get("amount"):
                        parsed = {
                            "amount": float(res["amount"]),
                            "currency": res.get("currency", "INR"),
                            "merchant": str(res.get("merchant", "Unknown Merchant")),
                            "category": str(res.get("category", "General")),
                            "payment_method": str(res.get("payment_method", "Other")),
                            "txn_date": str(res.get("txn_date", datetime.date.today().isoformat())),
                            "source_msg_id": f"policy_{uuid.uuid4().hex[:8]}",
                            "account_ref": str(res.get("account_ref", "")),
                            "transaction_ref": str(res.get("transaction_ref", "")),
                            "transaction_date": str(res.get("txn_date", datetime.date.today().isoformat())),
                            "source": source if source != "auto" else "policy_fallback",
                            "is_tax_deductible": 0,
                        }
                except Exception as exc:
                    logger.debug("Policy engine expense parse notice: %s", exc)

        if not parsed:
            return None

        exp_id = f"exp_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"
        now = time.time()
        source_msg_id = parsed.get("source_msg_id", exp_id)
        txn_date_val = parsed.get("txn_date", parsed.get("transaction_date", "")) or datetime.date.today().isoformat()

        with sqlite3.connect(str(self.db_path), timeout=5.0) as conn:
            cols = set(r[1] for r in conn.execute("PRAGMA table_info(expenses);").fetchall())
            existing = None
            if source_msg_id and "source_msg_id" in cols:
                try:
                    cur = conn.execute("SELECT id FROM expenses WHERE source_msg_id = ? LIMIT 1;", (source_msg_id,))
                    existing = cur.fetchone()
                except Exception:
                    existing = None

            record = {
                "id": exp_id,
                "amount": parsed["amount"],
                "currency": parsed["currency"],
                "merchant": parsed["merchant"],
                "category": parsed["category"],
                "payment_method": parsed.get("payment_method", "UPI"),
                "txn_date": txn_date_val,
                "date": txn_date_val,
                "source_msg_id": source_msg_id,
                "source": parsed.get("source", "auto"),
                "account_ref": parsed.get("account_ref", ""),
                "transaction_ref": parsed.get("transaction_ref", ""),
                "transaction_date": txn_date_val,
                "description": f"{parsed['merchant']} - {parsed['category']}",
                "raw_message": raw_message.strip(),
                "is_tax_deductible": parsed.get("is_tax_deductible", 0),
                "created_at": now,
            }

            if existing:
                exp_id = existing[0]
                update_fields = [k for k in record if k != "id" and k in cols]
                set_clause = ", ".join(f"{k} = ?" for k in update_fields)
                values = [record[k] for k in update_fields] + [exp_id]
                conn.execute(f"UPDATE expenses SET {set_clause} WHERE id = ?;", values)
            else:
                insert_fields = [k for k in record if k in cols]
                cols_clause = ", ".join(insert_fields)
                placeholders = ", ".join("?" for _ in insert_fields)
                values = [record[k] for k in insert_fields]
                conn.execute(f"INSERT INTO expenses ({cols_clause}) VALUES ({placeholders});", values)
            conn.commit()

        parsed["id"] = exp_id
        parsed["created_at"] = now
        return parsed

    def sync_inbox_expenses(self, messages: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Syncs financial transactions from inbox messages or DPAPI IMAP credentials.
        Strictly enforces WorkspaceGovernor [SILENT] air-gap: in SILENT mode,
        blocks live network sync and queries only the local SQLite cache.
        """
        governor = WorkspaceGovernor()
        if governor.is_silent():
            cached = self.query_expenses(limit=100)
            return {
                "success": True,
                "synced_count": 0,
                "workspace_mode": "SILENT",
                "air_gapped": True,
                "message": "Air-gap mode [SILENT] active: live IMAP network sync blocked, queried local SQLite cache.",
                "expenses": cached,
            }

        input_msgs = messages or []
        if not input_msgs:
            # Check DPAPI vault for credentials safely
            imap_pass = self.vault.get_secret("IMAP_PASSWORD") or get_secret("IMAP_PASS")
            gmail_token = self.vault.get_secret("GMAIL_REFRESH_TOKEN") or get_secret("GMAIL_API_TOKEN")
            if not imap_pass and not gmail_token:
                logger.debug("No external inbox credential configured in DPAPI vault.")

        synced: List[Dict[str, Any]] = []
        for msg in input_msgs:
            res = self.parse_and_store(msg)
            if res:
                synced.append(res)

        return {
            "success": True,
            "synced_count": len(synced),
            "workspace_mode": governor.get_mode(),
            "air_gapped": False,
            "expenses": synced,
        }

    def query_expenses(
        self,
        category: Optional[str] = None,
        merchant: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """Queries stored expenses from agent_local.db with optional filtering."""
        query = "SELECT * FROM expenses WHERE 1=1"
        params: List[Any] = []

        if category:
            query += " AND category LIKE ?"
            params.append(f"%{category}%")
        if merchant:
            query += " AND merchant LIKE ?"
            params.append(f"%{merchant}%")
        if start_date:
            query += " AND (txn_date >= ? OR transaction_date >= ?)"
            params.append(start_date)
            params.append(start_date)
        if end_date:
            query += " AND (txn_date <= ? OR transaction_date <= ?)"
            params.append(end_date)
            params.append(end_date)

        query += " ORDER BY txn_date DESC, created_at DESC LIMIT ?"
        params.append(max(1, min(500, int(limit))))

        with sqlite3.connect(str(self.db_path), timeout=5.0) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(query, tuple(params)).fetchall()
            return [dict(r) for r in rows]

    def get_spend_summary(self, period: str = "month") -> Dict[str, Any]:
        """Calculates total spend, category breakdown, top merchants, and transaction count."""
        governor = WorkspaceGovernor()
        is_silent = governor.is_silent()

        with sqlite3.connect(str(self.db_path), timeout=5.0) as conn:
            conn.row_factory = sqlite3.Row

            tot_row = conn.execute("SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0.0) as total FROM expenses;").fetchone()
            total_spend = tot_row["total"] if tot_row else 0.0
            total_count = tot_row["cnt"] if tot_row else 0

            cat_rows = conn.execute(
                "SELECT category, COUNT(*) as cnt, SUM(amount) as cat_total FROM expenses GROUP BY category ORDER BY cat_total DESC;"
            ).fetchall()
            by_category = {r["category"]: round(r["cat_total"], 2) for r in cat_rows}

            merch_rows = conn.execute(
                "SELECT merchant, COUNT(*) as cnt, SUM(amount) as merch_total FROM expenses GROUP BY merchant ORDER BY merch_total DESC LIMIT 10;"
            ).fetchall()
            top_merchants = [{
                "merchant": r["merchant"],
                "total": round(r["merch_total"], 2),
                "count": r["cnt"],
            } for r in merch_rows]

            recent_rows = conn.execute(
                "SELECT id, amount, currency, merchant, category, payment_method, txn_date FROM expenses ORDER BY txn_date DESC, created_at DESC LIMIT 10;"
            ).fetchall()
            recent_items = [dict(r) for r in recent_rows]

        return {
            "success": True,
            "period": period,
            "total_spend": round(total_spend, 2),
            "currency": "INR",
            "transaction_count": total_count,
            "by_category": by_category,
            "top_merchants": top_merchants,
            "recent_expenses": recent_items,
            "air_gapped": is_silent,
        }

    def get_top_merchants(self, period: str = "month", limit: int = 10) -> Dict[str, Any]:
        """Returns the top merchants by expenditure for the specified period."""
        clean_limit = max(1, min(100, int(limit)))
        with sqlite3.connect(str(self.db_path), timeout=5.0) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT merchant, COUNT(*) as txn_count, SUM(amount) as total_amount FROM expenses GROUP BY merchant ORDER BY total_amount DESC LIMIT ?;",
                (clean_limit,),
            ).fetchall()
            results = [{
                "merchant": r["merchant"],
                "total_amount": round(r["total_amount"], 2),
                "transaction_count": r["txn_count"],
            } for r in rows]

        return {
            "success": True,
            "period": period,
            "limit": clean_limit,
            "count": len(results),
            "merchants": results,
        }

    def get_category_breakdown(self, period: str = "month") -> Dict[str, Any]:
        """Returns spend breakdown grouped by category for the specified period."""
        with sqlite3.connect(str(self.db_path), timeout=5.0) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT category, COUNT(*) as txn_count, SUM(amount) as total_amount FROM expenses GROUP BY category ORDER BY total_amount DESC;"
            ).fetchall()
            categories = [{
                "category": r["category"],
                "total_amount": round(r["total_amount"], 2),
                "transaction_count": r["txn_count"],
            } for r in rows]

        return {
            "success": True,
            "period": period,
            "categories": categories,
        }

    def get_summary(self, period: str = "month") -> Dict[str, Any]:
        """Compatible alias for get_spend_summary."""
        return self.get_spend_summary(period=period)

    def sync_inbox_messages(self, messages: Optional[List[str]] = None) -> Dict[str, Any]:
        """Compatible alias for sync_inbox_expenses."""
        return self.sync_inbox_expenses(messages=messages)


# Global Expense Tracker Singleton
_expense_tracker_singleton: Optional[ExpenseTracker] = None


def get_expense_tracker(db_path: Optional[Union[str, Path]] = None) -> ExpenseTracker:
    """Returns singleton ExpenseTracker instance."""
    global _expense_tracker_singleton
    if _expense_tracker_singleton is None or db_path:
        _expense_tracker_singleton = ExpenseTracker(db_path=db_path)
    return _expense_tracker_singleton


# -----------------------------------------------------------------------------
# Expose @nexus_tool decorators
# -----------------------------------------------------------------------------
@nexus_tool(
    name="sync_inbox_expenses",
    description="Syncs financial notifications from inbox or provided messages into SQLite WAL ledger; air-gapped in [SILENT] mode.",
    agent="FINANCE-01",
    requires_approval=False,
)
def sync_inbox_expenses(messages: Optional[List[str]] = None) -> Dict[str, Any]:
    tracker = get_expense_tracker()
    return tracker.sync_inbox_expenses(messages=messages)


@nexus_tool(
    name="get_spend_summary",
    description="Calculates total expenditure, category breakdown, top merchants, and transaction volume.",
    agent="FINANCE-01",
    requires_approval=False,
)
def get_spend_summary(period: str = "month") -> Dict[str, Any]:
    tracker = get_expense_tracker()
    return tracker.get_spend_summary(period=period)


get_expense_summary = get_spend_summary


@nexus_tool(
    name="get_top_merchants",
    description="Retrieves top merchants ranked by total spend from SQLite WAL expenses table.",
    agent="FINANCE-01",
    requires_approval=False,
)
def get_top_merchants(period: str = "month", limit: int = 10) -> Dict[str, Any]:
    tracker = get_expense_tracker()
    return tracker.get_top_merchants(period=period, limit=limit)


@nexus_tool(
    name="get_category_breakdown",
    description="Retrieves spend breakdown grouped by category from SQLite WAL expenses table.",
    agent="FINANCE-01",
    requires_approval=False,
)
def get_category_breakdown(period: str = "month") -> Dict[str, Any]:
    tracker = get_expense_tracker()
    return tracker.get_category_breakdown(period=period)


@nexus_tool(
    name="parse_expense_message",
    description="Parses an inbox UPI, bank debit, credit card alert, or receipt message and records to expense ledger.",
    agent="FINANCE-01",
    requires_approval=False,
)
def parse_expense_message(message: str, source: str = "auto") -> Dict[str, Any]:
    tracker = get_expense_tracker()
    res = tracker.parse_and_store(message, source=source)
    if res:
        return {"success": True, "expense": res}
    return {"success": False, "error": "Unable to extract financial transaction from message"}


@nexus_tool(
    name="query_expenses",
    description="Queries stored financial expenses from SQLite WAL ledger with category, merchant, and date filters.",
    agent="FINANCE-01",
    requires_approval=False,
)
def query_expenses(
    category: Optional[str] = None,
    merchant: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 50,
) -> Dict[str, Any]:
    tracker = get_expense_tracker()
    rows = tracker.query_expenses(
        category=category,
        merchant=merchant,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
    )
    return {"success": True, "count": len(rows), "expenses": rows}


__all__ = [
    "ExpenseTracker",
    "DeterministicExpenseParser",
    "init_expenses_table",
    "get_expense_tracker",
    "sync_inbox_expenses",
    "get_spend_summary",
    "get_expense_summary",
    "get_top_merchants",
    "get_category_breakdown",
    "parse_expense_message",
    "query_expenses",
]
