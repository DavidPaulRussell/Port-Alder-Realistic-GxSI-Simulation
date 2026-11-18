#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Fetch what Port Alder's full-scale map is drawn from, and cut it down to small files.

    python map_fetch.py                 (everything, into a folder port_alder_map next to this script)
    python map_fetch.py --only osm      (the streets, buildings, water and land use)
    python map_fetch.py --only terrain  (the ground's height)
    python map_fetch.py --out D:\\somewhere\\port_alder_map

It needs nothing but Python 3.8 or later (numpy makes the terrain step faster and is not required). It only reads
from the two public services below and only writes inside its output folder. Run it again after a failure: what it
already has, it keeps.

  1. OpenStreetMap, through the public Overpass API: every building outline, street, path, railway, shore, lake,
     river, park, land use and named place in the area the city view covers. (c) OpenStreetMap contributors, Open
     Database License 1.0: https://www.openstreetmap.org/copyright
  2. The U.S. Geological Survey's 3D Elevation Program, 1 arc-second (about 30 m) bare-earth elevation: two tiles of
     about 50 MB each, of which only the map's area is kept. Public domain.

The area: 47.845 N to 48.034 N, 122.325 W to 122.043 W (Mukilteo and Paine Field to Lake Stevens and Snohomish, Priest
Point and Jetty Island to Mill Creek and Martha Lake).
"""
import gzip
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib

try:
    import numpy as np
except Exception:  # numpy is optional
    np = None

SOUTH, NORTH, WEST, EAST = 47.845, 48.034, -122.325, -122.043
AGENT = "PortAlder-map-fetch/1.0 (+https://github.com/DavidPaulRussell/Port-Alder)"
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter",
            "https://lz4.overpass-api.de/api/interpreter", "https://z.overpass-api.de/api/interpreter",
            "http://overpass-api.de/api/interpreter"]
DEM_URLS = ["https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1/TIFF/current/{t}/USGS_1_{t}.tif",
            "https://rockyweb.usgs.gov/vdelivery/Datasets/Staged/Elevation/1/TIFF/current/{t}/USGS_1_{t}.tif",
            "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1/TIFF/{t}/USGS_1_{t}.tif"]
DEM_TILES = ["n48w123", "n49w123"]                         # named by their north-west corners: 47-48 N and 48-49 N

# layer -> (tiles across, tiles down, the Overpass statements with {b} for the box, the tags worth keeping)
KEEP_COMMON = ["name", "layer", "bridge", "tunnel", "access", "operator", "ref", "height", "ele", "start_date", "wikidata"]
LAYERS = {
    "buildings": (3, 3, ['way["building"]({b});', 'relation["building"]({b});'],
                  ["building", "building:levels", "building:material", "building:colour", "building:use", "roof:shape", "roof:levels",
                   "roof:colour", "roof:material", "min_height", "amenity", "shop", "office", "tourism", "leisure", "craft", "industrial",
                   "religion", "healthcare", "man_made", "aeroway", "military", "public_transport", "railway", "residential", "cuisine",
                   "addr:housenumber", "addr:street", "addr:unit", "addr:city", "addr:postcode", "brand", "capacity", "beds", "rooms"]),
    "roads": (2, 2, ['way["highway"]({b});'],
              ["highway", "lanes", "lanes:forward", "lanes:backward", "oneway", "maxspeed", "surface", "width", "sidewalk", "sidewalk:both",
               "sidewalk:left", "sidewalk:right", "cycleway", "cycleway:both", "cycleway:left", "cycleway:right", "lit", "junction", "service",
               "footway", "crossing", "bicycle", "foot", "bus", "turn:lanes", "parking:lane:both", "parking:both", "parking:left", "parking:right",
               "motor_vehicle", "smoothness", "incline", "busway", "hgv", "destination", "ramp", "area", "placement", "tracktype"]),
    "rail": (1, 1, ['way["railway"]({b});', 'way["aerialway"]({b});', 'way["route"="ferry"]({b});', 'relation["route"~"^(bus|ferry|light_rail)$"]({b});'],
             ["railway", "service", "usage", "electrified", "gauge", "tracks", "route", "aerialway", "network", "from", "to", "duration", "interval",
              "passenger", "freight", "maxspeed", "type", "public_transport:version"]),
    "water": (1, 1, ['way["natural"~"^(water|coastline|wetland|beach|mud|shoal|sand|bay|strait|reef|spring)$"]({b});',
                     'relation["natural"~"^(water|wetland|beach|mud|shoal|sand|bay|strait)$"]({b});', 'way["waterway"]({b});',
                     'relation["waterway"]({b});', 'way["landuse"~"^(reservoir|basin|salt_pond)$"]({b});',
                     'way["man_made"~"^(pier|breakwater|groyne|dyke|embankment|quay)$"]({b});', 'way["leisure"~"^(marina|slipway|swimming_pool)$"]({b});',
                     'way["place"~"^(island|islet)$"]({b});', 'relation["place"~"^(island|islet)$"]({b});'],
              ["natural", "water", "waterway", "wetland", "tidal", "intermittent", "salt", "landuse", "man_made", "leisure", "place", "boat", "width",
               "type", "seasonal", "floating", "mooring", "harbour"]),
    "land": (2, 2, ['way["landuse"]({b});', 'relation["landuse"]({b});', 'way["leisure"]({b});', 'relation["leisure"]({b});',
                    'way["natural"~"^(wood|scrub|grassland|heath|bare_rock|scree|tree_row|cliff|ridge)$"]({b});',
                    'relation["natural"~"^(wood|scrub|grassland|heath)$"]({b});', 'way["aeroway"]({b});', 'relation["aeroway"]({b});',
                    'way["amenity"]({b});', 'relation["amenity"]({b});', 'way["military"]({b});', 'relation["military"]({b});',
                    'way["man_made"~"^(bridge|tower|storage_tank|silo|chimney|crane|wastewater_plant|water_works|works|pipeline|mast|water_tower|gasometer)$"]({b});',
                    'way["power"~"^(line|minor_line|substation|plant|generator)$"]({b});', 'way["barrier"~"^(wall|fence|hedge|retaining_wall|city_wall|guard_rail)$"]({b});',
                    'way["tourism"]({b});', 'way["shop"]({b});', 'way["office"]({b});', 'way["golf"]({b});', 'way["cemetery"]({b});', 'way["boundary"="protected_area"]({b});'],
             ["landuse", "leisure", "natural", "aeroway", "amenity", "military", "man_made", "power", "barrier", "tourism", "shop", "office", "golf",
              "sport", "surface", "leaf_type", "leaf_cycle", "religion", "parking", "capacity", "fee", "crop", "trees", "residential", "industrial",
              "building", "building:levels", "voltage", "cables", "boundary", "protect_class", "garden:type", "cemetery", "type", "fence_type", "isced:level"]),
    "places": (1, 1, ['relation["boundary"="administrative"]["admin_level"~"^(6|8)$"]({b});', 'node["place"]({b});', 'relation["boundary"="census"]({b});',
                      'relation["boundary"~"^(postal_code|neighbourhood)$"]({b});', 'way["place"~"^(neighbourhood|suburb|quarter|locality)$"]({b});'],
               ["place", "boundary", "admin_level", "population", "population:date", "border_type", "type", "postal_code", "census:population", "is_in",
                "official_name", "short_name", "alt_name", "gnis:feature_id"]),
    "points": (2, 2, ['node["amenity"]({b});', 'node["shop"]({b});', 'node["office"]({b});', 'node["tourism"]({b});', 'node["leisure"]({b});',
                      'node["highway"~"^(bus_stop|traffic_signals|crossing|stop|give_way|street_lamp|turning_circle|mini_roundabout|motorway_junction|speed_camera)$"]({b});',
                      'node["public_transport"]({b});', 'node["railway"]({b});', 'node["natural"~"^(tree|peak|spring|rock)$"]({b});', 'node["man_made"]({b});',
                      'node["emergency"]({b});', 'node["healthcare"]({b});', 'node["craft"]({b});', 'node["aeroway"]({b});', 'node["power"~"^(tower|pole|substation|generator)$"]({b});',
                      'node["barrier"~"^(gate|bollard|lift_gate|toll_booth)$"]({b});', 'node["entrance"]({b});', 'node["historic"]({b});', 'node["information"]({b});',
                      'node["traffic_calming"]({b});', 'node["ford"]({b});', 'node["waterway"]({b});'],
               ["amenity", "shop", "office", "tourism", "leisure", "highway", "public_transport", "railway", "natural", "man_made", "emergency", "healthcare",
                "craft", "aeroway", "power", "barrier", "entrance", "historic", "information", "traffic_calming", "cuisine", "brand", "opening_hours",
                "capacity", "religion", "denomination", "sport", "shelter", "bench", "bus", "crossing", "crossing:markings", "traffic_signals",
                "addr:housenumber", "addr:street", "addr:city", "addr:postcode", "level", "wheelchair", "atm", "fuel:diesel", "social_facility",
                "isced:level", "emergency", "leaf_type", "genus", "species", "ford", "waterway", "network", "fee", "beds", "rooms", "stars", "phone"]),
}

LOG = None


def say(*a):
    line = " ".join(str(x) for x in a)
    print(line, flush=True)
    if LOG:
        LOG.write(time.strftime("%H:%M:%S ") + line + "\n")
        LOG.flush()


# ---------------------------------------------------------------------------------------------- OpenStreetMap
def overpass(query, label):
    """POST one query, trying each public instance in turn; returns the parsed JSON or None."""
    body = urllib.parse.urlencode({"data": query}).encode("ascii")
    waits = [5, 20, 45, 90]
    for attempt, wait in enumerate(waits):
        for url in OVERPASS:
            try:
                req = urllib.request.Request(url, data=body, headers={"User-Agent": AGENT, "Accept-Encoding": "gzip", "Content-Type": "application/x-www-form-urlencoded"})
                t0 = time.time()
                with urllib.request.urlopen(req, timeout=420) as r:
                    raw = r.read()
                    if r.headers.get("Content-Encoding") == "gzip":
                        raw = gzip.decompress(raw)
                text = raw.decode("utf-8", "replace")
                if not text.lstrip().startswith("{"):
                    say(f"   {label}: {url.split('/')[2]} answered with something that is not data ({text[:120].strip()!r})")
                    continue
                data = json.loads(text)
                remark = data.get("remark", "")
                if "error" in remark.lower() or "timed out" in remark.lower() or "out of memory" in remark.lower():
                    say(f"   {label}: {url.split('/')[2]} could not finish ({remark[:140]})")
                    return {"too_big": True}
                say(f"   {label}: {len(data.get('elements', []))} elements from {url.split('/')[2]} in {time.time() - t0:.0f} s ({len(raw) / 1e6:.1f} MB)")
                return data
            except urllib.error.HTTPError as e:
                say(f"   {label}: {url.split('/')[2]} said HTTP {e.code}")
                if e.code in (400,):
                    return None
            except Exception as e:  # a network error, a timeout, a TLS failure: try the next instance
                say(f"   {label}: {url.split('/')[2]} failed ({type(e).__name__}: {str(e)[:120]})")
        if attempt + 1 < len(waits):
            say(f"   {label}: every instance failed; waiting {wait} s before trying again")
            time.sleep(wait)
    return None


def q7(x):
    return int(round(x * 1e7))


def line7(geom):
    """A way's points as integers of 1e-7 degree: the first as it is, the rest as differences."""
    out, pla, plo = [], 0, 0
    for p in geom:
        if p is None:
            continue
        la, lo = q7(p["lat"]), q7(p["lon"])
        out.append(la - pla)
        out.append(lo - plo)
        pla, plo = la, lo
    return out


def compact(el, keep):
    tags = {k: v for k, v in (el.get("tags") or {}).items() if k in keep}
    kind = el["type"][0]
    if kind == "n":
        return ["n", el["id"], tags, [q7(el["lat"]), q7(el["lon"])]]
    if kind == "w":
        g = el.get("geometry")
        return ["w", el["id"], tags, line7(g)] if g else None
    members = []
    for m in el.get("members", []):
        if m.get("type") == "way" and m.get("geometry"):
            members.append([m.get("role", ""), line7(m["geometry"])])
        elif m.get("type") == "node" and "lat" in m:
            members.append([m.get("role", "") or "node", [q7(m["lat"]), q7(m["lon"])]])
    return ["r", el["id"], tags, members] if members else None


def fetch_layer(name, out_dir):
    target = os.path.join(out_dir, f"osm_{name}.json.gz")
    if os.path.exists(target):
        say(f"{name}: already here ({os.path.getsize(target) / 1e6:.1f} MB)")
        return True
    nx, ny, statements, keep = LAYERS[name]
    keep = set(keep) | set(KEEP_COMMON)
    cache = os.path.join(out_dir, "cache")
    os.makedirs(cache, exist_ok=True)
    boxes = [(SOUTH + (NORTH - SOUTH) * j / ny, WEST + (EAST - WEST) * i / nx, SOUTH + (NORTH - SOUTH) * (j + 1) / ny, WEST + (EAST - WEST) * (i + 1) / nx)
             for j in range(ny) for i in range(nx)]
    seen, rows, stamp, depth = set(), [], "", {}
    say(f"{name}: asking for {len(boxes)} piece{'s' if len(boxes) > 1 else ''}")
    while boxes:
        s, w, n, e = box = boxes.pop(0)
        key = f"{name}_{s:.5f}_{w:.5f}_{n:.5f}_{e:.5f}.json.gz"
        path = os.path.join(cache, key)
        if os.path.exists(path):
            with gzip.open(path, "rt", encoding="utf-8") as f:
                data = json.load(f)
        else:
            b = f"{s:.6f},{w:.6f},{n:.6f},{e:.6f}"
            data = overpass("[out:json][timeout:300][maxsize:1073741824];(" + "".join(x.format(b=b) for x in statements) + ");out geom qt;", f"{name} {len(seen)} so far")
            if data is None:
                say(f"{name}: could not be fetched. Run the script again later; what it has is kept.")
                return False
            if data.get("too_big"):
                d = depth.get(box, 0)
                if d >= 3:
                    say(f"{name}: a piece is still too big after three splits; giving up on this layer")
                    return False
                ms, mw = (s + n) / 2, (w + e) / 2
                for nb in ((s, w, ms, mw), (s, mw, ms, e), (ms, w, n, mw), (ms, mw, n, e)):
                    depth[nb] = d + 1
                    boxes.append(nb)
                continue
            with gzip.open(path, "wt", encoding="utf-8") as f:
                json.dump(data, f, separators=(",", ":"))
            time.sleep(2)                                   # the public instances ask for gentle use
        stamp = max(stamp, (data.get("osm3s") or {}).get("timestamp_osm_base", ""))
        for el in data.get("elements", []):
            k = (el["type"], el["id"])
            if k in seen:
                continue
            seen.add(k)
            row = compact(el, keep)
            if row:
                rows.append(row)
    rows.sort(key=lambda r: (r[0], r[1]))
    doc = {"layer": name, "box": [SOUTH, WEST, NORTH, EAST], "osm_base": stamp, "coordinates": "integers of 1e-7 degree; within a line the first point is as it is and the rest are differences (latitude, longitude)",
           "rows": "[kind n/w/r, OpenStreetMap id, tags, node [lat, lon] | way line | relation [[role, line], ...]]",
           "credit": "(c) OpenStreetMap contributors, Open Database License 1.0, https://www.openstreetmap.org/copyright", "count": len(rows), "elements": rows}
    tmp = target + ".part"
    with gzip.open(tmp, "wt", encoding="utf-8", compresslevel=9) as f:
        json.dump(doc, f, separators=(",", ":"), ensure_ascii=False)
    os.replace(tmp, target)
    say(f"{name}: {len(rows)} elements kept, {os.path.getsize(target) / 1e6:.1f} MB (OpenStreetMap data as of {stamp or 'unknown'})")
    return True


# ---------------------------------------------------------------------------------------------- terrain
TYPES = {1: ("B", 1), 2: ("c", 1), 3: ("H", 2), 4: ("I", 4), 5: ("II", 8), 6: ("b", 1), 7: ("B", 1), 8: ("h", 2),
         9: ("i", 4), 10: ("ii", 8), 11: ("f", 4), 12: ("d", 8), 16: ("Q", 8), 17: ("q", 8), 18: ("Q", 8)}


def lzw(data):
    """TIFF's LZW: codes most significant bit first, 9 to 12 bits, the width growing one code early."""
    out = []
    table = [bytes((i,)) for i in range(256)] + [b"", b""]
    bits = nbits = 0
    width, mask, nxt, prev = 9, 511, 258, None
    for byte in data:
        bits = (bits << 8) | byte
        nbits += 8
        if nbits < width:
            continue
        nbits -= width
        code = (bits >> nbits) & mask
        bits &= (1 << nbits) - 1
        if code == 256:
            del table[258:]
            width, mask, nxt, prev = 9, 511, 258, None
            continue
        if code == 257:
            break
        if prev is None:
            s = table[code]
        elif code < nxt:
            s = table[code]
            table.append(prev + s[:1])
            nxt += 1
        else:
            s = prev + prev[:1]
            table.append(s)
            nxt += 1
        out.append(s)
        prev = s
        if nxt + 1 >= (1 << width) and width < 12:
            width += 1
            mask = (1 << width) - 1
    return b"".join(out)


class Tiff:
    """The first image of a TIFF or BigTIFF holding one band of heights; tiles (or strips) are decoded on request."""

    def __init__(self, path):
        self.f = open(path, "rb")
        head = self.f.read(16)
        if head[:2] not in (b"II", b"MM"):
            raise ValueError("not a TIFF file")
        self.bo = "<" if head[:2] == b"II" else ">"
        magic = struct.unpack(self.bo + "H", head[2:4])[0]
        if magic not in (42, 43):
            raise ValueError("not a TIFF file")
        self.big = magic == 43
        off = struct.unpack(self.bo + ("Q" if self.big else "I"), head[8:16] if self.big else head[4:8])[0]
        t = self.tags = self._ifd(off)
        self.width, self.height = t[256][0], t[257][0]
        self.bits, self.comp, self.pred, self.fmt = t.get(258, [1])[0], t.get(259, [1])[0], t.get(317, [1])[0], t.get(339, [1])[0]
        if t.get(277, [1])[0] != 1:
            raise ValueError("expected one band")
        if 322 in t:
            self.tw, self.th, self.offsets, self.counts = t[322][0], t[323][0], t[324], t[325]
        else:
            self.tw, self.th, self.offsets, self.counts = self.width, t.get(278, [self.height])[0], t[273], t[279]
        self.across = (self.width + self.tw - 1) // self.tw
        scale, tie = t.get(33550), t.get(33922)
        if not scale or not tie:
            raise ValueError("the file has no georeference")
        self.dx, self.dy = scale[0], scale[1]
        self.lon0, self.lat0 = tie[3] - tie[0] * scale[0], tie[4] + tie[1] * scale[1]     # the outer corner of the top-left pixel
        self.area = (t.get(33922) is not None) and self._pixel_is_area()
        nd = t.get(42113)
        try:
            self.nodata = float(nd) if nd is not None else None
        except ValueError:
            self.nodata = None
        code = {(32, 3): "f", (64, 3): "d", (16, 1): "H", (16, 2): "h", (32, 1): "I", (32, 2): "i"}.get((self.bits, self.fmt))
        if code is None:
            raise ValueError(f"unsupported samples: {self.bits} bits, format {self.fmt}")
        self.code, self.size, self.cache = code, self.bits // 8, {}

    def _pixel_is_area(self):
        keys = self.tags.get(34735) or []                  # GeoKeyDirectory: GTRasterTypeGeoKey 1025 (1 area, 2 point)
        for k in range(4, len(keys) - 3, 4):
            if keys[k] == 1025:
                return keys[k + 3] != 2
        return True

    def _ifd(self, off):
        f, bo = self.f, self.bo
        f.seek(off)
        if self.big:
            n, esz = struct.unpack(bo + "Q", f.read(8))[0], 20
        else:
            n, esz = struct.unpack(bo + "H", f.read(2))[0], 12
        raw, tags = f.read(n * esz), {}
        for i in range(n):
            e = raw[i * esz:(i + 1) * esz]
            tag, typ = struct.unpack(bo + "HH", e[:4])
            count = struct.unpack(bo + ("Q" if self.big else "I"), e[4:12] if self.big else e[4:8])[0]
            val = e[12:20] if self.big else e[8:12]
            fmt, size = TYPES.get(typ, ("B", 1))
            total = size * count
            if total > len(val):
                f.seek(struct.unpack(bo + ("Q" if self.big else "I"), val)[0])
                data = f.read(total)
            else:
                data = val[:total]
            if typ == 2:
                tags[tag] = data.split(b"\0")[0].decode("latin1")
            elif typ in (5, 10):
                v = struct.unpack(bo + fmt[0] * (2 * count), data)
                tags[tag] = [v[k] / v[k + 1] if v[k + 1] else 0 for k in range(0, len(v), 2)]
            else:
                tags[tag] = list(struct.unpack(bo + fmt * count, data))
        return tags

    def tile(self, k):
        """Tile k as a list of rows of floats."""
        if k in self.cache:
            return self.cache[k]
        import array
        tw, th, size = self.tw, self.th, self.size
        if self.counts[k] == 0:
            rows = None
        else:
            self.f.seek(self.offsets[k])
            raw = self.f.read(self.counts[k])
            if self.comp == 5:
                raw = lzw(raw)
            elif self.comp in (8, 32946):
                raw = zlib.decompress(raw)
            elif self.comp != 1:
                raise ValueError(f"unsupported compression {self.comp} (expected none, LZW or Deflate)")
            need = tw * th * size
            if len(raw) < need:
                raw = raw + b"\0" * (need - len(raw))
            raw = raw[:need]
            if self.pred == 3:                               # floating point: byte planes, most significant first, differenced along the row
                if np is not None:
                    a = np.cumsum(np.frombuffer(raw, dtype=np.uint8).reshape(th, tw * size), axis=1, dtype=np.uint8)
                    a = a.reshape(th, size, tw).transpose(0, 2, 1).reshape(th, tw * size)
                    vals = a.copy().view(np.dtype(">" + self.code)).astype(np.float64)
                    rows = [vals[r] for r in range(th)]
                else:
                    rows = []
                    for r in range(th):
                        b = bytearray(raw[r * tw * size:(r + 1) * tw * size])
                        acc = 0
                        for i in range(len(b)):
                            acc = (acc + b[i]) & 255
                            b[i] = acc
                        inter = bytearray(tw * size)
                        for p in range(size):
                            inter[p::size] = b[p * tw:(p + 1) * tw]
                        rows.append(struct.unpack(">" + self.code * tw, bytes(inter)))
            else:
                word = {1: "B", 2: "H", 4: "I", 8: "Q"}[size]
                swap = (sys.byteorder == "little") != (self.bo == "<")
                rows = []
                for r in range(th):
                    a = array.array(word, raw[r * tw * size:(r + 1) * tw * size])
                    if swap:
                        a.byteswap()
                    if self.pred == 2:
                        acc, mask = 0, (1 << (8 * size)) - 1
                        for i in range(len(a)):
                            acc = (acc + a[i]) & mask
                            a[i] = acc
                    rows.append(array.array(self.code, a.tobytes()) if self.code != word else a)
        if len(self.cache) > 24:
            self.cache.pop(next(iter(self.cache)))
        self.cache[k] = rows
        return rows

    def at(self, col, row):
        if col < 0 or row < 0 or col >= self.width or row >= self.height:
            return None
        rows = self.tile((row // self.th) * self.across + col // self.tw)
        if rows is None:
            return None
        v = float(rows[row % self.th][col % self.tw])
        if self.nodata is not None and abs(v - self.nodata) < 1e-6 * max(1.0, abs(self.nodata)):
            return None
        return v if -500 < v < 9000 else None

    def ground(self, lat, lon):
        """Bilinear height at a point, or None beyond the image or where it has no data."""
        half = 0.5 if self.area else 0.0
        x, y = (lon - self.lon0) / self.dx - half, (self.lat0 - lat) / self.dy - half
        c0, r0 = int(x // 1), int(y // 1)
        fx, fy = x - c0, y - r0
        v = [self.at(c0, r0), self.at(c0 + 1, r0), self.at(c0, r0 + 1), self.at(c0 + 1, r0 + 1)]
        if all(z is None for z in v):
            return None
        fill = next(z for z in v if z is not None)
        v = [fill if z is None else z for z in v]
        return (v[0] * (1 - fx) + v[1] * fx) * (1 - fy) + (v[2] * (1 - fx) + v[3] * fx) * fy


def download(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": AGENT})
    tmp = path + ".part"
    with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
        total, got, t0 = int(r.headers.get("Content-Length") or 0), 0, time.time()
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            got += len(chunk)
            if time.time() - t0 > 5:
                t0 = time.time()
                say(f"   {got / 1e6:.0f} MB" + (f" of {total / 1e6:.0f}" if total else ""))
    if total and got != total:
        raise IOError(f"the download stopped at {got} of {total} bytes")
    os.replace(tmp, path)


def fetch_terrain(out_dir, keep):
    target = os.path.join(out_dir, "terrain_1arcsec.f32")
    if os.path.exists(target) and os.path.exists(target[:-4] + ".json"):
        say(f"terrain: already here ({os.path.getsize(target) / 1e6:.1f} MB)")
        return True
    cache = os.path.join(out_dir, "cache")
    os.makedirs(cache, exist_ok=True)
    tiffs = []
    for t in DEM_TILES:
        path = os.path.join(cache, f"USGS_1_{t}.tif")
        if not os.path.exists(path):
            ok = False
            for pattern in DEM_URLS:
                url = pattern.format(t=t)
                try:
                    say(f"terrain: fetching {url}")
                    download(url, path)
                    ok = True
                    break
                except Exception as e:
                    say(f"   failed ({type(e).__name__}: {str(e)[:120]})")
            if not ok:
                say("terrain: could not be fetched. The map will be flat until it is; run the script again later.")
                return False
        try:
            tf = Tiff(path)
            say(f"terrain: {t} is {tf.width} x {tf.height}, tiles {tf.tw} x {tf.th}, compression {tf.comp}, predictor {tf.pred}, {tf.bits}-bit, corner {tf.lat0:.5f} N {tf.lon0:.5f} E, pixel {tf.dx:.8f}")
            tiffs.append(tf)
        except Exception as e:
            say(f"terrain: {path} could not be read ({type(e).__name__}: {e}). Delete it and run the script again.")
            return False
    step = 1.0 / 3600
    rows, cols = int(round((NORTH - SOUTH) / step)) + 1, int(round((EAST - WEST) / step)) + 1
    out, missing, lo, hi, t0 = bytearray(rows * cols * 4), 0, 1e9, -1e9, time.time()
    for r in range(rows):
        lat = NORTH - r * step
        vals = []
        for c in range(cols):
            lon = WEST + c * step
            h = None
            for tf in tiffs:
                h = tf.ground(lat, lon)
                if h is not None:
                    break
            if h is None:
                missing += 1
                h = 0.0
            lo, hi = min(lo, h), max(hi, h)
            vals.append(h)
        struct.pack_into("<" + "f" * cols, out, r * cols * 4, *vals)
        if time.time() - t0 > 10:
            t0 = time.time()
            say(f"   row {r} of {rows}")
    with open(target, "wb") as f:
        f.write(out)
    meta = {"what": "height of the ground in metres (NAVD88), one value per arc-second post", "rows": rows, "cols": cols, "north": NORTH, "west": WEST,
            "step_degrees": step, "order": "float32 little-endian, row by row from the north-west corner", "lowest": round(lo, 2), "highest": round(hi, 2),
            "posts_without_data": missing, "credit": "U.S. Geological Survey, 3D Elevation Program, 1 arc-second DEM (public domain)"}
    with open(target[:-4] + ".json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1)
    say(f"terrain: {rows} x {cols} heights from {lo:.1f} m to {hi:.1f} m, {missing} without data, {len(out) / 1e6:.1f} MB")
    if not keep:
        for tf in tiffs:
            tf.f.close()
        for t in DEM_TILES:
            try:
                os.remove(os.path.join(cache, f"USGS_1_{t}.tif"))
            except OSError:
                pass
    return True


def main(argv):
    global LOG
    here = os.path.dirname(os.path.abspath(argv[0]))
    out_dir, only, keep = os.path.join(here, "port_alder_map"), "", False
    i = 1
    while i < len(argv):
        a = argv[i]
        if a == "--out" and i + 1 < len(argv):
            out_dir = argv[i + 1]
            i += 1
        elif a == "--only" and i + 1 < len(argv):
            only = argv[i + 1]
            i += 1
        elif a == "--keep":
            keep = True
        else:
            print(__doc__)
            return 2
        i += 1
    os.makedirs(out_dir, exist_ok=True)
    LOG = open(os.path.join(out_dir, "fetch_log.txt"), "a", encoding="utf-8")
    say(f"map_fetch: Python {sys.version.split()[0]} on {sys.platform}, numpy {'yes' if np is not None else 'no'}; writing to {out_dir}")
    done = {}
    if only in ("", "osm"):
        for name in LAYERS:
            done[name] = fetch_layer(name, out_dir)
    if only in ("", "terrain"):
        done["terrain"] = fetch_terrain(out_dir, keep)
    with open(os.path.join(out_dir, "fetch.json"), "w", encoding="utf-8") as f:
        json.dump({"box": {"south": SOUTH, "north": NORTH, "west": WEST, "east": EAST}, "fetched": time.strftime("%Y-%m-%d %H:%M:%S"), "done": done,
                   "credits": ["(c) OpenStreetMap contributors, Open Database License 1.0, https://www.openstreetmap.org/copyright",
                               "U.S. Geological Survey, 3D Elevation Program (public domain)"]}, f, indent=1)
    missing = [k for k, v in done.items() if not v]
    say("map_fetch: " + ("everything is here." if not missing else "still missing: " + ", ".join(missing) + ". Run the script again to try those."))
    say(f"map_fetch: the files are in {out_dir}")
    return 0 if not missing else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
