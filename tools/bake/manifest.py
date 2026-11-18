#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Write shards/MANIFEST.json: every shard file with its size, SHA-256 and the three metrics.

    python -I -B tools/bake/manifest.py [SHARDS_DIR]

The three metrics, per file:
  nominal_entries   the number of values the file stands for (pixels x channels, vertices x attributes, ...)
  true_stored_bits  the bits it actually occupies on disk (bytes x 8; PNGs are compressed)
  rank_bound        an upper bound on the rank of the matrix the file holds (rows x columns as stored):
                    an image channel is at most min(width, height); a vertex table at most its attribute count;
                    a per-vertex delta table at most 16 dimensions x its components; a map level of S x S
                    samples at most S; a byte20 word plane (128 x 128 blocks) at most 128
and one more, for honesty about raw arrays:
  deflate_bytes     the file after zlib level 6, an upper bound on its information content. For a PNG, which
                    is deflate-coded already, it is the file's own size.
"""
import hashlib
import json
import struct
import zlib
import sys
from pathlib import Path


def sha(p):
    h = hashlib.sha256()
    with p.open("rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def png_size(p):
    with p.open("rb") as f:
        head = f.read(33)
    w, h = struct.unpack(">II", head[16:24]); bitdepth, ctype = head[24], head[25]
    ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    return w, h, ch


def leaves(x):
    if isinstance(x, dict): return sum(leaves(v) for v in x.values())
    if isinstance(x, list): return sum(leaves(v) for v in x)
    return 1


def zarr_array(p):
    """the zarr.json of the array a shard file belongs to (the directory above its c/)."""
    q = p.parent
    while q.name != "c":
        q = q.parent
    return json.loads((q.parent / "zarr.json").read_text())


def metrics(root, rel, p):
    n = p.stat().st_size
    if rel.startswith("zarr/") and p.name != "zarr.json":
        m = zarr_array(p); size = {"int32": 4, "uint8": 1}[m["data_type"]]
        inner = m["codecs"][0]["configuration"]["chunk_shape"]; shard = m["chunk_grid"]["configuration"]["chunk_shape"]
        chunks = 1
        for a, b in zip(shard, inner): chunks *= a // b
        return (n - chunks * 16 - 4) // size, n * 8, min(m["shape"][-2:])
    if p.suffix == ".png":
        w, h, ch = png_size(p); return w * h * ch, n * 8, min(w, h)
    if p.suffix == ".json":
        return leaves(json.loads(p.read_text())), n * 8, 1
    if rel.startswith("animals/"):
        name = p.name.split(".")[0]; lod = int(p.name.split(".")[1][3:]); J = json.loads((root / "animals" / f"{name}.json").read_text()); L = J["lods"][lod]
        nv, nt = L["vertices"], L["triangles"]
        kind = p.name.split(".")[2]
        total = {"mesh": nv * 13 + nt * 3, "dpos": nv * 16 * 3, "dnrm": nv * 16 * 4}[kind]
        f = L["files"][kind]; parts = f.get("parts", [f["file"]]); share = n / f["bytes"]
        return round(total * share), n * 8, {"mesh": 13, "dpos": 48, "dnrm": 48}[kind]
    return n, n * 8, 1


def main(argv):
    root = Path(argv[0] if argv else Path(__file__).resolve().parents[2] / "shards").resolve()
    files = []
    for p in sorted(root.rglob("*")):
        if not p.is_file() or p.name == "MANIFEST.json": continue
        rel = p.relative_to(root).as_posix(); ne, bits, rank = metrics(root, rel, p)
        deflate = p.stat().st_size if p.suffix == ".png" else len(zlib.compress(p.read_bytes(), 6))
        files.append({"path": rel, "bytes": p.stat().st_size, "sha256": sha(p), "nominal_entries": ne, "true_stored_bits": bits, "rank_bound": rank, "deflate_bytes": deflate})
    total = sum(f["bytes"] for f in files); deflated = sum(f["deflate_bytes"] for f in files)
    groups = {}
    for f in files:
        g = groups.setdefault(f["path"].split("/")[0], {"files": 0, "bytes": 0, "deflate_bytes": 0})
        g["files"] += 1; g["bytes"] += f["bytes"]; g["deflate_bytes"] += f["deflate_bytes"]
    (root / "MANIFEST.json").write_text(json.dumps({"law": "plume.shards/1", "bytes": total, "deflate_bytes": deflated, "groups": groups, "files": files,
        "metrics": "nominal_entries, true_stored_bits, rank_bound, deflate_bytes (see tools/bake/manifest.py)"}, indent=1) + "\n")
    print(f"{len(files)} files, {total:,} bytes ({deflated:,} after deflate)")
    for k, g in groups.items(): print(f"  {k}: {g['files']} files, {g['bytes']:,} bytes, {g['deflate_bytes']:,} after deflate")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
