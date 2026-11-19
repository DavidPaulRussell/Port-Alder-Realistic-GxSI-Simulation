#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Fetch the wider world around Port Alder's map: the land, water, main roads and heights of a square three times as
wide as the map itself, so that the map sits in the middle of a world instead of ending at its own edge.

    python world_fetch.py                  (the heights and the map tiles, into a folder port_alder_world next to this script)
    python world_fetch.py --only terrain   (only the heights)
    python world_fetch.py --only tiles     (only the map tiles: roads, water, land, buildings)
    python world_fetch.py --only osm       (the same things asked of the Overpass API instead; slow, and often busy)
    python world_fetch.py --out D:\\somewhere\\port_alder_world

It needs nothing but Python 3.8 or later and map_fetch.py in the same folder (it borrows that script's careful way of
asking). It only reads from the public services below and only writes inside its output folder. Run it again after a
failure: what it already has, it keeps.

  1. OpenStreetMap as ready-made vector map tiles, from two free public tile services (OpenFreeMap, in the OpenMapTiles
     layout, and VersaTiles, in the Shortbread layout; either is enough): the shores, lakes, rivers and wetlands, the
     roads, railways and ferries, the woods, farmland, parks, built-up and industrial land, buildings and public
     places. About 300 small files from each, 20 to 60 MB. (c) OpenStreetMap contributors, Open Database License 1.0:
     https://www.openstreetmap.org/copyright ; https://openfreemap.org ; https://versatiles.org
  2. Terrain Tiles (Mapzen/Tilezen, hosted in Amazon's open-data programme): the height of the ground and the depth of
     the Sound, about 26 m to a point here, drawn in the United States from the U.S. Geological Survey's 3D Elevation
     Program. About a hundred small pictures, 10 MB in all. https://registry.opendata.aws/terrain-tiles/

The map itself (what the simulation runs on) is the population cut: 47.8442 N to 48.0342 N, 122.3250 W to 122.0425 W,
about 21 km each way. The world fetched here is three times that each way, about 63 km: 47.6542 N to 48.2242 N,
122.6075 W to 121.7600 W (north Seattle and Kingston to Arlington, Whidbey Island to the Cascade foothills).
"""
import gzip
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
try:
    import map_fetch as mf
except Exception as e:  # pragma: no cover
    print("world_fetch needs map_fetch.py in the same folder (" + type(e).__name__ + ": " + str(e) + ")")
    sys.exit(2)

CORE = (47.844167, 48.034167, -122.325000, -122.042500)         # south, north, west, east: the population cut
_LAT, _LON = (CORE[0] + CORE[1]) / 2, (CORE[2] + CORE[3]) / 2
SOUTH, NORTH = round(_LAT - 1.5 * (CORE[1] - CORE[0]), 6), round(_LAT + 1.5 * (CORE[1] - CORE[0]), 6)
WEST, EAST = round(_LON - 1.5 * (CORE[3] - CORE[2]), 6), round(_LON + 1.5 * (CORE[3] - CORE[2]), 6)
ZOOM = 12
# vector map tiles: name -> (where the service says its address pattern is, the pattern to fall back on)
VECTOR = {
    "openfreemap": ("https://tiles.openfreemap.org/planet", ""),
    "versatiles": ("https://tiles.versatiles.org/tiles/osm/tiles.json", "https://tiles.versatiles.org/tiles/osm/{z}/{x}/{y}"),
}
VECTOR_ZOOMS = ((12, "world"), (14, "map"))                 # the whole world at zoom 12, the map itself again at zoom 14 (every street and building)
TILE_URLS = ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
             "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png"]
# the public Overpass instances, asked in turn; an empty answer is only believed from the first two
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter", "https://overpass.nchc.org.tw/api/interpreter",
            "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]
TRUSTED = ("overpass-api.de", "overpass.private.coffee")

_USE = "forest|farmland|farmyard|meadow|orchard|vineyard|industrial|commercial|retail|residential|military|quarry|landfill|railway|cemetery|grass|recreation_ground|port|greenhouse_horticulture|plant_nursery|allotments|brownfield|construction"
# layer -> (pieces across, pieces down, the Overpass statements with {b} for the box, the tags worth keeping)
LAYERS = {
    "world_roads": (3, 3, ['way["highway"~"^(motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link)$"]({b});'],
                    ["highway", "lanes", "oneway", "junction", "maxspeed", "surface"]),
    "world_water": (3, 3, ['way["natural"~"^(water|coastline|wetland|beach|sand|mud|shoal)$"]({b});', 'relation["natural"~"^(water|wetland|beach|sand|mud)$"]({b});',
                           'way["waterway"~"^(river|canal)$"]({b});', 'way["man_made"~"^(pier|breakwater|groyne)$"]({b});'],
                    ["natural", "water", "waterway", "wetland", "tidal", "intermittent", "salt", "man_made", "width", "type"]),
    "world_rail": (2, 2, ['way["railway"~"^(rail|light_rail)$"]({b});', 'way["route"="ferry"]({b});'],
                   ["railway", "service", "usage", "route", "passenger"]),
    "world_places": (1, 1, ['node["place"~"^(city|town|village|suburb|hamlet|island|neighbourhood)$"]({b});'],
                     ["place", "population"]),
    "world_points": (2, 2, [f'{t}["amenity"~"^(school|hospital|fire_station|police|library|townhall|college|university|ferry_terminal|bus_station)$"]({{b}});' for t in ("node", "way", "relation")]
                     + ['node["railway"="station"]({b});', 'node["aeroway"="aerodrome"]({b});'],
                     ["amenity", "isced:level", "railway", "aeroway", "beds", "capacity", "operator:type", "grades"]),
    "world_land": (6, 6, [f'way["landuse"~"^({_USE})$"]({{b}});', f'relation["landuse"~"^({_USE})$"]({{b}});',
                          'way["natural"~"^(wood|scrub|grassland|heath|bare_rock|scree)$"]({b});', 'relation["natural"~"^(wood|scrub|grassland|heath|bare_rock)$"]({b});',
                          'way["leisure"~"^(park|golf_course|nature_reserve|stadium|marina)$"]({b});', 'relation["leisure"~"^(park|golf_course|nature_reserve)$"]({b});',
                          'way["aeroway"~"^(aerodrome|runway|taxiway|apron)$"]({b});', 'relation["aeroway"="aerodrome"]({b});'],
                   ["landuse", "natural", "leisure", "aeroway", "leaf_type", "crop", "surface", "type", "military"]),
}


def say(*a):
    mf.say(*a)


def ask(query, label):
    """POST one query to each public instance in turn. Returns the parsed answer; {"too_big": True} when the piece
    should be asked for in four smaller pieces (an instance said so, or they answered slowly and then failed, which is
    how a busy instance treats a heavy question); None when nothing answers at all."""
    body = urllib.parse.urlencode({"data": query.replace("[timeout:300]", "[timeout:150]")}).encode("ascii")
    for attempt, wait in enumerate((30, 75, 0)):
        slow = 0
        for url in OVERPASS:
            if slow >= 2:
                break
            host, t0 = url.split("/")[2], time.time()
            try:
                req = urllib.request.Request(url, data=body, headers={"User-Agent": mf.AGENT, "Accept-Encoding": "gzip", "Content-Type": "application/x-www-form-urlencoded"})
                with urllib.request.urlopen(req, timeout=200) as r:
                    raw = r.read()
                    if r.headers.get("Content-Encoding") == "gzip":
                        raw = gzip.decompress(raw)
                text = raw.decode("utf-8", "replace")
                if not text.lstrip().startswith("{"):
                    say(f"   {label}: {host} answered with something that is not data ({text[:100].strip()!r})")
                    continue
                data = json.loads(text)
                remark = (data.get("remark") or "").lower()
                if "error" in remark or "timed out" in remark or "out of memory" in remark:
                    say(f"   {label}: {host} could not finish it; asking for it in smaller pieces")
                    return {"too_big": True}
                if not data.get("elements") and host not in TRUSTED:
                    say(f"   {label}: {host} answered with nothing; asking another to be sure")
                    continue
                say(f"   {label}: {len(data.get('elements', []))} elements from {host} in {time.time() - t0:.0f} s ({len(raw) / 1e6:.1f} MB)")
                return data
            except urllib.error.HTTPError as e:
                took = time.time() - t0
                say(f"   {label}: {host} said HTTP {e.code} after {took:.0f} s")
                if e.code == 400:
                    return None
                if e.code == 429:
                    time.sleep(15)
                slow += took > 40
            except Exception as e:  # a network error, a timeout, a TLS failure: ask the next instance
                took = time.time() - t0
                say(f"   {label}: {host} failed after {took:.0f} s ({type(e).__name__}: {str(e)[:100]})")
                slow += took > 40
        if slow:
            say(f"   {label}: this piece is too heavy for a busy instance; asking for it in four smaller pieces")
            return {"too_big": True}
        if wait:
            say(f"   {label}: no instance answered; waiting {wait} s before asking again")
            time.sleep(wait)
    return None


def fetch_osm(out_dir, rounds=8):
    """Each layer through map_fetch's own fetch_layer (pieces, a cache, every public instance in turn), for this
    script's box and layers; a layer that fails is tried again after a pause, up to `rounds` times."""
    keep = (mf.SOUTH, mf.NORTH, mf.WEST, mf.EAST, mf.LAYERS, mf.overpass)
    mf.SOUTH, mf.NORTH, mf.WEST, mf.EAST, mf.LAYERS, mf.overpass = SOUTH, NORTH, WEST, EAST, LAYERS, ask
    done = {}
    try:
        for name in LAYERS:
            for k in range(rounds):
                if mf.fetch_layer(name, out_dir):
                    done[name] = True
                    break
                if k + 1 < rounds:
                    say(f"{name}: trying again in 90 s (attempt {k + 2} of {rounds}); what has arrived is kept")
                    time.sleep(90)
            else:
                done[name] = False
    finally:
        mf.SOUTH, mf.NORTH, mf.WEST, mf.EAST, mf.LAYERS, mf.overpass = keep
    return done


def tile_of(lat, lon, z):
    """The slippy-map tile a point falls in (Web Mercator)."""
    n = 1 << z
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n)
    return max(0, min(n - 1, x)), max(0, min(n - 1, y))


def fetch_terrain(out_dir):
    """The height tiles covering the box, kept as they come (PNG pictures) in one file with an index beside it."""
    target, index = os.path.join(out_dir, f"terrain_z{ZOOM}.bin"), os.path.join(out_dir, f"terrain_z{ZOOM}.json")
    if os.path.exists(target) and os.path.exists(index):
        say(f"terrain: already here ({os.path.getsize(target) / 1e6:.1f} MB)")
        return True
    cache = os.path.join(out_dir, "cache", "terrain")
    os.makedirs(cache, exist_ok=True)
    (x0, y0), (x1, y1) = tile_of(NORTH, WEST, ZOOM), tile_of(SOUTH, EAST, ZOOM)
    want = [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]
    say(f"terrain: {len(want)} tiles at zoom {ZOOM} (columns {x0} to {x1}, rows {y0} to {y1})")
    got, t0 = 0, time.time()
    for x, y in want:
        path = os.path.join(cache, f"{ZOOM}_{x}_{y}.png")
        if os.path.exists(path) and os.path.getsize(path) > 100:
            got += 1
            continue
        ok = False
        for attempt in range(4):
            for url in TILE_URLS:
                try:
                    req = urllib.request.Request(url.format(z=ZOOM, x=x, y=y), headers={"User-Agent": mf.AGENT})
                    with urllib.request.urlopen(req, timeout=60) as r:
                        raw = r.read()
                    if raw[:8] != b"\x89PNG\r\n\x1a\n":
                        raise IOError("not a PNG picture")
                    with open(path + ".part", "wb") as f:
                        f.write(raw)
                    os.replace(path + ".part", path)
                    ok = True
                    break
                except Exception as e:
                    say(f"   terrain tile {x},{y}: {url.split('/')[2]} failed ({type(e).__name__}: {str(e)[:100]})")
            if ok:
                break
            time.sleep(5 * (attempt + 1))
        if not ok:
            say("terrain: a tile could not be fetched. Run the script again later; what it has is kept.")
            return False
        got += 1
        if got % 20 == 0 or time.time() - t0 > 10:
            t0 = time.time()
            say(f"   terrain: {got} of {len(want)} tiles")
        time.sleep(0.05)
    tiles, pos = [], 0
    with open(target + ".part", "wb") as out:
        for x, y in want:
            with open(os.path.join(cache, f"{ZOOM}_{x}_{y}.png"), "rb") as f:
                raw = f.read()
            out.write(raw)
            tiles.append([x, y, pos, len(raw)])
            pos += len(raw)
    os.replace(target + ".part", target)
    with open(index, "w", encoding="utf-8") as f:
        json.dump({"zoom": ZOOM, "x0": x0, "y0": y0, "x1": x1, "y1": y1, "tile_pixels": 256, "box": [SOUTH, WEST, NORTH, EAST],
                   "tiles": tiles, "rows": "[tile column, tile row, where its PNG picture starts in the .bin file, its length]",
                   "heights": "terrarium: metres = red * 256 + green + blue / 256 - 32768",
                   "credit": "Terrain Tiles (Mapzen/Tilezen; data from USGS 3DEP, ETOPO1 and others), https://registry.opendata.aws/terrain-tiles/"}, f, indent=1)
    say(f"terrain: {len(tiles)} tiles kept, {pos / 1e6:.1f} MB")
    return True


def _get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": mf.AGENT, "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), (r.headers.get("Content-Encoding") or "")


def fetch_vector(out_dir, name):
    """The vector map tiles of one service, kept exactly as they come, in one file with an index beside it."""
    target, index = os.path.join(out_dir, f"vector_{name}.bin"), os.path.join(out_dir, f"vector_{name}.json")
    if os.path.exists(target) and os.path.exists(index):
        say(f"{name}: already here ({os.path.getsize(target) / 1e6:.1f} MB)")
        return True
    about_url, pattern = VECTOR[name]
    about = {}
    try:
        raw, enc = _get(about_url, 30)
        about = json.loads((gzip.decompress(raw) if enc == "gzip" or raw[:2] == b"\x1f\x8b" else raw).decode("utf-8"))
        if about.get("tiles"):
            pattern = about["tiles"][0]
    except Exception as e:
        say(f"{name}: its description could not be read ({type(e).__name__}: {str(e)[:100]})")
    if not pattern or "{z}" not in pattern:
        say(f"{name}: no address pattern for its tiles; leaving it")
        return False
    cache = os.path.join(out_dir, "cache", name)
    os.makedirs(cache, exist_ok=True)
    want = []
    for z, what in VECTOR_ZOOMS:
        box = (NORTH, WEST, SOUTH, EAST) if what == "world" else (CORE[1], CORE[2], CORE[0], CORE[3])
        (x0, y0), (x1, y1) = tile_of(box[0], box[1], z), tile_of(box[2], box[3], z)
        want += [(z, x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]
    say(f"{name}: {len(want)} tiles from {pattern.split('/')[2]}")
    got, missing, t0 = 0, 0, time.time()
    for z, x, y in want:
        path = os.path.join(cache, f"{z}_{x}_{y}.bin")
        if os.path.exists(path):
            got += 1
            continue
        raw = None
        for attempt in range(4):
            try:
                raw, _enc = _get(pattern.format(z=z, x=x, y=y))
                break
            except urllib.error.HTTPError as e:
                if e.code in (204, 404):                 # a tile with nothing in it
                    raw = b""
                    break
                say(f"   {name} tile {z}/{x}/{y}: HTTP {e.code}")
            except Exception as e:
                say(f"   {name} tile {z}/{x}/{y}: {type(e).__name__}: {str(e)[:100]}")
            time.sleep(4 * (attempt + 1))
        if raw is None:
            say(f"{name}: a tile could not be fetched. Run the script again later; what it has is kept.")
            return False
        missing += not raw
        if got < 8 and missing >= 6:
            say(f"{name}: its first tiles are all empty, so the address is not right; leaving it")
            return False
        with open(path + ".part", "wb") as f:
            f.write(raw)
        os.replace(path + ".part", path)
        got += 1
        if got % 50 == 0 or time.time() - t0 > 10:
            t0 = time.time()
            say(f"   {name}: {got} of {len(want)} tiles")
        time.sleep(0.03)
    tiles, pos = [], 0
    with open(target + ".part", "wb") as out:
        for z, x, y in want:
            with open(os.path.join(cache, f"{z}_{x}_{y}.bin"), "rb") as f:
                raw = f.read()
            out.write(raw)
            tiles.append([z, x, y, pos, len(raw)])
            pos += len(raw)
    os.replace(target + ".part", target)
    with open(index, "w", encoding="utf-8") as f:
        json.dump({"service": name, "pattern": pattern, "box": [SOUTH, WEST, NORTH, EAST], "map": [CORE[0], CORE[2], CORE[1], CORE[3]], "tiles": tiles,
                   "rows": "[zoom, tile column, tile row, where the tile starts in the .bin file, its length]; a tile is a Mapbox Vector Tile, gzipped or not, as the service sent it",
                   "about": {k: about.get(k) for k in ("attribution", "vector_layers", "maxzoom", "minzoom", "name", "description", "version") if k in about},
                   "credit": "(c) OpenStreetMap contributors, Open Database License 1.0, https://www.openstreetmap.org/copyright"}, f)
    say(f"{name}: {len(tiles)} tiles kept ({missing} of them empty), {pos / 1e6:.1f} MB")
    return True


def main(argv):
    out_dir, only = os.path.join(HERE, "port_alder_world"), ""
    i = 1
    while i < len(argv):
        a = argv[i]
        if a == "--out" and i + 1 < len(argv):
            out_dir = argv[i + 1]
            i += 1
        elif a == "--only" and i + 1 < len(argv):
            only = argv[i + 1]
            i += 1
        else:
            print(__doc__)
            return 2
        i += 1
    os.makedirs(out_dir, exist_ok=True)
    mf.LOG = open(os.path.join(out_dir, "fetch_log.txt"), "a", encoding="utf-8")
    say(f"world_fetch: Python {sys.version.split()[0]} on {sys.platform}; writing to {out_dir}")
    say(f"world_fetch: the world is {SOUTH} N to {NORTH} N, {-WEST} W to {-EAST} W; the map in its middle is {CORE[0]} N to {CORE[1]} N, {-CORE[2]} W to {-CORE[3]} W")
    done = {}
    if only in ("", "terrain"):
        done["terrain"] = fetch_terrain(out_dir)
    if only in ("", "tiles"):
        ok = [fetch_vector(out_dir, name) for name in VECTOR]
        done["map tiles"] = any(ok)
    if only == "osm":
        done.update(fetch_osm(out_dir))
    with open(os.path.join(out_dir, "fetch.json"), "w", encoding="utf-8") as f:
        json.dump({"world": {"south": SOUTH, "north": NORTH, "west": WEST, "east": EAST}, "map": {"south": CORE[0], "north": CORE[1], "west": CORE[2], "east": CORE[3]},
                   "fetched": time.strftime("%Y-%m-%d %H:%M:%S"), "done": done,
                   "credits": ["(c) OpenStreetMap contributors, Open Database License 1.0, https://www.openstreetmap.org/copyright",
                               "OpenFreeMap (https://openfreemap.org, OpenMapTiles layout) and VersaTiles (https://versatiles.org, Shortbread layout)",
                               "Terrain Tiles (Mapzen/Tilezen; USGS 3DEP and others), https://registry.opendata.aws/terrain-tiles/"]}, f, indent=1)
    missing = [k for k, v in done.items() if not v]
    say("world_fetch: " + ("EVERYTHING IS HERE." if not missing else "still missing: " + ", ".join(missing) + ". Run the script again to try those."))
    say(f"world_fetch: the files are in {out_dir}")
    return 0 if not missing else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
