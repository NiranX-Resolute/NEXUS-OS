"""Nexus OS v5.0 - SaaS & Cloud Subscription Radar Plugin.

Tracks recurring SaaS and infrastructure services, computes monthly/annual burn rates,
and provides proactive renewal alerts to prevent accidental subscription billings.
Persists all subscriptions in SQLite ~/.nexus-agent/db/agent_local.db.
"""

from __future__ import annotations

import datetime
import json
import logging
import os
from pathlib import Path
import sqlite3
import time
from typing import Any, Dict, List, Literal, Optional

from core.mcp.plugin_loader import nexus_tool
from core.runtime.reflex_router import emit_telemetry_event

logger = logging.getLogger("nexus.mcp.plugins.subscription_radar")


def _get_db_path() -> Path:
    db_dir = Path.home() / ".nexus-agent" / "db"
    db_dir.mkdir(parents=True, exist_ok=True)
    return db_dir / "agent_local.db"


def _init_subscriptions_table() -> None:
    """Initializes local SQLite table for tracking SaaS subscriptions."""
    db_path = _get_db_path()
    with sqlite3.connect(str(db_path), timeout=5.0) as conn:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS subscription_radar (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                cost REAL NOT NULL,
                currency TEXT DEFAULT 'USD',
                billing_cycle TEXT DEFAULT 'monthly',
                category TEXT DEFAULT 'Cloud/Dev',
                renewal_day INTEGER DEFAULT 1,
                active INTEGER DEFAULT 1,
                notes TEXT DEFAULT '',
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            );
            """
        )
        conn.commit()


@nexus_tool(
    name="subscription_radar",
    description="Audits recurring SaaS and cloud subscriptions, tracking renewal schedules, calculating burn rates, and alerting on upcoming charges.",
    agent="OPS-01",
    requires_approval=False,
)
def subscription_radar(
    action: Literal["list", "add", "audit", "remove", "summary"] = "list",
    name: Optional[str] = None,
    cost: Optional[float] = None,
    currency: str = "USD",
    billing_cycle: Literal["monthly", "annual"] = "monthly",
    category: str = "Cloud/Dev",
    renewal_day: int = 1,
    subscription_id: Optional[str] = None,
    notes: str = "",
) -> Dict[str, Any]:
    """
    Manages and audits recurring software and cloud subscriptions.

    Args:
        action: 'list', 'add', 'audit', 'remove', 'summary'.
        name: Name of the service (e.g. 'Cloudflare Workers', 'GitHub Copilot', 'Vercel').
        cost: Price per billing cycle.
        currency: ISO currency code ('USD', 'EUR', etc.).
        billing_cycle: 'monthly' or 'annual'.
        category: 'Cloud/Dev', 'Productivity', 'Entertainment', 'Infrastructure', etc.
        renewal_day: Day of the month for renewal (1-31).
        subscription_id: ID for remove/update operations.
        notes: Contextual notes or reminder notes.
    """
    start_t = time.perf_counter()
    _init_subscriptions_table()
    db_path = _get_db_path()
    now = datetime.datetime.now()

    # 1. Action: add
    if action == "add":
        if not name or cost is None:
            return {"success": False, "error": "Fields 'name' and 'cost' are required to add a subscription"}

        sub_id = f"sub_{name.lower().replace(' ', '_')}_{int(time.time() % 10000)}"
        safe_renewal = max(1, min(31, int(renewal_day)))

        with sqlite3.connect(str(db_path), timeout=5.0) as conn:
            conn.execute(
                """
                INSERT INTO subscription_radar (
                    id, name, cost, currency, billing_cycle, category, renewal_day, active, notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    cost = excluded.cost,
                    billing_cycle = excluded.billing_cycle,
                    renewal_day = excluded.renewal_day,
                    updated_at = excluded.updated_at;
                """,
                (
                    sub_id,
                    name,
                    float(cost),
                    currency.upper(),
                    billing_cycle.lower(),
                    category,
                    safe_renewal,
                    notes,
                    time.time(),
                    time.time(),
                ),
            )
            conn.commit()

        emit_telemetry_event(
            "subscription_added",
            {"id": sub_id, "name": name, "cost": cost, "cycle": billing_cycle},
        )

        return {
            "success": True,
            "action": "add",
            "subscription_id": sub_id,
            "name": name,
            "cost": cost,
            "currency": currency,
            "billing_cycle": billing_cycle,
            "message": f"Successfully registered '{name}' ({currency} {cost:.2f}/{billing_cycle}).",
        }

    # 2. Action: remove
    if action == "remove":
        target = subscription_id or name
        if not target:
            return {"success": False, "error": "subscription_id or name is required for removal"}

        with sqlite3.connect(str(db_path), timeout=5.0) as conn:
            cur = conn.execute(
                "UPDATE subscription_radar SET active = 0, updated_at = ? WHERE id = ? OR name = ?;",
                (time.time(), target, target),
            )
            conn.commit()
            changes = cur.rowcount

        return {
            "success": True,
            "action": "remove",
            "target": target,
            "removed": changes > 0,
            "message": f"Deactivated subscription for '{target}'.",
        }

    # 3. Action: list, summary, audit
    with sqlite3.connect(str(db_path), timeout=5.0) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM subscription_radar WHERE active = 1 ORDER BY cost DESC;"
        ).fetchall()
        subscriptions = [dict(r) for r in rows]

    # Calculate monthly & annual burn rates
    monthly_burn = 0.0
    for s in subscriptions:
        c = float(s["cost"])
        if s["billing_cycle"] == "monthly":
            monthly_burn += c
        elif s["billing_cycle"] == "annual":
            monthly_burn += (c / 12.0)
    annual_burn = monthly_burn * 12.0

    # Calculate upcoming renewals (within next 7 and 14 days)
    today_day = now.day
    upcoming_7_days: List[Dict[str, Any]] = []
    upcoming_14_days: List[Dict[str, Any]] = []

    for s in subscriptions:
        r_day = s["renewal_day"]
        diff = (r_day - today_day) % 30
        if 0 <= diff <= 7:
            upcoming_7_days.append({**s, "days_until_renewal": diff})
        if 0 <= diff <= 14:
            upcoming_14_days.append({**s, "days_until_renewal": diff})

    elapsed_ms = round((time.perf_counter() - start_t) * 1000, 2)

    if action == "audit":
        recommendations = []
        if len(subscriptions) > 0 and monthly_burn > 100.0:
            recommendations.append(f"High monthly software burn rate: ${monthly_burn:.2f}/mo. Audit unused tools.")
        if len(upcoming_7_days) > 0:
            names = ", ".join(u["name"] for u in upcoming_7_days)
            recommendations.append(f"Imminent renewal within 7 days: {names}.")
        if not recommendations:
            recommendations.append("Subscription portfolio is healthy and optimized.")

        return {
            "success": True,
            "action": "audit",
            "total_active": len(subscriptions),
            "monthly_burn": round(monthly_burn, 2),
            "annual_burn": round(annual_burn, 2),
            "upcoming_7_days": upcoming_7_days,
            "upcoming_14_days": upcoming_14_days,
            "recommendations": recommendations,
            "subscriptions": subscriptions,
            "latency_ms": elapsed_ms,
        }

    return {
        "success": True,
        "action": action,
        "total_active": len(subscriptions),
        "monthly_burn": round(monthly_burn, 2),
        "annual_burn": round(annual_burn, 2),
        "upcoming_renewals": upcoming_7_days,
        "subscriptions": subscriptions,
        "latency_ms": elapsed_ms,
    }
