# Port Alder 1.3.1

A sentient, deterministic city on the Plume XPU, modelled on Everett, Washington.

Port Alder runs one day per epoch on a real calendar from Thursday 1 January 2026. About 11,900 citizens in 5,600
households (standing for Everett's 115,000 people) work, shop, rent, borrow, fall ill, seek care, apply for help,
vote, redevelop their city, have children, grow old and move away. Every person, household, business, bank and
public body keeps integer-cent double-entry books, audited after every day. The same configuration and the same
interventions give the same city, bit for bit, and the same chain of daily SHA-256 digests.

The city is the inner doll of a Matryoshka. Around it run **Pilchuck County** (Snohomish County outside Everett),
the **State of Puget** (Washington outside Snohomish County) and the **United North American States** (the
United States outside Washington): sampled households and employers that work, spend, strike, move, vote on
initiatives and set the prices, wages and interest rates the city lives with.

"Sentient" is a design word, not a claim of consciousness: every agent carries needs, a mood, a personality,
memories and expectations, updates them from what happens to it, and decides from them.

## Run it

Double-click **`Start Plume.cmd`** on Windows, or run **`./start.sh`** on Linux or macOS. It opens Port Alder in
VEC1 Design Photon's window when Photon is installed (Python 3.10 or newer), otherwise in your default browser,
served on 127.0.0.1 with cross-origin isolation so the multi-threaded XPU engine can run.

- **One file:** `dist/plume-port-alder.html` opens straight from disk (one thread).
- **Without the 3D view:** add `?view=0` to the address.
- **Headless:** `node tools/run_city.mjs 365` runs a year in Node and prints each month's measures for the city and
  its layers, the audits and the laws that ran (`--events` prints every event).
- **Through its files:** `node tools/edhx_run.mjs --days 30` runs the city out of its layer files and writes the
  result back into them (see *The layer files* below).
- **Other pages:** the XPU console (`index.html`), the Simmy replay (`simmy.html`), the live presentation
  (`show.html`) and the R-file verifier (`verify.html`).

On the page: Play, Step a day, the pace and the XPU engine (single-thread Wasm, multi-thread Wasm, WebGPU); a live
3D view (drag to orbit, scroll to zoom, click a building); the four layers side by side; the city's measures
(work, income, health, mental health, housing, prices); the registry (look up anyone by number); programs and the
ballot; redevelopment; the law book; the umbrella of variables; interventions; and the proof (genesis, today's
digest, the save). A save holds the configuration, the interventions and the digest chain, and replays to the
same digests.

The repository is https://github.com/DavidPaulRussell/Port-Alder-Realistic-GxSI-Simulation. To start one of your own:

    git init
    git config core.hooksPath tools/git-hooks      # the size gatekeeper runs before every commit
    git add -A
    git commit -m "Port Alder 1.3.1"

The repository is about ten megabytes, far under GitHub's 25 MB per file and 1 GB per repository
(`python3 tools/check_github_limits.py` checks; every tool that writes a layer file refuses to pass 24 MB).

## The umbrella: no variable is procedural

Every variable of every table (444 fields across people, households, firms, loans, buildings, homes, spaces, and
the outer layers' households, employers and places) is decided by agents, or is an aggregate or a law of their
states. Real data and real law enter only as **history** and as **binding statutes**:

- **The founding census** reads the city's people, homes, firms and their circumstances once, from real
  distributions (ACS, BLS, Washington and federal sources), by irrational rotations (law 12.42, Birkhoff's ergodic
  theorem). When genesis ends the census closes: asking it for a value after that throws.
- **Published series** (2026 CPI, the Federal Reserve's decisions) run until the agents take over (the national
  bank then sets its rate by the Taylor rule on a Kalman estimate of the economy).
- **Statutes** bind decisions: Washington's minimum wage and rent cap, the 14-day pay-or-vacate notice, the
  foreclosure timeline, tax and benefit rules (IRS, ESD, DSHS, HCA, HUD, DCYF, SSA), the senior property tax
  exemption.

Decisions that a simulation would usually draw at random are leaky integrate-and-fire charges (law 57.9): an urge
builds at the rate it should fire and fires when it is full, each starting from its founding phase. `src/variables.js`
names, for every field, who decides it and by which laws; `docs/VARIABLES.md` is the same table, and
`test/umbrella.test.mjs` checks it against the code.

## The law book

The laws come from the continuum images of *Corpus Compendium on Rails* (Russell Philip Smithson, 2026) that have
a faithful linear form: 103 laws, at least one from each of the corpus's 80 stations, implemented from their
equations and cited by station and entry (`src/laws.js`, `docs/LAWS.md`). Transcendental functions are exact
power series in `+ − × ÷`, so every platform computes the same bits. No text of the corpus is reproduced.

## Social Information Numbers

Every citizen holds a number such as `PA-0004172-K`: the issuing office (`PA` Port Alder, `PC` Pilchuck County,
`PG` State of Puget, `UN` the nation, `AB` admitted from abroad), a serial and a check letter. Numbers are issued
at the founding census, at birth or on arrival, follow their holders between the city and the outer layers, and are
never reused. Every reference to a person (partners, friends, owners, memories, designs) is by number.

## The four layers

| Layer | Modelled on | People | Sample |
|---|---|---|---|
| Port Alder | Everett | about 12,700 citizens, standing for 114,700 | every person |
| Pilchuck County | Snohomish County outside Everett | 759,100 | households and employers by place |
| State of Puget | Washington outside Snohomish County | 7,241,300 | households and employers by place |
| United North American States | the United States outside Washington | 333,800,000 | households and employers by place |

Each outer household stands for many like it. Births and deaths follow the laws' expected rates; households move
between places in Boltzmann shares of how much better a place looks (gravity, the cost of moving by age, a Bellman
valuation over their horizon); employers hire after a search, set pay by the Phillips relation, price from unit
labour cost, and face strikes settled by Nash bargaining. A household that leaves Port Alder becomes an outer
household that keeps its members' numbers, and can come back.

### The movement matrix

Who moves where is kept as a matrix: a row for every place people leave, a column for every place they go (Port
Alder, the 26 places around it and the world beyond). Where a place's movers look first is measured, not assumed:
for every pair of places, `src/movement_data.js` holds the gravity law's kernel averaged over where the two places'
people actually live, and the mean distance between them, taken from a 100 m population raster by
`tools/make_movement.mjs`. The masses are the simulation's own, month by month, so a place that grows draws more of
every other place's movers. What households then make of it (work, rents, ties, the years they look ahead) is theirs
to decide. The page shows the last twelve months of moves as the matrix and as its largest flows.

The raster itself is not in the repository. Two small tables taken from it are: the movement geography (27 by 27
values, computed) and the population of the full-scale map's area (228 by 339 cells, cut out as they are; in
`data/pop/` and in `layers/city.edhx`). Population counts: WorldPop (www.worldpop.org), R2025A v1, 2026, 3 arc-second
constrained, CC BY 4.0. `tools/pop_extract.py` cuts the tables out of the raster on your own machine.

## The layer files

Each layer of the Matryoshka is one EDHX container (`layers/*.edhx`, format EDHX/1 by Russell Philip Smithson):

| File | Holds |
|---|---|
| `world.edhx` | the law book: all 103 laws, each as the function that runs it; the constants every layer shares |
| `nation.edhx` | the nation's nine regions, federal rules by year, the series, the movement matrix's geography |
| `state.edhx` | the state's eight regions, Washington's rules by year, the state's ballot measures |
| `county.edhx` | the county's nine places and their sector mixes |
| `city.edhx` | the city's tables and variables, **the engine itself** (every module, the XPU, the Simmy replay), its configuration and founding digest, and where its people live |

Every record's SHA-512 is in its container's state, and the state's root is in the head of the file: one hash at
the top of a layer's file pins every law, rule and table the layer runs on. The layers are entangled in a chain
(city, county, state, nation, world): each holds the joint SHA-512 it shares with its neighbour.

`node tools/edhx_run.mjs --dir worlds/port-alder --days 30` runs the city **through** the files. It takes the engine
out of `city.edhx` (checking every module against the engine's index), founds the city, restores the state the last
run sealed (exactly: the digests match), lives the days, and writes the new state back as the next generation. What
a run writes is what the next run starts from. A state too large for one file is spread over `city.s01.edhx`,
`city.s02.edhx` and so on, so no file passes 24 MB. Two runs through the files end where one uninterrupted run
does (`test/edhx.test.mjs` checks it).

The files are written by the EDHX runtime they carry (`tools/edhx_pack.py` drives it; Python 3.9 or later) and read
in JavaScript by `src/edhx.js`. `node tools/make_layers.mjs` rebuilds them; a layer whose records have not changed
is left as it is. Each file carries a copy of the EDHX runtime (about 127 KB), as the format requires.

## Welfare and the ballot

Washington's programs as they stand in 2026: Basic Food (SNAP, with the ABAWD time limits), WorkFirst (TANF),
Apple Health (with the 2027 work rules), WIC, Working Connections Child Care, SSI, ABD cash, housing vouchers,
the Working Families Tax Credit and SUN Bucks. Households decide whether to apply (a charge of their reasons and the
stakes, a belief updated by what they have been through) and complete the paperwork by ability. Each August the
city places measures on the ballot (fresh food, crisis care, rent help, child care, warm homes, clinic visits, a
tax credit bonus) and its citizens vote in November; the state's voters decide initiatives.

## Layout

| Path | What |
|---|---|
| `src/city.js` | the day, in order; genesis; saves; the audit and the digest chain |
| `src/people.js`, `economy.js`, `finance.js`, `payroll.js`, `housing.js`, `welfare.js`, `health.js`, `civic.js`, `develop.js` | the city's agents and institutions |
| `src/periphery.js`, `nation.js` | the outer layers and the national economy |
| `src/laws.js`, `tables.js` | the law book and its exact tables |
| `src/registry.js` | Social Information Numbers |
| `src/kpis.js` | the measures |
| `src/variables.js` | the umbrella of variables |
| `src/scale.js` | the size of the city (the one-in-ten city, or any other; see `docs/STAGE2.md`) |
| `src/movement.js`, `movement_data.js` | the movement matrix and its measured geography |
| `src/snapshot.js` | an exact snapshot of a running city, and its restoration |
| `src/edhx.js` | EDHX/1 in JavaScript: pages, frames, records, SHA-512 |
| `layers/` | the five layer files |
| `loader/everett/` | the loading sequence's cartridge and its sources |
| `tools/make_layers.mjs`, `edhx_pack.py`, `edhx_run.mjs` | build the layer files; drive the EDHX runtime; run the city through its files |
| `tools/pop_extract.py`, `make_movement.mjs`, `map_fetch.py` | population tables from a raster; the movement geography; the full-scale map's sources (OpenStreetMap, USGS elevation) |
| `src/city3d.js`, `city3d_shaders.js`, `motion.js`, `atmos.js`, `gl.js` | the live 3D view |
| `src/city.html` | the page; `tools/bundle.py` builds it into `web/city.html` and `dist/plume-port-alder.html` |
| `test/` | `city.test.mjs` (replay, audit, the movement matrix, snapshots), `umbrella.test.mjs` (the umbrella), `edhx.test.mjs` (the layer files), and the XPU, R-file and Simmy tests |
| `docs/` | `CITY.md` (how the city works), `LAWS.md`, `VARIABLES.md` |

Build: `./build.sh` (clang for the Wasm XPU, Python 3.10+ for the bundle; Node and Playwright only for the
developer checks). After a change to `src/`, `node tools/make_layers.mjs` puts the new engine into `layers/city.edhx`.
Tests: `node test/city.test.mjs`, `node test/umbrella.test.mjs`, `node test/edhx.test.mjs`, `node test/scale.test.mjs`, `node test/xpu.test.mjs`,
`node test/simmy.test.mjs`, `node test/russ.test.mjs`. (The XPU and R-file tests compare against NumPy references,
which `python3 test/ref_numpy.py` writes into `test/`; the tests run it themselves when the references are missing.)

## Licence

Copyright (C) 2026 Russell Philip Smithson. Licensed under the GNU General Public License, version 3 only
(`LICENSE`); `COPYRIGHT` says what the copyright covers and `NOTICE` lists what is under other terms. Keep all three
with any copy.

*Corpus Compendium on Rails* is a separate work of the same author under its own licence; Port Alder cites its
entries and implements equations only. The EDHX format and the runtime inside each `.edhx` file (EDHX 1.0.0) are
also a separate work of his, included unmodified so the files can be read and written.

Data: population counts from WorldPop (www.worldpop.org), R2025A v1, CC BY 4.0 (derived tables only). The
full-scale map's sources, fetched by `tools/map_fetch.py` on your own machine, are © OpenStreetMap contributors
(Open Database License 1.0; map data made from them stays under that licence) and the U.S. Geological Survey's 3D
Elevation Program (public domain).
