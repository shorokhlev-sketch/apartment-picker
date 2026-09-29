# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow>=10", "numpy>=1.26"]
# ///
"""Render the neutral placeholder images used by the landing and the 3D view.

The public repo ships no photos or renders from the real project. This script
draws a schematic 26-storey tower instead:

  assets/img/facade.webp       1226 x 1502, front elevation. The unit hit areas
                               in js/plans.js (FQ) sit on its window grid:
                               floors 2-11, bays 1-8, x 310-920, y 840-1395.
  assets/img/tower-day.webp    1600 x 893, two-facade view, daylight
  assets/img/tower-dusk.webp   1600 x 893, two-facade view, dusk, lit windows
  assets/img/site.webp         1600 x 1000, site plan diagram

Run:  uv run tools/render_placeholders.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "img"

# Facade grid, shared with js/plans.js (FQ). One floor = 55.5 px, one bay = 76.25 px.
X0, X1, Y0, Y1, BAYS, VIS_FLOORS, TOP_VIS = 310, 920, 840, 1395, 8, 10, 11
FLOORS = 26
FH = (Y1 - Y0) / VIS_FLOORS
BW = (X1 - X0) / BAYS


def gradient(w, h, top, bottom):
    t = np.linspace(0, 1, h)[:, None, None]
    a, b = np.array(top, float), np.array(bottom, float)
    arr = a + (b - a) * t
    return Image.fromarray(np.repeat(arr, w, axis=1).astype("uint8"), "RGB")


def floor_top(f):
    """y of the top edge of floor f on the elevation."""
    return Y0 + (TOP_VIS - f) * FH


def elevation(dusk=False, bays=BAYS, width=None):
    """A facade texture: `bays` window bays, 26 floors, lobby at the bottom."""
    bw = BW
    w = int(round(width or bays * bw)) + 1
    h = int(round(floor_top(0) - floor_top(FLOORS))) + 1
    wall = (58, 64, 74) if dusk else (226, 223, 216)
    frame = (40, 44, 52) if dusk else (196, 190, 180)
    glass_day = [(120, 150, 172), (132, 160, 180), (112, 142, 166)]
    glass_dusk_off = (34, 44, 62)
    lit = [(255, 206, 140), (250, 190, 120), (255, 222, 170)]
    img = Image.new("RGB", (w, h), wall)
    d = ImageDraw.Draw(img)
    rng = np.random.default_rng(26)
    base = floor_top(FLOORS)
    for f in range(1, FLOORS + 1):
        y = floor_top(f) - base
        # slab line
        d.rectangle([0, y + FH - 5, w, y + FH], fill=frame)
        for b in range(bays):
            x = b * bw
            if f == 1:
                d.rectangle([x + 6, y + 10, x + bw - 6, y + FH - 6],
                            fill=(255, 214, 150) if dusk else (150, 170, 182))
                continue
            gx0, gy0, gx1, gy1 = x + 9, y + 8, x + bw - 9, y + FH - 9
            if dusk:
                c = lit[rng.integers(0, 3)] if rng.random() < 0.42 else glass_dusk_off
            else:
                c = glass_day[rng.integers(0, 3)]
            d.rectangle([gx0, gy0, gx1, gy1], fill=c)
            d.line([(x + bw / 2, gy0), (x + bw / 2, gy1)], fill=frame, width=2)
            # balcony rail
            d.rectangle([x + 4, y + FH - 16, x + bw - 4, y + FH - 13], fill=frame)
        # vertical fins
        for b in range(bays + 1):
            d.rectangle([b * bw - 2, y, b * bw + 2, y + FH], fill=frame)
    d.rectangle([0, 0, w, 10], fill=frame)
    return img


def facade():
    W, H = 1226, 1502
    img = gradient(W, H, (150, 186, 214), (232, 238, 240))
    d = ImageDraw.Draw(img)
    ground = int(floor_top(0))
    # far city band and sea line
    d.rectangle([0, ground - 120, W, ground - 118], fill=(170, 190, 200))
    rng = np.random.default_rng(3)
    x = 0
    while x < W:
        bw, bh = int(rng.integers(40, 110)), int(rng.integers(40, 180))
        d.rectangle([x, ground - bh, x + bw, ground], fill=(198, 204, 208))
        x += bw + int(rng.integers(4, 20))
    tex = elevation()
    img.paste(tex, (X0, int(floor_top(FLOORS))))
    d.rectangle([0, ground, W, H], fill=(176, 172, 164))
    d.rectangle([0, ground, W, ground + 6], fill=(150, 146, 140))
    return img


def quad_warp(tex, dst_quad, size):
    """Map `tex` onto the quad (tl, tr, br, bl) inside an RGBA canvas of `size`."""
    w, h = tex.size
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    A, B = [], []
    for (x, y), (u, v) in zip(dst_quad, src):
        A += [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]
        B += [u, v]
    coeffs = np.linalg.solve(np.array(A, float), np.array(B, float))
    rgba = tex.convert("RGBA")
    out = rgba.transform(size, Image.Transform.PERSPECTIVE, tuple(coeffs), Image.Resampling.BICUBIC,
                         fillcolor=(0, 0, 0, 0))
    return out


def tower_view(dusk):
    W, H = 2200, 1228
    if dusk:
        img = gradient(W, H, (28, 36, 64), (214, 140, 110))
    else:
        img = gradient(W, H, (126, 170, 208), (226, 234, 238))
    d = ImageDraw.Draw(img)
    horizon = 1010
    rng = np.random.default_rng(7 if dusk else 5)
    x = 0
    city = (52, 50, 64) if dusk else (196, 202, 206)
    while x < W:
        bw, bh = int(rng.integers(60, 180)), int(rng.integers(60, 260))
        d.rectangle([x, horizon - bh, x + bw, horizon], fill=city)
        x += bw + int(rng.integers(6, 30))
    d.rectangle([0, horizon, W, H], fill=(40, 38, 44) if dusk else (170, 166, 158))
    front = elevation(dusk=dusk, bays=8)
    side = elevation(dusk=dusk, bays=4)
    shade = Image.new("RGB", side.size, (0, 0, 0))
    side = Image.blend(side, shade, 0.28 if not dusk else 0.15)
    # corner at x=1180; front recedes left, side recedes right
    cx, top, bot = 1180, 70, 1040
    fq = [(780, top + 50), (cx, top), (cx, bot), (780, bot - 12)]
    sq = [(cx, top), (1370, top + 36), (1370, bot - 8), (cx, bot)]
    for tex, q in ((front, fq), (side, sq)):
        layer = quad_warp(tex, q, (W, H))
        img.paste(layer, (0, 0), layer)
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).rectangle([720, bot - 6, 1430, bot + 30], fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(24))
    img = Image.composite(Image.new("RGB", (W, H), (20, 20, 24)), img, glow)
    return img


def site():
    W, H = 1600, 1000
    img = Image.new("RGB", (W, H), (236, 234, 228))
    d = ImageDraw.Draw(img)
    # streets
    d.rectangle([0, 700, W, 800], fill=(214, 210, 202))
    d.rectangle([1180, 0, 1280, H], fill=(214, 210, 202))
    for x in range(0, W, 60):
        d.rectangle([x, 748, x + 30, 752], fill=(250, 250, 246))
    # neighbouring blocks
    for bx, by, bw, bh in [(80, 80, 300, 220), (420, 60, 260, 180), (80, 360, 220, 260),
                           (1320, 90, 220, 260), (1320, 420, 220, 220), (80, 850, 400, 120),
                           (560, 850, 520, 120), (1320, 850, 240, 120)]:
        d.rectangle([bx, by, bx + bw, by + bh], fill=(222, 218, 210), outline=(200, 196, 188), width=2)
    # plot and footprint
    d.rectangle([700, 300, 1120, 660], outline=(24, 46, 70), width=4)
    d.rectangle([780, 380, 1060, 600], fill=(24, 46, 70))
    # trees in the yard
    for tx, ty in [(730, 330), (730, 630), (1090, 330), (1090, 630), (920, 630)]:
        d.ellipse([tx - 18, ty - 18, tx + 18, ty + 18], fill=(150, 170, 140))
    return img


def save(img, name, quality=84):
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / name
    if img.size[0] > 1600:  # repo rule: no image wider than 1600 px
        img = img.resize((1600, round(img.size[1] * 1600 / img.size[0])), Image.Resampling.LANCZOS)
    img.save(p, "WEBP", quality=quality, method=6)
    print(f"{p.relative_to(ROOT)}  {img.size[0]}x{img.size[1]}  {p.stat().st_size // 1024} KB")


if __name__ == "__main__":
    save(facade(), "facade.webp")
    save(tower_view(dusk=False), "tower-day.webp")
    save(tower_view(dusk=True), "tower-dusk.webp")
    save(site(), "site.webp")
