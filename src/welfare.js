// The safety net of Port Alder: the real Washington and federal programs at their published 2026 rules, each one
// applied for (or not) by people deciding for themselves, and the city's own additions to them, which the citizens
// vote on each November. Eligibility, benefits and every payment are integer cents through the books.
//
// The state and federal programs follow their law; a city cannot change it. What the citizens decide is (1) whether
// to apply (take-up depends on what a person knows, needs, has been through, whom they trust and what their friends
// do), and (2) the Port Alder measures on the ballot, which add to those programs and are paid for by levy lid lifts.
// SPDX-License-Identifier: GPL-3.0-only
import { ppm } from "./rules.js";
import { SECTORS, S as SK } from "./citydata.js";
import { AC, K, E_H0, E_F0, E_B0, E_CITY, E_SCHOOL, E_STATE, E_FEDGOV, E_ROW } from "./books.js";
import { sat, admitE1 } from "./core.js";
import { lif, rasch, bayes, toLogit, fromLogit } from "./laws.js";
import { members, ageYears, addMemory, remembers, M, trait, T_O, T_C, T_E, T_A, T_N, T_THRIFT, T_CIVIC } from "./people.js";

export const WELFARE_VERSION = "1.0.0";
export const WELFARE_SOURCES = {
  povertyGuidelines2026: "https://www.federalregister.gov/documents/2026/01/15/2026-00755/annual-update-of-the-hhs-poverty-guidelines",
  snapCola: "https://www.fns.usda.gov/snap/allotment/cola",
  basicFoodCategorical: "https://www.dshs.wa.gov/esa/eligibility-z-manual-ea-z/categorical-eligibility-basic-food",
  basicFoodAbawd: "https://www.dshs.wa.gov/esa/basic-food-work-requirements/abawds-able-bodied-adults-without-dependents",
  tanfPaymentStandards: "https://app.leg.wa.gov/wac/default.aspx?cite=388-478-0020",
  tanfProfile: "https://www.nccp.org/wp-content/uploads/2026/04/TANF-2025-26-Profile-Washington-.pdf",
  abdPaymentStandards: "https://app.leg.wa.gov/wac/default.aspx?cite=388-478-0033",
  appleHealthStandards: "https://www.hca.wa.gov/assets/free-or-low-cost/income-standards-20260401.pdf",
  appleHealthHR1: "https://www.hca.wa.gov/assets/free-or-low-cost/hr1-work-requirements-and-renewals-fact-sheet.pdf",
  ssi2026: "https://www.ssa.gov/oact/cola/SSI.html",
  wcccCopays: "https://dcyf.wa.gov/services/earlylearning-childcare/getting-help/wccc",
  sunBucks: "https://www.dshs.wa.gov/sunbucks",
  schoolMeals: "https://ospi.k12.wa.us/policy-funding/child-nutrition/school-meals/meals-washington-students",
  wicFoodCost: "https://www.fns.usda.gov/pd/wic-program",
  eitc2026: "https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill",
  eitc2025: "https://www.cbpp.org/research/federal-tax/policy-basics-the-earned-income-tax-credit",
  wftc: "https://dor.wa.gov/about/news-releases/2026/working-families-tax-credit-application-window-opens-feb-1",
  relocation: "https://app.leg.wa.gov/rcw/default.aspx?cite=59.18.440",
  hcvRent: "https://www.ecfr.gov/current/title-24/subtitle-A/part-5/subpart-F/section-5.628",
};

/* ------------------------------------------------------------------ the published figures */
// 2026 HHS poverty guidelines, 48 states: $15,960 for one person, $5,680 for each additional (annual, cents)
const FPL_2026 = [1596000, 568000];
// SNAP by federal fiscal year (October to September), 48 states: maximum allotments 1-8 and each additional,
// standard deductions 1-6+, the excess shelter cap and the minimum benefit (households of 1-2), cents a month
const SNAP = {
  2026: { max: [0, 29800, 54600, 78500, 99400, 118300, 142100, 157100, 178900], add: 21800, std: [0, 20900, 20900, 20900, 22300, 26100, 29900], cap: 74400, min: 2400 },
  2027: { max: [0, 30600, 56200, 80800, 102300, 121700, 146300, 161600, 184100], add: 22500, std: [0, 21700, 21700, 21700, 22900, 26800, 30800], cap: 76900, min: 2500 },
};
// WorkFirst (TANF) payment standards by assistance unit size, effective January 1, 2024 (WAC 388-478-0020)
const TANF_PS = [0, 45000, 57000, 70600, 83300, 95900, 109000, 125800, 139200, 152900, 166200];
const TANF_DISREGARD = 50000, TANF_RESOURCES = 1200000, TANF_MONTHS = 60;
// aged, blind, or disabled cash (WAC 388-478-0033): one person, two people
const ABD_PS = [0, 45000, 57000];
// Apple Health monthly MAGI limits from April 1, 2026 (5% disregard included): adults (138%), children free (215%),
// CHIP with premiums (265% $20, 317% $30); households 1-5, then the step for each further person
const AH = { adult: [0, 183500, 249000, 314200, 379500, 444900], kids: [0, 286000, 387900, 489600, 591300, 693200], chip1: [0, 352500, 478100, 603400, 728800, 854400], chip2: [0, 421600, 571900, 721800, 871800, 1022000] };
const AH_WORK_FROM = 2027;                     // H.R. 1: work requirements and six-month renewals for Apple Health for Adults from January 1, 2027
// SSI federal benefit rate 2026: $994 individual, $1,491 couple; resources $2,000 / $3,000
const SSI = { one: 99400, two: 149100, res1: 200000, res2: 300000 };
// Working Connections Child Care, the copay table effective October 1, 2026: monthly income at 20/36/50/60/65% of
// state median income by family size 1-8 (dollars), and the copays ($0, $65, $90, $165, $215); entry at or below 60% SMI
const WCCC_BANDS = [[1207, 1578, 1950, 2321, 2693, 3064, 3134, 3204], [2173, 2841, 3510, 4179, 4848, 5516, 5642, 5767], [3018, 3947, 4875, 5804, 6733, 7662, 7836, 8010],
  [3622, 4736, 5851, 6965, 8080, 9194, 9403, 9612], [3923, 5131, 6338, 7546, 8753, 9960, 10187, 10413]];
const WCCC_COPAY = [0, 6500, 9000, 16500, 21500];
const WIC_FOOD = 6492;                          // average monthly WIC food cost per participant, FY 2025 (national)
const SUN_BUCKS = 12000;                        // $120 per eligible school-age child, each summer
// the federal EITC by tax year: [max credit, earned income amount, phase-out start single, phase-out start joint] for 0,1,2,3+ children
export const EITC = {
  2025: [[64900, 849000, 1062000, 1773000], [432800, 1273000, 2335000, 3047000], [715200, 1788000, 2335000, 3047000], [804600, 1788000, 2335000, 3047000]],
  2026: [[66400, 868000, 1086000, 1814000], [442700, 1302000, 2389000, 3117000], [731600, 1829000, 2389000, 3117000], [823100, 1829000, 2389000, 3117000]],
};
const EITC_OUT = [76500, 159800, 210600, 210600];             // phase-out rates (ppm), 26 U.S.C. 32(b)
const EITC_INVEST = 1195000;                                  // investment income limit, tax year 2025
// Washington's Working Families Tax Credit, tax year 2025: by qualifying children 0-3+ (indexed by the State thereafter)
const WFTC_2025 = [33500, 66000, 99500, 133000];

const fyOf = (d) => (d.m >= 10 ? d.y + 1 : d.y);
// the housing assistance payment: the tenant pays 30% of adjusted income (at least 10% of gross), HUD pays the landlord
// the rest of the rent up to the payment standard (110% of the fair market rent for the home's size; 24 CFR 982.505)
function hapOf(c, h, comp, inc) {
  const H = c.hh, G = c.gov, adjInc = Math.max(0, inc.gross - comp.kids * 4000), share = Math.max(Math.round(adjInc * 0.3), Math.round(inc.gross * 0.1));
  return Math.max(0, Math.min(H.rent[h], Math.round((G.rentBy?.[Math.min(4, c.world.dwellings.rooms[H.home[h]] || 1)] || H.rent[h]) * 1.1)) - share);
}
export function fpl(c, y, n) {
  let v = FPL_2026[0] + FPL_2026[1] * Math.max(0, n - 1);
  if (y > 2026) v = Math.round((v * c.nation.cpiRatio(2026, y - 1)) / 65536);
  return v;                                               // annual cents
}
function snapYear(c, fy) {
  if (SNAP[fy]) return SNAP[fy];
  const b = SNAP[2027], r = c.nation.cpiRatio(2026, fy - 1), x = (v) => Math.round((v * r) / 65536 / 100) * 100;
  return { max: b.max.map(x), add: x(b.add), std: b.std.map(x), cap: x(b.cap), min: x(b.min) };
}
export function eitcTable(c, y) {
  if (EITC[y]) return EITC[y];
  const r = c.nation.cpiRatio(2026, y - 1), x = (v) => Math.round((v * r) / 65536 / 1000) * 1000;
  return EITC[2026].map((row) => row.map(x));
}
// the federal earned income credit for a return
export function eitc(c, y, kids, earned, agi, joint, invest) {
  if (invest > EITC_INVEST) return 0;
  const k = Math.min(3, kids), [max, amt, outS, outJ] = eitcTable(c, y)[k], start = joint ? outJ : outS;
  const phaseIn = Math.min(max, Math.round((earned * max) / Math.max(1, amt)));
  const inc = Math.max(earned, agi), red = inc > start ? ppm(inc - start, EITC_OUT[k]) : 0;
  return Math.max(0, Math.min(phaseIn, max - red));
}
function wftcAmount(c, ty, kids, credit) {
  if (credit <= 0) return 0;
  let v = WFTC_2025[Math.min(3, kids)];
  if (ty > 2025) v = Math.round((v * c.nation.cpiRatio(2025, ty - 1)) / 65536 / 500) * 500;
  return v;
}

/* ------------------------------------------------------------------ the city's own measures */
// Port Alder measures: each funds a local addition to a real program by a levy lid lift (per $1,000 of assessed
// value, in ppm of value), for a number of years. A lid lift in Washington passes by a simple majority.
export const MEASURES = [
  { key: "fresh", name: "Alder Fresh", what: "$40 a month for fruit and vegetables for every Basic Food household", program: "Basic Food (SNAP)", rate: 120, years: 6 },
  { key: "crisis", name: "Crisis Care Port Alder", what: "a mobile crisis team and twelve counselling sessions for anyone who cannot pay", program: "988 and behavioral health", rate: 200, years: 9 },
  { key: "home", name: "Home Base", what: "up to $300 a month of rent help for low-income renters", program: "housing vouchers", rate: 300, years: 6 },
  { key: "kids", name: "Little Alders", what: "child care copays paid for families under half the state median income", program: "Working Connections Child Care", rate: 150, years: 6 },
  { key: "warm", name: "Warm Homes", what: "a 60% discount on city utility bills for low-income households", program: "energy assistance", rate: 60, years: 6 },
  { key: "care", name: "Care Without Cost", what: "clinic visits paid for uninsured residents under 250% of the poverty line", program: "Apple Health", rate: 150, years: 6 },
  { key: "bonus", name: "Working Families Bonus", what: "a city top-up of 25% on every Working Families Tax Credit", program: "Working Families Tax Credit", rate: 70, years: 4 },
];
export const MK = Object.fromEntries(MEASURES.map((m, k) => [m.key, k]));
export const measureOn = (c, key) => { const m = c.gov.measures?.[MK[key]]; return !!m && m.until >= c.epoch; };
// spending a measure's money: from the city's funds, within what its levy has raised
export function measurePay(c, key, to, amt, toCr = AC.R_TRANSFER) {
  const G = c.gov, m = G.measures[MK[key]]; if (!m || m.until < c.epoch || amt <= 0 || m.fund < amt) return false;
  if (!c.fund(E_CITY, amt)) return false;
  c.books.pay(E_CITY, to, amt, AC.X_TRANSFER, toCr, K.benefit); m.fund -= amt; m.spent += amt; return true;
}

/* ------------------------------------------------------------------ households: who they are, what they have */
export function composition(c, h) {
  const P = c.people, e = c.epoch, mem = members(c, h), o = { mem, size: mem.length, kids: 0, u5: 0, u13: 0, u14: 0, school: 0, adults: 0, seniors: 0, disabled: 0, working: 0, workers: [], careNeed: false };
  for (const i of mem) {
    const a = ageYears(c, i, e);
    if (a < 18) { o.kids++; if (a < 5) o.u5++; if (a < 13) o.u13++; if (a < 14) o.u14++; if (a >= 5) o.school++; }
    else { o.adults++; if (a >= 65) o.seniors++; if (a < 65 && P.dis[i] >= 90 && P.status[i] !== 2) o.disabled++; if (P.status[i] === 2 || P.status[i] === 6) { o.working++; o.workers.push(i); } }
  }
  o.careNeed = o.u13 > 0 && o.adults > 0 && o.working === o.adults;
  return o;
}
// monthly income in cents: earnings at today's hours, unemployment and paid leave, Social Security and cash aid
export function incomeOf(c, h, comp = composition(c, h)) {
  const P = c.people, H = c.hh; let earned = 0, unearned = 0;
  for (const i of comp.mem) {
    if (P.status[i] === 2 || P.status[i] === 6) earned += Math.round((P.wage[i] * P.hours[i] * 217) / 10);
    if (P.status[i] === 3 && P.uiLeft[i] > 0) unearned += Math.round((P.ui[i] * 433) / 100);
    unearned += P.ss[i] + P.pen[i] + P.ssi[i] + P.abd[i];
  }
  unearned += H.tanf[h];
  return { earned, unearned, gross: earned + unearned };
}
const liquid = (c, h) => c.books.get(E_H0 + h, AC.DEPOSITS) + c.books.get(E_H0 + h, AC.SAVINGS);
const headOf = (c, h) => (c.hh.head[h] >= 0 ? c.hh.head[h] : members(c, h)[0] ?? -1);

/* ------------------------------------------------------------------ deciding to apply */
// a person decides whether to apply: knowing the program, needing it, having been helped or turned away before,
// trusting the state, the friends who already get it, and their own pride and thrift
const TAKEUP = { snap: 200, tanf: 90, ah: 400, wic: 110, wccc: 90, ssi: 70, abd: 60, voucher: 120, wftc: 160, sun: 120 };
const PROGRAM_BIT = { snap: 1, tanf: 2, ah: 4, wic: 8, wccc: 16, ssi: 32, abd: 64, voucher: 128, wftc: 256, sun: 512 }, PROGRAM_KEYS = Object.keys(PROGRAM_BIT);
// value: what the benefit would be worth a month; a larger share of the household's income is a stronger reason to
// apply (take-up rises with the stakes)
export function willApply(c, h, prog, value = 0) {
  const P = c.people, H = c.hh, head = headOf(c, h); if (head < 0) return false;
  const t = P.traits[head], o = head * 8;
  let s = TAKEUP[prog] + (P.edu[head] - 2) * 25 + (trait(t, T_O) - 8) * 6 + (trait(t, T_C) - 8) * 4;
  for (let k = 0; k < 4; k++) { const f = c.friendOf(head, k); if (f >= 0 && P.hh[f] >= 0 && (c.hh.progs[P.hh[f]] & PROGRAM_BIT[prog])) s += 50; }
  if (P.need[o + 7] < 300) s += 110; if (P.need[o] < 350) s += 70; if (P.stress[head] > 700) s += 40;
  if (value > 0) s += Math.min(320, Math.round((value * 700) / Math.max(30000, H.inc[h])));
  // the belief that applying will succeed, updated by what the household has been through (Bayes, law 13.5)
  let belief = toLogit(sat(0.6 + 0.1 * (P.tcLv[head] - 1), 0.05, 0.95));
  for (let k = 0; k < 8; k++) { const mk = P.memK[o + k]; if (mk === M.was_denied_benefits) belief = bayes(belief, 0.5); else if (mk === M.got_help_with_food || mk === M.got_health_coverage || mk === M.got_help_with_rent || mk === M.got_help_with_child_care) belief = bayes(belief, 2); }
  s += Math.round((fromLogit(belief) - 0.6) * 250);
  s -= (trait(t, T_THRIFT) - 8) * 9 + (P.tcLv[head] === 0 ? 120 : 0) - P.tcLv[head] * 15;
  // the reasons charge a decision that leaks away while they are weak and fires once they have built up (law 57.9)
  // in the founding month, those whose reasons would build to a decision (a drive above the leak) are already enrolled
  if (c.census?.open) return sat(s, 0, 950) / 1000 > 0.1;
  const k = PROGRAM_KEYS.indexOf(prog), x = h * 10 + k, v = lif(H.apply[x], sat(s, 0, 950) / 1000, 0.1);
  if (v >= 1) { H.apply[x] = v - 1; return true; } H.apply[x] = v; return false;
}
// paperwork: missing documents turn some eligible applications down
// paperwork: the application is completed when the applicant's ability (conscientiousness, schooling, a friend who has
// done it before, earlier success) meets the form's difficulty (law 73.31)
const DIFFICULTY = { snap: -1.4, tanf: -0.9, ah: -2.2, wic: -1.8, wccc: -0.8, ssi: 0.4, abd: -0.2, voucher: -0.5, wftc: -1.1, sun: -2.2 };
function paperworkOk(c, h, prog) {
  const P = c.people, head = headOf(c, h); if (head < 0) return false;
  let theta = (trait(P.traits[head], T_C) - 8) / 2 + (P.edu[head] - 2) / 2 - Math.max(0, 500 - P.need[head * 8 + 1]) / 400;
  for (let k = 0; k < 4; k++) { const f = c.friendOf(head, k); if (f >= 0 && P.hh[f] >= 0 && (c.hh.progs[P.hh[f]] & PROGRAM_BIT[prog])) { theta += 0.6; break; } }
  if (remembers(c, head, M.got_help_with_food, E_STATE, 9999) || remembers(c, head, M.got_health_coverage, E_STATE, 9999)) theta += 0.4;
  return rasch(theta, DIFFICULTY[prog]) >= 0;
}
function deny(c, h, why) { const head = headOf(c, h); if (head >= 0) { addMemory(c, head, M.was_denied_benefits, E_STATE); c.people.cDe[head] = Math.min(255, c.people.cDe[head] + 1); } c.gov.wel.denials++; }

/* ------------------------------------------------------------------ the programs, month by month */
function snapBenefit(c, h, comp, inc, d) {
  const H = c.hh, S = snapYear(c, fyOf(d)), P = c.people;
  // able-bodied adults without dependents past their three countable months are left out of the household
  let n = comp.size; if (!comp.u14) for (const i of comp.mem) { const a = ageYears(c, i); if (a >= 18 && a <= 64 && P.dis[i] < 90 && P.abawd[i] >= 3 && P.status[i] !== 2) n--; }
  if (n <= 0) return 0;
  const elderly = comp.seniors > 0 || comp.disabled > 0;
  if (inc.gross > Math.floor((fpl(c, d.y, comp.size) * 2) / 12) && !elderly) return 0;       // Basic Food: 200% of poverty (categorical eligibility)
  const std = S.std[Math.min(6, n)], adj = Math.max(0, inc.gross - Math.floor(inc.earned / 5) - std);
  const shelter = (H.tenure[h] === 0 ? H.rent[h] - (H.voucher[h] ? H.hap[h] : 0) : Math.round((c.loans.pay[H.mort[h]] || 0) + 0)) + 8500 + H.size[h] * 3200;
  let excess = Math.max(0, shelter - Math.floor(adj / 2)); if (!elderly) excess = Math.min(excess, S.cap);
  const net = Math.max(0, adj - excess), max = n <= 8 ? S.max[n] : S.max[8] + S.add * (n - 8);
  let ben = max - Math.ceil((net * 3) / 1000) * 100; ben = Math.floor(Math.max(0, ben) / 100) * 100;
  if (n <= 2) ben = Math.max(ben, S.min);
  return ben;
}
function tanfGrant(c, h, comp, inc) {
  if (!comp.kids || c.hh.tanfMonths[h] >= TANF_MONTHS || liquid(c, h) > TANF_RESOURCES) return 0;
  const n = Math.min(10, comp.size), countable = Math.floor(Math.max(0, inc.earned - TANF_DISREGARD) / 2) + inc.unearned - c.hh.tanf[h];
  const g = TANF_PS[n] - countable; return g >= 1000 ? Math.floor(g / 100) * 100 : 0;
}
// Apple Health: 1 adults (19-64), 2 children (free), 3 children (CHIP, with a premium), 5 seniors with Medicaid (dual)
function ahCategory(c, i, comp, inc, d) {
  const a = ageYears(c, i), n = comp.size, lim = (t) => (n <= 5 ? t[n] : t[5] + (t[5] - t[4]) * (n - 5));
  if (a < 19) return inc.gross <= lim(AH.kids) ? 2 : inc.gross <= lim(AH.chip2) ? 3 : 0;
  if (a >= 65) return c.people.ssi[i] > 0 ? 5 : 0;
  return inc.gross <= lim(AH.adult) ? 1 : 0;
}
// H.R. 1 from 2027: 80 hours a month of work or community engagement for Apple Health for Adults, unless exempt
function meetsWorkRule(c, i, comp) {
  const P = c.people; if (P.status[i] === 2 || P.status[i] === 6) return P.hours[i] * 217 / 10 >= 80;
  return comp.u14 > 0 || P.dis[i] >= 90 || P.mhTx[i] > 0 || P.status[i] === 1;
}
function ssiAmount(c, i, comp) {
  const P = c.people, a = ageYears(c, i); if (!(a >= 65 || (a >= 18 && P.dis[i] >= 180 && P.status[i] !== 2))) return 0;
  const y = c.today.y, cola = y > 2026 ? c.nation.cpiwAugRatio(2026, y - 1) : 65536, fbr = Math.round((SSI.one * cola) / 65536 / 100) * 100;
  if (liquid(c, P.hh[i]) > SSI.res1 * (comp.adults > 1 ? 1.5 : 1)) return 0;
  const earned = P.status[i] === 2 ? Math.round((P.wage[i] * P.hours[i] * 217) / 10) : 0;
  const countable = Math.max(0, P.ss[i] - 2000) + Math.floor(Math.max(0, earned - 6500) / 2);
  const amt = fbr - countable; return amt > 0 ? Math.floor(amt / 100) * 100 : 0;
}
function wcccCopay(comp, inc) {
  const n = Math.min(8, comp.size) - 1, $ = Math.round(inc.gross / 100);
  for (let k = 0; k < 4; k++) if ($ <= WCCC_BANDS[k][n]) return WCCC_COPAY[k];
  return $ <= WCCC_BANDS[4][n] ? WCCC_COPAY[4] : -1;
}

export function attachWelfare(c) {
  c.gov.wel = { denials: 0, snapIssued: 0, tanfPaid: 0, wicIssued: 0, sunIssued: 0, ssiPaid: 0, abdPaid: 0, hapPaid: 0, wcccPaid: 0, wftcPaid: 0, eitcPaid: 0, mealsFree: 0, mealsReduced: 0, mealsPaid: 0, ahSpendAdult: 0, ahSpendOther: 0, crisisCost: 0, applications: 0, lmpPaid: 0 };
  c.gov.measures = MEASURES.map(() => ({ until: 0, fund: 0, spent: 0, passed: 0, votes: 0 }));
  c.gov.ballot = []; c.gov.lastBallot = null;
  c.fpl = (y, n) => fpl(c, y, n);                                      // the year's poverty line for a household of n (annual cents)
}
// the first of the month: eligibility and benefits for everyone enrolled; applications for those who decide to apply
export function welfareMonth(c, d) {
  const H = c.hh, P = c.people, B = c.books, G = c.gov, W = G.wel, e = c.epoch, s = c.cfg.seed;
  const abawdOn = e >= 32;                                       // statewide ABAWD time limits from February 1, 2026
  if (d.m === 1 && d.y % 3 === 0) for (const i of P.each()) P.abawd[i] = 0;   // a new 36-month period (January 2027, 2030, ...)
  // vouchers for about 7% of households (the Everett Housing Authority housed 3,247 voucher households at the start of 2024)
  const vouchers = Math.ceil((H.count * 70) / 1000); let inUse = 0; for (const h of H.each()) if (H.voucher[h]) inUse++;
  const waiting = [];
  for (const h of H.each()) {
    if (!H.size[h] || H.home[h] < 0 && !H.progs[h]) continue;
    const comp = composition(c, h), inc = incomeOf(c, h, comp), he = E_H0 + h;
    // Basic Food
    const sb = snapBenefit(c, h, comp, inc, d);
    if (H.progs[h] & 1) { if (sb <= 0 || (e >= H.snapRenew[h] && !paperworkOk(c, h, "snap"))) { H.progs[h] &= ~1; H.snap[h] = 0; } else { H.snap[h] = sb; if (e >= H.snapRenew[h]) H.snapRenew[h] = e + 365; } }
    else if (sb > 0 && willApply(c, h, "snap", sb)) { W.applications++; if (paperworkOk(c, h, "snap")) { H.progs[h] |= 1; H.snap[h] = sb; H.snapRenew[h] = e + 365; for (const i of comp.mem) addMemory(c, i, M.got_help_with_food, E_STATE); } else deny(c, h, "snap"); }
    if (abawdOn && (H.progs[h] & 1) && !comp.u14) for (const i of comp.mem) { const a = ageYears(c, i); if (a >= 18 && a <= 64 && P.dis[i] < 90 && P.status[i] !== 2 && P.abawd[i] < 9) P.abawd[i]++; }
    // WorkFirst (TANF)
    const tg = tanfGrant(c, h, comp, inc);
    if (H.progs[h] & 2) { if (tg <= 0) { H.progs[h] &= ~2; H.tanf[h] = 0; } else H.tanf[h] = tg; }
    else if (tg > 0 && willApply(c, h, "tanf", tg)) { W.applications++; if (paperworkOk(c, h, "tanf")) { H.progs[h] |= 2; H.tanf[h] = tg; } else deny(c, h, "tanf"); }
    if (H.progs[h] & 2) { H.tanfMonths[h] = Math.min(255, H.tanfMonths[h] + 1); if (c.fund(E_STATE, H.tanf[h])) { B.pay(E_STATE, he, H.tanf[h], AC.X_TRANSFER, AC.R_TRANSFER, K.benefit); W.tanfPaid += H.tanf[h]; } }
    // Apple Health, person by person
    let anyAH = false;
    for (const i of comp.mem) {
      const cat = H.cover[h] ? 0 : ahCategory(c, i, comp, inc, d);
      if (P.ah[i]) {
        if (e >= P.ahRenew[i]) {
          const keep = cat > 0 && paperworkOk(c, h, "ah") && !(d.y >= AH_WORK_FROM && cat === 1 && !meetsWorkRule(c, i, comp));
          if (keep) { P.ah[i] = cat; P.ahRenew[i] = e + (d.y >= AH_WORK_FROM && cat === 1 ? 182 : 365); } else { P.ah[i] = 0; if (cat) deny(c, h, "ah"); }
        }
      } else if (cat > 0 && willApply(c, h, "ah", 50000)) { W.applications++; if (paperworkOk(c, h, "ah") && !(d.y >= AH_WORK_FROM && cat === 1 && !meetsWorkRule(c, i, comp))) { P.ah[i] = cat; P.ahRenew[i] = e + (d.y >= AH_WORK_FROM && cat === 1 ? 182 : 365); addMemory(c, i, M.got_health_coverage, E_STATE); } else deny(c, h, "ah"); }
      if (P.ah[i] === 3 && !anyAH) { const prem = inc.gross <= (comp.size <= 5 ? AH.chip1[comp.size] : AH.chip1[5]) ? 2000 : 3000; if (c.fund(he, prem)) B.pay(he, E_STATE, prem, AC.X_HEALTH, AC.R_FEES, K.fee); }
      if (P.ah[i]) anyAH = true;
    }
    if (anyAH) H.progs[h] |= 4; else H.progs[h] &= ~4;
    // WIC: children under five, in households under 185% of poverty or already on Basic Food, WorkFirst or Apple Health
    const wicOk = comp.u5 > 0 && (inc.gross <= Math.floor((fpl(c, d.y, comp.size) * 185) / 100 / 12) || (H.progs[h] & 7));
    if (H.progs[h] & 8) { if (!wicOk) H.progs[h] &= ~8; }
    else if (wicOk && willApply(c, h, "wic")) { W.applications++; H.progs[h] |= 8; }
    if (H.progs[h] & 8) { H.wic[h] = comp.u5 * Math.round(WIC_FOOD * (d.y > 2025 ? c.nation.cpiRatio(2025, d.y - 1) : 65536) / 65536); W.wicIssued += H.wic[h]; } else H.wic[h] = 0;
    // Working Connections Child Care: working families with children under 13, at or below 60% of SMI to enter
    const cp = comp.careNeed ? wcccCopay(comp, inc) : -1;
    if (H.progs[h] & 16) { if (cp < 0 || !comp.careNeed) H.progs[h] &= ~16; else H.copay[h] = cp; }
    if ((H.progs[h] & 16) && H.copay[h] > 0 && !(H.mbits[h] & 1) && c.fund(he, H.copay[h], true)) B.pay(he, E_STATE, H.copay[h], AC.X_SERVICES, AC.R_FEES, K.fee);   // the month's copayment
    else if (cp >= 0 && cp <= WCCC_COPAY[3] && willApply(c, h, "wccc", comp.u5 * 200000 + Math.max(0, (comp.u13 ?? comp.u5) - comp.u5) * 60000 - cp)) { W.applications++; if (paperworkOk(c, h, "wccc")) { H.progs[h] |= 16; H.copay[h] = cp; for (const i of comp.mem) addMemory(c, i, M.got_help_with_child_care, E_STATE); } else deny(c, h, "wccc"); }
    // SSI and ABD cash, person by person
    for (const i of comp.mem) {
      const amt = ssiAmount(c, i, comp);
      if (P.ssi[i] && amt <= 0) P.ssi[i] = 0; else if (P.ssi[i]) P.ssi[i] = amt;
      else if (amt > 0 && willApply(c, h, "ssi")) { W.applications++; if (paperworkOk(c, h, "ssi") && (P.dis[i] >= 160 || P.health[i] < 260 || ageYears(c, i) >= 65)) P.ssi[i] = amt; else deny(c, h, "ssi"); }   // SSA's determination: a listed severity, or age
      if (P.ssi[i]) { B.pay(E_FEDGOV, he, P.ssi[i], AC.X_TRANSFER, AC.R_TRANSFER, K.benefit); W.ssiPaid += P.ssi[i]; }
      const a = ageYears(c, i), disabled = a >= 18 && a < 65 && P.dis[i] >= 90 && P.status[i] !== 2 && !P.ssi[i];
      const abdAmt = disabled ? ABD_PS[Math.min(2, comp.adults)] - Math.max(0, inc.unearned - P.abd[i] + Math.floor(Math.max(0, inc.earned - TANF_DISREGARD) / 2)) : 0;
      if (P.abd[i] && abdAmt <= 0) P.abd[i] = 0; else if (P.abd[i]) P.abd[i] = Math.floor(abdAmt / 100) * 100;
      else if (abdAmt > 0 && willApply(c, h, "abd")) { W.applications++; if (paperworkOk(c, h, "abd")) P.abd[i] = Math.floor(abdAmt / 100) * 100; else deny(c, h, "abd"); }
      if (P.abd[i] && c.fund(E_STATE, P.abd[i])) { B.pay(E_STATE, he, P.abd[i], AC.X_TRANSFER, AC.R_TRANSFER, K.benefit); W.abdPaid += P.abd[i]; }
    }
    // housing vouchers: the tenant pays 30% of adjusted income (or 10% of gross), HUD pays the landlord the rest up to the payment standard
    const veryLow = inc.gross <= Math.round((G.medianInc || 500000) * 0.5 * 1.18) && H.tenure[h] === 0 && H.home[h] >= 0;
    if (H.voucher[h]) {
      if (!veryLow && inc.gross > (G.medianInc || 500000) * 0.8 * 1.18 || H.tenure[h] !== 0 || H.home[h] < 0) { H.voucher[h] = 0; H.hap[h] = 0; }
      else { inUse++; H.hap[h] = hapOf(c, h, comp, inc); }
    } else if (veryLow && !H.vWait[h] && willApply(c, h, "voucher", Math.max(0, H.rent[h] - Math.round(inc.gross * 0.3)))) H.vWait[h] = e;
    if (H.vWait[h] && !H.voucher[h]) waiting.push([Math.min(4000, Math.round((H.rent[h] * 1000) / Math.max(1, inc.gross))), Math.min(4000, e - H.vWait[h]), comp.kids, h]);
    // the city's own additions, if the voters passed them
    if (measureOn(c, "fresh") && (H.progs[h] & 1)) { if (measurePay(c, "fresh", he, 4000)) H.fresh[h] = 4000; } else H.fresh[h] = 0;
    if (measureOn(c, "kids") && (H.progs[h] & 16) && inc.gross <= WCCC_BANDS[2][Math.min(8, comp.size) - 1] * 100) H.mbits[h] |= 1; else H.mbits[h] &= ~1;
    if (measureOn(c, "home") && H.tenure[h] === 0 && !H.voucher[h] && H.home[h] >= 0 && inc.gross <= (G.medianInc || 500000) * 0.6 && H.rent[h] * 1000 > inc.gross * 400) { const amt = Math.min(30000, H.rent[h] - Math.round(inc.gross * 0.4)); if (amt > 0 && measurePay(c, "home", he, amt)) { H.mRent[h] = amt; if (!(H.mbits[h] & 2)) for (const i of comp.mem) addMemory(c, i, M.got_help_with_rent, E_CITY); H.mbits[h] |= 2; } } else { H.mRent[h] = 0; H.mbits[h] &= ~2; }
    H.progs[h] = (H.progs[h] & ~(128 | 256)) | (H.voucher[h] ? 128 : 0);
  }
  // vouchers that turn over go to those on the waiting list, by E1: the heaviest rent burden first, then the longest wait
  const free = Math.max(0, vouchers - inUse);
  // (the payment starts with the voucher: the housing authority sets it from the household's income at the lease-up)
  if (free && waiting.length) { const { admitted } = admitE1(waiting, free); for (const h of admitted) { const comp = composition(c, h); H.voucher[h] = 1; H.vWait[h] = 0; H.hap[h] = hapOf(c, h, comp, incomeOf(c, h, comp)); for (const i of members(c, h)) addMemory(c, i, M.got_help_with_rent, E_FEDGOV); } }
  // the federal government's share: Apple Health (90% for adults in the expansion group, 50% otherwise), WorkFirst's block grant
  const fed = Math.round(W.ahSpendAdult * 0.9 + W.ahSpendOther * 0.5) + Math.round((P.count * 378987702 * 100) / 7958000 / 12);
  if (fed > 0) B.pay(E_FEDGOV, E_STATE, fed, AC.X_TRANSFER, AC.R_INTERGOV, K.transfer);
  W.ahSpendAdult = 0; W.ahSpendOther = 0;
}
// each day: Basic Food issued on its day (1st-20th), housing assistance on the 1st, school meals, SUN Bucks in June
export function welfareDay(c, d, schoolDay) {
  const H = c.hh, B = c.books, G = c.gov, W = G.wel, e = c.epoch, P = c.people;
  for (const h of H.each()) {
    if ((H.progs[h] & 1) && H.snap[h] && 1 + (h % 20) === d.d) { H.ebt[h] = H.snap[h]; W.snapIssued += H.snap[h]; }
  }
  // SUN Bucks: $120 a school-age child in June, to households on Basic Food, WorkFirst or Apple Health (automatic), or that apply
  const sunDay = d.y === 2026 ? d.m === 6 && d.d === 15 : d.m === 6 && d.d === 1;
  if (sunDay) for (const h of H.each()) {
    const comp = composition(c, h); if (!comp.school) continue;
    const ok = (H.progs[h] & 7) || (incomeOf(c, h, comp).gross <= Math.floor((fpl(c, d.y, comp.size) * 185) / 100 / 12) && willApply(c, h, "sun"));
    if (ok) { H.sun[h] = SUN_BUCKS * comp.school; W.sunIssued += H.sun[h]; H.progs[h] |= 512; }
  }
  if (d.m === 10 && d.d === 1) for (const h of H.each()) { H.sun[h] = 0; H.progs[h] &= ~512; }
  // school meals: free under 130% of poverty or for families on Basic Food or WorkFirst, reduced under 185%, and free for
  // everyone at elementary schools where at least 30% qualify (Washington's HB 1238)
  if (schoolDay) schoolMeals(c, d);
}
function schoolMeals(c, d) {
  const P = c.people, H = c.hh, B = c.books, W = c.gov.wel, T = c.world.buildings;
  if (!c.mealCache || c.mealCache.e < c.epoch - 30) {
    const free = new Map(), all = new Map(), status = new Map();
    for (const h of H.each()) {
      const comp = composition(c, h); if (!comp.school) continue;
      const g = incomeOf(c, h, comp).gross, f = fpl(c, d.y, comp.size) / 12, st = (H.progs[h] & 3) || g <= f * 1.3 ? 2 : g <= f * 1.85 ? 1 : 0; status.set(h, st);
      for (const i of comp.mem) { const sc = P.school[i]; if (sc < 0) continue; all.set(sc, (all.get(sc) || 0) + 1); if (st) free.set(sc, (free.get(sc) || 0) + 1); }
    }
    const universal = new Set(); for (const [sc, n] of all) if (T.civic[sc] === 6 && (free.get(sc) || 0) * 10 >= n * 3) universal.add(sc);
    c.mealCache = { e: c.epoch, status, universal };
  }
  const { status, universal } = c.mealCache, price = 375;
  let paid = 0, reduced = 0, free = 0;
  const owe = new Map();
  for (const i of P.each()) {
    if (!(P.today[i] & 4) || P.school[i] < 0 || P.hh[i] < 0) continue;
    const st = universal.has(P.school[i]) ? 2 : status.get(P.hh[i]) ?? 0;
    if (st === 2) free++; else if (st === 1) { reduced++; owe.set(P.hh[i], (owe.get(P.hh[i]) || 0) + 40); } else { paid++; owe.set(P.hh[i], (owe.get(P.hh[i]) || 0) + price); }
  }
  for (const [h, amt] of [...owe.entries()].sort((a, b) => a[0] - b[0])) if (c.fund(E_H0 + h, amt)) B.pay(E_H0 + h, E_SCHOOL, amt, AC.X_GROCERIES, AC.R_FEES, K.sale);
  const fed = free * price + reduced * (price - 40); if (fed) B.pay(E_FEDGOV, E_SCHOOL, fed, AC.X_TRANSFER, AC.R_INTERGOV, K.transfer);
  if (fed + paid * price + reduced * 40 > 0 && c.fund(E_SCHOOL, Math.round((fed + paid * price + reduced * 40) * 0.55))) B.pay(E_SCHOOL, E_ROW, Math.round((fed + paid * price + reduced * 40) * 0.55), AC.X_PURCHASES, AC.R_SALES, K.purchase);
  W.mealsFree += free; W.mealsReduced += reduced; W.mealsPaid += paid;
}
// a grocery purchase spends food benefits first: Basic Food, WIC and SUN Bucks (the federal government pays the grocer),
// then Alder Fresh's city match for fruit and vegetables
export function foodBenefits(c, h, f, total) {
  const H = c.hh, B = c.books, fe = E_F0 + f; let left = total;
  const use = (bal, payer, what) => { const amt = Math.min(left, H[bal][h]); if (amt <= 0) return; if (payer === E_CITY ? c.fund(E_CITY, amt) : true) { B.pay(payer, fe, amt, AC.X_TRANSFER, AC.R_SALES, K.benefit); H[bal][h] -= amt; left -= amt; } };
  use("ebt", E_FEDGOV); use("wic", E_FEDGOV); use("sun", E_FEDGOV);
  if (H.fresh[h] > 0) { const amt = Math.min(left, H.fresh[h]); if (amt > 0 && c.fund(E_CITY, amt)) { B.pay(E_CITY, fe, amt, AC.X_TRANSFER, AC.R_SALES, K.benefit); H.fresh[h] -= amt; left -= amt; } }
  return total - left;                                     // what the benefits paid
}
// the Working Families Tax Credit: after filing, those who qualify may apply (February to December); the city's bonus on top
export function wftcApply(c, h, ty, credit, kids) {
  const H = c.hh, B = c.books, W = c.gov.wel; if (H.wftcY[h] >= ty) return 0;
  const amt = wftcAmount(c, ty, kids, credit); if (!amt || !willApply(c, h, "wftc") || !paperworkOk(c, h, "wftc")) return 0;
  if (!c.fund(E_STATE, amt)) return 0;
  B.pay(E_STATE, E_H0 + h, amt, AC.X_TRANSFER, AC.R_TRANSFER, K.benefit); W.wftcPaid += amt; H.wftcY[h] = ty; H.progs[h] |= 256;
  if (measureOn(c, "bonus")) measurePay(c, "bonus", E_H0 + h, Math.round(amt / 4));
  return amt;
}

/* ------------------------------------------------------------------ the ballot */
// August: the city puts up to two new measures on the November ballot, where the need is plainest, and any about to end
export function placeMeasures(c, d, kpi) {
  const G = c.gov, need = needSignals(c), list = [];
  MEASURES.forEach((m, k) => { const st = G.measures[k]; const ends = st.until > 0 && st.until < c.epoch + 400; if (ends) list.push([1000 + need[m.key], k]); });
  const fresh = MEASURES.map((m, k) => [need[m.key], k]).filter(([n, k]) => G.measures[k].until < c.epoch && n >= 60).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, 2);
  G.ballot = [...list, ...fresh].sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, 3).map(([n, k]) => ({ k, need: n, renewal: G.measures[k].until > 0 }));
  if (G.ballot.length) c.event("election", `The council sends ${G.ballot.length} measure${G.ballot.length > 1 ? "s" : ""} to the November ballot: ${G.ballot.map((b) => MEASURES[b.k].name + (b.renewal ? " (renewal)" : "")).join(", ")}`);
}
// how visible each need is, in thousandths of households (or people)
export function needSignals(c) {
  const H = c.hh, P = c.people, G = c.gov; let n = 0, food = 0, burden = 0, care = 0, arrears = 0, working = 0;
  for (const h of H.each()) {
    if (!H.size[h]) continue; n++; const head = headOf(c, h); if (head < 0) continue;
    if (P.need[head * 8] < 400) food++;
    if (H.tenure[h] === 0 && H.rent[h] * 2 > Math.max(1, H.inc[h])) burden++;
    if (H.util[h] > 0) arrears++;
    if (H.kids[h] && (H.spend[h * 8 + 3] || 0) * 6 > Math.max(1, H.inc[h])) care++;
  }
  let distress = 0, uninsured = 0, people = 0;
  for (const i of P.each()) { people++; if (P.mhEp[i] && !P.mhTx[i]) distress++; if (!P.ah[i] && !(P.hh[i] >= 0 && H.cover[P.hh[i]]) && ageYears(c, i) < 65) uninsured++; if (P.status[i] === 2 && P.wage[i] < 2600) working++; }
  const per = (x, d) => Math.round((x * 1000) / Math.max(1, d));
  return { fresh: per(food, n) * 2, crisis: per(distress, people) * 6, home: per(burden, n), kids: per(care, n) * 2, warm: per(arrears, n) * 3, care: per(uninsured, people) * 2, bonus: per(working, people) };
}
// November: each citizen votes on each measure from what it would mean to them, to the people they know, and what it costs
export function voteMeasures(c, d) {
  const G = c.gov, P = c.people, H = c.hh, s = c.cfg.seed, out = [];
  if (!G.ballot?.length) return out;
  const av = c.assessedValue(), voters = [];
  for (const i of P.each()) {
    if (ageYears(c, i) < 18 || P.hh[i] < 0) continue;
    // turnout: the civic-minded, owners, the trusting and the older vote; more do in even (federal) years
    const cv = trait(P.traits[i], T_CIVIC), turnout = 6 + cv + (H.tenure[P.hh[i]] === 1 ? 3 : 0) + P.tcLv[i] + (ageYears(c, i) > 45 ? 2 : 0);
    if (turnout < (d.y % 2 === 0 ? 13 : 16)) continue;
    voters.push(i);
  }
  // deliberation: each voter's own reasons, then talked over with friends (DeGroot averaging weighted by who is listened to)
  const own = new Map(); G.ballot.forEach((b) => { const m = MEASURES[b.k]; for (const i of voters) own.set(i * 16 + b.k, measureUtility(c, i, m, av)); });
  const talked = (i, k) => { let s2 = 0, w = 0; for (let x = 0; x < 4; x++) { const f = c.friendOf(i, x); if (f < 0 || !own.has(f * 16 + k)) continue; const wf = 0.2 + (P.cent?.[f] || 0) / 1000; s2 += own.get(f * 16 + k) * wf; w += wf; } const u = own.get(i * 16 + k); return w ? 0.7 * u + 0.3 * (s2 / w) : u; };
  G.ballot.forEach((b, n) => {
    const m = MEASURES[b.k]; let yes = 0, no = 0;
    for (const i of voters) { if (talked(i, b.k) > 0) yes++; else no++; addMemory(c, i, M.voted); }
    const pass = yes > no, st = G.measures[b.k];
    if (pass) { const from = c.epoch + 45; st.until = from + m.years * 365; st.passed = d.y; }
    st.votes = yes + no;
    out.push({ key: m.key, name: m.name, yes, no, pass });
    c.event("election", `Proposition ${n + 2}, ${m.name} (${m.what}; $${(m.rate / 1000).toFixed(2)} per $1,000 of assessed value for ${m.years} years) ${pass ? "passes" : "fails"}, ${yes.toLocaleString("en-US")} to ${no.toLocaleString("en-US")}`);
  });
  G.lastBallot = { y: d.y, results: out, turnout: voters.length }; G.ballot = [];
  return out;
}
// a voter's reasons, all from who they are and what has happened to them
export function measureUtility(c, i, m, av) {
  const P = c.people, H = c.hh, h = P.hh[i], t = P.traits[i], o = i * 8, s = c.cfg.seed;
  const O = trait(t, T_O), C = trait(t, T_C), E = trait(t, T_E), A = trait(t, T_A), Nn = trait(t, T_N), Th = trait(t, T_THRIFT), Cv = trait(t, T_CIVIC);
  const comp = composition(c, h), inc = incomeOf(c, h, comp), poor = inc.gross < (c.gov.medianInc || 500000) * 0.6, renter = H.tenure[h] === 0;
  const mem = (k) => { for (let x = 0; x < 8; x++) if (P.memK[o + x] === k) return true; return false; };
  let u = (Cv + A - 15) * 3 + (O - 8) * 2 - (Th - 8) * 3 + (P.tcLv[i] - 1) * 6 + (Nn - 8) * (m.key === "crisis" ? 2 : 0) + (E - 8) - (C - 8);
  // what it costs this household: the owner pays the levy on its home; a renter expects some of it in the rent
  const home = H.home[h] >= 0 ? c.world.dwellings.value[H.home[h]] : 0, tax = ppm(home, m.rate) / (renter ? 2 : 1);
  u -= Math.round((tax * 1000) / Math.max(20000, inc.gross * 12) * (8 + Th) / 8);
  // what it would do for them, and for people like those they know
  const friendsHard = [0, 1, 2, 3].reduce((n, k) => { const f = c.friendOf(i, k); return n + (f >= 0 && (P.status[f] === 3 || P.mhEp[f] || P.need[f * 8 + 7] < 300) ? 1 : 0); }, 0);
  u += friendsHard * 4;
  switch (m.key) {
    case "fresh": if (H.progs[h] & 1) u += 30; if (P.need[o] < 450 || mem(M.found_the_shelves_empty)) u += 10; if (mem(M.got_help_with_food)) u += 8; break;
    case "crisis": if (P.mhEp[i] || P.crisis[i]) u += 28; if (mem(M.lost_someone)) u += 12; if (mem(M.started_counselling)) u += 10; u += (Nn - 8) * 2; break;
    case "home": if (renter && H.rent[h] * 1000 > inc.gross * 400) u += 30; if (mem(M.was_evicted) || mem(M.rent_went_up) || mem(M.my_home_is_to_be_torn_down)) u += 14; if (!renter) u -= 6; break;
    case "kids": if (comp.u13 && poor) u += 28; else if (comp.u13) u += 8; if (mem(M.got_help_with_child_care)) u += 8; break;
    case "warm": if (poor) u += 18; if (H.util[h] > 0) u += 14; break;
    case "care": if (!P.ah[i] && !H.cover[h] && ageYears(c, i) < 65) u += 26; if (mem(M.fell_ill)) u += 6; break;
    case "bonus": if ((P.status[i] === 2 || P.status[i] === 6) && poor) u += 26; if (mem(M.was_laid_off) || mem(M.had_hours_cut)) u += 8; break;
  }
  if (c.gov.measures[MK[m.key]].until > 0 && c.gov.measures[MK[m.key]].spent > 0 && (H.mbits[h] || H.fresh[h] || H.mRent[h])) u += 12;   // it helped them before
  return u;
}
// the year's levy from the measures in force, credited to each measure's fund as the property tax comes in
export function measureLevy(c) { let r = 0; c.gov.measures.forEach((st, k) => { if (st.until > c.epoch + 30) r += MEASURES[k].rate; }); return r; }
export function creditMeasures(c, cityPart, totalRate) {
  const G = c.gov; if (!totalRate) return;
  G.measures.forEach((st, k) => { if (st.until > c.epoch) st.fund += Math.floor((cityPart * MEASURES[k].rate) / totalRate); });
}
