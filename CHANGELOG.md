# Changelog

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
