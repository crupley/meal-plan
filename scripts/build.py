#!/usr/bin/env python3
"""Build the static site into _site/.

Runs CookCLI over every recipe in recipes/ and writes the data the planner
pages need: data/recipes.json, data/aisles.json and data/themes.json.
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RECIPES = ROOT / "recipes"
AISLE_CONF = ROOT / "config" / "aisle.conf"
THEMES = ROOT / "config" / "themes.json"
SITE = ROOT / "site"
OUT = ROOT / "_site"


def cook(*args):
    """Run CookCLI and return its parsed JSON output."""
    try:
        result = subprocess.run(
            ["cook", *args], cwd=ROOT, capture_output=True, text=True
        )
    except FileNotFoundError:
        sys.exit("CookCLI not found. Install it with: brew install cookcli")
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "cook failed")
    return json.loads(result.stdout)


def amount(quantity):
    """Flatten a CookCLI quantity into {qty, unit, text}.

    qty is a number when the amount can be summed; otherwise text holds it
    as written (ranges, "a pinch", ...).
    """
    if not quantity:
        return None
    unit = quantity.get("unit")
    value = quantity.get("value") or {}
    inner = value.get("value")
    if value.get("type") == "number" and isinstance(inner, dict):
        if isinstance(inner.get("value"), (int, float)):
            return {"qty": inner["value"], "unit": unit, "text": None}
        if "num" in inner and "den" in inner:
            qty = inner.get("whole", 0) + inner["num"] / inner["den"]
            return {"qty": qty, "unit": unit, "text": None}
    if value.get("type") == "range":
        ends = [amount({"value": value.get(k)}) for k in ("start", "end")]
        if all(e and e["qty"] is not None for e in ends):
            text = f"{ends[0]['qty']:g}-{ends[1]['qty']:g}"
            return {"qty": None, "unit": unit, "text": text}
    return {"qty": None, "unit": unit, "text": str(inner if inner is not None else value)}


def recipe_ids():
    """Recipe ids are paths under recipes/ without the .cook extension."""
    return sorted(
        p.relative_to(RECIPES).with_suffix("").as_posix()
        for p in RECIPES.rglob("*.cook")
    )


def load_recipe(recipe_id):
    data = cook("recipe", f"recipes/{recipe_id}.cook", "-f", "json")
    meta = (data.get("metadata") or {}).get("map") or {}
    tags = meta.get("tags") or []
    if isinstance(tags, str):
        tags = tags.split(",")
    return {
        "id": recipe_id,
        "title": str(meta.get("title") or Path(recipe_id).name),
        "servings": meta.get("servings"),
        "tags": sorted({str(t).strip().lower() for t in tags if str(t).strip()}),
        "ingredients": [
            {"name": i["name"], "amount": amount(i.get("quantity"))}
            for i in data.get("ingredients", [])
            # Optional ingredients are left off shopping lists, as CookCLI does.
            if "?" not in (i.get("modifiers") or "")
            and "OPT" not in (i.get("modifiers") or "")
        ],
    }


def load_aisles():
    """Parse aisle.conf into [{category, items: [[name, synonym, ...], ...]}]."""
    aisles = []
    if not AISLE_CONF.exists():
        return aisles
    for line in AISLE_CONF.read_text().splitlines():
        line = line.split("//")[0].strip()
        if not line:
            continue
        if line.startswith("[") and line.endswith("]"):
            aisles.append({"category": line[1:-1].strip(), "items": []})
        elif aisles:
            names = [n.strip() for n in line.split("|") if n.strip()]
            if names:
                aisles[-1]["items"].append(names)
    return aisles


def build():
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(SITE, OUT)
    data = OUT / "data"
    data.mkdir()

    recipes, failed = [], []
    for recipe_id in recipe_ids():
        try:
            recipes.append(load_recipe(recipe_id))
        except (RuntimeError, ValueError) as err:
            failed.append(f"{recipe_id}: {err}")
    recipes.sort(key=lambda r: r["title"].lower())

    themes = json.loads(THEMES.read_text()) if THEMES.exists() else {}
    (data / "recipes.json").write_text(json.dumps(recipes, indent=1))
    (data / "aisles.json").write_text(json.dumps(load_aisles(), indent=1))
    (data / "themes.json").write_text(json.dumps(themes, indent=1))

    print(f"Built {len(recipes)} recipes into {OUT.relative_to(ROOT)}/")
    if failed:
        print("Recipes that failed to parse:\n  " + "\n  ".join(failed), file=sys.stderr)
    return not failed


if __name__ == "__main__":
    sys.exit(0 if build() else 1)
