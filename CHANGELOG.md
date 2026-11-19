# Changelog

## 1.5.0 — 2026-11-18 (travelling, traffic and the cameras)

This release is the view and the page. The simulation's rules are unchanged, and the one-in-ten city is the same
digest for digest. The city on the real map is founded a little differently, because its divided roads are now two
lines where they were one (see *Changed*).

### Added
- **Travelling.** Until now the view could only turn about one spot unless you knew to right-drag. Now a drag moves
  across the ground, right-drag turns and tilts, the wheel zooms toward the pointer, W A S D and the arrows travel,
  a double-click flies to the place under the pointer, a *go to* menu jumps to thirteen named places, and *street
  level* puts the camera on the ground to walk (Shift: at a car's speed; a double-click walks to the place). On a
  touch screen two fingers zoom and turn. *Overview* now returns over the whole map.
- **Passing traffic and people on the pavements.** Every lane of every real road near the camera carries vehicles
  and every street its walkers, as thickly as the day's rhythm (taken from the citizens' own shifts) says. A lane
  keeps its own vehicles and comes to a new speed gently; stop-and-go traffic is a real queue (a vehicle every nine
  metres) that closes up and opens out in waves.
- **Traffic cameras.** The 94 public WSDOT cameras on the map, with their live pictures; each stretch of freeway and
  main road follows the level of the nearest camera on its own kind of road, set by hand from the picture or read
  from WSDOT's flow sensors with the user's own free access code. Sensors are matched to cameras by road and
  milepost, and each carriageway follows the reading for its own direction of travel.
  `tools/traffic_fetch.py`, `data/world/traffic_cameras.json`.
- **Divided roads as two carriageways.** One-way roads keep their direction in the map data (2,588 of 3,783 lines);
  each carriageway is drawn with its own lanes, and traffic runs the right way on it.

### Changed
- **The real map's roads, and so its city.** A divided road is now kept as its two carriageways (3,783 lines where
  there were 2,973), which moves a few road cells and so a few homes: `everett` founds 98,100 citizens (98,165 in
  1.4.0) and 1,692 firms (1,695); `quick` 39,162 citizens (39,093). A save made on the real map in 1.4.0 does not
  replay in 1.5.0 (its founding digest differs); saves of the one-in-ten city do.

### Fixed
- Vehicles drove on the left of their street. They keep to the right.
- Walkers beside a real road walked on its surface. A walker heading along a road keeps beyond its edge (beyond both
  carriageways of a divided road), and people standing keep off it; someone crossing still crosses.
- *Overview* aimed at the invented town's centre on every map.

### Hardened
- The page shows a camera's picture only from WSDOT's own picture host (`images.wsdot.wa.gov`), checked when the map
  is built and again in the page; titles are plain text. The picture is asked for without a referrer.
- The access code is never taken from what a browser may have filled into the field: only a code the page stored
  itself is used without being asked, a code must look like one before anything is sent, and *forget* removes it.
  Readings are read field by field as plain data; ones older than five minutes are let go.
- The view's keys leave the browser's own shortcuts alone (Ctrl, Alt, Meta), a cancelled pointer ends a drag, keys
  are released when the window loses focus, and a flight or a level that is not a number is ignored.
- `tools/traffic_fetch.py` reads https only, refuses a reply over 32 MB, and probes a picture only on WSDOT's host.

### Known
- Counting vehicles in the camera pictures themselves is not done: the picture server does not allow a page to read
  pixels. It would need the pictures fetched by the launcher and a vision model run on them.
- The passing vehicles are not the simulation's citizens; a citizen's own trip is still drawn only for one citizen in
  thirteen on the large map.

## 1.4.0 — 2026-11-18 (the real place)

The one-in-ten invented city is unchanged, digest for digest (60 days: `6146b22c56149fb0…`). It is still the
engine's default; the page now opens on the real map.

### Added
- **The city stands on real ground.** The map is the 21 km around Everett that the population cut covers, and each
  cell houses the citizens the cut counts there. Its ground comes from OpenStreetMap (as vector map tiles) and its
  heights from the Terrain Tiles: the Sound and its islands, the Snohomish River, its sloughs and delta, Lake
  Stevens and the smaller lakes at their own levels, wetland, forest, farmland, works, shops, the port's piers and
  Paine Field with its runways. Two sizes: `everett` (512 cells of 41 m, 98,165 citizens, one for every four
  people; true to scale) and `quick` (256 cells of 82 m, 39,093 citizens, one in ten; these two figures were given as 98,064 and
  39,235 when 1.4.0 was released, from a run before its last map data: corrected in 1.5.0).
- **Real roads.** Interstate 5, US 2 and its trestle, routes 9, 92, 99, 204, 525, 526, 527 and 529 and the roads
  between neighbourhoods run where they really run (2,973 lines, 394 of them bridges, 338 ramps). The simulation's
  street cells follow them; the 3D view draws them from their centre lines as ribbons: freeways with two
  carriageways, a median and lane lines, long bridges as decks above the water, vehicles driving along the lines.
- **A world around the map.** The view draws three map-widths of real ground (63 km) around the map: its shores,
  towns, forests, farmland, roads and the Cascade foothills up to Mount Pilchuck. The camera stays over the map and
  the haze thins as it rises, so the edge of the world is never in sight.
- **The map menu** on the page (`?map=quick`, `?map=invented`), and a credit line for the map's sources.
- `tools/world_fetch.py` (fetches the vector tiles and the heights; the Overpass route is kept as `--only osm`),
  `tools/make_map.mjs` (makes `src/ground_data.js`), `data/world/` (the fetched tiles), `test/map.test.mjs`.

### Changed
- On the real map the outer layers count the map's 391,412 people as the city and the rest as the county.
- A simulated day can pause between its parts so the page keeps drawing (`city.breathe`); nothing in the day
  depends on it, and the digests are the same with and without.
- The 3D view works at any map size; trees are drawn in groups by distance; a day's traffic is planned place by
  place (one search of the streets for every trip to the same place).

### Known
- Side streets are still laid on a lattice between the real roads; every real street, and the real building
  outlines, are for the full-scale city (the tiles already hold them: 31,906 smaller roads).
- The county's places are scaled down as a whole on the real map, not re-cut place by place.
- The loading console is not yet the page's first screen: its player (`plume-xpu-mini.html`) has not arrived.

## 1.3.2 — 2026-11-18 (street life on a larger map)

The one-in-ten city is unchanged, digest for digest.

### Fixed
- **Street life covered only a corner of a larger map.** The street-life law runs on the XPU's frame of 128 by 128
  cells, and the city wrote its cells into that one frame whatever the map's size, so beyond the first rows there
  was no street life at all. A larger map is now as many frames side by side as it needs (16 at 512 cells, 64 at
  1,024), each run through the XPU in turn. Street life still wraps at the edge of each frame, as it does at the
  edge of the one-in-ten map.
- The invented map's main streets stopped at 128 cells; they now run every 24 cells across a map of any size.
- The map's side must be at least 128 cells (the XPU's frame).

At sixteen times the area the invented city is now 212,020 citizens in 96,343 households with 2,940 businesses; it
founds at 4.6% unemployment and 8.2% poverty, and a day takes about 5 s.

## 1.3.1 — 2026-11-18 (the engine at any size)

The first step of the full-scale city (`docs/STAGE2.md`). The one-in-ten city is unchanged: the same digests, day
for day.

### Added
- **`src/scale.js`: the size of the city is set before its modules load.** The map's side and every table's
  capacity come from one object (`PLUME_SCALE`, a name or sizes as JSON; unset, the one-in-ten city). The cell
  arithmetic that was written out for 128 cells (`& 127`, `>> 7`) now follows the map's side, and a building's
  column and row take two bytes on a map wider than 256 cells.
- **The engine founds and runs a much larger city.** On the invented map at sixteen times the area it founds
  214,951 citizens in 97,290 households with 2,956 businesses, and its books balance every day
  (`PLUME_SCALE='{"n":512,...}' node tools/run_city.mjs 5`). A day takes about 4.6 s there, against 0.25 s for the
  one-in-ten city. `test/scale.test.mjs` founds four times the map (49,464 citizens) and checks its audit.
- **Shopping looks near home first.** A household's choice among a trade's businesses was a pass over every one of
  them. They are now kept in squares of eight cells and blocks of eight squares; a household looks at the squares
  around its home, then passes over every block and square in which nothing could beat its second choice. The
  choice is exactly what looking at every business gives (the test compares the two, digest for digest). What does
  not change during the day's shopping (street life at the door, the business's name, its prices against its
  trade's) is worked out once a day, not once a comparison.
- The tables' rows are walked by a plain iterator, not a generator.
- A snapshot records the size of the city it was taken from, and is refused by a city of another size.
- **`COPYRIGHT`, `LICENSE` and `NOTICE`.** Copyright (C) 2026 Russell Philip Smithson; the GNU General Public
  License, version 3 only, in full; and what in the repository is under other terms (WorldPop's CC BY 4.0 tables,
  the EDHX runtime inside the `.edhx` files, the Corpus Compendium the laws are cited from). The repository is now
  https://github.com/DavidPaulRussell/Port-Alder-Realistic-GxSI-Simulation.
- The EDHX format is credited to its author, Russell Philip Smithson (1.3.0 named him by his GitHub handle).

### Not yet
- The full-scale map itself (real streets, buildings, water and ground; all 391,000 people) waits for the
  OpenStreetMap and elevation files that `tools/map_fetch.py` writes.
- The 3D view and the page still serve the one-in-ten city only.

## 1.3.0 — 2026-11-18 (the movement matrix, the layer files, snapshots)

### Fixed
- **Nobody ever chose to leave.** The rate at which households leave the city is calibrated once, at the founding,
  from their own odds. Thirty-two founding tenants had no income on record on the first Thursday, which made their
  rent burden a division by nearly zero and their odds infinite, so the calibrated rate came out as zero. In 1.2.0
  the only households that left were those forced out. A burden is now at most all of a household's income, and the
  calibration leaves out what is not finite. Households now leave at about 5.5% a year, by their own decision.
- **City seekers were never hired beyond the city.** An outer employer took its ranked applicants in order and
  stopped at the first who stood for more households than it had openings, so a citizen of Port Alder, who stands
  for about ten, was never reached. Lighter applicants are now considered. A city seeker's search beyond the city
  fills at the commuting zone's rate less the rate the city's own openings already give (a city seeker is a county
  resident too).
- **Arrivals all began unemployed.** An earner who held a job where they came from, and cannot keep it, takes the
  best opening for their occupation on arrival, if there is one.
- **Closures came in one wave each spring.** An owner's reckoning of a losing business restarted every January and
  waited for April, so every chronically losing business closed in the same month. The owner now reckons over the
  last twelve months (this year so far, and last year's results for the part of the year not yet lived).
- The city's job-finding rate is the outer layers' (0.4 a month at one opening per seeker).

A three-year run (1,095 days, seed 20261117, digest `4728797f94327ae1…`): the books balance on every day. City
unemployment runs from 3.7% to 7.0% (3.7% to 5.2% in the second and third years, when the county's is 2.9% to
4.1%); 818 households leave and 719 arrive; 177 evictions; 225 businesses from 210; poverty 8.7% falling to 5.4%;
8.7% to 11.4% uninsured; vacancy 3.9% rising to 6.6%.

### Added
- **The movement matrix** (`src/movement.js`). Moves between Port Alder, the 26 places around it and the world
  beyond are counted origin by destination, month by month, and shown on the page. Where a place's movers look first
  follows a prior measured from where people actually live: the gravity law's kernel (law 75.41) averaged over both
  places' populations, and the mean distance between them, from a 100 m population raster (WorldPop R2025A v1, CC BY
  4.0; `tools/make_movement.mjs`). The masses are the simulation's own populations, refreshed every month. A
  household now knows every place of the nation, not only its own layer's; a place in the news comes to mind half
  again as readily.
- **Exact snapshots** (`src/snapshot.js`). Everything a running city knows that is not in its code, as a tree and a
  list of tables; a city restored from one lives on to the same digests and the same state, byte for byte
  (`test/city.test.mjs`). Timings are left out; they are not state.
- **The layer files** (`layers/*.edhx`): one EDHX container per layer of the Matryoshka, holding the law book as
  the functions that run, the rules by year, the places, the movement geography, the city's tables and variables,
  the engine itself, and where the city's people live. `tools/make_layers.mjs` builds them with the EDHX runtime
  (`tools/edhx_pack.py`), and `src/edhx.js` reads them: pages (Reed-Solomon over GF(65537)), frames, the state
  root, records, SHA-512 throughout.
- **Running through the files** (`tools/edhx_run.mjs`): the engine is taken out of `city.edhx` and checked, the
  state the last run sealed is restored exactly, the days are lived, and the new state is written back as the next
  generation, spread over as many files as it needs so that none passes 24 MB. What a run writes is what the next
  run starts from.
- `tools/map_fetch.py`: fetches the full-scale map's sources on your own machine (OpenStreetMap through Overpass;
  USGS 1 arc-second elevation) and cuts them down to small files. `tools/pop_extract.py` gained nothing new; the
  Everett cut it makes is now in `city.edhx`.
- `loader/everett/`: the loading sequence's cartridge and its sources (not yet wired to the page: its player,
  `plume-xpu-mini.html`, is not in the kit).

### Still wrong, or not yet done
- Poverty drifts down (8.7% to 5.4% over three years; Everett's is 12.9%), and vacancy drifts up (3.9% to 6.6%).
- The first year still sheds about a tenth of the founding businesses (the founding does not size a business to
  its market), which is most of why city unemployment peaks at 7.0% in 2026.
- Where the city's leavers go (about a quarter to the county, two thirds to the rest of the state) has not been
  checked against the Census Bureau's county-to-county flows.
- The full-scale city (all 391,000 people of the map's area, on real streets) is not built yet; this release
  carries its groundwork (snapshots, layer files, the population cut, the map fetcher).

## 1.2.0 — 2026-11-18 (the rates: evictions, migration, poverty, coverage, businesses)

A three-year run (1,095 days, seed 20261117) now ends with 138 evictions (it was about 750), 221 businesses from 210
(it was 226 falling to 166), 10% uninsured (it was 15–19%), poverty near 6–9% (it was 2–4%; Everett's is 12.9%),
vacancy between 3% and 8% (it was 13%) and the books balanced on every day.

### Fixed
- **Evictions that never ended.** A household that left or died keeps its slot until its estate is settled. Such a
  slot still carried its notice and its arrears, so it was "evicted" again every day, took a cheap empty home and was
  evicted from that too. A tenancy now ends with the household (`dissolve`), and the daily pass skips slots with no
  one in them. The count of households is of those with members.
- **Rents far above what the poorest tenants paid.** The founding census set a tenant's rent to what they could pay
  but left them in a home whose market rent was up to two and a half times that, and landlords closed the gap at the
  10% cap every year. The census now finds renters in homes they can afford (the dearest homes hold the highest
  incomes), and reads a home let well under the market as income-restricted (the housing authority's or a
  tax-credit building's), whose rent stays what it is.
- **Homes that stood empty for good.** When a property company closed, its buildings passed to out-of-town owners
  and were never offered for rent again; they are now let like any others.
- **Property companies that could not pay.** A building's value was its envelope's floor area, not the homes and
  premises in it, so property tax and interest came to more than the rents. Values now follow what is built inside;
  rents follow the yields of houses, townhouses and flats; a property company's founding mortgage is what its rents
  can carry (debt service covered 1.25 times).
- **The outer layers' labour market**: separations (1.1% of the employed a month), a search that takes time
  (matching by the square root of openings per seeker), reservation wages that fall as a search lengthens,
  openings measured over the commuting zone, a founding unemployment rate that matches each layer's published one,
  pay and prices that move together, and a national bank whose rule is anchored on its own record.

### Added
- **The court's part in an eviction (RCW 59.18.410(3))**: partial rent payments, a ninety-day payment plan and stay
  of the writ for a tenant with fewer than three notices in a year, counsel for the indigent (RCW 59.18.640), and
  the Landlord Mitigation Program paying the judgment for a tenant the court finds low-income, repaid to the state
  (RCW 43.31.605(1)(c)).
- **Households that form and part**: unions at the rates of each age, grown children leaving a parent's home, couples
  separating; a five-day rota for staff of employers open all week.
- **A census closer to Everett's** (ACS 2019–2023 as history): households by type, ages, labour-force participation
  by age, Social Security from 62, pensions, non-working single adults on Social Security Disability or on support
  from family or a former partner, about 1.8 children in a family with children, births at Washington's rate
  (51.5 per 1,000 women aged 15–44).
- **Health coverage**: Cascade Care plans with the 2026 premium tax credit, owners deciding each December whether to
  offer a plan, prescriptions filled and refilled.
- **Budgets by Engel's law**: what is left after the home, food, light, the health plan and the car sets how often a
  household goes out and shops; the food plan (thrifty, moderate, liberal) follows its means.
- **Migration by degrees**: every household, inside the city or beyond it, moves by the same Boltzmann odds (law
  27.4) of each place it knows against staying, at its age's readiness to move (law 75.44); a household that would
  have to find work in the new place weighs its unemployment; a commuter who moves within reach keeps the job. The
  founding rates (5.5% a year out, as many in) are read once as history.
- Owners close a business that keeps losing money (a charge of its losses), and open one only in a trade that keeps
  a tenth of what it takes in. City workers quit or are let go at the rate the CPS flows show, and a search for work
  takes time in the city as beyond it.
- `tools/pop_extract.py` cuts small tables out of a WorldPop population GeoTIFF (the Everett area, Washington, the
  country) for the movement matrix and the full-scale map; the TIFF itself never enters the repository.

### Still wrong
- Poverty runs 6–9% against Everett's 12.9%, and drifts down as the poorest households leave.
- Foreclosures run near 1% of owners a year in the second and third years, several times the real rate.
- Pay-or-vacate notices are frequent (about a thousand a year at this scale): tenants who are a little short each
  month are served again and again.

## 1.1.0 — 2026-11-17 (the umbrella, the law book, the registry and the four layers)

### Added
- **No variable is procedural.** Every field of every table is decided by agents or is an aggregate or a law of
  their states. `src/variables.js` names the deciders and laws of all 444 fields; `test/umbrella.test.mjs` checks
  it against the code, and checks that nothing draws a random number, reads a clock into the state or hashes a value
  into being, and that the founding census refuses to answer once genesis ends.
  - Chance draws became leaky integrate-and-fire charges (law 57.9) that start from their founding phase (urges,
    applications, home buying, leaving the city), so no two agents begin in step.
  - The founding census reads the city once by irrational rotations (law 12.42): disability by age, Social Security
    Disability Insurance for disabled single adults, a single adult's household on its own means.
- **The law book** (`src/laws.js`, `docs/LAWS.md`): 103 laws from the continuum images of *Corpus Compendium on
  Rails* that have a faithful linear form, at least one from each of its 80 stations, from their equations alone.
  Transcendental functions are exact power series, so every platform computes the same bits.
- **Social Information Numbers** (`src/registry.js`): issued at the founding, at birth or on arrival, never reused,
  carried between the city and the outer layers; every reference to a person is by number.
- **The Matryoshka**: Pilchuck County, the State of Puget and the United North American States as sampled
  households and employers who work, spend, move, strike and vote (`src/periphery.js`), a national bank that sets
  its rate by the Taylor rule on a Kalman estimate once the published path ends, news that travels at a finite
  speed with Lamport clocks.
- **Health and mental health** (`src/health.js`): coverage, care sought and forgone, waits by Erlang C,
  counselling, crises, contagion through the day's contacts, vaccination, disability following the body.
- **The measures** (`src/kpis.js`): work, income, poverty, Gini, segregation, programs, health, mental health,
  housing, the city's fabric, mood, business, transit, safety, prices, elections; the same for each layer.
- **The page** (`web/city.html`, `dist/plume-port-alder.html`): the live 3D city, the four layers, the measures over
  time, the registry, a building's card, programs and the ballot, redevelopment, the law book, the umbrella,
  interventions, the proof and the save. `?view=0` runs it without the 3D view.
- `tools/run_city.mjs` runs the city headless and reports each month; `tools/make_docs.mjs` writes `docs/LAWS.md` and
  `docs/VARIABLES.md`; `test/city.test.mjs` checks replay and the daily audit.

### Changed
- **Rent and eviction follow Washington law.** A voucher holder pays their share and HUD pays the landlord the rest;
  rent a tenant cannot pay is owed; a landlord serves the 14-day pay-or-vacate notice when its patience runs out
  (RCW 59.12.030); paying everything owed before the writ ends it (RCW 59.18.410); a friend may help with the rent.
- **Foreclosure follows the federal and state timeline** (no referral before 120 days, a trustee's sale about eight
  months in), and an owner with equity decides to sell first; at closing the mortgage is paid from the price.
- **Senior Citizens and People with Disabilities Exemption** (RCW 84.36.381) at Snohomish County's 2026 and 2027
  thresholds.
- **Household income** is refreshed every month from the members' states (it was fixed at the founding).
- **Spending puts necessities first**: discretionary spending comes from what is left after the home and the food;
  cash is set aside for the property tax due, rent owed and the next mortgage payment.
- **Working Connections Child Care** now pays providers, and families pay their monthly copayment; applying for a
  program weighs the stakes against income.
- **Asking rents** start from the city's median rent and fall the longer a home sits empty (the cautious owner cuts
  more); arrivals from the county keep their jobs and commute.
- **Exporters** have their own customers beyond the city at the nation's demand and a constant price elasticity
  (law 69.7); the hospital serves the county; staff productivity is reckoned per open day; owners short of cash
  bring staff down before payroll fails; owners raise prices when the year's books lose money.
- **Shopping** spreads custom by taste (people favour businesses whose owners are like them), with reputation capped.
- **The outer economy** reads demand in volume against the founding, smoothed; hiring takes a search; prices follow
  unit labour cost; spending answers the interest rate.
- **Fertility** keeps Washington's age-specific rates at the founding while circumstances decide who; the founding
  city is older (Everett is about 12% aged 65 and over).
- A week's company is found from lists of each building's residents and each employer's staff (a Wednesday took
  seven seconds; it now takes a fraction of one).
- The 3D view: the bay rises and falls with the tide (five constituents), street, window and bay lights are a 3000 K
  blackbody, buildings shrink as they come down and rise under scaffold as they go up, the view rebuilds when the
  city's fabric changes, and the shadow taps no longer sit in a loop (Direct3D's compiler under ANGLE).

## 1.0.0 — 2026-11-17

- Port Alder: a deterministic city of agents with integer-cent double-entry books, US and Washington 2026 law,
  citizen-designed redevelopment, a digest chain, and a 3D view, on the Plume XPU.
