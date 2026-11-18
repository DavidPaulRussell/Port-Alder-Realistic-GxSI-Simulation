// Firms, jobs, shops and prices in Port Alder.
// SPDX-License-Identifier: GPL-3.0-only
import { ppm, mulDiv, divRound, STATE_SALES, LOCAL_SALES } from "./rules.js";
import { SECTORS, S as SK, CATS, NCAT, OCCS, O, PUBLIC_JOBS, CELL_M } from "./citydata.js";
import { AC, ACCOUNTS, CONS_ACC, K, E_H0, E_F0, E_B0, E_CITY, E_SCHOOL, E_STATE, E_ROW, E_FEDGOV } from "./books.js";
// the units a member of staff serves on a day the firm is open: eight hours at the trade's rate per quarter-hour, shared
// over the open days when the firm opens more days than a person works (five)
const openDays = (S) => { let n = 0; for (let k = 0; k < 7; k++) if (S.days & (1 << k)) n++; return Math.max(1, n); };
export const perStaffOpen = (S) => ((S.rate * 8 * 4) / 400) * Math.min(1, 5 / openDays(S));
const X_ACC = ACCOUNTS.map((r, k) => (r[2] === "X" ? k : -1)).filter((k) => k >= 0);
import { sat, isqrt, TRUST_SPEC, tickTrust, priorTrust, trustScore, admitE1, F_RUNNING } from "./core.js";
import { census, lif, kleiber, MASS_BY_AGE, spoil, miner, balance, lerner, ols, fechner, elastic, budgetShares, weakTie } from "./laws.js";
import { creditOk } from "./finance.js";
import { members, homeCell, addMemory, remembers, M, trait, T_O, T_C, T_E, T_A, T_N, T_RISK, T_THRIFT, ageYears, schoolDay } from "./people.js";

export const FIRM_SPEC = [["alive", Uint8Array], ["sector", Uint8Array], ["owner", Int32Array], ["space", Int32Array], ["nspace", Uint8Array], ["name", Uint32Array], ["founded", Int32Array],
  ["mkt", Float64Array], ["short", Float64Array],
  ["price", Int32Array], ["cost", Int32Array], ["inv", Int32Array], ["transit", Int32Array], ["arrive", Int32Array], ["quality", Uint16Array],
  ...TRUST_SPEC("cr"), ...TRUST_SPEC("kb"), ["crCo", Uint16Array], ["crDe", Uint16Array],
  ["staff", Uint16Array], ["want", Uint16Array], ["open", Uint16Array], ["offer", Int32Array], ["unfilled", Uint16Array],
  ["conf", Int16Array], ["expD", Int32Array], ["sold", Int32Array], ["lost", Int32Array], ["capa", Int32Array], ["qh", Int32Array],
  ["mem", Int32Array, 8], ["wk", Int32Array], ["mRev", Float64Array], ["ytdGross", Float64Array], ["lyGross", Float64Array], ["taxDay", Int32Array], ["supplies", Float64Array],
  ["line", Int32Array], ["lineLim", Int32Array], ["status", Uint8Array], ["distress", Uint16Array], ["uiCharge", Float64Array], ["uiRate", Int32Array], ["cover", Uint8Array],
  ["landlord", Int32Array], ["rentDue", Int32Array], ["capex", Float64Array], ["export", Int32Array], ["lastPrice", Int32Array], ["boClass", Uint8Array]];
export const FIRM_STATUS = ["open", "closed", "closing"];

/* ------------------------------------------------------------------ helpers on the city */
export function attach(c) {
  const W = c.world, F = c.firms, P = c.people;
  c.SECTORS_DAYS = SECTORS.map((s) => s.days);
  c.firmBld = (f) => W.spaces.bld[F.space[f]];
  c.firmCell = (f) => (F.space[f] >= 0 ? W.frontCell(W.spaces.bld[F.space[f]]) : -1);
  c.workCell = (i) => { const e = P.emp[i]; if (e >= E_F0 && e < E_B0) return c.firmCell(e - E_F0); if (e === E_CITY) return c.gov.cityCell ?? -1; if (e === E_SCHOOL) return P.school[i] >= 0 ? W.frontCell(P.school[i]) : c.gov.schoolCell ?? -1; if (e >= E_B0 && e < E_CITY) return c.banks[e - E_B0]?.cell ?? -1; return W.routes[0].cells[W.routes[0].cells.length - 1]; };
  c.parkNear = (cell) => { const x0 = cell & 127, y0 = cell >> 7; for (let r = 1; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 2 || x > 127 || y > 125) continue; const cc = (y << 7) | x; if (W.land[cc] === 2) return cc; } return -1; };
  c.firmsOf = (cat) => { const out = []; for (const f of F.each()) if (F.status[f] === 0 && SECTORS[F.sector[f]].cat === cat) out.push(f); return out; };
  // the people someone spends the week with: the most like-minded coworker and neighbour (homophily)
  const likeness = (i, j) => [T_O, T_C, T_E, T_A].reduce((s2, k) => s2 + Math.abs(trait(P.traits[i], k) - trait(P.traits[j], k)), 0);
  c.coworker = (i) => { const e = P.emp[i]; if (e < 0 || e === E_ROW) return -1; let best = -1, bd = 1e9, n = 0; for (const j of (c.social ? c.social.byE.get(e) || [] : P.each())) if (P.emp[j] === e && j !== i) { const dd = likeness(i, j) * 4096 + (P.sin[j] & 4095); if (dd < bd) { bd = dd; best = j; } if (++n > 60) break; } return best; };
  c.neighbour = (i) => { const h = P.hh[i]; if (h < 0 || c.hh.home[h] < 0) return -1; const b = W.dwellings.bld[c.hh.home[h]]; let best = -1, bd = 1e9; for (const j of (c.social ? c.social.byB.get(b) || [] : P.each())) { const hj = P.hh[j]; if (hj >= 0 && hj !== h && c.hh.home[hj] >= 0 && W.dwellings.bld[c.hh.home[hj]] === b && ageYears(c, j) >= 14) { const dd = likeness(i, j) * 4096 + (P.sin[j] & 4095); if (dd < bd) { bd = dd; best = j; } } } return best; };
  // who lives in each building and works at each employer, gathered once for a week's company (the scans above then
  // read these lists instead of the whole city; each candidate is checked against the live state)
  c.socialIndex = () => { const byB = new Map(), byE = new Map(); for (const j of P.each()) { const hj = P.hh[j]; if (hj >= 0 && c.hh.home[hj] >= 0) { const b = W.dwellings.bld[c.hh.home[hj]]; let a = byB.get(b); if (!a) byB.set(b, (a = [])); a.push(j); } const ej = P.emp[j]; if (ej >= 0 && ej !== E_ROW) { let a = byE.get(ej); if (!a) byE.set(ej, (a = [])); a.push(j); } } c.social = { byB, byE }; };
  c.leaveJob = (i, laidOff) => leaveJob(c, i, laidOff);
  c.closeFirm = (f, why) => closeFirm(c, f, why);
}
const dist = (a, b) => Math.abs((a & 127) - (b & 127)) + Math.abs((a >> 7) - (b >> 7));
// an urge to do something builds each day by its drive (what used to be the day's odds) and the person acts when it
// reaches one (law 57.9, without leak, so the long-run frequency is the drive itself)
export const URGE = { dine: 0, goods: 1, salon: 2, sickVisit: 3, checkup: 4, hospital: 5, gym: 6, bar: 7, busLate: 8, busPraise: 9, counselling: 10, vaccine: 11 }, URGE_N = 12;
export const urge = (arr, x, drive) => { const v = lif(arr[x], drive, 0); if (v >= 1) { arr[x] = v - 1; return true; } arr[x] = v; return false; };
const SPACE_FOR = (sec) => ({ shop: 0, office: 1, industrial: 2, hotel: 3, clinic: 4, hospital: 5 }[SECTORS[sec].space]);
const PREF_HOOD = { grocery: [2, 3, 4, 5, 7, 1], restaurant: [0, 1, 0, 1, 3, 7], cafe: [0, 1, 1, 3, 2, 7], bar: [1, 0, 1, 6], retail: [0, 1, 1, 0, 5], hardware: [5, 6, 3], pharmacy: [1, 3, 5, 4],
  clinic: [3, 5, 4, 2], salon: [1, 3, 7, 2, 5], gym: [0, 3, 7], auto: [6, 5], fuel: [5, 6, 4, 2], childcare: [2, 3, 4, 5, 7], hotel: [0], professional: [0, 0, 1], software: [0, 0, 1, 6],
  manufacturing: [6], logistics: [6], construction: [6, 5], realty: [0, 1] };

/* ------------------------------------------------------------------ genesis */
export function genesisFirms(c) {
  attach(c);
  const F = c.firms, W = c.world, SP = W.spaces, s = c.cfg.seed, P = c.people;
  const scale = (P.count / 13000) * (c.cfg.firms / 1000);
  const owners = []; for (const i of P.each()) if (P.status[i] === 3 && ageYears(c, i, 1) >= 26 && ageYears(c, i, 1) <= 64) owners.push(i);
  let oi = 0;
  const used = new Uint8Array(SP.top);
  for (let sec = 0; sec < SECTORS.length; sec++) {
    const S = SECTORS[sec], n = Math.max(1, Math.round(S.n * (sec === SK.hospital ? 1 : scale))), kind = SPACE_FOR(sec);
    for (let k = 0; k < n; k++) {
      // the best vacant space of the right kind in a preferred neighbourhood
      let best = -1, bs = -1e9;
      for (const p of SP.each()) {
        if (used[p] || SP.kind[p] !== kind || SP.tenant[p] >= 0) continue;
        const b = SP.bld[p], hood = W.buildings.hood[b], pref = PREF_HOOD[S.key] || [], pi = pref.indexOf(hood);
        const sc = (pi < 0 ? -400 : 300 - pi * 40) + (census(c, 0x5ace, p, (sec * 64 + k) % 4096) % 260) + (W.road[W.frontCell(b)] === 2 ? 60 : 0);
        if (sc > bs) { bs = sc; best = p; }
      }
      if (best < 0) continue;
      used[best] = 1;
      const f = F.alloc(); if (f < 0) break;
      const h = census(c, 0xf1a, f, sec);
      F.sector[f] = sec; F.space[f] = best; F.nspace[f] = 1; SP.tenant[best] = E_F0 + f; F.name[f] = h; F.founded[f] = 1 - (h % 7000);
      F.owner[f] = oi < owners.length ? P.sin[owners[(oi++ * 7919) % owners.length]] : -1;
      F.price[f] = Math.round((S.price * (900 + (h >>> 8) % 260)) / 1000 / 5) * 5; F.cost[f] = ppm(F.price[f], S.cost);
      F.quality[f] = 400 + ((h >>> 12) % 500); F.conf[f] = 100; F.offer[f] = 1000 + ((h >>> 4) % 120) - 40;
      F.want[f] = S.staff[0] + ((h >>> 3) % (S.staff[1] - S.staff[0] + 1));
      F.uiRate[f] = 12000; F.cover[f] = F.want[f] >= 50 || ["software", "professional", "hospital", "manufacturing", "clinic"].includes(S.key) ? 1 : 0;
      F.line[f] = -1; F.landlord[f] = -1; F.boClass[f] = S.bo;
      priorTrust(c.P, F, "cr", f); priorTrust(c.P, F, "kb", f);
      c.books.bankOf[E_F0 + f] = h % 1000 < 420 ? 0 : h % 1000 < 780 ? 1 : 2 % c.cfg.banks;
      F.expD[f] = Math.max(10, Math.round((F.want[f] * 7 * S.rate) / 100) * 10);   // units a day x 10
      if (sec === SK.grocery) F.expD[f] = Math.round((P.count / Math.max(1, Math.round(S.n * scale))) * 10);
      if (S.cat >= 0 && S.cat <= 7 && S.cost > 300000) F.inv[f] = Math.round(F.expD[f] * 0.8);
    }
  }
  // the largest employers take extra space next to their first
  for (const f of F.each()) {
    const need = Math.ceil(F.want[f] / (SPACE_FOR(F.sector[f]) === 2 ? 40 : SPACE_FOR(F.sector[f]) === 1 ? 14 : 30)) - 1;
    for (let k = 0; k < need; k++) {
      const home = W.frontCell(SP.bld[F.space[f]]); let best = -1, bd = 1e9;
      for (const p of SP.each()) if (SP.tenant[p] < 0 && SP.kind[p] === SP.kind[F.space[f]]) { const dd = dist(W.frontCell(SP.bld[p]), home); if (dd < bd) { bd = dd; best = p; } }
      if (best < 0 || bd > 12) break; SP.tenant[best] = E_F0 + f; F.nspace[f]++;
    }
  }
  c.gov.cityCell = W.frontCell(W.sites[0]); c.gov.schoolCell = W.frontCell(W.sites[6]);
}

/* ------------------------------------------------------------------ jobs */
export function wageFor(c, occ, skill, sector, offer) {
  const base = OCCS[occ].wage || 2000;
  const prem = sector === SK.software ? 1100 : sector === SK.hospital ? 1040 : sector === SK.manufacturing ? 1030 : sector === SK.restaurant || sector === SK.cafe || sector === SK.bar ? 960 : 1000;
  const w = Math.round((base * (850 + skill * 0.4) * prem * (offer || 1000)) / 1e9 / 5) * 5;
  return Math.max(w, minimumWageNow(c));
}
export function minimumWageNow(c) { const r = c.yearRules(c.today.y).pay; return Math.max(r.minWage, c.gov.localMinWage || 0); }
export function hire(c, i, emp, occ, offerFactor = 1000) {
  const P = c.people, s = c.cfg.seed, sector = emp >= E_F0 && emp < E_B0 ? c.firms.sector[emp - E_F0] : -1;
  if (P.emp[i] >= 0) leaveJob(c, i, false);
  P.emp[i] = emp; P.status[i] = 2; P.occ[i] = occ; P.hired[i] = c.epoch; P.empW[i] = 0; P.empWnt[i] = 0;
  P.wage[i] = wageFor(c, occ, P.skill[i], sector, offerFactor);
  const pay = c.yearRules(c.today.y).pay;
  P.sal[i] = OCCS[occ].salaried && P.wage[i] * 2080 >= pay.exemptSalary ? 1 : 0;
  const hh = P.hh[i], young = ageYears(c, i) < 25, carer = hh >= 0 && members(c, hh).some((j) => ageYears(c, j) < 5) && c.hh.adults[hh] >= 2;
  const part = (occ === O.service || occ === O.food || occ === O.care) && (young || carer || P.status[i] === 1 || trait(P.traits[i], T_C) < 7);
  P.hours[i] = part ? 5 : 8;
  const open = sector >= 0 ? SECTORS[sector].open : emp === E_SCHOOL ? 450 : 480;
  P.shift[i] = sector >= 0 && SECTORS[sector].close - open > 600 ? open + (trait(P.traits[i], T_E) >= 9 ? 1 : 0) * Math.max(0, SECTORS[sector].close - open - P.hours[i] * 60) : open;   // the sociable take the late shift
  priorTrust(c.P, P, "te", i);
  P.ui[i] = 0; P.uiLeft[i] = 0; P.uiWait[i] = 0;
  if (emp >= E_F0 && emp < E_B0) c.firms.staff[emp - E_F0]++;
  commuteMode(c, i);
}
export function leaveJob(c, i, laidOff) {
  const P = c.people, emp = P.emp[i]; if (emp < 0) return;
  if (emp >= E_F0 && emp < E_B0) c.firms.staff[emp - E_F0] = Math.max(0, c.firms.staff[emp - E_F0] - 1);
  P.lastEmp[i] = emp; P.emp[i] = -1; P.status[i] = 3;
  if (laidOff) { P.laidAt[i] = c.epoch; c.claimUI(i, emp); addMemory(c, i, M.was_laid_off, emp); }
}
export function commuteMode(c, i) {
  const P = c.people, h = P.hh[i], W = c.world; if (h < 0) return;
  const hc = homeCell(c, h), wc = c.workCell(i), cars = c.hh.cars[h], d = hc >= 0 && wc >= 0 ? dist(hc, wc) : 0, t = P.traits[i];
  if (d <= 14 && (trait(t, T_O) > 7 || d <= 8)) P.mode[i] = d > 9 && trait(t, T_O) > 10 && ageYears(c, i) < 50 ? 3 : 0;
  else if (cars && (d > 30 || W.stopNear[hc] < 0 || W.stopNear[wc] < 0 || trait(t, T_THRIFT) + trait(t, T_O) < 19)) P.mode[i] = 1;
  else P.mode[i] = W.stopNear[hc] >= 0 ? 2 : cars ? 1 : 0;
}
// fill every job at the start: firms, the city, the school district, the banks; then out-commuters
export function employAll(c) {
  const P = c.people, F = c.firms, s = c.cfg.seed;
  const seekers = new Map(); for (let o = 0; o < OCCS.length; o++) seekers.set(o, []);
  for (const i of P.each()) if (P.status[i] === 3) seekers.get(P.occ[i]).push(i);
  for (const [o, list] of seekers) list.sort((a, b) => (census(c, 0x50e, a, o) % 1000) - (census(c, 0x50e, b, o) % 1000) || a - b);
  const SUB = { [O.service]: [O.food, O.admin, O.care], [O.food]: [O.service], [O.admin]: [O.service, O.professional], [O.trades]: [O.production, O.driver], [O.production]: [O.trades, O.driver, O.service],
    [O.driver]: [O.production, O.service], [O.care]: [O.service, O.clinician], [O.clinician]: [O.care], [O.teacher]: [O.professional, O.admin], [O.professional]: [O.admin, O.manager, O.teacher],
    [O.manager]: [O.professional, O.admin], [O.engineer]: [O.professional], [O.safety]: [O.trades, O.driver] };
  const take = (occ) => { let l = seekers.get(occ); if (l.length) return l.pop(); for (const o of SUB[occ] || []) { l = seekers.get(o); if (l.length) return l.pop(); } return -1; };
  const fill = (emp, occMix, n, sector) => {
    for (let k = 0; k < n; k++) {
      let r = census(c, 0xf111, emp % 524288, k % 4096) % 1000000, occ = occMix[0][0];
      for (const [o, w] of occMix) { if (r < w) { occ = o; break; } r -= w; }
      const i = take(occ); if (i < 0) continue;
      hire(c, i, emp, occ, emp >= E_F0 && emp < E_B0 ? F.offer[emp - E_F0] : 1000);
      P.hired[i] = 1 - (census(c, 0x7e4, i) % 3650);
    }
  };
  for (const f of F.each()) {
    const o = c.slotOf(F.owner[f]);
    if (o >= 0 && P.status[o] === 3) { const l = seekers.get(P.occ[o]); const ix = l.indexOf(o); if (ix >= 0) l.splice(ix, 1); hire(c, o, E_F0 + f, O.manager, 1080); }
    fill(E_F0 + f, SECTORS[F.sector[f]].occ, Math.max(0, F.want[f] - F.staff[f]), F.sector[f]);
  }
  const pop = P.count, pupils = [...P.each()].filter((i) => P.status[i] === 1 && ageYears(c, i, 1) < 18).length;
  fill(E_CITY, PUBLIC_JOBS.city, Math.round(pop * 0.017), -1);
  fill(E_SCHOOL, PUBLIC_JOBS.school, Math.round(pupils / 14), -1);
  for (let k = 0; k < c.banks.length; k++) fill(E_B0 + k, PUBLIC_JOBS.bank, c.banks[k].staff, -1);
  // assign schools to pupils and teachers by distance
  const schools = c.world.sites.filter((b) => c.world.buildings.civic[b] >= 6 && c.world.buildings.civic[b] <= 8);
  for (const i of P.each()) {
    const h = P.hh[i]; if (h < 0) continue; const y = ageYears(c, i, 1), hc = homeCell(c, h);
    const want = P.emp[i] === E_SCHOOL ? 0 : y >= 5 && y <= 10 ? 6 : y >= 11 && y <= 13 ? 7 : y >= 14 && y <= 17 ? 8 : -1; if (want < 0) continue;
    let best = -1, bd = 1e9; for (const b of schools) { if (want && c.world.buildings.civic[b] !== want) continue; const dd = dist(c.world.frontCell(b), hc); if (dd < bd) { bd = dd; best = b; } }
    P.school[i] = best;
  }
  // the rest: most commute to jobs outside the city; about cfg.unemployment per mille of the labour force keep looking
  let lf = 0; for (const i of P.each()) if (P.status[i] === 2 || P.status[i] === 3) lf++;
  let jobless = Math.round((lf * c.cfg.unemployment) / 1000);
  const left = []; for (const [, list] of seekers) for (const i of list) left.push(i);
  left.sort((a, b) => (census(c, 0x0c07, a) % 100000) - (census(c, 0x0c07, b) % 100000) || a - b);
  for (const i of left) {
    if (jobless > 0) { jobless--; continue; }
    hire(c, i, E_ROW, P.occ[i] || O.service, 1080); P.hired[i] = 1 - (census(c, 0x7e5, i) % 2000);
  }
  for (const f of F.each()) F.want[f] = Math.max(F.want[f], F.staff[f]);
  // a year of wage history for unemployment insurance; those out of work at the start lost a job in the last few months
  for (const i of P.each()) {
    const st = P.status[i]; if (st !== 2 && st !== 3) continue;
    const occ = P.occ[i] || O.service, w = st === 2 ? P.wage[i] : wageFor(c, occ, P.skill[i], -1, 1000), hrs = st === 2 ? P.hours[i] : 8;
    for (let k = 0; k < 5; k++) P.qw[i * 5 + k] = st === 3 && k === 4 ? 0 : Math.round(w * hrs * 64);
    if (st === 3) { P.laidAt[i] = -(census(c, 0x1a1d, i) % 120); c.claimUI(i, -1); P.uiLeft[i] = 1 + (census(c, 0x1a1e, i) % 26); P.uiWait[i] = 0; }
  }
}

/* ------------------------------------------------------------------ the weekly labour market (E1 admission) */
export function laborMarket(c, d, g) {
  const P = c.people, F = c.firms, s = c.cfg.seed, e = c.epoch, R = c.R;
  let openings = 0, hired = 0, applied = 0;
  for (const f of F.each()) { if (F.status[f] !== 0) { F.open[f] = 0; continue; } F.open[f] = Math.max(0, F.want[f] - F.staff[f]); openings += F.open[f]; }
  // public employers keep their staffing levels
  const pub = [[E_CITY, PUBLIC_JOBS.city, c.gov.cityStaff || 0], [E_SCHOOL, PUBLIC_JOBS.school, c.gov.schoolStaff || 0]];
  const pubCount = new Map(); for (const i of P.each()) if (P.emp[i] === E_CITY || P.emp[i] === E_SCHOOL) pubCount.set(P.emp[i], (pubCount.get(P.emp[i]) || 0) + 1);
  if (!c.gov.cityStaff) { c.gov.cityStaff = pubCount.get(E_CITY) || 0; c.gov.schoolStaff = pubCount.get(E_SCHOOL) || 0; }
  const apps = new Map();
  for (const i of P.each()) {
    const st = P.status[i];
    const looking = st === 3 || (st === 2 && P.teLv[i] <= 1 && P.emp[i] !== E_ROW);
    if (!looking) continue;
    applied++;
    // up to three openings matching the occupation, best wage first, nearest next, never where laid off within a year
    const occ = P.occ[i] || O.service, hc = homeCell(c, P.hh[i]);
    const cands = [];
    for (const f of F.each()) {
      if (!F.open[f] || E_F0 + f === P.emp[i]) continue;
      const mix = SECTORS[F.sector[f]].occ; if (!mix.some(([o]) => o === occ) && !(occ === O.service && mix.some(([o]) => o === O.food))) continue;
      if (remembers(c, i, M.was_laid_off, E_F0 + f)) continue;
      cands.push([F.offer[f] * 4 - dist(hc, c.firmCell(f)), f]);
    }
    // a lead through an acquaintance who works there: weak ties carry news of openings the seeker's own circle does not (law 74.6)
    for (let k = 0; k < 4; k++) { const j = c.slotOf(P.acq[i * 4 + k]); if (j < 0) continue; const em = P.emp[j]; if (em < E_F0 || em >= E_B0 || !F.open[em - E_F0]) continue; const ff = em - E_F0, shared = [0, 1, 2, 3].filter((x) => P.friend[i * 4 + x] >= 0 && [0, 1, 2, 3].some((y) => P.friend[j * 4 + y] === P.friend[i * 4 + x])).length / 4; const at = cands.find((x) => x[1] === ff); if (at) at[0] += Math.round(400 * weakTie(shared)); else cands.push([F.offer[ff] * 4 - 30 + Math.round(400 * weakTie(shared)), ff]); }
    cands.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (const [, f] of cands.slice(0, 3)) { if (!apps.has(f)) apps.set(f, []); apps.get(f).push(i); }
    for (const [emp, mix, target] of pub) if ((pubCount.get(emp) || 0) < target && mix.some(([o]) => o === occ)) { if (!apps.has(emp)) apps.set(emp, []); apps.get(emp).push(i); }
  }
  const taken = new Set();
  const keys = [...apps.keys()].sort((a, b) => a - b);
  for (const key of keys) {
    const isPub = key >= E_CITY, f = key, list = apps.get(key).filter((i) => !taken.has(i));
    const slots = isPub ? Math.max(0, (key === E_CITY ? c.gov.cityStaff : c.gov.schoolStaff) - (pubCount.get(key) || 0)) : F.open[f];
    if (!slots || !list.length) continue;
    const ranked = list.map((i) => [P.skill[i] + (P.status[i] === 2 ? 60 : 0), trustScore(c.P, c.hh, "kb", Math.max(0, P.hh[i])) >> 4, 1023 - Math.min(1023, Math.max(0, e - P.laidAt[i])), i]);
    const { admitted, refused } = admitE1(ranked, slots);
    for (const i of admitted) {
      taken.add(i);
      const occ = P.occ[i] || O.service;
      if (isPub) { hire(c, i, key, occ, 1040); pubCount.set(key, (pubCount.get(key) || 0) + 1); }
      else { hire(c, i, E_F0 + f, occ, F.offer[f]); F.open[f]--; }
      addMemory(c, i, M.was_hired, isPub ? key : E_F0 + f); hired++;
    }
    for (const i of refused) if (!taken.has(i) && P.status[i] === 3) addMemory(c, i, M.was_refused_a_job, isPub ? key : E_F0 + f);
  }
  // openings that stay unfilled push offers up; the city recruits from outside when the gate is open
  for (const f of F.each()) {
    if (F.open[f] > 0) { F.unfilled[f]++; if (F.unfilled[f] >= 3) F.offer[f] = Math.min(1500, F.offer[f] + 15 + (trait(c.ownerTraits(f), T_A) >> 2)); }
    else F.unfilled[f] = 0;
  }
  R.labor = { openings, applied, hired };
}

/* ------------------------------------------------------------------ shopping */
const LUNCH = new Set([1, 2]);
export function shopping(c, d, g) {
  const P = c.people, H = c.hh, F = c.firms, s = c.cfg.seed, e = c.epoch, B = c.books;
  // staff hours present give each firm its capacity today
  F.qh.fill(0); F.sold.fill(0); F.lost.fill(0); F.taxDay.fill(0); F.crCo.fill(0); F.crDe.fill(0);
  c.shift = new Map();
  for (const i of P.each()) if (P.today[i] & 1) { const em = P.emp[i]; if (em >= E_F0 && em < E_B0) { F.qh[em - E_F0] += P.hours[i] * 4; const l = c.shift.get(em - E_F0); if (l) l.push(i); else c.shift.set(em - E_F0, [i]); } }
  for (const f of F.each()) {
    const S = SECTORS[F.sector[f]], openToday = F.status[f] !== 1 && (S.days & (1 << d.wd)) && !(d.holiday && (S.space === "office" || S.space === "industrial"));
    F.capa[f] = openToday ? Math.floor((F.qh[f] * S.rate) / 400) : 0;
  }
  const byCat = []; for (let k = 0; k < NCAT; k++) byCat.push(c.firmsOf(k));
  const cell = new Int32Array(F.top); for (const f of F.each()) cell[f] = c.firmCell(f);
  const style = new Int32Array(F.top); for (const f of F.each()) { const ot = c.ownerTraits(f); style[f] = trait(ot, T_O) | (trait(ot, T_E) << 4) | (trait(ot, T_A) << 8) | (trait(ot, T_C) << 12); }
  const lsl = (cc) => c.vital[cc * 8 + 1] + c.vital[cc * 8 + 2];
  // the household's two best choices in a category: distance, street life, reputation, quality, price, exploration
  const choose2 = (cat, from, t, salt) => {
    const list = byCat[cat]; let best = -1, bs = -1e18, second = -1, ss = -1e18;
    if (!list.length) return [best, second];
    const explore = trait(t, T_O) >= 11, thrift = trait(t, T_THRIFT);   // the open try the places with room
    for (const f of list) {
      if (!F.capa[f]) continue;
      const pr = (F.price[f] * 100) / SECTORS[F.sector[f]].price, st = style[f];
      // taste: people favour places whose owners are like them (homophily on openness, extraversion, agreeableness and
      // conscientiousness), so a city's custom spreads over its businesses instead of piling onto the most known
      const like = Math.abs(trait(t, T_O) - (st & 15)) + Math.abs(trait(t, T_E) - ((st >> 4) & 15)) + Math.abs(trait(t, T_A) - ((st >> 8) & 15)) + Math.abs(trait(t, T_C) - ((st >> 12) & 15));
      let sc = -dist(cell[f], from) * 12 + lsl(cell[f]) * 6 + Math.min(300, trustScore(c.P, F, "cr", f) >> 7) + (F.quality[f] >> 3) - pr * (4 + thrift) - like * 14 - (F.sold[f] >= F.capa[f] ? 400 : 0);
      if (explore) sc += Math.min(400, Math.max(0, F.capa[f] - F.sold[f]) * 3);
      if (sc > bs) { second = best; ss = bs; bs = sc; best = f; } else if (sc > ss) { ss = sc; second = f; }
    }
    return [best, second];
  };
  const choose = (cat, from, t, salt) => choose2(cat, from, t, salt)[0];
  // try the first choice, then the second when the first cannot serve
  const shop = (cat, from, t, salt, h, i, units, key = null) => {
    const [a, b] = choose2(cat, from, t, salt);
    for (const f of [a, b]) { if (f < 0 || (key && SECTORS[F.sector[f]].key !== key)) continue; const got = buy(c, h, i, f, units, cat); if (got) return [f, got]; }
    return [-1, 0];
  };
  let txns = 0, served = 0, lost = 0;
  for (const h of H.each()) {
    const he = E_H0 + h, mem = members(c, h); if (!mem.length || H.home[h] < 0) continue;
    const hc = homeCell(c, h), head = H.head[h] >= 0 ? H.head[h] : mem[0], t = c.people.traits[head];
    // necessities first (Engel's law): what is left after the home and the food is what the household spends on choice
    const monthly = Math.max(60000, H.inc[h]), housing = H.tenure[h] === 0 ? H.rent[h] - (H.voucher[h] ? H.hap[h] : 0) : H.mort[h] >= 0 ? c.loans.pay[H.mort[h]] : 0;
    const discretionary = (Math.max(monthly * 0.08, monthly - housing - H.size[h] * 27000) * (0.58 - trait(t, T_THRIFT) * 0.016)) / 30;
    const mood = P.val[head], secure = P.jobSec[head];
    const means = sat(isqrt(Math.max(0, Math.round(H.inc[h] * 1000 / 450000))) / 31.6, 0.45, 2.4);
    const mult = (mood < -300 ? 0.7 : mood > 300 ? 1.1 : 1) * (secure < 350 ? 0.75 : 1) * means;
    // what the household can spend: its cash less what it sets aside for the property tax due, rent it owes and the
    // next mortgage payment (the conscientious set aside more)
    const liquid = B.get(he, AC.DEPOSITS) + B.get(he, AC.SAVINGS) - Math.round(Math.max(0, -B.get(he, AC.PROP_TAX_PAY)) * (0.4 + trait(t, T_C) / 25)) - H.rArr[h] - (H.mort[h] >= 0 ? Math.round(c.loans.pay[H.mort[h]] * 0.5) : 0);
    // groceries: the household eats by its members' energy needs (law 51.38), fresh food spoils (law 42.13), and when the
    // pantry falls below two and a half days of need, someone shops for the week (law 68.1)
    let eat = 0; for (const j of mem) eat += kleiber(MASS_BY_AGE(ageYears(c, j, e))); eat = Math.round((eat / kleiber(78)) * 1000);
    H.pantry[h] = Math.max(0, Math.round(balance(H.pantry[h], 0, eat) - (H.pantry[h] * 0.3 - spoil(H.pantry[h] * 0.3, 0.03, 1))));
    if (H.pantry[h] < eat * 2.5) {
      const [, got] = shop(0, hc, t, 0x6a0, h, head, H.size[h] * (liquid > monthly ? 4 : 3)); if (got) H.pantry[h] += got * 1000;
    }
    const discBudget = discretionary * mult * (liquid < monthly * 0.25 ? 0.3 : 1) * 1.6;
    // the day's discretionary budget split by the household's Cobb-Douglas shares (laws 69.11 and 17.15)
    const [bDine, bGoods] = budgetShares([30 + trait(t, T_E), 40 - trait(t, T_THRIFT), 10, 20], discBudget);
    let spentToday = 0;
    for (const i of mem) {
      const st = P.status[i], y = ageYears(c, i, e), ti = P.traits[i], o = i * 8; if (y < 14) continue;
      const atWork = P.today[i] & 1, wc = atWork ? c.workCell(i) : -1;
      // a meal out
      const dineOdds = 160 + trait(ti, T_E) * 14 + (d.weekend ? 90 : 0) + (atWork ? 120 : 0) + (P.need[o + 4] < 400 ? 40 : 0);
      if (urge(P.urge, i * URGE_N + URGE.dine, (dineOdds * mult) / 1000) && spentToday < bDine * 2) {
        const [f, got] = shop(1, atWork && wc >= 0 ? wc : hc, ti, 0x6a1, h, i, 1);
        if (f >= 0) { if (got) { spentToday += F.price[f]; P.need[o] = Math.min(1000, P.need[o] + 120); P.need[o + 4] = Math.min(1000, P.need[o + 4] + 40); if (F.quality[f] > 800 && P.need[o + 6] < 600) c.remember(i, 15, E_F0 + f); } }
      }
      // goods
      if (urge(P.urge, i * URGE_N + URGE.goods, (220 * mult + (P.expInf[i] > 500 ? 20 : 0)) / 1000) && spentToday < discBudget) {
        const want = Math.max(1, Math.round(elastic(1 + (H.size[h] > 2 ? 1 : 0), 1000, 1000, 0.8))), [f] = spentToday < bDine + bGoods * 2 ? shop(2, hc, ti, 0x6a2, h, i, want) : [-1]; if (f >= 0) spentToday += F.price[f];   // quantity by price (law 69.7)
      }
      // services: the salon every few weeks; childcare on working days for small children
      if (y >= 16 && urge(P.urge, i * URGE_N + URGE.salon, (55 * mult) / 1000)) shop(3, hc, ti, 0x6a3, h, i, 1, "salon");
      // health: a visit when ill; a prescription now and then
      if (P.today[i] & 2 && P.sick[i] >= 2 && c.seeksCare(i, URGE.sickVisit, 0.34)) { const f = choose(4, hc, ti, 0x6a4); if (f >= 0) buy(c, h, i, f, 1, 4); }
      else if (c.seeksCare(i, URGE.checkup, (y > 45 ? 45 : 20) / 1000)) { const f = choose(4, hc, ti, 0x6a5); if (f >= 0 && SECTORS[F.sector[f]].key !== "hospital") buy(c, h, i, f, 1, 4); }
      if (P.health[i] < 320 && c.seeksCare(i, URGE.hospital, 0.06)) { const hf = byCat[4].find((ff) => SECTORS[F.sector[ff]].key === "hospital"); if (hf !== undefined) buy(c, h, i, hf, 1, 4); }
      // recreation: the gym, a night out
      if (y >= 16 && urge(P.urge, i * URGE_N + URGE.gym, ((trait(ti, T_C) * 8 + 20) * mult) / 1000)) { const f = choose(6, hc, ti, 0x6a6); if (f >= 0 && SECTORS[F.sector[f]].key === "gym") buy(c, h, i, f, 1, 6); }
      if (y >= 21 && urge(P.urge, i * URGE_N + URGE.bar, ((trait(ti, T_E) * 9 + (d.wd >= 5 ? 90 : 15)) * mult) / 1000) && spentToday < discBudget * 1.4) { const f = choose(6, hc, ti, 0x6a7); if (f >= 0 && SECTORS[F.sector[f]].key === "bar" && buy(c, h, i, f, 1 + (trait(ti, T_E) >= 10 ? 1 : 0), 6)) spentToday += F.price[f]; }
    }
    // professional services: tax preparation in season, otherwise now and then
    if (urge(H.hurge, h * 6, (d.m >= 2 && d.m <= 4 ? 9 : 1) / 1000)) { const f = choose(3, hc, t, 0x6ab); if (f >= 0 && SECTORS[F.sector[f]].key === "professional") buy(c, h, head, f, 1, 3); }
    // childcare for under-fives when every adult is at work
    if (d.workday && H.kids[h] && mem.some((i) => ageYears(c, i, e) < 5) && mem.filter((i) => ageYears(c, i, e) >= 18).every((i) => P.today[i] & 1)) {
      const f = choose(3, hc, t, 0x6a8); if (f >= 0 && SECTORS[F.sector[f]].key === "childcare") buy(c, h, head, f, mem.filter((i) => ageYears(c, i, e) < 5).length, 3);
    }
    // fuel once a week per car, and the occasional repair
    // fuel: the tank empties by the miles driven and is filled when low (law 68.1); a car wears out by its miles and
    // years (law 65.18) and is replaced when it is spent and the household feels secure; repairs as the urge builds
    if (H.cars[h]) { let km = 12 * H.cars[h]; for (const j of mem) if (P.mode[j] === 1 && (P.today[j] & 1)) { const wc = c.workCell(j); km += wc >= 0 ? (dist(hc, wc) * 2 * 20) / 1000 : 30; } H.fuel[h] = Math.max(0, H.fuel[h] - km * 0.08); H.carD[h] = miner(miner(H.carD[h], km, 400000), 1, 20 * 365); }
    if (H.cars[h] && H.fuel[h] < 12 * H.cars[h]) { H.fuel[h] += 45 * H.cars[h]; const f = choose(5, hc, t, 0x6a9); if (f >= 0 && SECTORS[F.sector[f]].key === "fuel") buy(c, h, head, f, H.cars[h], 5); }
    if (H.cars[h] && H.carD[h] >= 1 && P.jobSec[head] > 400) buyCar(c, h, head, byCat[5].filter((ff) => SECTORS[F.sector[ff]].key === "auto"));
    if (H.cars[h] && urge(H.hurge, h * 6 + 1, (12 + Math.max(0, e - H.carBought[h]) / 200) / 1000)) { const f = choose(5, hc, t, 0x6aa); if (f >= 0 && SECTORS[F.sector[f]].key === "auto") buy(c, h, head, f, 1, 5); }
  }
  // post each firm's day: cost of goods sold, the sales tax accrued to the State (and the city's share)
  const local = c.gov.localSales ?? LOCAL_SALES, total = STATE_SALES + local;
  for (const f of F.each()) {
    const fe = E_F0 + f, tax = F.taxDay[f];
    if (tax) {
      B.post(fe, AC.R_SALES, AC.SALES_TAX_PAY, tax, K.tax_accrual, E_STATE);
      const localPart = mulDiv(tax, local, total), statePart = tax - localPart;
      B.post(E_STATE, AC.TAXR_SALES, AC.R_SALES_TAX, statePart, K.tax_accrual, fe); B.post(E_STATE, AC.TAXR_SALES, AC.DIST_PAY, localPart, K.tax_accrual, fe);
      B.post(E_CITY, AC.DIST_RECV, AC.R_SALES_TAX, localPart, K.tax_accrual, E_STATE);
      c.gov.monthSalesTax = (c.gov.monthSalesTax || 0) + tax;
    }
    served += F.sold[f]; lost += F.lost[f];
    tickTrust(c.P, F, "cr", f, F.crCo[f] + F.crDe[f], Math.min(255, F.crCo[f] >> 3), Math.min(255, F.crDe[f]), F_RUNNING, c.C);
  }
  c.R.shopping = { served, lost };
}
// one purchase: price, sales tax, tip; paid from checking, then savings, then the card
export function buy(c, h, i, f, units, cat) {
  const F = c.firms, B = c.books, P = c.people, S = SECTORS[F.sector[f]], he = E_H0 + h, fe = E_F0 + f;
  if (F.sold[f] + units > F.capa[f]) { F.lost[f] += units; F.crDe[f]++; return 0; }
  if (S.cost > 300000 && S.cat >= 0 && S.cat !== 3 && S.cat !== 4) { if (F.inv[f] < units) { const have = F.inv[f]; F.lost[f] += units - have; F.crDe[f]++; if (have <= 0) { c.remember(i, 14, fe); return 0; } units = have; } }
  const net = F.price[f] * units, share = S.taxShare ?? CATS[cat].tax;
  const local = c.gov.localSales ?? LOCAL_SALES, tax = share ? ppm(ppm(net, share), STATE_SALES + local) : 0;
  let total = net + tax;
  // health visits: cover pays 80% for insured households, Medicare 80% for retirees
  let payer2 = -1, part2 = 0;
  // Working Connections Child Care: the state pays the provider for an enrolled family's care; the family pays its
  // monthly copayment instead (welfare.js)
  if (cat === 3 && F.sector[f] === SK.childcare && (c.hh.progs[h] & 16)) { payer2 = E_STATE; part2 = total; total = 0; if (c.gov.wel) c.gov.wel.wcccPaid += part2; }
  if (cat === 4) {
    if (P.ah[i]) { payer2 = E_STATE; part2 = total; total = 0; if (c.gov.wel) { if (P.ah[i] === 1) c.gov.wel.ahSpendAdult += part2; else c.gov.wel.ahSpendOther += part2; } }
    else if (F.sector[f] !== SK.pharmacy) { if (c.hh.cover[h]) { payer2 = E_ROW; if (c.care) c.care.claims += ppm(total, 800000); } else if (P.status[i] === 5 || ageYears(c, i) >= 65) payer2 = E_FEDGOV; if (payer2 >= 0) { part2 = ppm(total, 800000); total -= part2; } }
  }
  if (total > 0 && !c.fund(he, total)) { F.lost[f] += units; return 0; }
  if (total > 0) B.pay(he, fe, total, CONS_ACC[cat], AC.R_SALES, K.sale);
  if (part2) B.pay(payer2, fe, part2, AC.X_PURCHASES, AC.R_SALES, K.sale);
  if (tax) { B.post(he, AC.X_TAX_SALES, CONS_ACC[cat], Math.min(tax, total), K.tax_accrual); F.taxDay[f] += tax; }
  // tips go straight to a worker on shift (cash tips); they are wages for payroll taxes
  if (S.tips) { const w = c.onShift(f, i); if (w >= 0) { const tip = ppm(net, S.tips - (trait(P.traits[i], T_THRIFT) * 4000)); if (tip > 0 && c.fund(he, tip)) { B.pay(he, E_H0 + P.hh[w], tip, CONS_ACC[cat], AC.R_TIPS, K.tip); P.ptips[w] += tip; } } }
  if (S.cost > 300000 && S.cat >= 0 && S.cat !== 3 && S.cat !== 4) F.inv[f] -= units;
  F.sold[f] += units; F.mRev[f] += net; F.ytdGross[f] += net; F.crCo[f]++;
  c.hh.spend[h * 8 + cat] += total;
  // the reference price: a rise above it is felt more than an equal fall (loss aversion)
  const o = i * 8 + cat, ref = P.ref[o], unit = Math.round((net + tax) / units), felt = fechner(unit, ref);   // a price rise is felt on a log scale (law 73.2)
  if (felt > 0.077) { F.crDe[f]++; if (felt > 0.14) c.remember(i, 23, fe); }
  P.ref[o] = ref + Math.round((unit - ref) / 4);
  for (let k = 0; k < 3; k++) if (P.visit[i * 3 + k] < 0) { P.visit[i * 3 + k] = fe; P.vtime[i * 3 + k] = c.visitMinute(i, f, k); break; }
  return units;
}

// a car from a dealer: Washington sales tax (and the 0.3% motor vehicle sales tax), the old car traded in, a loan for the rest
export function buyCar(c, h, i, dealers) {
  if (!dealers.length) return false;
  const F = c.firms, B = c.books, H = c.hh, s = c.cfg.seed, e = c.epoch, he = E_H0 + h;
  let f = dealers[0]; for (const x of dealers) if (trustScore(c.P, F, "cr", x) > trustScore(c.P, F, "cr", f)) f = x; const fe = E_F0 + f;   // the dealer with the best name
  const price = sat(Math.round((H.inc[h] * 12 * 0.32 * (1 - (trait(c.people.traits[i], T_THRIFT) - 8) / 20)) / 10000) * 10000, 2600000, 4800000), trade = Math.min(Math.floor(B.get(he, AC.VEHICLE) / Math.max(1, H.cars[h])), Math.round(price * 0.25));
  const tax = ppm(price - trade, 68000 + (c.gov.localSales ?? LOCAL_SALES)), due = price - trade + tax;
  const cash = B.get(he, AC.DEPOSITS) + B.get(he, AC.SAVINGS), loanAmt = Math.max(0, due - Math.max(0, cash - Math.max(200000, H.exp[h])));
  if (loanAmt > 0) { if (!creditOk(c, h, Math.round(loanAmt / 60))) return false; const k = B.bankOf[he]; const l = c.originate(2, k, he, loanAmt, c.banks[k].rates.auto, 60, -1); if (l < 0) return false; if (H.auto[h] < 0 || c.loans.status[H.auto[h]] !== 1) H.auto[h] = l; }
  if (!c.fund(he, due)) return false;
  // the trade-in leaves the household's books at its book value; the dealer resells it outside the city
  const book = Math.floor(B.get(he, AC.VEHICLE) / Math.max(1, H.cars[h]));
  if (book > 0) B.post(he, AC.X_OTHER, AC.VEHICLE, book, K.purchase);
  B.pay(he, fe, due, AC.VEHICLE, AC.R_SALES, K.sale);
  B.post(he, AC.VEHICLE, AC.VEHICLE, 0); B.post(he, AC.X_TAX_SALES, AC.VEHICLE, tax, K.tax_accrual);
  B.post(fe, AC.R_SALES, AC.SALES_TAX_PAY, tax, K.tax_accrual, E_STATE); c.accrueSalesTax(fe, tax);
  B.post(he, AC.VEHICLE, AC.R_OTHER, trade, K.purchase);                     // the trade-in credit was part of the price
  const wholesale = Math.round((price - trade) * 0.86); if (c.fund(fe, wholesale, true)) B.pay(fe, E_ROW, wholesale, AC.X_COGS, AC.R_SALES, K.import);
  F.mRev[fe - E_F0] += price - trade; F.ytdGross[fe - E_F0] += price - trade; H.carBought[h] = e; H.carD[h] = 0;
  c.event("car", `The ${c.names.person(i).split(" ")[1]} household buys a car from ${c.names.firm(f)}`, [fe]);
  return true;
}

/* ------------------------------------------------------------------ the firm's day */
export function firmDay(c, d, g) {
  const F = c.firms, B = c.books, s = c.cfg.seed, e = c.epoch, nat = c.nation;
  const demand = nat.exportDemand(e, 1), visitors = Math.round(nat.exportDemand(e, 0) * (100 + (c.gov.tourism || 0)) / 100);
  // the hospital serves the county: its patients beyond the city come in proportion to the county's people
  const avgP = new Float64Array(SECTORS.length), nP = new Float64Array(SECTORS.length); for (const f of F.each()) if (F.status[f] !== 1) { avgP[F.sector[f]] += F.price[f]; nP[F.sector[f]]++; } for (let k = 0; k < avgP.length; k++) avgP[k] = nP[k] ? avgP[k] / nP[k] : 0;
  const cp = c.outer?.kpi?.county?.pop || 0; if (cp && !c.gov.countyPop0) c.gov.countyPop0 = Math.round(cp); const region = cp ? Math.round((65536 * cp) / c.gov.countyPop0) : 65536;
  for (const f of F.each()) {
    if (F.status[f] === 1) continue;
    const fe = E_F0 + f, S = SECTORS[F.sector[f]];
    // cost of goods sold at average cost
    if (S.cost > 300000 && S.cat >= 0 && F.sold[f]) {
      const units = F.inv[f] + F.transit[f] + F.sold[f], val = B.get(fe, AC.INVENTORY);
      const cogs = units > 0 ? Math.min(val, Math.floor((val * F.sold[f]) / units)) : 0;
      B.post(fe, AC.X_COGS, AC.INVENTORY, cogs, K.sale);
    }
    // stock in transit arrives
    if (F.transit[f] && F.arrive[f] <= e) { F.inv[f] += F.transit[f]; F.transit[f] = 0; }
    // exports and visitors: software, manufacturing, logistics, professional services, hotels
    let ex = 0;
    // exports: each exporter has its own customers beyond the city, as many as it could serve at the founding (the census
    // reads the firms as sized to their markets); they buy at the nation's demand (the county's, for the hospital) and
    // turn away from a firm dearer than its rivals by a constant elasticity (law 69.7)
    if (F.capa[f] && (S.cat === -1 || S.export)) {
      if (!F.mkt[f]) F.mkt[f] = Math.round(F.staff[f] * perStaffOpen(S) * 0.92 * (S.export && S.cat >= 0 ? S.export / 1e6 : 1));
      const want = elastic((F.mkt[f] * (S.key === "hospital" ? region : demand)) / 65536, F.price[f], Math.max(1, avgP[F.sector[f]]), 1.5), units = Math.min(F.capa[f], Math.floor(want));
      if (want > units) F.short[f] += want - units;
      ex = units * F.price[f];
    }
    if (S.cat === -3 && F.capa[f]) {                               // hotel rooms: visitors pay the room and its sales tax
      const rooms = Math.floor((F.want[f] * 3 * visitors) / 65536), net = rooms * F.price[f], tax = ppm(net, STATE_SALES + (c.gov.localSales ?? LOCAL_SALES));
      if (net) { B.pay(E_ROW, fe, net + tax, AC.X_PURCHASES, AC.R_EXPORT, K.export); B.post(fe, AC.R_EXPORT, AC.SALES_TAX_PAY, tax, K.tax_accrual, E_STATE); F.taxDay[f] += tax; F.mRev[f] += net; F.ytdGross[f] += net; F.sold[f] += rooms; }
      const local = c.gov.localSales ?? LOCAL_SALES, total = STATE_SALES + local, localPart = mulDiv(tax, local, total);
      if (tax) { B.post(E_STATE, AC.TAXR_SALES, AC.R_SALES_TAX, tax - localPart, K.tax_accrual, fe); B.post(E_STATE, AC.TAXR_SALES, AC.DIST_PAY, localPart, K.tax_accrual, fe); B.post(E_CITY, AC.DIST_RECV, AC.R_SALES_TAX, localPart, K.tax_accrual, E_STATE); }
    }
    if (ex > 0) {
      B.pay(E_ROW, fe, ex, AC.X_PURCHASES, AC.R_EXPORT, K.export); F.mRev[f] += ex; F.ytdGross[f] += ex; F.sold[f] += Math.floor(ex / Math.max(1, F.price[f]));
      if (S.cost > 300000 || S.cat < 0) { const mat = ppm(ex, S.cost); if (mat > 0 && c.fund(fe, mat)) B.pay(fe, E_ROW, mat, AC.X_COGS, AC.R_SALES, K.import); }   // service firms buy their supplies weekly, below
    }
    // visitors also eat out and shop
    if ((S.cat === 1 || S.cat === 2 || S.cat === 6) && F.capa[f] > F.sold[f]) {
      const cc = c.firmCell(f), draw = c.vital[cc * 8 + 1] + c.vital[cc * 8 + 2] + (c.world.hood[cc] <= 1 ? 8 : 0);
      const units = Math.min(F.capa[f] - F.sold[f], Math.floor((draw * visitors) / 65536 / 3));
      if (units > 0 && (S.cost <= 300000 || F.inv[f] >= units)) {
        const net = units * F.price[f], tax = ppm(net, STATE_SALES + (c.gov.localSales ?? LOCAL_SALES));
        B.pay(E_ROW, fe, net + tax, AC.X_PURCHASES, AC.R_SALES, K.sale); B.post(fe, AC.R_SALES, AC.SALES_TAX_PAY, tax, K.tax_accrual, E_STATE);
        const local = c.gov.localSales ?? LOCAL_SALES, localPart = mulDiv(tax, local, STATE_SALES + local);
        B.post(E_STATE, AC.TAXR_SALES, AC.R_SALES_TAX, tax - localPart, K.tax_accrual, fe); B.post(E_STATE, AC.TAXR_SALES, AC.DIST_PAY, localPart, K.tax_accrual, fe); B.post(E_CITY, AC.DIST_RECV, AC.R_SALES_TAX, localPart, K.tax_accrual, E_STATE);
        if (S.cost > 300000) { const val = B.get(fe, AC.INVENTORY), all = F.inv[f] + F.transit[f]; const cogs = all > 0 ? Math.min(val, Math.floor((val * units) / all)) : 0; B.post(fe, AC.X_COGS, AC.INVENTORY, cogs, K.sale); F.inv[f] -= units; }
        F.sold[f] += units; F.mRev[f] += net; F.ytdGross[f] += net;
      }
    }
    // restock: below five days of expected sales, order ten days' worth (no more than the shelves hold or the firm can pay for)
    if (S.cost > 300000 && S.cat >= 0 && S.cat <= 7 && !F.transit[f]) {
      const daily = Math.max(1, Math.min(Math.round(F.expD[f] / 10), Math.max(F.capa[f], Math.round((F.want[f] * S.rate * 8) / 100))));
      if (F.inv[f] < daily * 5) {
        const unitCost = Math.max(1, Math.round((F.cost[f] * nat.importIndex(e, S.cat)) / 1000));
        const L = c.loans, ln = F.line[f], room = ln >= 0 && L.status[ln] === 1 && L.who[ln] === fe ? Math.max(0, L.lim[ln] - L.prin[ln]) : F.lineLim[f];
        const afford = Math.floor(((B.get(fe, AC.DEPOSITS) + B.get(fe, AC.SAVINGS) + room) * 0.9) / unitCost);
        const units = Math.min(daily * 10 - F.inv[f], afford), amt = units * unitCost;
        if (units > 0 && c.fund(fe, amt, true)) { B.pay(fe, E_ROW, amt, AC.INVENTORY, AC.R_SALES, K.import); F.transit[f] = units; F.arrive[f] = e + 2 + (SECTORS[F.sector[f]].cost > 600000 ? 2 : 1); }
      }
    }
    // service firms buy their supplies weekly
    if (S.cost > 0 && S.cost <= 300000 && S.cat >= 0) F.supplies[f] += ppm(F.price[f] * F.sold[f], S.cost);
    if (d.wd === 0 && F.supplies[f] >= 1) { const amt = Math.floor(F.supplies[f]); if (c.fund(fe, amt, true)) { B.pay(fe, E_ROW, amt, AC.X_PURCHASES, AC.R_SALES, K.purchase); F.supplies[f] -= amt; } }
    // expectations and confidence: what the owner expected against what came
    const t = c.ownerTraits(f), lam = 6 + trait(t, T_O) + (trait(t, T_N) >> 1), seen = (F.sold[f] + Math.floor(F.lost[f] / 3)) * 10;
    if (F.capa[f]) { F.expD[f] = Math.max(10, F.expD[f] + Math.round(((seen - F.expD[f]) * lam) / 128)); F.conf[f] = sat(F.conf[f] + Math.round((seen - F.expD[f]) / Math.max(1, F.expD[f] / 40)) - (F.distress[f] > 10 ? 6 : 0), -1000, 1000); }
    F.wk[f] += F.sold[f];
    // distress: cash below a week of costs
    const cash = B.get(fe, AC.DEPOSITS) + B.get(fe, AC.SAVINGS), weekly = Math.max(10000, (F.staff[f] * 2600 * 40) + F.rentDue[f] / 4);
    F.distress[f] = cash < weekly ? Math.min(999, F.distress[f] + 1) : Math.max(0, F.distress[f] - 1);
  }
  if (d.wd === 0) weekly(c, d);
}
// the weekly price review: inventory and demand against expectation; agreeable owners move gently
function weekly(c, d) {
  const F = c.firms, P = c.people;
  const rivals = new Uint16Array(SECTORS.length); for (const f of F.each()) if (F.status[f] === 0) rivals[F.sector[f]]++;
  for (const f of F.each()) {
    if (F.status[f] === 1) continue;
    for (let k = 7; k > 0; k--) F.mem[f * 8 + k] = F.mem[f * 8 + k - 1]; F.mem[f * 8] = F.wk[f]; F.wk[f] = 0;
    const S = SECTORS[F.sector[f]], t = c.ownerTraits(f), A = trait(t, T_A);
    const lostShare = F.lost[f] * 1000 / Math.max(1, F.sold[f] + F.lost[f]), util = F.capa[f] ? (F.sold[f] * 1000) / F.capa[f] : 0;
    const unitCost = S.cost > 300000 ? Math.round((F.cost[f] * c.nation.importIndex(c.epoch, Math.max(0, S.cat))) / 1000) : 0;
    let move = 0;
    // the owner's markup is the inverse of the elasticity it faces, which rivals raise (law 69.23); its sales trend by
    // least squares over eight weeks (law 70.2) tells it whether demand is slipping
    const eps = 1.6 + 0.25 * (rivals[F.sector[f]] || 0), floor = lerner(unitCost || Math.round((S.price * 550) / 1000), eps), trend = ols([7, 6, 5, 4, 3, 2, 1, 0].map((k) => F.mem[f * 8 + k])).slope;
    if (F.price[f] < floor * 0.9) move = 10;
    if (lostShare > 200 || util > 950) move = Math.max(move, 6);
    else if (trend < -0.05 * Math.max(1, F.mem[f * 8]) && lostShare < 50 && F.price[f] > floor) move = -4;
    else if (F.conf[f] < -600 && util < 350 && F.distress[f] > 20) move = -8;
    if (unitCost && F.price[f] < unitCost * 1.22) move = Math.max(move, 20);
    if (d.doy > 40 && F.ytdGross[f] > 0 && (F.mkt[f] > 0 || S.cat === 4 || lostShare > 100)) { let costs = 0; for (const a of X_ACC) costs += c.books.get(E_F0 + f, a); const margin = (F.ytdGross[f] - costs) / F.ytdGross[f]; if (margin < -0.02 && lostShare < 300) move = Math.max(move, Math.min(15, Math.round(-margin * 60))); }
    // once a quarter the owner passes on expected inflation and the wage bill
    if (c.today.d <= 7 && c.today.m % 3 === 1) { const owner = c.slotOf(F.owner[f]), expInf = owner >= 0 ? P.expInf[owner] : 300; move += Math.round(Math.max(0, expInf) / 45); }
    if (minimumWageNow(c) > (c.gov.lastMin || 0) && (S.key === "restaurant" || S.key === "cafe" || S.key === "grocery" || S.key === "retail")) move = Math.max(move, 12);
    move = move > 0 ? Math.round((move * (18 - A)) / 14) : move;
    if (move) { F.lastPrice[f] = F.price[f]; F.price[f] = Math.max(5, Math.round((F.price[f] * (1000 + move)) / 1000 / 5) * 5); }
  }
  c.gov.lastMin = minimumWageNow(c);
}

/* ------------------------------------------------------------------ the firm's month */
export function firmMonth(c, d, g) {
  const F = c.firms, B = c.books, P = c.people, s = c.cfg.seed, e = c.epoch;
  for (const f of F.each()) {
    if (F.status[f] === 1) continue;
    const fe = E_F0 + f, S = SECTORS[F.sector[f]], t = c.ownerTraits(f);
    // depreciation: equipment over ten years
    const eq = B.get(fe, AC.EQUIP); if (eq > 0) B.post(fe, AC.X_DEPR, AC.ACC_DEPR, Math.floor(eq / 120), K.depreciation);
    // staffing: expected demand sets the staff wanted; sustained distress lays people off
    const perStaff = Math.max(1, perStaffOpen(S));                         // units a member of staff serves on an open day
    F.want[f] = sat(Math.ceil((F.expD[f] / 10 / perStaff) * 1.1), S.staff[0], S.staff[1] * 2);
    if (F.staff[f] > F.want[f] * 1.3 + 1 && F.distress[f] < 5 && (trait(c.ownerTraits(f), T_A) < 9 || c.today.d <= 7)) layoff(c, f, 1);   // the owner's temperament, or the month's review
    // an owner short of cash and losing money brings the staff down to what the custom needs, before payroll fails
    { const cash0 = B.get(fe, AC.DEPOSITS), cost0 = F.staff[f] * 2600 * 173 + F.rentDue[f]; let ytdC = 0; for (const a of X_ACC) ytdC += B.get(fe, a);
      const keep = Math.max(S.staff[0], Math.ceil(F.want[f])); if (cash0 < cost0 * 1.5 && F.ytdGross[f] < ytdC && F.staff[f] > keep) layoff(c, f, F.staff[f] - keep); }
    const tolerance = 12 + trait(t, T_A) * 2 - trait(t, T_C);
    if (S.key === "realty" && F.status[f] === 2 && B.netWorth(fe) > 0) F.status[f] = 0;            // a property company with equity carries on
    if ((F.distress[f] > tolerance && F.staff[f] > S.staff[0]) || F.status[f] === 2) {
      const cut = F.status[f] === 2 ? F.staff[f] : Math.max(1, Math.round(F.staff[f] / 8));
      layoff(c, f, cut);
      if (F.status[f] === 2) { closeFirm(c, f, "closed its doors"); continue; }
    }
    // insolvency: negative equity, out of cash and refused credit
    const cash = B.get(fe, AC.DEPOSITS), worth = B.netWorth(fe);
    if (worth < 0 && cash <= 0 && F.distress[f] > 60 && F.kbLv[f] === 0) { closeFirm(c, f, "went out of business"); continue; }
    // owner's draw from a healthy business
    const monthCost = F.staff[f] * 2600 * 173 + F.rentDue[f];
    const ow = c.slotOf(F.owner[f]);
    if (cash > monthCost * 3 && worth > 0 && ow >= 0 && P.hh[ow] >= 0) {
      const draw = Math.floor((cash - monthCost * 3) / 4); if (draw > 0) B.pay(fe, E_H0 + P.hh[ow], draw, AC.EQUITY, AC.R_OTHER, K.transfer);
    }
    // investment: busy and confident owners add capacity on credit
    if (F.lost[f] > F.sold[f] / 6 && F.conf[f] > 200 && trait(t, T_RISK) > 6) {
      const amt = Math.round(F.capex[f] * 0.1) || 500000; if (c.borrow(fe, amt, 1)) { B.pay(fe, E_ROW, amt, AC.EQUIP, AC.R_SALES, K.purchase); F.want[f] = Math.min(S.staff[1] * 2, F.want[f] + 1); F.capex[f] += amt; }
    }
    // pay review each January: expected inflation, market tightness and the minimum wage
    if (d.m === 12) for (const i of P.each()) if (P.emp[i] === fe) {
      const raise = sat(P.expInf[i] + (F.unfilled[f] ? 150 : 0) + (F.conf[f] > 0 ? 100 : -100), 0, 900);
      const nw = Math.round((P.wage[i] * (10000 + raise)) / 10000 / 5) * 5; if (nw > P.wage[i] * 1.02) { addMemory(c, i, 3, fe); P.eCo[i]++; } else P.eDe[i]++;
      P.wage[i] = nw;
    }
    if (F.mkt[f]) { const t2 = c.ownerTraits(f); F.mkt[f] = Math.max(1, F.mkt[f] - F.short[f] * 0.02 + (F.short[f] === 0 ? (F.mkt[f] * (trait(t2, T_RISK) - 7)) / 800 : 0)); }
    F.short[f] = 0;
    F.mRev[f] = 0;
  }
  const pros = [...F.each()].filter((f) => F.status[f] === 0 && SECTORS[F.sector[f]].key === "professional");
  if (pros.length) for (const f of F.each()) {
    if (F.status[f] !== 0 || SECTORS[F.sector[f]].key === "professional" || F.staff[f] < 3) continue;
    const fee = 15000 + F.staff[f] * 5000; let p = pros[0]; for (const x of pros) if (trustScore(c.P, F, "cr", x) - F.price[x] / 1000 > trustScore(c.P, F, "cr", p) - F.price[p] / 1000) p = x;
    if (c.fund(E_F0 + f, fee, true)) { c.books.pay(E_F0 + f, E_F0 + p, fee, AC.X_PURCHASES, AC.R_SALES, K.purchase); F.mRev[p] += fee; F.ytdGross[p] += fee; }
  }
}
export function layoff(c, f, n) {
  const P = c.people; let done = 0;
  const staff = [], own = c.slotOf(c.firms.owner[f]); for (const i of P.each()) if (P.emp[i] === E_F0 + f && i !== own) staff.push(i);
  staff.sort((a, b) => P.hired[b] - P.hired[a] || a - b);                 // last in, first out
  for (const i of staff.slice(0, n)) { leaveJob(c, i, true); done++; }
  if (done) { c.event("layoff", `${c.names.firm(f)} lays off ${done} worker${done > 1 ? "s" : ""}`, [E_F0 + f]); for (const j of P.each()) if (P.emp[j] === E_F0 + f) { P.eDe[j] += 2; P.jobSec[j] = Math.max(0, P.jobSec[j] - 120); } }
  return done;
}
export function closeFirm(c, f, why) {
  const F = c.firms, B = c.books, P = c.people, fe = E_F0 + f, W = c.world;
  layoff(c, f, 9999);
  const o = c.slotOf(F.owner[f]); if (o >= 0) { if (P.emp[o] === fe) leaveJob(c, o, false); addMemory(c, o, 22, fe); }
  F.status[f] = 1; F.open[f] = 0; F.want[f] = 0;
  for (const p of W.spaces.each()) if (W.spaces.tenant[p] === fe) W.spaces.tenant[p] = -1;
  c.settleClosedFirm(fe);
  c.event("closure", `${c.names.firm(f)} ${why}`, [fe]);
}

/* ------------------------------------------------------------------ new firms */
export function entrepreneurs(c, d, g) {
  const F = c.firms, P = c.people, W = c.world, s = c.cfg.seed, e = c.epoch, B = c.books;
  // unmet demand by sector: customers turned away last month
  const lostBy = new Float64Array(SECTORS.length), soldBy = new Float64Array(SECTORS.length);
  const spare = new Float64Array(SECTORS.length);
  const nBy = new Float64Array(SECTORS.length), revBy = new Float64Array(SECTORS.length);
  for (const f of F.each()) if (F.status[f] === 0) { for (let k = 0; k < 4; k++) soldBy[F.sector[f]] += F.mem[f * 8 + k]; lostBy[F.sector[f]] += (F.lost[f] * 7) / 3; spare[F.sector[f]] += Math.max(0, F.capa[f] - F.sold[f]) * 7; nBy[F.sector[f]]++; revBy[F.sector[f]] += F.lyRev ? F.lyRev[f] : (F.mem[f * 8] + F.mem[f * 8 + 1] + F.mem[f * 8 + 2] + F.mem[f * 8 + 3]) * F.price[f]; }
  let opened = 0;
  for (let sec = 0; sec < SECTORS.length && opened < 3; sec++) {
    const S = SECTORS[sec]; if (S.cat < 0 && sec !== SK.software) continue;
    const gap = lostBy[sec] / Math.max(1, soldBy[sec] + lostBy[sec]), n = nBy[sec], small = S.staff[0] * 2600 * 173 + 300000;
    const thriving = n > 0 && revBy[sec] / n > small * 1.6 && (sec !== SK.hospital);   // the average business of the trade takes in well over what a small one costs
    if (!thriving && (gap < 0.06 || spare[sec] > lostBy[sec])) continue;
    // a would-be owner: open, extravert, risk-taking, with savings
    let best = -1, bs = 0;
    for (const i of P.each()) {
      if (P.status[i] !== 2 && P.status[i] !== 3) continue; const y = ageYears(c, i, e); if (y < 25 || y > 60) continue;
      const t = P.traits[i], h = P.hh[i]; if (h < 0) continue;
      const sc = trait(t, T_O) + trait(t, T_E) + trait(t, T_RISK) * 2 + (P.skill[i] >> 7);
      if (sc > bs && B.get(E_H0 + h, AC.SAVINGS) + B.get(E_H0 + h, AC.DEPOSITS) > 3000000) { bs = sc; best = i; }
    }
    if (best < 0 || bs < 38) continue;
    const kind = SPACE_FOR(sec); let sp = -1, ss = -1e9;
    for (const p of W.spaces.each()) if (W.spaces.tenant[p] === -1 && W.spaces.kind[p] === kind && !W.buildings.stage[W.spaces.bld[p]]) { const cc = W.frontCell(W.spaces.bld[p]); const sc = c.vital[cc * 8 + 1] * 10 + c.vital[cc * 8 + 2] * 6 - c.vital[cc * 8 + 7] * 8 - W.spaces.rent[p] / 20000; if (sc > ss) { ss = sc; sp = p; } }
    if (sp < 0) continue;
    const f = c.openFirm(sec, sp, best); if (f >= 0) { opened++; addMemory(c, best, 21, E_F0 + f); c.event("opening", `${c.who(best)} opens ${c.names.firm(f)} (${S.name.toLowerCase()})`, [E_F0 + f]); }
  }
}
export { SPACE_FOR, dist };
