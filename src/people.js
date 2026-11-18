// The citizens and households of Port Alder: who they are, how they feel, what they remember and expect,
// what they do each day, and the turns of their lives. Every citizen holds a Social Information Number (registry.js);
// friends, partners and the people in memories are referred to by number. After the founding census nothing here is
// drawn: births, deaths, illness, friendships, partnerships, schooling, work and retirement are decided by the
// people themselves from their own state, on the laws of laws.js.
// SPDX-License-Identifier: GPL-3.0-only
import { dayInfo, DAY0, civilFromDays } from "./rules.js";
import { OCCS, O, CATS, NCAT, B as BK, CELL_M, personName, firmName } from "./citydata.js";
import { AC, E_H0, E_F0, E_B0, E_CITY, E_SCHOOL, E_ROW, E_FEDGOV, holdKind } from "./books.js";
import { sat, TRUST_SPEC, tickTrust, priorTrust, copyTrust, F_RUNNING, F_TERMINATE } from "./core.js";
import { census, censusBell, breeder, mortality, cumHazard, cox, MORTALITY, asfr, relax, fade, smooth, hebb, align, ln, ex, bellman, rasch, kleiber, MASS_BY_AGE } from "./laws.js";
import { issue, relocate, retire as retireSin } from "./registry.js";
import { cellOf } from "./world.js";

export const PEOPLE_SPEC = [["alive", Uint8Array], ["serial", Uint32Array], ["hh", Int32Array], ["next", Int32Array], ["born", Int32Array], ["bday", Uint8Array], ["sex", Uint8Array],
  ["edu", Uint8Array], ["occ", Uint8Array], ["skill", Uint16Array], ["traits", Uint32Array], ["given", Uint16Array], ["family", Uint16Array],
  ["status", Uint8Array], ["emp", Int32Array], ["wage", Int32Array], ["sal", Uint8Array], ["hours", Uint8Array], ["shift", Uint16Array], ["hired", Int32Array],
  ["need", Uint16Array, 8], ["val", Int16Array], ["stress", Uint16Array], ["health", Uint16Array], ["sick", Uint8Array], ["sickBal", Uint16Array], ["leaveTo", Int32Array],
  ["expInf", Int16Array], ["expInc", Int16Array], ["expRent", Int16Array], ["jobSec", Uint16Array],
  ["memK", Uint8Array, 8], ["memV", Int8Array, 8], ["memW", Int32Array, 8], ["memD", Int32Array, 8], ["ref", Int32Array, 8],
  ...TRUST_SPEC("te"), ...TRUST_SPEC("tl"), ...TRUST_SPEC("tb"), ...TRUST_SPEC("tc"),
  ["eCo", Uint8Array], ["eDe", Uint8Array], ["lCo", Uint8Array], ["lDe", Uint8Array], ["bCo", Uint8Array], ["bDe", Uint8Array], ["cCo", Uint8Array], ["cDe", Uint8Array],
  ["friend", Int32Array, 4], ["partner", Int32Array],
  ["ytdW", Float64Array], ["ytdT", Float64Array], ["ytdUI", Float64Array], ["ytdOT", Float64Array], ["ytdFIT", Float64Array], ["ytdSS", Float64Array], ["ytdMed", Float64Array], ["empW", Float64Array], ["empWnt", Float64Array],
  ["qw", Int32Array, 5], ["wk", Uint16Array], ["preg", Uint16Array], ["pot", Uint16Array], ["ptips", Int32Array], ["psick", Uint16Array],
  ["ui", Int32Array], ["uiLeft", Uint8Array], ["uiWait", Uint8Array], ["uiEmp", Int32Array], ["ss", Int32Array],
  ["mode", Uint8Array], ["today", Uint8Array], ["visit", Int32Array, 3], ["vtime", Uint16Array, 3], ["lastEmp", Int32Array], ["laidAt", Int32Array], ["school", Int32Array],
  ["sin", Int32Array], ["frail", Float64Array], ["frailQ", Float32Array], ["cumH", Float64Array], ["wish", Float32Array], ["gest", Int32Array], ["fw", Float32Array, 4], ["acq", Int32Array, 4], ["acqW", Float32Array, 4],
  ["away", Int32Array], ["awayH", Uint8Array], ["ah", Uint8Array], ["ahRenew", Int32Array], ["ssi", Int32Array], ["abd", Int32Array], ["abawd", Uint8Array], ["dis", Uint16Array],
  ["mh", Uint16Array], ["mhDays", Uint16Array], ["mhEp", Uint8Array], ["mhTx", Uint16Array], ["mhNext", Int32Array], ["mhYtd", Uint16Array], ["crisis", Uint16Array], ["forgone", Uint16Array], ["visits", Uint16Array], ["hosp", Uint16Array],
  ["dose", Float32Array], ["inf", Uint8Array], ["infDay", Uint16Array], ["immune", Uint16Array], ["vax", Int32Array], ["cent", Uint16Array], ["urge", Float32Array, 12], ["flare", Float32Array], ["imp", Float32Array], ["immunity", Float32Array], ["search", Float32Array]];
export const HOUSEHOLD_SPEC = [["alive", Uint8Array], ["head", Int32Array], ["first", Int32Array], ["size", Uint8Array], ["kids", Uint8Array], ["adults", Uint8Array], ["joint", Uint8Array],
  ["home", Int32Array], ["tenure", Uint8Array], ["landlord", Int32Array], ["rent", Int32Array], ["lease", Int32Array], ["notice", Int32Array], ["noticeAt", Int32Array],
  ["mort", Int32Array], ["auto", Int32Array], ["card", Int32Array], ["cardLim", Int32Array], ["cars", Uint8Array], ["carBought", Int32Array],
  ["pantry", Int32Array], ["spend", Int32Array, 8], ["fileOn", Int32Array], ["owed", Float64Array], ["moved", Int32Array], ["inc", Float64Array], ["exp", Float64Array],
  ...TRUST_SPEC("kb"), ["late", Uint8Array], ["evictAt", Int32Array], ["util", Int32Array], ["cover", Uint8Array], ["demoAt", Int32Array],
  ["progs", Uint16Array], ["snap", Int32Array], ["ebt", Int32Array], ["snapRenew", Int32Array], ["tanf", Int32Array], ["tanfMonths", Uint8Array], ["wic", Int32Array], ["sun", Int32Array], ["copay", Int32Array],
  ["voucher", Uint8Array], ["vWait", Int32Array], ["hap", Int32Array], ["wftcY", Uint16Array], ["fresh", Int32Array], ["mbits", Uint8Array], ["mRent", Int32Array], ["apply", Float32Array, 10], ["plan", Uint8Array], ["leave", Float32Array],
  ["env", Float64Array, 8], ["fuel", Float32Array], ["carD", Float32Array], ["prep", Int16Array], ["ins", Uint8Array], ["prem", Int32Array], ["heat", Int32Array], ["kwh", Float32Array], ["hurge", Float32Array, 6],
  ["rArr", Int32Array], ["rMo", Uint8Array], ["lPat", Float32Array], ["ntc", Int32Array], ["sell", Uint8Array]];

export const STATUS = ["child", "student", "working", "looking for work", "not in the labour force", "retired", "on family leave"];
export const NEEDS = ["food", "rest", "health", "shelter", "social", "purpose", "leisure", "money"];
export const MODES = ["walks", "drives", "takes the bus", "cycles"];
export const TRAITS = ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism", "risk", "thrift", "civic duty"];
export const trait = (t, k) => (t >>> (4 * k)) & 15;
export const T_O = 0, T_C = 1, T_E = 2, T_A = 3, T_N = 4, T_RISK = 5, T_THRIFT = 6, T_CIVIC = 7;
// memories: [name, default feeling]
export const MEM = [["", 0], ["was hired", 90], ["was laid off", -110], ["got a raise", 50], ["had hours cut", -40], ["was refused a job", -25], ["rent went up", -50],
  ["was evicted", -127], ["was refused a loan", -60], ["got a loan", 40], ["had a baby", 100], ["lost someone", -120], ["found a partner", 90], ["moved home", 30],
  ["found the shelves empty", -12], ["had a good meal out", 14], ["the bus was late", -6], ["got a tax refund", 35], ["owed tax", -35], ["fell ill", -30],
  ["bought a home", 110], ["started a business", 80], ["the business failed", -120], ["saw a price jump", -20], ["voted", 10], ["moved to the city", 40], ["was robbed", -70], ["retired", 60],
  ["drew a design", 35], ["my design was chosen", 120], ["my home is to be torn down", -90], ["a new building opened nearby", 20], ["saw a familiar building come down", -15], ["my design was passed over", -12],
  ["got help with food", 30], ["got health coverage", 40], ["was denied benefits", -35], ["started counselling", 25], ["reached out in a crisis", 10], ["got help with child care", 35], ["got help with rent", 45],
  ["went without care", -30], ["a friend moved away", -25], ["the strike ended", 30], ["got an eviction notice", -80], ["a friend helped with the rent", 40]];
export const M = Object.fromEntries(MEM.map(([k], i) => [k.replace(/[^a-z]+/g, "_").replace(/^_|_$/g, ""), i]));

export const ageYears = (c, i, e = c.epoch) => Math.floor((e - c.people.born[i]) / 365.25);
export function members(c, h) { const out = []; for (let i = c.hh.first[h]; i >= 0; i = c.people.next[i]) out.push(i); return out; }
export function homeBuilding(c, h) { const d = c.hh.home[h]; return d >= 0 ? c.world.dwellings.bld[d] : -1; }
export function homeCell(c, h) { const b = homeBuilding(c, h); return b >= 0 ? c.world.frontCell(b) : -1; }
export function addMemory(c, i, kind, who = -1, val = MEM[kind][1]) {
  const P = c.people, o = i * 8; let slot = -1, low = 1e9;
  for (let k = 0; k < 8; k++) { const v = Math.abs(P.memV[o + k]); if (P.memK[o + k] === 0) { slot = k; break; } if (v < low) { low = v; slot = k; } }
  if (P.memK[o + slot] && Math.abs(val) < low) return;
  P.memK[o + slot] = kind; P.memV[o + slot] = sat(val, -127, 127); P.memW[o + slot] = who; P.memD[o + slot] = c.epoch;
}
// friends and partners are held by Social Information Number; these give the friend's slot in the city, or -1
export const friendOf = (c, i, k) => c.slotOf(c.people.friend[i * 4 + k]);
export const partnerOf = (c, i) => c.slotOf(c.people.partner[i]);
export function befriend(c, i, j, w = 1) { const P = c.people; let a = -1, b = -1; for (let k = 0; k < 4; k++) { if (a < 0 && P.friend[i * 4 + k] < 0) a = k; if (b < 0 && P.friend[j * 4 + k] < 0) b = k; } if (a < 0 || b < 0) return false; P.friend[i * 4 + a] = P.sin[j]; P.fw[i * 4 + a] = w; P.friend[j * 4 + b] = P.sin[i]; P.fw[j * 4 + b] = w; return true; }
export const remembers = (c, i, kind, who, within = 365) => { const P = c.people, o = i * 8; for (let k = 0; k < 8; k++) if (P.memK[o + k] === kind && P.memW[o + k] === who && c.epoch - P.memD[o + k] <= within) return true; return false; };

/* ------------------------------------------------------------------ genesis and birth */
// schooling of adults in Everett (ACS: about 29% with a bachelor's degree or more)
const EDU_DIST = [110, 270, 330, 190, 100];
const OCC_BY_EDU = [
  [[O.service, 35], [O.food, 25], [O.production, 20], [O.driver, 10], [O.care, 10]],
  [[O.service, 22], [O.food, 10], [O.admin, 18], [O.trades, 16], [O.production, 12], [O.driver, 10], [O.care, 8], [O.safety, 4]],
  [[O.admin, 25], [O.trades, 15], [O.care, 15], [O.safety, 8], [O.service, 12], [O.driver, 5], [O.production, 5], [O.clinician, 5], [O.professional, 10]],
  [[O.professional, 28], [O.teacher, 14], [O.manager, 16], [O.engineer, 16], [O.clinician, 12], [O.admin, 10], [O.safety, 4]],
  [[O.professional, 30], [O.engineer, 20], [O.manager, 18], [O.clinician, 16], [O.teacher, 16]],
];
// a census value against a weighted list (the founding census only)
const pickW = (list, h) => { const tot = list.reduce((s, [, w]) => s + w, 0); let r = h % tot; for (const [v, w] of list) { if (r < w) return v; r -= w; } return list[0][0]; };
// what a person suits: each occupation open to their schooling, weighted by how common it is and how it fits their
// temperament (people choose work they are drawn to)
const FIT = { [O.service]: [T_E, T_A], [O.food]: [T_E, T_A], [O.admin]: [T_C, T_C], [O.trades]: [T_C, T_RISK], [O.production]: [T_C, T_THRIFT], [O.driver]: [T_C, T_RISK], [O.care]: [T_A, T_A],
  [O.clinician]: [T_A, T_C], [O.teacher]: [T_A, T_O], [O.professional]: [T_O, T_C], [O.manager]: [T_E, T_C], [O.engineer]: [T_O, T_C], [O.safety]: [T_RISK, T_C] };
export function chooseOcc(c, i, edu) {
  const t = c.people.traits[i]; let best = OCC_BY_EDU[edu][0][0], bs = -1e9;
  for (const [o, w] of OCC_BY_EDU[edu]) { const [x, y] = FIT[o] || [T_C, T_C], sc = w * (16 + trait(t, x) + trait(t, y)); if (sc > bs) { bs = sc; best = o; } }
  return best;
}
// parents choose a name: the one least given among the city's recent births for that sex (fashion turns over), not
// a parent's own, and unlike the siblings' names (law 52.1)
function nameChild(c, h, sex, parents) {
  const P = c.people, used = new Uint16Array(64), sib = [];
  for (const j of P.each()) if (P.sex[j] === sex && c.epoch - P.born[j] < 1826) used[P.given[j] % 64]++;
  for (const j of members(c, h)) sib.push(personName(P.given[j], 0).split(" ")[0]);
  const order = [...Array(64).keys()].sort((x, y) => used[x] - used[y] || x - y);
  for (const g of order) { const nm = personName(g, 0).split(" ")[0]; if (parents && parents.some((q) => q >= 0 && P.given[q] === g)) continue; if (sib.every((o) => align(nm, o) < Math.max(nm.length, o.length))) return g; }
  return order[0];
}
const BANK_SHARE = [400, 750, 1000];
// a new person: in the founding census (every attribute drawn from the census rotation), at birth (inherited from the
// parents by the breeder's equation, with the mother's circumstances) or arriving (the arriving household's own)
export function newPerson(c, h, ageDays, sex, fam, salt, opt = {}) {
  const P = c.people, i = P.alloc(); if (i < 0) return -1;
  const founding = !!c.census?.open, parents = opt.parents || null, years = ageDays / 365;
  const r = (k) => census(c, 0x5000 + k, i), rb = (k) => censusBell(c, 0x5000 + k, i);
  P.serial[i] = c.nextSerial(); P.hh[i] = h; P.born[i] = c.epoch + 1 - ageDays; P.sex[i] = sex; P.family[i] = fam;
  P.bday[i] = civilFromDays(DAY0 + P.born[i]).d;
  let t = 0;
  if (opt.traits !== undefined) t = opt.traits >>> 0;
  else if (founding) for (let k = 0; k < 8; k++) t |= sat(8 + Math.round(rb(10 + k) / 64), 0, 15) << (4 * k);
  else {
    const [m, f] = parents || [-1, -1], order = h >= 0 ? c.hh.kids[h] : 0, mStress = m >= 0 ? P.stress[m] : 300;
    for (let k = 0; k < 8; k++) {
      const mid = m >= 0 && f >= 0 ? (trait(P.traits[m], k) + trait(P.traits[f], k)) / 2 : m >= 0 ? trait(P.traits[m], k) : f >= 0 ? trait(P.traits[f], k) : 8;
      let v = breeder(8, mid, 0.4) + (k === T_C ? (order === 0 ? 0.5 : -0.25) : k === T_O || k === T_A ? (order > 0 ? 0.4 : 0) : k === T_N ? (mStress - 400) / 400 : 0);
      t |= sat(Math.round(v), 0, 15) << (4 * k);
    }
  }
  P.traits[i] = t >>> 0;
  P.given[i] = opt.given ?? (founding ? r(1) % 64 : nameChild(c, h, sex, parents));
  const eduOf = () => pickW(EDU_DIST.map((w, k) => [k, w]), r(2));
  P.edu[i] = opt.edu ?? (founding ? (years < 18 ? 0 : years < 22 ? Math.min(2, eduOf()) : eduOf()) : 0);
  P.skill[i] = founding ? sat(400 + Math.round(rb(3) * 0.6) + Math.min(250, Math.max(0, years - 22) * 8), 50, 1000) : sat(400 + (trait(t, T_C) - 8) * 20 + Math.min(250, Math.max(0, years - 22) * 8), 50, 1000);
  for (let k = 0; k < 8; k++) P.need[i * 8 + k] = founding ? 620 + (r(20 + k) % 260) : 760;
  P.health[i] = founding ? sat(980 - Math.max(0, years - 45) * 9 - (r(4) % 120), 200, 1000) : sat(parents && parents[0] >= 0 ? 860 + (P.health[parents[0]] - 800) / 4 : 900, 400, 1000);
  P.need[i * 8 + 2] = P.health[i];
  // disability at the founding: the census's share by age (ACS, Washington: about 7% at 18-34, 12% at 35-64, 30% at
  // 65-74, 47% from 75), its severity spread over those who have one; afterwards it follows the body (health.js)
  if (founding && years >= 18) { const prev = years < 35 ? 70 : years < 65 ? 120 : years < 75 ? 300 : 470, u = r(34) % 1000; P.dis[i] = u < prev ? 90 + Math.round(((prev - u) * 600) / prev) : 0; }
  P.stress[i] = founding ? 120 + (r(5) % 200) : 200; P.expInf[i] = founding ? 260 + (r(6) % 160) : 300; P.expInc[i] = founding ? 200 + (r(7) % 150) : 250; P.expRent[i] = founding ? 350 + (r(8) % 200) : 400; P.jobSec[i] = 600;
  for (let k = 0; k < NCAT; k++) P.ref[i * 8 + k] = CATS[k].base;
  P.emp[i] = -1; P.partner[i] = -1; P.lastEmp[i] = -1; P.laidAt[i] = -100000; P.uiEmp[i] = -1; P.school[i] = -1; P.away[i] = 0; P.gest[i] = 0;
  for (let k = 0; k < 4; k++) { P.friend[i * 4 + k] = -1; P.acq[i * 4 + k] = -1; P.fw[i * 4 + k] = 0; P.acqW[i * 4 + k] = 0; } for (let k = 0; k < 3; k++) P.visit[i * 3 + k] = -1;
  // the body's frailty: survival to this age, then an exponential endowment (law 75.19; memoryless, so the founding
  // population carries no backlog of deaths); a newborn's endowment leans toward its parents'
  const male = sex === 0, hr = male ? MORTALITY.maleHR : 1;
  let q = founding ? (r(30) + 0.5) / 4294967297 : 0.5;
  if (!founding && parents) { const qs = parents.filter((x) => x >= 0).map((x) => P.frailQ[x]); if (qs.length) q = breeder(0.5, qs.reduce((a, b) => a + b, 0) / qs.length, 0.25); }
  if (opt.frailQ !== undefined) q = opt.frailQ;
  P.frailQ[i] = q; P.cumH[i] = cumHazard(years, hr); P.frail[i] = P.cumH[i] - ln(1 - q);
  P.wish[i] = founding ? r(31) / 4294967296 : 0; P.imp[i] = founding ? r(32) / 4294967296 : 0;
  P.immunity[i] = founding ? ex(rb(33) / 147.8) : 0.6;                // prior immunity, a lognormal spread over people (newborns have little)
  priorTrust(c.P, P, "te", i); priorTrust(c.P, P, "tl", i);
  const pick = founding ? r(9) : (parents && parents[0] >= 0 ? P.serial[parents[0]] : P.serial[i]);
  const fb = c.founders[`deer.${String(pick % 11).padStart(2, "0")}`], fc = c.founders[pick & 1 ? "warden.a" : "warden.b"];
  if (parents && parents[0] >= 0) { copyTrust(P, "tb", i, { alpha: P.tbA[parents[0]], beta: P.tbB[parents[0]], rel: 0, level: P.tbLv[parents[0]], life: 0, rev: 0 }); copyTrust(P, "tc", i, { alpha: P.tcA[parents[0]], beta: P.tcB[parents[0]], rel: 0, level: P.tcLv[parents[0]], life: 0, rev: 0 }); }
  else { if (fb) copyTrust(P, "tb", i, fb); else priorTrust(c.P, P, "tb", i); if (fc) copyTrust(P, "tc", i, fc); else priorTrust(c.P, P, "tc", i); }
  // the number: issued now (founding census, birth, arrival) or carried in by someone the registry already knows
  if (opt.sin !== undefined && opt.sin >= 0) { P.sin[i] = opt.sin; relocate(c, opt.sin, i); }
  else P.sin[i] = issue(c, opt.office ?? 0, founding ? 0 : parents ? 1 : 2, i);
  // join the household
  const H = c.hh; P.next[i] = -1;
  if (H.first[h] < 0) H.first[h] = i; else { let j = H.first[h]; while (P.next[j] >= 0) j = P.next[j]; P.next[j] = i; }
  H.size[h]++; if (years < 18) H.kids[h]++; else H.adults[h]++;
  if (years < 5) P.status[i] = 0; else if (years < 18) P.status[i] = 1;
  else if (opt.status !== undefined) { P.status[i] = opt.status; if (opt.status === 3 || opt.status === 2) P.occ[i] = opt.occ ?? chooseOcc(c, i, P.edu[i]); if (opt.status === 5) P.ss[i] = opt.ss ?? 180000; }
  else if (founding) {
    if (years >= 67 || (years >= 63 && r(11) % 3 === 0)) { P.status[i] = 5; P.ss[i] = 140000 + (r(12) % 160000); }
    else if (years < 23 && r(13) % 3 === 0) P.status[i] = 1;
    else if (r(14) % 1000 < 190) P.status[i] = 4;                      // caring at home, disabled, studying or between jobs
    else { P.status[i] = 3; P.occ[i] = pickW(OCC_BY_EDU[P.edu[i]], r(15)); }
  } else { P.status[i] = 3; P.occ[i] = chooseOcc(c, i, P.edu[i]); }
  P.sickBal[i] = founding ? r(16) % 120 : 0; P.mode[i] = 0;
  return i;
}
// how a woman's circumstances lean her toward a child: a partner at home, room, security, mood, temperament and the
// children she has. The city's founding women average one (the scale is set once at the founding, city.js), so the
// city keeps Washington's age-specific rates (law 75.27) while the circumstances decide who
export function fertilityMod(c, i, h) {
  const P = c.people, H = c.hh, partner = partnerOf(c, i), couple = partner >= 0 && P.hh[partner] === h, room = c.world.dwellings.rooms[Math.max(0, H.home[h])] || 1;
  const secure = P.need[i * 8 + 7] >= 300 && P.need[i * 8 + 3] >= 400, t = P.traits[i];
  return (couple ? 1.5 : 0.45) * (room > H.size[h] ? 1.15 : 0.85) * (secure ? 1.05 : 0.7) * (P.val[i] > 0 ? 1.05 : 0.95) * (1 + (trait(t, T_A) + trait(t, T_E) - 16) / 40) * (H.kids[h] >= 3 ? 0.4 : 1);
}
export function removeFromHousehold(c, i) {
  const P = c.people, H = c.hh, h = P.hh[i]; if (h < 0) return;
  if (H.first[h] === i) H.first[h] = P.next[i]; else { let j = H.first[h]; while (j >= 0 && P.next[j] !== i) j = P.next[j]; if (j >= 0) P.next[j] = P.next[i]; }
  H.size[h]--; if (ageYears(c, i) < 18) H.kids[h] = Math.max(0, H.kids[h] - 1); else H.adults[h] = Math.max(0, H.adults[h] - 1);
  P.next[i] = -1; P.hh[i] = -1;
  if (H.head[h] === i) H.head[h] = H.first[h];
}
export function joinHousehold(c, i, h) {
  const P = c.people, H = c.hh; P.hh[i] = h; P.next[i] = -1;
  if (H.first[h] < 0) H.first[h] = i; else { let j = H.first[h]; while (P.next[j] >= 0) j = P.next[j]; P.next[j] = i; }
  H.size[h]++; if (ageYears(c, i) < 18) H.kids[h]++; else H.adults[h]++;
  if (H.head[h] < 0) H.head[h] = i;
}
export function newHousehold(c, bank) {
  const H = c.hh, h = H.alloc(); if (h < 0) return -1;
  H.head[h] = -1; H.first[h] = -1; H.home[h] = -1; H.landlord[h] = -1; H.mort[h] = -1; H.auto[h] = -1; H.card[h] = -1; H.notice[h] = 0; H.noticeAt[h] = 0; H.evictAt[h] = 0;
  c.books.resetEntity(E_H0 + h); c.books.bankOf[E_H0 + h] = bank; priorTrust(c.P, H, "kb", h); H.moved[h] = c.epoch;
  return h;
}
export function genesisPeople(c) {
  const W = c.world, T = W.buildings, D = W.dwellings, s = c.cfg.seed, cz = (salt, a, b = 0) => census(c, salt, a, b);
  for (const d of D.each()) {
    const b = D.bld[d], kind = T.kind[b], r = cz(0x40e5, d);
    if (r % 1000 >= c.cfg.occupancy + (kind === BK.house ? 40 : 0)) continue;
    const bank = pickW([[0, 40], [1, 35], [2, 25]].slice(0, c.cfg.banks), cz(0xba4c, d));
    const h = newHousehold(c, bank); if (h < 0) break;
    const fam = cz(0xfa31, d) % 48, q = cz(0x40e6, d) % 1000;
    const types = kind === BK.house ? [170, 450, 800, 860] : kind === BK.townhouse ? [240, 530, 820, 890] : [430, 700, 820, 890];
    const type = q < types[0] ? 0 : q < types[1] ? 1 : q < types[2] ? 2 : q < types[3] ? 3 : 4;   // single, couple, family, single parent, retirees
    const span = (lo, hi, k) => lo + (cz(0xa9e, d, k) % (hi - lo + 1));
    const adultAge = (k) => (type === 4 ? span(65, 91, k) : span(type === 0 ? 20 : 25, type === 0 ? 64 : 60, k)) * 365 + (cz(0xa9f, d, k) % 365);
    const a1 = newPerson(c, h, adultAge(0), cz(0x5e, d) & 1, fam, 0);
    let a2 = -1;
    if (type === 1 || type === 2 || (type === 4 && (cz(0x5d, d) & 1))) { a2 = newPerson(c, h, Math.max(18 * 365, adultAge(0) + censusBell(c, 0xa7, d) * 4), (c.people.sex[a1] + ((cz(0x5f, d) % 10) < 9 ? 1 : 0)) & 1, fam, 0); c.people.partner[a1] = c.people.sin[a2]; c.people.partner[a2] = c.people.sin[a1]; c.hh.joint[h] = 1; }
    if (type === 2 || type === 3) {
      const nk = 1 + (cz(0x6d, d) % (type === 2 ? 3 : 2)), pa = ageYears(c, a1, 1);
      for (let k = 0; k < nk; k++) newPerson(c, h, Math.min(pa - 19, 1 + (cz(0x6e, d, k) % 17)) * 365 + (cz(0x6f, d, k) % 365), cz(0x70, d, k) & 1, fam, 0);
    }
    c.hh.head[h] = a1;
    // a single adult keeps a household on their own means: in the labour force, or, when disabled, on the Social
    // Security Disability Insurance they already draw (the census reads it as history; SSDI averaged about $1,580 in 2025)
    if ((type === 0 || type === 3) && (c.people.status[a1] === 4 || c.people.status[a1] === 1)) {
      if (c.people.dis[a1] >= 160) { c.people.status[a1] = 4; c.people.ss[a1] = 100000 + (cz(0xd15, d) % 90000); }
      else { c.people.status[a1] = 3; c.people.occ[a1] = pickW(OCC_BY_EDU[c.people.edu[a1]], cz(0xea5, d)); }
    }
    // someone in every working-age household earns: a single adult, or one of a couple, is in the labour force
    const earners = [a1, a2].filter((x) => x >= 0);
    if ((type === 1 || type === 2) && !earners.some((x) => c.people.status[x] === 2 || c.people.status[x] === 3)) { const x = earners[0]; c.people.status[x] = 3; c.people.occ[x] = pickW(OCC_BY_EDU[c.people.edu[x]], cz(0xea4, d)); }
    c.hh.home[h] = d; D.hh[d] = h; T.occupied[b]++;
    // owners and renters
    const own = kind === BK.house ? 680 : kind === BK.townhouse ? 450 : kind === BK.apartments ? 110 : 150;
    c.hh.tenure[h] = (cz(0x0e7, d) % 1000 < own + (type === 4 ? 150 : 0) - (type === 0 ? 200 : 0)) ? 1 : 0;
    c.hh.cars[h] = c.hh.adults[h] === 0 ? 0 : (cz(0xca5, d) % 1000 < (T.hood[b] === 0 ? 450 : 880)) ? Math.min(2, c.hh.adults[h]) - (cz(0xca6, d) % 3 === 0 ? 1 : 0) || 1 : 0;
    c.hh.carBought[h] = 1 - (cz(0xca7, d) % 3600); c.hh.carD[h] = (1 - c.hh.carBought[h]) * 0.000224;   // the wear of its years and miles so far, against 20 years or 400,000 km (law 65.18) c.hh.fuel[h] = 20 + (cz(0xca8, d) % 30);
    c.hh.pantry[h] = c.hh.size[h] * (1000 + (cz(0x9a47, d) % 5000));
  }
  // women already expecting at the founding: a wish whose phase is below what nine months at her age's rate would
  // have built came due within the last nine months, and she is that far along (law 75.27)
  for (const i of c.people.each()) {
    const P = c.people, h = P.hh[i], years = ageYears(c, i, 1); if (P.sex[i] !== 1 || years < 15 || years > 49 || h < 0) continue;
    const rate = (asfr(years) * (c.hh.joint[h] ? 1.25 : 0.35)) / 365.25; if (rate <= 0) continue;
    const since = P.wish[i] / rate; if (since < 270) P.gest[i] = 1 + Math.round(270 - since);
  }
  c.names = {
    person: (i) => personName(c.people.given[i], c.people.family[i]),
    firm: (f) => firmName(c.firms.sector[f], c.firms.name[f]),
  };
}

/* ------------------------------------------------------------------ the morning */
const SCHOOL_BREAKS = (d) => (d.m === 7 || d.m === 8 || (d.m === 6 && d.d > 18) || (d.m === 9 && d.d < 3) || (d.m === 12 && d.d > 20) || (d.m === 1 && d.d < 3) || (d.m === 4 && d.d >= 6 && d.d <= 10));
export function schoolDay(d) { return d.workday && !SCHOOL_BREAKS(d); }
// who is ill (the health module's contagion and conditions set P.sick), who goes to work, who goes to school
export function morning(c, d, g) {
  const P = c.people, e = c.epoch, sd = schoolDay(d);
  for (const i of P.each()) {
    let t = 0;
    if (P.sick[i]) { t |= 2; P.sick[i]--; }
    const st = P.status[i];
    if (st === 1 && sd && ageYears(c, i) < 18) t |= 4;
    if (st === 6 && P.leaveTo[i] <= e) { P.status[i] = P.emp[i] >= 0 ? 2 : 3; }
    if (st === 2 && P.emp[i] >= 0) {
      const days = employerDays(c, P.emp[i]);
      if (days & (1 << d.wd) && !(d.holiday && P.emp[i] >= E_CITY) && !P.awayH[i]) {
        if (t & 2) {
          const money = P.need[i * 8 + 7], hours = P.hours[i] * 4;
          if (P.sickBal[i] >= hours) { P.sickBal[i] -= hours; P.psick[i] += hours; t |= 8; }
          // going in ill: when money is tight, or the job feels shaky to someone conscientious
          else if (money < 450 || (trait(P.traits[i], T_C) >= 10 && P.jobSec[i] < 450)) t |= 1;
        } else t |= 1;
      }
    }
    P.today[i] = t;
    for (let k = 0; k < 3; k++) P.visit[i * 3 + k] = -1;
  }
}
export function employerDays(c, emp) {
  if (emp >= E_F0 && emp < E_B0) return c.SECTORS_DAYS[c.firms.sector[emp - E_F0]];
  return emp === E_CITY ? 127 : 62;
}
// did i see a friend today: at work, at the same shop or bar, or at home in the same building
function sawFriend(c, i) {
  const P = c.people, ti = P.today[i];
  for (let k = 0; k < 4; k++) {
    const f = friendOf(c, i, k); if (f < 0) continue;
    if ((ti & 1) && (P.today[f] & 1) && P.emp[f] === P.emp[i]) return true;
    for (let x = 0; x < 3; x++) { const v = P.visit[i * 3 + x]; if (v >= 0 && (P.visit[f * 3] === v || P.visit[f * 3 + 1] === v || P.visit[f * 3 + 2] === v)) return true; }
    const hi = P.hh[i], hf = P.hh[f]; if (hi >= 0 && hf >= 0 && c.hh.home[hi] >= 0 && c.hh.home[hf] >= 0 && c.world.dwellings.bld[c.hh.home[hi]] === c.world.dwellings.bld[c.hh.home[hf]] && !(ti & 1) && !(P.today[f] & 1)) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ minds */
const NEED_W = [3, 2, 3, 3, 2, 2, 1, 3];
export function minds(c, d, g) {
  const P = c.people, H = c.hh, Bk = c.books, e = c.epoch, Pp = c.P, sunday = d.wd === 0, light = c.gov.light ?? 0;
  const hhVal = new Float64Array(H.top), hhN = new Uint16Array(H.top);
  for (const i of P.each()) { const h = P.hh[i]; if (h >= 0) { hhVal[h] += P.val[i]; hhN[h]++; } }
  for (const i of P.each()) {
    const o = i * 8, t = P.traits[i], N = trait(t, T_N), h = P.hh[i], st = P.status[i], today = P.today[i];
    const need = P.need, visits = (P.visit[i * 3] >= 0) + (P.visit[i * 3 + 1] >= 0) + (P.visit[i * 3 + 2] >= 0), working = today & 1, years = ageYears(c, i, e);
    // each need relaxes toward what the day gives (laws 11.2 and 16.42)
    const toward = (k, target, rate) => { need[o + k] = sat(Math.round(relax(need[o + k], target, rate - 1)), 0, 1000); };
    if (h >= 0 && H.pantry[h] > 0) toward(0, 860, 3); else need[o] = Math.max(0, need[o] - 200);
    toward(1, 780 - (working && P.hours[i] > 9 ? 160 : working ? 60 : 0) - (h >= 0 && H.kids[h] && H.size[h] > 2 && st >= 2 ? 80 : 0) - (P.stress[i] >> 2) + (d.weekend ? 80 : 0) - (today & 2 ? 120 : 0) - (h >= 0 ? (c.noiseAt?.(h) || 0) : 0), 4);
    P.health[i] = sat(P.health[i] + (today & 2 ? -6 : 3) + (need[o + 1] > 600 ? 1 : -1) - (h >= 0 && (c.hh.mbits[h] & 64) ? 1 : 0), 50, 1000);
    need[o + 2] = P.health[i];
    let shelter = 500;
    if (h >= 0) {
      const tn = H.tenure[h], inc = Math.max(1, H.inc[h]);
      if (H.home[h] < 0) shelter = 80;
      else if (tn === 1) shelter = 880 - (H.late[h] * 120);
      else { const burden = (H.rent[h] * 1000) / inc; shelter = 820 - Math.max(0, burden - 300) * 1.1 - (H.noticeAt[h] > e ? 120 : 0) - (H.evictAt[h] > 0 ? 500 : 0) - (H.demoAt[h] > e ? 260 : 0) - H.late[h] * 90 - H.rMo[h] * 140; }
    }
    toward(3, shelter, 8);
    toward(4, 420 + (h >= 0 ? Math.min(3, H.size[h] - 1) * 50 : 0) + (sawFriend(c, i) ? 220 : 0) + (working ? 60 : 0) + (today & 4 ? 120 : 0) + visits * 50, 5);
    const purpose = st === 2 ? 600 + P.teLv[i] * 80 : st === 6 ? 760 : st === 1 || st === 0 ? 740 : st === 5 ? 620 : st === 3 ? 240 : 460;
    toward(5, purpose, 10);
    toward(6, 360 + (d.weekend ? 220 : 0) + (working ? 0 : 140) + visits * 70 - (working && P.hours[i] > 9 ? 120 : 0), 5);
    if (h >= 0) {
      const he = E_H0 + h, liquid = Bk.get(he, AC.DEPOSITS) + Bk.get(he, AC.SAVINGS), monthly = Math.max(50000, H.exp[h]), debt = -Bk.get(he, AC.L_CARD);
      const target = sat(Math.round(150 + Math.min(6, liquid / monthly) * 110 - Math.min(400, debt / 2000) - H.late[h] * 120 + (st === 3 && P.ui[i] === 0 ? -150 : 0)), 0, 1000);
      toward(7, target, 6);
    }
    // mood: the weighted needs, the memories, daylight, the household and friends
    let sum = 0, wsum = 0; for (let k = 0; k < 8; k++) { sum += NEED_W[k] * need[o + k]; wsum += NEED_W[k]; }
    let target = Math.round((sum / wsum - 640) * 2);
    if (target < 0) target = Math.round(target * (1 + N / 16));
    let memAffect = 0; for (let k = 0; k < 8; k++) if (P.memK[o + k]) { const age = e - P.memD[o + k]; memAffect += Math.round((P.memV[o + k] * 3) / (1 + age / 20)); }
    target += sat(memAffect, -500, 500) + Math.round(light * (4 + N) / 12);
    let v = P.val[i] + Math.round((target - P.val[i]) / 4);
    if (h >= 0 && hhN[h] > 1) v += Math.round((hhVal[h] / hhN[h] - P.val[i]) / 16);
    for (let k = 0; k < 4; k++) { const f = friendOf(c, i, k); if (f >= 0) v += Math.round((P.val[f] - P.val[i]) / 48); }
    P.val[i] = sat(v, -1000, 1000);
    let press = 0; for (let k = 0; k < 8; k++) if (need[o + k] < 300) press += (300 - need[o + k]);
    const load = 180 + (working ? 90 + (P.hours[i] > 9 ? 80 : 0) : 0) + Math.max(0, 500 - need[o + 7]) / 3 + Math.max(0, 500 - P.jobSec[i]) / 4 + (h >= 0 && H.kids[h] && st >= 2 ? 50 : 0) + (today & 2 ? 80 : 0) + press / 3 - (need[o + 1] + need[o + 6] - 900) / 6;
    P.stress[i] = sat(Math.round(P.stress[i] + ((load * (12 + N)) / 16 - P.stress[i]) / 6), 0, 1000);
    const tick = (pre, co, de) => { const it = co + de; if (it || sunday) tickTrust(Pp, P, pre, i, it, co, de, F_RUNNING, c.C); };
    tick("te", P.eCo[i], P.eDe[i]); tick("tl", P.lCo[i], P.lDe[i]); tick("tb", P.bCo[i], P.bDe[i]); tick("tc", P.cCo[i], P.cDe[i]);
    P.eCo[i] = 0; P.eDe[i] = 0; P.lCo[i] = 0; P.lDe[i] = 0; P.bCo[i] = 0; P.bDe[i] = 0; P.cCo[i] = 0; P.cDe[i] = 0;
  }
  // monthly: memories fade with a half-life of about five months (law 35.16); expectations learn (law 59.44)
  if (d.monthEnd) {
    const cpiCity = c.gov.inflation || 0, unemp = c.last?.stats?.series?.unemployment ?? 500;
    for (const i of P.each()) {
      const o = i * 8;
      for (let k = 0; k < 8; k++) if (P.memK[o + k]) { P.memV[o + k] = Math.trunc(fade(P.memV[o + k], 1, 5.19)); if (P.memV[o + k] === 0) P.memK[o + k] = 0; }
      const t = P.traits[i], lam = (8 + trait(t, T_O) + trait(t, T_N)) / 64;
      let seen = cpiCity, prices = 0, nprices = 0;
      for (let k = 0; k < NCAT; k++) { const ref = P.ref[o + k], base = CATS[k].base; if (ref !== base) { prices += ((ref - base) * 10000) / base; nprices++; } }
      if (nprices) seen = Math.round((seen + prices / nprices / Math.max(1, c.epoch / 365)) / 2);
      P.expInf[i] = sat(Math.round(smooth(P.expInf[i], seen, lam)), -500, 2500);
      const sec = P.status[i] === 2 ? 450 + P.teLv[i] * 120 - Math.round(unemp / 12) - (P.emp[i] >= E_F0 && P.emp[i] < E_B0 && c.firms.alive[P.emp[i] - E_F0] ? c.firms.distress[P.emp[i] - E_F0] * 3 : 0) : P.status[i] === 3 ? 200 : 600;
      P.jobSec[i] = sat(Math.round(smooth(P.jobSec[i], sec, lam)), 0, 1000);
    }
  }
}

/* ------------------------------------------------------------------ the turns of life */
// the hazard ratio a person's situation sets (law 56.23): poor health, no coverage before Medicare, poverty, distress
export function hazardRatio(c, i) {
  const P = c.people, h = P.hh[i], age = ageYears(c, i);
  let lp = Math.max(0, 900 - P.health[i]) / 400;
  if (age < 65 && h >= 0 && !P.ah[i] && !c.hh.cover[h] && !c.hh.ins[h]) lp += 0.25;
  if (h >= 0 && c.hh.inc[h] < 120000 * Math.max(1, c.hh.size[h]) / 2) lp += 0.3;
  if (P.mh[i] > 700) lp += 0.2;
  return cox(lp) * (P.sex[i] === 0 ? MORTALITY.maleHR : 1);
}
export function lifeEvents(c, d, g) {
  const P = c.people, H = c.hh, e = c.epoch;
  for (const i of P.each()) {
    const years = ageYears(c, i, e), st = P.status[i], h = P.hh[i];
    // death: the day's hazard accumulates against the person's frailty (law 75.19)
    P.cumH[i] += mortality((e - P.born[i]) / 365.25, hazardRatio(c, i)) / 365.25;
    if (P.cumH[i] >= P.frail[i]) { die(c, i, d); continue; }
    // a birth when the pregnancy comes to term; a conception when a woman's wish for a child, charged at her age's
    // fertility rate and by her security, room, mood and temperament (laws 75.27 and 57.9), comes due
    if (P.gest[i] && e >= P.gest[i]) { birth(c, i, d); P.gest[i] = 0; }
    else if (P.sex[i] === 1 && !P.gest[i] && years >= 15 && years <= 49 && h >= 0 && H.home[h] >= 0) {
      P.wish[i] += (asfr(years) * fertilityMod(c, i, h) * ((c.gov.fertScale || 1e6) / 1e6)) / 365.25;
      if (P.wish[i] >= 1) { P.wish[i] -= 1; P.gest[i] = e + 270; }
    }
    // birthdays: school, work and retirement are each person's own decisions
    if ((e - P.born[i]) % 365 === 0) {
      if (years === 5 && st === 0) P.status[i] = 1;
      if (years === 18 && st === 1) {
        // college when ability and the family's means meet its cost (law 73.31)
        const t = P.traits[i], parentEdu = h >= 0 ? Math.max(...members(c, h).filter((j) => j !== i && ageYears(c, j) >= 30).map((j) => P.edu[j]), 0) : 1;
        const theta = (P.skill[i] - 400) / 150 + (trait(t, T_C) - 8) / 3 + (trait(t, T_O) - 8) / 4 + (parentEdu - 2) / 2 + (h >= 0 ? Math.min(1, H.inc[h] / 900000) : 0);
        if (rasch(theta, 0.4) >= 0) P.status[i] = 1; else { P.edu[i] = 1; P.status[i] = 3; P.occ[i] = chooseOcc(c, i, 1); }
      }
      if (years === 22 && st === 1) { P.status[i] = 3; P.edu[i] = 3; P.occ[i] = chooseOcc(c, i, 3); }
      if ((st === 2 || st === 3 || st === 4) && years >= 62) {
        // retirement when the years ahead are worth more out of work than in it (law 61.34)
        const he = E_H0 + P.hh[i], liquid = c.books.get(he, AC.SAVINGS) + c.books.get(he, AC.INVEST), t = P.traits[i];
        const uWork = P.need[i * 8 + 5] / 1000 + (st === 2 ? Math.min(1, P.wage[i] / 6000) : 0) - (1000 - P.health[i]) / 600;
        const uRet = 0.55 + Math.min(0.6, liquid / 80000000) + (years >= 67 ? 0.25 : 0) + (trait(t, T_THRIFT) - 8) / -40;
        if (years >= 70 || bellman(uRet, 0.96, 85 - years) > bellman(uWork, 0.96, Math.max(1, 70 - years)) + bellman(uRet * 0.9, 0.96, 85 - 70)) retire(c, i);
      }
    }
  }
  if (g.families && d.wd === 3) families(c, d);
}
function birth(c, m, d) {
  const P = c.people, h = P.hh[m]; if (h < 0) return;
  const f = partnerOf(c, m), sex = c.birthSex();
  const k = newPerson(c, h, 1, sex, P.family[m], 0, { parents: [m, f >= 0 && P.hh[f] === h ? f : -1] });
  if (k < 0) return;
  addMemory(c, m, M.had_a_baby, c.personRef(k)); if (f >= 0) addMemory(c, f, M.had_a_baby, c.personRef(k));
  c.event("birth", `${c.who(k)} is born to the ${c.names.person(m).split(" ")[1]} family`, [P.sin[k]]); c.familyLeave(m); c.gov.birthsYear = (c.gov.birthsYear || 0) + 1;
}
export function retire(c, i) {
  const P = c.people;
  if (P.emp[i] >= 0) c.leaveJob(i, false);
  P.status[i] = 5; P.ss[i] = Math.max(110000, Math.min(420000, Math.round(P.wage[i] * 2080 / 12 * 0.42))) || 180000;
  addMemory(c, i, M.retired);
}
export function die(c, i, d) {
  const P = c.people, h = P.hh[i], ref = c.personRef(i);
  if (P.emp[i] >= 0) c.leaveJob(i, false);
  const partner = partnerOf(c, i); if (partner >= 0) { P.partner[partner] = -1; addMemory(c, partner, M.lost_someone, ref); }
  for (let k = 0; k < 4; k++) { const f = friendOf(c, i, k); if (f >= 0) addMemory(c, f, M.lost_someone, ref, -60); }
  if (h >= 0) { for (const j of members(c, h)) if (j !== i) addMemory(c, j, M.lost_someone, ref); removeFromHousehold(c, i); if (c.hh.joint[h] && partner >= 0) c.hh.joint[h] = 0; }
  c.event("death", `${c.who(i)} dies at ${ageYears(c, i)}`, [P.sin[i]]); c.gov.deathsYear = (c.gov.deathsYear || 0) + 1;
  scrubPerson(c, i); retireSin(c, P.sin[i]);
  P.release(i);
  if (h >= 0 && c.hh.size[h] === 0) c.dissolveHousehold(h, "estate");
}
// references to a person are by number, so nothing points at the freed slot; firms record that their owner is gone
export function scrubPerson(c, i) { const g = c.people.sin[i]; for (const f of c.firms.each()) if (c.firms.owner[f] === g) c.firms.owner[f] = -1; }
// Wednesdays: ties strengthen with time spent together and fade without it (law 57.22); acquaintances become friends;
// close friends who suit each other become partners
function families(c, d) {
  const P = c.people, e = c.epoch; c.socialIndex();
  for (const i of P.each()) {
    const years = ageYears(c, i, e), h = P.hh[i]; if (h < 0 || years < 14) continue;
    const t = P.traits[i];
    // the week's company: the most like-minded coworker and neighbour this person has not befriended
    const cands = [c.coworker(i), c.neighbour(i)].filter((j) => j >= 0 && j !== i);
    for (const j of cands) {
      const gj = P.sin[j]; if ([0, 1, 2, 3].some((k) => P.friend[i * 4 + k] === gj)) continue;
      let slot = -1, weakest = 0; for (let k = 0; k < 4; k++) { if (P.acq[i * 4 + k] === gj) { slot = k; break; } } if (slot < 0) for (let k = 0; k < 4; k++) if (P.acq[i * 4 + k] < 0 || P.acqW[i * 4 + k] < P.acqW[i * 4 + weakest]) { weakest = k; if (P.acq[i * 4 + k] < 0) break; }
      if (slot < 0) { slot = weakest; P.acq[i * 4 + slot] = gj; P.acqW[i * 4 + slot] = 0; }
      const diff = [T_O, T_C, T_E, T_A].reduce((s2, k) => s2 + Math.abs(trait(t, k) - trait(P.traits[j], k)), 0), together = (3 + (trait(t, T_E) >> 2)) / 7;
      P.acqW[i * 4 + slot] = hebb(P.acqW[i * 4 + slot], together, 0.12 * (1 - diff / 40), 0.04);
      if (P.acqW[i * 4 + slot] >= 1 && befriend(c, i, j, 0.5)) { P.acq[i * 4 + slot] = -1; P.acqW[i * 4 + slot] = 0; }
    }
    // friendships strengthen when friends meet and fade when they do not
    for (let k = 0; k < 4; k++) {
      const f = friendOf(c, i, k); if (P.friend[i * 4 + k] < 0) continue;
      const met = f >= 0 && (P.emp[f] === P.emp[i] && P.emp[i] >= 0 || P.hh[f] >= 0 && c.hh.home[P.hh[f]] >= 0 && c.hh.home[h] >= 0 && c.world.dwellings.bld[c.hh.home[P.hh[f]]] === c.world.dwellings.bld[c.hh.home[h]]) ? 1 : f >= 0 ? 0.25 : 0.02;
      P.fw[i * 4 + k] = Math.min(3, hebb(P.fw[i * 4 + k], met, 0.15, 0.05));
      if (P.fw[i * 4 + k] < 0.05) { P.friend[i * 4 + k] = -1; P.fw[i * 4 + k] = 0; }
    }
    // a partnership: close friends, both single, of an age, whose temperaments suit
    if (P.partner[i] < 0 && years >= 22 && years <= 55 && P.status[i] >= 2) {
      for (let k = 0; k < 4; k++) {
        const f = friendOf(c, i, k); if (f < 0 || P.partner[f] >= 0 || P.hh[f] === h || P.fw[i * 4 + k] < 1.8) continue;
        const yf = ageYears(c, f, e); if (yf < 22 || Math.abs(yf - years) > 12) continue;
        const diff = [T_O, T_C, T_E, T_A].reduce((s2, x) => s2 + Math.abs(trait(t, x) - trait(P.traits[f], x)), 0);
        if (diff <= 12) { c.pairUp(i, f); break; }
      }
    }
  }
  c.social = null;
}

/* ------------------------------------------------------------------ the day's activities (street life and the 3D city) */
export const ACT = { HOME: 0, WORK: 1, SCHOOL: 2, SHOP: 3, DINE: 4, BAR: 5, PARK: 6, COMMUTE: 7 };
export function activities(c, d, init) {
  const P = c.people, W = c.world, fair = (c.gov.light ?? 0) >= 0 || d.weekend;
  for (const i of P.each()) {
    const h = P.hh[i]; if (h < 0) continue;
    const hc = homeCell(c, h); if (hc < 0) continue;
    const t = P.today[i], tr = P.traits[i];
    if (!(t & 1) || P.hours[i] < 9) c.addAct(hc, 0);
    if (t & 1) { const wc = c.workCell(i); if (wc >= 0) { c.addAct(wc, 3); if (P.mode[i] === 2) { c.addAct(W.stopNear[hc], 6); c.addAct(W.stopNear[wc], 6); } } }
    if (t & 4) { const sc = P.school[i] >= 0 ? W.frontCell(P.school[i]) : -1; c.addAct(sc, 3); c.addAct(sc, 5); }
    for (let k = 0; k < 3; k++) { const f = P.visit[i * 3 + k]; if (f < 0) continue; const fc = c.firmCell(f - E_F0), sec = c.firms.sector[f - E_F0]; c.addAct(fc, sec === 3 ? 4 : sec === 1 || sec === 2 ? 2 : 1); }
    // the park: when leisure runs low, on fair days, for the outgoing and the open
    if (P.need[i * 8 + 6] < 450 && fair && !(t & 1) && trait(tr, T_E) + trait(tr, T_O) >= 15) { const pc = c.parkNear(hc); if (pc >= 0) c.addAct(pc, 5); }
    // disorder: out of work, at the end of their tether, and disagreeable
    if (P.status[i] === 3 && P.stress[i] > 760 && trait(tr, T_A) < 7) c.addAct(hc, 7);
  }
  for (const p of W.spaces.each()) if (W.spaces.tenant[p] < 0 && W.spaces.kind[p] <= 1) c.addAct(W.frontCell(W.spaces.bld[p]), 7);
}
export { pickW, OCC_BY_EDU };
