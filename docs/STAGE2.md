# Stage 2: the full-scale city

Status on 18 November 2026 (release 1.3.2): **step 1 of 6 done** (the engine runs at any size; 212,020 citizens
founded and audited on the invented map at sixteen times the area, street life included). The real map waits for
its sources: `tools/map_fetch.py` has not been run yet, and the loader's player (`plume-xpu-mini.html`) is not here. This note is the plan and the record of what is decided, so the
work can be picked up without rereading the conversation that led to it.

## What it is

Today's Port Alder is about 11,900 citizens on a map of 128 x 128 cells of 20 m (2.56 km on a side), standing for
Everett's 115,000 people at about one in ten. Stage 2 is every person, on the real ground:

| | Today | Stage 2 |
|---|---|---|
| Area | 2.56 km x 2.56 km, invented | 20.48 km x 20.48 km, the real place |
| Box | none | 47.845 N to 48.034 N, 122.325 W to 122.043 W: Mukilteo and Paine Field to Lake Stevens and Snohomish, Priest Point and Jetty Island to Mill Creek and Martha Lake |
| Citizens | about 11,900 (one in ten of Everett) | all 391,415 people the population raster counts in the box |
| Fields (land value, zoning, noise, access) | 128 x 128 cells of 20 m | 1,024 x 1,024 cells of 20 m |
| Shapes (buildings, streets, shore, parcels, people) | cell-aligned | coordinates to 0.1 m, from OpenStreetMap |
| Ground | flat | USGS 1 arc-second elevation |

Decided with the owner of the project:

- **All 391,000 people are full citizens**, not only Everett's 115,000. The box holds Everett, Mukilteo, the south of
  Marysville, Lake Stevens, Snohomish, Mill Creek and the unincorporated south; each is a jurisdiction of the city
  model, and the county layer shrinks to the rest of Snohomish County (about 483,000 people).
- **Metre detail is in shapes, not in a grid.** A dense 1 m grid would be 20,480 x 20,480 = 419 million cells a
  layer, which a browser cannot hold or step. Shapes placed to 0.1 m cost a few megabytes for the whole area.
- **Everything large lives in `.edhx` layer files**, each under 24 MB, the repository under 1 GB.

## The map's frame

- Centre: 47.9395 N, 122.184 W. East and north in metres from the centre (a local tangent plane: 111,194.9 m per
  degree of latitude; that times cos 47.9395° per degree of longitude). The map is the square from -10,240 m to
  +10,240 m in both; cell (0, 0) is the north-west corner, as now.
- The population cut (`city.edhx`, record `map/population.u16`) is 228 x 339 cells of 3 arc-seconds (about 93 m by
  62 m), people in hundredths. It is a little larger than the map.

## The sources, and where they stand

| Source | What for | How it arrives | Status |
|---|---|---|---|
| WorldPop R2025A v1, 2026, 100 m (CC BY 4.0) | how many people live where | `tools/pop_extract.py`, run by the owner on the raster | **in `city.edhx`** |
| OpenStreetMap (ODbL 1.0) | buildings, streets, paths, rail, shore, water, parks, land use, places, city limits | `tools/map_fetch.py`, run by the owner; writes `port_alder_map/osm_*.json.gz` | script delivered; **data not yet fetched** |
| USGS 3DEP 1 arc-second (public domain) | the ground's height | the same script; writes `terrain_1arcsec.f32` | script delivered; **data not yet fetched** |

`map_fetch.py` writes rows `[kind, id, tags, geometry]` with coordinates as integers of 1e-7 degree, the first point
of a line as it is and the rest as differences. If OpenStreetMap cannot be fetched, the fallback is a generated
street grid and buildings sized so each block holds the raster's people.

## What has to change in the engine

1. **Sizes set before the modules load.** `N = 128`, `HCAP = 8192`, `FCAP = 2048`, `PCAP = 24576`, `LCAP = 32768`
   and the world's table sizes are constants that other constants are built from (`E_F0 = HCAP`, ...). They become
   values read once from a scale object (`globalThis.PLUME_SCALE`) at import, so the one-in-ten city and the full
   city are the same code. Full scale needs about: 524,288 people, 262,144 households, 32,768 firms, 524,288 loans,
   262,144 buildings, 262,144 dwellings, 65,536 spaces.
2. **Grid arithmetic.** `& 127` and `>> 7` are written out in city.js (1), economy.js (4), housing.js (1),
   world.js (2), civic.js (2), develop.js (3), kpis.js (3), city3d.js (6), city3d_shaders.js (1). Buildings keep
   `x`, `y`, `w`, `h` in bytes; a cell index does not fit 16 bits at 1,024 x 1,024. Every field that holds a cell or
   a coordinate has to be found and widened.
3. **The world from data.** `World` invents its land today. At full scale it reads the layer files: land use and
   water per cell from OpenStreetMap, buildings and their dwellings and premises from footprints (kind from tags,
   floors from `building:levels` or height, homes per building so that each population cell's people fit), streets
   as a graph for travel, jurisdictions from city limits.
4. **Who lives there.** The founding census places households in real buildings so that each population cell holds
   the people the raster counts, with household types and incomes by tract-like area (the census still closes at
   genesis; nothing is drawn after).
5. **Speed.** A day takes about 0.25 s at 11,900 citizens and 4.6 s at 215,000 (measured, after shopping was
   indexed); about 9 s is expected at 391,000. What is left is spread thin: the daily digest and audit over every
   table, `findHome` over every dwelling, the weekly labour market over every firm for every seeker, the minds.
   The page has to step in a worker.
6. **Memory.** The tables are about 44 MB at one in ten and the process about 1.1 GB at 215,000 citizens (measured);
   about 2 GB is expected at full scale if nothing changes. The people
   table is the bulk; fields that are per-person but mostly empty have to move to side tables.
7. **State files.** A full-scale snapshot is hundreds of megabytes deflated. `tools/edhx_run.mjs` already spreads
   a state over as many files as it needs, each under 24 MB, and rewrites only the pieces that changed; snapshots
   stay in `worlds/` (not in the repository). Writing through the Python runtime is about 1.5 s per megabyte, so a
   JavaScript writer for EDHX is wanted before full-scale runs are saved often.
8. **The view.** The 3D view draws one 128 x 128 city. At full scale it needs tiles with levels of detail, real
   footprints extruded to their heights, terrain, water, and people and vehicles on real streets near the camera.
9. **The loader.** `loader/everett/` holds the loading sequence's cartridge. Its player (`plume-xpu-mini.html`) is
   to be the first thing the page shows, driven by the real load (verifying the layer files, founding the city, the
   first day) through `setProgress`, `setPhase` and `complete`, with `enter` handing over to the simulation.

## The order of work

1. **Done (1.3.1).** Scale object (`src/scale.js`) and grid arithmetic, with the one-in-ten city passing every test
   and its digests unchanged; shopping indexed by squares; the street-life law on as many XPU frames as the map
   needs; the engine founds 212,020 citizens at `n = 512` and balances its books (about 5 s a day).
2. The map builder (`tools/make_map.mjs`): OpenStreetMap and terrain into `layers/city.map-*.edhx`.
3. `World` from the map; the founding census on real buildings; jurisdictions.
4. Indexes and the worker; a full-scale founding and a first audited month.
5. The view at scale; the loader.
6. Rates at full scale against Everett's and the county's published figures.
