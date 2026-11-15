#!/usr/bin/env python3
"""Build assets/gallery/catalogue.js from scripts/catalogue-source.json.

Measures every work image (size, palette, tonal and edge statistics, hue
distribution) and writes the generated ES module the gallery imports as
WORKS. Deterministic: the k-means seed is fixed.

Run from anywhere:  python3 scripts/build-catalogue.py
"""

import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "scripts" / "catalogue-source.json"
OUTPUT = ROOT / "assets" / "gallery" / "catalogue.js"

ID_RE = re.compile(r"^[a-z0-9]+$")
FAMILIES = {"matter", "signal", "archive"}
FRAMES = {"canvas", "frame", "mat"}
REQUIRED_META = ["id", "src", "title", "no", "family", "frame", "medium", "note"]
OPTIONAL_META = ["series", "artist"]

PALETTE_SIZE = 5
PALETTE_SEED = 7
KMEANS_ITERATIONS = 15
PALETTE_LONG_SIDE = 96
EDGE_WIDTH = 128
HUE_BINS = 12
LOW_CHROMA = 4.0
ACCENT_MIN_SHARE = 0.08
NEAR_DUP_DISTANCE = 20

# D65 reference white (sRGB / CIE 1931 2 degree).
XN, YN, ZN = 0.95047, 1.0, 1.08883
DELTA = 6.0 / 29.0


def fail(message):
    print(f"build-catalogue: error: {message}", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------- colour

def srgb_to_lab(rgb):
    """rgb: float array (..., 3) in 0..1 sRGB. Returns (..., 3) CIE L*a*b*."""
    rgb = np.asarray(rgb, dtype=np.float64)
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    m = np.array([
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ])
    xyz = lin @ m.T
    xr = xyz[..., 0] / XN
    yr = xyz[..., 1] / YN
    zr = xyz[..., 2] / ZN

    def f(t):
        return np.where(t > DELTA ** 3, np.cbrt(t), t / (3 * DELTA ** 2) + 4.0 / 29.0)

    fx, fy, fz = f(xr), f(yr), f(zr)
    L = 116.0 * fy - 16.0
    a = 500.0 * (fx - fy)
    b = 200.0 * (fy - fz)
    return np.stack([L, a, b], axis=-1)


def lab_to_hex(lab):
    """lab: (3,) array. Converts to sRGB, clamps to gamut, returns '#rrggbb'."""
    L, a, b = (float(v) for v in lab)
    fy = (L + 16.0) / 116.0
    fx = fy + a / 500.0
    fz = fy - b / 200.0

    def finv(t):
        return t ** 3 if t > DELTA else 3 * DELTA ** 2 * (t - 4.0 / 29.0)

    xyz = np.array([XN * finv(fx), YN * finv(fy), ZN * finv(fz)])
    m_inv = np.array([
        [3.2404542, -1.5371385, -0.4985314],
        [-0.9692660, 1.8760108, 0.0415560],
        [0.0556434, -0.2040259, 1.0572252],
    ])
    lin = np.clip(m_inv @ xyz, 0.0, 1.0)
    srgb = np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * lin ** (1 / 2.4) - 0.055)
    srgb = np.clip(np.round(srgb * 255.0), 0, 255).astype(int)
    return "#{:02x}{:02x}{:02x}".format(*srgb)


# ---------------------------------------------------------------- image

def load_rgb(path):
    with Image.open(path) as im:
        im.load()
        return im.convert("RGB")


def resize_to_longer_side(img, side):
    """Downsample so the longer side is `side` px; never upscale."""
    w, h = img.size
    scale = side / max(w, h)
    if scale >= 1.0:
        return img.copy()
    nw = max(1, round(w * scale))
    nh = max(1, round(h * scale))
    return img.resize((nw, nh), Image.Resampling.LANCZOS)


def kmeans_palette(lab_pixels):
    """Deterministic k-means++ then 15 Lloyd iterations. Returns (centroids, counts)."""
    rng = np.random.default_rng(PALETTE_SEED)
    n = lab_pixels.shape[0]
    k = min(PALETTE_SIZE, n)

    centroids = np.empty((k, 3))
    centroids[0] = lab_pixels[rng.integers(n)]
    d2 = np.sum((lab_pixels - centroids[0]) ** 2, axis=1)
    for i in range(1, k):
        total = d2.sum()
        if total <= 0:
            idx = rng.integers(n)
        else:
            idx = rng.choice(n, p=d2 / total)
        centroids[i] = lab_pixels[idx]
        d2 = np.minimum(d2, np.sum((lab_pixels - centroids[i]) ** 2, axis=1))

    def assign(cents):
        dist = np.sum((lab_pixels[:, None, :] - cents[None, :, :]) ** 2, axis=2)
        return np.argmin(dist, axis=1)

    for _ in range(KMEANS_ITERATIONS):
        labels = assign(centroids)
        for i in range(k):
            members = lab_pixels[labels == i]
            if len(members):
                centroids[i] = members.mean(axis=0)  # empty cluster keeps its centre

    labels = assign(centroids)
    counts = np.bincount(labels, minlength=k).astype(np.float64)
    return centroids, counts


def hash_bits(gray_img):
    """16x16 grayscale average hash as a boolean array of 256 bits."""
    small = np.asarray(gray_img.resize((16, 16), Image.Resampling.BOX), dtype=np.float64)
    return small > small.mean()


def measure(path):
    full = load_rgb(path)
    w, h = full.size

    small = resize_to_longer_side(full, PALETTE_LONG_SIDE)
    rgb = np.asarray(small, dtype=np.float64) / 255.0
    lab = srgb_to_lab(rgb).reshape(-1, 3)

    centroids, counts = kmeans_palette(lab)
    shares = counts / counts.sum()
    order = np.argsort(-shares, kind="stable")
    centroids = centroids[order]
    shares = shares[order]

    shares_r = np.round(shares, 3)
    shares_r = shares_r / shares_r.sum()
    shares_r = np.round(shares_r, 3)
    palette = [{"hex": lab_to_hex(c), "share": float(s)} for c, s in zip(centroids, shares_r)]

    chroma_c = np.hypot(centroids[:, 1], centroids[:, 2])
    eligible = [i for i in range(len(palette)) if shares[i] >= ACCENT_MIN_SHARE]
    if not eligible:
        eligible = [0]
    best = max(eligible, key=lambda i: (chroma_c[i], -i))
    accent = palette[best]["hex"]

    L = lab[:, 0]
    a = lab[:, 1]
    b = lab[:, 2]
    chroma = np.hypot(a, b)
    mean_C = float(chroma.mean())

    # Edge energy on a 128 px wide copy.
    eh = max(1, round(full.size[1] * EDGE_WIDTH / full.size[0]))
    edge_img = full.resize((EDGE_WIDTH, eh), Image.Resampling.LANCZOS)
    edge_L = srgb_to_lab(np.asarray(edge_img, dtype=np.float64) / 255.0)[..., 0]
    gy, gx = np.gradient(edge_L)
    edge = float(np.hypot(gx, gy).mean() / 100.0)

    # Chroma-weighted hue histogram.
    if mean_C < LOW_CHROMA:
        hue = [0.0] * HUE_BINS
    else:
        hue_deg = np.degrees(np.arctan2(b, a)) % 360.0
        bins = np.clip(np.floor(hue_deg / 30.0).astype(int), 0, HUE_BINS - 1)
        hist = np.bincount(bins, weights=chroma, minlength=HUE_BINS)
        total = hist.sum()
        if total > 0:
            hist = hist / total
        hue = [float(round(v, 3)) for v in hist]

    f = {
        "L": round(float(L.mean()), 2),
        "Lsd": round(float(L.std()), 2),
        "C": round(mean_C, 2),
        "a": round(float(a.mean()), 2),
        "b": round(float(b.mean()), 2),
        "edge": round(edge, 4),
        "hue": hue,
    }

    return {
        "w": int(w),
        "h": int(h),
        "aspect": round(w / h, 4),
        "palette": palette,
        "accent": accent,
        "f": f,
    }, hash_bits(full.convert("L"))


# ---------------------------------------------------------------- main

def main():
    try:
        source = json.loads(SOURCE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot read {SOURCE}: {exc}")

    entries = source.get("works")
    if not isinstance(entries, list) or not entries:
        fail("source has no 'works' array")

    seen = set()
    for index, entry in enumerate(entries):
        where = f"works[{index}]"
        for key in REQUIRED_META:
            if key not in entry:
                fail(f"{where}: missing field '{key}'")
        wid = entry["id"]
        if not isinstance(wid, str) or not ID_RE.match(wid):
            fail(f"{where}: id {wid!r} does not match ^[a-z0-9]+$")
        if wid in seen:
            fail(f"duplicate id {wid!r}")
        seen.add(wid)
        if entry["family"] not in FAMILIES:
            fail(f"{wid}: invalid family {entry['family']!r}")
        if entry["frame"] not in FRAMES:
            fail(f"{wid}: invalid frame {entry['frame']!r}")
        image_path = (ROOT / entry["src"]).resolve()
        if not image_path.is_file():
            fail(f"{wid}: missing image {entry['src']}")

    works = []
    hashes = []
    for entry in entries:
        wid = entry["id"]
        image_path = ROOT / entry["src"]
        try:
            measured, bits = measure(image_path)
        except Exception as exc:  # unreadable or corrupt image
            fail(f"{wid}: cannot read image {entry['src']}: {exc}")

        work = {key: entry[key] for key in ["id", "src", "title", "no", "family", "frame"]}
        for key in OPTIONAL_META:
            work[key] = entry.get(key) or None
        work["medium"] = entry["medium"]
        work["note"] = entry["note"]
        work.update(measured)
        works.append(work)
        hashes.append(bits)

    # Near-duplicate report (warning only).
    near = []
    for i in range(len(works)):
        for j in range(i + 1, len(works)):
            dist = int(np.count_nonzero(hashes[i] != hashes[j]))
            if dist <= NEAR_DUP_DISTANCE:
                near.append((works[i]["id"], works[j]["id"], dist))
    if near:
        for a_id, b_id, dist in near:
            print(f"WARNING near-duplicate: {a_id} and {b_id} (hamming {dist}/256)")
    else:
        print("No near-duplicate pairs (hamming <= 20 of 256).")

    keys = ["id", "src", "title", "no", "family", "frame", "series", "artist",
            "medium", "note", "w", "h", "aspect", "palette", "accent", "f"]
    body = json.dumps([{k: w[k] for k in keys} for w in works],
                      indent=2, ensure_ascii=False)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        "// Generated by scripts/build-catalogue.py from scripts/catalogue-source.json — do not edit by hand.\n"
        f"export const WORKS = {body};\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(works)} works to {OUTPUT.relative_to(ROOT)}")

    print()
    print(f"{'id':<8} {'family':<8} {'accent':<8} {'L':>7} {'C':>7}")
    for w in works:
        print(f"{w['id']:<8} {w['family']:<8} {w['accent']:<8} "
              f"{w['f']['L']:>7.2f} {w['f']['C']:>7.2f}")


if __name__ == "__main__":
    main()
