#!/usr/bin/env python3
"""Download the CC0 (public domain) PBR textures and sky the gallery uses, from
Poly Haven, and store them as compact WebP under assets/textures/.

    python3 scripts/fetch-textures.py

Each texture gets diff.webp (base colour), nor.webp (OpenGL normal) and
arm.webp (R = ambient occlusion, G = roughness, B = metalness). The files are
committed, so this only needs re-running to add or change a texture.
Poly Haven assets are CC0: https://polyhaven.com/license

It also derives the lighter files materials.js loads first or on weaker devices
(no network needed for this step alone):

    python3 scripts/fetch-textures.py --variants

  <id>/{diff,nor,arm}-512.webp   512 px maps for quality 'medium' / 'low'
  sky-1k.hdr, sky-overcast-1k.hdr 1024x512 skies: image-based light, sun
                                  direction and the first background (the 2k
                                  files stay for the sharp background)
"""
import io, json, math, sys, urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "textures"
RES = "1k"
TEXTURES = [
    "painted_plaster_wall", "concrete_floor_01", "concrete_wall_008", "rectangular_paving",
    "gravel_floor", "leafy_grass", "forest_leaves_02", "bark_platanus", "large_sandstone_blocks",
    "marble_01", "oak_veneer_01", "wood_floor_deck", "oak_wood_planks", "velour_velvet",
    "brown_leather", "dark_wood", "metal_plate", "aerial_grass_rock", "terrazzo_tiles",
    "fabric_pattern_07", "white_sandstone_blocks_02",
]
HDRI = ("kloofendal_48d_partly_cloudy_puresky", "2k")

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "the-workshop-asset-fetch/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()

def fetch_texture(tid):
    files = json.loads(get(f"https://api.polyhaven.com/files/{tid}"))
    target = OUT / tid
    target.mkdir(parents=True, exist_ok=True)
    # Some fabrics ship colourways (col_1, col_2…) instead of one Diffuse map.
    diffuse = "Diffuse" if "Diffuse" in files else sorted(k for k in files if k.startswith("col"))[0]
    for key, name in ((diffuse, "diff"), ("nor_gl", "nor"), ("arm", "arm")):
        url = files[key][RES]["jpg"]["url"]
        img = Image.open(io.BytesIO(get(url))).convert("RGB")
        img.save(target / f"{name}.webp", "WEBP", quality=84 if name == "diff" else 88, method=5)
    return tid

VARIANT = 512
SKIES = (("sky.hdr", "sky-1k.hdr"), ("sky-overcast.hdr", "sky-overcast-1k.hdr"))

def make_variants(tid):
    """512 px copies of a texture's maps (box-filtered; normals renormalised)."""
    import numpy as np
    target = OUT / tid
    for name in ("diff", "nor", "arm"):
        src = target / f"{name}.webp"
        if not src.exists():
            continue
        img = Image.open(src).convert("RGB")
        factor = max(1, img.width // VARIANT)
        small = img.reduce(factor) if factor > 1 else img
        if name == "nor":
            n = np.asarray(small, dtype=np.float32) / 127.5 - 1.0
            n /= np.maximum(np.linalg.norm(n, axis=2, keepdims=True), 1e-6)
            small = Image.fromarray(np.clip((n + 1.0) * 127.5 + 0.5, 0, 255).astype(np.uint8))
        small.save(target / f"{name}-{VARIANT}.webp", "WEBP", quality=84 if name == "diff" else 88, method=6)
    return tid

def read_hdr(path):
    """Radiance RGBE (new-style RLE or flat) -> float32 HxWx3, decoded like three's RGBELoader."""
    import numpy as np
    raw = path.read_bytes()
    end = raw.index(b"\n\n") + 2
    nl = raw.index(b"\n", end)
    dims = raw[end:nl].split()
    h, w = int(dims[1]), int(dims[3])
    pos = nl + 1
    out = np.zeros((h, w, 4), dtype=np.uint8)
    for y in range(h):
        if raw[pos] == 2 and raw[pos + 1] == 2 and ((raw[pos + 2] << 8) | raw[pos + 3]) == w:
            pos += 4
            for c in range(4):
                x = 0
                row = out[y, :, c]
                while x < w:
                    n = raw[pos]; pos += 1
                    if n > 128:
                        n -= 128
                        row[x:x + n] = raw[pos]; pos += 1
                    else:
                        row[x:x + n] = np.frombuffer(raw, np.uint8, n, pos); pos += n
                    x += n
        else:
            out[y] = np.frombuffer(raw, np.uint8, w * 4, pos).reshape(w, 4); pos += w * 4
    e = out[..., 3].astype(np.float32)
    scale = np.where(out[..., 3] > 0, np.exp2(e - 128.0) / 255.0, 0.0)
    return out[..., :3].astype(np.float32) * scale[..., None]

def write_hdr(path, rgb):
    """float32 HxWx3 -> Radiance RGBE with new-style RLE (mantissa / 255, as three decodes it)."""
    import numpy as np
    h, w, _ = rgb.shape
    v = rgb.max(axis=2)
    mant, ex = np.frexp(v)
    ok = v > 1e-32
    scale = np.where(ok, 255.0 / np.where(ok, np.exp2(ex.astype(np.float32)), 1.0), 0.0)
    rgbe = np.zeros((h, w, 4), dtype=np.uint8)
    rgbe[..., :3] = np.clip(np.floor(rgb * scale[..., None] + 0.5), 0, 255).astype(np.uint8)
    rgbe[..., 3] = np.where(ok, ex + 128, 0).astype(np.uint8)
    chunks = [b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n", f"-Y {h} +X {w}\n".encode()]
    for y in range(h):
        chunks.append(bytes((2, 2, w >> 8, w & 255)))
        for c in range(4):
            row = rgbe[y, :, c].tobytes()
            buf = bytearray(); x = 0; lit = bytearray()
            while x < w:
                r = 1
                while x + r < w and r < 127 and row[x + r] == row[x]:
                    r += 1
                if r >= 4:
                    while lit:
                        buf.append(min(len(lit), 128)); buf += lit[:128]; lit = lit[128:]
                    buf.append(128 + r); buf.append(row[x]); x += r
                else:
                    lit.append(row[x]); x += 1
            while lit:
                buf.append(min(len(lit), 128)); buf += lit[:128]; lit = lit[128:]
            chunks.append(bytes(buf))
    path.write_bytes(b"".join(chunks))

def make_sky_variants():
    for src, dst in SKIES:
        if not (OUT / src).exists():
            continue
        hdr = read_hdr(OUT / src)
        h, w, _ = hdr.shape
        # 2x2 box filter: keeps the sun's energy, so the brightest texel stays the sun.
        small = hdr[: h // 2 * 2, : w // 2 * 2].reshape(h // 2, 2, w // 2, 2, 3).mean(axis=(1, 3))
        write_hdr(OUT / dst, small)
        print("sky variant", dst, small.shape[1], "x", small.shape[0])

def variants():
    for tid in TEXTURES:
        make_variants(tid)
        print("variants", tid)
    make_sky_variants()

def main():
    if "--variants" in sys.argv:
        return variants()
    OUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(8) as pool:
        for tid in pool.map(fetch_texture, TEXTURES):
            print("texture", tid)
    hid, res = HDRI
    files = json.loads(get(f"https://api.polyhaven.com/files/{hid}"))
    (OUT / "sky.hdr").write_bytes(get(files["hdri"][res]["hdr"]["url"]))
    print("sky", hid, res)
    (OUT / "LICENSE.txt").write_text(
        "All textures and the sky in this folder are from Poly Haven (https://polyhaven.com)\n"
        "and are released under CC0 1.0 (public domain): https://polyhaven.com/license\n"
        f"Textures: {', '.join(TEXTURES)}\nSky: {hid} ({res})\n")
    variants()

if __name__ == "__main__":
    sys.exit(main())
