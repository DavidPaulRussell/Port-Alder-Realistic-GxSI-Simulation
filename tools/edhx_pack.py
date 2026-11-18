#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Write Port Alder's layer files (.edhx) with the EDHX runtime itself.

Every EDHX container carries the runtime that reads and writes it. This driver takes that runtime from a container
(or from a copy of the EDHX package), and uses its own API to create a container, put records into it in one commit,
entangle two containers, and verify one. Nothing here re-implements the format: the bytes are EDHX's own.

    python edhx_pack.py build   --runtime SRC --out FILE.edhx --name NAME --manifest M.json
    python edhx_pack.py update  FILE.edhx --manifest M.json
    python edhx_pack.py compact FILE.edhx [--retain N] [--passes 2]
    python edhx_pack.py entangle A.edhx B.edhx
    python edhx_pack.py verify  FILE.edhx
    python edhx_pack.py info    FILE.edhx

SRC is a .edhx file (its embedded runtime is used, after its SHA-512 is checked) or a folder holding the `edhx` package.
A manifest is {"summary": text, "records": [{"key", "path", "type", "tags", "tier"}], "delete": [key]}; paths are
relative to the manifest. Opening a .edhx runs the Python inside it: use this only with containers you trust.

GitHub's limit of 25 MB a file is checked after every write (the default ceiling is 24 MB; --ceiling N to change it).
"""
import hashlib
import io
import json
import os
import sys
import zipfile

CEILING = 24 * 1024 * 1024


def runtime_zip(src):
    """The runtime ZIP's bytes: from a container's RUNTIME frame, or built from a folder holding the package."""
    if os.path.isdir(src):
        sys.path.insert(0, src)
        from edhx.container import build_runtime_zip
        return build_runtime_zip(os.path.join(src, "edhx"))
    data = open(src, "rb").read()
    i = data.find(b"\n\x1a\nEDHXRT01")
    if i < 0:
        raise SystemExit(f"not an EDHX container: {src}")
    i += 3
    n = int.from_bytes(data[i + 8:i + 16], "big")
    digest, body = data[i + 16:i + 80], data[i + 80:i + 80 + n]
    if hashlib.sha512(body).digest() != digest:
        raise SystemExit(f"the runtime inside {src} does not match its SHA-512")
    return body


class _ZipFinder:
    """Serves the `edhx` package straight from the runtime ZIP's bytes (no file is written)."""

    def __init__(self, zip_bytes):
        self.z = zipfile.ZipFile(io.BytesIO(zip_bytes))
        self.names = set(self.z.namelist())

    def find_spec(self, name, path=None, target=None):
        import importlib.util
        if name != "edhx" and not name.startswith("edhx."):
            return None
        rel = name.replace(".", "/")
        if rel + "/__init__.py" in self.names:
            spec = importlib.util.spec_from_loader(name, self, origin="edhx-embedded:" + rel + "/__init__.py", is_package=True)
            spec.submodule_search_locations = ["edhx-embedded:" + rel]
            return spec
        if rel + ".py" in self.names:
            return importlib.util.spec_from_loader(name, self, origin="edhx-embedded:" + rel + ".py")
        return None

    def create_module(self, spec):
        return None

    def exec_module(self, module):
        origin = module.__spec__.origin[len("edhx-embedded:"):]
        module.__file__ = "edhx-embedded:" + origin
        exec(compile(self.z.read(origin), module.__file__, "exec"), module.__dict__)


def load_runtime(zip_bytes):
    """Make the `edhx` package inside the ZIP importable, and return its Container class."""
    if "edhx" not in sys.modules:
        finder = _ZipFinder(zip_bytes)
        if "edhx/container.py" not in finder.names:
            raise SystemExit("the runtime ZIP holds no edhx package")
        sys.meta_path.insert(0, finder)
    from edhx.container import Container
    return Container


def check_size(path, ceiling):
    size = os.path.getsize(path)
    if size > ceiling:
        raise SystemExit(f"{path} is {size:,} bytes, over the ceiling of {ceiling:,} (GitHub refuses files over 25 MB): split the records over more files")
    return size


def put_all(c, manifest_path):
    with open(manifest_path, encoding="utf-8") as f:
        m = json.load(f)
    base = os.path.dirname(os.path.abspath(manifest_path))
    have = set(c.keys())
    for key in m.get("delete", []):
        if key in have:
            c.delete(key)
    n = total = 0
    for r in m["records"]:
        with open(os.path.join(base, r["path"]), "rb") as f:
            data = f.read()
        c.put(r["key"], data, r.get("type"), tags=tuple(r.get("tags", ())), tier=r.get("tier", "fast"))
        n += 1
        total += len(data)
    c.commit("put", {"key": m.get("summary", "records"), "records": n, "bytes": total})
    return n, total


def main(argv):
    args, opts, i = [], {}, 1
    while i < len(argv):
        a = argv[i]
        if a.startswith("--") and i + 1 < len(argv):
            opts[a[2:]] = argv[i + 1]
            i += 2
        else:
            args.append(a)
            i += 1
    if not args:
        print(__doc__)
        return 64
    cmd, ceiling = args[0], int(opts.get("ceiling", CEILING))
    if cmd == "build":
        out = opts["out"]
        zip_bytes = runtime_zip(opts["runtime"])
        Container = load_runtime(zip_bytes)
        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
        c = Container.create(out, opts["name"], zip_bytes, None, True)
        n, total = put_all(c, opts["manifest"])
        size = check_size(out, ceiling)
        print(json.dumps({"file": out, "records": n, "payload": total, "bytes": size, "generation": int(c.state["lifecycle"]["generation"]), "root": c.root["sha512"]}))
        return 0
    if cmd == "update":
        path = args[1]
        Container = load_runtime(runtime_zip(opts.get("runtime", path)))
        c = Container.open(path)
        n, total = put_all(c, opts["manifest"])
        if "retain" in opts:
            c.compact(retain=int(opts["retain"]), prune_versions=True)
        size = check_size(path, ceiling)
        print(json.dumps({"file": path, "records": n, "payload": total, "bytes": size, "generation": int(c.state["lifecycle"]["generation"]), "root": c.root["sha512"]}))
        return 0
    if cmd == "compact":
        path = args[1]
        Container = load_runtime(runtime_zip(opts.get("runtime", path)))
        c = Container.open(path)
        # the runtime keeps the generation before the newest reachable, so the versions a write replaced are released
        # by the second compaction after it
        before, pruned = os.path.getsize(path), 0
        for _ in range(int(opts.get("passes", 2))):
            pruned += int(c.compact(retain=int(opts.get("retain", 1)), prune_versions=True).get("pruned_versions", 0))
        size = check_size(path, ceiling)
        print(json.dumps({"file": path, "bytes": size, "was": before, "pruned": pruned, "generation": int(c.state["lifecycle"]["generation"]), "root": c.root["sha512"]}))
        return 0
    if cmd == "entangle":
        Container = load_runtime(runtime_zip(opts.get("runtime", args[1])))
        a, b = Container.open(args[1]), Container.open(args[2])
        # a file that was rebuilt is a new container: what its neighbour held of the old one is dropped first
        for me, other in ((a, b), (b, a)):
            hint = os.path.basename(other.path)
            for k in [k for k, e in me.state["entanglements"].items() if e.get("kind") == "edhx-peer" and e.get("path_hint") == hint]:
                del me.state["entanglements"][k]
        r = a.entangle_peer(b)
        check_size(args[1], ceiling)
        check_size(args[2], ceiling)
        print(json.dumps({"entangled": [args[1], args[2]], "joint": r["joint_sha512"]}))
        return 0
    if cmd == "verify":
        Container = load_runtime(runtime_zip(opts.get("runtime", args[1])))
        rep = Container.open(args[1]).verify(True)
        print(json.dumps({"file": args[1], "ok": bool(rep.get("ok")), "bytes": os.path.getsize(args[1]), "problems": rep.get("problems", [])[:5] if isinstance(rep.get("problems"), list) else rep.get("problems")}))
        return 0 if rep.get("ok") else 1
    if cmd == "info":
        Container = load_runtime(runtime_zip(opts.get("runtime", args[1])))
        c = Container.open(args[1])
        print(json.dumps({"file": args[1], "name": c.state["container"].get("name"), "id": c.state["container"]["id"], "generation": int(c.state["lifecycle"]["generation"]),
                          "root": c.root["sha512"], "records": len(list(c.keys())), "bytes": os.path.getsize(args[1]), "entanglements": sorted(c.state.get("entanglements", {}))}))
        return 0
    print(__doc__)
    return 64


if __name__ == "__main__":
    sys.exit(main(sys.argv))
