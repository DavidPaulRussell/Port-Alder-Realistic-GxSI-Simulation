# The real map's sources, as fetched

Fetched on 2026-11-18 by `tools/world_fetch.py` for the map (47.8442 N to 48.0342 N, 122.3250 W to 122.0425 W) and
the world three times as wide around it. `node tools/make_map.mjs data/world` makes `src/ground_data.js` from them.

| File | What | Terms |
|---|---|---|
| `vector_openfreemap.bin`, `.json` | 306 vector map tiles (zoom 12 for the world, zoom 14 for the map), exactly as served, and their index | (c) OpenStreetMap contributors, Open Database License 1.0; tiles by OpenFreeMap in the OpenMapTiles layout ((c) OpenMapTiles) |
| `terrain_z12.bin`, `.json` | 110 height tiles (zoom 12; metres = red x 256 + green + blue / 256 - 32768) and their index | Terrain Tiles (Mapzen/Tilezen; USGS 3D Elevation Program and others), https://registry.opendata.aws/terrain-tiles/ |

These files are data, not part of the program's GPL grant (see `NOTICE`).
