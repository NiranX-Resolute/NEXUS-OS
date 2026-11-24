"""Nexus OS v5.0 - Fridge & Pantry Dinner Planner Plugin.

Inventories available fridge and pantry ingredients and generates chef-grade dinner recipes
to minimize food waste and optimize healthy nutrition based on active household stock.
Stores pantry inventory in SQLite ~/.nexus-agent/db/agent_local.db.
"""

from __future__ import annotations

import datetime
import json
import logging
import os
from pathlib import Path
import sqlite3
import time
from typing import Any, Dict, List, Optional

from core.mcp.plugin_loader import nexus_tool
from core.runtime.reflex_router import emit_telemetry_event

logger = logging.getLogger("nexus.mcp.plugins.fridge_dinner_planner")

# Curated culinary recipes mapping core pantry foundations to creative meals
RECIPE_KNOWLEDGE_BASE = [
    {
        "title": "Crispy Garlic Soy Pan-Seared Chicken & Jasmine Rice",
        "primary": ["chicken", "rice", "soy sauce", "garlic"],
        "cook_time_mins": 25,
        "difficulty": "Easy",
        "calories": 520,
        "instructions": [
            "Rinse jasmine rice and set to boil with 1.5x water ratio and a pinch of salt.",
            "Dice chicken into bite-sized cutlets; season with cracked black pepper and salt.",
            "Heat a skillet with oil; sear chicken on high for 4 mins per side until golden brown.",
            "Mince garlic; lower skillet heat, stir in garlic and soy sauce for 60 seconds to glaze.",
            "Serve glazed chicken over warm jasmine rice with fresh sliced scallions or sesame.",
        ],
    },
    {
        "title": "Rustic Italian Tomato Herb Pasta with Toasted Garlic",
        "primary": ["pasta", "tomato", "garlic", "olive oil"],
        "cook_time_mins": 20,
        "difficulty": "Beginner",
        "calories": 440,
        "instructions": [
            "Bring salted water to a rolling boil; cook pasta until al dente (8-9 mins).",
            "Thinly slice garlic and gently sizzle in olive oil over medium-low heat until fragrant.",
            "Crush or dice tomatoes into the skillet; simmer for 10 minutes until sauce thickens.",
            "Transfer pasta directly into the sauce; toss vigorously with 2 tablespoons of pasta water.",
            "Finish with fresh cracked pepper and grated parmesan cheese if available.",
        ],
    },
    {
        "title": "Quick Sizzling Egg Fried Rice with Veggies",
        "primary": ["rice", "egg", "onion", "soy sauce"],
        "cook_time_mins": 15,
        "difficulty": "Easy",
        "calories": 380,
        "instructions": [
            "Heat wok or heavy pan on high with oil until lightly smoking.",
            "Whisk eggs and scramble softly for 45 seconds, then set aside.",
            "Sauté diced onions and any available crisp vegetables (bell pepper, peas) for 2 minutes.",
            "Add chilled day-old rice, breaking clumps with a spatula over maximum heat.",
            "Drizzle soy sauce along the wok edge, fold eggs back in, and toss vigorously for 1 minute.",
        ],
    },
    {
        "title": "Mediterranean Lemon Chickpea & Greens Skillet",
        "primary": ["chickpeas", "spinach", "garlic", "lemon"],
        "cook_time_mins": 18,
        "difficulty": "Easy",
        "calories": 360,
        "instructions": [
            "Drain and pat chickpeas dry with a clean towel.",
            "Heat olive oil in a skillet; pan-fry chickpeas with minced garlic and cumin until crisp.",
            "Fold in fresh spinach or greens; toss until wilted (about 2 minutes).",
            "Squeeze fresh lemon juice over the skillet and season generously with sea salt.",
            "Pair with warm pita bread, toast, or fluffy quinoa.",
        ],
    },
    {
        "title": "Loaded Cheesy Garden Frittata",
        "primary": ["egg", "cheese", "onion", "bell pepper"],
        "cook_time_mins": 20,
        "difficulty": "Easy",
        "calories": 410,
        "instructions": [
            "Preheat oven or grill to 375°F (190°C).",
            "Sauté diced onions and bell peppers in an oven-safe skillet until tender-crisp.",
            "Beat 4-6 eggs with a splash of milk, salt, pepper, and half the cheese.",
            "Pour egg mixture over sautéed veggies and cook undisturbed on stovetop for 4 minutes.",
            "Top with remaining cheese and broil in oven for 3-5 minutes until puffed and golden.",
        ],
    },
]


def _get_db_path() -> Path:
    db_dir = Path.home() / ".nexus-agent" / "db"
    db_dir.mkdir(parents=True, exist_ok=True)
    return db_dir / "agent_local.db"


def _init_pantry_table() -> None:
    """Initializes local SQLite table for tracking fridge and pantry inventory."""
    db_path = _get_db_path()
    with sqlite3.connect(str(db_path), timeout=5.0) as conn:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS fridge_pantry (
                ingredient TEXT PRIMARY KEY,
                category TEXT DEFAULT 'produce',
                quantity TEXT DEFAULT '1 item',
                freshness_status TEXT DEFAULT 'fresh',
                added_at REAL NOT NULL
            );
            """
        )
        conn.commit()


@nexus_tool(
    name="fridge_dinner_planner",
    description="Generates personalized culinary recipes based on currently available fridge/pantry ingredients and dietary targets to eliminate food waste.",
    agent="SCOUT-01",
    requires_approval=False,
)
def fridge_dinner_planner(
    action: str = "generate_plan",
    ingredients: Optional[List[str]] = None,
    dietary_preference: str = "any",
    ingredient_to_remove: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Inventories household pantry items and calculates recipe suggestions matching current supplies.

    Args:
        action: 'generate_plan' (recommend recipes), 'inventory' (view stock), 'add_ingredients', 'clear'.
        ingredients: List of ingredient strings to add or evaluate (e.g. ['chicken', 'rice', 'garlic']).
        dietary_preference: Filter for diet ('vegetarian', 'high_protein', 'quick_under_20min', 'any').
        ingredient_to_remove: Specific ingredient name to delete from inventory.
    """
    start_t = time.perf_counter()
    _init_pantry_table()
    db_path = _get_db_path()

    # 1. Action: add_ingredients
    if action == "add_ingredients" and ingredients:
        with sqlite3.connect(str(db_path), timeout=5.0) as conn:
            for item in ingredients:
                clean_item = item.strip().lower()
                if clean_item:
                    conn.execute(
                        """
                        INSERT INTO fridge_pantry (ingredient, category, added_at)
                        VALUES (?, 'pantry', ?)
                        ON CONFLICT(ingredient) DO UPDATE SET added_at = excluded.added_at;
                        """,
                        (clean_item, time.time()),
                    )
            conn.commit()

        return {
            "success": True,
            "action": "add_ingredients",
            "added_count": len(ingredients),
            "added_items": ingredients,
            "message": f"Added {len(ingredients)} ingredient(s) into local fridge inventory.",
        }

    # 2. Action: clear
    if action == "clear":
        with sqlite3.connect(str(db_path), timeout=5.0) as conn:
            if ingredient_to_remove:
                conn.execute("DELETE FROM fridge_pantry WHERE ingredient = ?;", (ingredient_to_remove.lower().strip(),))
                msg = f"Removed '{ingredient_to_remove}' from fridge inventory."
            else:
                conn.execute("DELETE FROM fridge_pantry;")
                msg = "Cleared entire fridge & pantry inventory."
            conn.commit()

        return {"success": True, "action": "clear", "message": msg}

    # 3. Retrieve active pantry items
    with sqlite3.connect(str(db_path), timeout=5.0) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT ingredient FROM fridge_pantry ORDER BY added_at DESC;").fetchall()
        active_items = {r["ingredient"].lower() for r in rows}

    # Merge explicitly passed ingredients if any
    if ingredients:
        for i in ingredients:
            active_items.add(i.lower().strip())

    # Fallback to default pantry staples if empty
    if not active_items:
        active_items = {"rice", "garlic", "soy sauce", "olive oil", "pasta", "onion", "egg"}

    # 4. Action: inventory
    if action == "inventory":
        return {
            "success": True,
            "action": "inventory",
            "count": len(active_items),
            "pantry_items": sorted(list(active_items)),
        }

    # 5. Action: generate_plan
    matched_recipes: List[Dict[str, Any]] = []

    for recipe in RECIPE_KNOWLEDGE_BASE:
        req = set(recipe["primary"])
        present = req.intersection(active_items)
        missing = req.difference(active_items)
        match_score = len(present) / len(req)

        # Filters
        if dietary_preference == "quick_under_20min" and recipe["cook_time_mins"] > 20:
            continue
        if dietary_preference == "vegetarian" and any(k in req for k in ("chicken", "beef", "bacon", "pork")):
            continue

        matched_recipes.append({
            "title": recipe["title"],
            "match_score": round(match_score, 2),
            "cook_time_mins": recipe["cook_time_mins"],
            "difficulty": recipe["difficulty"],
            "calories": recipe["calories"],
            "used_ingredients": sorted(list(present)),
            "missing_ingredients": sorted(list(missing)),
            "instructions": recipe["instructions"],
        })

    # Sort recipes by highest ingredient match percentage
    matched_recipes.sort(key=lambda r: r["match_score"], reverse=True)

    emit_telemetry_event(
        "dinner_plan_generated",
        {"pantry_count": len(active_items), "recipe_count": len(matched_recipes)},
    )

    elapsed_ms = round((time.perf_counter() - start_t) * 1000, 2)
    return {
        "success": True,
        "action": "generate_plan",
        "pantry_items_considered": sorted(list(active_items)),
        "dietary_preference": dietary_preference,
        "recommended_recipes": matched_recipes[:3],
        "message": f"Generated {len(matched_recipes[:3])} recipe suggestions minimizing waste.",
        "latency_ms": elapsed_ms,
    }
