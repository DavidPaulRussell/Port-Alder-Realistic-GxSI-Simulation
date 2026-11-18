// Port Alder: a sentient, deterministic city with integer-cent double-entry books, on the Plume XPU.
// SPDX-License-Identifier: GPL-3.0-only
//
// One epoch is one day. In order:
//   0  your interventions for the day (recorded in the save)
//   A  the calendar and the national path (policy rate, prices, energy)
//   B  the street-life law on the XPU turns yesterday's activity into today's street life
//   C  morning: illness, sick leave, who works, school; the weekly labour market (E1 admission)
//   D  work and the timecards; shops open; households shop; firms sell, tip, collect sales tax
//   E  firms restock from the rest of the world, export, produce
//   F  money: loan instalments, cards, payroll on paydays, taxes and benefits on their due dates
//   G  month and year ends: rent, bills, interest, B&O, property tax, returns, budgets, closing
//   H  housing, families, migration, new firms and buildings
//   I  minds: needs, mood, memories, expectations, the rails trust law for every relationship
//   J  the books are audited; the epoch is sealed into the digest chain
import { compile, WORDS, LANES } from "./lcufa.js";
import { sha256Hex, pyDumps } from "./simmy.js";
import { dayInfo, epochOf, RULE_SOURCES, payrollYear, federalYear, clearRuleCaches, electionDay } from "./rules.js";
import { N, CELLS, SECTORS, CATS, NCAT, CITY_NAME } from "./citydata.js";
import { Books, E_H0, E_F0, E_B0, E_CITY, E_SCHOOL, E_STATE, E_FEDGOV, E_FED, E_ROW, E_N, HCAP, FCAP, AC } from "./books.js";
import { Nation } from "./nation.js";
import { Slots, latticePolicy, projectFounder, TRUST_SPEC, MECHANISMS, BOOT_SHA, priorTrust } from "./core.js";
import { censusOpen, censusClose, census, lawUse, balanced, ftc, LAW_USE } from "./laws.js";
import { ROTATION_Q32 } from "./tables.js";
import { attachRegistry, registryBytes } from "./registry.js";
import { attachOuter, outerMonth, outerWeek, cityMigration, bankMeeting, stateElection, outerBytes, emigrate } from "./periphery.js";
import { attachWelfare, welfareMonth, welfareDay, placeMeasures, voteMeasures } from "./welfare.js";
import { attachHealth, healthDay, healthMonth, coverageMonth } from "./health.js";
import { lightDay, measureMonth, cityBoard } from "./kpis.js";
import { hire } from "./economy.js";
const hireOwner = (c, owner, f) => hire(c, owner, E_F0 + f, 11, 1080);
import { World } from "./world.js";
import { PEOPLE_SPEC, HOUSEHOLD_SPEC, genesisPeople, morning, minds, lifeEvents, activities, addMemory, trait, schoolDay, friendOf, fertilityMod, ageYears, T_C, T_E } from "./people.js";
import { asfr } from "./laws.js";
import { FIRM_SPEC, genesisFirms, employAll, laborMarket, shopping, firmDay, firmMonth, entrepreneurs, SPACE_FOR, hire as hireIn, URGE_N } from "./economy.js";
import { LOAN_SPEC, genesisBanks, openingBooks, financeDay, financeMonth, BANK_SLOTS } from "./finance.js";
import { payrollDay, taxesDay, taxesMonth, taxesYear, attachPayroll } from "./payroll.js";
import { civicDay, civicMonth, civicYear, civicGenesis, election } from "./civic.js";
import { housingDay, housingMonth, attachHousing } from "./housing.js";
import { attachDevelop, developDay, developMonth } from "./develop.js";

export const CITY_VERSION = "1.1.0";
export const SAVE_FORMAT = "PLUME-CITY/1";
export const PCAP = 24576, LCAP = 32768;

/* ------------------------------------------------------------------ the street-life law (LCUF-A) */
// P' = Life(P) + 2·nsum(P mod 2) + 16·(P - P mod 2). Bit 0: the lane is alive in the cell (enough people
// doing that thing there). Bits 1-4: live neighbours a generation ago. Bits 5-19: the three generations
// before, one nibble each, shifting up 4 bits a generation (2-adic forgetting): the city's memory of
// where life happens. The day's rule depends on the kind of day and the season.
export const STREETLIFE_SOURCE = `LCUF-A/0.3
module port.alder.streetlife
ring p=2 n=20
frame lanes=8 height=128 width=128
phase | id  | op    | inputs | output | arg
init  | i1  | from2 | in     | x      | -
step  | s1  | life  | x      | a      | -
step  | s2  | modj  | x      | v      | 1
step  | s3  | nsum  | v      | d      | -
step  | s4  | shift | d      | d2     | -
step  | s5  | mulc  | x      | h      | 16
step  | s6  | mulc  | v      | hv     | 1048560
step  | s7  | add   | h,hv   | h2     | -
step  | s8  | add   | a,d2   | y1     | -
step  | s9  | add   | y1,h2  | y      | -
step  | s10 | copy  | y      | x      | -
final | f1  | to2   | x      | out    | -
end
`;
export const LANE_NAMES = ["home life", "shopping", "dining", "work", "nightlife", "parks and play", "transit crowds", "disorder"];
export const LANE_THRESHOLD = [4, 4, 3, 6, 3, 2, 4, 1];
const bmask = (s) => [...s].reduce((m, c) => m | (1 << Number(c)), 0);
export const ruleOf = (b, s) => ({ birth: bmask(b), survive: bmask(s), text: `B${b}/S${s}` });
// [weekday, weekend or holiday] by season (winter, spring, summer, autumn)
export const DAY_RULES = [
  [ruleOf("3", "1234"), ruleOf("3", "12345")], [ruleOf("36", "1234"), ruleOf("36", "12345")],
  [ruleOf("36", "12345"), ruleOf("356", "123456")], [ruleOf("3", "12345"), ruleOf("36", "12345")],
];
export const seasonOf = (m) => (m === 12 || m <= 2 ? 0 : m <= 5 ? 1 : m <= 8 ? 2 : 3);
export const SEASONS = ["winter", "spring", "summer", "autumn"];

/* ------------------------------------------------------------------ configuration */
export const DEFAULT_CONFIG = { seed: 20261117, occupancy: 930, boot: "simmy", firms: 1000, banks: 3, outCommute: 100, unemployment: 45 };
export function normalizeConfig(c = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...c };
  const int = (k, lo, hi) => { if (!Number.isInteger(cfg[k]) || cfg[k] < lo || cfg[k] > hi) throw new Error(`config.${k} must be a whole number from ${lo} to ${hi}`); };
  int("seed", 0, 2 ** 31 - 1); int("occupancy", 300, 990); int("firms", 400, 1600); int("banks", 2, 3); int("outCommute", 0, 300); int("unemployment", 10, 200);
  if (!["simmy", "instant"].includes(cfg.boot)) throw new Error('config.boot must be "simmy" or "instant"');
  return Object.fromEntries(Object.keys(DEFAULT_CONFIG).sort().map((k) => [k, cfg[k]]));
}
export const INTERVENTIONS = {
  stimulus: { label: "Send every household a payment", args: { cents: [10000, 500000] } },
  localSalesTax: { label: "Change the local sales tax rate", args: { ppm: [0, 42000] } },
  cityLevy: { label: "Change the city's property levy rate (per $1,000)", args: { ppm: [200, 3600] } },
  minimumWage: { label: "Set a local minimum wage above the state's", args: { cents: [0, 4000] } },
  factoryClosure: { label: "Close the largest manufacturer", args: {} },
  tourismBoom: { label: "A season of extra visitors", args: { percent: [0, 200] } },
  rateShock: { label: "Banks add a spread to every new loan", args: { bp: [0, 600] } },
  busFrequency: { label: "Change bus frequency", args: { percent: [25, 300] } },
  newHousing: { label: "Zone and fund new apartments", args: { units: [10, 400] } },
  bankRun: { label: "A rumour about a bank", args: { bank: [0, 2] } },
};

const subtleDigest = async (bytes) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
const u8 = (a) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

/* ------------------------------------------------------------------ the city */
export class City {
  constructor(config, boot) {
    this.cfg = normalizeConfig(config);
    if (boot.sha256 !== BOOT_SHA) throw new Error("the Simmy replay did not verify; the city will not boot on it");
    this.boot = boot; this.P = latticePolicy(boot.policy);
    this.law = compile(STREETLIFE_SOURCE); this.lawSha = sha256Hex(STREETLIFE_SOURCE);
    this.gateAt = {}; for (const [key, sim, , core] of MECHANISMS) this.gateAt[key] = core || this.cfg.boot === "instant" ? 1 : boot.ready[sim] ?? 1;
    this.founders = Object.fromEntries(boot.founders.map((a) => [a.agent, projectFounder(this.P, a)]));
    const seed = this.cfg.seed;
    clearRuleCaches();
    censusOpen(this);                                                     // the founding census opens (law 12.42)
    this.world = new World(seed, (salt, a, b) => census(this, salt, a, b)); this.nation = new Nation(seed); this.books = new Books();
    this.people = new Slots(PCAP, PEOPLE_SPEC); this.hh = new Slots(HCAP, HOUSEHOLD_SPEC); this.firms = new Slots(FCAP, FIRM_SPEC); this.loans = new Slots(LCAP, LOAN_SPEC);
    this.banks = []; this.gov = {}; this.serial = 1;
    this.epoch = 0; this.events = []; this.interventions = []; this.history = []; this.months = []; this.last = null;
    this.frame = new Uint32Array(WORDS); this.xout = new Uint32Array(WORDS); this.vital = new Uint8Array(CELLS * LANES); this.act = new Uint16Array(CELLS * LANES);
    this.C = { transitions: 0 };
    this.rules = { y: 0 };
    this.genesis();
    this.digest = sha256Hex(pyDumps({ format: SAVE_FORMAT, config: this.cfg, simmy: boot.sha256, law: this.lawSha, opening: this.tableDigestSync() }));
    this.genesisDigest = this.digest;
  }
  gates(e) { const g = {}; for (const [key] of MECHANISMS) g[key] = this.gateAt[key] <= e; return g; }
  yearRules(y) {
    if (this.rules.y !== y) this.rules = { y, pay: payrollYear(y, this.nation), fed: federalYear(y, this.nation) };
    return this.rules;
  }
  genesis() {
    const d = dayInfo(1); this.today = d; this.yearRules(d.y);
    attachRegistry(this);
    genesisBanks(this);
    genesisPeople(this);
    genesisFirms(this);
    attachPayroll(this); attachHousing(this); civicGenesis(this);
    employAll(this);
    openingBooks(this);
    attachDevelop(this);
    attachWelfare(this); attachHealth(this); this.friendOf = (i, k) => friendOf(this, i, k);
    this.emigrate = (h, place) => emigrate(this, h, place); this.cityMigration = (dd) => cityMigration(this, dd);
    attachOuter(this); coverageMonth(this);
    welfareMonth(this, d); this.gov.welDone = 1;                         // the founding month's enrolment and benefits
    measureMonth(this); cityBoard(this);
    // where each person's and household's urges stood in their cycles at the founding (law 12.42), so that none begin
    // in step: the charges that integrate a rate without a leak (law 57.9) start at their census phase
    const P = this.people, H = this.hh, Q = 4294967296;
    for (const i of P.each()) for (let k = 0; k < URGE_N; k++) P.urge[i * URGE_N + k] = census(this, 0x7a50 + k, i) / Q;
    for (const h of H.each()) { for (let k = 0; k < 6; k++) H.hurge[h * 6 + k] = census(this, 0x4a50 + k, h) / Q; for (let k = 0; k < 10; k++) H.apply[h * 10 + k] = census(this, 0x5a50 + k, h) / Q / 2; H.leave[h] = census(this, 0x1ea7, h) / Q; }
    { let wsum = 0, msum = 0; for (const i of P.each()) { const h = P.hh[i], y = ageYears(this, i, 1); if (P.sex[i] !== 1 || y < 15 || y > 49 || h < 0 || H.home[h] < 0) continue; const w = asfr(y); wsum += w; msum += w * fertilityMod(this, i, h); }
      this.gov.fertScale = msum > 0 ? Math.round((wsum / msum) * 1e6) : 1e6; }   // ppm: the founding women's circumstances average one
    censusClose(this);                                                    // from here on nothing is drawn
    activities(this, d, true);
    this.stampFrame(d);
  }
  // nature's share of a newborn: the sex at birth, the one quantity no one decides, taken along an irrational rotation
  // over the sequence of births so the population's ratio (512 boys in 1,000 births) is kept exactly (law 12.42)
  birthSex() { lawUse("12.42"); const n = (this.gov.birthSeq = (this.gov.birthSeq || 0) + 1), x = ((n * (ROTATION_Q32[3] / 4294967296)) % 1 + ((this.cfg.seed % 997) / 997)) % 1; return x < 0.512 ? 0 : 1; }
  // a citizen takes a job outside the city (with an outer firm), commuting from home
  hireAway(i, f, wage) { hireIn(this, i, E_ROW, this.people.occ[i] || 1, 1000); this.people.wage[i] = wage; this.people.away[i] = f + 1; }
  event(kind, text, ids = []) { this.events.push({ epoch: this.epoch, kind, text, ids }); if (this.events.length > 800) this.events.splice(0, this.events.length - 800); }
  nextSerial() { return this.serial++; }
  // interventions are recorded with the epoch at which they apply and replayed from the save
  intervene(kind, args = {}) {
    const spec = INTERVENTIONS[kind]; if (!spec) throw new Error(`unknown intervention "${kind}"`);
    for (const [k, [lo, hi]] of Object.entries(spec.args)) { const v = args[k]; if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${kind}.${k} must be a whole number from ${lo} to ${hi}`); }
    const iv = { epoch: this.epoch + 1, kind, args: Object.fromEntries(Object.keys(spec.args).sort().map((k) => [k, args[k]])) };
    this.interventions.push(iv); return iv;
  }

  /* -------------------------------------------------------------- one day */
  async step(engine, digest = subtleDigest) {
    const e = this.epoch + 1, d = dayInfo(e), g = this.gates(e), B = this.books;
    this.epoch = e; this.today = d; B.resetDay(e);
    const R = { epoch: e, date: d.iso, label: d.label, holiday: d.holiday, ms: {}, counts: {}, notes: [] };
    this.R = R; this.yearRules(d.y);
    const t0 = globalThis.performance ? performance.now() : 0;
    for (const iv of this.interventions) if (iv.epoch === e) this.applyIntervention(iv, R);
    // B. the street-life law
    const season = seasonOf(d.m), rule = DAY_RULES[season][d.workday ? 0 : 1], gens = 2;
    const frameIn = this.frame, frameInSha = await digest(u8(frameIn));
    const r = await engine.run(this.law, frameIn, gens, rule); R.ms.xpu = r.ms;
    this.xout = r.out; this.lastRule = rule; this.vitality(d);
    // C-I
    lightDay(this, d);
    healthDay(this, d);
    morning(this, d, g);
    if (d.monthStart) { coverageMonth(this); if (this.gov.welDone !== (d.y - 2026) * 12 + d.m) welfareMonth(this, d); this.gov.welDone = 0; }
    if (d.wd === 1 || e === 1) { laborMarket(this, d, g); outerWeek(this, d); }
    shopping(this, d, g);
    developDay(this, d, g);
    firmDay(this, d, g);
    financeDay(this, d, g);
    payrollDay(this, d, g);
    taxesDay(this, d, g);
    civicDay(this, d, g);
    welfareDay(this, d, schoolDay(d));
    bankMeeting(this, d);
    if (d.m === 8 && d.d === 1) placeMeasures(this, d, this.board);
    if (g.elections && d.m === 11 && d.d === electionDay(d.y)) { election(this, d); voteMeasures(this, d); stateElection(this, d); }
    housingDay(this, d, g);
    if (d.monthEnd) { taxesMonth(this, d, g); financeMonth(this, d, g); firmMonth(this, d, g); housingMonth(this, d, g); developMonth(this, d, g); civicMonth(this, d, g); healthMonth(this, d); this.monthStats(d); measureMonth(this); cityBoard(this); outerMonth(this, d); }
    if (g.entrepreneurs && d.monthStart) entrepreneurs(this, d, g);
    lifeEvents(this, d, g);
    minds(this, d, g);
    activities(this, d, false);
    if (d.yearEnd) { taxesYear(this, d, g); civicYear(this, d, g); this.closeYear(d); this.gov.deathsYear = 0; this.gov.birthsYear = 0; }
    // J. audit and seal
    const audit = this.audit(); R.audit = { ok: audit.ok, problems: audit.problems.slice(0, 6), checks: audit.checks.length };
    // the identities the audit rests on: every posting balances (law 53.32), and a stock is its opening plus its flows (law 4.31)
    balanced(audit.problems.length, 0); ftc(0, [audit.checks.filter((x) => x.ok).length], audit.checks.filter((x) => x.ok).length);
    if (!audit.ok) this.event("audit", `The books did not balance on ${d.label}: ${audit.problems[0]}`);
    this.stampFrame(dayInfo(e + 1));
    R.stats = this.stats(); R.ms.total = globalThis.performance ? performance.now() - t0 : 0;
    const tables = await digest(this.tableBytes()), frameOutSha = await digest(u8(this.xout));
    this.digest = sha256Hex(pyDumps({ law: this.lawSha, previous: this.digest, epoch: e, date: d.iso, frame_in: frameInSha, frame_out: frameOutSha, tables, rule: rule.text, stats: R.stats.digestable }));
    R.digest = this.digest; this.last = R;
    this.history.push({ e, digest: this.digest, ...R.stats.series });
    return R;
  }
  applyIntervention(iv, R) {
    const a = iv.args, G = this.gov;
    switch (iv.kind) {
      case "stimulus": for (const h of this.hh.each()) this.books.pay(E_FEDGOV, E_H0 + h, a.cents, AC.X_TRANSFER, AC.R_TRANSFER, 7); this.event("policy", `Every household receives $${(a.cents / 100).toFixed(2)}`); break;
      case "localSalesTax": G.localSales = a.ppm; this.event("policy", `The local sales tax becomes ${(a.ppm / 10000).toFixed(2)}%`); break;
      case "cityLevy": G.cityLevy = a.ppm; this.event("policy", `The city levy becomes $${(a.ppm / 1000).toFixed(2)} per $1,000`); break;
      case "minimumWage": G.localMinWage = a.cents; this.event("policy", a.cents ? `A local minimum wage of $${(a.cents / 100).toFixed(2)} an hour` : "The local minimum wage is repealed"); break;
      case "factoryClosure": { let best = -1, bs = 0; for (const f of this.firms.each()) if (this.firms.sector[f] === 17 && this.firms.staff[f] > bs) { bs = this.firms.staff[f]; best = f; } if (best >= 0) { this.firms.status[best] = 2; this.event("shock", `${this.firmName(best)} announces it will close`); } break; }
      case "tourismBoom": G.tourism = a.percent; this.event("shock", `Visitors rise by ${a.percent}% this season`); break;
      case "rateShock": for (const k of this.banks) k.shock = a.bp; this.event("shock", `Banks add ${a.bp} basis points to new loans`); break;
      case "busFrequency": G.busFreq = a.percent; this.event("policy", `Buses run at ${a.percent}% of their timetable`); break;
      case "newHousing": G.newHousing = (G.newHousing || 0) + a.units; this.event("policy", `${a.units} new apartments are zoned and funded`); break;
      case "bankRun": if (this.banks[a.bank]) { this.banks[a.bank].rumour = 60; this.event("shock", `A rumour spreads about ${this.banks[a.bank].name}`); } break;
    }
    R.notes.push(`intervention: ${iv.kind}`);
  }

  /* -------------------------------------------------------------- street life */
  vitality(d) {
    const X = this.xout, V = this.vital, W = this.world;
    for (let c = 0; c < CELLS; c++) {
      const dead = W.water[c] || (c >> 7) < 2 || (c >> 7) > N - 3;
      for (let k = 0; k < LANES; k++) {
        const q = c * LANES + k; let w = X[q];
        if (dead) { w = 0; X[q] = 0; }
        V[q] = ((w & 1) << 3) + ((w >>> 1) & 15) + (((w >>> 5) & 15) >>> 1);
      }
    }
  }
  // set bit 0 of each lane where enough people did that thing yesterday; keep the memory bits
  stampFrame(d) {
    const F = this.frame, X = this.xout, A = this.act, W = this.world;
    for (let c = 0; c < CELLS; c++) for (let k = 0; k < LANES; k++) {
      const q = c * LANES + k, on = A[q] >= LANE_THRESHOLD[k] && !W.water[c] ? 1 : 0;
      F[q] = (X[q] & 0xffffe) | on;
    }
    A.fill(0);
  }
  addAct(cell, lane, n = 1) { if (cell >= 0) { const q = cell * LANES + lane; this.act[q] = Math.min(65535, this.act[q] + n); } }

  /* -------------------------------------------------------------- books, audit, digests */
  audit() {
    const A = this.books.audit(), L = this.loans, B = this.books;
    // the loan book: each bank's loans by type equal its loan accounts; each borrower's liabilities equal its loans
    const lend = new Map(), owe = new Map();
    const acctOf = [[AC.LOAN_MORT, AC.L_MORT], [AC.LOAN_BIZ, AC.L_BIZ], [AC.LOAN_AUTO, AC.L_AUTO], [AC.LOAN_CARD, AC.L_CARD]];
    for (const l of L.each()) {
      if (L.status[l] !== 1) continue;
      const [la, lb] = acctOf[L.type[l]], kb = (L.bank[l] === 255 ? E_ROW : E_B0 + L.bank[l]) * 100 + la, kw = L.who[l] * 100 + lb;
      lend.set(kb, (lend.get(kb) || 0) + L.prin[l]); owe.set(kw, (owe.get(kw) || 0) + L.prin[l]);
    }
    let bad = 0;
    for (const le of [...this.banks.map((_, k) => E_B0 + k), E_ROW]) for (const [la] of acctOf) { const v = B.get(le, la), w = lend.get(le * 100 + la) || 0; if (v !== w) { bad++; A.problems.push(`lender ${le} ${la}: ledger ${v} != loan book ${w}`); } }
    const borrowers = new Set([...owe.keys()].map((k) => Math.floor(k / 100)));
    for (const e of borrowers) for (const [, lb] of acctOf) { const v = -B.get(e, lb), w = owe.get(e * 100 + lb) || 0; if (v !== w) { bad++; if (bad < 6) A.problems.push(`entity ${e} ${lb}: ledger ${v} != loans ${w}`); } }
    A.checks.push({ name: "the loan book matches the ledgers", a: bad, b: 0, ok: bad === 0 });
    A.ok = A.problems.length === 0;
    this.lastAudit = A; return A;
  }
  tableBytes() {
    const W = this.world, parts = [this.people.bytes(), this.hh.bytes(), this.firms.bytes(), this.loans.bytes(), this.books.bytes(), W.buildings.bytes(), W.dwellings.bytes(), W.spaces.bytes(), u8(W.land), u8(W.tree), this.projects.bytes(), this.proposals.bytes(), registryBytes(this), ...outerBytes(this),
      new TextEncoder().encode(pyDumps({ banks: this.banks.map((k) => ({ ...k, name: undefined, short: undefined })), gov: this.gov }))];
    const n = parts.reduce((s, p) => s + p.length, 0), out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
  }
  tableDigestSync() { return sha256Hex(this.tableBytes()); }
  closeYear(d) { for (let e = 0; e < E_N; e++) this.books.closeYear(e); this.event("books", `The books close for ${d.y}`); }

  /* -------------------------------------------------------------- names and statistics */
  firmName(f) { return this.names.firm(f); }
  remember(i, kind, who) { addMemory(this, i, kind, who); }
  // the State's side of sales tax a firm has collected (and the city's local share of it)
  accrueSalesTax(fe, tax) {
    if (!tax) return; const B = this.books, local = this.gov.localSales ?? 30000, total = 65000 + local, lp = Math.round((tax * local) / total);
    B.post(E_STATE, AC.TAXR_SALES, AC.R_SALES_TAX, tax - lp, 5, fe); B.post(E_STATE, AC.TAXR_SALES, AC.DIST_PAY, lp, 5, fe); B.post(E_CITY, AC.DIST_RECV, AC.R_SALES_TAX, lp, 5, E_STATE);
  }
  // the temperament a firm runs on: its owner's personality, or a stable stand-in
  // the temperament a firm runs on: its owner's; without one, its longest-serving employee's; or the middle of every scale
  ownerTraits(f) { const o = this.slotOf(this.firms.owner[f]); if (o >= 0) return this.people.traits[o]; let best = -1; for (const i of this.people.each()) if (this.people.emp[i] === E_F0 + f && (best < 0 || this.people.hired[i] < this.people.hired[best])) best = i; return best >= 0 ? this.people.traits[best] : 0x88888888; }
  // the tip goes to the worker on shift who has had the fewest tips this pay period
  onShift(f, customer) { const l = this.shift?.get(f); if (!l || !l.length) return -1; let w = l[0]; for (const x of l) if (this.people.ptips[x] < this.people.ptips[w]) w = x; return w; }
  visitMinute(i, f, k) {
    // when: the conscientious go early, the sociable late (the person's own rhythm), later errands after earlier ones
    const S = SECTORS[this.firms.sector[f]], t = this.people.traits[i], early = (15 - trait(t, T_C)) / 15, late = trait(t, T_E) / 15, atWork = this.people.today[i] & 1;
    if (S.key === "bar") return 1200 + Math.round(late * 140);
    if ((S.key === "restaurant" || S.key === "cafe") && atWork) return 720 + Math.round(early * 50);
    const lo = Math.max(S.open, atWork ? 1050 : 540), hi = Math.min(S.close - 30, 1260); return lo + Math.round(Math.max(0, hi - lo) * Math.min(0.95, early * 0.6 + k * 0.15));
  }
  openFirm(sec, sp, owner) {
    const F = this.firms, S = SECTORS[sec], f = F.alloc(); if (f < 0) return -1;
    // the founder names the business, prices it by appetite for risk, and builds its quality from skill and care
    const W = this.world, B = this.books, P = this.people, t = P.traits[owner];
    F.sector[f] = sec; F.space[f] = sp; F.nspace[f] = 1; W.spaces.tenant[sp] = E_F0 + f; F.name[f] = P.family[owner] * 257 + P.given[owner] * 7; F.founded[f] = this.epoch; F.owner[f] = P.sin[owner];
    F.price[f] = Math.round(S.price * (950 + (trait(t, 5) - 8) * 12 + 50) / 1000 / 5) * 5; F.cost[f] = Math.round(S.price * S.cost / 1e6);
    F.quality[f] = Math.max(300, Math.min(950, 450 + (P.skill[owner] >> 2) + (trait(t, T_C) - 8) * 20)); F.offer[f] = 1040; F.want[f] = S.staff[0]; F.uiRate[f] = 12000; F.line[f] = -1; F.boClass[f] = S.bo; F.expD[f] = Math.round(S.staff[0] * 7 * S.rate / 10);
    F.landlord[f] = W.buildings.owner[W.spaces.bld[sp]]; F.rentDue[f] = W.spaces.rent[sp];
    priorTrust(this.P, F, "cr", f); priorTrust(this.P, F, "kb", f);
    const hh = P.hh[owner], he = E_H0 + hh, k = B.bankOf[he]; B.bankOf[E_F0 + f] = k; B.resetEntity(E_F0 + f);
    const stake = Math.min(Math.round((B.get(he, AC.DEPOSITS) + B.get(he, AC.SAVINGS)) * 0.6), 6000000);
    if (!this.fund(he, stake)) return -1;
    B.pay(he, E_F0 + f, stake, AC.X_OTHER, AC.EQUITY, 23);       // a private stake: the owner's books expense it
    const capex = S.staff[0] * 1500000; F.capex[f] = capex; F.lineLim[f] = S.staff[0] * 3000 * 173 * 2;
    if (this.borrow(E_F0 + f, capex, 1)) B.pay(E_F0 + f, E_ROW, capex, AC.EQUIP, AC.R_SALES, 2);
    if (P.emp[owner] >= 0) this.leaveJob(owner, false);
    hireOwner(this, owner, f);
    return f;
  }
  stats() {
    const P = this.people, H = this.hh, F = this.firms, B = this.books;
    let pop = 0, adults = 0, employed = 0, unemployed = 0, retired = 0, kids = 0, val = 0, stress = 0, lf = 0;
    const lv = [0, 0, 0, 0], need = new Float64Array(8);
    for (const i of P.each()) {
      pop++; const s = P.status[i]; val += P.val[i]; stress += P.stress[i];
      if (s === 0 || s === 1) kids++; else adults++;
      if (s === 2 || s === 6) employed++; if (s === 3) unemployed++; if (s === 5) retired++;
      lv[P.tcLv[i]]++; for (let k = 0; k < 8; k++) need[k] += P.need[i * 8 + k];
    }
    lf = employed + unemployed;
    let firms = 0, firmStaff = 0; for (const f of F.each()) if (F.status[f] !== 1) { firms++; firmStaff += F.staff[f]; }
    let dep = 0, loans = 0; for (let k = 0; k < this.banks.length; k++) { dep -= B.get(E_B0 + k, AC.DEP_PAY) + B.get(E_B0 + k, AC.SAV_PAY); loans += B.get(E_B0 + k, AC.LOAN_MORT) + B.get(E_B0 + k, AC.LOAN_BIZ) + B.get(E_B0 + k, AC.LOAN_AUTO) + B.get(E_B0 + k, AC.LOAN_CARD); }
    const rate = this.nation.rate(this.epoch || 1), cityCash = B.get(E_CITY, AC.DEPOSITS) + B.get(E_CITY, AC.SAVINGS);
    const u = lf ? Math.round((unemployed * 10000) / lf) : 0;
    const series = { pop, households: H.count, firms, employed, unemployment: u, mood: pop ? Math.round(val / pop) : 0, stress: pop ? Math.round(stress / pop) : 0,
      deposits: dep, loans, cityCash, cpi: this.gov.cpi || 1000000, policy: rate.hi, trustCity: pop ? Math.round((lv[2] + lv[3]) * 1000 / pop) : 0 };
    return { series, needs: Array.from(need, (v) => (pop ? Math.round(v / pop) : 0)), trustLevels: lv, adults, kids, retired, firmStaff,
      digestable: { pop, households: H.count, firms, employed, unemployed, deposits: dep, loans, mood: series.mood } };
  }
  monthStats(d) {
    const s = this.stats().series;
    this.months.push({ y: d.y, m: d.m, ...s, sales: this.gov.monthSales || 0, cityRevenue: this.gov.monthRevenue || 0, cpiCity: this.gov.cpi || 1000000, rent: this.gov.avgRent || 0, wage: this.gov.avgWage || 0, homePrice: this.gov.avgHomePrice || 0,
      built: this.gov.dev?.built || 0, demolished: this.gov.dev?.demolished || 0, newHomes: this.gov.dev?.homes || 0, designs: this.gov.dev?.designs || 0, condition: this.meanCondition() });
  }
  meanCondition() { const T = this.world.buildings; let s = 0, n = 0; for (const b of T.each()) if (!T.stage[b]) { s += T.cond[b]; n++; } return n ? Math.round(s / n) : 0;
  }
  /* -------------------------------------------------------------- saves */
  saveText() { return JSON.stringify({ format: SAVE_FORMAT, version: CITY_VERSION, config: this.cfg, simmy: this.boot.sha256, genesis: this.genesisDigest, epoch: this.epoch, interventions: this.interventions, chain: this.history.map((h) => [h.e, h.digest]) }, null, 1); }
}
export { RULE_SOURCES, SECTORS, CATS, NCAT, CITY_NAME, E_H0, E_F0, E_B0, E_CITY, E_SCHOOL, E_STATE, E_FEDGOV, E_FED, E_ROW, E_N, TRUST_SPEC, epochOf, BANK_SLOTS, dayInfo };
export { LAWS, LAW_ROWS, LAW_USES, CORPUS, PART0, faithful } from "./laws.js";
export { OFFICES, OFFICE_NAMES, CAUSES, SIN_STATUS, lookup as lookupSin, sinText, registryRows } from "./registry.js";
export { LAYERS, PLACES, SECTORS_OUT, STATE_MEASURES } from "./periphery.js";
export { COVER, coverage } from "./health.js";
export { MEASURES } from "./welfare.js";
export { VARIABLES, TABLE_GROUPS } from "./variables.js";

export { simmyBoot, LEVEL_NAMES, trustScore } from "./core.js";
export { ACCOUNTS, KINDS, SECTOR_NAMES, sectorOf, NACC, ACC_TYPE } from "./books.js";
export { STATUS, NEEDS, MEM, TRAITS, MODES, members, homeBuilding } from "./people.js";
export { OCCS, BKIND, NEIGHBOURHOODS, LAND, MATERIALS, EDUCATION, CELL_M } from "./citydata.js";
export { FIRM_STATUS } from "./economy.js";
export { LOAN_TYPES } from "./finance.js";
export { BO_NAMES, STATE_SALES, LOCAL_SALES } from "./rules.js";
export { projectRows, describeDesign, buildingName, authorName, STAGES, MOTIVES, ZONES, RULES as DEV_RULES, KIND_NOUN, WHY, ST } from "./develop.js";
// names this module imports for its own use and also offers
export { LAW_USE, cityBoard, MECHANISMS, AC, trait, ageYears };
