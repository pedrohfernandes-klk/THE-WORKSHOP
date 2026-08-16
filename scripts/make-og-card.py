#!/usr/bin/env python3
"""Render assets/og-card.jpg, the 1200x630 preview card used by og:image.

Social scrapers fetch this out of band and will not run WebGL, so the card is
a still that mirrors the entry poster: same cream ground, same serif wordmark,
same accent rule. Regenerate with:

    python scripts/make-og-card.py

Not wired into CI — the card only changes when the poster does. Requires
Pillow and the Georgia/Segoe UI faces the poster already falls back to; the
committed assets/og-card.jpg is the artefact that actually ships.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

# Lifted from the #poster / #posterCard rules in index.html.
GROUND = (244, 236, 217)
INK = (23, 18, 13)
ACCENT = (169, 76, 68)
RULE = [(169, 76, 68), (230, 161, 46), (109, 183, 201)]
SUBTITLE = (128, 124, 117)  # rgba(23,18,13,.55) flattened onto GROUND

W, H = 1200, 630
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "og-card.jpg"

FONT_DIR = Path("C:/Windows/Fonts")
SERIF = FONT_DIR / "georgiab.ttf"
SANS = FONT_DIR / "segoeuib.ttf"


def tracked_width(draw, text, font, tracking):
    """Width of `text` once per-character tracking is applied."""
    total = 0
    for ch in text:
        total += draw.textlength(ch, font=font) + tracking
    return total - tracking if text else 0


def draw_tracked(draw, xy, text, font, fill, tracking):
    """PIL has no letter-spacing, and the poster leans on it heavily."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + tracking


def gradient_rule(img, x, y, width, height, stops):
    """The #posterCard h1::after bar: red -> amber at 46% -> blue."""
    left, mid, right = stops
    bar = Image.new("RGB", (width, 1))
    px = bar.load()
    knee = int(width * 0.46)
    for i in range(width):
        if i < knee:
            t = i / max(knee, 1)
            a, b = left, mid
        else:
            t = (i - knee) / max(width - knee, 1)
            a, b = mid, right
        px[i, 0] = tuple(round(a[c] + (b[c] - a[c]) * t) for c in range(3))
    img.paste(bar.resize((width, height), Image.NEAREST), (x, y))


def main():
    img = Image.new("RGB", (W, H), GROUND)
    draw = ImageDraw.Draw(img)

    topline_font = ImageFont.truetype(str(SANS), 22)
    title_font = ImageFont.truetype(str(SERIF), 96)
    sub_font = ImageFont.truetype(str(SANS), 21)

    # HrM — matches #posterIntroTopline (.5em tracking, accent red).
    topline, topline_track = "HrM", 11
    w = tracked_width(draw, topline, topline_font, topline_track)
    draw_tracked(draw, ((W - w) / 2, 176), topline, topline_font, ACCENT, topline_track)

    # THE WORKSHOP — matches #posterCard h1 (.16em tracking, serif, uppercase).
    title, title_track = "THE WORKSHOP", 15
    w = tracked_width(draw, title, title_font, title_track)
    draw_tracked(draw, ((W - w) / 2, 236), title, title_font, INK, title_track)

    gradient_rule(img, (W - 220) // 2, 380, 220, 4, RULE)

    # Subtitle — matches #posterSubtitle (.34em tracking, uppercase, muted).
    sub, sub_track = "A MUSEUM GATHERED AROUND THE TOWER", 7
    w = tracked_width(draw, sub, sub_font, sub_track)
    draw_tracked(draw, ((W - w) / 2, 418), sub, sub_font, SUBTITLE, sub_track)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "JPEG", quality=88, optimize=True, progressive=True)
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes) {W}x{H}")


if __name__ == "__main__":
    main()
