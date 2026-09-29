"""End-to-end run of tools/parse_units.py on a synthetic PDF drawn with reportlab."""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import parse_units as pu  # noqa: E402

canvas = pytest.importorskip("reportlab.pdfgen.canvas")


def draw_table(c, x, y, unit, living, balcony, total):
    rows = [("bina", unit, pu.ROW_DY["unit"]), ("sacxovrebeli", living, pu.ROW_DY["living"]),
            ("sazafxulo", balcony, pu.ROW_DY["balcony"]), ("jami", total, 0.0)]
    for label, value, dy in rows:
        c.drawString(x, y + dy, label)
        c.drawString(x + 26, y + dy, value)


def test_end_to_end(tmp_path):
    pdf = tmp_path / "plans.pdf"
    c = canvas.Canvas(str(pdf), pagesize=(1000, 700))
    c.setFont("Helvetica", 3)
    for floor in (2, 3):
        draw_table(c, 608.9, 599.4, f"bina {floor}01", "29,9 m2", "5,2 m2", "35,1 m2")
        draw_table(c, 822.1, 481.5, f"bina {floor}12", "70,0 m2", "12,0 m2", "88,0 m2")  # living misread
        c.showPage()
    c.save()

    cfg = json.loads((ROOT / "tools" / "parse_units.config.json").read_text(encoding="utf-8"))
    cfg["floorPages"] = {"firstFloor": 2, "lastFloor": 3, "firstPage": 0}
    cfg["officialAreas"] = {}
    cfg_path = tmp_path / "config.json"
    cfg_path.write_text(json.dumps(cfg), encoding="utf-8")

    out = tmp_path / "units.js"
    pu.main(["--pdf", str(pdf), "--config", str(cfg_path), "--out", str(out)])
    s = out.read_text(encoding="utf-8")
    assert s.startswith("window.DATA = ")
    data = json.loads(s[s.index("{"):s.rindex("}") + 1])
    units = data["units"]
    assert [u["id"] for u in units] == ["2-1", "2-12", "3-1", "3-12"]
    assert units[1]["living"] == 76.0 and units[1]["areaRepaired"] is True
    assert units[0]["type"] == "studio" and units[1]["type"] == "3br"
