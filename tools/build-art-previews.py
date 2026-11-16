#!/usr/bin/env python3
"""Resample catalogue originals only; never crop, upscale, recolour or edit sources.
Reproducible bytes require the recorded Pillow/libwebp versions. --check writes nothing.
"""
import argparse
import hashlib
import io
import json
import sys
from pathlib import Path
from PIL import Image, ImageOps, features, __version__ as PILLOW_VERSION

MAX_EDGE = 512
MAX_BYTES = 36000
OUT = Path("assets/gallery/previews")

def sha(data):
    return hashlib.sha256(data).hexdigest()

def catalogue(root):
    text = (root / "assets/gallery/catalogue.js").read_text(encoding="utf-8-sig")
    marker = "export const WORKS = "
    if marker not in text:
        raise ValueError("WORKS export not found")
    return json.loads(text.split(marker, 1)[1].strip().removesuffix(";"))

def source_file(root, src):
    if not isinstance(src, str) or not src.startswith(("assets/extracted/", "assets/new/")):
        raise ValueError(f"Not a catalogue artwork source: {src}")
    path = (root / src).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError(f"Missing/outside source: {src}")
    return path

def encode(raw):
    with Image.open(io.BytesIO(raw)) as opened:
        original_size = opened.size
        profile = opened.info.get("icc_profile")
        # Honour existing camera orientation, preserving the displayed composition.
        image = ImageOps.exif_transpose(opened)
        image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
        for edge in (512, 448, 384, 320, 256):
            small = image.copy()
            small.thumbnail((edge, edge), Image.Resampling.LANCZOS, reducing_gap=3.0)
            for quality in (78, 74, 70, 66, 62, 58):
                output = io.BytesIO()
                small.save(output, format="WEBP", quality=quality, method=6, exact=True, **({"icc_profile": profile} if profile else {}))
                data = output.getvalue()
                if len(data) <= MAX_BYTES:
                    return data, small.size, original_size, quality
        raise ValueError("Could not meet preview byte budget")

def build(root, check=False):
    root = root.resolve()
    works = catalogue(root)
    ids, sources, entries, by_id = set(), {}, {}, {}
    for work in works:
        work_id, src = work["id"], work["src"]
        if work_id in ids:
            raise ValueError(f"Duplicate work id: {work_id}")
        ids.add(work_id)
        if src not in sources:
            path = source_file(root, src)
            raw = path.read_bytes()
            data, size, original, quality = encode(raw)
            # Source path hash avoids collisions between assets/new and assets/extracted.
            name = path.stem + "-" + sha(src.encode("utf-8"))[:8] + ".webp"
            preview = (OUT / name).as_posix()
            sources[src] = (preview, data)
            entries[src] = {"preview": preview, "width": size[0], "height": size[1],
                "bytes": len(data), "quality": quality, "sha256": sha(data),
                "sourceBytes": len(raw), "sourceWidth": original[0], "sourceHeight": original[1],
                "sourceSha256": sha(raw), "sourceExtension": path.suffix.lower()}
        by_id[work_id] = sources[src][0]
    largest = sorted((len(data) for _, data in sources.values()), reverse=True)[:15]
    manifest = {"version": 1, "maxEdge": MAX_EDGE, "maxPreviewBytes": MAX_BYTES,
        "encoder": {"pillow": PILLOW_VERSION, "libwebp": features.version("webp"), "method": 6},
        "workCount": len(works), "sourceCount": len(sources),
        "sourceBytes": sum(e["sourceBytes"] for e in entries.values()),
        "previewBytes": sum(e["bytes"] for e in entries.values()),
        "largest15Bytes": sum(largest), "byId": by_id, "bySrc": entries}
    manifest_data = (json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
    if sum(largest) + len(manifest_data) > 600000:
        raise ValueError("15 largest previews plus manifest exceed 600000 bytes")
    outputs = [(root / preview, data) for preview, data in sources.values()]
    outputs.append((root / OUT / "manifest.json", manifest_data))
    # All sources and budgets are validated before writing any output.
    for path, data in outputs:
        if check:
            if not path.is_file() or path.read_bytes() != data:
                raise ValueError(f"Missing/stale preview: {path.relative_to(root)}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    print(json.dumps({"checked": check, "works": len(works), "sourceBytes": manifest["sourceBytes"],
        "previewBytes": manifest["previewBytes"], "manifestBytes": len(manifest_data),
        "largest15PlusManifest": sum(largest) + len(manifest_data),
        "largestFile": max(len(data) for _, data in sources.values())}))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        build(args.root, args.check)
    except (ValueError, OSError, KeyError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
