"""Build the Everett loader cartridge with the EDHX 1.0.0 runtime.

usage: python3 -I make_cartridge.py <edhx_dir> <out.edhx> <survey.json> <loader_config.json> <director.py>
"""
import json
import os
import sys

edhx_dir, out, survey_path, config_path, director_path = sys.argv[1:6]
sys.path.insert(0, edhx_dir)

from edhx import runtime_zip                      # noqa: E402
from edhx.container import Container              # noqa: E402

TICKS = 1000
STAGES = [("boot", 0, 30), ("coast", 30, 70), ("terrain", 70, 135), ("streets", 135, 200),
          ("port", 200, 230), ("aviation", 230, 262), ("present", 262, 290)]
ERAS = [(290, 385, 2026, 2150), (385, 480, 2150, 2400), (480, 575, 2400, 2900), (575, 670, 2900, 3700),
        (670, 765, 3700, 4800), (765, 860, 4800, 6000), (860, 950, 6000, 7026)]

survey = json.load(open(survey_path))
config = open(config_path, encoding="utf-8").read()
json.loads(config)                                # fail early on bad JSON
director = open(director_path, encoding="utf-8").read()

if os.path.exists(out):
    os.remove(out)
c = Container.create(out, "everett-loader", runtime_zip())

sites = ";".join(",".join(str(v) for v in s) for s in survey["sites"])
c.put("city/sites", sites.encode(), "text", tags=["survey"])
for z in range(1, 8):
    ids = survey["zones"].get(str(z), [])
    c.put(f"city/zone/{z}", ",".join(str(i) for i in ids).encode(), "text", tags=["survey"])
c.put("city/survey", json.dumps({k: survey[k] for k in ("seed", "size", "coastKm", "roadKm", "trees")}).encode(), "json",
      tags=["survey"])
c.put("sim/clock", b"0|0|0|0|0|0", "text", tags=["sim"])
c.put("sim/env", b"0|0|55|0|0|60", "text", tags=["sim"])
c.put("sim/era", b"0", "text", tags=["sim"])
c.put("loader/config", config.encode(), "json", tags=["loader"])
c.put("src/director.py", director.encode(), "text", tags=["source"])

facts = c.state.setdefault("facts", {})
facts.update({
    "seed": survey["seed"], "ticks": TICKS, "start_year": 2026, "end_year": 7026, "years": 5000,
    "rebuild_target": 5485, "sites": len(survey["sites"]),
    "stages": ",".join(f"{n}:{a}:{b}" for n, a, b in STAGES),
    "eras": ",".join(f"{a}:{b}:{y0}:{y1}" for a, b, y0, y1 in ERAS),
})
c.set_keyframe("year", 0, 2026)
for a, b, y0, y1 in ERAS:
    c.set_keyframe("year", a, y0)
    c.set_keyframe("year", b, y1)
c.set_keyframe("year", TICKS, 7026)

# EDHX 1.0.0 seeds the gate state with scale_floor 0.0 (mind.py), which overrides the
# policy's z_scale_floor of 4096 and makes any change in effect size "anomalous" after a
# constant history. Store the policy value in the gate state so the declared policy holds.
c.state["mind"]["gate"]["scale_floor"] = float(c.state["policy"].get("z_scale_floor", 4096.0))

pid = c.add_program(source=director)
c.add_trigger("director", "every(1)", pid, caps=["state.read", "state.write", "evidence.write"], budget=200000)
c.commit("build", {"what": "Everett loader cartridge"})

info = c.info()
print(json.dumps({"file": out, "bytes": os.path.getsize(out), "program": pid[:16],
                  "generation": c.state["lifecycle"]["generation"], "records": len(c.state["records"]),
                  "pages": len(c.pages)}, indent=1))
