# /// script
# requires-python = ">=3.10"
# dependencies = ["pypdf>=4"]
# ///
"""Build the unit inventory (data/units.js) from the architect's floor-plan PDF.

This script needs the project's architectural PDF, which is not part of this
repository. Without it you can still run the unit tests (tests/test_parse_units.py).

Every apartment on a floor-plan page carries a small explication table, with
Georgian labels in Latin transliteration:

    bina <NNN>              unit number
    sacxovrebeli  <a> m2    residential area
    sazafxulo     <b> m2    summer / balcony area
    jami          <c> m2    total
    sc-2                    occupancy class
    dak.faqtori   <f>       occupancy factor

Labels sit in one column, values about 26 pt to the right, one row per line.
The parser anchors on `jami` and reads the rows around it. The table slots sit
at the same page coordinates on every floor, which also gives each unit a
stable slot number (its position on the floor plan).

When the config lists official per-floor areas (the technical-economic table of
the PDF), the parser prints a per-floor comparison. Where a residential value
fails to read cleanly it is recovered as total - balcony.

Prices, statuses, views and room types are NOT in the source PDF. They are
generated here as flagged placeholders and must be replaced with the
developer's price list before publishing.

Usage:
    uv run tools/parse_units.py --pdf path/to/plans.pdf \\
        --config tools/parse_units.config.json --out data/units.js
"""
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

ROW_DY = {"unit": -15.6, "living": -9.6, "balcony": -4.5, "total": 0.0}
NUM_RE = re.compile(r"(\d+(?:[.,]\d+)?)")


# --------------------------------------------------------------------------- config

def load_config(path: Path) -> dict:
    cfg = json.loads(path.read_text(encoding="utf-8"))

    def pairs(items):
        return {(float(x), float(y)): int(n) for x, y, n in items}

    cfg["slots"] = pairs(cfg["slots"])
    cfg["slotAliases"] = pairs(cfg.get("slotAliases", []))
    cfg["officialAreas"] = {int(k): tuple(v) for k, v in cfg.get("officialAreas", {}).items()}
    fp = cfg["floorPages"]
    cfg["floorPages"] = {f: fp["firstPage"] + (f - fp["firstFloor"])
                         for f in range(fp["firstFloor"], fp["lastFloor"] + 1)}
    return cfg


# --------------------------------------------------------------------------- parsing

def page_items(page):
    """All text fragments of a page as (x, y, text), rounded to 0.1 pt."""
    out = []

    def visitor(text, cm, tm, font_dict, font_size):
        t = text.strip()
        if t:
            out.append((round(tm[4], 1), round(tm[5], 1), t))

    page.extract_text(visitor_text=visitor)
    return out


def read_row(items, x0, y, ytol=1.6):
    frags = [i for i in items if x0 + 6 <= i[0] <= x0 + 60 and abs(i[1] - y) <= ytol]
    frags.sort(key=lambda i: i[0])
    return "".join(f[2] for f in frags)


def number(text):
    """First number before the unit sign: '29,9 m2' -> 29.9, '' -> None."""
    head = re.split(r"m", text.replace(" ", ""))[0]
    m = NUM_RE.search(head)
    return float(m.group(1).replace(",", ".")) if m else None


def slot_for(x, y, slots, aliases=None, tol=6):
    for (sx, sy), n in list(slots.items()) + list((aliases or {}).items()):
        if abs(sx - x) < tol and abs(sy - y) < tol:
            return n
    return None


def parse_items(items, floor, slots, aliases=None):
    units = []
    for ax, ay, _ in [i for i in items if i[2] == "jami"]:
        label = read_row(items, ax, ay + ROW_DY["unit"])
        m = re.search(r"(\d{3,4})", label)
        if not m:
            continue
        slot = slot_for(ax, ay, slots, aliases)
        is_office = bool(re.search(r"saofise|საოფისე", label))
        # A misread leading digit is recoverable: the slot number is the last
        # one or two digits, the floor is the prefix.
        num = m.group(1)
        unit_no = num if num.startswith(str(floor)) else f"{floor}{int(num) % 100:02d}"
        units.append({
            "id": f"{floor}-{slot}" if slot else f"{floor}-x{num}",
            "number": unit_no,
            "floor": floor,
            "slot": slot,
            "kind": "office" if is_office else "apartment",
            "living": number(read_row(items, ax, ay + ROW_DY["living"])),
            "balcony": number(read_row(items, ax, ay + ROW_DY["balcony"])),
            "total": number(read_row(items, ax, ay + ROW_DY["total"])),
        })
    return units


def repair(units):
    """total = living + balcony. Trust total and balcony; recompute living."""
    fixed = 0
    for u in units:
        liv, bal, tot = u["living"], u["balcony"], u["total"]
        if tot and bal is not None and (liv is None or abs(tot - (liv + bal)) > 0.15):
            u["living"] = round(tot - bal, 1)
            u["areaRepaired"] = True
            fixed += 1
    return fixed


# --------------------------------------------------------------------------- placeholders

def typology(total):
    """Room type by total area. PLACEHOLDER: the live data re-derives it from the plans."""
    if total < 42:
        return "studio"
    if total < 62:
        return "1br"
    if total < 88:
        return "2br"
    return "3br"


def add_placeholders(units, base_rate=1050, floor_step=17):
    for u in units:
        slot = u["slot"] or 0
        u["type"] = typology(u["total"]) if u["kind"] == "apartment" else "office"
        rate = base_rate + (u["floor"] - 2) * floor_step
        u["price"] = int(round(((u["living"] or 0) + (u["balcony"] or 0) * 0.5) * rate, -2))
        u["pricePerSqm"] = rate
        h = (u["floor"] * 31 + slot * 17) % 100
        u["status"] = "sold" if h < 27 else "reserved" if h < 42 else "available"
        u["view"] = ("sea" if u["floor"] >= 13 and slot in (1, 2, 3, 11, 12)
                     else "park" if slot in (6, 7) else "city")


# --------------------------------------------------------------------------- report

def report(units, official):
    per_floor = defaultdict(lambda: [0.0, 0.0])
    for u in units:
        if u["kind"] == "apartment":
            per_floor[u["floor"]][0] += u["living"] or 0
            per_floor[u["floor"]][1] += u["balcony"] or 0
    print(" fl   apt   living  official     d      balc  official     d")
    worst = 0.0
    for f in sorted(per_floor):
        liv, bal = per_floor[f]
        n = sum(1 for u in units if u["floor"] == f and u["kind"] == "apartment")
        if f in official:
            ol, ob = official[f]
            worst = max(worst, abs(liv - ol), abs(bal - ob))
            print(f" {f:>2}  {n:>4} {liv:>8.1f} {ol:>9.1f} {liv - ol:>+7.2f}  {bal:>8.1f} {ob:>9.1f} {bal - ob:>+7.2f}")
        else:
            print(f" {f:>2}  {n:>4} {liv:>8.1f} {'-':>9} {'':>7}  {bal:>8.1f} {'-':>9}")
    if official:
        print(f" worst per-floor deviation: {worst:.2f} m2")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--pdf", required=True, type=Path, help="architectural PDF with floor plans")
    ap.add_argument("--config", type=Path, default=Path(__file__).with_name("parse_units.config.json"))
    ap.add_argument("--out", type=Path, default=Path("data/units.js"),
                    help="output .js (window.DATA = ...) or .json")
    args = ap.parse_args(argv)

    from pypdf import PdfReader  # imported here so the tests run without the PDF stack

    cfg = load_config(args.config)
    reader = PdfReader(str(args.pdf))
    units = []
    for floor, idx in cfg["floorPages"].items():
        units += parse_items(page_items(reader.pages[idx]), floor, cfg["slots"], cfg["slotAliases"])

    fixed = repair(units)
    units.sort(key=lambda u: (u["floor"], u["slot"] or 99))
    print(f"{len(units)} units parsed, {fixed} residential areas recomputed\n")
    report(units, cfg["officialAreas"])
    add_placeholders(units)

    payload = {
        "project": cfg["project"],
        "meta": {
            "areasSource": "architectural PDF, floor-plan pages",
            "placeholders": ["price", "pricePerSqm", "status", "view", "type"],
            "note": "Prices, statuses, views and room typology are generated placeholders. "
                    "Replace with the developer's price list before publishing.",
        },
        "units": units,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    args.out.write_text(f"window.DATA = {body};\n" if args.out.suffix == ".js" else body, encoding="utf-8")
    print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
