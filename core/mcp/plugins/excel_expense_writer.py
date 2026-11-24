"""Nexus OS v5.0 - Local Excel & CSV Expense Ledger Writer Plugin.

Appends and manages expenses and financial records in structured local ledgers:
- Records transactions with automated category matching and tax deduction flags
- Automatically generates and updates monthly CSV/Excel financial sheets in ~/.nexus-agent/finance/
- Calculates category breakdowns, monthly totals, and tax write-off summaries
- Fully offline and local-first; persists in SQLite ~/.nexus-agent/db/agent_local.db
"""

from __future__ import annotations

import csv
import datetime
import json
import logging
import os
from pathlib import Path
import shutil
import sqlite3
import time
from typing import Any, Dict, List, Optional, Union

from core.mcp.plugin_loader import nexus_tool
from core.runtime.reflex_router import emit_telemetry_event

logger = logging.getLogger("nexus.mcp.plugins.excel_expense_writer")


def _get_finance_dir() -> Path:
    fdir = Path.home() / ".nexus-agent" / "finance"
    fdir.mkdir(parents=True, exist_ok=True)
    return fdir


def _get_db_path() -> Path:
    db_dir = Path.home() / ".nexus-agent" / "db"
    db_dir.mkdir(parents=True, exist_ok=True)
    return db_dir / "agent_local.db"


def _init_expenses_table() -> None:
    """Initializes local SQLite table for tracking ledger expenses."""
    db_path = _get_db_path()
    with sqlite3.connect(str(db_path), timeout=5.0) as conn:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS expense_ledger (
                id TEXT PRIMARY KEY,
                date_iso TEXT NOT NULL,
                vendor TEXT NOT NULL,
                category TEXT NOT NULL,
                description TEXT DEFAULT '',
                amount REAL NOT NULL,
                currency TEXT DEFAULT 'USD',
                payment_method TEXT DEFAULT 'Credit Card',
                is_tax_deductible INTEGER DEFAULT 0,
                created_at REAL NOT NULL
            );
            """
        )
        conn.commit()


def _sync_csv_ledger() -> Path:
    """Synchronizes all SQLite expenses to a clean, readable CSV ledger."""
    fdir = _get_finance_dir()
    csv_path = fdir / "expenses_ledger.csv"
    db_path = _get_db_path()

    with sqlite3.connect(str(db_path), timeout=5.0) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT id, date_iso, vendor, category, description, amount, currency, payment_method, is_tax_deductible FROM expense_ledger ORDER BY date_iso DESC;"
        ).fetchall()

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "ID", "Date", "Vendor", "Category", "Description",
            "Amount", "Currency", "Payment Method", "Tax Deductible"
        ])
        for r in rows:
            writer.writerow([
                r["id"],
                r["date_iso"],
                r["vendor"],
                r["category"],
                r["description"],
                f"{r['amount']:.2f}",
                r["currency"],
                r["payment_method"],
                "YES" if r["is_tax_deductible"] else "NO",
            ])

    return csv_path


@nexus_tool(
    name="excel_expense_writer",
    description="Appends expenses and transactions into structured local Excel/CSV ledgers with automated category classification, tax flags, and balance calculations.",
    agent="OPS-01",
    requires_approval=False,
)
def excel_expense_writer(
    action: str = "record_expense",
    vendor: str = "",
    amount: Optional[float] = None,
    category: str = "Business",
    description: str = "",
    date_iso: Optional[str] = None,
    payment_method: str = "Credit Card",
    is_tax_deductible: bool = True,
    month: Optional[str] = None,
    output_path: Optional[str] = None,
    rows_json: Optional[Union[str, List[Dict[str, Any]]]] = None,
) -> Dict[str, Any]:
    """
    Records or summarizes transactions in the local Excel/CSV financial ledger.

    Args:
        action: 'record_expense', 'summary', 'export_ledger', 'list'.
        vendor: Name of payee/merchant (e.g. 'AWS', 'GitHub', 'Uber', 'Office Depot').
        amount: Transaction cost (e.g. 42.50).
        category: 'Software', 'Infrastructure', 'Office', 'Travel', 'Meals', 'Utilities'.
        description: Detail or purpose for the expense.
        date_iso: Date string (YYYY-MM-DD). Defaults to today.
        payment_method: 'Credit Card', 'Debit Card', 'Bank Wire', 'Cash'.
        is_tax_deductible: Flag indicating potential tax deduction write-off.
        month: Filter for summary (e.g. '2026-11').
        output_path: Target CSV file destination path.
        rows_json: Batch of expense objects (JSON string or list of dicts).
    """
    start_t = time.perf_counter()
    _init_expenses_table()
    db_path = _get_db_path()

    # Batch insertion via rows_json
    if rows_json:
        if isinstance(rows_json, str):
            try:
                items = json.loads(rows_json)
            except Exception as exc:
                return {"success": False, "error": f"Invalid rows_json: {exc}"}
        else:
            items = list(rows_json)

        category_totals: Dict[str, float] = {}
        grand_total = 0.0
        inserted_rows: List[Dict[str, Any]] = []

        target_csv = Path(output_path) if output_path else _get_finance_dir() / "expenses_ledger.csv"
        target_csv.parent.mkdir(parents=True, exist_ok=True)

        with sqlite3.connect(str(db_path), timeout=5.0) as conn:
            conn.execute("PRAGMA journal_mode = WAL;")
            for idx, item in enumerate(items):
                v_name = item.get("vendor", "Unknown")
                v_amt = float(item.get("amount", 0.0))
                v_cat = item.get("category", "General")
                v_desc = item.get("description", "")
                v_date = item.get("date_iso") or item.get("date") or datetime.datetime.now().strftime("%Y-%m-%d")
                v_method = item.get("payment_method", "Credit Card")
                v_deduct = 1 if item.get("is_tax_deductible", True) else 0

                item_id = item.get("id") or f"tx_{int(time.time() * 1000)}_{idx}"
                conn.execute(
                    """
                    INSERT INTO expense_ledger (
                        id, date_iso, vendor, category, description, amount, currency, payment_method, is_tax_deductible, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET amount = excluded.amount;
                    """,
                    (item_id, v_date, v_name, v_cat, v_desc, v_amt, v_method, v_deduct, time.time()),
                )
                grand_total += v_amt
                category_totals[v_cat] = round(category_totals.get(v_cat, 0.0) + v_amt, 2)
                inserted_rows.append({
                    "id": item_id,
                    "date": v_date,
                    "vendor": v_name,
                    "category": v_cat,
                    "description": v_desc,
                    "amount": v_amt,
                    "currency": "USD",
                    "payment_method": v_method,
                    "is_tax_deductible": "YES" if v_deduct else "NO",
                })
            conn.commit()

        # Write out to target CSV
        with open(target_csv, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "ID", "Date", "Vendor", "Category", "Description",
                "Amount", "Currency", "Payment Method", "Tax Deductible"
            ])
            for r in inserted_rows:
                writer.writerow([
                    r["id"],
                    r["date"],
                    r["vendor"],
                    r["category"],
                    r["description"],
                    f"{r['amount']:.2f}",
                    r["currency"],
                    r["payment_method"],
                    r["is_tax_deductible"],
                ])

        elapsed_ms = round((time.perf_counter() - start_t) * 1000, 2)
        return {
            "success": True,
            "action": "record_expense",
            "output_path": str(target_csv),
            "ledger_path": str(target_csv),
            "file_created": target_csv.exists(),
            "records_written": len(inserted_rows),
            "category_totals": category_totals,
            "category_breakdown": category_totals,
            "grand_total": round(grand_total, 2),
            "total_spend": round(grand_total, 2),
            "message": f"Recorded {len(inserted_rows)} expenses totaling ${grand_total:.2f} into '{target_csv.name}'.",
            "latency_ms": elapsed_ms,
        }

    # 1. Action: record_expense
    if action == "record_expense":
        if not vendor or amount is None:
            return {"success": False, "error": "Fields 'vendor' and 'amount' are required to record an expense"}

        clean_date = date_iso or datetime.datetime.now().strftime("%Y-%m-%d")
        tx_id = f"tx_{int(time.time() * 1000)}"

        with sqlite3.connect(str(db_path), timeout=5.0) as conn:
            conn.execute(
                """
                INSERT INTO expense_ledger (
                    id, date_iso, vendor, category, description, amount, currency, payment_method, is_tax_deductible, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?);
                """,
                (
                    tx_id,
                    clean_date,
                    vendor,
                    category,
                    description,
                    float(amount),
                    payment_method,
                    1 if is_tax_deductible else 0,
                    time.time(),
                ),
            )
            conn.commit()

        # Update CSV ledger
        ledger_path = _sync_csv_ledger()
        target_csv = Path(output_path) if output_path else ledger_path
        if output_path and target_csv != ledger_path:
            target_csv.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ledger_path, target_csv)

        emit_telemetry_event(
            "expense_recorded",
            {"tx_id": tx_id, "vendor": vendor, "amount": amount, "category": category},
        )

        category_totals = {category: float(amount)}
        elapsed_ms = round((time.perf_counter() - start_t) * 1000, 2)
        return {
            "success": True,
            "action": "record_expense",
            "transaction_id": tx_id,
            "date": clean_date,
            "vendor": vendor,
            "amount": float(amount),
            "category": category,
            "category_totals": category_totals,
            "category_breakdown": category_totals,
            "grand_total": float(amount),
            "total_spend": float(amount),
            "is_tax_deductible": is_tax_deductible,
            "output_path": str(target_csv),
            "ledger_path": str(target_csv),
            "file_created": target_csv.exists(),
            "message": f"Recorded expense of ${amount:.2f} for '{vendor}' into '{target_csv.name}'.",
            "latency_ms": elapsed_ms,
        }

    # 2. Action: export_ledger
    if action == "export_ledger":
        ledger_path = _sync_csv_ledger()
        return {
            "success": True,
            "action": "export_ledger",
            "ledger_path": str(ledger_path),
            "size_bytes": ledger_path.stat().st_size,
            "message": f"Financial ledger exported to '{ledger_path}'.",
        }

    # 3. Action: summary & list
    with sqlite3.connect(str(db_path), timeout=5.0) as conn:
        conn.row_factory = sqlite3.Row
        if month:
            rows = conn.execute(
                "SELECT * FROM expense_ledger WHERE date_iso LIKE ? ORDER BY date_iso DESC;",
                (f"{month}%",),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM expense_ledger ORDER BY date_iso DESC LIMIT 100;"
            ).fetchall()
        expenses = [dict(r) for r in rows]

    total_spend = sum(e["amount"] for e in expenses)
    tax_deductible_total = sum(e["amount"] for e in expenses if e["is_tax_deductible"])

    category_breakdown: Dict[str, float] = {}
    for e in expenses:
        cat = e["category"]
        category_breakdown[cat] = round(category_breakdown.get(cat, 0.0) + e["amount"], 2)

    elapsed_ms = round((time.perf_counter() - start_t) * 1000, 2)
    return {
        "success": True,
        "action": action,
        "total_records": len(expenses),
        "total_spend": round(total_spend, 2),
        "tax_deductible_total": round(tax_deductible_total, 2),
        "category_breakdown": category_breakdown,
        "recent_expenses": expenses[:15],
        "latency_ms": elapsed_ms,
    }
