// The Matryoshka around Port Alder. Pilchuck County (modeled on Snohomish County outside Everett), the State of
// Puget (Washington outside Snohomish County), the United North American States (the United States outside
// Washington) and, beyond them, the world's airlines and would-be migrants. They are unseen but peopled: each
// place has firms run by owners with temperaments, landlords, builders and a sample of sentient households (the
// same traits, needs, mood, memories, expectations, Simmy rails trust, program take-up and votes as the city's
// citizens, without streets).
//
// The rule here: no variable is procedural. Every quantity is a state of a sentient agent, an aggregate of such
// states, or the outcome of an agent's decision taken from its own traits, needs, memories, expectations and
// trust. There are no dice and no exogenous series: matching, layoffs, strikes, births, moves and take-up are
// deterministic choices. Real data (2026 law, the published CPI and energy prices through October 2026, the
// Federal Reserve's decisions through October 28, 2026, the census counts) is history the agents start from.
// SPDX-License-Identifier: GPL-3.0-only
import { CPI_2026, FOMC_LAST_KNOWN, meetingDays, rentCap } from "./rules.js";
import { O as OC } from "./citydata.js";
import { AC, K, E_H0, E_ROW } from "./books.js";
import { sat, Slots, TRUST_SPEC, priorTrust, tickTrust, F_RUNNING, admitE1 } from "./core.js";
import { lawUse, lif, smooth, census, censusBell, breeder, boltzmann, rogersCastro, nash, phillips, taylor, okun, kalman, softmax, urbanScale, spectral2, contract, leslie, netMigrationRate, causal, lamport, expectation, gini, functorial, ln, ex, mortality, MORTALITY, asfr, cox, bellman, fromLogit } from "./laws.js";
import { issue, relocate, retire as retireSin } from "./registry.js";
import { members, ageYears, addMemory, M, trait, newHousehold, newPerson, removeFromHousehold, T_O, T_C, T_E, T_A, T_N, T_RISK, T_THRIFT, T_CIVIC } from "./people.js";
import { findHome, moveInto, leaveCity } from "./housing.js";
import { newMovement, movePrior, countMove, rollMovement, moveKm, moveUnit, topMoves, movedLastYear, MOVE_UNITS, M_CITY, M_ABROAD } from "./movement.js";
import { SCALE } from "./scale.js";
import { GROUND } from "./ground_data.js";

export const PERIPHERY_VERSION = "1.3.0";
export const PERIPHERY_SOURCES = {
  populationWA: "https://ofm.wa.gov/pop/april1/",
  populationUS: "https://www.census.gov/newsroom/press-releases/2026/population-growth-slows.html",
  unemploymentWA: "https://esd.wa.gov/jobs-and-training/labor-market-information/reports-and-research/labor-market-county-profiles",
  unemploymentUS: "https://www.bls.gov/news.release/empsit.nr0.htm",
  incomeWA: "https://ofm.wa.gov/data-research/economy/median-household-income-estimates",
  incomeUS: "https://www.census.gov/library/publications/income-poverty.html",
  everett: "https://datausa.io/profile/geo/everett-wa",
  everettMinimumWage: "https://lni.wa.gov/workers-rights/wages/minimum-wage/local-minimum-wage-rates",
};
// the layers: what each is modeled on, its people (OFM April 1, 2025; Census July 1, 2025) and the starting targets
export const LAYERS = [
  { key: "city", name: "Port Alder", basis: "Everett, Washington", pop: 114700 },
  { key: "county", name: "Pilchuck County", basis: "Snohomish County, Washington, outside Everett", pop: 759100, sample: 2400, income: 11800000, unemp: 490, edu: [70, 260, 310, 240, 120], own: 700, size: 265 },
  { key: "state", name: "State of Puget", basis: "Washington State outside Snohomish County", pop: 7241300, sample: 3000, income: 9700000, unemp: 430, edu: [80, 230, 300, 250, 140], own: 630, size: 250 },
  { key: "nation", name: "United North American States", basis: "the United States outside Washington", pop: 333800000, sample: 3600, income: 8746000, unemp: 410, edu: [100, 260, 280, 230, 130], own: 650, size: 250 },
  { key: "world", name: "The world", basis: "airlines and would-be migrants beyond the nation", pop: 0, sample: 300, income: 2400000, unemp: 600, edu: [200, 300, 220, 180, 100], own: 500, size: 300 },
];
export const SECTORS_OUT = ["aerospace", "manufacturing", "construction", "retail", "food and lodging", "health care", "education", "government", "professional and tech", "finance and real estate", "transport and logistics", "other services", "energy", "airline"];
const NS = 14;
const BASE_WAGE = [4800, 3000, 3300, 1800, 1600, 3000, 2900, 3300, 4600, 3900, 2700, 2200, 4200, 3600];      // national median cents an hour (illustrative)
const UNION = [800, 120, 130, 40, 20, 120, 350, 330, 20, 20, 150, 30, 150, 450];                            // union share, thousandths
const SPEND = [0, 100, 40, 220, 120, 140, 30, 0, 50, 80, 50, 120, 50, 0];                                    // household spending by sector, thousandths
const TRADED = [true, true, false, false, false, false, false, false, true, true, true, false, true, false];
export const MIX = {
  aero: [300, 80, 60, 90, 80, 90, 60, 90, 60, 30, 40, 20, 0, 0], suburb: [30, 60, 90, 120, 100, 140, 80, 110, 110, 50, 60, 50, 0, 0], metro: [20, 50, 60, 90, 90, 120, 70, 120, 230, 70, 50, 30, 0, 0],
  port: [20, 80, 80, 110, 90, 140, 70, 140, 80, 50, 100, 40, 0, 0], rural: [5, 110, 80, 110, 90, 130, 80, 150, 50, 40, 70, 85, 0, 0], nation: [5, 85, 60, 100, 95, 145, 80, 140, 125, 60, 50, 40, 15, 0],
  world: [0, 200, 80, 120, 100, 80, 60, 100, 60, 40, 60, 80, 0, 20],
};
// places: [layer, name, modeled on, people, sector mix, wage x1000, median rent (cents), median home (cents), minimum wage (cents), Medicaid expansion x1000]
export const PLACES = [
  [1, "Kestrel Field", "Mukilteo and the Paine Field aerospace district", 60000, "aero", 1250, 230000, 82000000, 1713, 1000],
  [1, "Marys Landing", "Marysville", 75000, "suburb", 1080, 210000, 62000000, 1713, 1000],
  [1, "Lyndale", "Lynnwood", 45000, "suburb", 1080, 225000, 70000000, 1713, 1000],
  [1, "Edgewater", "Edmonds", 44000, "suburb", 1150, 240000, 95000000, 1713, 1000],
  [1, "Mill Run", "Mill Creek and north Bothell", 60000, "suburb", 1200, 250000, 98000000, 1713, 1000],
  [1, "Lake Severn", "Lake Stevens", 42000, "suburb", 1100, 220000, 70000000, 1713, 1000],
  [1, "Riverbend", "Snohomish and Monroe", 32000, "rural", 1050, 200000, 68000000, 1713, 1000],
  [1, "North Fork", "Arlington, Granite Falls, Stanwood and the north and east", 70000, "rural", 1000, 190000, 60000000, 1713, 1000],
  [1, "South Pilchuck", "the unincorporated south of the county", 331100, "suburb", 1150, 235000, 80000000, 1713, 1000],
  [2, "Duwamish", "King County", 2390000, "metro", 1350, 245000, 98000000, 2000, 1000],
  [2, "Tahoma", "Pierce County", 950000, "port", 1080, 205000, 58000000, 1713, 1000],
  [2, "Kitsap Shore", "Kitsap and the Olympic Peninsula", 450000, "port", 1020, 195000, 56000000, 1713, 1000],
  [2, "Capital", "Thurston and the southwest coast", 520000, "rural", 1000, 185000, 52000000, 1713, 1000],
  [2, "Columbia", "Clark and the Columbia Gorge", 650000, "suburb", 1040, 195000, 56000000, 1713, 1000],
  [2, "Salish North", "Whatcom, Skagit and the islands", 470000, "rural", 1000, 190000, 60000000, 1713, 1000],
  [2, "Central Basin", "Yakima, the Tri-Cities and central Washington", 1000000, "rural", 900, 150000, 40000000, 1713, 1000],
  [2, "Inland", "Spokane and eastern Washington", 811300, "rural", 920, 150000, 42000000, 1713, 1000],
  [3, "Northeast", "New England", 15500000, "nation", 1150, 165000, 52000000, 1550, 1000],
  [3, "Mid-Atlantic", "New York, New Jersey and Pennsylvania", 42300000, "nation", 1120, 160000, 45000000, 1400, 1000],
  [3, "Great Lakes", "the East North Central states", 47800000, "nation", 970, 120000, 28000000, 1150, 900],
  [3, "Plains", "the West North Central states", 22000000, "nation", 930, 110000, 27000000, 1050, 850],
  [3, "Southeast", "the South Atlantic states", 70000000, "nation", 920, 145000, 36000000, 1000, 450],
  [3, "Heartland South", "the East South Central states", 19900000, "nation", 850, 105000, 25000000, 725, 250],
  [3, "South Central", "the West South Central states", 43500000, "nation", 950, 125000, 30000000, 725, 250],
  [3, "Mountain West", "the Mountain states", 26900000, "nation", 980, 145000, 46000000, 1200, 900],
  [3, "Pacific", "California, Oregon, Alaska and Hawaii", 45900000, "nation", 1120, 210000, 78000000, 1650, 1000],
  [4, "Abroad", "the world beyond the nation", 0, "world", 450, 60000, 15000000, 300, 0],
];
// On the real map (scale.js) the city is the whole of the map's ground, not Everett alone: its people are the
// population cut's, and the county is what is left of the two together, each of its places smaller in proportion.
// (Which places the map takes in, place by place, is still to be cut: docs/STAGE2.md.)
if (SCALE.map) {
  const both = LAYERS[0].pop + LAYERS[1].pop, mine = GROUND.pop.people, k = (both - mine) / LAYERS[1].pop;
  LAYERS[0].pop = mine; LAYERS[0].basis = "Everett, Washington, and the towns around it that the map takes in"; LAYERS[1].pop = both - mine; LAYERS[1].basis = "Snohomish County, Washington, outside the map";
  for (const p of PLACES) if (p[0] === 1) p[3] = Math.round(p[3] * k);
}

const WORLD = PLACES.length - 1, DUWAMISH = 9, KESTREL = 0;
// Everett's city centre (latitude, longitude)
export const CITY_AT = [47.979, -122.202];
// distances (km) between the places and from Port Alder: the mean distance between a person of one and a person of the
// other, from where their people live (movement.js)
const distKm = (p, q) => moveKm(p, q);
const NEWS_KM_PER_DAY = 1500;
export const OUTER_SPEC = [["alive", Uint8Array], ["layer", Uint8Array], ["place", Uint8Array], ["w", Float64Array], ["size", Uint8Array], ["kids", Uint8Array], ["u5", Uint8Array],
  ["seniors", Uint8Array], ["age", Uint8Array], ["bmon", Uint8Array], ["traits", Uint32Array], ["edu", Uint8Array], ["sector", Uint8Array], ["status", Uint8Array], ["firm", Int32Array],
  ["earners", Uint8Array], ["wage", Int32Array], ["hours", Uint8Array], ["inc", Int32Array], ["sav", Float64Array], ["rent", Int32Array], ["own", Uint8Array], ["health", Int16Array],
  ["mh", Uint16Array], ["stress", Uint16Array], ["val", Int16Array], ["need", Uint16Array, 6], ["memK", Uint8Array, 4], ["memV", Int8Array, 4], ["memD", Int32Array, 4],
  ["progs", Uint16Array], ["ins", Uint8Array], ["expInf", Int16Array], ["moved", Int32Array], ["strike", Uint8Array], ["tx", Uint8Array], ["spent", Int32Array], ["unempM", Uint8Array],
  ["jobM", Uint16Array], ["desire", Uint16Array], ["tripM", Uint8Array], ["trip", Uint8Array], ["plan", Int16Array], ["sin", Int32Array, 6], ["msex", Uint8Array], ["pinc", Int32Array], ["search", Float32Array], ["cityQ", Float32Array], ["sep", Float32Array], ...TRUST_SPEC("tg"), ...TRUST_SPEC("te")];
export const OFIRM_SPEC = [["alive", Uint8Array], ["layer", Uint8Array], ["place", Uint8Array], ["sector", Uint8Array], ["traits", Uint32Array], ["emp", Float64Array], ["want", Float64Array],
  ["wage", Int32Array], ["prevW", Int32Array], ["price", Float64Array], ["prevP", Float64Array], ["demand", Float64Array], ["demand0", Float64Array], ["conf", Int16Array], ["union", Uint16Array],
  ["strike", Uint8Array], ["orders", Float64Array], ["fleet", Float64Array], ["capa", Float64Array], ["contractW", Int32Array], ["contractP", Float64Array], ["hired", Float64Array], ["fired", Float64Array], ["profit", Float64Array], ["emp0", Float64Array], ["price0", Float64Array], ["carry", Float64Array]];
export const PLACE_SPEC = [["alive", Uint8Array], ["layer", Uint8Array], ["pop", Float64Array], ["units", Float64Array], ["rent", Int32Array], ["prevRent", Int32Array], ["home", Float64Array], ["mw", Int32Array],
  ["mood", Int16Array], ["unemp", Uint16Array], ["attract", Int16Array], ["births", Float64Array], ["deaths", Float64Array], ["migIn", Float64Array], ["migOut", Float64Array], ["cpi", Float64Array],
  ["poverty", Uint16Array], ["uninsured", Uint16Array], ["snap", Uint16Array], ["medicaid", Uint16Array], ["distress", Uint16Array], ["treated", Uint16Array], ["income", Int32Array], ["trust", Uint16Array],
  ["pipe", Float64Array, 12], ["started", Float64Array], ["visitors", Float64Array], ["pop0", Float64Array]];
// the share of disposable income a household spends: thrift, mood, expected inflation, and the interest rate (saving pays
// more when rates are high), in thousandths
const spendShare = (A, a, rate) => sat(880 - (trait(A.traits[a], T_THRIFT) - 8) * 20 + Math.round(A.val[a] / 40) - Math.round((A.expInf[a] - 300) / 20) - Math.round((rate - 375) / 5), 600, 1050);
const fplMonthly = (n) => Math.round((1596000 + 568000 * Math.max(0, n - 1)) / 12);
const EDU_PAY = [750, 880, 1000, 1280, 1580];

/* ------------------------------------------------------------------ genesis: the founding state (the seed's only use) */
export function attachOuter(c) {
  const s = c.cfg.seed, A = new Slots(12288, OUTER_SPEC), F = new Slots(512, OFIRM_SPEC), PL = new Slots(32, PLACE_SPEC);
  const o = { A, F, PL, news: [], kpi: {}, nat: { unemp: 410, mood: 0, prevMood: 0, attract: 0 }, flows: { cityIn: 0, cityOut: 0, immigrants: 0 }, toCity: [], visas: 0, move: newMovement() };
  c.outer = o; c.gov.puget = { tanfMul: 1000, ahAdultPct: 138, wftcMul: 1000, mealsAll: 0, wcccPct: 60, rentCap: 0 }; c.gov.stateBallot = []; c.gov.stateDone = [];
  o.cityWeight = Math.round((LAYERS[0].pop * 1000) / Math.max(1, c.people.count));          // Everett residents per citizen, x1000
  PLACES.forEach(([layer, , , pop, mix, wm, rent, home, mw], p) => {
    const q = PL.alloc(); PL.layer[q] = layer; PL.pop[q] = pop; PL.pop0[q] = Math.max(1, pop); PL.units[q] = Math.round((pop / (LAYERS[layer].size / 100)) * 1.04); PL.rent[q] = rent; PL.prevRent[q] = rent; PL.home[q] = home; PL.mw[q] = mw; PL.cpi[q] = 1e6;
    for (let k = 0; k < 12; k++) PL.pipe[q * 12 + k] = Math.round(PL.units[q] * 0.0008);
    MIX[mix].forEach((share, sec) => {
      if (!share) return; const f = F.alloc(); F.layer[f] = layer; F.place[f] = q; F.sector[f] = sec; F.traits[f] = (census(c, 0x0f1e, p, sec) & 0x77777777) | 0x11111111;
      F.wage[f] = Math.round((BASE_WAGE[sec] * wm) / 1000); F.prevW[f] = F.wage[f]; F.contractW[f] = F.wage[f]; F.price[f] = 1e6; F.prevP[f] = 1e6; F.contractP[f] = 1e6;
      F.union[f] = layer === 1 || layer === 2 ? Math.min(1000, Math.round((UNION[sec] * 12) / 10)) : UNION[sec];
      if (sec === 13) { F.fleet[f] = 400 + (p % 5) * 60; F.orders[f] = 0; }
      if (sec === 0) F.orders[f] = 96;                        // the aircraft backlog, months of production at today's rate
    });
  });
  for (let q = 0; q < PL.top; q++) {
    const layer = PL.layer[q], L = LAYERS[layer], n = layer === 4 ? L.sample : Math.max(60, Math.round((L.sample * PL.pop[q]) / L.pop)), firms = [...F.each()].filter((f) => F.place[f] === q);
    let persons = 0; const made = [];
    for (let k = 0; k < n; k++) { const a = makeAgent(c, A, F, q, layer, k, firms); persons += A.size[a]; made.push(a); }
    for (const a of made) A.w[a] = layer === 4 ? 40000 : PL.pop[q] / persons;                    // abroad: households considering a move
  }
  for (let pass = 0; pass < 3; pass++) for (let layer = 1; layer <= 4; layer++) {   // wages calibrated so each layer's weighted median household income meets its target
    const inc = []; for (const a of A.each()) if (A.layer[a] === layer) inc.push([incomeOf(A, a), A.w[a]]); inc.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const tot = inc.reduce((n, x) => n + x[1], 0); let run = 0, med = 1; for (const [v, w] of inc) { run += w; if (run >= tot / 2) { med = Math.max(1, v); break; } }
    const f = LAYERS[layer].income / (med * 12);
    for (const a of A.each()) if (A.layer[a] === layer) { A.wage[a] = Math.round(A.wage[a] * f); A.inc[a] = incomeOf(A, a); if (pass === 0) A.sav[a] = Math.round(A.sav[a] * f); }
    for (const fm of F.each()) if (F.layer[fm] === layer) { F.wage[fm] = Math.round(F.wage[fm] * f); F.prevW[fm] = F.wage[fm]; F.contractW[fm] = F.wage[fm]; }
  }
  for (const a of A.each()) { programs(c, a, true); mind(c, a, true); A.spent[a] = Math.round((Math.max(0, A.inc[a] - A.rent[a]) * spendShare(A, a, 375)) / 1000); }
  for (const f of F.each()) { let emp = 0; for (const a of A.each()) if (A.firm[a] === f) emp += A.w[a] * A.earners[a]; F.emp[f] = Math.max(1, emp); F.want[f] = F.emp[f]; F.capa[f] = F.sector[f] === 12 ? 1 : 0; }
  { const exp = [0, 0, 0, 0, 0], die = [0, 0, 0, 0, 0], pop = [0, 0, 0, 0, 0]; for (const a of A.each()) { const L = A.layer[a]; exp[L] += A.w[a] * outerBirths(A, a); die[L] += A.w[a] * outerDeaths(A, a, outerFrailty(A, a)); pop[L] += A.w[a] * A.size[a]; }
    o.birthScale = exp.map((x, L) => (x > 0 ? Math.round(((pop[L] * BIRTHS_PER_1000[L]) / 1000 / x) * 1000) / 1000 : 1));
    o.deathScale = die.map((x, L) => (x > 0 ? Math.round(((pop[L] * DEATHS_PER_1000[L]) / 1000 / x) * 1000) / 1000 : 1)); }
  // where each household's job, each seeker's search, each plan to move and each sample's gathering of households bound
  // for Port Alder stood in its cycle at the founding (the census reads the phases; the charges themselves are law 57.9)
  const wC0 = o.cityWeight / 1000;
  for (const a of A.each()) { A.pinc[a] = A.inc[a]; A.sep[a] = census(c, 0x5e9a, a) / 4294967296; A.search[a] = (census(c, 0x5ea7, a) / 4294967296) * 0.95;
    A.plan[a] = census(c, 0x91a2, a) % 3; A.cityQ[a] = (census(c, 0xc17a, a) / 4294967296) * wC0 * 0.999; }
  // the city's out-commuters work for firms in the county (most at Kestrel Field) and in Duwamish, by their occupation
  const P = c.people, pick = (i) => { const occ = P.occ[i], sec = occ === OC.production || occ === OC.trades ? 0 : occ === OC.engineer || occ === OC.professional ? 8 : occ === OC.clinician || occ === OC.care ? 5 : occ === OC.teacher ? 6 : occ === OC.driver ? 10 : 3;
    const place = sec === 8 ? DUWAMISH : sec === 0 ? KESTREL : 8; let best = -1; for (const f of F.each()) if (F.place[f] === place && F.sector[f] === sec) best = f; if (best < 0) for (const f of F.each()) if (F.place[f] === place) { best = f; break; } return best; };
  for (const i of P.each()) if (P.emp[i] === E_ROW) P.away[i] = 1 + pick(i);
  for (const f of F.each()) { let away = 0; for (const i of P.each()) if (P.away[i] === f + 1) away++; F.emp[f] += (away * o.cityWeight) / 1000; F.want[f] = F.emp[f]; }
  c.nation.attachEmergent();
  firmsDemand(c, true); for (const f of F.each()) { F.emp0[f] = F.emp[f]; F.price0[f] = F.price[f]; }
  kpis(c);
}
function incomeOf(A, a) {
  let inc = 0; if (A.status[a] === 2) inc += Math.round((A.wage[a] * A.hours[a] * 433) / 100) * A.earners[a] * (A.strike[a] ? 0.2 : 1);
  if (A.status[a] === 3) inc += Math.round((A.wage[a] * 40 * 433) / 100 * (A.layer[a] === 4 ? 0.1 : 0.4) * (A.unempM[a] <= 6 ? 1 : 0.25));
  return Math.round(inc + A.seniors[a] * (A.layer[a] === 4 ? 40000 : 207100));
}
function makeAgent(c, A, F, q, layer, k, firms) {
  const a = A.alloc(), r = (j) => census(c, 0xa60 + j, a), rb = (j) => censusBell(c, 0xa60 + j, a), L = LAYERS[layer], PL = c.outer.PL;
  A.layer[a] = layer; A.place[a] = q; A.bmon[a] = 1 + (r(1) % 12);
  let t = 0; for (let j = 0; j < 8; j++) t |= sat(8 + Math.round(rb(10 + j) / 64), 0, 15) << (4 * j); A.traits[a] = t >>> 0;
  const type = r(2) % 1000, age = type < 280 ? 22 + (r(3) % 64) : type < 550 ? 25 + (r(3) % 61) : type < 800 ? 27 + (r(3) % 29) : type < 880 ? 22 + (r(3) % 29) : 20 + (r(3) % 51);
  A.age[a] = age; A.size[a] = type < 280 ? 1 : type < 550 ? 2 : type < 800 ? 3 + (r(4) % 3) : type < 880 ? 2 + (r(4) % 3) : 3 + (r(4) % 3);
  A.kids[a] = type >= 550 && type < 880 ? A.size[a] - (type < 800 ? 2 : 1) : 0; A.u5[a] = A.kids[a] && r(5) % 3 === 0 ? 1 : 0;
  A.seniors[a] = age >= 65 ? (A.size[a] >= 2 && type < 550 ? 2 : 1) : 0;
  let x = r(6) % 1000; for (let j = 0; j < 5; j++) { if (x < L.edu[j]) { A.edu[a] = j; break; } x -= L.edu[j]; }
  const adults = A.size[a] - A.kids[a], working = Math.min(2, Math.max(0, adults - A.seniors[a]));
  // a household of one or two earners is out of work when its seeker is: the chance is set so that, counted by people
  // (one seeker against e earners), the layer's unemployment rate comes out as published
  const lf = working > 0 && r(7) % 1000 < (age < 60 ? 880 : 600), eN = working >= 2 && r(11) % 1000 < 720 ? 2 : 1, u0 = L.unemp / 10000;
  const unemployed = lf && r(8) % 10000 < (10000 * u0 * eN) / (1 - u0 + u0 * eN);
  const mix = MIX[PLACES[q][4]], tot = firms.reduce((n, f) => n + mix[F.sector[f]], 0); let pickN = r(9) % Math.max(1, tot), firm = firms[0];
  for (const f of firms) { pickN -= mix[F.sector[f]]; if (pickN < 0) { firm = f; break; } }
  A.sector[a] = F.sector[firm]; A.firm[a] = lf && !unemployed ? firm : -1; A.status[a] = !lf ? (age >= 62 ? 5 : 4) : unemployed ? 3 : 2; A.jobM[a] = A.status[a] === 2 ? r(21) % 120 : 0;
  A.earners[a] = lf && !unemployed ? eN : 0;
  A.wage[a] = Math.max(PL.mw[q], Math.round(((F.wage[firm] * EDU_PAY[A.edu[a]]) / 1000) * (1000 + (rb(12) >> 2)) / 1000));
  A.hours[a] = r(13) % 1000 < 820 ? 40 : r(13) % 1000 < 930 ? 30 : 20;
  A.inc[a] = incomeOf(A, a); A.sav[a] = Math.round(A.inc[a] * Math.max(0.3, (trait(t, T_THRIFT) - 4) * 0.6 + (age - 25) / 10));
  A.own[a] = r(14) % 1000 < L.own - 250 + Math.min(400, (age - 25) * 12) ? 1 : 0;
  A.rent[a] = A.own[a] ? Math.round(PL.home[q] * 0.0055) : Math.round((PL.rent[q] * (700 + A.size[a] * 120 + (r(15) % 300))) / 1000 / 100) * 100;
  A.health[a] = sat(780 + (rb(16) >> 3) - Math.max(0, age - 50) * 6, 120, 1000); A.mh[a] = sat(300 + (rb(17) >> 3) + (trait(t, T_N) - 8) * 20, 0, 1000);
  A.ins[a] = A.seniors[a] ? 3 : A.status[a] === 2 && r(18) % 1000 < (F.sector[firm] === 4 || F.sector[firm] === 3 ? 520 : 820) ? 1 : 0;
  A.expInf[a] = 300 + (rb(19) >> 4); A.desire[a] = r(22) % 1000; A.tripM[a] = r(23) % 12;
  // the household's people: their sexes and Social Information Numbers, from the office of its layer
  A.msex[a] = r(24) & 63;
  for (let m = 0; m < 6; m++) A.sin[a * 6 + m] = m < A.size[a] ? issue(c, Math.min(4, layer), 0, -1, a * 8 + m, q) : -1;
  for (let j = 0; j < 6; j++) A.need[a * 6 + j] = 600 + (r(20 + j) % 300);
  priorTrust(c.P, A, "tg", a); priorTrust(c.P, A, "te", a);
  return a;
}

/* ------------------------------------------------------------------ minds outside the city */
const NEED_W = [3, 3, 2, 2, 2, 2];
function mind(c, a, init = false) {
  const o = c.outer, A = o.A, PL = o.PL, q = A.place[a], t = A.traits[a], x = a * 6, N = trait(t, T_N);
  const inc = Math.max(1, A.inc[a]), food = Math.round((A.size[a] * 52000 * PL.cpi[q]) / 1e6), burden = Math.round((A.rent[a] * 1000) / inc), months = A.sav[a] / Math.max(50000, inc * 0.8);
  const target = [sat(950 - Math.max(0, (food * 1000) / inc - 150) * 2 + (A.progs[a] & 1 ? 80 : 0), 50, 1000), sat(900 - Math.max(0, burden - 300) * 1.3 - (A.own[a] ? 0 : 60), 50, 1000), sat(A.health[a], 0, 1000),
    sat(Math.round(150 + Math.min(6, months) * 120 - (A.status[a] === 3 ? 200 : 0)), 0, 1000), sat(520 + (trait(t, T_E) - 8) * 25 + (A.size[a] > 1 ? 120 : 0) + (A.trip[a] ? 80 : 0), 0, 1000),
    A.status[a] === 2 ? (A.strike[a] ? 520 : 760) : A.status[a] === 5 ? 640 : A.status[a] === 3 ? 260 : 480];
  let sum = 0; for (let j = 0; j < 6; j++) { A.need[x + j] = init ? target[j] : Math.round(A.need[x + j] + (target[j] - A.need[x + j]) / 3); sum += NEED_W[j] * A.need[x + j]; }
  let mood = Math.round((sum / 14 - 620) * 2); if (mood < 0) mood = Math.round(mood * (1 + N / 16));
  for (let j = 0; j < 4; j++) if (A.memK[a * 4 + j]) mood += Math.round((A.memV[a * 4 + j] * 3) / (1 + (c.epoch - A.memD[a * 4 + j]) / 30));
  mood += Math.round(o.nat.mood / 8) + Math.round(PL.mood[q] / 12);                 // the news, and the mood of the place
  A.val[a] = sat(init ? mood : Math.round(A.val[a] + (mood - A.val[a]) / 3), -1000, 1000);
  let press = 0; for (let j = 0; j < 6; j++) if (A.need[x + j] < 300) press += 300 - A.need[x + j];
  A.stress[a] = sat(Math.round(220 + press / 2 + (A.status[a] === 3 ? 150 : 0) + (N - 8) * 15 - (A.need[x + 4] - 500) / 5), 0, 1000);
  A.mh[a] = sat(Math.round(A.mh[a] + (A.stress[a] * 0.7 + (1000 - A.need[x + 4]) * 0.2 + (N - 8) * 25 - (A.tx[a] ? 150 : 0) - A.mh[a]) / 4), 0, 1000);
}
function remember(A, a, kind, v, e) { const o = a * 4; let slot = 0, low = 1e9; for (let k = 0; k < 4; k++) { if (!A.memK[o + k]) { slot = k; break; } const x = Math.abs(A.memV[o + k]); if (x < low) { low = x; slot = k; } } A.memK[o + slot] = kind; A.memV[o + slot] = sat(v, -127, 127); A.memD[o + slot] = e; }
// take-up: a household applies when its reasons outweigh its reluctance (no dice: the same household in the same state
// decides the same way); paperwork is finished by the conscientious, or with a friend's help
function decides(c, a, base) {
  const A = c.outer.A, t = A.traits[a];
  return base + (A.edu[a] - 2) * 25 + (trait(t, T_O) - 8) * 6 - (trait(t, T_THRIFT) - 8) * 9 + (A.tgLv[a] - 1) * 30 + (A.need[a * 6 + 3] < 300 ? 110 : 0) + (A.need[a * 6] < 350 ? 70 : 0) - 120 > 0;
}
function programs(c, a, init) {
  const A = c.outer.A, n = A.size[a], g = A.inc[a], f = fplMonthly(n), wa = A.layer[a] === 1 || A.layer[a] === 2, pg = c.gov.puget, q = A.place[a];
  if (A.layer[a] === 4) return;
  const ahLimit = wa ? Math.round((f * pg.ahAdultPct * 105) / 10000) : PLACES[q][9] >= 500 ? Math.round((f * 138 * 105) / 10000) : Math.round(f * 0.4);
  const set = (bit, ok, base) => {
    const had = A.progs[a] & bit; if (!ok) { A.progs[a] &= ~bit; return; } if (had) return;
    if (init ? decides(c, a, base + 150) : decides(c, a, base)) { const done = trait(A.traits[a], T_C) >= 6 || (A.edu[a] >= 2); if (done) { A.progs[a] |= bit; if (!init) { remember(A, a, M.got_help_with_food, 30, c.epoch); tickTrust(c.P, A, "tg", a, 1, 1, 0, F_RUNNING, c.C); } } else if (!init) { remember(A, a, M.was_denied_benefits, -35, c.epoch); tickTrust(c.P, A, "tg", a, 1, 0, 1, F_RUNNING, c.C); } }
  };
  set(1, g <= f * (wa ? 2 : 1.65), 60);
  set(2, A.kids[a] > 0 && g < Math.round(((wa ? (70600 * pg.tanfMul) / 1000 : 58300) * n) / 3), 90);
  set(4, A.seniors[a] === 0 && A.ins[a] !== 1 && g <= (A.kids[a] ? Math.max(ahLimit, Math.round(f * (wa ? 2.15 : 2.0))) : ahLimit), 320);
  set(8, A.u5[a] > 0 && (g <= f * 1.85 || (A.progs[a] & 7)), 110);
  A.ins[a] = A.seniors[a] ? 3 : A.progs[a] & 4 ? 2 : A.status[a] === 2 && (A.sector[a] !== 4 && A.sector[a] !== 3 || A.earners[a] === 2) ? 1 : 0;
}

/* ------------------------------------------------------------------ the month outside the city */
// demand: what households spent last month by sector (locally and across the layers), what airlines ordered, what
// energy users bought, what governments budgeted
function firmsDemand(c, init = false) {
  const o = c.outer, A = o.A, F = o.F, PL = o.PL;
  const local = new Float64Array(PL.top * NS), traded = new Float64Array(NS), tradedEmp = new Float64Array(NS);
  for (const a of A.each()) { if (A.layer[a] === 4) continue; const q = A.place[a], amt = A.spent[a] * A.w[a]; local[q * NS + 9] += A.rent[a] * A.w[a] * 0.6; for (let sec = 0; sec < NS; sec++) { const v = (amt * SPEND[sec]) / 1000; if (TRADED[sec]) traded[sec] += v; else local[q * NS + sec] += v; } }
  // traded goods: each firm's share of its sector's market is a softmax of its size and its price against the
  // sector's average (law 60.7); local services scale with the place's size (law 78.6, output per head ~ N^0.12)
  const share = new Float64Array(F.top);
  for (let sec = 0; sec < NS; sec++) {
    if (!TRADED[sec]) continue; const fs = [...F.each()].filter((f) => F.sector[f] === sec && F.layer[f] !== 4); if (!fs.length) continue;
    const mean = fs.reduce((x, f) => x + F.price[f], 0) / fs.length, sh = softmax(fs.map((f) => ln(Math.max(1, F.emp[f])) - 4 * (F.price[f] / mean - 1)), 1);
    fs.forEach((f, j) => { share[f] = sh[j]; });
  }
  for (const f of F.each()) {
    const sec = F.sector[f], q = F.place[f], pay = F.emp[f] * F.wage[f] * 173;
    let dem = TRADED[sec] ? traded[sec] * share[f] : (local[q * NS + sec] * urbanScale(PL.pop[q], PL.pop0[q])) / (PL.pop[q] / PL.pop0[q]);
    // aircraft: the backlog sets the pace, against the founding backlog; a fuller book raises the rate by a quarter of
    // its growth (a plant's rate is bounded by its lines and its suppliers)
    if (sec === 0) dem = (pay / 0.42) * Math.max(0.8, Math.min(1.15, 1 + 0.25 * (F.orders[f] / 96 - 1)));
    if (sec === 6 || sec === 7) dem = pay / 0.62;                                             // public payrolls are budgeted
    if (sec === 13 || F.layer[f] === 4) dem = Math.max(dem, pay / 0.62);
    if (F.strike[f]) dem *= 0.15;
    F.demand[f] = dem; if (init || !F.demand0[f]) F.demand0[f] = Math.max(1, dem);
  }
}
export function outerMonth(c, d) {
  const o = c.outer; if (!o) return;
  const A = o.A, F = o.F, PL = o.PL, e = c.epoch, nat = c.nation, k = nat.monthIndex(e), rate = nat.rate(e).mid;
  airlines(c, d, k, rate);
  firmsDemand(c);
  const staffed = new Float64Array(F.top), wC0 = o.cityWeight / 1000;
  for (const a of A.each()) if (A.firm[a] >= 0) staffed[A.firm[a]] += A.w[a] * A.earners[a];
  for (const i of c.people.each()) { const f = c.people.away[i] - 1; if (f >= 0 && c.people.emp[i] === E_ROW) staffed[f] += wC0; }
  for (const f of F.each()) if (F.sector[f] !== 13 && F.layer[f] !== 4 && staffed[f] > 0) F.emp[f] = staffed[f];
  // the owners decide: staff wanted, pay, prices; unions decide whether to strike
  for (const f of F.each()) {
    const sec = F.sector[f], q = F.place[f], t = F.traits[f], risk = trait(t, T_RISK), agree = trait(t, T_A), consc = trait(t, T_C);
    const volume = (F.demand[f] * (F.price0[f] || F.price[f])) / Math.max(1, F.price[f]), base = Math.max(1, F.demand0[f] * (F.emp0[f] ? F.emp[f] / F.emp0[f] : 1));
    const util = sat(Math.round((volume * 1000) / base), 400, 1600);
    F.profit[f] = F.demand[f] - F.emp[f] * F.wage[f] * 173;
    F.conf[f] = sat(Math.round(F.conf[f] + (util - 1000 - F.conf[f]) / 3), -1000, 1000);
    // (dearer credit slows hiring: each point of the policy rate above 3.75% takes about a tenth of a percent a month
    // off the plan, so a 100 bp rise costs about one percent of jobs over a year)
    const step = sat(Math.round((F.conf[f] * (6 + risk)) / 40) - Math.round(Math.max(0, rate - 375) / 100), -(18 - (agree >> 1)), 10 + (risk >> 1));
    // the owner's staffing plan moves with demand; places that fall empty (separations, retirements) stay in the plan and
    // are filled again
    F.want[f] = Math.max(1, Math.min(F.emp[f] * 1.3 + 1, Math.max(F.emp[f] * 0.8, Math.round(((F.want[f] || F.emp[f]) * (1000 + step)) / 1000))));
    const slack = Math.max(0, F.emp[f] - F.want[f]) / Math.max(1, F.emp[f]), tight = (F.want[f] - F.emp[f]) / Math.max(1, F.emp[f]), expInf = Math.round(((o.layerExp?.[F.layer[f]] ?? 300) + 200) / 2);   // what an owner expects of prices: half what the layer's households have come to expect, half the national bank's stated aim of 2%
    // the owner's pay decision: the Phillips relation on expected inflation and the place's slack (law 69.51), plus the
    // firm's own vacancies (beyond the 3% of jobs a firm has open in ordinary times as people come and go) or surplus
    // staff, and the owner's temperament
    let dw = Math.round((phillips(expInf, PL.unemp[q], 420, 0.5) * 10) / 12) + 10 + Math.round((tight - 0.03) * 4000) - Math.round(slack * 2000) + (agree - 8) * 4;          // ppm x 10 a month
    if (F.strike[f] === 1) { const lost = Math.max(0, (F.contractP[f] ? PL.cpi[q] / F.contractP[f] : 1) - F.wage[f] / Math.max(1, F.contractW[f])), surplus = Math.max(0, F.profit[f]) / Math.max(1, F.emp[f] * F.wage[f] * 173); dw += Math.round(nash(lost, surplus * 0.1, F.union[f] / 1000) * 1e5);   // the settlement: the real pay lost, and the union's share of the surplus (law 19.41)
      F.contractW[f] = F.wage[f]; F.contractP[f] = PL.cpi[q]; news(c, F.layer[f], q, `The strike at the ${SECTORS_OUT[sec]} employers in ${PLACES[q][1]} ends with a settlement`, 20, f); }
    // pay growth moves most of the way from last month's toward the rate decided (a contraction, law 3.13)
    const gPrev = F.prevW[f] > 0 ? ((F.wage[f] - F.prevW[f]) * 1e5) / F.prevW[f] : sat(dw, -2000, 60000), g = contract(gPrev, sat(dw, -2000, 60000), 0.8), w0 = F.wage[f];
    F.prevW[f] = w0; F.wage[f] = Math.max(PL.mw[q], Math.round((w0 * (1e5 + g)) / 1e5));
    // prices follow unit labour cost (pay here is per unit of output: the pay actually given this month), then the
    // owner's read of demand and temperament
    let dp = Math.round(((F.wage[f] - w0) * 1e5) / Math.max(1, w0)) + Math.round(F.conf[f] * 1.5) - (consc - 8) * 4;
    if (sec === 10 || sec === 1) dp += Math.round((nat.energy[Math.max(0, k)] - nat.energy[Math.max(0, k - 1)]) * 15);
    if (sec === 12) dp = energyDecision(c, f, util, k);
    F.prevP[f] = F.price[f]; F.price[f] = Math.round((F.price[f] * (1e5 + sat(dp, -3000, sec === 12 ? 12000 : 8000))) / 1e5);
    if (F.strike[f]) F.strike[f]--; else if (F.union[f] >= 300) strikeVote(c, f, q);
  }
  // jobs: owners lay off where they shrink (the least experienced and least qualified first), and hire where they grow
  layoffs(c, e);
  // jobs end even where firms do not shrink: contracts end, people are let go or quit to look (about 1.1% of the employed
  // a month pass into unemployment, the CPS labour-force flows); a charge per household with its founding phase, faster for the
  // stressed, the careless and the newly hired (law 57.9)
  { const A = c.outer.A, F = c.outer.F;
    for (const a of A.each()) { if (A.status[a] !== 2 || A.layer[a] === 4 || A.firm[a] < 0) continue; const t = A.traits[a];
      A.sep[a] = lif(A.sep[a], 0.011 * (1 + (A.stress[a] - 500) / 1500 - (trait(t, T_C) - 8) / 24 + (A.jobM[a] < 12 ? 0.4 : 0)), 0);
      if (A.sep[a] < 1) continue; A.sep[a] -= 1; F.fired[A.firm[a]] += A.w[a] * Math.max(1, A.earners[a]); A.status[a] = 3; A.firm[a] = -1; A.unempM[a] = 0; A.jobM[a] = 0; } }
  matching(c, k);
  // prices: each place's index; the nation's CPI is the published one through October 2026, then the agents' prices
  const dpPlace = new Float64Array(PL.top), wPlace = new Float64Array(PL.top);
  for (const f of F.each()) { const q = F.place[f], v = F.demand[f]; dpPlace[q] += (F.price[f] / F.prevP[f] - 1) * v; wPlace[q] += v; }
  let natDp = 0, natW = 0; for (let q = 0; q < PL.top; q++) { dpPlace[q] /= Math.max(1, wPlace[q]); if (PL.layer[q] >= 1 && PL.layer[q] <= 3) { natDp += dpPlace[q] * PL.pop[q]; natW += PL.pop[q]; } }
  let natBp = Math.round((natDp / Math.max(1, natW)) * 10000);
  if (k < CPI_2026.length) { const shock = (CPI_2026[k] - natBp) / 10000; natBp = CPI_2026[k]; for (let q = 0; q < PL.top; q++) dpPlace[q] += shock; }
  nat.setInflation(k, sat(natBp, -80, 150));
  for (let q = 0; q < PL.top; q++) PL.cpi[q] = Math.round(PL.cpi[q] * (1 + dpPlace[q]));
  o.dpPlace = Array.from(dpPlace.subarray(0, PL.top));
  // households: income, spending, trips, saving, health, care, programs, expectations, minds, families
  const layerExp = [0, 0, 0, 0, 0], layerN = [0, 0, 0, 0, 0], appeal = o.cityAttract ?? 0;
  for (const a of A.each()) {
    const q = A.place[a], t = A.traits[a];
    A.inc[a] = incomeOf(A, a) + (A.progs[a] & 2 ? 45000 : 0);
    const mpc = spendShare(A, a, rate);
    A.pinc[a] = Math.round(smooth(A.pinc[a] || A.inc[a], A.inc[a], 0.2)); const usable = A.inc[a] < A.pinc[a] && A.sav[a] > 0 ? Math.min(A.pinc[a], A.inc[a] + A.sav[a] / 12) : A.inc[a];
    A.spent[a] = Math.max(0, Math.round((Math.max(0, Math.min(usable, A.pinc[a]) - A.rent[a]) * mpc) / 1000) + (A.progs[a] & 1 ? 35000 * A.size[a] : 0));
    // a trip away, decided from the need for a break, the money, school holidays and how Port Alder feels from afar
    const holiday = d.m === 6 || d.m === 7 || d.m === 8 || d.m === 12, leisure = A.need[a * 6 + 4];
    const tripScore = Math.round((600 - leisure) / 10) + (holiday ? 20 : 0) + (A.sav[a] > A.inc[a] * 2 ? 10 : -25) + (trait(t, T_E) - 8) * 3 + (trait(t, T_O) - 8) * 2 - (A.tripM[a] < 3 ? 40 : 0) - (A.layer[a] === 4 ? 30 : 0);
    A.trip[a] = 0; if (tripScore > 0) { A.trip[a] = A.layer[a] <= 2 && appeal + (trait(t, T_O) - 8) * 10 > -40 ? 2 : 1; A.tripM[a] = 0; A.spent[a] += Math.round(A.inc[a] * 0.08); } else A.tripM[a] = Math.min(255, A.tripM[a] + 1);
    A.sav[a] = Math.max(0, A.sav[a] + A.inc[a] - A.rent[a] - A.spent[a] + (A.sav[a] * (rate - 150)) / 120000);
    if (!A.own[a]) A.rent[a] = Math.round((A.rent[a] * PL.rent[q]) / Math.max(1, PL.prevRent[q]));
    body(c, a, d);
    if (A.bmon[a] === d.m) { A.age[a] = Math.min(99, A.age[a] + 1); if (A.age[a] === 65) { A.seniors[a]++; if (A.status[a] === 2 && trait(t, T_C) + Math.min(8, A.sav[a] / Math.max(1, A.inc[a] * 12)) >= 10) { A.status[a] = 5; A.firm[a] = -1; A.earners[a] = 0; } } }
    const seen = Math.round(dpPlace[q] * 120000), lam = 8 + trait(t, T_O) + trait(t, T_N);
    A.expInf[a] = sat(Math.round(A.expInf[a] + ((seen - A.expInf[a]) * lam) / 96), -300, 1500);
    layerExp[A.layer[a]] += A.expInf[a] * A.w[a]; layerN[A.layer[a]] += A.w[a];
    if (seen > A.expInf[a] + 150) remember(A, a, M.saw_a_price_jump, -20, e);
    programs(c, a, false); mind(c, a, false);
    tickTrust(c.P, A, "tg", a, 0, 0, 0, F_RUNNING, c.C); tickTrust(c.P, A, "te", a, 0, 0, 0, F_RUNNING, c.C);
    family(c, a, d);
  }
  o.layerExp = layerExp.map((v, l) => (layerN[l] ? Math.round(v / layerN[l]) : 300));
  housing(c, d, rate);
  migrate(c, d, k);
  investors(c, k);
  kpis(c);
}
// the body: health falls with age, strain and winter illness, and mends with care (insured people get more of it);
// distress is met by care when a person decides to seek it and can reach it
function body(c, a, d) {
  const A = c.outer.A, t = A.traits[a], age = A.age[a];
  const ageing = age < 40 ? 0 : age < 60 ? 1 : age < 75 ? 3 : age < 85 ? 6 : 11, winter = d.m === 12 || d.m <= 2;
  const ill = (winter && A.stress[a] > 600) || (A.health[a] < 300 && A.stress[a] > 500) ? 50 : 0;
  A.health[a] = sat(A.health[a] - ageing - ill + (A.ins[a] ? 8 : 4) - (A.stress[a] > 700 ? 4 : 0), -1, 1000);
  const seek = (trait(t, T_O) - 8) * 10 + (trait(t, T_A) - 8) * 5 + A.edu[a] * 15 + (A.ins[a] ? 60 : -40) + (A.tgLv[a] - 1) * 30;
  if (A.mh[a] > 680 && !A.tx[a] && seek >= 0) A.tx[a] = 3; else if (A.tx[a]) { A.tx[a]--; A.mh[a] = Math.max(0, A.mh[a] - 90); }
}
// births when a couple's wish for a child has grown (security, room, mood and temperament feed it); deaths when the
// body gives out; households form and end
// The people a sampled household stands for are born and die at the rates the laws give for their ages, scaled by
// their own circumstances (laws 75.27, 75.19, 56.23): security, room and mood raise births; poor health, no coverage
// and poverty raise deaths. These expected numbers are the layers' births and deaths. The sampled household itself
// lives its own story: a baby when the couple's wish comes due, a death when its health gives out.
const ageOfMember = (A, a, m) => (m < A.size[a] - A.kids[a] ? Math.max(18, A.age[a] - m * 2) : Math.max(1, Math.min(17, A.age[a] - 26 - (m - (A.size[a] - A.kids[a])) * 3)));
// the births a year a sampled household stands for: a woman of the age, the age's rate (law 75.27) and her circumstances
// the deaths a year a sampled household stands for: each member's Gompertz-Makeham hazard (law 75.19) raised by the
// household's frailty factors through Cox's proportional hazards
function outerDeaths(A, a, lp) { let x = 0; for (let m = 0; m < A.size[a]; m++) x += mortality(ageOfMember(A, a, m), cox(lp) * ((A.msex[a] >> m) & 1 ? 1 : MORTALITY.maleHR)); return x; }
const outerFrailty = (A, a) => Math.max(0, 900 - A.health[a]) / 400 + (A.ins[a] || A.seniors[a] ? 0 : 0.25) + (A.inc[a] < fplMonthly(A.size[a]) ? 0.3 : 0) + (A.mh[a] > 700 ? 0.2 : 0);
function outerBirths(A, a) {
  const age = A.age[a], adults = A.size[a] - A.kids[a], t = A.traits[a];
  const woman = adults >= 2 ? age <= 49 : !(A.msex[a] & 1) ? false : age <= 49; if (!woman) return 0;
  const secure = A.need[a * 6 + 3] > 450 && A.status[a] !== 3, room = A.rent[a] * 1000 < A.inc[a] * 350;
  return asfr(age) * (adults >= 2 ? 1.25 : 0.35) * (room ? 1.15 : 0.85) * (secure ? 1.1 : 0.6) * (A.val[a] > 0 ? 1.05 : 0.95) * (1 + (trait(t, T_A) + trait(t, T_E) - 16) / 40) * (A.kids[a] >= 3 ? 0.4 : 1);
}
// the layers' births at the founding match their real birth rates (history: about 10.8 per thousand in Snohomish County
// outside Everett, 9.9 in the rest of Washington, 10.6 in the rest of the nation, CDC WONDER 2024); one woman stands for
// each sampled household of her age, so the scale carries the women the sample leaves out
const BIRTHS_PER_1000 = [0, 10.8, 9.9, 10.6, 0], DEATHS_PER_1000 = [0, 7.1, 7.9, 9.2, 0];   // deaths: CDC WONDER 2023
function family(c, a, d) {
  const o = c.outer, A = o.A, PL = o.PL, q = A.place[a], age = A.age[a], adults = A.size[a] - A.kids[a], t = A.traits[a], w = A.w[a];
  if (A.layer[a] !== 4) {
    const lp = outerFrailty(A, a);
    const deaths = (outerDeaths(A, a, lp) * (o.deathScale?.[A.layer[a]] ?? 1)) / 12;
    const births = (outerBirths(A, a) * (o.birthScale?.[A.layer[a]] ?? 1)) / 12;
    PL.births[q] += w * births; PL.deaths[q] += w * deaths;
  }
  if (adults >= 2 && age >= 22 && age <= 42 && A.kids[a] < 4) {
    const secure = A.need[a * 6 + 3] > 450 && A.status[a] !== 3, room = A.rent[a] * 1000 < A.inc[a] * 350;
    A.desire[a] = Math.min(1100, A.desire[a] + Math.max(0, 6 + (trait(t, T_A) - 8) + ((trait(t, T_E) - 8) >> 1) - A.kids[a] * 3 + (age < 35 ? 3 : -3) + Math.round(A.val[a] / 200) + (secure ? 3 : -4) + (room ? 1 : -1)));
    if (A.desire[a] >= 1000) {
      A.desire[a] = 0; A.size[a]++; A.kids[a]++; A.u5[a]++; remember(A, a, M.had_a_baby, 100, c.epoch);
      const m = A.size[a] - 1; if (m < 6) { const sx = c.birthSex(); A.msex[a] = (A.msex[a] & ~(1 << m)) | (sx << m); A.sin[a * 6 + m] = issue(c, Math.min(4, A.layer[a]), 1, -1, a * 8 + m, q); }
    }
  }
  if (A.health[a] <= 0) {
    if (A.size[a] > 1) {
      // the partner (or the eldest) dies; the household goes on
      const m = adults >= 2 ? 1 : 0; retireSin(c, A.sin[a * 6 + m]);
      for (let k = m; k < 5; k++) { A.sin[a * 6 + k] = A.sin[a * 6 + k + 1]; const g = A.sin[a * 6 + k]; if (g >= 0) relocate(c, g, -1, a * 8 + k, q); } A.sin[a * 6 + 5] = -1;
      A.size[a]--; if (A.seniors[a]) A.seniors[a]--; A.health[a] = Math.max(300, 900 - Math.max(0, age - 50) * 8); remember(A, a, M.lost_someone, -110, c.epoch);
    } else renew(c, a);
  }
  if (A.u5[a] && A.bmon[a] === d.m) A.u5[a]--;                                    // children grow past five
  if (A.kids[a] && age >= 48 && A.bmon[a] === d.m) {                               // and leave home, keeping their numbers
    const m = A.size[a] - 1; if (m < 6 && A.sin[a * 6 + m] >= 0) { relocate(c, A.sin[a * 6 + m], -1, -1, q); A.sin[a * 6 + m] = -1; }
    A.kids[a]--; A.size[a]--;
  }
}
function renew(c, a) {
  // the household ends and the next generation forms one in its place: a young adult with the household's temperament
  // leaning toward the place's (law 54.47), starting out, looking for work, renting
  const o = c.outer, A = o.A, t0 = A.traits[a], q = A.place[a];
  for (let m = 0; m < 6; m++) { const g = A.sin[a * 6 + m]; if (g >= 0 && m < 2) retireSin(c, g); else if (g >= 0) relocate(c, g, -1, -1, q); A.sin[a * 6 + m] = -1; }
  let t = 0; for (let j = 0; j < 8; j++) t |= sat(Math.round(breeder(8, trait(t0, j), 0.4)), 0, 15) << (4 * j); A.traits[a] = t >>> 0;
  A.age[a] = 24; A.size[a] = 1; A.kids[a] = 0; A.u5[a] = 0; A.seniors[a] = 0; A.own[a] = 0; A.sav[a] = Math.max(200000, Math.round(A.sav[a] * 0.3));
  A.status[a] = 3; A.firm[a] = -1; A.earners[a] = 0; A.health[a] = 900; A.mh[a] = 320; A.progs[a] = 0; A.memK.fill(0, a * 4, a * 4 + 4); A.desire[a] = 0;
  A.rent[a] = Math.round(o.PL.rent[q] * 0.8); priorTrust(c.P, A, "tg", a); priorTrust(c.P, A, "te", a);
  A.sin[a * 6] = issue(c, Math.min(4, A.layer[a]), 1, -1, a * 8, q);
}
// a strike is the members' decision: pay behind prices, little trust left in the employer, strain, and savings to last
function strikeVote(c, f, q) {
  const o = c.outer, A = o.A, F = o.F, PL = o.PL, real = F.wage[f] / Math.max(1, F.contractW[f]) / (PL.cpi[q] / Math.max(1, F.contractP[f])); if (real >= 0.975) return;
  let yes = 0, all = 0;
  for (const a of A.each()) { if (A.firm[a] !== f) continue; const w = A.w[a] * A.earners[a]; all += w; const s = (0.975 - real) * 6000 + (1000 - A.teLv[a] * 333) / 4 + (A.stress[a] - 500) / 4 - Math.min(6, A.sav[a] / Math.max(1, A.inc[a])) * 30 + (trait(A.traits[a], T_A) - 8) * -8; if (s > 0) yes += w; }
  if (all > 0 && yes * 3 >= all * 2) { F.strike[f] = 1 + Math.min(2, Math.floor((0.975 - real) * 60)); news(c, F.layer[f], q, `Workers vote to strike at the ${SECTORS_OUT[F.sector[f]]} employers in ${PLACES[q][1]}`, -40, f); }
}
function layoffs(c, e) {
  const o = c.outer, A = o.A, F = o.F, P = c.people, wC = o.cityWeight / 1000, staff = new Map();
  for (const f of F.each()) { F.fired[f] = 0; F.hired[f] = 0; }
  for (const a of A.each()) if (A.status[a] === 2 && A.firm[a] >= 0) { const f = A.firm[a]; A.strike[a] = F.strike[f] ? 1 : 0; A.jobM[a] = Math.min(65535, A.jobM[a] + 1); if (F.emp[f] > F.want[f]) { if (!staff.has(f)) staff.set(f, []); staff.get(f).push(["a", a, A.edu[a] * 100 + trait(A.traits[a], T_C) * 10 + Math.min(120, A.jobM[a]), A.w[a] * A.earners[a]]); } }
  for (const i of P.each()) { const f = P.away[i] - 1; if (f < 0 || P.emp[i] !== E_ROW || F.emp[f] <= F.want[f]) continue; if (!staff.has(f)) staff.set(f, []); staff.get(f).push(["p", i, P.edu[i] * 100 + trait(P.traits[i], T_C) * 10 + Math.min(120, Math.floor((e - P.hired[i]) / 30)), wC]); }
  for (const [f, list] of [...staff.entries()].sort((x, y) => x[0] - y[0])) {
    let cut = F.emp[f] - F.want[f]; list.sort((x, y) => x[2] - y[2] || x[1] - y[1]);
    for (const [kind, id, , w] of list) {
      if (cut < w / 2) break; cut -= w; F.fired[f] += w;
      if (kind === "a") { A.status[id] = 3; A.firm[id] = -1; A.unempM[id] = 0; A.jobM[id] = 0; remember(A, id, M.was_laid_off, -100, e); tickTrust(c.P, A, "te", id, 1, 0, 1, F_RUNNING, c.C); }
      else { c.leaveJob(id, true); P.away[id] = 0; }
    }
    if (F.fired[f] > F.emp[f] * 0.02) news(c, F.layer[f], F.place[f], `The ${SECTORS_OUT[F.sector[f]]} employers in ${PLACES[F.place[f]][1]} lay off ${Math.round(F.fired[f]).toLocaleString("en-US")} workers`, -25, f);
  }
}
// the job market: each firm admits the applicants it ranks highest (E1), as far as its openings go; applicants accept
// what pays at least what they will settle for (their reservation wage falls the longer they look, by about 5% of the
// old pay a month to 40% of it: displaced workers commonly take a fifth to a third less, the longer the search the more)
const PL_TOP = (o) => o.PL.top;
function matching(c, k) {
  const o = c.outer, A = o.A, F = o.F, P = c.people, wC = o.cityWeight / 1000, seekers = [];
  const openQ = new Float64Array(PL_TOP(o)), seekQ = new Float64Array(PL_TOP(o));
  for (const f of F.each()) if (F.layer[f] !== 4) openQ[F.place[f]] += Math.max(0, F.want[f] - F.emp[f]);
  for (const a of A.each()) if (A.status[a] === 3 && A.layer[a] !== 4) seekQ[A.place[a]] += A.w[a];
  let openC = 0, seekC = 0; for (let q = 0; q < PL_TOP(o); q++) if (o.PL.layer[q] === 1) { openC += openQ[q]; seekC += seekQ[q]; }
  for (const a of A.each()) {
    if (A.status[a] !== 3 || A.layer[a] === 4) continue; A.unempM[a] = Math.min(255, A.unempM[a] + 1);
    // the openings a seeker can reach against the seekers who can reach them: a county seeker any county employer's and,
    // commuting, a share of Duwamish's (about a third of Snohomish County's workers work in King County; a sixth of
    // Duwamish's openings are within their reach); a seeker near Duwamish a smaller share
    const q = A.place[a], th = Math.min(3, A.layer[a] === 1 ? (openC + 0.16 * openQ[DUWAMISH]) / Math.max(1, seekC + 0.16 * seekQ[DUWAMISH])
      : A.layer[a] === 2 && q !== DUWAMISH && q <= 11 ? (openQ[q] + 0.08 * openQ[DUWAMISH]) / Math.max(1, seekQ[q] + 0.08 * seekQ[DUWAMISH]) : openQ[q] / Math.max(1, seekQ[q]));
    // (the matching efficiency: a search comes to an application at a rate of 0.4 a month when there is an opening for
    // each seeker, and not every application is taken up, so that about three seekers in ten find work in a month then,
    // as the CPS flows and JOLTS openings have run)
    A.search[a] = lif(A.search[a], 0.4 * Math.sqrt(Math.max(0.02, th)) * (1 + (trait(A.traits[a], T_C) - 8) / 10 + (A.edu[a] - 2) / 8), 0);
    if (A.search[a] >= 1) { A.search[a] -= 1; seekers.push(["a", a]); }
  }
  // a city seeker is a county resident too, and finds work at the rate any county seeker does: what the city's own
  // openings do not give (its weekly market, economy.js), the county's and Duwamish's do. The search beyond the city
  // fills at the zone's rate less the rate the city's openings already give
  let cOpen = 0, cSeek = 0; for (const f of c.firms.each()) if (c.firms.status[f] === 0) cOpen += Math.max(0, c.firms.want[f] - c.firms.staff[f]); for (const i of P.each()) if (P.status[i] === 3) cSeek++;
  const thZone = Math.min(3, (openC + 0.16 * openQ[DUWAMISH]) / Math.max(1, seekC + 0.16 * seekQ[DUWAMISH])), thCity = Math.min(2, Math.max(0.02, cOpen / Math.max(1, cSeek)));
  const beyond = Math.max(0, 0.4 * (Math.sqrt(Math.max(0.02, thZone)) - Math.sqrt(thCity)));
  for (const i of P.each()) {
    if (P.status[i] !== 3 || P.hh[i] < 0 || ageYears(c, i) < 18 || ageYears(c, i) >= 65) continue;
    P.search[i] = lif(P.search[i], beyond * Math.max(0.3, 1 + (trait(P.traits[i], T_C) - 8) / 10 + (P.edu[i] - 2) / 8), 0);
    if (P.search[i] >= 1) { P.search[i] -= 1; seekers.push(["p", i]); }
  }
  const taken = new Set(), firms = [...F.each()].filter((f) => F.layer[f] !== 4 && F.want[f] > F.emp[f]).sort((x, y) => F.wage[y] - F.wage[x] || x - y);
  for (const f of firms) {
    // a firm's openings, with what it carried over, gather until they make a whole sampled household (law 57.9)
    let open = F.want[f] - F.emp[f] + F.carry[f]; F.carry[f] = 0; const q = F.place[f], cands = [];
    for (const [kind, id] of seekers) {
      const key = kind + id; if (taken.has(key)) continue;
      if (kind === "a") {
        const pa = A.place[id], reach = pa === q || (A.layer[id] === 1 && (F.layer[f] === 1 || q === DUWAMISH)) || (A.layer[id] === 2 && q === DUWAMISH && pa <= 11); if (!reach) continue;
        const offer = Math.round((F.wage[f] * EDU_PAY[A.edu[id]]) / 1000), reserve = Math.round(A.wage[id] * Math.max(0.4, 0.9 - A.unempM[id] * 0.05)); if (offer < reserve) continue;
        cands.push([A.edu[id] * 2 + (A.sector[id] === F.sector[f] ? 3 : 0), trait(A.traits[id], T_C), 255 - Math.min(255, A.unempM[id]), seekers.indexOf(key) < 0 ? id : id, kind, id, A.w[id]]);
      } else if (F.layer[f] === 1 || q === DUWAMISH) {
        cands.push([P.edu[id] * 2, trait(P.traits[id], T_C), 200, 1e6 + id, kind, id, wC]);
      }
    }
    if (!cands.length) continue;
    const ranked = admitE1(cands.map((x, n) => [x[0], x[1], x[2], n]), cands.length).admitted;
    // (an applicant who stands for more households than are open waits for the openings to gather; one who stands for
    // fewer, a citizen of Port Alder say, can still be taken on)
    let waits = 0;
    for (const n of ranked) {
      const [, , , , kind, id, w] = cands[n]; if (open < w / 2) { if (!waits) waits = w; continue; } open -= w; taken.add(kind + id); F.hired[f] += w;
      if (kind === "a") { A.status[id] = 2; A.firm[id] = f; A.sector[id] = F.sector[f]; A.earners[id] = Math.max(1, A.earners[id]); A.jobM[id] = 0; A.wage[id] = Math.max(o.PL.mw[q], Math.round((F.wage[f] * EDU_PAY[A.edu[id]]) / 1000)); remember(A, id, M.was_hired, 90, c.epoch); }
      else { c.hireAway(id, f, Math.max(o.PL.mw[q], Math.round((F.wage[f] * EDU_PAY[P.edu[id]]) / 1000))); P.away[id] = f + 1; }
    }
    if (waits) F.carry[f] = Math.max(0, Math.min(open, waits));
  }
  for (const f of F.each()) F.emp[f] = Math.max(1, F.emp[f] - F.fired[f] + F.hired[f]);
}
// airlines (beyond the nation) order aircraft when their passengers outgrow their fleets, as their owners' appetite
// for risk and the cost of borrowing allow; the orders are Kestrel Field's backlog
function airlines(c, d, k, rate) {
  const o = c.outer, A = o.A, F = o.F; let trips = 0; for (const a of A.each()) if (A.trip[a]) trips += A.w[a] * A.size[a];
  o.trips0 = o.trips0 || Math.max(1, trips);
  const passengers = trips / o.trips0, aero = [...F.each()].filter((f) => F.sector[f] === 0);
  let orders = 0;
  for (const f of F.each()) {
    if (F.sector[f] !== 13) continue;
    // the fuel a 2,000 km trip burns, the old fleet's against new aircraft's (Breguet range, law 66.7), at the energy price
    lawUse("66.7"); const burn = (ld) => 1 - 1 / ex((2000000 * 9.81 * 1.6e-5) / (230 * ld)), saving = (burn(16) - burn(20)) / burn(16), fuel = c.nation.energy[Math.max(0, Math.min(c.nation.months - 1, k))] / 1000;
    const t = F.traits[f], need = F.fleet[f] * (0.002 + (passengers - 1) * 0.05 + saving * fuel * 0.01), appetite = (trait(t, T_RISK) - 4) / 8 - Math.max(0, rate - 350) / 400 + o.nat.mood / 4000;
    const n = Math.max(0, Math.round(need * Math.max(0, 0.6 + appetite))); F.orders[f] += n; orders += n; F.fleet[f] = F.fleet[f] * 0.997 + n * 0.1;
  }
  for (const f of aero) F.orders[f] = Math.max(12, F.orders[f] - 1 + orders * (F.emp[f] / Math.max(1, aero.reduce((s2, x) => s2 + F.emp[x], 0))) * 0.3);
}
// energy producers set prices: the energy path is the published one through October 2026; after that the producers
// price against demand over capacity, and invest when prices reward it (their temperament decides how boldly)
function energyDecision(c, f, util, k) {
  const F = c.outer.F, t = F.traits[f], nat = c.nation;
  if (!F.capa[f]) F.capa[f] = 1;
  F.capa[f] = F.capa[f] * (1 + Math.max(0, (F.price[f] / 1e6 - 1)) * (trait(t, T_RISK) / 2000));
  return Math.round(((util - 1000) / F.capa[f]) * 10) + (trait(t, T_A) - 8) * -10;
}
// landlords set rents against how full their homes are, their costs and the law; buyers and sellers set prices; builders
// start homes when prices beat costs (each by temperament)
function housing(c, d, rate) {
  const o = c.outer, PL = o.PL, F = o.F, pg = c.gov.puget, capLaw = rentCap(d.y, c.nation);
  const owner = new Map(); for (const f of F.each()) { if (F.sector[f] === 9) owner.set(F.place[f], F.traits[f]); if (F.sector[f] === 2) owner.set(100 + F.place[f], F.traits[f]); }
  for (let q = 0; q < PL.top; q++) {
    PL.prevRent[q] = PL.rent[q];
    const lt = owner.get(q) ?? 0x88888888, bt = owner.get(100 + q) ?? 0x88888888, hh = PL.pop[q] / (LAYERS[PL.layer[q]].size / 100), tight = hh / Math.max(1, PL.units[q]);
    let dr = 15 + Math.round((tight - 0.96) * 500) + Math.round((o.dpPlace?.[q] ?? 0) * 6000) - (trait(lt, T_A) - 8) * 2;          // basis points a month
    if (PL.layer[q] === 1 || PL.layer[q] === 2) dr = Math.min(dr, Math.round((pg.rentCap || capLaw) / 1200));
    PL.rent[q] = Math.round(PL.rent[q] * (1 + sat(dr, -80, 150) / 10000));
    PL.home[q] = Math.round(PL.home[q] * (1 + sat(20 + Math.round((tight - 0.96) * 600) - Math.round((rate - 375) / 10), -150, 200) / 10000));
    const done = PL.pipe[q * 12 + (d.m - 1)]; PL.units[q] += done;
    const value = PL.home[q] / Math.max(1, PL.rent[q] * 160), hurdle = 1.0 + (8 - trait(bt, T_RISK)) * 0.02 + Math.max(0, rate - 375) / 2000;
    PL.pipe[q * 12 + (d.m - 1)] = Math.max(0, Math.round(PL.units[q] * Math.max(0, value - hurdle) * 0.004 + PL.units[q] * 0.0003));
    PL.started[q] += PL.pipe[q * 12 + (d.m - 1)];
  }
}
// investors: fund returns are the firms' profits over their capital, and the change in investors' mood
function investors(c, k) {
  const o = c.outer, F = o.F; let profit = 0, capital = 0;
  for (const f of F.each()) { profit += F.profit[f]; capital += F.demand0[f] * 30; }
  const bp = Math.round((profit / Math.max(1, capital)) * 10000 * 0.5 + (o.nat.mood - o.nat.prevMood) * 0.4);
  o.nat.prevMood = o.nat.mood; c.nation.setFund(k, sat(bp, -900, 900));
}
// news: what happens in one place reaches people there most, then the layer, then the nation, and Port Alder
// news: what happens in one place is known there at once and reaches other places, and Port Alder, inside its light
// cone at the speed news travels (law 33.4), stamped with a Lamport clock so causes come before effects (law 80.50);
// the nearer the place, the more it matters there
function news(c, layer, q, text, effect, ref = -1) {
  const o = c.outer; o.clock = lamport(o.clock || 0, c.reg?.clock || 0);
  o.news.push({ epoch: c.epoch, layer, place: q, text, effect, stamp: o.clock }); if (o.news.length > 200) o.news.splice(0, o.news.length - 200);
  o.newsQ = o.newsQ || []; o.newsQ.push({ e0: c.epoch, q0: q, layer, text, effect, ref, stamp: o.clock, got: new Uint8Array(o.PL.top + 1) });
  deliverNews(c);
}
export function deliverNews(c) {
  const o = c.outer, PL = o.PL; if (!o.newsQ) return;
  for (const it of o.newsQ) {
    for (let p = 0; p <= PL.top; p++) {
      if (it.got[p]) continue; const city = p === PL.top, dk = distKm(it.q0, city ? -1 : p);
      if (!causal(c.epoch - it.e0, dk, NEWS_KM_PER_DAY)) continue;
      it.got[p] = 1; const eff = Math.round((it.effect * 1000) / (1000 + dk));
      if (!city) PL.mood[p] = sat(PL.mood[p] + eff, -1000, 1000);
      else {
        c.event("outer", `${it.text} (${LAYERS[it.layer].name})`, [it.ref]);
        for (const i of c.people.each()) { const f = c.people.away[i] - 1; if (f >= 0 && o.F.place[f] === it.q0) c.people.val[i] = sat(c.people.val[i] + it.effect, -1000, 1000); }
      }
    }
  }
  o.newsQ = o.newsQ.filter((it) => it.got.some((x) => !x));
}

/* ------------------------------------------------------------------ people moving */
// the pull of a place, as the people there experience it: work, pay against prices, rent against pay, mood, trust, hardship
// (a point of unemployment above the nation's weighs about as much as a point of rent burden: migration answers local
// joblessness only modestly, a few percent more leaving for each point)
function attractiveness(c, q) {
  const o = c.outer, PL = o.PL; return Math.round(-(PL.unemp[q] - o.nat.unemp) * 0.25 - ((PL.rent[q] * 1000) / Math.max(1, PL.income[q]) - 300) * 0.15 + PL.mood[q] / 8 + (PL.trust[q] - 500) / 10 - PL.poverty[q] / 20 + Math.round((PL.income[q] / Math.max(1, PL.cpi[q] / 1e6) - 700000) / 20000));
}
// What a year in each place a household knows is worth to it beyond a year where it is, less what the move would cost
// it, as Boltzmann odds against staying (law 27.4): its own layer's places, the ones in the news and, across the state
// and the nation, Port Alder. A year in a place is its pull, its work, its rent and the gravity of its size against the
// distance (law 75.41), valued over the years the household looks ahead (law 61.34). The odds are gentle (most moves
// answer lives, not conditions), so flows shift by degrees as places change. `pull` is Port Alder's standing.
const MOVE_T = 6;
// the movement matrix's prior follows the places' people as they are now, and the city's own
function refreshMovement(c) {
  const o = c.outer, PL = o.PL, pop = new Float64Array(MOVE_UNITS);
  for (let q = 0; q < M_CITY; q++) pop[q] = PL.pop[q];
  pop[M_CITY] = (c.people.count * o.cityWeight) / 1000; movePrior(o.move, pop);
}
function moveOdds(c, a, pull, inNews) {
  const o = c.outer, A = o.A, PL = o.PL, q = A.place[a], t = A.traits[a], age = A.age[a], lay = A.layer[a], seeker = A.status[a] === 3, works = A.status[a] === 2, renter = !A.own[a];
  // a household of the nation knows every place of it and Port Alder (how likely each is to come to mind is the
  // movement matrix's prior: its people, and how near they live); one beyond the nation knows the places in the news
  const known = [];
  if (lay === 4) { for (const p of inNews) if (p !== q) known.push(p); }
  else { for (let p = 0; p < PL.top; p++) if (p !== q && PL.layer[p] >= 1 && PL.layer[p] <= 3) known.push(p); known.push(-1); }
  const horizon = Math.max(3, Math.round((85 - age) / 4)), gamma = 0.86 + (trait(t, T_C) - 8) / 200;
  // a job the move would end has to be found again there: a working household weighs the place's unemployment at half
  // a seeker's weight (within the county, and from Duwamish to Port Alder, the job is kept and commuted to)
  const keeps = (p) => p === q || (p < 0 ? lay === 1 || q === DUWAMISH : lay === 1 && PL.layer[p] === 1);
  const year = (p) => { const at = p < 0 ? o.cityView : PL.attract[p], un = p < 0 ? o.cityUnempView : PL.unemp[p], rent = p < 0 ? (o.cityRent || 180000) : PL.rent[p];
    return at / 400 - (seeker ? un / 1000 : works && !keeps(p) ? un / 2000 : 0) - (renter ? rent / 400000 : 0) + (p < 0 ? pull : 0); };
  // leaving costs more for owners, families and the settled, and with the distance; the open-minded mind it less
  const cost = (p) => 4 + (A.own[a] ? 6 : 0) + A.kids[a] * 1.5 + Math.min(3, A.jobM[a] / 24) + distKm(q, p) / 500 - (trait(t, T_O) - 8) / 4;
  const stay = bellman(year(q), gamma, horizon), sh = boltzmann([0, ...known.map((p) => bellman(year(p), gamma, horizon) - stay - cost(p))], MOVE_T);
  // each place's odds: its share of the movement matrix's row (a place in the news comes to mind half again as
  // readily) times what the household makes of a year there
  const row = moveUnit(q) * MOVE_UNITS, n = known.length;
  let sum = 0; const odds = known.map((p, j) => { const x = (sh[j + 1] / sh[0]) * (lay === 4 ? 1 : o.move.prior[row + moveUnit(p)] * n * (inNews.includes(p) ? 1.5 : 1)); sum += x; return x; });
  return { known, odds, sum, rc: rogersCastro(age) };                     // the young move readily (law 75.44)
}
// how many households a month the outer layers would send to Port Alder if the city stood `pull` higher in their eyes
// (a dry run of the flows below: a third of the samples' plans come due in a month)
export function cityInflow(c, pull, inNews) {
  const o = c.outer, A = o.A, wC = o.cityWeight / 1000; let mass = 0;
  for (const a of A.each()) {
    if (!A.alive[a] || A.layer[a] < 1 || A.layer[a] > 3) continue;
    const mo = moveOdds(c, a, pull, inNews), rate = o.moveScale * mo.rc, j = mo.known.indexOf(-1); if (j < 0) continue;
    mass += (A.w[a] * rate * mo.odds[j] * Math.min(1, 0.12 / Math.max(1e-12, rate * mo.sum))) / 3;
  }
  return mass / wC;
}
function migrate(c, d, k) {
  const o = c.outer, A = o.A, PL = o.PL, e = c.epoch, wC = o.cityWeight / 1000;
  for (let q = 0; q < PL.top; q++) PL.attract[q] = sat(attractiveness(c, q), -1000, 1000);
  o.cityAttract = cityAttract(c);
  // how the city looks from outside and to its own people is what they have come to expect of it over the past year
  // (adaptive expectations, law 59.44), not this month's figures alone
  o.cityView = o.cityView === undefined ? o.cityAttract : smooth(o.cityView, o.cityAttract, 1 / 12);
  o.cityUnempView = o.cityUnempView === undefined ? (o.cityUnemp || 450) : smooth(o.cityUnempView, o.cityUnemp || 450, 1 / 6);
  const inNews = [...PL.attract.subarray(0, PL.top)].map((v, q) => [v, q]).filter(([, q]) => PL.layer[q] >= 1 && PL.layer[q] <= 3).sort((x, y) => y[0] - x[0] || x[1] - y[1]).slice(0, 3).map(([, q]) => q);
  o.inNews = inNews; rollMovement(o.move); refreshMovement(c);
  // the rate at which the outer households move between places, fixed once at the founding from their own odds: about
  // 5.5% of households a year (history: the ACS flows between counties and cities)
  if (o.moveScale === undefined) {
    let num = 0, den = 0;
    for (const a of A.each()) { if (!A.alive[a] || A.layer[a] < 1 || A.layer[a] > 3) continue; const mo = moveOdds(c, a, 0, inNews); let s2 = 0; mo.known.forEach((p, j) => { if (p >= 0) s2 += mo.odds[j]; }); num += A.w[a]; den += A.w[a] * mo.rc * s2; }
    o.moveScale = den > 0 ? ((0.055 / 4) * num) / den : 0.01;
  }
  // the city's standing beyond its limits, fixed once at the founding from the outer households' own valuations: as
  // many households a month as leave it come (Everett's flows in and out were near balance, ACS); later the city's
  // own state moves the balance
  if (o.cityPull === undefined) {
    const target = (0.055 / 12) * c.hh.count; let lo = -12, hi = 12;
    for (let it = 0; it < 16; it++) { const mid = (lo + hi) / 2; if (cityInflow(c, mid, inNews) < target) lo = mid; else hi = mid; }
    o.cityPull = Math.round(((lo + hi) / 2) * 1000) / 1000;
  }
  const applicants = [], wants = [], wantBy = {}, outBy = {};
  for (const a of [...A.each()]) {
    if (!A.alive[a]) continue;
    const q = A.place[a], seeker = A.status[a] === 3, whole = A.w[a] <= wC * 1.01, mo = moveOdds(c, a, o.cityPull, inNews);
    // beyond the nation: would-be migrants apply when a place in the news beats home by more than the move costs, and
    // the reasons have held for a few months; the nation admits within its capacity (below)
    if (A.layer[a] === 4) {
      if (!inNews.length || !mo.odds.some((x) => x > 1)) { A.plan[a] = 0; continue; }
      A.plan[a] = Math.min(12, A.plan[a] + 1); if (A.plan[a] < 3 - (seeker ? 1 : 0)) continue;
      A.plan[a] = 0; applicants.push([A.edu[a], trait(A.traits[a], T_C), Math.min(255, A.unempM[a]), a]); continue;
    }
    // a move takes a while to arrange: each sample's plans come due every third month (a seeker's every second), by its founding phase
    A.plan[a] = Math.min(12, A.plan[a] + 1); if (A.plan[a] < 3 - (seeker ? 1 : 0)) continue;
    A.plan[a] = 0;
    // of the households a sample stands for, a share moves to each place it knows in proportion to that place's odds
    // (at most 12% of them in a quarter)
    const rate = o.moveScale * mo.rc, scale = Math.min(1, 0.12 / Math.max(1e-12, rate * mo.sum));
    mo.known.forEach((p, j) => {
      const m = A.w[a] * rate * mo.odds[j] * scale, persons = m * A.size[a]; if (m <= 0) return;
      // the households a sample sends toward Port Alder gather (law 57.9) until they make a whole city household
      if (p < 0) { A.cityQ[a] += m; if (A.cityQ[a] >= wC) { const whole2 = Math.floor(A.cityQ[a] / wC) * wC; A.cityQ[a] -= whole2; o.toCity.push([a, whole2]); } return; }
      if (whole) return;                                                    // a household that stands for itself stays where it settled, unless it comes back to Port Alder
      wants.push([a, q, p, m]); wantBy[p] = (wantBy[p] || 0) + persons;
    });
  }
  // a place takes in as many as it has homes for: the flows into each place are scaled to its empty homes (and the
  // homes it is building), so a place in the nation's news cannot fill beyond its housing
  const samplesAt = Array.from({ length: PL.top }, () => []); for (const b of A.each()) if (A.w[b] > wC * 1.01) samplesAt[A.place[b]].push(b);   // the samples that take in a place's arrivals (the nearest in size, age and work)
  for (const [a, q, p, m0] of wants) {
    let pipe = 0; for (let j = 0; j < 12; j++) pipe += PL.pipe[p * 12 + j];
    const room = Math.max(0, (PL.units[p] + pipe) * 2.5 - PL.pop[p] + (outBy[p] || 0)), scale = Math.min(1, room / Math.max(1, wantBy[p])), m = m0 * scale, persons = m * A.size[a];
    if (m <= 0) continue;
    PL.pop[q] -= persons; PL.migOut[q] += persons; PL.pop[p] += persons; PL.migIn[p] += persons; countMove(o.move, q, p, persons);
    let recv = -1, rd = 1e9; for (const b of samplesAt[p]) { const dd = Math.abs(A.size[b] - A.size[a]) * 20 + Math.abs(A.age[b] - A.age[a]) + (A.status[b] === A.status[a] ? 0 : 15); if (dd < rd) { rd = dd; recv = b; } }
    if (recv >= 0) { A.w[recv] += (m * A.size[a]) / Math.max(1, A.size[recv]); A.w[a] -= m; }
  }
  // the nation admits would-be migrants within its 2026 capacity (on current trends about 321,000 a year by mid-2026),
  // the best-placed first (E1); they settle where the nation's people are (gravity on population, Boltzmann shares)
  o.visas += 321000 / 12;
  const { admitted } = admitE1(applicants, applicants.length), dests = [], dval = [];
  for (let q = 0; q < PL.top; q++) if (PL.layer[q] >= 1 && PL.layer[q] <= 3) { dests.push(q); dval.push(ln(PL.pop[q])); }
  const dshare = boltzmann(dval, 1);
  for (const a of admitted) {
    const persons = Math.min(o.visas, A.w[a] * A.size[a] * 0.05); if (persons < 1) break;
    o.visas -= persons; o.flows.immigrants += persons; A.w[a] = Math.max(1000, A.w[a] - persons / Math.max(1, A.size[a]));
    dests.forEach((q, j) => { const v = persons * dshare[j]; PL.pop[q] += v; PL.migIn[q] += v; countMove(o.move, WORLD, q, v); });
  }
  // natural change, counted where it happened
  for (let q = 0; q < PL.top; q++) { const v = PL.births[q] - (o.lastB?.[q] ?? 0) - (PL.deaths[q] - (o.lastD?.[q] ?? 0)); if (PL.layer[q] !== 4) PL.pop[q] += v; }
  o.lastB = Array.from(PL.births.subarray(0, PL.top)); o.lastD = Array.from(PL.deaths.subarray(0, PL.top));
  // the samples are re-weighted to the places' people (households that stand for one family keep their weight)
  const tot = new Float64Array(PL.top), fixed = new Float64Array(PL.top);
  for (const a of A.each()) { const persons = A.w[a] * A.size[a]; if (A.w[a] > wC * 1.01) tot[A.place[a]] += persons; else fixed[A.place[a]] += persons; }
  for (const a of A.each()) { const q = A.place[a]; if (PL.layer[q] !== 4 && A.w[a] > wC * 1.01 && tot[q] > 0) A.w[a] *= Math.max(0.5, Math.min(2, (PL.pop[q] - fixed[q]) / tot[q])); }
}
// Port Alder's pull, from its KPIs: work, rents, homes to be had, mood, trust in the city, displacement, new building
function cityAttract(c) {
  const P = c.people, H = c.hh, D = c.world.dwellings; let lf = 0, un = 0, mood = 0, n = 0, tc = 0, vac = 0, all = 0, burden = 0, renters = 0, rent = 0;
  for (const i of P.each()) { const st = P.status[i]; if (st === 2 || st === 6) lf++; if (st === 3) { lf++; un++; } mood += P.val[i]; tc += P.tcLv[i]; n++; }
  for (const d of D.each()) { all++; if (D.hh[d] < 0) vac++; }
  for (const h of H.each()) if (H.tenure[h] === 0 && H.inc[h] > 0) { renters++; burden += Math.min(1000, (H.rent[h] * 1000) / H.inc[h]); rent += H.rent[h]; }
  const unemp = lf ? Math.round((un * 10000) / lf) : 500; c.outer.cityUnemp = unemp; c.outer.cityRent = renters ? Math.round(rent / renters) : 180000;
  return Math.round(-(unemp - c.outer.nat.unemp) * 0.25 + mood / Math.max(1, n) / 8 + ((tc / Math.max(1, n)) * 333 - 500) / 10 - ((renters ? burden / renters : 300) - 300) * 0.15 + Math.min(60, (vac * 1000) / Math.max(1, all) - 30) - (c.gov.dev?.left || 0) / 50 + (c.gov.dev?.built || 0));
}
// each Thursday: a household leaves Port Alder when a year somewhere it knows, valued over the years it looks ahead
// (law 61.34), beats a year here by more than the cost of leaving (friends, a home it owns, children in school, a job,
// the distance; the young move readily, law 75.44), and the reasons have held for three weeks. Its own situation (work,
// rent, a notice to leave, mood, trust in the city) is part of what a year here is worth. Households who chose Port
// Alder from the layers arrive as homes are to be had.
export function cityMigration(c, d) {
  const o = c.outer; if (!o) return;
  const P = c.people, H = c.hh, PL = o.PL, A = o.A, e = c.epoch, wC = o.cityWeight / 1000;
  if (o.cityAttract === undefined) o.cityAttract = cityAttract(c);                   // the city's standing, before the first decisions
  if (o.cityView === undefined) { o.cityView = o.cityAttract; o.cityUnempView = o.cityUnemp || 450; }
  if (!o.move.pop[M_CITY]) refreshMovement(c);
  const inNews = o.inNews || [], rowC = M_CITY * MOVE_UNITS;
  let left = 0; const plans = [], F = o.F;
  for (const h of [...H.each()]) {
    const head = H.head[h]; if (head < 0 || H.home[h] < 0 || !H.alive[h]) continue;
    const t = P.traits[head], age = ageYears(c, head), seeker = P.status[head] === 3, works = P.status[head] === 2, renter = H.tenure[h] === 0;
    let friends = 0; for (let k = 0; k < 4; k++) if (c.slotOf(P.friend[head * 4 + k]) >= 0) friends++;
    const burden = renter ? Math.min(1000, (H.rent[h] * 1000) / Math.max(1, H.inc[h])) : 300;   // rent per 1000 of income (a household with no income yet: all of it)
    const here = o.cityView / 400 - (seeker ? o.cityUnempView / 1000 + 0.3 : 0) - (renter ? H.rent[h] / 400000 : 0) - Math.max(0, burden - 400) / 600 - (H.demoAt[h] > e ? 1 : 0) + P.val[head] / 2000 + (P.tcLv[head] - 1.5) / 8;
    const horizon = Math.max(3, Math.round((85 - age) / 4)), gamma = 0.86 + (trait(t, T_C) - 8) / 200, stay = bellman(here, gamma, horizon);
    // what the move would cost: a home it owns, children in school, friends here, a job here, the distance
    const ties = 4 + (H.tenure[h] === 1 ? 6 : 0) + Math.min(3, H.kids[h]) * 1.5 + friends * 0.7 + (works ? 1.5 : 0) - (trait(t, T_O) - 8) / 4;
    // a head who commutes to an employer beyond the city keeps that job in a place within its reach
    const f0 = works && P.emp[head] === E_ROW ? P.away[head] - 1 : -1, qs = [], xs = [];
    for (let q = 0; q < PL.top; q++) {
      if (PL.layer[q] === 4) continue;
      const keeps = f0 >= 0 && F.alive[f0] && (F.place[f0] === q || (PL.layer[q] === 1 && F.layer[f0] === 1));
      const yr = PL.attract[q] / 400 - (seeker ? PL.unemp[q] / 1000 : works && !keeps ? PL.unemp[q] / 2000 : 0) - (renter ? PL.rent[q] / 400000 : 0);
      qs.push(q); xs.push(bellman(yr, gamma, horizon) - stay - ties - distKm(-1, q) / 500);
    }
    // each place's odds: its share of the city's row of the movement matrix times what the household makes of a year there
    const sh = boltzmann([0, ...xs], MOVE_T); let sum = 0; const odds = xs.map((_, j) => { const x = (sh[j + 1] / sh[0]) * o.move.prior[rowC + qs[j]] * xs.length * (inNews.includes(qs[j]) ? 1.5 : 1); sum += x; return x; });
    plans.push([h, rogersCastro(age) * sum, qs, odds, sum]);
  }
  // the decision to go is a charge that integrates a weekly rate with no leak (law 57.9, as an urge): the household's
  // odds of moving, as for any household beyond the city (its age's readiness to move, law 75.44, times its Boltzmann
  // odds for the places it knows against staying, law 27.4), scaled once, from the founding households' own odds, so
  // that the founding city loses households at the rate cities of its kind do (about 5.5% a year, ACS flows)
  if (o.leaveScale === undefined) { let m = 0, n = 0; for (const p of plans) if (p[1] < 1e9) { m += p[1]; n++; } o.leaveScale = 0.055 / 52 / Math.max(1e-9, m / Math.max(1, n)); }
  if (!o.destQ) o.destQ = new Float64Array(PL.top);
  for (const [h, wish, qs, odds, sum] of plans) {
    H.leave[h] = lif(H.leave[h], o.leaveScale * wish, 0); if (H.leave[h] < 1 || !qs.length || sum <= 0) continue;
    H.leave[h] -= 1;
    // where it goes: each place's share of the household's odds fills that place's quota, and the household goes to
    // the fullest (so the leavers spread over the places as their odds do)
    let best = 0; for (let j = 0; j < qs.length; j++) o.destQ[qs[j]] += odds[j] / sum;
    for (let j = 1; j < qs.length; j++) if (o.destQ[qs[j]] > o.destQ[qs[best]]) best = j;
    o.destQ[qs[best]] -= 1;
    const size = H.size[h], to = qs[best];
    leaveCity(c, h, `for ${PLACES[to][1]}`, to); left++;
    PL.pop[to] += size * wC; PL.migIn[to] += size * wC; o.flows.cityOut += size;
  }
  // arriving: each arrival is a household of a sample that chose Port Alder, made visible as citizens
  let vac = 0; for (const dd of c.world.dwellings.each()) if (c.world.dwellings.hh[dd] < 0 && !c.world.buildings.stage[c.world.dwellings.bld[dd]]) vac++;
  const room = Math.max(0, Math.floor(vac / 30)); let arrived = 0;
  while (o.toCity.length && arrived < room) {
    const entry = o.toCity[0], a = entry[0];
    if (!A.alive[a] || A.place[a] === WORLD || entry[1] < wC * 0.999) { o.toCity.shift(); continue; }
    const q = A.place[a], size = A.size[a], whole = A.w[a] <= wC * 1.01;
    const h = arrive(c, a); entry[1] -= wC; if (h < 0) continue;
    arrived++; PL.pop[q] -= size * wC; PL.migOut[q] += size * wC; o.flows.cityIn += H.size[h]; countMove(o.move, q, -1, H.size[h] * wC);
    if (!whole) A.w[a] = Math.max(1, A.w[a] - wC);
  }
  if (o.toCity.length > 400) o.toCity.splice(0, o.toCity.length - 400);
  if (left || arrived) c.R.migration = { left, arrived };
}
// a household from outside becomes citizens: the sampled household's temperament, schooling, work and memories come
// with it. If the sample stands for just this one household (a household that once left Port Alder, say), its people
// are the ones who arrive, with their own numbers; otherwise they are others like it, newly known one by one.
function arrive(c, a) {
  const o = c.outer, A = o.A, P = c.people, H = c.hh, B = c.books, e = c.epoch, wC = o.cityWeight / 1000;
  let bank = 0; for (let k = 1; k < c.banks.length; k++) if ((c.banks[k].chargeoffs || 0) < (c.banks[bank].chargeoffs || 0)) bank = k;
  const h = newHousehold(c, bank); if (h < 0) return -1;
  const same = A.w[a] <= wC * 1.01, adults = Math.max(1, A.size[a] - A.kids[a]), fam = (A.traits[a] >>> 3) % 48, made = [];
  for (let j = 0; j < Math.min(6, A.size[a]); j++) {
    const kid = j >= adults, age = ageOfMember(A, a, j), sex = (A.msex[a] >> j) & 1;
    const opt = { traits: j === 0 ? A.traits[a] : undefined, edu: kid ? 0 : A.edu[a], status: kid ? (age < 5 ? 0 : age < 18 ? 1 : 3) : A.status[a] === 5 ? 5 : 3,
      occ: [OC.production, OC.production, OC.trades, OC.service, OC.food, OC.care, OC.teacher, OC.admin, OC.professional, OC.admin, OC.driver, OC.service, OC.trades, OC.service][A.sector[a]], ss: 207100 };
    if (same && A.sin[a * 6 + j] >= 0) opt.sin = A.sin[a * 6 + j]; else opt.office = Math.min(4, A.layer[a]);
    if (j > 0 && !kid) opt.traits = undefined;
    const i = newPerson(c, h, age * 365 + 180, sex, fam, 0, opt); if (i < 0) break;
    if (j === 0) { for (let k = 0; k < 4; k++) if (A.memK[a * 4 + k]) addMemory(c, i, A.memK[a * 4 + k], -1, A.memV[a * 4 + k]); H.head[h] = i; }
    made.push(i);
  }
  if (!made.length) { H.release(h); return -1; }
  if (made.length >= 2 && ageYears(c, made[1]) >= 18) { P.partner[made[0]] = P.sin[made[1]]; P.partner[made[1]] = P.sin[made[0]]; H.joint[h] = 1; }
  B.pay(E_ROW, E_H0 + h, Math.round(Math.max(300000, Math.min(A.sav[a], 6000000))), AC.X_OTHER, AC.EQUITY, K.transfer);
  H.inc[h] = Math.max(200000, A.inc[a]); H.exp[h] = Math.round(H.inc[h] * 0.85); H.pantry[h] = H.size[h] * 3000;
  const card = c.originate(3, bank, E_H0 + h, 0, c.banks[bank].rates.card, 0, -1); H.card[h] = card; if (card >= 0) { c.loans.lim[card] = 300000; H.cardLim[h] = 300000; }
  const d0 = findHome(c, h, Math.round(H.inc[h] * 0.4));
  if (d0 < 0) { for (const i of made) { relocate(c, P.sin[i], -1, -1, A.place[a]); removeFromHousehold(c, i); P.release(i); } if (same) for (let m = 0; m < 6; m++) { const g = A.sin[a * 6 + m]; if (g >= 0) relocate(c, g, -1, a * 8 + m, A.place[a]); } c.dissolveHousehold(h, "could not find a home"); return -1; }
  moveInto(c, h, d0); for (const i of made) addMemory(c, i, M.moved_to_the_city);
  // a household moving within reach of its work keeps the job and commutes (a county employer, or Duwamish); the
  // earners beyond that look for work here
  const f0 = A.firm[a], F = o.F;
  if (A.status[a] === 2 && f0 >= 0 && F.alive[f0] && (F.layer[f0] === 1 || F.place[f0] === DUWAMISH)) for (let j = 0; j < Math.min(made.length, Math.max(1, A.earners[a])); j++) { const i = made[j]; if (ageYears(c, i) >= 18 && P.status[i] === 3) c.hireAway(i, f0, Math.max(o.PL.mw[F.place[f0]], A.wage[a])); }
  // an earner who held a job where they came from and cannot keep it has usually arranged the next before moving:
  // each takes the best opening for their occupation, if there is one; the others, and the seekers, look for work here
  if (A.status[a] === 2) for (let j = 0; j < Math.min(made.length, Math.max(1, A.earners[a])); j++) { const i = made[j]; if (ageYears(c, i) >= 18 && P.status[i] === 3) c.hireArriving(i); }
  if (same) { for (let m = 0; m < 6; m++) A.sin[a * 6 + m] = -1; A.release(a); }
  c.event("arrival", `The ${c.names.person(made[0]).split(" ")[1]} household (${c.sinText(P.sin[made[0]])}) moves to Port Alder from ${PLACES[A.place[a] ?? 0]?.[1] ?? "outside"}`, made.map((i) => P.sin[i]));
  return h;
}
// a household leaving Port Alder goes on as a sampled household of its new place: its head's temperament, schooling,
// work, savings and memories, and every member's number (it stands for this one household, so it can come back)
export function emigrate(c, h, place) {
  const o = c.outer, A = o.A, F = o.F, P = c.people, H = c.hh, B = c.books, q = place >= 0 ? place : 9;
  const mem = members(c, h), head = H.head[h] >= 0 ? H.head[h] : mem[0]; if (head === undefined) return -1;
  const a = A.alloc(); if (a < 0) { for (const i of mem) relocate(c, P.sin[i], -1, -1, q); return -1; }
  const he = E_H0 + h, ages = mem.map((i) => ageYears(c, i)), kids = ages.filter((x) => x < 18).length;
  A.layer[a] = o.PL.layer[q]; A.place[a] = q; A.w[a] = o.cityWeight / 1000; A.size[a] = Math.min(255, mem.length); A.kids[a] = kids; A.u5[a] = ages.filter((x) => x < 5).length; A.seniors[a] = ages.filter((x) => x >= 65).length;
  A.age[a] = ages[mem.indexOf(head)]; A.bmon[a] = Math.max(1, Math.min(12, Math.ceil(((P.born[head] % 365) + 365) % 365 / 30.5))); A.traits[a] = P.traits[head]; A.edu[a] = P.edu[head];
  A.status[a] = P.status[head] === 5 ? 5 : P.status[head] === 4 ? 4 : 3; A.firm[a] = -1; A.earners[a] = 0; A.wage[a] = Math.max(1713, P.wage[head] || 2000); A.hours[a] = 40;
  // a head who commuted to an employer beyond the city keeps the job when the new home is within its reach
  { const f0 = P.status[head] === 2 && P.emp[head] === E_ROW ? P.away[head] - 1 : -1; if (f0 >= 0 && F.alive[f0] && (F.place[f0] === q || (o.PL.layer[q] === 1 && F.layer[f0] === 1))) { A.status[a] = 2; A.firm[a] = f0; A.earners[a] = 1; A.sector[a] = F.sector[f0]; } }
  A.sav[a] = Math.max(0, B.get(he, AC.DEPOSITS) + B.get(he, AC.SAVINGS)); A.inc[a] = Math.round(H.inc[h]); A.own[a] = 0; A.rent[a] = Math.round(o.PL.rent[q] * (700 + A.size[a] * 120) / 1000 / 100) * 100;
  A.health[a] = P.health[head]; A.mh[a] = P.mh[head]; A.stress[a] = P.stress[head]; A.val[a] = P.val[head]; A.expInf[a] = P.expInf[head]; A.unempM[a] = 0; A.jobM[a] = 0; A.progs[a] = 0; A.ins[a] = A.seniors[a] ? 3 : 0;
  const map = [0, 1, 2, 3, 4, 5]; for (let j = 0; j < 6; j++) A.need[a * 6 + j] = P.need[head * 8 + [0, 3, 2, 7, 4, 5][j]];
  const mk = []; for (let k = 0; k < 8; k++) if (P.memK[head * 8 + k]) mk.push([Math.abs(P.memV[head * 8 + k]), k]); mk.sort((x, y) => y[0] - x[0] || x[1] - y[1]);
  for (let k = 0; k < 4; k++) { const z = mk[k]; A.memK[a * 4 + k] = z ? P.memK[head * 8 + z[1]] : 0; A.memV[a * 4 + k] = z ? P.memV[head * 8 + z[1]] : 0; A.memD[a * 4 + k] = z ? P.memD[head * 8 + z[1]] : 0; }
  A.memK[a * 4 + 3] = M.moved_home; A.memV[a * 4 + 3] = 20; A.memD[a * 4 + 3] = c.epoch;
  A.msex[a] = mem.reduce((bits, i, k) => bits | ((P.sex[i] & 1) << k), 0) & 63;
  priorTrust(c.P, A, "tg", a, Math.max(0, Math.min(3, P.tcLv[head]))); priorTrust(c.P, A, "te", a, Math.max(0, Math.min(3, P.teLv[head])));
  mem.forEach((i, k) => { if (k < 6) { A.sin[a * 6 + k] = P.sin[i]; relocate(c, P.sin[i], -1, a * 8 + k, q); } else relocate(c, P.sin[i], -1, -1, q); });
  for (let k = mem.length; k < 6; k++) A.sin[a * 6 + k] = -1;
  A.moved[a] = c.epoch; A.plan[a] = 0; countMove(o.move, -1, q, (mem.length * o.cityWeight) / 1000);
  return a;
}
// Mondays: strikes stop the pay of the city's commuters who work for the struck employer; settlements restore it
export function outerWeek(c, d) {
  const o = c.outer; if (!o) return; const P = c.people, F = o.F;
  deliverNews(c);
  for (const i of P.each()) {
    const f = P.away[i] - 1; if (f < 0 || P.emp[i] !== E_ROW) continue;
    if (F.strike[f] && !P.awayH[i]) { P.awayH[i] = P.hours[i]; P.hours[i] = 0; addMemory(c, i, M.had_hours_cut, -1, -40); }
    else if (!F.strike[f] && P.awayH[i]) { P.hours[i] = P.awayH[i]; P.awayH[i] = 0; P.wage[i] = Math.max(P.wage[i], Math.round((P.wage[i] * F.wage[f]) / Math.max(1, F.prevW[f]))); }
  }
}

/* ------------------------------------------------------------------ the national bank and statewide initiatives */
// After the last reported decision the national bank meets on the FOMC calendar. Its committee (members with their own
// temperaments) moves toward a rule on the agents' inflation and unemployment (1.5 times inflation's distance from 2%,
// less the unemployment gap, about the neutral rate its own record implies), at most 50 basis points a meeting
export function bankMeeting(c, d) {
  const o = c.outer; if (!o || c.epoch <= FOMC_LAST_KNOWN || !meetingDays(d.y).includes(c.epoch)) return;
  const nat = c.nation, k = nat.monthIndex(c.epoch) - 1, cur = nat.rate(c.epoch), mid = (cur.lo + cur.hi) / 2;
  // the committee's nowcasts of inflation and unemployment from the agents' data (law 62.39), Okun's gap (law 69.50)
  // and the Taylor rule with a neutral real rate of 0.5% (law 69.54); it moves a third of the way, at most 50 bp
  const kp = o.nat.kPi || { x: 3, P: 1 }, ku = o.nat.kU || { x: 4.3, P: 1 };
  o.nat.kPi = kalman(kp.x, kp.P, nat.yoyPpm(k) / 10000, 0.25, 0.05); o.nat.kU = kalman(ku.x, ku.P, o.nat.unemp / 100, 0.04, 0.02);
  // the committee's rule is anchored on its own record: at its first meeting after the reported ones, the rule's
  // neutral rate is read off the rate it had actually set against the inflation and unemployment it then saw, so the
  // committee goes on as it had been deciding and answers what changes from there
  if (o.nat.ruleShift === undefined) o.nat.ruleShift = Math.round(mid - taylor(o.nat.kPi.x, 2, okun(o.nat.kU.x, 4.2), 0.5) * 100);
  const target = taylor(o.nat.kPi.x, 2, okun(o.nat.kU.x, 4.2), 0.5) * 100 + o.nat.ruleShift, step = sat(Math.round((target - mid) / 3 / 25) * 25, -50, 50);
  if (step) { nat.decide(c.epoch, Math.max(0, cur.lo + step), Math.max(25, cur.lo + step + 25)); news(c, 3, 21, `The national bank ${step > 0 ? "raises" : "cuts"} its rate to ${((cur.lo + step) / 100).toFixed(2)}-${((cur.lo + step + 25) / 100).toFixed(2)}%`, step > 0 ? -20 : 15); }
  else c.event("outer", `The national bank holds its rate at ${(cur.lo / 100).toFixed(2)}-${(cur.hi / 100).toFixed(2)}%`);
}
// Puget's initiatives (from 2027): measures that change the State's own programs, put up where need is plainest
export const STATE_MEASURES = [
  { key: "tanf", name: "Initiative to raise WorkFirst grants 15%", apply: (g) => { g.tanfMul = Math.round(g.tanfMul * 1.15); } },
  { key: "ah", name: "Initiative for Apple Health for adults up to 200% of the poverty line, paid by the State", apply: (g) => { g.ahAdultPct = 200; } },
  { key: "wftc", name: "Initiative to grow the Working Families Tax Credit by half", apply: (g) => { g.wftcMul = Math.round(g.wftcMul * 1.5); } },
  { key: "meals", name: "Initiative for free school meals for every student", apply: (g) => { g.mealsAll = 1; } },
  { key: "wccc", name: "Initiative for child care help up to 85% of state median income", apply: (g) => { g.wcccPct = 85; } },
  { key: "rent", name: "Initiative to cap rent increases at 5% a year", apply: (g) => { g.rentCap = 50000; } },
];
export function stateElection(c, d) {
  const o = c.outer; if (!o || d.y < 2027) return;
  const A = o.A, P = c.people, G = c.gov, pg = G.puget, done = new Set(G.stateDone || []), st = o.kpi.stateTotal || {};
  const need = { tanf: st.poverty ?? 100, ah: (st.uninsured ?? 60) * 2, wftc: st.poverty ?? 100, meals: (st.poverty ?? 100) * 0.8, wccc: 60, rent: (o.kpi.state?.rentBurden ?? 300) / 4 };
  const list = STATE_MEASURES.filter((m) => !done.has(m.key)).sort((x, y) => (need[y.key] || 0) - (need[x.key] || 0) || (x.key < y.key ? -1 : 1)).slice(0, 2), results = [];
  for (const m of list) {
    let yes = 0, no = 0;
    const vote = (t, poor, renter, kids, insured, trustLv, w) => {
      const u = (trait(t, T_CIVIC) + trait(t, T_A) - 15) * 3 + (trait(t, T_O) - 8) * 2 - (trait(t, T_THRIFT) - 8) * 4 + (trustLv - 1) * 6
        + (m.key === "tanf" || m.key === "wftc" ? (poor ? 22 : -4) : m.key === "ah" ? (!insured ? 24 : -3) : m.key === "meals" || m.key === "wccc" ? (kids ? 18 : -4) : m.key === "rent" ? (renter ? 24 : -12) : 0);
      if (u > 0) yes += w; else no += w;
    };
    // turnout: the civic-minded and the trusting vote
    for (const a of A.each()) { if (A.layer[a] !== 1 && A.layer[a] !== 2) continue; const t = A.traits[a]; if (trait(t, T_CIVIC) + A.tgLv[a] * 2 < 9) continue; vote(t, A.inc[a] < fplMonthly(A.size[a]) * 2, !A.own[a], A.kids[a] > 0, A.ins[a] > 0, A.tgLv[a], A.w[a] * Math.max(1, A.size[a] - A.kids[a])); }
    const wC = o.cityWeight / 1000;
    for (const i of P.each()) { if (ageYears(c, i) < 18 || P.hh[i] < 0 || trait(P.traits[i], T_CIVIC) + P.tcLv[i] * 2 < 9) continue; const h = P.hh[i]; vote(P.traits[i], c.hh.inc[h] < 400000, c.hh.tenure[h] === 0, c.hh.kids[h] > 0, P.ah[i] > 0 || c.hh.cover[h] > 0, P.tcLv[i], wC); }
    const pass = yes > no; if (pass) { m.apply(pg); done.add(m.key); }
    results.push({ key: m.key, name: m.name, yes: Math.round(yes), no: Math.round(no), pass });
    c.event("election", `Statewide: ${m.name} ${pass ? "passes" : "fails"}, ${Math.round((yes * 1000) / Math.max(1, yes + no)) / 10}% yes`);
  }
  G.stateDone = [...done]; G.stateBallot = results;
}

/* ------------------------------------------------------------------ the KPIs of each layer, nested */
export function kpis(c) {
  const o = c.outer, A = o.A, PL = o.PL, out = {};
  const acc = () => ({ hh: 0, lf: 0, un: 0, poor: 0, unins: 0, snap: 0, mcaid: 0, mood: 0, stress: 0, distress: 0, treated: 0, trust: 0, inc: [], rentBurden: 0, renters: 0 });
  const L = [null, acc(), acc(), acc(), acc()], Pq = Array.from({ length: PL.top }, acc);
  for (const a of A.each()) {
    const w = A.w[a], persons = w * A.size[a], workers = A.status[a] === 2 ? w * A.earners[a] : A.status[a] === 3 ? w : 0;
    for (const x of [L[A.layer[a]], Pq[A.place[a]]]) {
      x.hh += w; x.lf += workers; x.un += A.status[a] === 3 ? w : 0; x.poor += A.inc[a] < fplMonthly(A.size[a]) ? persons : 0;
      x.unins += A.ins[a] || A.seniors[a] ? 0 : persons; x.snap += A.progs[a] & 1 ? persons : 0; x.mcaid += A.progs[a] & 4 ? persons : 0; x.mood += A.val[a] * w; x.stress += A.stress[a] * w;
      x.distress += A.mh[a] > 680 ? persons : 0; x.treated += A.mh[a] > 680 && A.tx[a] ? persons : 0; x.trust += A.tgLv[a] * w; x.inc.push([A.inc[a], w]);
      if (!A.own[a]) { x.rentBurden += Math.min(1000, (A.rent[a] * 1000) / Math.max(1, A.inc[a])) * w; x.renters += w; }
    }
  }
  const med = (arr) => { arr.sort((p, q) => p[0] - q[0] || p[1] - q[1]); const tot = arr.reduce((n, x) => n + x[1], 0); let run = 0; for (const [v, w] of arr) { run += w; if (run >= tot / 2) return v; } return 0; };
  const fin = (x, pop) => ({ pop: Math.round(pop), households: Math.round(x.hh), unemployment: x.lf ? Math.round((x.un * 10000) / x.lf) : 0, poverty: Math.round((x.poor * 1000) / Math.max(1, pop)), uninsured: Math.round((x.unins * 1000) / Math.max(1, pop)),
    snap: Math.round((x.snap * 1000) / Math.max(1, pop)), medicaid: Math.round((x.mcaid * 1000) / Math.max(1, pop)), mood: Math.round(x.mood / Math.max(1, x.hh)), stress: Math.round(x.stress / Math.max(1, x.hh)),
    distress: Math.round((x.distress * 1000) / Math.max(1, pop)), treated: x.distress ? Math.round((x.treated * 1000) / x.distress) : 0, trust: Math.round((x.trust * 1000) / Math.max(1, x.hh) / 3), income: med(x.inc) * 12, rentBurden: Math.round(x.rentBurden / Math.max(1, x.renters)) });
  for (let q = 0; q < PL.top; q++) { const k = fin(Pq[q], PL.pop[q] || 1); PL.unemp[q] = k.unemployment; PL.mood[q] = sat(Math.round(PL.mood[q] * 0.7 + k.mood * 0.3), -1000, 1000); PL.poverty[q] = k.poverty; PL.uninsured[q] = k.uninsured; PL.snap[q] = k.snap; PL.medicaid[q] = k.medicaid; PL.distress[q] = k.distress; PL.treated[q] = k.treated; PL.income[q] = Math.round(k.income / 12); PL.trust[q] = k.trust; }
  const popL = [0, 0, 0, 0, 0]; for (let q = 0; q < PL.top; q++) popL[PL.layer[q]] += PL.pop[q];
  for (let l = 1; l <= 3; l++) { out[LAYERS[l].key] = fin(L[l], popL[l]); const ws = [], vs = []; for (const a of A.each()) if (A.layer[a] === l) { ws.push(A.w[a]); vs.push(A.val[a]); } out[LAYERS[l].key].mood = Math.round(expectation(vs, ws)); }
  out.places = Array.from({ length: PL.top - 1 }, (_, q) => ({ name: PLACES[q][1], basis: PLACES[q][2], layer: PL.layer[q], pop: Math.round(PL.pop[q]), unemployment: PL.unemp[q], mood: PL.mood[q], rent: PL.rent[q], attract: PL.attract[q], poverty: PL.poverty[q], uninsured: PL.uninsured[q], income: PL.income[q] * 12, births: Math.round(PL.births[q]), deaths: Math.round(PL.deaths[q]), migIn: Math.round(PL.migIn[q]), migOut: Math.round(PL.migOut[q]) }));
  const city = o.kpi.city || null, nest = (inner, outer) => { if (!inner) return outer; const tot = inner.pop + outer.pop, f = (key) => Math.round(((inner[key] || 0) * inner.pop + (outer[key] || 0) * outer.pop) / Math.max(1, tot)); const r = { ...outer, pop: tot }; for (const key of ["unemployment", "poverty", "uninsured", "snap", "medicaid", "mood", "distress", "stress", "trust"]) r[key] = f(key); return r; };
  out.city = city; out.countyTotal = nest(city, out.county); out.stateTotal = nest(out.countyTotal, out.state); out.nationTotal = nest(out.stateTotal, out.nation);
  o.nat.unemp = out.nationTotal.unemployment || 410; o.nat.mood = out.nationTotal.mood || 0;
  o.nat.attract = Math.round((out.nationTotal.mood || 0) / 10 - ((out.nationTotal.unemployment || 410) - 420) / 4);
  // more of each layer: inequality (law 74.14), net migration (law 75.39), a ten-year projection (law 75.45), and the
  // checks that the nested totals compose (law 1.42) and that the wage-price loop is stable (law 12.7)
  const flows = o.lastFlows || [];
  for (let l = 1; l <= 3; l++) {
    const inc = [], w = []; const groups = new Array(21).fill(0);
    for (const a of A.each()) if (A.layer[a] === l) { inc.push(A.inc[a] * 12); w.push(A.w[a]); for (let m = 0; m < A.size[a]; m++) groups[Math.min(20, Math.floor(ageOfMember(A, a, m) / 5))] += A.w[a]; }
    const key = LAYERS[l].key; out[key].gini = Math.round(gini(inc, w) * 1000);
    let mi = 0, mo = 0; for (let q = 0; q < PL.top; q++) if (PL.layer[q] === l) { mi += PL.migIn[q] - (flows[q]?.[0] ?? PL.migIn[q]); mo += PL.migOut[q] - (flows[q]?.[1] ?? PL.migOut[q]); }
    out[key].netMigration = Math.round(netMigrationRate(mi * 12, mo * 12, out[key].pop) * 10) / 10;
    const f = groups.map((_, g) => (g >= 3 && g <= 9 ? (asfr(g * 5 + 2) * 5) / 2 : 0)), sv = groups.map((_, g) => ex(-5 * mortality(g * 5 + 2.5, 1.2)));
    let n = groups.slice(); for (let y = 0; y < 2; y++) n = leslie(n, f, sv);
    out[key].projected10 = Math.round(n.reduce((x, v) => x + v, 0) * (out[key].pop / Math.max(1, groups.reduce((x, v) => x + v, 0))));
  }
  o.lastFlows = Array.from({ length: PL.top }, (_, q) => [PL.migIn[q], PL.migOut[q]]);
  if (city) { const direct = (city.unemployment * city.pop + out.county.unemployment * out.county.pop + out.state.unemployment * out.state.pop) / Math.max(1, city.pop + out.county.pop + out.state.pop); out.composes = functorial(out.stateTotal.unemployment, direct, 0.01); }
  const lam = 0.8, learn = 0.25, pass = 0.6; out.wagePriceRadius = Math.round(spectral2(1 - lam, lam * learn, pass, 1 - lam) * 1000) / 1000;
  o.kpi = { ...o.kpi, ...out };
  // what the layers buy from the city: goods and services follow their spending; visitors are the trips they decided on
  let spend = 0, visit = 0; for (const a of A.each()) { if (A.layer[a] === 4) continue; spend += A.spent[a] * A.w[a]; if (A.trip[a] === 2) visit += A.w[a] * A.size[a]; }
  // the first month the layers spend and travel is the base the city's export and visitor demand is measured against
  if (!o.spend0 && spend > 0) o.spend0 = spend; if (!o.visit0 && visit > 0) o.visit0 = visit;
  const q16 = (x, base) => (base ? sat(Math.round((x * 65536) / base), 16384, 262144) : 65536);
  c.nation.setDemand(c.nation.monthIndex(Math.max(1, c.epoch)), q16(spend, o.spend0), q16(visit, o.visit0));
  return out;
}
export function outerBytes(c) { const o = c.outer; return o ? [o.A.bytes(), o.F.bytes(), o.PL.bytes()] : []; }
