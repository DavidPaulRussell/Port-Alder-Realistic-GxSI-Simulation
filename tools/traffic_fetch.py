#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Fetch the public traffic cameras around Port Alder's map: where each stands, what it looks at, and the address of
its live picture.

    python traffic_fetch.py                (into the folder port_alder_world next to this script)
    python traffic_fetch.py --out D:\\somewhere\\port_alder_world

It needs nothing but Python 3.8 or later. It reads one public service and writes one small file,
traffic_cameras.json, inside its output folder.

  The Washington State Department of Transportation's camera layer (the one behind its Travel Center map):
  https://data.wsdot.wa.gov/arcgis/rest/services/TravelInformation/TravelInfoCamerasWeather/FeatureServer
  The pictures themselves are not fetched (they change every few minutes; the simulation's page shows them live),
  except one, whose reply headers are noted so that the page knows whether it may read a picture's pixels.

The area is the world around the map: 47.6542 N to 48.2242 N, 122.6075 W to 121.7600 W.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SOUTH, NORTH, WEST, EAST = 47.654167, 48.224167, -122.6075, -121.76
AGENT = "PortAlder-traffic-fetch/1.0 (+https://github.com/DavidPaulRussell/Port-Alder-Realistic-GxSI-Simulation)"
SERVICES = ["https://data.wsdot.wa.gov/arcgis/rest/services/TravelInformation/TravelInfoCamerasWeather/FeatureServer",
            "https://data.wsdot.wa.gov/arcgis/rest/services/TravelInformation/TravelInfoCamerasWeather/MapServer"]


LIMIT = 32 * 1024 * 1024      # no reply here should come near this


def get(url, timeout=60):
    """One https reply, read whole (and refused if it is not https, was sent on elsewhere than https, or is absurdly large)."""
    if not url.lower().startswith("https://"):
        raise IOError("not an https address: " + url[:80])
    req = urllib.request.Request(url, headers={"User-Agent": AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        if not r.geturl().lower().startswith("https://"):
            raise IOError("sent on to an address that is not https")
        raw = r.read(LIMIT + 1)
        if len(raw) > LIMIT:
            raise IOError("the reply is larger than 32 MB")
        return raw, dict(r.headers)


def get_json(url):
    last = None
    for attempt in range(4):
        try:
            raw, _ = get(url)
            data = json.loads(raw.decode("utf-8", "replace"))
            if isinstance(data, dict) and data.get("error"):
                raise IOError(str(data["error"])[:200])
            return data
        except Exception as e:  # the service asks for gentle use: wait and ask again
            last = e
            print(f"   {url.split('?')[0][-60:]}: {type(e).__name__}: {str(e)[:120]}", flush=True)
            time.sleep(4 * (attempt + 1))
    raise last


def layer_features(base, layer_id):
    """Every feature of a layer inside the box, with all its fields, in pages."""
    out, offset = [], 0
    while True:
        q = {"where": "1=1", "geometry": f"{WEST},{SOUTH},{EAST},{NORTH}", "geometryType": "esriGeometryEnvelope", "inSR": "4326",
             "spatialRel": "esriSpatialRelIntersects", "outFields": "*", "returnGeometry": "true", "outSR": "4326", "f": "json",
             "resultOffset": str(offset), "resultRecordCount": "1000"}
        data = get_json(f"{base}/{layer_id}/query?" + urllib.parse.urlencode(q))
        feats = data.get("features") or []
        out += feats
        if not feats or not data.get("exceededTransferLimit"):
            return out, data.get("fields") or []
        offset += len(feats)
        time.sleep(1)


def main(argv):
    out_dir = os.path.join(HERE, "port_alder_world")
    if len(argv) == 3 and argv[1] == "--out":
        out_dir = argv[2]
    elif len(argv) != 1:
        print(__doc__)
        return 2
    os.makedirs(out_dir, exist_ok=True)
    print(f"traffic_fetch: Python {sys.version.split()[0]} on {sys.platform}; writing to {out_dir}", flush=True)
    doc, problem = None, ""
    for base in SERVICES:
        try:
            info = get_json(base + "?f=json")
            layers = []
            for lay in info.get("layers") or []:
                feats, fields = layer_features(base, lay["id"])
                print(f"   layer {lay['id']} ({lay.get('name')}): {len(feats)} in the area", flush=True)
                layers.append({"id": lay["id"], "name": lay.get("name"), "fields": [f.get("name") for f in fields], "features": feats})
                time.sleep(1)
            if any(l["features"] for l in layers):
                doc = {"service": base, "box": [SOUTH, WEST, NORTH, EAST], "fetched": time.strftime("%Y-%m-%d %H:%M:%S"), "layers": layers,
                       "credit": "Washington State Department of Transportation, Travel Center camera layer"}
                break
            problem = "the service answered, but with no cameras in the area"
        except Exception as e:
            problem = f"{type(e).__name__}: {str(e)[:160]}"
    if not doc:
        print("traffic_fetch: the camera layer could not be read (" + problem + "). Run the script again later.", flush=True)
        return 1
    # one picture's reply headers: does the picture host let a page read pixels (Access-Control-Allow-Origin)?
    url = ""
    for lay in doc["layers"]:
        for f in lay["features"]:
            for k, v in (f.get("attributes") or {}).items():
                if isinstance(v, str) and v.lower().startswith("https://images.wsdot.wa.gov/") and v.lower().split("?")[0].endswith((".jpg", ".jpeg", ".png")):
                    url = url or v
    if url:
        try:
            raw, headers = get(url, 30)
            doc["picture_probe"] = {"url": url, "bytes": len(raw), "headers": {k: v for k, v in headers.items() if k.lower() in ("access-control-allow-origin", "content-type", "cache-control", "last-modified", "server")}}
        except Exception as e:
            doc["picture_probe"] = {"url": url, "error": f"{type(e).__name__}: {str(e)[:120]}"}
    path = os.path.join(out_dir, "traffic_cameras.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=1)
    total = sum(len(l["features"]) for l in doc["layers"])
    print(f"traffic_fetch: EVERYTHING IS HERE. {total} features in {len(doc['layers'])} layers, {os.path.getsize(path) / 1e3:.0f} kB: {path}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
