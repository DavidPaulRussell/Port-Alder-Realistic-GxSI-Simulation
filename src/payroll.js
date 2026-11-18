// Timecards, payroll, payroll taxes and premiums, excise and property taxes, benefits and the annual
// federal return, on the 2026 Washington and United States rules in rules.js.
// SPDX-License-Identifier: GPL-3.0-only
import { ppm, mulDiv, divRound, withholding, federalReturn, federalYear, boRate, BO, CITY_BIZ, LEVY, PROPERTY_DUE, uiWeekly, UI_WEEKS, pfmlWeekly, ssPayDay, epochOf, dayInfo, isPayday } from "./rules.js";
import { SECTORS, S as SK } from "./citydata.js";
import { AC, K, E_H0, E_F0, E_B0, E_CITY, E_SCHOOL, E_STATE, E_FEDGOV, E_FED, E_ROW, holdKind } from "./books.js";
import { sat } from "./core.js";
import { members, ageYears, addMemory, M, trait, T_C, T_N, T_CIVIC } from "./people.js";

const LNI_EMPLOYEE = 250000;                 // the worker's share of the workers' compensation premium (illustrative)
export function attachPayroll(c) {
  c.claimUI = (i, emp) => claimUI(c, i, emp);
  c.familyLeave = (i) => familyLeave(c, i);
}

/* ------------------------------------------------------------------ timecards, every day */
function timecards(c, d) {
  const P = c.people, F = c.firms;
  if (d.wd === 0) for (const i of P.each()) P.wk[i] = 0;          // the workweek runs Sunday to Saturday
  for (const i of P.each()) {
    const t = P.today[i];
    if (t & 8) continue;                                           // paid sick leave was booked in the morning
    if (!(t & 1)) continue;
    let qh = P.hours[i] * 4;
    const em = P.emp[i];
    if (em >= E_F0 && em < E_B0) { const f = em - E_F0; if (F.lost[f] * 6 > F.sold[f] + 6 && !P.sal[i] && P.hours[i] >= 8) qh += 4 + (trait(P.traits[i], T_C) >= 10 ? 4 : 0); }   // the conscientious stay longer
    if (P.sal[i]) { P.wk[i] += qh; continue; }
    const before = P.wk[i], after = before + qh, ot = Math.max(0, after - Math.max(before, 160));
    P.preg[i] += qh - ot; P.pot[i] += ot; P.wk[i] = after;
  }
}

/* ------------------------------------------------------------------ payroll on paydays */
export function payrollDay(c, d, g) {
  timecards(c, d);
  if (!isPayday(c.epoch)) return;
  const P = c.people, F = c.firms, B = c.books, pay = c.yearRules(d.y).pay, fed = c.yearRules(d.y).fed;
  const headcount = new Map(); for (const i of P.each()) if (P.emp[i] >= 0) headcount.set(P.emp[i], (headcount.get(P.emp[i]) || 0) + 1);
  const twoEarners = new Uint8Array(c.hh.top); for (const h of c.hh.each()) { let n = 0; for (const i of members(c, h)) if (P.emp[i] >= 0) n++; twoEarners[h] = n > 1 ? 1 : 0; }
  let gross = 0, paid = 0, failed = 0;
  const failedEmp = new Set();
  // employers pay in entity order, workers in slot order
  const order = []; for (const i of P.each()) if (P.emp[i] >= 0 && P.hh[i] >= 0) order.push(i);
  order.sort((a, b) => P.emp[a] - P.emp[b] || a - b);
  for (const i of order) {
    const E = P.emp[i], h = P.hh[i], he = E_H0 + h;
    if (failedEmp.has(E)) continue;
    const onLeave = P.status[i] === 6;
    const wage = P.wage[i], reg = P.preg[i] + P.psick[i], ot = P.pot[i];
    let g0 = P.sal[i] ? (onLeave ? 0 : divRound(wage * 2080, 26)) : mulDiv(wage, reg, 4) + mulDiv(wage * 3, ot, 8);
    const tips = P.ptips[i], premium = P.sal[i] ? 0 : mulDiv(wage, ot, 8);
    if (g0 <= 0 && tips <= 0) { resetPeriod(P, i); continue; }
    const taxable = g0 + tips, status = c.hh.joint[h] ? "joint" : "single";
    // employee withholding
    const ssRoom = Math.max(0, pay.ssBase - P.empW[i]), ss = ppm(Math.min(taxable, ssRoom), pay.ss);
    const med = ppm(taxable, pay.medicare) + ppm(Math.max(0, P.empW[i] + taxable - Math.max(P.empW[i], pay.addMedicareOver)), pay.addMedicare);
    let fit = withholding(fed, taxable, 26, status, twoEarners[h] === 1);
    const pfmlBase = Math.min(g0, Math.max(0, pay.ssBase - P.empWnt[i])), prem = ppm(pfmlBase, pay.pfml), pfmlEe = ppm(prem, pay.pfmlEmployee);
    const cares = ppm(g0, pay.waCares);
    const sector = E >= E_F0 && E < E_B0 ? F.sector[E - E_F0] : -1, lniRate = sector >= 0 ? SECTORS[sector].lni : E === E_CITY ? 120 : E === E_SCHOOL ? 40 : 20;
    const lni = mulDiv(lniRate, P.preg[i] + ot, 4), lniEe = ppm(lni, LNI_EMPLOYEE);
    let withheldFed = fit + ss + med, withheldState = pfmlEe + cares + lniEe;
    if (withheldFed + withheldState > g0) { fit = Math.max(0, g0 - (ss + med + withheldState)); withheldFed = fit + ss + med; if (withheldFed + withheldState > g0) { withheldFed = Math.max(0, g0 - withheldState); fit = 0; } }
    const net = g0 - withheldFed - withheldState;
    // employer taxes
    const ssEr = ss, medEr = ppm(taxable, pay.medicare), gov = E === E_CITY || E === E_SCHOOL;
    const futa = gov ? 0 : ppm(Math.min(g0, Math.max(0, pay.futaBase - P.empWnt[i])), pay.futa);
    const uiRate = (E >= E_F0 && E < E_B0 ? F.uiRate[E - E_F0] : 9000) + pay.uiSocial + pay.uiSolvency;
    const ui = ppm(Math.min(g0, Math.max(0, pay.uiBase - P.empWnt[i])), uiRate);
    const pfmlEr = (headcount.get(E) || 0) >= pay.pfmlEmployerAt ? prem - pfmlEe : 0, lniEr = lni - lniEe;
    const erFed = ssEr + medEr + futa, erState = ui + pfmlEr + lniEr;
    if (!c.fund(E, net + 0, true)) { failedEmp.add(E); failed++; continue; }
    B.pay(E, he, net, AC.X_WAGES, AC.R_WAGES, K.wage);
    B.post(E, AC.X_WAGES, AC.FED_PAYROLL_PAY, withheldFed, K.wage, E_FEDGOV); B.post(E, AC.X_WAGES, AC.STATE_PAYROLL_PAY, withheldState, K.wage, E_STATE);
    B.post(he, AC.X_TAX_INCOME, AC.R_WAGES, fit, K.wage, E); B.post(he, AC.X_TAX_PAYROLL, AC.R_WAGES, withheldFed - fit + withheldState, K.wage, E);
    B.post(E_FEDGOV, AC.TAXR_FED, AC.R_INCOME_TAX, fit, K.tax_accrual, E); B.post(E_FEDGOV, AC.TAXR_FED, AC.R_PAYROLL_FED, withheldFed - fit + erFed, K.tax_accrual, E);
    B.post(E_STATE, AC.TAXR_PAYROLL, AC.R_PAYROLL_STATE, withheldState + erState, K.tax_accrual, E);
    B.post(E, AC.X_PAYROLL_TAX, AC.FED_PAYROLL_PAY, erFed, K.tax_accrual, E_FEDGOV); B.post(E, AC.X_PAYROLL_TAX, AC.STATE_PAYROLL_PAY, erState, K.tax_accrual, E_STATE);
    // employer health cover: a premium to the insurers in the rest of the world (illustrative)
    if (E >= E_F0 && E < E_B0 && F.cover[E - E_F0] && c.fund(E, 32000, true)) { B.pay(E, E_ROW, 32000, AC.X_BENEFITS, AC.R_SALES, K.purchase); c.hh.cover[h] = 1; }
    else if (gov || (E >= E_B0 && E < E_CITY)) c.hh.cover[h] = 1;
    // the year's records, the quarter's wages for unemployment insurance, sick leave accrual
    P.ytdW[i] += g0; P.ytdT[i] += tips; P.ytdOT[i] += premium; P.ytdFIT[i] += fit; P.ytdSS[i] += ss; P.ytdMed[i] += med; P.empW[i] += taxable; P.empWnt[i] += g0;
    P.qw[i * 5 + (d.quarter - 1 + (d.y - 2026) * 4) % 5] += g0 + tips;
    P.sickBal[i] = Math.min(4 * 120, P.sickBal[i] + Math.floor((P.preg[i] + ot) / 40));
    P.eCo[i]++;
    gross += g0; paid++;
    resetPeriod(P, i);
  }
  for (const E of failedEmp) {
    if (E >= E_F0 && E < E_B0) { const f = E - E_F0; F.status[f] = 2; c.event("payroll", `${c.names.firm(f)} misses its payroll`, [E]); for (const i of P.each()) if (P.emp[i] === E) { P.eDe[i] += 4; addMemory(c, i, 4, E, -80); } }
  }
  c.R.payroll = { gross, paid, failed };
  c.gov.avgWage = paid ? Math.round(gross / paid) : c.gov.avgWage;
}
function resetPeriod(P, i) { P.preg[i] = 0; P.pot[i] = 0; P.psick[i] = 0; P.ptips[i] = 0; }

/* ------------------------------------------------------------------ unemployment, family leave and Social Security */
function claimUI(c, i, emp) {
  const P = c.people, d = c.today, now = (d.quarter - 1 + (d.y - 2026) * 4);
  const q = []; for (let k = 1; k <= 4; k++) q.push(P.qw[i * 5 + ((now - k) % 5 + 5) % 5]);
  const base = q.reduce((a, b) => a + b, 0) + P.qw[i * 5 + now % 5];
  if (base < 500000) return;
  q.push(P.qw[i * 5 + now % 5]); q.sort((a, b) => b - a);
  P.ui[i] = uiWeekly(q[0], q[1], d.y, c.nation); P.uiLeft[i] = UI_WEEKS; P.uiWait[i] = 1; P.uiEmp[i] = emp;
}
function familyLeave(c, i) {
  const P = c.people; if (P.emp[i] < 0 || c.epoch - P.hired[i] < 180) return;
  P.status[i] = 6; P.leaveTo[i] = c.epoch + 84;
}
function benefits(c, d) {
  const P = c.people, B = c.books, F = c.firms, e = c.epoch;
  let ui = 0, pf = 0, ss = 0;
  if (d.wd === 0) for (const i of P.each()) {
    const h = P.hh[i]; if (h < 0) continue; const he = E_H0 + h;
    if (P.uiLeft[i] > 0 && P.status[i] === 3) {
      if (P.uiWait[i]) P.uiWait[i]--;
      else { B.pay(E_STATE, he, P.ui[i], AC.X_TRANSFER, AC.R_TRANSFER, K.benefit); P.uiLeft[i]--; P.ytdUI[i] += P.ui[i]; ui += P.ui[i]; const em = P.uiEmp[i]; if (em >= E_F0 && em < E_B0) F.uiCharge[em - E_F0] += P.ui[i]; }
    } else if (P.status[i] !== 3) P.uiLeft[i] = 0;
    if (P.status[i] === 6) {
      const q = []; for (let k = 0; k < 5; k++) q.push(P.qw[i * 5 + k]); q.sort((a, b) => b - a);
      const aww = divRound(q[0] + q[1], 26), wb = pfmlWeekly(aww, c.gov.stateAww || 191900);
      if (wb > 0) { B.pay(E_STATE, he, wb, AC.X_TRANSFER, AC.R_TRANSFER, K.benefit); pf += wb; }
    }
  }
  // Social Security: the 2nd, 3rd or 4th Wednesday by birth day
  if (d.wd === 3) {
    const wed = Math.floor((d.d - 1) / 7) + 1;
    for (const i of P.each()) { if (!P.ss[i] || P.hh[i] < 0) continue; if (ssPayDay(d.y, d.m, P.bday[i]) !== d.d) continue; B.pay(E_FEDGOV, E_H0 + P.hh[i], P.ss[i], AC.X_TRANSFER, AC.R_TRANSFER, K.benefit); ss += P.ss[i]; }
  }
  // pensions and annuities from former employers' plans (held outside the city) are paid on the first; most are
  // modest, and with Social Security they fall within a retiree's standard deduction (with the 2025-28 senior
  // deduction), so no tax is withheld
  if (d.d === 1) for (const i of P.each()) if (P.pen[i] && P.hh[i] >= 0) B.pay(E_ROW, E_H0 + P.hh[i], P.pen[i], AC.X_TRANSFER, AC.R_OTHER, K.transfer);
  c.R.benefits = { ui, pfml: pf, ss };
}

/* ------------------------------------------------------------------ taxes due on their days */
export function taxesDay(c, d, g) {
  const B = c.books, e = c.epoch;
  if (d.m === 1 && d.d === 1) newYear(c, d);
  benefits(c, d);
  const payAll = (acct, recv, gov, kind) => {
    for (let ent = 0; ent < E_CITY + 2; ent++) {
      const due = -B.get(ent, acct); if (due <= 0) continue;
      if (c.fund(ent, due, true)) B.pay(ent, gov, due, acct, recv, kind);
    }
  };
  // federal payroll deposits on the 15th; the excise return (sales tax and B&O) on the 25th
  if (d.d === 15) payAll(AC.FED_PAYROLL_PAY, AC.TAXR_FED, E_FEDGOV, K.tax_payment);
  if (d.d === 25) { payAll(AC.SALES_TAX_PAY, AC.TAXR_SALES, E_STATE, K.tax_payment); payAll(AC.BO_PAY, AC.TAXR_BO, E_STATE, K.tax_payment); }
  // the quarterly reports to ESD and L&I, and the city's business tax, at the end of the month after each quarter
  if (d.monthEnd && (d.m === 1 || d.m === 4 || d.m === 7 || d.m === 10)) { payAll(AC.STATE_PAYROLL_PAY, AC.TAXR_PAYROLL, E_STATE, K.tax_payment); payAll(AC.CITYBIZ_PAY, AC.TAXR_CITYBIZ, E_CITY, K.tax_payment); }
  // property tax halves on 30 April and 31 October
  for (const [m, dd] of PROPERTY_DUE) if (d.m === m && d.d === dd) propertyInstalment(c, d);
  // the federal return: households file between February and mid-April
  if ((d.m >= 2 && d.m <= 4) && c.returns) for (const h of c.hh.each()) if (c.hh.fileOn[h] === e) fileReturn(c, h);
  if (d.m === 4 && d.d === 15 && c.returns) for (const h of c.hh.each()) if (c.returns.has(h)) fileReturn(c, h);
  // instalment agreements: a twelfth of what is owed each month
  if (d.d === 20) for (const h of c.hh.each()) { const he = E_H0 + h, owed = -B.get(he, AC.INCOME_TAX_PAY); if (owed > 0) { const amt = Math.min(owed, Math.max(5000, Math.ceil(owed / 12))); if (c.fund(he, amt)) B.pay(he, E_FEDGOV, amt, AC.INCOME_TAX_PAY, AC.TAXR_INCOME, K.tax_payment); } }
}
function newYear(c, d) {
  const P = c.people, F = c.firms, B = c.books;
  for (const i of P.each()) { P.ytdW[i] = 0; P.ytdT[i] = 0; P.ytdOT[i] = 0; P.ytdFIT[i] = 0; P.ytdSS[i] = 0; P.ytdMed[i] = 0; P.empW[i] = 0; P.empWnt[i] = 0; P.ytdUI[i] = 0; }
  // Social Security cost-of-living adjustment; the minimum wage floor
  const cola = c.nation.colaPpm(d.y), mw = Math.max(c.yearRules(d.y).pay.minWage, c.gov.localMinWage || 0);
  for (const i of P.each()) { if (P.ss[i]) P.ss[i] += ppm(P.ss[i], cola); if (P.emp[i] >= 0 && !P.sal[i] && P.wage[i] < mw) { P.wage[i] = mw; addMemory(c, i, M.got_a_raise); } }
  if (d.y > 2026) c.event("rules", `New year: minimum wage $${(mw / 100).toFixed(2)}, Social Security base $${(c.yearRules(d.y).pay.ssBase / 100).toLocaleString("en-US")}, COLA ${(cola / 10000).toFixed(1)}%`);
  // unemployment insurance experience: benefits charged against taxable payroll
  for (const f of F.each()) { const pr = Math.max(1, F.lyGross[f] * 0.35); F.uiRate[f] = sat(Math.round(2700 + (F.uiCharge[f] * 1e6) / pr * 0.6), 2700, 54000); F.uiCharge[f] *= 0.75; F.lyGross[f] = F.ytdGross[f]; F.ytdGross[f] = 0; }
  for (const k of c.banks) { k.lyGross = k.ytdGross || 0; k.ytdGross = 0; }
  c.gov.stateAww = Math.round(191900 * c.nation.awiRatio(2025, d.y - 1) / 65536);
  levyPropertyTax(c, d);
}

/* ------------------------------------------------------------------ property tax */
export function propertyTaxOf(c, value) {
  const city = c.gov.cityLevy ?? LEVY.city;
  return { state: ppm(value, LEVY.state), city: ppm(value, city), school: ppm(value, c.gov.schoolLevy ?? LEVY.school) };
}
// The Senior Citizens and People with Disabilities Exemption (RCW 84.36.381): an owner living in the home, 61 or older
// or retired by a disability, with household income at or under the county's thresholds, pays no excess levies (the
// local school levy here) and, at the lower two levels, no regular levies on part of the value. Snohomish County's
// ceiling is $75,000 for 2024-2026 and $91,000 for 2027-2029 (SHB 6162). The household decides to apply.
const SENIOR_T = (y) => (y <= 2026 ? [4690700, 5842300, 7500000] : [5691700, 7088900, 9100000]);   // cents a year
function seniorLevel(c, h, d, y) {
  const H = c.hh, P = c.people; if (H.home[h] !== d || H.tenure[h] !== 1) return 0;
  let ok = false; for (const i of members(c, h)) { const a = ageYears(c, i); if (a >= 61 || (a >= 18 && P.dis[i] >= 160 && P.status[i] !== 2)) ok = true; } if (!ok) return 0;
  const head = H.head[h]; if (head < 0 || trait(P.traits[head], T_C) + trait(P.traits[head], T_CIVIC) < 12) return 0;
  const inc = Math.round((H.inc[h] * 12) / 0.82), [t1, t2, t3] = SENIOR_T(y);
  return inc <= t1 ? 1 : inc <= t2 ? 2 : inc <= t3 ? 3 : 0;
}
function levyPropertyTax(c, d) {
  const W = c.world, T = W.buildings, D = W.dwellings, B = c.books;
  const owe = new Map(); c.gov.seniorExempt = 0;
  const add = (ent, value, level = 0) => {
    if (ent < 0 || ent === E_CITY || ent === E_SCHOOL) return; const t = owe.get(ent) || { state: 0, city: 0, school: 0 };
    const off = Math.round(level === 1 ? Math.min(value, Math.max(6000000, value * 0.6)) : level === 2 ? Math.min(value, 7000000, Math.max(5000000, value * 0.35)) : 0);
    value = Math.round(value);
    const x = propertyTaxOf(c, value - off); t.state += x.state; t.city += x.city; t.school += level ? 0 : x.school; owe.set(ent, t);
  };
  // homes owned by households pay on their own unit; everything else pays through the building's owner
  const unitShare = new Map();
  for (const dd of D.each()) { const o = D.owner[dd]; if (o >= 0 && o < E_F0) { const lv = seniorLevel(c, o - E_H0, dd, d.y); if (lv) c.gov.seniorExempt++; add(o, D.value[dd], lv); unitShare.set(D.bld[dd], (unitShare.get(D.bld[dd]) || 0) + D.value[dd]); } }
  for (const b of T.each()) add(T.owner[b], Math.max(0, T.value[b] - (unitShare.get(b) || 0)));
  let total = 0;
  for (const [ent, t] of [...owe.entries()].sort((a, b) => a[0] - b[0])) {
    const sum = t.state + t.city + t.school; if (!sum) continue; total += sum;
    B.post(ent, AC.X_TAX_PROP, AC.PROP_TAX_PAY, sum, K.property, E_STATE);
    B.post(E_STATE, AC.TAXR_PROP, AC.R_PROP_TAX, t.state, K.property, ent); B.post(E_CITY, AC.TAXR_PROP, AC.R_PROP_TAX, t.city, K.property, ent); B.post(E_SCHOOL, AC.TAXR_PROP, AC.R_PROP_TAX, t.school, K.property, ent);
  }
  c.levy = owe; c.gov.levyTotal = total;
}
function propertyInstalment(c, d) {
  const B = c.books, owe = c.levy; if (!owe) return;
  const second = d.m === 10;
  for (const [ent, t] of [...owe.entries()].sort((a, b) => a[0] - b[0])) {
    const due = -B.get(ent, AC.PROP_TAX_PAY); if (due <= 0) continue;
    const parts = [[E_STATE, t.state], [E_CITY, t.city], [E_SCHOOL, t.school]];
    for (const [gov, full] of parts) {
      const half = second ? full - Math.floor(full / 2) : Math.floor(full / 2), amt = Math.min(half, due);
      if (amt > 0 && c.fund(ent, amt, ent >= E_F0)) B.pay(ent, gov, amt, AC.PROP_TAX_PAY, AC.TAXR_PROP, K.property);
    }
  }
}

/* ------------------------------------------------------------------ the month and the year */
export function taxesMonth(c, d, g) {
  const B = c.books, F = c.firms, y = d.y;
  // B&O on the month's gross receipts, by classification and prior-year income
  let bo = 0;
  for (const f of F.each()) {
    const rev = Math.round(F.mRev[f]); if (rev <= 0) continue;
    const rate = boRate(F.boClass[f], y, F.lyGross[f]), tax = ppm(rev, rate); if (!tax) continue;
    B.accrue(E_F0 + f, E_STATE, tax, AC.X_TAX_BIZ, AC.BO_PAY, AC.TAXR_BO, AC.R_BO); bo += tax;
  }
  c.banks.forEach((k, j) => { if (k.cu) return; const be = E_B0 + j, inc = -B.get(be, AC.R_INTEREST) - (k.lastInt || 0); k.lastInt = -B.get(be, AC.R_INTEREST); k.ytdGross = (k.ytdGross || 0) + Math.max(0, inc); const tax = ppm(Math.max(0, inc), boRate(BO.FINANCIAL, y, k.lyGross || 0)); if (tax > 0) { B.accrue(be, E_STATE, tax, AC.X_TAX_BIZ, AC.BO_PAY, AC.TAXR_BO, AC.R_BO); bo += tax; } });
  // the city's business licence tax, accrued quarterly on receipts above its threshold
  if (d.m % 3 === 0) for (const f of F.each()) {
    const quarterGross = Math.round(F.ytdGross[f] - (c.qmark?.get(f) || 0));
    c.qmark = c.qmark || new Map(); c.qmark.set(f, F.ytdGross[f]);
    const taxable = Math.max(0, quarterGross - CITY_BIZ.exemptAnnual / 4), tax = ppm(taxable, CITY_BIZ.rate);
    if (tax > 0) B.accrue(E_F0 + f, E_CITY, tax, AC.X_TAX_BIZ, AC.CITYBIZ_PAY, AC.TAXR_CITYBIZ, AC.R_CITYBIZ);
  }
  if (d.m === 12) c.qmark = new Map();
  // the State distributes the local sales tax it owes the city
  const dist = -B.get(E_STATE, AC.DIST_PAY); if (dist > 0) B.pay(E_STATE, E_CITY, dist, AC.DIST_PAY, AC.DIST_RECV, K.transfer);
  c.R.taxesMonth = { bo, distributed: dist };
}
export function taxesYear(c, d, g) {
  const P = c.people, H = c.hh, B = c.books, s = c.cfg.seed;
  const recs = new Map();
  for (const h of H.each()) {
    const mem = members(c, h); if (!mem.length) continue;
    const he = E_H0 + h, r = { y: d.y, joint: !!H.joint[h], wages: 0, tips: 0, otPremium: 0, interest: Math.max(0, -B.get(he, AC.R_INTEREST)), ui: 0, other: Math.max(0, -B.get(he, AC.R_OTHER)), withheld: 0, ssExcess: 0, kids: 0, seniors: 0 };
    const ssBase = c.yearRules(d.y).pay.ssBase;
    for (const i of mem) {
      const age = ageYears(c, i, c.epoch);
      r.wages += P.ytdW[i]; r.tips += P.ytdT[i]; r.otPremium += P.ytdOT[i]; r.ui += P.ytdUI[i]; r.withheld += P.ytdFIT[i];
      r.ssExcess += Math.max(0, P.ytdSS[i] - ppm(ssBase, 62000));
      if (age < 17) r.kids++; if (age >= 65) r.seniors++;
    }
    if (!r.joint && r.seniors > 1) r.seniors = 1;
    recs.set(h, r);
    // the day this household files: conscientious people and those expecting a refund file early
    const head = H.head[h] >= 0 ? H.head[h] : mem[0], C = trait(P.traits[head], T_C);
    H.fileOn[h] = epochOf(d.y + 1, 2, 1) + sat(70 - C * 4 + (H.owed[h] > 0 ? 20 : -10) + (trait(c.people.traits[Math.max(0, H.head[h])], T_N) - 8) * 2, 0, 72);   // refunds early, balances due late
  }
  c.returns = recs;
}
function fileReturn(c, h) {
  const r = c.returns.get(h); if (!r) return; c.returns.delete(h);
  const B = c.books, he = E_H0 + h, F = federalYear(r.y, c.nation);
  const res = federalReturn(F, { ...r });
  const balance = res.liability - r.withheld - r.ssExcess;
  const head = c.hh.head[h];
  if (balance < 0) { B.pay(E_FEDGOV, he, -balance, AC.R_INCOME_TAX, AC.X_TAX_INCOME, K.tax_payment); if (head >= 0) addMemory(c, head, M.got_a_tax_refund); }
  else if (balance > 0) {
    if (c.fund(he, balance)) B.pay(he, E_FEDGOV, balance, AC.X_TAX_INCOME, AC.R_INCOME_TAX, K.tax_payment);
    else B.accrue(he, E_FEDGOV, balance, AC.X_TAX_INCOME, AC.INCOME_TAX_PAY, AC.TAXR_INCOME, AC.R_INCOME_TAX);
    if (head >= 0) addMemory(c, head, M.owed_tax);
  }
  c.lastReturn = { h, ...res, balance };
}
