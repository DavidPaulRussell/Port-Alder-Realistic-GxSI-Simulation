// The law book. Every dynamic in Port Alder and its outer layers runs on a continuum image from the Corpus
// Compendium on Rails (R. P. Smithson, 2026; github.com/LKVexa/Corpus-Compendium) whose continuum status is an exact
// linear form, which here is what a faithful linear form means. Linearised entries, structural analogues, analogies
// and the class D14 obstructions (vanishing first variations) are not used; class D13 has no faithful continuum image
// in the corpus, so the laws span classes D1-D12 of Part 0. Part 0's tower retracts each continuum image onto its
// linear form up to O(l^2), which is what licenses running each law in its linear form at the city's own scale l.
// Only the equations are implemented here (the corpus does not claim them); entries are cited by station and number.
//
// Determinism: the laws use + - * / and square roots (correctly rounded in every engine) and the fixed tables of
// tables.js (normal quantiles and the census rotations); logarithms, exponentials and sines are summed from series. No law draws a random number; the one sampling law (12.42) runs
// only while the founding census is open, and fails if anything calls it after genesis.
// SPDX-License-Identifier: GPL-3.0-only
import { PROBIT_Q16, ROTATION_Q32 } from "./tables.js";

export const LAWS_VERSION = "1.0.0";
export const CORPUS = { title: "Corpus Compendium on Rails", author: "Russell Philip Smithson", year: 2026, edition: "corrected edition, 15 November 2026", url: "https://github.com/LKVexa/Corpus-Compendium", entries: 4805, faithful: 4294 };
// [station.entry, title, continuum class, continuum status] for every entry the simulation runs on
export const LAW_ROWS = [
  ["1.42", "Functor Laws", "D1", "Exact linear analogue"],
  ["2.14", "Fourier Series", "D12", "Exact linear"],
  ["3.13", "Contraction Mapping Convergence Rate", "D2", "Exact linear"],
  ["4.31", "Fundamental Theorem of Calculus (Part II)", "D1", "Exact linear"],
  ["5.57", "Markov (Stochastic) Matrix", "D4", "Exact linear"],
  ["6.16", "Cyclic Group Presentation", "D12", "Exact linear"],
  ["7.10", "Triangle Area (Cross Product / Shoelace)", "D1", "Exact linear"],
  ["8.26", "Betti Numbers", "D5", "Exact linear"],
  ["9.3", "Congruence Relation", "D5", "Exact linear over ℤ"],
  ["10.11", "Inclusion–Exclusion Principle", "D1", "Exact linear"],
  ["11.2", "Linear First-Order Equation", "D1", "Exact linear"],
  ["12.7", "Stability Criteria (Discrete Time)", "D2", "Exact linear"],
  ["12.42", "Birkhoff Ergodic Theorem", "D4", "Exact linear"],
  ["13.5", "Bayes’ Theorem", "D9", "Exact linear up to normalisation"],
  ["14.58", "Logistic Regression", "D4", "Exact linear in the log-odds"],
  ["15.7", "Kahan Compensated Summation", "D9", "Exact linear"],
  ["16.42", "Backward Euler Method", "D1", "Exact linear"],
  ["17.15", "Karush–Kuhn–Tucker Conditions", "D11", "Exact linear for quadratic programmes"],
  ["18.16", "Little’s Law", "D10", "Exact linear"],
  ["18.20", "Erlang C Formula", "D9", "Exact linear"],
  ["19.41", "Nash Bargaining Solution", "D11", "Exact linear at the optimality condition"],
  ["20.20", "Cournot Equilibrium", "D5", "Exact linear for linear demand"],
  ["21.2", "Newton’s Second Law", "D8", "Exact linear in the accelerations"],
  ["22.17", "Conservation of Mass (Continuity)", "D9", "Exact linear in 𝜌"],
  ["23.9", "Terzaghi Effective Stress", "D4", "Exact linear"],
  ["24.11", "Bernoulli’s Equation", "D3", "Exact linear"],
  ["25.2", "Drag Coeﬀicient", "D3", "Exact linear"],
  ["26.51", "Thermal Resistance Network", "D2", "Exact linear"],
  ["27.4", "Boltzmann Distribution", "D11", "Exact linear"],
  ["28.31", "Poynting Vector", "D3", "Exact linear"],
  ["29.49", "Beer–Lambert Law", "D4", "Exact linear in absorbance"],
  ["30.31", "Photodetector Responsivity", "D3", "Exact linear in power"],
  ["31.17", "Decibel Addition", "D1", "Exact linear in power"],
  ["31.18", "Inverse Square Law in Levels", "D6", "Exact linear in logs"],
  ["32.4", "Expectation Value", "D2", "Exact linear"],
  ["33.4", "Spacetime Interval", "D3", "Exact linear"],
  ["34.1", "Gravitational Potential", "D9", "Exact linear"],
  ["35.16", "Half-Life and Mean Lifetime", "D2", "Exact linear"],
  ["36.48", "Luminosity", "D8", "Exact linear"],
  ["37.25", "Lattice Thermal Conductivity", "D2", "Exact linear"],
  ["38.13", "Collision Frequency", "D1", "Exact linear"],
  ["39.17", "Blackbody Luminosity", "D12", "Exact linear"],
  ["40.6", "Hour Angle and Sidereal Time", "D1", "Exact linear"],
  ["40.10", "Julian Date", "D1", "Exact linear"],
  ["41.2", "Scale Factor and Redshift", "D6", "Exact linear in logs"],
  ["42.13", "First-Order Integrated Rate Law", "D2", "Exact linear"],
  ["43.5", "Variational Theorem", "D2", "Exact linear"],
  ["44.16", "Velocity Verlet Integrator", "D3", "Exact linear"],
  ["45.8", "Gutenberg–Richter Law", "D6", "Exact linear in logs"],
  ["46.11", "Relative Humidity", "D9", "Exact linear in 𝑒"],
  ["47.46", "Degree-Day Melt Model", "D3", "Exact linear"],
  ["48.42", "Equilibrium Tide Amplitude", "D2", "Exact linear"],
  ["49.32", "Rational Method", "D1", "Exact linear"],
  ["50.8", "Hill Equation", "D4", "Exact linear in the logit"],
  ["51.38", "Kleiber’s Law", "D6", "Exact linear in logs"],
  ["52.1", "Needleman–Wunsch Recursion", "D1", "Exact linear"],
  ["53.32", "Stoichiometric Matrix Balance", "D5", "Exact linear"],
  ["54.47", "Breeder’s Equation", "D4", "Exact linear"],
  ["55.16", "Basic Reproduction Number", "D2", "Exact linear"],
  ["55.18", "Next-Generation Matrix", "D10", "Exact linear"],
  ["56.23", "Cox Proportional Hazards Model", "D6", "Exact linear in logs"],
  ["57.9", "Leaky Integrate-and-Fire Model", "D2", "Exact linear between spikes"],
  ["57.22", "Hebbian Learning Rule", "D2", "Exact linear"],
  ["58.36", "Dijkstra’s Algorithm", "D1", "Exact linear"],
  ["59.5", "Median Absolute Deviation", "D4", "Exact linear"],
  ["59.44", "Exponential Smoothing", "D9", "Exact linear"],
  ["60.7", "Softmax Function", "D2", "Exact linear in the weights"],
  ["61.34", "Bellman Expectation Equation", "D2", "Exact linear"],
  ["62.39", "Kalman Filter Update", "D4", "Exact linear"],
  ["63.21", "PID Control Law", "D1", "Exact linear"],
  ["64.4", "Power Dissipation", "D8", "Exact linear"],
  ["65.18", "Miner’s Cumulative Damage Rule", "D1", "Exact linear"],
  ["66.7", "Breguet Range Equation (Jet)", "D6", "Exact linear in logs"],
  ["67.11", "Load, Shear, Moment Relations", "D1", "Exact linear"],
  ["68.1", "General Material Balance", "D11", "Exact linear"],
  ["68.59", "Net Present Value and Payback", "D4", "Exact linear"],
  ["69.7", "Price Elasticity of Demand", "D6", "Exact linear in logs"],
  ["69.11", "Cobb–Douglas Utility and Demand", "D6", "Exact linear in logs"],
  ["69.23", "Monopoly Pricing (Lerner Index)", "D1", "Exact linear"],
  ["69.50", "Okun’s Law", "D4", "Exact linear"],
  ["69.51", "Phillips Curve", "D1", "Exact linear"],
  ["69.54", "Taylor Rule", "D7", "Exact linear"],
  ["70.2", "OLS Estimator", "D4", "Exact linear"],
  ["71.3", "Annuity and Perpetuity", "D9", "Exact linear"],
  ["72.22", "Equivalence Principle", "D1", "Exact linear"],
  ["73.2", "Fechner’s Law", "D6", "Exact linear in logs"],
  ["73.31", "Rasch (One-Parameter) Model", "D1", "Exact linear in the logit"],
  ["74.6", "Strength of Weak Ties", "D1", "Exact linear"],
  ["74.14", "Gini Coeﬀicient", "D5", "Exact linear"],
  ["74.24", "Index of Dissimilarity", "D9", "Exact linear"],
  ["75.19", "Gompertz–Makeham Mortality", "D6", "Exact linear in logs"],
  ["75.27", "Age-Specific Fertility Rate", "D1", "Exact linear"],
  ["75.39", "Net Migration Rate", "D4", "Exact linear"],
  ["75.41", "Gravity Model of Migration", "D6", "Exact linear in logs"],
  ["75.44", "Migration Age Schedule (Rogers–Castro)", "D4", "Exact linear"],
  ["75.45", "Leslie Matrix Projection", "D4", "Exact linear"],
  ["76.5", "Great Circle Distance (Haversine)", "D9", "Exact linear"],
  ["76.39", "Inverse Distance Weighting", "D9", "Exact linear"],
  ["77.19", "Eigenvector Centrality", "D10", "Exact linear"],
  ["78.6", "Urban Scaling Laws", "D6", "Exact linear in logs"],
  ["79.1", "Shannon Entropy", "D1", "Exact linear in surprisal"],
  ["79.8", "Kullback–Leibler Divergence", "D9", "Exact linear in 𝑃"],
  ["80.50", "Lamport Logical Clock", "D1", "Exact linear"]
];
// what each law does in the simulation
export const LAW_USES = {
  "1.42": "nested layers aggregate functorially: city into county into state into nation equals city into nation",
  "2.14": "the seasonal climate of Port Alder (daily mean temperature and sunshine) as a two-harmonic Fourier series of the year",
  "3.13": "outer rents and wages adjust by contractions toward their market-clearing levels, so the adjustment converges",
  "4.31": "every stock is the integral of its flows: the audit checks balances against the day's postings",
  "5.57": "the labour-flow matrix (working, looking, out of the labour force) on the KPI board, rows summing to one",
  "6.16": "the calendar: weekdays as the cyclic group of order seven",
  "7.10": "parcel and roof areas (shoelace) for stormwater and solar",
  "8.26": "the street network's Betti numbers: one connected component, and its loops are the city blocks",
  "9.3": "the check letter of every Social Information Number",
  "10.11": "households on any program, counted exactly from the overlaps",
  "11.2": "needs, moods and stocks relax toward their targets as first-order linear equations",
  "12.7": "the outer wage-price loop is checked for stability (spectral radius below one)",
  "12.42": "the founding census: an irrational rotation whose orbit averages equal the target distributions",
  "13.5": "people update their beliefs (will an application succeed, can an employer be relied on) by Bayes' rule in log-odds",
  "14.58": "banks score credit applications by logistic regression on the applicant's situation",
  "15.7": "weighted KPI sums are compensated (Kahan) so layer totals do not drift",
  "16.42": "the relaxation equations are stepped by backward Euler, unconditionally stable and rational",
  "17.15": "households allocate their budgets by the KKT conditions of their utility",
  "18.16": "Little's law turns queues into waiting times",
  "18.20": "waits for clinics and counselling (Erlang C) decide whether people get care or go without",
  "19.41": "strikes end in the Nash bargaining settlement between workers and employers",
  "20.20": "the city's banks price loans as Cournot competitors",
  "21.2": "vehicles in the 3D city accelerate and brake by Newton's second law",
  "22.17": "traffic on each street is conserved (continuity); density slows it",
  "23.9": "foundations on the waterfront fill cost more where effective stress is low",
  "24.11": "taller buildings need booster pumps once the water main's head runs out (Bernoulli)",
  "25.2": "wind load on towers (drag) adds to their structural cost",
  "26.51": "heat leaks from every home through its walls, roof and windows as a thermal resistance network",
  "27.4": "the households a sampled household stands for spread over destinations in Boltzmann shares",
  "28.31": "sunlight's energy flux on roofs",
  "29.49": "clouds attenuate daylight (Beer-Lambert), for daylight on mood and haze in the 3D city",
  "30.31": "rooftop solar output from the cells' responsivity",
  "31.17": "traffic noise from many sources adds in power",
  "31.18": "noise falls with distance from the street by the inverse square law in decibels",
  "32.4": "every KPI is an expectation value of an observable over the population's state",
  "33.4": "news travels at a finite speed: an event reaches a place only inside its light cone",
  "34.1": "a site's access to jobs and shops is a gravitational potential, which landlords and developers price",
  "35.16": "memories fade with a half-life",
  "36.48": "encounters at a venue are its luminosity times the interaction cross-section",
  "37.25": "the walls' thermal conductivity by the kinetic formula, for each building material",
  "38.13": "street encounters are a collision frequency: density times cross-section times walking speed",
  "39.17": "the colour and brightness of sunlight and street lamps from blackbody luminosity",
  "40.6": "the sun's hour angle, for daylight and shadows",
  "40.10": "the Julian date of every day",
  "41.2": "money is deflated to real terms as a ratio of price-level scale factors",
  "42.13": "fresh food spoils in the pantry by first-order kinetics",
  "43.5": "the city's social cohesion: the friendship network's algebraic connectivity by the variational theorem",
  "44.16": "vehicle motion in the 3D city is integrated by velocity Verlet",
  "45.8": "seismic design for the Puget Sound faults (Gutenberg-Richter) adds to construction cost",
  "46.11": "under-heated homes grow damp (relative humidity), which harms health",
  "47.46": "heating demand from degree-days",
  "48.42": "the tide in Port Gardner",
  "49.32": "stormwater runoff from each parcel (rational method) sets the surface water fee",
  "50.8": "counselling helps with a dose-response (Hill) curve over sessions",
  "51.38": "a household's food needs scale with its members' body mass to the three-quarters (Kleiber)",
  "52.1": "parents choose a newborn's name unlike its siblings' (alignment score)",
  "53.32": "the books: every flow balanced, S v = 0",
  "54.47": "children inherit temperament by the breeder's equation",
  "55.16": "seasonal illness spreads when its reproduction number exceeds one",
  "55.18": "the next-generation matrix of households, workplaces and schools",
  "56.23": "health, coverage, money and distress multiply mortality and illness hazards (Cox)",
  "57.9": "every yes-or-no decision is a leaky integrate-and-fire charge: reasons accumulate, leak, and fire at a threshold",
  "57.22": "acquaintances become friends as their tie strengthens with time spent together (Hebbian)",
  "58.36": "travel times through the street network (Dijkstra)",
  "59.5": "the KPI board flags unusual months by median absolute deviation",
  "59.44": "expectations of prices, pay and rent learn by exponential smoothing",
  "60.7": "outer firms share their markets by softmax over prices",
  "61.34": "households value staying or moving by the Bellman expectation over their horizon",
  "62.39": "the national bank's committee nowcasts inflation and unemployment with a Kalman filter",
  "63.21": "the city council steers its budget balance with a PID rule on the levy",
  "64.4": "household electricity from the power its appliances draw",
  "65.18": "buildings wear by Miner's cumulative damage from use, weather and age",
  "66.7": "airlines' fuel economics (Breguet range) drive aircraft orders at Kestrel Field",
  "67.11": "column loads accumulate floor by floor (load, shear and moment), setting structural cost",
  "68.1": "pantries, inventories and envelopes obey the general material balance",
  "68.59": "developers test projects by net present value and payback",
  "69.7": "purchases respond to price by its elasticity",
  "69.11": "budget shares follow Cobb-Douglas utility",
  "69.23": "firms mark up costs by the Lerner index of the demand they face",
  "69.50": "Okun's law turns unemployment into the output gap the bank sees",
  "69.51": "outer wage setting follows the Phillips curve on expected inflation and slack",
  "69.54": "after the last real decision the national bank sets its rate by the Taylor rule",
  "70.2": "owners extrapolate their sales trend by least squares",
  "71.3": "loan instalments by the annuity formula",
  "72.22": "health plan premiums by the equivalence principle over the pool's expected claims",
  "73.2": "people feel changes in prices and pay on a logarithmic scale (Fechner)",
  "73.31": "whether a person completes an application's paperwork (Rasch: ability against difficulty)",
  "74.6": "job leads travel through acquaintances (the strength of weak ties)",
  "74.14": "income inequality (Gini) for each layer",
  "74.24": "segregation of incomes across neighbourhoods (index of dissimilarity)",
  "75.19": "mortality by Gompertz-Makeham hazards, survival against each person's frailty",
  "75.27": "fertility by age-specific rates, through each couple's wish for a child",
  "75.39": "net migration rates for each layer",
  "75.41": "where movers go: the gravity model on population and distance",
  "75.44": "who moves: the Rogers-Castro age schedule",
  "75.45": "each layer's population projected by its Leslie matrix",
  "76.5": "distances between the places of the Matryoshka (haversine)",
  "76.39": "asking rents from nearby comparable rents (inverse distance weighting)",
  "77.19": "who is listened to: eigenvector centrality in the friendship network",
  "78.6": "productivity and pay scale with a place's population (urban scaling)",
  "79.1": "the mix of land uses and occupations (Shannon entropy)",
  "79.8": "how surprising a month's news is (Kullback-Leibler divergence from expectations)",
  "80.50": "every event carries a Lamport clock, so causes come before effects across layers",
};
export const LAWS = Object.fromEntries(LAW_ROWS.map(([id, title, cls, status]) => [id, { id, station: +id.split(".")[0], entry: +id.split(".")[1], title, cls, status, use: LAW_USES[id] }]));
export const PART0 = { classes: ["D1 Fredholm operator", "D2 Sturm-Liouville", "D3 Dirichlet energy", "D4 Hilbert projection", "D5 kernel dimension and index", "D6 exact differential form", "D7 bifurcation", "D8 heat semigroup", "D9 geodesic distance, eikonal", "D10 Fokker-Planck", "D11 Euler-Lagrange, KKT", "D12 Fourier symbol"], excluded: { D13: "Frechet derivative with remainder: no faithful continuum image in the corpus", D14: "obstruction: vanishing first variation, no faithful linear form" } };
export const faithful = (status) => status.startsWith("Exact linear");
// how often each law ran (diagnostics only; not part of the state)
export const LAW_USE = new Map();
const use = (id) => LAW_USE.set(id, (LAW_USE.get(id) || 0) + 1);
export const lawUse = (id) => use(id);

/* ------------------------------------------------------------------ elementary functions by series */
// Logarithms, exponentials and sines are summed from their power series after exact range reductions, so they use
// only + - * / and give the same doubles in every engine (Math.log, Math.exp and Math.sin need not).
export const LN2 = 0.6931471805599453, LG10 = 3.321928094887362, TAU = 6.283185307179586;
const LN2_HI = 0.693145751953125, LN2_LO = 1.4286068203094172e-6;
export function ln(x) {
  if (!(x > 0)) return -745;
  let n = 0; while (x >= 2) { x /= 2; n++; } while (x < 1) { x *= 2; n--; } if (x > 1.4142135623730951) { x /= 2; n++; }
  const z = (x - 1) / (x + 1), z2 = z * z; let term = z, sum = 0;
  for (let k = 1; k <= 23; k += 2) { sum += term / k; term *= z2; }
  return n * LN2_HI + (n * LN2_LO + 2 * sum);
}
export function ex(y) {
  if (y > 709) return Number.MAX_VALUE; if (y < -745) return 0;
  let n = Math.round(y / LN2); const r = (y - n * LN2_HI) - n * LN2_LO;
  let term = 1, sum = 1; for (let k = 1; k <= 20; k++) { term *= r / k; sum += term; }
  while (n > 0) { sum *= 2; n--; } while (n < 0) { sum /= 2; n++; }
  return sum;
}
export const lg = (x) => ln(x) / LN2;
export const p2 = (y) => ex(y * LN2);
export const powr = (x, a) => (x <= 0 ? 0 : p2(a * lg(x)));
export const log10 = (x) => lg(x) / LG10;
// sine and cosine of an angle in turns (1 = a full circle): reduce to the nearest quarter, then the series
export function sinT(t) {
  t -= Math.floor(t); const q = Math.round(t * 4), x = (t - q / 4) * TAU, x2 = x * x;
  let s = x, c = 1, ts = x, tc = 1;
  for (let k = 1; k <= 11; k++) { ts *= -x2 / ((2 * k) * (2 * k + 1)); s += ts; tc *= -x2 / ((2 * k - 1) * (2 * k)); c += tc; }
  return [s, c, -s, -c][q % 4];
}
export const cosT = (t) => sinT(t + 0.25);
// inverse sine and cosine (in turns), by bisection on the table
export function asinT(x) { x = Math.max(-1, Math.min(1, x)); const s = x < 0 ? -1 : 1; x = Math.abs(x); let lo = 0, hi = 0.25; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (sinT(m) < x) lo = m; else hi = m; } return s * (lo + hi) / 2; }
export const acosT = (x) => 0.25 - asinT(x);
export const DEG = 1 / 360;

/* ------------------------------------------------------------------ 12.42 the founding census */
// The founding population is the one thing that is assigned rather than decided: an equidistributed sample of the
// real distributions, drawn along the orbit of an irrational rotation on the torus (the n-th member of dimension d is
// n times sqrt(p_d) mod 1, from a phase the seed sets). By the ergodic theorem its averages are the distributions'.
const mulmod32 = (n, al) => (n * (al & 0xffff) + ((n * (al >>> 16)) % 65536) * 65536) % 4294967296;
export function censusOpen(c) { c.census = { seed: c.cfg.seed >>> 0, dims: new Map(), open: true }; }
export function censusClose(c) { if (c.census) c.census.open = false; }
export function census(c, salt, a, b = 0) {
  const C = c.census; if (!C || !C.open) throw new Error("the founding census is closed: after genesis every quantity is decided by an agent or computed by a law");
  let d = C.dims.get(salt); if (d === undefined) { d = C.dims.size % 255; C.dims.set(salt, d); }
  use("12.42");
  const x0 = mulmod32(C.seed + 1, ROTATION_Q32[d + 1]), n = (a % 524288) * 4096 + (b % 4096) + 1;
  return (x0 + mulmod32(n, ROTATION_Q32[d])) % 4294967296;
}
// a normal quantile on the scale of the old four-byte bell (sd about 148)
export function censusBell(c, salt, a, b = 0) { const u = census(c, salt, a, b); return Math.round((PROBIT_Q16[Math.floor(u / 4194304)] / 65536) * 147.8); }

/* ------------------------------------------------------------------ decisions and minds */
// 57.9 leaky integrate-and-fire: the charge after a day of drive; the caller fires (and subtracts theta) at threshold
export function lif(v, drive, leak) { use("57.9"); return v - v * leak + drive; }
// 11.2 with 16.42: dx/dt = (target - x)/tau, one backward-Euler day
export function relax(x, target, tau) { use("11.2"); use("16.42"); return (x * tau + target) / (tau + 1); }
// 35.16: a value after `days` with half-life `half`
export function fade(v, days, half) { use("35.16"); return v * p2(-days / half); }
// 13.5: log-odds after evidence with likelihood ratio lr
export function bayes(logit, lr) { use("13.5"); return logit + ln(lr); }
export const toLogit = (p) => ln(p / (1 - p)), fromLogit = (z) => 1 / (1 + ex(-z));
// 73.31 Rasch: the log-odds that a person of ability theta completes an item of difficulty b
export function rasch(theta, b) { use("73.31"); return theta - b; }
// 73.2 Fechner: sensation of a stimulus s against reference s0
export function fechner(s, s0, k = 1) { use("73.2"); return k * ln(Math.max(1e-9, s) / Math.max(1e-9, s0)); }
// 59.44: an expectation learning from what was seen
export function smooth(e, x, lambda) { use("59.44"); return e + lambda * (x - e); }
// 57.22 Hebb: a tie strengthened by time spent together, weakening otherwise
export function hebb(w, together, eta, decay) { use("57.22"); return w + eta * together - decay * w; }
// 61.34: the value of a flow of utility u over a horizon of n periods at discount gamma
export function bellman(u, gamma, n) { use("61.34"); return gamma >= 1 ? u * n : (u * (1 - powr(gamma, n))) / (1 - gamma); }
// 74.6: the novel information a tie carries is what the two people do not share
export function weakTie(overlap) { use("74.6"); return 1 - Math.max(0, Math.min(1, overlap)); }
// 54.47 the breeder's equation: the response is heritability times the selection differential
export function breeder(mean, midparent, h2) { use("54.47"); return mean + h2 * (midparent - mean); }

/* ------------------------------------------------------------------ people: life, health and care */
// 75.19 Gompertz-Makeham: the yearly force of mortality at an age, times a hazard ratio (calibrated so a Washington
// woman lives about 82 years and a man about 78)
export const MORTALITY = { A: 0.00040, B: 0.0000215, b: 0.0935, maleHR: 1.40 };
export function mortality(age, hr = 1) { use("75.19"); return (MORTALITY.A + MORTALITY.B * ex(MORTALITY.b * age)) * hr; }
// the cumulative hazard from birth to an age (closed form of the Gompertz-Makeham integral)
export function cumHazard(age, hr = 1) { use("75.19"); return (MORTALITY.A * age + (MORTALITY.B / MORTALITY.b) * (ex(MORTALITY.b * age) - 1)) * hr; }
// 56.23 Cox: a hazard ratio from a linear predictor
export function cox(lp) { use("56.23"); return ex(lp); }
// 75.27: births per woman per year at an age (Washington: the 2023 U.S. schedule scaled to the state's lower total)
export const ASFR = [[15, 19, 11.8], [20, 24, 52.7], [25, 29, 84.6], [30, 34, 88.7], [35, 39, 50.6], [40, 44, 11.6], [45, 49, 1.0]];
export function asfr(age) { use("75.27"); for (const [a, b, r] of ASFR) if (age >= a && age <= b) return r / 1000; return 0; }
// 55.16: the reproduction number of a contact process
export function r0(beta, contactsPerDay, infectiousDays) { use("55.16"); return beta * contactsPerDay * infectiousDays; }
// 55.18: the dominant eigenvalue of a next-generation matrix (power iteration)
export function nextGeneration(K) { use("55.18"); const n = K.length; let v = new Array(n).fill(1), lam = 0; for (let it = 0; it < 60; it++) { const w = K.map((row) => row.reduce((s, k, j) => s + k * v[j], 0)); lam = Math.max(...w.map(Math.abs)) || 0; if (!lam) return 0; v = w.map((x) => x / lam); } return lam; }
// 18.20 Erlang C with 18.16 Little's law: the chance of waiting and the mean wait (days) for c servers
export function erlangC(lambda, mu, c) {
  use("18.20"); use("18.16");
  if (c <= 0 || mu <= 0) return { pWait: 1, wait: 365 }; const a = lambda / mu, rho = a / c; if (rho >= 1) return { pWait: 1, wait: 365 };
  let term = 1, sum = 1; for (let k = 1; k < c; k++) { term *= a / k; sum += term; } const last = (term * a) / c / (1 - rho), p = last / (sum + last);
  return { pWait: p, wait: p / (c * mu - lambda) };
}
// 50.8 Hill: the share of the full effect reached after s units of a dose
export function hill(s, K, n) { use("50.8"); if (s <= 0) return 0; const x = powr(s / K, n); return x / (1 + x); }
// 51.38 Kleiber: basal energy need (kcal a day) of a body of a given mass
export function kleiber(kg) { use("51.38"); return 70 * powr(Math.max(3, kg), 0.75); }
export const MASS_BY_AGE = (age) => (age < 1 ? 7 : age < 13 ? 10 + age * 3 : age < 18 ? 40 + (age - 13) * 5 : 78);
// 42.13 first order: what is left of a perishable after `days` at rate k a day
export function spoil(amount, k, days) { use("42.13"); return amount * ex(-k * days); }
// 46.11: relative humidity from the vapour pressure and the saturation pressure at the air's temperature (Magnus)
export const satVapour = (tC) => 6.112 * ex((17.62 * tC) / (243.12 + tC));
export function relHumidity(dewC, tC) { use("46.11"); return Math.min(1, satVapour(dewC) / satVapour(tC)); }

/* ------------------------------------------------------------------ people moving */
// 75.44 Rogers-Castro: the age schedule of migration (relative to age 40)
export function rogersCastro(age) { use("75.44"); const f = (x) => 0.02 * ex(-0.08 * x) + 0.06 * ex(-0.1 * (x - 21) - ex(-0.45 * (x - 21))) + 0.003; return f(age) / f(40); }
// 75.41: the log pull of a destination of population m at distance d (km)
export function gravity(m, dKm, beta = 1.6) { use("75.41"); return ln(Math.max(1, m)) - beta * ln(dKm + 20); }
// 27.4 Boltzmann: shares over alternatives of value v at temperature T
export function boltzmann(values, T) { use("27.4"); const m = Math.max(...values), w = values.map((v) => ex((v - m) / T)), z = w.reduce((s, x) => s + x, 0); return w.map((x) => x / z); }
// 76.5 haversine: great-circle distance in km
export function haversine(lat1, lon1, lat2, lon2) {
  use("76.5"); const h = (t) => sinT(t / 2) ** 2, a = h((lat2 - lat1) * DEG) + cosT(lat1 * DEG) * cosT(lat2 * DEG) * h((lon2 - lon1) * DEG);
  return 2 * 6371 * asinT(Math.sqrt(a)) * 2 * Math.PI;
}
// 75.39: net migration per thousand
export function netMigrationRate(inflow, outflow, pop) { use("75.39"); return pop ? ((inflow - outflow) * 1000) / pop : 0; }
// 75.45: one year of a Leslie projection (fertility f[k] per person in group k, survival s[k] to the next group)
export function leslie(n, f, s) { use("75.45"); const out = new Array(n.length).fill(0); out[0] = n.reduce((t, x, k) => t + x * f[k], 0); for (let k = 0; k + 1 < n.length; k++) out[k + 1] += n[k] * s[k]; out[n.length - 1] += n[n.length - 1] * s[n.length - 1]; return out; }
// 33.4: is (dt days, d km) inside the light cone of news travelling at v km a day?
export function causal(dtDays, dKm, v) { use("33.4"); return (v * dtDays) ** 2 - dKm * dKm >= 0; }
// 80.50 Lamport: a clock after receiving a message stamped r
export function lamport(local, r = 0) { use("80.50"); return Math.max(local, r) + 1; }

/* ------------------------------------------------------------------ markets, firms, banks, policy */
// 69.11 with 17.15: Cobb-Douglas shares solve the KKT conditions: spend share alpha_k of the budget on good k
export function budgetShares(alpha, budget) { use("69.11"); use("17.15"); const t = alpha.reduce((s, a) => s + a, 0); return alpha.map((a) => (budget * a) / t); }
// 69.7: quantity at price p against a reference p0 with elasticity eps
export function elastic(q0, p, p0, eps) { use("69.7"); return q0 * powr(p / p0, -eps); }
// 69.23 Lerner: the price that sets the markup to the inverse elasticity
export function lerner(mc, eps) { use("69.23"); return eps > 1.05 ? (mc * eps) / (eps - 1) : mc * 21; }
// 20.20 Cournot: the markup factor of one of n symmetric competitors facing elasticity eps
export function cournot(n, eps) { use("20.20"); const L = 1 / (Math.max(1, n) * Math.max(1.05, eps)); return 1 / (1 - Math.min(0.9, L)); }
// 69.51 Phillips: wage growth from expected inflation and the gap of unemployment to its natural rate
export function phillips(expInf, u, uStar, kappa) { use("69.51"); return expInf - kappa * (u - uStar); }
// 69.50 Okun: the output gap from unemployment
export function okun(u, uStar, k = 2) { use("69.50"); return -k * (u - uStar); }
// 69.54 Taylor: the policy rate (all in percent)
export function taylor(pi, piStar, gap, rStar) { use("69.54"); return rStar + pi + 0.5 * (pi - piStar) + 0.5 * gap; }
// 62.39 Kalman: a scalar estimate x with variance P updated by a measurement z with variance R
export function kalman(x, P, z, R, Qp = 0) { use("62.39"); const Pp = P + Qp, K = Pp / (Pp + R); return { x: x + K * (z - x), P: (1 - K) * Pp }; }
// 19.41 Nash bargaining: the settlement giving each side its threat point plus its share of the surplus
export function nash(threatW, surplus, beta) { use("19.41"); return threatW + beta * surplus; }
// 60.7 softmax: market shares over scores with sensitivity beta
export function softmax(scores, beta) { use("60.7"); const m = Math.max(...scores), w = scores.map((s) => ex(beta * (s - m))), z = w.reduce((a, b) => a + b, 0); return w.map((x) => x / z); }
// 70.2 OLS: the slope and level of a series against time
export function ols(ys) { use("70.2"); const n = ys.length; if (n < 2) return { slope: 0, level: ys[0] || 0 }; const tm = (n - 1) / 2, ym = ys.reduce((s, y) => s + y, 0) / n; let sxy = 0, sxx = 0; ys.forEach((y, t) => { sxy += (t - tm) * (y - ym); sxx += (t - tm) ** 2; }); const slope = sxy / sxx; return { slope, level: ym + slope * (n - 1 - tm) }; }
// 71.3: the instalment that repays principal P at rate r a period over n periods
export function annuity(P, r, n) { use("71.3"); return r === 0 ? P / n : (P * r) / (1 - powr(1 + r, -n)); }
// 72.22: the premium that equates expected premiums with expected claims, with a loading
export function premium(expectedClaims, members, load) { use("72.22"); return members ? ((expectedClaims * (1 + load)) / members) : 0; }
// 14.58: the log-odds score of a credit application
export function creditScore(beta, x) { use("14.58"); return beta.reduce((s, b, k) => s + b * (k ? x[k - 1] : 1), 0); }
// 68.59: net present value of cash flows at a monthly rate, and the payback period in months
export function npv(cash, r) { use("68.59"); let v = 0, run = 0, pay = -1; cash.forEach((x, t) => { v += x / powr(1 + r, t); run += x; if (pay < 0 && run >= 0 && t > 0) pay = t; }); return { npv: v, payback: pay }; }
// 68.1: a stock after inflow, outflow, generation and consumption
export function balance(stock, inflow, outflow, gen = 0, cons = 0) { use("68.1"); return stock + inflow - outflow + gen - cons; }
// 63.21 PID: the controller's output for an error, with its integral and last error kept in s
export function pid(s, err, kp, ki, kd) { use("63.21"); s.i = (s.i || 0) + err; const d = err - (s.e ?? err); s.e = err; return kp * err + ki * s.i + kd * d; }
// 3.13: one contraction step toward a target (|1 - lambda| < 1 converges)
export function contract(x, target, lambda) { use("3.13"); if (!(lambda > 0 && lambda < 2)) throw new Error("not a contraction"); return x + lambda * (target - x); }
// 12.7: the spectral radius of a 2x2 adjustment matrix (stable when below one)
export function spectral2(a, b, c, d) { use("12.7"); const tr = a + d, det = a * d - b * c, disc = tr * tr - 4 * det; return disc >= 0 ? Math.max(Math.abs((tr + Math.sqrt(disc)) / 2), Math.abs((tr - Math.sqrt(disc)) / 2)) : Math.sqrt(det); }
// 78.6 urban scaling: output of a place of population N against one of N0
export function urbanScale(N, N0, beta = 1.12) { use("78.6"); return powr(N / N0, beta); }
// 41.2: a nominal amount at price scale aThen, in money of price scale aNow
export function deflate(amount, aThen, aNow) { use("41.2"); return (amount * aThen) / aNow; }
// 34.1: the potential at (x, y) of masses [x, y, m] (cells; one cell softening)
export function potential(masses, x, y) { use("34.1"); let v = 0; for (const [mx, my, m] of masses) v += m / (Math.sqrt((mx - x) ** 2 + (my - y) ** 2) + 1); return v; }
// 76.39: the inverse-distance-weighted value at (x, y) of samples [x, y, v] (power two)
export function idw(samples, x, y) { use("76.39"); let s = 0, w = 0; for (const [sx, sy, v] of samples) { const d2 = (sx - x) ** 2 + (sy - y) ** 2; if (d2 === 0) return v; s += v / d2; w += 1 / d2; } return w ? s / w : 0; }

/* ------------------------------------------------------------------ buildings, energy and water */
// 37.25: a solid's thermal conductivity, one third of heat capacity x sound speed x phonon mean free path (W/m K)
export function kinetic(Cvol, v, l) { use("37.25"); return (Cvol * v * l) / 3; }
// the U-value (W/m2 K) of a wall of layers [thickness m, conductivity W/m K]
export const uValue = (layers) => 1 / (0.13 + layers.reduce((s, [d, k]) => s + d / k, 0) + 0.04);
// 26.51: heat loss (W) through elements [area m2, U] at a temperature difference
export function heatLoss(elements, dT) { use("26.51"); return elements.reduce((s, [A, U]) => s + A * U, 0) * dT; }
// 47.46: degree-days of a day with mean temperature t against a base
export function degreeDays(t, base) { use("47.46"); return Math.max(0, base - t); }
// 64.4: energy (kWh) drawn by a load of watts over hours
export function energy(watts, hours) { use("64.4"); return (watts * hours) / 1000; }
// 49.32 the rational method: peak runoff (m3/s) from runoff coefficient C, rain intensity (mm/h) and area (m2)
export function rational(C, mmPerHour, m2) { use("49.32"); return (C * (mmPerHour / 3600000) * m2); }
// 7.10 shoelace: the area of a polygon [[x, y], ...]
export function shoelace(poly) { use("7.10"); let s = 0; for (let k = 0; k < poly.length; k++) { const [x1, y1] = poly[k], [x2, y2] = poly[(k + 1) % poly.length]; s += x1 * y2 - x2 * y1; } return Math.abs(s) / 2; }
// 65.18 Miner: damage after n cycles of a kind that fails at N
export function miner(D, n, N) { use("65.18"); return D + n / N; }
// 67.11: the axial load at the base of a column carrying `floors` floors of `kPa` over a tributary area (kN)
export function columnLoad(floors, kPa, m2) { use("67.11"); let V = 0; for (let k = 0; k < floors; k++) V += kPa * m2; return V; }
// 23.9 Terzaghi: effective stress (kPa) at a depth with water table depth w (soil unit weight 19, water 9.81 kN/m3)
export function effectiveStress(depth, w) { use("23.9"); return 19 * depth - 9.81 * Math.max(0, depth - w); }
// 24.11 Bernoulli: the pressure (kPa) left at height z above a main at pMain kPa
export function headLeft(pMain, z) { use("24.11"); return pMain - 9.81 * z; }
// 25.2: drag force (kN) of wind at v m/s on area A with coefficient Cd
export function drag(v, A, Cd = 1.3) { use("25.2"); return (0.5 * 1.225 * v * v * Cd * A) / 1000; }
// 45.8 Gutenberg-Richter: yearly rate of earthquakes of magnitude at least M
export function gutenberg(a, b, M) { use("45.8"); return p2((a - b * M) * LG10); }
// 28.31 Poynting: the solar flux (W/m2) through a surface at a solar elevation (turns) and a cloud transmittance
export function solarFlux(elev, transmit) { use("28.31"); return Math.max(0, 1361 * sinT(elev) * transmit); }
// 30.31: a photodiode's current (A) from optical power (W) at responsivity R (A/W)
export function responsivity(power, R) { use("30.31"); return power * R; }
// 29.49 Beer-Lambert: transmitted fraction for an absorbance (base 10)
export function beerLambert(absorbance) { use("29.49"); return p2(-absorbance * LG10); }
// 31.17 and 31.18: sound levels add in power; fall 20 log10 with distance
export function dbAdd(levels) { use("31.17"); let s = 0; for (const L of levels) s += p2((L / 10) * LG10); return s > 0 ? 10 * log10(s) : 0; }
export function dbAt(L0, r0, r) { use("31.18"); return L0 - 20 * log10(Math.max(r, r0) / r0); }
// 39.17: a blackbody's luminosity ratio against a reference temperature, and its colour (Planck at 610, 550, 465 nm)
export function blackbody(T, T0 = 5772) {
  use("39.17"); const planck = (nm) => 1 / (powr(nm, 5) * (ex(14387770 / (nm * T)) - 1));
  const r = planck(610), g = planck(550), b = planck(465), m = Math.max(r, g, b);
  return { lum: powr(T / T0, 4), rgb: [r / m, g / m, b / m] };
}
// 40.10: the Julian date of a civil date at 0h UT; 40.6: the hour angle (turns) of the sun at a longitude and hour
export function julian(y, m, d) { use("40.10"); if (m <= 2) { y--; m += 12; } const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4); return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5; }
// the sun at an hour (UT) of a Julian date: declination from the ecliptic longitude, the hour angle from local
// apparent solar time (with the equation of time), the elevation, and the day's hours of daylight (all angles in turns)
export function sun(jd, hourUT, lat, lon) {
  use("40.6"); const n = jd + hourUT / 24 - 2451545, L = (280.46 + 0.9856474 * n) * DEG, g = (357.528 + 0.9856003 * n) * DEG;
  const lam = L + (1.915 * sinT(g) + 0.02 * sinT(2 * g)) * DEG, eps = (23.439 - 0.0000004 * n) * DEG;
  const dec = asinT(sinT(eps) * sinT(lam)), B = ((n % 365.25) - 80) / 365.25;
  const eot = 9.87 * sinT(2 * B) - 7.53 * cosT(B) - 1.5 * sinT(B), solar = hourUT + lon / 15 + eot / 60, ha = (solar - 12) / 24;
  const elev = asinT(sinT(lat * DEG) * sinT(dec) + cosT(lat * DEG) * cosT(dec) * cosT(ha));
  const cosH0 = (sinT(-0.833 * DEG) - sinT(lat * DEG) * sinT(dec)) / (cosT(lat * DEG) * cosT(dec));
  return { elev, dec, ha, daylight: 48 * acosT(Math.max(-1, Math.min(1, cosH0))) };
}
// 48.42: the equilibrium tide height from constituents [amplitude m, period h, phase turns] at an hour
export function tide(constituents, hour) { use("48.42"); return constituents.reduce((s, [A, T, ph]) => s + A * cosT(hour / T - ph), 0); }
// 2.14: a Fourier series of a quantity over the year (t in turns of the year)
export function fourier(a0, terms, t) { use("2.14"); return terms.reduce((s, [a, b], k) => s + a * cosT((k + 1) * t) + b * sinT((k + 1) * t), a0); }

/* ------------------------------------------------------------------ motion (the 3D city) */
// 21.2: acceleration from force and mass; 44.16: one velocity-Verlet step
export function accel(F, m) { use("21.2"); return F / m; }
export function verlet(x, v, a, aNext, dt) { use("44.16"); return { x: x + v * dt + 0.5 * a * dt * dt, v: v + 0.5 * (a + aNext) * dt }; }
// 22.17 continuity: a link's density after inflow and outflow; with Greenshields' speed-density relation
export function continuity(rho, inflow, outflow, len) { use("22.17"); return Math.max(0, rho + (inflow - outflow) / len); }
export const greenshields = (vFree, rho, rhoJam) => vFree * Math.max(0.1, 1 - rho / rhoJam);

/* ------------------------------------------------------------------ networks */
// 58.36 Dijkstra from a source over n nodes: edges(u, visit) calls visit(v, w)
export function dijkstra(n, source, edges) {
  use("58.36"); const dist = new Float64Array(n).fill(Infinity), heap = [[0, source]]; dist[source] = 0;
  const push = (it) => { heap.push(it); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] < it[0] || (heap[p][0] === it[0] && heap[p][1] <= it[1])) break; heap[k] = heap[p]; k = p; } heap[k] = it; };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { let k = 0; for (;;) { let m = k * 2 + 1; if (m >= heap.length) break; if (m + 1 < heap.length && (heap[m + 1][0] < heap[m][0] || (heap[m + 1][0] === heap[m][0] && heap[m + 1][1] < heap[m][1]))) m++; if (heap[m][0] > last[0] || (heap[m][0] === last[0] && heap[m][1] >= last[1])) break; heap[k] = heap[m]; k = m; } heap[k] = last; } return top; };
  while (heap.length) { const [d, u] = pop(); if (d > dist[u]) continue; edges(u, (v, w) => { const nd = d + w; if (nd < dist[v]) { dist[v] = nd; push([nd, v]); } }); }
  return dist;
}
// 8.26: Betti numbers of a graph: components and independent loops
export function betti(nNodes, edges) { use("8.26"); const p = Int32Array.from({ length: nNodes }, (_, k) => k), f = (x) => { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; }; let comp = nNodes; for (const [a, b] of edges) { const ra = f(a), rb = f(b); if (ra !== rb) { p[ra] = rb; comp--; } } return { b0: comp, b1: edges.length - nNodes + comp }; }
// 77.19 eigenvector centrality by power iteration (adjacency lists), scaled so the largest is one
export function centrality(adj) { use("77.19"); const n = adj.length; let v = new Float64Array(n).fill(1); for (let it = 0; it < 40; it++) { const w = new Float64Array(n); for (let i = 0; i < n; i++) for (const j of adj[i]) w[i] += v[j] + 0.01; let m = 0; for (const x of w) if (x > m) m = x; if (!m) return v; for (let i = 0; i < n; i++) w[i] /= m; v = w; } return v; }
// 43.5: the algebraic connectivity of a graph, the smallest nonzero Laplacian eigenvalue, minimising the Rayleigh
// quotient over vectors orthogonal to the constant (power iteration on cI - L)
export function connectivity(adj) {
  use("43.5"); const n = adj.length; if (n < 3) return 0; let dmax = 0; for (const a of adj) dmax = Math.max(dmax, a.length); const cI = 2 * dmax + 1;
  let v = Float64Array.from({ length: n }, (_, k) => ((k * 0.6180339887) % 1) - 0.5), lam = 0;
  for (let it = 0; it < 120; it++) { let m = 0; for (const x of v) m += x; m /= n; for (let k = 0; k < n; k++) v[k] -= m; const w = new Float64Array(n); for (let i = 0; i < n; i++) { let lv = adj[i].length * v[i]; for (const j of adj[i]) lv -= v[j]; w[i] = cI * v[i] - lv; } let nn = 0; for (const x of w) nn += x * x; nn = Math.sqrt(nn); if (!nn) return 0; for (let k = 0; k < n; k++) v[k] = w[k] / nn; }
  let num = 0, den = 0; for (let i = 0; i < n; i++) { let lv = adj[i].length * v[i]; for (const j of adj[i]) lv -= v[j]; num += v[i] * lv; den += v[i] * v[i]; } lam = den ? num / den : 0; return lam;
}
// 38.13: collisions a second per walker: density (per m2) x cross-section (m) x speed (m/s)
export function collisions(density, sigma, speed) { use("38.13"); return density * sigma * speed; }
// 36.48: interactions at a venue: cross-section x luminosity (attendee flux)
export function interactions(sigma, luminosity) { use("36.48"); return sigma * luminosity; }

/* ------------------------------------------------------------------ measurement, books and identity */
// 15.7 Kahan: a compensated sum
export class KSum { constructor() { this.s = 0; this.c = 0; } add(x) { const y = x - this.c, t = this.s + y; this.c = (t - this.s) - y; this.s = t; return this; } get value() { return this.s; } }
export function ksum(values) { use("15.7"); const k = new KSum(); for (const v of values) k.add(v); return k.value; }
// 32.4: the expectation of an observable over states with weights
export function expectation(values, weights) { use("32.4"); use("15.7"); const a = new KSum(), w = new KSum(); for (let k = 0; k < values.length; k++) { const q = weights ? weights[k] : 1; a.add(values[k] * q); w.add(q); } return w.value ? a.value / w.value : 0; }
// 74.14 Gini of weighted values
export function gini(values, weights) { use("74.14"); const idx = values.map((_, k) => k).sort((a, b) => values[a] - values[b] || a - b); let W = 0, S = 0; for (const k of idx) { const q = weights ? weights[k] : 1; W += q; S += q * values[k]; } if (!W || !S) return 0; let cum = 0, area = 0; for (const k of idx) { const q = weights ? weights[k] : 1, prev = cum; cum += q * values[k]; area += (q / W) * (prev + cum) / (2 * S); } return 1 - 2 * area; }
// 74.24: dissimilarity of two groups' counts across areas
export function dissimilarity(a, b) { use("74.24"); const A = a.reduce((s, x) => s + x, 0), B = b.reduce((s, x) => s + x, 0); if (!A || !B) return 0; let d = 0; for (let k = 0; k < a.length; k++) d += Math.abs(a[k] / A - b[k] / B); return d / 2; }
// 79.1: Shannon entropy (bits) of counts; 79.8: Kullback-Leibler divergence (bits) of p from q
export function entropy(counts) { use("79.1"); const t = counts.reduce((s, x) => s + x, 0); let h = 0; for (const x of counts) if (x > 0) h -= (x / t) * lg(x / t); return h; }
export function kl(p, q) { use("79.8"); const tp = p.reduce((s, x) => s + x, 0), tq = q.reduce((s, x) => s + x, 0); let d = 0; for (let k = 0; k < p.length; k++) if (p[k] > 0) d += (p[k] / tp) * lg((p[k] / tp) / Math.max(1e-12, q[k] / tq)); return d; }
// 59.5: median and median absolute deviation, and whether a value is an outlier at k robust deviations
export function mad(values) { use("59.5"); const s = [...values].sort((a, b) => a - b), med = s.length ? s[s.length >> 1] : 0, dev = s.map((x) => Math.abs(x - med)).sort((a, b) => a - b); return { median: med, mad: dev.length ? dev[dev.length >> 1] * 1.4826 : 0 }; }
// 10.11 inclusion-exclusion: how many are in at least one of k sets, from the sizes of all intersections (by mask)
export function unionSize(inter, k) { use("10.11"); let total = 0; for (let m = 1; m < 1 << k; m++) { let bits = 0; for (let j = 0; j < k; j++) if (m & (1 << j)) bits++; total += (bits & 1 ? 1 : -1) * (inter[m] || 0); } return total; }
// 5.57: a row-stochastic transition matrix from counts
export function stochastic(counts) { use("5.57"); return counts.map((row) => { const t = row.reduce((s, x) => s + x, 0); return row.map((x) => (t ? x / t : 0)); }); }
// 4.31 and 53.32: the change in a stock equals the sum of its flows, and every posting balances (S v = 0)
export function ftc(opening, flows, closing) { use("4.31"); let s = opening; for (const f of flows) s += f; return s === closing; }
export function balanced(debits, credits) { use("53.32"); return debits === credits; }
// 1.42: aggregation composes along nested inclusions: agg(agg(a), b) === agg(a, b)
export function functorial(aggOfNested, aggDirect, tol = 1e-6) { use("1.42"); return Math.abs(aggOfNested - aggDirect) <= tol * Math.max(1, Math.abs(aggDirect)); }
// 6.16: the weekday of a day count, in the cyclic group of order seven (1970-01-01 was a Thursday)
export function weekday(days) { use("6.16"); return (((days % 7) + 11) % 7); }
// 9.3: the check letter of a Social Information Number: a weighted sum of its symbols, congruent mod 29
export const SIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456";
export function sinCheck(symbols) { use("9.3"); let s = 0; for (let k = 0; k < symbols.length; k++) s += (k + 1) * symbols[k]; return SIN_ALPHABET[s % 29]; }
// 52.1 Needleman-Wunsch: global alignment score of two names (match 2, mismatch -1, gap -1)
export function align(a, b) { use("52.1"); const n = a.length, m = b.length; let prev = Array.from({ length: m + 1 }, (_, j) => -j); for (let i = 1; i <= n; i++) { const cur = [-i]; for (let j = 1; j <= m; j++) cur[j] = Math.max(prev[j - 1] + (a[i - 1] === b[j - 1] ? 2 : -1), prev[j] - 1, cur[j - 1] - 1); prev = cur; } return prev[m]; }
