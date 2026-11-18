"""Verify plume pipeline .russ files with the RUSSL corpus reference tooling.
usage: python -B tools/verify_r.py <RUSSL-Zarr-main/corpus> file.russ [file.russ ...]"""
import sys, json
corpus = sys.argv[1]; sys.path.insert(0, corpus + "/tooling")
import russ_container as rc, russl_reference as rr
for path in sys.argv[2:]:
    r = rc.verify_file(path, corpus + "/machine/schemas")
    src = r["payload"]["language/main.russl"].decode()
    rr.parse_russl(src)
    prov = json.loads(r["payload"]["evidence/provenance.json"])
    print(f"OK  {path}: {r['tuple_id']}  ({prov['pipeline'].get('stage')}, input {prov['pipeline'].get('input_tuple_id', '-')})")
