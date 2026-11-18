// Health and care in Port Alder: coverage, deciding to see a clinician (or going without), waits at clinics and for
// counselling, seasonal illness passing between people, flu shots, chronic conditions, distress and mental health
// episodes, help-seeking, counselling sessions, crisis contacts, damp homes, and the premiums of employer plans.
// Every step is a person's own decision or a law of laws.js applied to their state; nothing is drawn.
// SPDX-License-Identifier: GPL-3.0-only
import { SECTORS, O as OC } from "./citydata.js";
import { monthDays } from "./rules.js";
import { E_H0, E_F0, E_ROW, E_CITY, E_FEDGOV, AC, K } from "./books.js";
import { sat } from "./core.js";
import { lif, relax, erlangC, hill, r0, nextGeneration, relHumidity, interactions, collisions, fourier, premium, cox } from "./laws.js";
import { members, ageYears, addMemory, M, trait, T_O, T_C, T_A, T_N, friendOf } from "./people.js";
import { urge, URGE, URGE_N, buy } from "./economy.js";
import { measureOn, measurePay } from "./welfare.js";

export const HEALTH_VERSION = "1.0.0";
export const HEALTH_SOURCES = {
  appleHealth: "https://www.hca.wa.gov/free-or-low-cost-health-care/i-need-medical-dental-or-vision-care",
  crisisLine: "https://988lifeline.org/",
  everettClimate: "https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals",
};
export const COVER = ["uninsured", "employer plan", "Apple Health", "Medicare", "Cascade Care"];
// Everett's (Paine Field) normal daily mean temperature, as a two-harmonic Fourier series of the year (deg C; about
// 5 C in early January, 17.5 C in early August)
export const CLIMATE = { a0: 10.9, terms: [[-6.0, -2.4], [0.4, 0.3]] };
export const tempOn = (doy) => fourier(CLIMATE.a0, CLIMATE.terms, (doy - 1) / 365.25);
const INFECTIOUS = 5, LATENT = 2, IMMUNE = 180;

export function attachHealth(c) {
  c.care = { waitGP: 0.5, waitMH: 3, claims: 0, members: 0, lambdaGP: 0, lambdaMH: 0, prevalence: 0, incidence: 0, r: 0, beta: 0 };
  c.gov.care = { visits: 0, forgone: 0, sessions: 0, crisis: 0, mobile: 0, infections: 0, vaccinated: 0, flareDays: 0, damp: 0, episodes: 0, starts: 0, mhForgone: 0, premium: 0 };
  c.seeksCare = (i, idx, drive) => seeksCare(c, i, idx, drive);
}
// a person's coverage: Apple Health, Medicare from 65, an employer plan, or none
export function coverage(c, i) { const P = c.people, h = P.hh[i]; if (P.ah[i]) return 2; if (ageYears(c, i) >= 65) return 3; if (h >= 0 && c.hh.cover[h]) return 1; if (h >= 0 && c.hh.mkt[h]) return 4; return 0; }
// the decision to see a clinician: the urge builds by its drive (slower without coverage, where cost holds people
// back) and when it comes due the person goes, unless the wait is longer than they will put up with
function seeksCare(c, i, idx, drive) {
  const P = c.people, cov = coverage(c, i), t = P.traits[i];
  if (!urge(P.urge, i * URGE_N + idx, drive * (cov === 0 ? 0.45 : cov === 2 ? 0.95 : 1))) return false;
  const urgent = idx === URGE.hospital || idx === URGE.sickVisit, tolerance = 3 + (trait(t, T_C) - 8) / 2 - (trait(t, T_N) - 8) / 3 + (urgent ? 7 : 0);
  if (idx !== URGE.hospital && c.care.waitGP > tolerance) { P.forgone[i] = Math.min(65535, P.forgone[i] + 1); c.gov.care.forgone++; addMemory(c, i, M.went_without_care); return false; }
  P.visits[i] = Math.min(65535, P.visits[i] + 1); c.gov.care.visits++; c.care.lambdaGP++;
  return true;
}
const firmsWhere = (c, key) => { const out = []; for (const f of c.firms.each()) if (c.firms.status[f] === 0 && SECTORS[c.firms.sector[f]].key === key) out.push(f); return out; };

/* ------------------------------------------------------------------ the day */
export function healthDay(c, d) {
  const P = c.people, H = c.hh, e = c.epoch, G = c.gov.care, care = c.care;
  // the season's transmissibility: indoor air is drier in the cold months (law 46.11), and respiratory viruses last longer in it
  const tOut = tempOn(d.doy), dew = Math.min(tOut - 2, 12), rhIn = relHumidity(dew, 20), beta = 0.02 * (1.7 - rhIn);
  care.beta = beta;
  // yesterday's contacts: households, workplaces, schools, venues and buses (laws 36.48 and 38.13)
  const byEmp = new Map(), bySchool = new Map(), byVenue = new Map(), byStop = new Map(), byHH = new Map();
  const add = (m, k, inf) => { const v = m.get(k) || [0, 0]; v[0]++; if (inf) v[1]++; m.set(k, v); };
  for (const i of P.each()) {
    const inf = P.inf[i] === 2, t = P.today[i], h = P.hh[i];
    if (h >= 0) add(byHH, h, inf);
    if (t & 1 && P.emp[i] >= 0 && P.emp[i] !== E_ROW) add(byEmp, P.emp[i], inf);
    if (t & 4 && P.school[i] >= 0) add(bySchool, P.school[i], inf);
    for (let k = 0; k < 3; k++) if (P.visit[i * 3 + k] >= 0) add(byVenue, P.visit[i * 3 + k], inf);
    if (t & 1 && P.mode[i] === 2 && h >= 0 && H.home[h] >= 0) add(byStop, stopOf(c, h), inf);
  }
  // the outer layers' prevalence reaches the city through commuters and visitors: the season's curve
  const outside = 0.002 + 0.02 * Math.max(0, beta / 0.02 - 1);
  let newInf = 0, infectious = 0, settings = [[0, 0], [0, 0], [0, 0], [0, 0]];
  for (const i of P.each()) {
    const h = P.hh[i], t = P.today[i], age = ageYears(c, i);
    if (P.inf[i] === 1) { if (++P.infDay[i] >= LATENT) { P.inf[i] = 2; P.infDay[i] = 0; P.sick[i] = Math.max(P.sick[i], 3 + Math.round((1000 - P.health[i]) / 250)); P.health[i] = Math.max(100, P.health[i] - 40); addMemory(c, i, M.fell_ill); } continue; }
    if (P.inf[i] === 2) { infectious++; if (++P.infDay[i] >= INFECTIOUS) { P.inf[i] = 3; P.infDay[i] = 0; P.immune[i] = IMMUNE; P.immunity[i] = Math.min(8, P.immunity[i] * 1.5 + 0.2); } continue; }
    if (P.inf[i] === 3) { if (P.immune[i] > 0) P.immune[i]--; else P.inf[i] = 0; continue; }
    // exposure charges a dose that leaks away; infection when it reaches the person's resistance (law 57.9)
    const hh = h >= 0 ? byHH.get(h) : null, em = t & 1 && P.emp[i] >= 0 ? byEmp.get(P.emp[i]) : null, sc = t & 4 && P.school[i] >= 0 ? bySchool.get(P.school[i]) : null;
    let venue = 0; for (let k = 0; k < 3; k++) { const v = P.visit[i * 3 + k] >= 0 ? byVenue.get(P.visit[i * 3 + k]) : null; if (v) venue += interactions(0.05, v[1]); }
    const bus = t & 1 && P.mode[i] === 2 && h >= 0 && H.home[h] >= 0 ? collisions(0.02, 1.5, 0.1) * (byStop.get(stopOf(c, h)) || [0, 0])[1] : 0;
    const contacts = (hh ? hh[1] * 3 : 0) + (em ? Math.min(8, em[1]) : 0) + (sc ? Math.min(6, sc[1]) * 0.8 : 0) + venue + bus + (P.away[i] && t & 1 ? outside * 10 : 0) + outside;
    if (hh) settings[0][0] += hh[1] * 3; if (em) settings[1][0] += Math.min(8, em[1]); if (sc) settings[2][0] += Math.min(6, sc[1]) * 0.8; settings[3][0] += venue + bus;
    const resist = 0.3 * P.immunity[i] * (P.vax[i] && e - P.vax[i] < 200 ? 2.2 : 1) * (P.health[i] / 800) * (age < 5 || age > 70 ? 0.8 : 1);
    P.dose[i] = lif(P.dose[i], beta * contacts, 0.5);
    // what is caught outside the city (at work outside, on trips): a charge without leak at the outer layers' prevalence
    P.imp[i] = lif(P.imp[i], beta * outside * (P.away[i] && t & 1 ? 4 : 0.6) * 0.5, 0);
    if (P.dose[i] >= resist || P.imp[i] >= 1) { if (P.imp[i] >= 1) P.imp[i] -= 1; P.dose[i] = 0; P.inf[i] = 1; P.infDay[i] = 0; newInf++; }
    // chronic conditions flare as the body's strain builds (the old daily risk, now a charge): sick for days by severity
    const winter = d.m <= 2 || d.m === 12 ? 2 : 1;
    P.flare[i] = lif(P.flare[i], ((1000 - P.health[i]) * winter + 40 + (P.stress[i] >> 3)) / 100000, 0);
    if (P.flare[i] >= 1) { P.flare[i] -= 1; P.sick[i] = Math.max(P.sick[i], 1 + Math.round((1000 - P.health[i]) / 250)); P.health[i] = Math.max(100, P.health[i] - 20); G.flareDays += P.sick[i]; }
  }
  G.infections += newInf; care.incidence = newInf; care.prevalence = P.count ? infectious / P.count : 0;
  // the season's reproduction number, from the contact structure (laws 55.16 and 55.18)
  const n = Math.max(1, infectious), K = settings.map(([x]) => [0, 1, 2, 3].map(() => (beta * x * INFECTIOUS) / n / 4));
  // the reported figure weighs today's estimate by how many are infectious against what was known before (a precision
  // weighting with the weight of thirty cases), so a handful of cases cannot swing it
  const rNow = nextGeneration(K); care.rRaw = Math.round(rNow * 1000) / 1000; care.r = Math.round((((care.r ?? rNow) * 30 + rNow * infectious) / (30 + infectious)) * 1000) / 1000; care.r0 = Math.round(r0(beta, 12, INFECTIOUS) * 1000) / 1000;
  // flu shots in the autumn: a decision that builds with age, prudence, trust in the city and coverage
  if (d.m >= 9 && d.m <= 12) {
    const ph = firmsWhere(c, "pharmacy");
    for (const i of P.each()) {
      if (P.vax[i] && e - P.vax[i] < 200) continue; const t = P.traits[i], age = ageYears(c, i), h = P.hh[i]; if (h < 0) continue;
      const drive = (age >= 65 ? 0.05 : age < 5 ? 0.03 : 0.012) * Math.max(0, 1 + (trait(t, T_C) - 8) / 8 + (P.tcLv[i] - 1) / 3 + (coverage(c, i) ? 0.3 : -0.3));
      if (!urge(P.urge, i * URGE_N + URGE.vaccine, drive) || !ph.length) continue;
      if (buy(c, h, i, ph[0], 1, 4)) { P.vax[i] = e; G.vaccinated++; }
    }
  }
  mentalHealth(c, d);
}
const stopOf = (c, h) => c.world.stopNear[c.world.frontCell(c.world.dwellings.bld[c.hh.home[h]])];

/* ------------------------------------------------------------------ distress, help and counselling */
function mentalHealth(c, d) {
  const P = c.people, e = c.epoch, G = c.gov.care, care = c.care, crisisOn = c.gov.measures ? measureOn(c, "crisis") : false;
  const clinics = firmsWhere(c, "clinic");
  for (const i of P.each()) {
    const o = i * 8, t = P.traits[i], N = trait(t, T_N), h = P.hh[i]; if (h < 0 || ageYears(c, i) < 12) continue;
    // distress relaxes toward what the person is carrying: strain, loneliness, lost purpose, temperament, mood
    const target = sat(0.75 * P.stress[i] + 0.3 * (1000 - P.need[o + 4]) + 0.2 * (1000 - P.need[o + 5]) + 0.15 * (1000 - P.need[o + 7]) + (N - 8) * 50 - P.val[i] / 4 - 60, 0, 1000);
    P.mh[i] = Math.round(relax(P.mh[i], target, 10));
    if (P.mh[i] > 700) { P.mhDays[i] = Math.min(65535, P.mhDays[i] + 1); if (P.mhDays[i] >= 14 && !P.mhEp[i]) { P.mhEp[i] = 1; G.episodes++; } }
    else if (P.mh[i] < 550) { P.mhDays[i] = 0; P.mhEp[i] = 0; }
    // asking for help builds with distress, openness, agreeableness, trust, coverage and friends who have done it
    if (P.mh[i] > 600 && !P.mhTx[i]) {
      let friendsHelped = 0; for (let k = 0; k < 4; k++) { const f = friendOf(c, i, k); if (f >= 0 && P.mhYtd[f] > 0) friendsHelped++; }
      const drive = ((P.mh[i] - 600) / 2500) * Math.max(0, 1 + (trait(t, T_O) - 8) / 8 + (trait(t, T_A) - 8) / 16 + (P.tcLv[i] - 1) / 4 + (coverage(c, i) ? 0.3 : -0.4) + friendsHelped * 0.3);
      if (urge(P.urge, i * URGE_N + URGE.counselling, drive)) {
        if (care.waitMH <= 14 + (trait(t, T_C) - 8)) { P.mhTx[i] = 8; P.mhNext[i] = e + 7; G.starts++; addMemory(c, i, M.started_counselling); }
        else { P.forgone[i] = Math.min(65535, P.forgone[i] + 1); G.mhForgone++; addMemory(c, i, M.went_without_care); }
      }
    }
    // a session a week while counselling lasts: each helps by the dose-response curve (law 50.8)
    if (P.mhTx[i] && e >= P.mhNext[i]) {
      const done = 8 - P.mhTx[i], gain = 600 * (hill(done + 1, 8, 1) - hill(done, 8, 1));
      const f = clinics.length ? clinics[0] : -1;
      if (f >= 0 && buy(c, h, i, f, 1, 4)) { P.mh[i] = Math.max(0, Math.round(P.mh[i] - gain)); P.mhYtd[i] = Math.min(65535, P.mhYtd[i] + 1); G.sessions++; care.lambdaMH++; P.mhTx[i]--; P.mhNext[i] = e + 7; }
      else { P.mhTx[i] = 0; G.mhForgone++; }
    }
    // a crisis: the 988 line; where the voters funded it, a mobile crisis team comes
    if (P.mh[i] >= 920 && (P.crisis[i] === 0 || e % 30 === 0)) {
      P.crisis[i] = Math.min(65535, P.crisis[i] + 1); G.crisis++; addMemory(c, i, M.reached_out_in_a_crisis);
      if (crisisOn && measurePay(c, "crisis", E_ROW, 50000, AC.R_SALES)) { P.mh[i] = Math.max(0, P.mh[i] - 150); G.mobile++; } else P.mh[i] = Math.max(0, P.mh[i] - 60);
    }
  }
}

// which employers offer a plan: firms that do (the large, and the professional, hospital, factory and clinic trades), the
// city, the school district and the banks, and the outer employers in sectors that mostly do
const OUTER_COVERS = new Set([0, 1, 5, 6, 7, 8, 9, 10, 12, 13]);
export function employerCovers(c, i) { const P = c.people, E = P.emp[i]; if (E >= E_F0 && E < E_F0 + c.firms.cap) return !!c.firms.cover[E - E_F0]; if (E === E_ROW) { const f = P.away[i] - 1; return f >= 0 && OUTER_COVERS.has(c.outer?.F.sector[f]); } return E >= 0; }
// Cascade Care, Washington's marketplace: a household with members no other plan covers decides whether to buy a silver
// plan. The benchmark premium rises with age on the federal 3:1 curve; between 100% and 400% of the poverty line the
// premium tax credit holds the household's share to 2.10%-9.96% of income (the 2026 applicable percentages, Rev. Proc.
// 2025-25); the household buys when its share is within what its means, health, age, temper and children make it
// willing to pay (and keeps it while it stays within a little more)
const AGE_CURVE = [[0, 0.765], [21, 1.0], [25, 1.004], [30, 1.135], [35, 1.222], [40, 1.278], [45, 1.413], [50, 1.786], [55, 2.23], [60, 2.714], [64, 3.0]];
const ageFactor = (a) => { for (let k = 1; k < AGE_CURVE.length; k++) if (a < AGE_CURVE[k][0]) { const [a0, f0] = AGE_CURVE[k - 1], [a1, f1] = AGE_CURVE[k]; return f0 + ((f1 - f0) * (a - a0)) / (a1 - a0); } return 3.0; };
const APPLICABLE = [[1.0, 0.021], [1.33, 0.0314], [1.5, 0.0419], [2.0, 0.066], [2.5, 0.0844], [3.0, 0.0996], [4.0, 0.0996]];
const applicable = (r) => { for (let k = 1; k < APPLICABLE.length; k++) if (r <= APPLICABLE[k][0]) { const [r0, p0] = APPLICABLE[k - 1], [r1, p1] = APPLICABLE[k]; return p0 + ((p1 - p0) * (r - r0)) / (r1 - r0); } return -1; };
const BENCHMARK_21 = 44000;                                               // cents a month for a 21-year-old's benchmark silver plan
export function marketMonth(c) {
  const P = c.people, H = c.hh, B = c.books; let enrolled = 0;
  for (const h of H.each()) {
    if (!H.size[h] || H.cover[h]) { if (H.mkt[h]) { H.mkt[h] = 0; H.mktPrem[h] = 0; } continue; }
    let bench = 0, sick = false, oldest = 0, kids = 0;
    for (const i of members(c, h)) { const a = ageYears(c, i); if (P.ah[i] || a >= 65) continue; bench += Math.round(BENCHMARK_21 * ageFactor(a)); if (P.health[i] < 650) sick = true; if (a < 18) kids++; oldest = Math.max(oldest, a); }
    if (!bench) { H.mkt[h] = 0; H.mktPrem[h] = 0; continue; }
    const gross = Math.round((H.inc[h] * 12) / 0.82), r = gross / Math.max(1, 1596000 + 568000 * Math.max(0, H.size[h] - 1)), pct = r >= 1 ? applicable(r) : -1;
    const share = pct >= 0 ? Math.min(bench, Math.round((gross * pct) / 12)) : bench, credit = bench - share;
    const head = H.head[h], t = head >= 0 ? P.traits[head] : 0x88888888;
    const willing = Math.max(0.02, Math.min(0.16, 0.06 + (trait(t, T_C) - 8) * 0.004 + (trait(t, T_N) - 8) * 0.004 + (sick ? 0.04 : 0) + (oldest >= 50 ? 0.03 : 0) + (kids ? 0.03 : 0))) * (H.mkt[h] ? 1.3 : 1);
    if (share > (H.inc[h] * willing) && share > 3000) { H.mkt[h] = 0; H.mktPrem[h] = 0; continue; }
    const he = E_H0 + h; if (!c.fund(he, share, true)) { H.mkt[h] = 0; H.mktPrem[h] = 0; continue; }
    B.pay(he, E_ROW, share, AC.X_HEALTH, AC.R_FEES, K.fee); if (credit > 0) B.pay(E_FEDGOV, E_ROW, credit, AC.X_TRANSFER, AC.R_FEES, K.benefit);
    if (!H.mkt[h]) for (const i of members(c, h)) addMemory(c, i, M.got_health_coverage, E_FEDGOV);
    H.mkt[h] = 1; H.mktPrem[h] = share; enrolled++;
  }
  c.gov.care.marketplace = enrolled;
}
export function coverageMonth(c) { const P = c.people, H = c.hh; for (const h of H.each()) { let cov = 0; for (const i of members(c, h)) if ((P.status[i] === 2 || P.status[i] === 6) && employerCovers(c, i)) { cov = 1; break; } H.cover[h] = cov; } }

/* ------------------------------------------------------------------ the month */
export function healthMonth(c, d) {
  const P = c.people, H = c.hh, F = c.firms, B = c.books, care = c.care, G = c.gov.care;
  // waits: clinicians at clinics and the hospital see about 16 people a day; counsellors about 7 sessions (law 18.20)
  let gp = 0, mh = 0; for (const i of P.each()) { const em = P.emp[i]; if (em >= E_F0 && em < E_F0 + F.cap && F.alive[em - E_F0]) { const key = SECTORS[F.sector[em - E_F0]].key; if (P.occ[i] === OC.clinician && (key === "clinic" || key === "hospital")) gp++; if (key === "clinic" && (P.occ[i] === OC.care || P.occ[i] === OC.clinician)) mh++; } }
  const days = monthDays(d.y, d.m), lg = care.lambdaGP / days, lm = care.lambdaMH / days + 0.5;
  care.waitGP = Math.min(60, erlangC(lg, 16, Math.max(1, gp)).wait * 1 + 0.5); care.waitMH = Math.min(90, erlangC(lm, 7, Math.max(1, Math.round(mh * 0.4))).wait + 2);
  care.lambdaGP = 0; care.lambdaMH = 0;
  // disability follows the body: a long fall in health becomes a limitation that lasts (it does not heal within these years)
  for (const i of P.each()) { const lim = Math.round((620 - P.health[i]) * 2.5); if (lim > P.dis[i]) P.dis[i] = Math.min(1000, lim); }
  // employer plans: the employee's share of the premium that covers the pool's expected claims (law 72.22)
  let members = 0; for (const h of H.each()) if (H.cover[h]) members += H.size[h];
  const prem = Math.round(premium(care.claims * 12, Math.max(1, members), 0.12) / 12), share = Math.round(prem * 0.2);
  G.premium = prem; care.claims = 0; care.members = members;
  marketMonth(c);
  for (const h of H.each()) if (H.cover[h] && share > 0) { const amt = share * H.size[h]; if (c.fund(E_H0 + h, amt, true)) { B.pay(E_H0 + h, E_ROW, amt, AC.X_HEALTH, AC.R_FEES, K.fee); H.prem[h] = amt; } }
  // damp homes: households who cannot keep warm in poor buildings, in the cold months, grow mould (law 46.11)
  if (d.m <= 3 || d.m >= 11) {
    const tOut = tempOn(d.doy); let damp = 0;
    for (const h of H.each()) {
      if (H.home[h] < 0) continue; const b = c.world.dwellings.bld[H.home[h]], cold = c.world.buildings.cond[b] < 500 && H.heat[h] > 0 && H.heat[h] * 1000 > Math.max(1, H.inc[h]) * 60;
      const indoor = cold ? 15 : 20, rh = relHumidity(Math.min(tOut - 1, 11), indoor);
      if (rh > 0.7) { H.mbits[h] |= 64; damp++; } else H.mbits[h] &= ~64;
    }
    G.damp = damp;
  } else for (const h of H.each()) H.mbits[h] &= ~64;
}
