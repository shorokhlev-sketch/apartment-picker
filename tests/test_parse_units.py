"""Unit tests for tools/parse_units.py. They run without the architect's PDF."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import parse_units as pu  # noqa: E402

CFG = pu.load_config(ROOT / "tools" / "parse_units.config.json")


def table(x, y, unit, living, balcony, total):
    """Text fragments of one explication table anchored on `jami` at (x, y)."""
    return [
        (x, y + pu.ROW_DY["unit"], "bina"), (x + 26, y + pu.ROW_DY["unit"], unit),
        (x, y + pu.ROW_DY["living"], "sacxovrebeli"), (x + 26, y + pu.ROW_DY["living"], living),
        (x, y + pu.ROW_DY["balcony"], "sazafxulo"), (x + 26, y + pu.ROW_DY["balcony"], balcony),
        (x, y, "jami"), (x + 26, y, total),
    ]


def test_number():
    assert pu.number("29,9 m2") == 29.9
    assert pu.number("35.1m2") == 35.1
    assert pu.number("") is None


def test_config_pages():
    assert CFG["floorPages"][2] == 0
    assert CFG["floorPages"][26] == 24
    assert len(CFG["slots"]) == 12


def test_slot_lookup_and_alias():
    assert pu.slot_for(608.9, 599.4, CFG["slots"]) == 1
    assert pu.slot_for(611.0, 598.0, CFG["slots"]) == 1
    assert pu.slot_for(383.8, 599.4, CFG["slots"], CFG["slotAliases"]) == 5
    assert pu.slot_for(10, 10, CFG["slots"], CFG["slotAliases"]) is None


def test_parse_items_reads_table_and_fixes_unit_number():
    items = table(608.9, 599.4, "bina 1001", "29,9 m2", "5,2 m2", "35,1 m2")
    items += table(545.5, 599.4, "bina 902", "29,1 m2", "5,2 m2", "34,3 m2")  # misread prefix
    units = pu.parse_items(items, 10, CFG["slots"], CFG["slotAliases"])
    assert [u["number"] for u in units] == ["1001", "1002"]
    assert units[0] == {"id": "10-1", "number": "1001", "floor": 10, "slot": 1, "kind": "apartment",
                        "living": 29.9, "balcony": 5.2, "total": 35.1}


def test_repair_recomputes_living():
    units = [{"living": 10.0, "balcony": 5.0, "total": 40.0}, {"living": 30.0, "balcony": 5.0, "total": 35.0}]
    assert pu.repair(units) == 1
    assert units[0]["living"] == 35.0 and units[0]["areaRepaired"] is True
    assert "areaRepaired" not in units[1]


def test_placeholders_are_deterministic():
    units = [{"floor": 10, "slot": 1, "kind": "apartment", "living": 29.9, "balcony": 5.2, "total": 35.1}]
    pu.add_placeholders(units)
    assert units[0]["type"] == "studio"
    assert units[0]["pricePerSqm"] == 1050 + 8 * 17
    assert units[0]["status"] in {"available", "reserved", "sold"}


def test_sample_data_matches_format():
    """The shipped sample (data/units.js) has the fields the parser produces."""
    s = (ROOT / "data" / "units.js").read_text(encoding="utf-8")
    data = json.loads(s[s.index("{"):s.rindex("}") + 1])
    assert {u["floor"] for u in data["units"]} == {10, 11, 22}
    for u in data["units"]:
        assert {"id", "number", "floor", "slot", "kind", "living", "balcony", "total",
                "type", "price", "status", "view"} <= u.keys()
        assert abs(u["total"] - (u["living"] + u["balcony"])) < 0.15
