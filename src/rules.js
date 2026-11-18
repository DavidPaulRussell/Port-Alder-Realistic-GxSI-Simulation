// The statutes, schedules and policy paths Port Alder runs on.
// SPDX-License-Identifier: GPL-3.0-only
//
// Money is integer cents. Rates are integers in parts per million (ppm) unless named otherwise.
// Real figures carry the year they apply to and a source in RULE_SOURCES; figures for later years
// are produced by the same indexing formulas the statutes use, applied to the simulated national
// indices (Nation in city.js). Figures that are the city's own, or assumptions, say so.

import { weekday } from "./laws.js";

/* ------------------------------------------------------------------ integer helpers */
// round-half-up n/d for n >= 0, exact for n < 2^53
export function divRound(n, d) {
  if (n < 0) return -divRound(-n, d);
  let q = Math.floor(n / d);
  while (q * d > n) q--; while ((q + 1) * d <= n) q++;
  return 2 * (n - q * d) >= d ? q + 1 : q;
}
export function divFloor(n, d) { let q = Math.floor(n / d); while (q * d > n) q--; while ((q + 1) * d <= n) q++; return q; }
// a·b/d rounded half up, exact while a·b < 2^53 (BigInt otherwise)
export function mulDiv(a, b, d) {
  const p = a * b;
  if (Number.isSafeInteger(p)) return divRound(p, d);
  const P = BigInt(a) * BigInt(b), D = BigInt(d), neg = P < 0n, A = neg ? -P : P, q = A / D, r = A - q * D;
  const v = Number(2n * r >= D ? q + 1n : q); return neg ? -v : v;
}
export const ppm = (cents, rate) => mulDiv(cents, rate, 1000000);
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/* ------------------------------------------------------------------ the calendar */
// Epoch 1 is Thursday 1 January 2026. Days are counted from 1970-01-01 (civil algorithms, H. Hinnant).
export const START = { y: 2026, m: 1, d: 1 };
export function daysFromCivil(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400), yoe = y - era * 400, doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
export function civilFromDays(z) {
  z += 719468;
  const era = Math.floor(z / 146097), doe = z - era * 146097, yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400, doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1, m = mp + (mp < 10 ? 3 : -9);
  return { y: y + (m <= 2 ? 1 : 0), m, d };
}
export const DAY0 = daysFromCivil(START.y, START.m, START.d) - 1;      // epoch e is day DAY0 + e
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const weekdayOfDays = (z) => weekday(z);                    // 1970-01-01 was a Thursday (4); law 6.16
export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const monthDays = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
export const epochOf = (y, m, d) => daysFromCivil(y, m, d) - DAY0;
const nthWeekday = (y, m, wd, n) => { const first = weekdayOfDays(daysFromCivil(y, m, 1)); return 1 + ((wd - first + 7) % 7) + 7 * (n - 1); };
const lastWeekday = (y, m, wd) => { const L = monthDays(y, m), w = weekdayOfDays(daysFromCivil(y, m, L)); return L - ((w - wd + 7) % 7); };
// United States federal holidays, with the Saturday-to-Friday and Sunday-to-Monday observance rule
export function holidays(y) {
  const obs = (m, d) => { const w = weekdayOfDays(daysFromCivil(y, m, d)); const z = daysFromCivil(y, m, d) + (w === 6 ? -1 : w === 0 ? 1 : 0); return z; };
  const fixed = (m, d) => daysFromCivil(y, m, d);
  return new Map([
    [obs(1, 1), "New Year's Day"], [fixed(1, nthWeekday(y, 1, 1, 3)), "Martin Luther King Jr. Day"], [fixed(2, nthWeekday(y, 2, 1, 3)), "Presidents' Day"],
    [fixed(5, lastWeekday(y, 5, 1)), "Memorial Day"], [obs(6, 19), "Juneteenth"], [obs(7, 4), "Independence Day"], [fixed(9, nthWeekday(y, 9, 1, 1)), "Labor Day"],
    [fixed(10, nthWeekday(y, 10, 1, 2)), "Indigenous Peoples' Day"], [obs(11, 11), "Veterans Day"], [fixed(11, nthWeekday(y, 11, 4, 4)), "Thanksgiving"], [obs(12, 25), "Christmas Day"],
  ]);
}
const holidayCache = new Map();
export function dayInfo(e) {
  const z = DAY0 + e, c = civilFromDays(z), wd = weekdayOfDays(z);
  let H = holidayCache.get(c.y); if (!H) { H = holidays(c.y); holidayCache.set(c.y, H); }
  const holiday = H.get(z) || null, L = monthDays(c.y, c.m);
  const doy = z - daysFromCivil(c.y, 1, 1) + 1;
  return { e, z, y: c.y, m: c.m, d: c.d, wd, doy, holiday, weekend: wd === 0 || wd === 6, workday: !(wd === 0 || wd === 6) && !holiday,
    monthEnd: c.d === L, monthStart: c.d === 1, quarter: ((c.m - 1) / 3 | 0) + 1, quarterEnd: c.d === L && c.m % 3 === 0, yearEnd: c.m === 12 && c.d === 31,
    iso: `${c.y}-${String(c.m).padStart(2, "0")}-${String(c.d).padStart(2, "0")}`, label: `${WEEKDAYS[wd].slice(0, 3)} ${c.d} ${MONTHS[c.m - 1].slice(0, 3)} ${c.y}` };
}
// Biweekly paydays: Fridays from 9 January 2026; each pays the two Sunday-to-Saturday weeks ending the Saturday before.
export const FIRST_PAYDAY = epochOf(2026, 1, 9);
export const isPayday = (e) => e >= FIRST_PAYDAY && (e - FIRST_PAYDAY) % 14 === 0;
// Social Security pays on the 2nd, 3rd or 4th Wednesday by the beneficiary's birth day (1-10, 11-20, 21-31).
export function ssPayDay(y, m, birthDay) { return nthWeekday(y, m, 3, birthDay <= 10 ? 2 : birthDay <= 20 ? 3 : 4); }
// The general election: the first Tuesday after the first Monday in November.
export function electionDay(y) { const mon = nthWeekday(y, 11, 1, 1); return mon + 1; }

/* ------------------------------------------------------------------ the sources */
export const RULE_SOURCES = {
  ss2026: ["Social Security wage base $184,500 for 2026; 6.2% each for employee and employer", "https://www.journalofaccountancy.com/news/2025/oct/social-security-wage-base-and-cola-announced-for-2026/"],
  ss2027: ["Social Security wage base $192,300 for 2027; COLA 3.6%", "https://www.journalofaccountancy.com/news/2026/oct/social-security-wage-base-and-cola-announced-for-2027/"],
  pfml: ["Paid Family & Medical Leave premium 1.13% for 2026; employees 71.43%, employers with 50+ employees 28.57%; capped at the Social Security base", "https://esd.wa.gov/node/1109"],
  wacares: ["WA Cares Fund premium 0.58% of gross wages, no cap", "https://www.deel.com/blog/us-payroll-tax-guide-washington/"],
  ui: ["Washington unemployment insurance taxable wage base $78,200 for 2026", "https://news.bgov.com/financial-accounting/washington-announces-2026-unemployment-taxable-wage-base"],
  ui2027: ["UI taxable wage base $82,000 for 2027; ESD expects a solvency tax in 2027-2029", "https://researchcouncil.org/average-annual-wage-is-up-4-9-triggering-increases-to-various-state-benefits-and-the-ui-taxable-wage-base/"],
  uiben: ["UI weekly benefit 3.85% of the average of the two highest base-year quarters, $383 to $1,208, up to 26 weeks, one waiting week", "https://ustax.tools/washington-unemployment-benefits/"],
  aww: ["Washington average weekly wage $1,919 in 2025", "https://esd.wa.gov/node/1254"],
  minwage: ["Washington minimum wage $17.13 in 2026 and $17.73 in 2027, indexed to the August-to-August CPI-W", "https://www.lni.wa.gov/news-events/article/26-17"],
  exempt: ["Overtime-exempt salary threshold $80,168.40 a year in 2026", "https://firsthr.app/compliance-hub/washington/washington-minimum-wage"],
  bo: ["B&O: retailing 0.471% and wholesaling/manufacturing 0.484% rising to 0.5% on 1 January 2027; service and other 1.5% / 1.75% / 2.1% by prior-year income; 0.5% surcharge over $250 million, 2026-2029", "https://grantthornton.com/insights/alerts/tax/2025/salt/u-z/wa-increases-bo-tax-expanding-taxation-of-services-06-13"],
  sales: ["Washington state retail sales tax 6.5%; local rates add up to about 4.2%; groceries exempt", "https://trykintsugi.com/sales-tax-guides/usa/washington"],
  excise: ["Monthly excise returns (sales tax and B&O together) are due the 25th of the following month", "https://trykintsugi.com/en-gb/sales-tax-guides/usa/washington"],
  rent: ["Rent increases capped at 7% plus CPI or 10%, whichever is lower (9.683% in 2026, 10% in 2027); 90 days' written notice; none in the first 12 months", "https://www.atg.wa.gov/news/news-releases/consumer-alert-attorney-general-s-office-issues-know-your-rights-flyers-12"],
  brackets: ["2026 federal income tax brackets (single and married filing jointly)", "https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill"],
  stddeduction: ["2026 standard deduction $16,100 single, $32,200 married filing jointly", "https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill"],
  ctc: ["2026 child tax credit $2,200 per child, $1,700 refundable", "https://www.currentfederaltaxdevelopments.com/blog/2025/10/9/2026-inflation-adjustments-for-tax-professionals-revenue-procedure-2025-32-analysis"],
  obbba: ["Qualified overtime deduction up to $12,500 ($25,000 joint), reduced over $150,000 MAGI ($300,000 joint); qualified tips up to $25,000", "https://www.irs.gov/newsroom/one-big-beautiful-bill-act-tax-deductions-for-working-americans-and-seniors"],
  senior: ["Senior deduction $6,000 per taxpayer 65 or older, phasing out from $75,000 MAGI ($150,000 joint)", "https://www.orcpa.org/news/e217461f-da2f-4565-9c62-5ec33d8adf1e:irs-outreach-connection-f-y26-01"],
  fomc: ["Federal funds target 3.50-3.75% from December 2025; raised to 3.75-4.00% on 16 September 2026; held on 28 October 2026", "https://www.frbdiscountwindow.org/Archive"],
  iorb: ["Interest on reserve balances 3.65% with the 3.50-3.75% range (July 2026)", "https://www.federalreserve.gov/monetarypolicy/files/monetary20260729a1.pdf"],
  cpi: ["CPI-U monthly changes (seasonally adjusted) February-October 2026; 3.7% over the 12 months to September 2026", "https://www.bls.gov/news.release/archives/cpi_11102026.htm"],
  cola: ["Social Security COLA 2.8% for 2026 and 3.6% for 2027, set from the July-September CPI-W", "https://www.kiplinger.com/retirement/social-security/2027-social-security-cola-is-3-6-percent"],
  futa: ["FUTA taxable wage base $7,000 (6.0% less the 5.4% state credit)", "https://taxnews.ey.com/news/2026-0124-2026-state-unemployment-insurance-taxable-wage-bases"],
  lni: ["Workers' compensation rates rose an average of 4.9% in 2026 (class rates here are illustrative)", "https://www.deel.com/blog/us-payroll-tax-guide-washington/"],
};

/* ------------------------------------------------------------------ federal */
// Brackets: [upper bound of taxable income in cents, rate in ppm]; the last bound is Infinity.
const BR2026 = {
  single: [[1240000, 100000], [5040000, 120000], [10570000, 220000], [20177500, 240000], [25622500, 320000], [64060000, 350000], [Infinity, 370000]],
  joint: [[2480000, 100000], [10080000, 120000], [21140000, 220000], [40355000, 240000], [51245000, 320000], [76870000, 350000], [Infinity, 370000]],
};
const STD2026 = { single: 1610000, joint: 3220000 };
// later years: thresholds indexed by the simulated chained CPI, rounded down to $50 (an approximation of
// the statutory indexing; the OBBBA indexes the 10% and 12% brackets more generously)
export function federalYear(y, nation) {
  if (y <= 2026) return { y, brackets: BR2026, std: STD2026, ctc: 220000, ctcRefund: 170000 };
  const f = nation.cpiRatio(2026, y - 1);                                 // Q16 ratio of the indexing CPI
  const idx = (c) => (c === Infinity ? c : Math.floor((c * f) / 65536 / 5000) * 5000);
  const brackets = Object.fromEntries(Object.entries(BR2026).map(([k, v]) => [k, v.map(([b, r]) => [idx(b), r])]));
  return { y, brackets, std: { single: idx(STD2026.single), joint: idx(STD2026.joint) }, ctc: 220000, ctcRefund: Math.min(220000, Math.floor((170000 * f) / 65536 / 10000) * 10000) };
}
export function bracketTax(taxable, brackets) {
  let tax = 0, lo = 0;
  for (const [hi, r] of brackets) { if (taxable <= lo) break; tax += ppm(Math.min(taxable, hi) - lo, r); lo = hi; }
  return tax;
}
// The annual return: wages, tips, interest and unemployment benefits; Social Security benefits are left
// out of income (most retirees here are below the taxable threshold; an approximation).
export function federalReturn(F, R) {
  const status = R.joint ? "joint" : "single", agi = R.wages + R.tips + R.interest + R.ui + R.other;
  let ded = F.std[status];
  const magi = agi;
  // qualified overtime premium: $12,500 ($25,000 joint), less $100 per $1,000 of MAGI over $150,000 ($300,000)
  const otCap = R.joint ? 2500000 : 1250000, otStart = R.joint ? 30000000 : 15000000;
  const otRed = magi > otStart ? Math.ceil((magi - otStart) / 100000) * 10000 : 0;
  const ot = R.y <= 2028 ? Math.max(0, Math.min(R.otPremium, otCap) - otRed) : 0;
  // qualified tips: $25,000, same phase-out thresholds
  const tipsDed = R.y <= 2028 ? Math.max(0, Math.min(R.tips, 2500000) - otRed) : 0;
  // seniors: $6,000 each, phasing out at 6% of MAGI over $75,000 ($150,000 joint) (rate per the statute)
  const senStart = R.joint ? 15000000 : 7500000;
  const senior = R.y <= 2028 ? Math.max(0, 600000 * R.seniors - ppm(Math.max(0, magi - senStart), 60000)) : 0;
  const taxable = Math.max(0, agi - ded - ot - tipsDed - senior);
  let tax = bracketTax(taxable, F.brackets[status]);
  // child tax credit: $2,200 a child, less $50 per $1,000 over $200,000 ($400,000 joint); refundable part
  // up to $1,700 a child and 15% of earned income over $2,500
  const ctcStart = R.joint ? 40000000 : 20000000;
  const ctcFull = Math.max(0, F.ctc * R.kids - (magi > ctcStart ? Math.ceil((magi - ctcStart) / 100000) * 5000 : 0));
  const nonref = Math.min(tax, ctcFull); tax -= nonref;
  const refundable = Math.min(ctcFull - nonref, F.ctcRefund * R.kids, ppm(Math.max(0, R.wages + R.tips - 250000), 150000));
  return { agi, taxable, deductions: { standard: ded, overtime: ot, tips: tipsDed, senior }, tax, ctc: nonref + refundable, refundable, liability: tax - refundable };
}
// Withholding: the annualised percentage method on each paycheck. Two-earner couples withhold on the
// half-width joint schedule (the W-4 step 2 checkbox); a single-earner couple on the full joint schedule.
export function withholding(F, grossPeriod, periods, status, twoEarners) {
  const annual = grossPeriod * periods;
  let br = F.brackets[status], std = F.std[status];
  if (status === "joint" && twoEarners) { br = br.map(([b, r]) => [b === Infinity ? b : b / 2, r]); std = std / 2; }
  return divRound(bracketTax(Math.max(0, annual - std), br), periods);
}

/* ------------------------------------------------------------------ the payroll schedule for a year */
export function payrollYear(y, nation) {
  const P = { y };
  // Social Security: 6.2% each up to the base; Medicare 1.45% each, plus 0.9% withheld over $200,000
  P.ssBase = y <= 2026 ? 18450000 : y === 2027 ? 19230000 : Math.round((19230000 * nation.awiRatio(2025, y - 2)) / 65536 / 30000) * 30000;
  P.ss = 62000; P.medicare = 14500; P.addMedicare = 9000; P.addMedicareOver = 20000000;
  // FUTA 0.6% net on the first $7,000
  P.futa = 6000; P.futaBase = 700000;
  // Washington: PFML 1.13% of wages up to the SS base (employee 71.43%; employer 28.57% at 50+ employees);
  // WA Cares 0.58%, employee, no cap; UI wage base
  P.pfml = 11300; P.pfmlEmployee = 714300; P.pfmlEmployerAt = 50; P.waCares = 5800;
  P.uiBase = y <= 2026 ? 7820000 : y === 2027 ? 8200000 : Math.round((8200000 * nation.awiRatio(2025, y - 2)) / 65536 / 10000) * 10000;
  P.uiSolvency = y >= 2027 && y <= 2029 ? 2000 : 0;          // ESD expects a solvency tax; 0.2% is illustrative
  P.uiSocial = 5000;                                           // illustrative social cost rate
  // minimum wage: CPI-W August to August, rounded to the cent
  P.minWage = minimumWage(y, nation);
  P.exemptSalary = Math.round(P.minWage * 2080 * 9 / 4);      // 2.25 x minimum wage x 2,080 hours (the 2026 multiplier)
  P.sickPer = 40;                                              // 1 hour of paid sick leave per 40 hours worked
  return P;
}
const MW = { 2026: 1713, 2027: 1773 };
const mwCache = new Map();
export function minimumWage(y, nation) {
  if (MW[y]) return MW[y];
  if (mwCache.has(y)) return mwCache.get(y);
  const prev = minimumWage(y - 1, nation), r = nation.cpiwAugRatio(y - 1); // Q16
  const v = Math.max(prev, divRound(prev * r, 65536));
  mwCache.set(y, v); return v;
}
export const clearRuleCaches = () => mwCache.clear();

/* ------------------------------------------------------------------ Washington excise taxes */
export const STATE_SALES = 65000;                // 6.5%
export const LOCAL_SALES = 30000;                // Port Alder: 3.0% local (the city's own rate)
export const BO = { RETAIL: 0, WHOLESALE: 1, MANUF: 2, SERVICE: 3, FINANCIAL: 4, EXEMPT: 5 };
export const BO_NAMES = ["Retailing", "Wholesaling", "Manufacturing", "Service and other activities", "Service and other (financial)", "Exempt"];
export function boRate(cls, y, priorYearGross) {
  if (cls === BO.EXEMPT) return 0;
  if (cls === BO.RETAIL) return y >= 2027 ? 5000 : 4710;
  if (cls === BO.WHOLESALE || cls === BO.MANUF) return y >= 2027 ? 5000 : 4840;
  return priorYearGross >= 500000000 ? 21000 : priorYearGross >= 100000000 ? 17500 : 15000;
}
export const BO_SURCHARGE = { rate: 5000, over: 25000000000, from: 2026, to: 2029 };
// The city's own business licence tax: 0.15% of gross receipts above $100,000 a year, filed quarterly.
export const CITY_BIZ = { rate: 1500, exemptAnnual: 10000000 };

/* ------------------------------------------------------------------ housing */
export function rentCap(y, nation) {
  if (y <= 2026) return 96830; if (y === 2027) return 100000;
  return Math.min(100000, 70000 + nation.cpiChangePpm(y - 1));  // 7% plus CPI, at most 10%
}
export const RENT_NOTICE_DAYS = 90;
// Property tax, dollars per $1,000 of assessed value, as ppm of value. The city's regular levy may grow
// at most 1% a year plus new construction (the 101% limit); the rates themselves are the city's.
export const LEVY = { state: 2400, city: 1600, school: 1200, cityLidLift: 300 };
export const PROPERTY_DUE = [[4, 30], [10, 31]];

/* ------------------------------------------------------------------ unemployment and paid leave */
export function uiWeekly(q1, q2, y, nation) {
  const scale = y <= 2026 ? 65536 : nation.awiRatio(2025, y - 1);
  const lo = divRound(38300 * scale, 65536), hi = divRound(120800 * scale, 65536);
  return clamp(ppm(divRound(q1 + q2, 2), 38500), lo, hi);
}
export const UI_WEEKS = 26;
export function pfmlWeekly(aww, stateAww) {
  const half = divRound(stateAww, 2);
  const b = aww <= half ? ppm(aww, 900000) : ppm(half, 900000) + ppm(aww - half, 500000);
  return Math.min(b, ppm(stateAww, 900000));                    // cap: 90% of the state AWW (assumed)
}

/* ------------------------------------------------------------------ the national path */
// Federal funds target ranges in basis points [effective epoch, lower, upper].
export const FOMC_KNOWN = [[epochOf(2026, 1, 1), 350, 375], [epochOf(2026, 9, 17), 375, 400]];
export const FOMC_LAST_KNOWN = epochOf(2026, 10, 28);
// Seasonally adjusted monthly CPI-U changes in basis points for 2026 (January assumed; February-October as reported).
export const CPI_2026 = [30, 30, 90, 60, 50, -40, 10, 40, 60, 40];
// FOMC meeting days used after the last known decision (the city's own schedule, 8 a year)
export function meetingDays(y) {
  return [[1, 27], [3, 17], [4, 28], [6, 16], [7, 28], [9, 15], [10, 27], [12, 8]].map(([m, d]) => epochOf(y, m, d));
}
