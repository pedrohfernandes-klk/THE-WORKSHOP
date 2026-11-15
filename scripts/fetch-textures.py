#!/usr/bin/env python3
"""Download the CC0 (public domain) PBR textures and sky the gallery uses, from
Poly Haven, and store them as compact WebP under assets/textures/.

    python3 scripts/fetch-textures.py

Each texture gets diff.webp (base colour), nor.webp (OpenGL normal) and
arm.webp (R = ambient occlusion, G = roughness, B = metalness). The files are
committed, so this only needs re-running to add or change a texture.
Poly Haven assets are CC0: https://polyhaven.com/license
"""
import io, json, sys, urllib.request
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

def main():
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

if __name__ == "__main__":
    sys.exit(main())
