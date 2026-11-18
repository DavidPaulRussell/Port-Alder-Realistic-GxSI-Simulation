#!/usr/bin/env python3
"""The GitHub size contract of this repository, checked before every release and commit.

    python -B tools/check_github_limits.py [REPO] [--json REPORT.json]

Refuses (exit 1) when
  - any file in the tree is 25,000,000 bytes or larger (GitHub's hard limit is 100 MB, but this project keeps
    to 25 MB; the target is 22,500,000 bytes, which only warns),
  - the payload (the tree outside .git) is larger than 1,000,000,000 bytes (the target, 985,000,000, warns),
  - .git/objects, if present, is larger than 1,000,000,000 bytes. This is what GitHub stores and measures.
    The tree is a second, checked-out copy of the same content, so the two are checked separately, not added
    together. History grows with every committed rebake of a binary shard; run `git count-objects -vH` after
    `git gc` for the exact packed size,
  - shards/MANIFEST.json lists a file that is missing, or whose size or SHA-256 differs; or a file under
    shards/ is not listed; or a manifest entry lacks one of its three metrics (nominal entries, true stored
    bits, rank bound).
SPDX-License-Identifier: GPL-3.0-only
"""
from __future__ import annotations

import hashlib, json, os, sys
from pathlib import Path

FILE_LIMIT, FILE_TARGET = 25_000_000, 22_500_000
REPO_LIMIT, REPO_TARGET = 1_000_000_000, 985_000_000
SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv"}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def main(argv: list[str]) -> int:
    args = [a for a in argv if not a.startswith("--")]
    root = Path(args[0] if args else Path(__file__).resolve().parent.parent).resolve()
    report_path = argv[argv.index("--json") + 1] if "--json" in argv else None
    errors, warnings, files, tree_bytes = [], [], [], 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for name in sorted(filenames):
            p = Path(dirpath) / name
            if p.is_symlink():
                continue
            size = p.stat().st_size
            rel = p.relative_to(root).as_posix()
            files.append((rel, size)); tree_bytes += size
            if size >= FILE_LIMIT:
                errors.append(f"{rel}: {size:,} bytes, at or over the 25,000,000-byte file limit")
            elif size > FILE_TARGET:
                warnings.append(f"{rel}: {size:,} bytes, over the 22,500,000-byte target")
    git_bytes = 0
    objects = root / ".git" / "objects"
    if objects.is_dir():
        for dirpath, _, filenames in os.walk(objects):
            for name in filenames:
                try: git_bytes += (Path(dirpath) / name).stat().st_size
                except OSError: pass
    repo_bytes = max(tree_bytes, git_bytes)
    if tree_bytes > REPO_LIMIT:
        errors.append(f"payload: {tree_bytes:,} bytes in the tree, over the 1,000,000,000-byte limit")
    elif tree_bytes > REPO_TARGET:
        warnings.append(f"payload: {tree_bytes:,} bytes in the tree, over the 985,000,000-byte target")
    if git_bytes > REPO_LIMIT:
        errors.append(f".git/objects: {git_bytes:,} bytes, over the 1,000,000,000-byte limit (GitHub's measure of the repository)")
    elif git_bytes > REPO_TARGET:
        warnings.append(f".git/objects: {git_bytes:,} bytes, over the 985,000,000-byte target")
    # the shard manifest
    shards = root / "shards"
    manifest_entries = 0
    if shards.is_dir():
        mpath = shards / "MANIFEST.json"
        if not mpath.is_file():
            errors.append("shards/MANIFEST.json is missing")
        else:
            manifest = json.loads(mpath.read_text(encoding="utf-8"))
            listed = set()
            for e in manifest.get("files", []):
                manifest_entries += 1
                rel = e.get("path", ""); listed.add(rel); p = shards / rel
                for key in ("nominal_entries", "true_stored_bits", "rank_bound"):
                    if key not in e:
                        errors.append(f"shards/{rel}: manifest entry lacks {key}")
                if not p.is_file():
                    errors.append(f"shards/{rel}: listed in the manifest but missing"); continue
                if p.stat().st_size != e.get("bytes"):
                    errors.append(f"shards/{rel}: {p.stat().st_size:,} bytes, the manifest says {e.get('bytes')}")
                elif sha256(p) != e.get("sha256"):
                    errors.append(f"shards/{rel}: SHA-256 differs from the manifest")
            for p in sorted(shards.rglob("*")):
                rel = p.relative_to(shards).as_posix()
                if p.is_file() and rel != "MANIFEST.json" and rel not in listed:
                    errors.append(f"shards/{rel}: not listed in shards/MANIFEST.json")
    largest = max(files, key=lambda f: f[1]) if files else ("-", 0)
    report = {"root": str(root), "files": len(files), "tree_bytes": tree_bytes, "git_bytes": git_bytes, "repository_bytes": repo_bytes,
              "largest_file": {"path": largest[0], "bytes": largest[1]}, "shard_manifest_entries": manifest_entries,
              "limits": {"file": FILE_LIMIT, "file_target": FILE_TARGET, "repository": REPO_LIMIT, "repository_target": REPO_TARGET},
              "errors": errors, "warnings": warnings, "ok": not errors}
    for w in warnings: print("WARN ", w)
    for e in errors: print("FAIL ", e)
    print(f"{'PASS' if not errors else 'FAIL'}  {len(files):,} files, {tree_bytes:,} bytes in the tree ({tree_bytes / REPO_LIMIT:.1%} of 1 GB), "
          f"{git_bytes:,} in .git/objects; largest {largest[0]} at {largest[1]:,} bytes; {manifest_entries} shard entries checked")
    if report_path:
        Path(report_path).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
