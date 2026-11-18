// The national economy around Port Alder: prices, the policy rate, energy, the demand for the city's goods and
// visitors, and fund returns. Months and decisions that have happened are taken as reported (rules.js, with sources).
// Everything after them is emergent: the agents of the outer layers (periphery.js) set prices and wages, energy
// producers set fuel prices, households decide on trips and spending, investors earn the firms' profits, and the
// national bank's committee decides the rate at its meetings. Nothing here is drawn or follows a fixed cycle; a month
// that has not happened yet has no value until the agents give it one (until then it carries the last one forward).
// SPDX-License-Identifier: GPL-3.0-only
import { CPI_2026, FOMC_KNOWN, FOMC_LAST_KNOWN, meetingDays, epochOf, dayInfo, divRound } from "./rules.js";
import { sat } from "./core.js";
import { cosT as cosTurns } from "./laws.js";

const Q16 = 65536;
export const cosT = cosTurns;
// monthly energy prices for 2026 relative to January (x1000): an approximate path consistent with the reported 37.4%
// rise in gasoline over the 12 months to October 2026
export const ENERGY_2026 = [1000, 1000, 1030, 1060, 1120, 1040, 1080, 1180, 1330, 1374];
// the S&P 500's 2026 monthly total returns are not modelled as known; fund returns come from firms' profits from the start

export class Nation {
  constructor(seed, horizonYears = 12) {
    this.seed = seed;
    const months = horizonYears * 12 + 12; this.months = months;
    this.cpi = new Float64Array(months + 1); this.cpi[0] = 1e6;          // CPI-U x 10^6, December 2025 = 10^6; cpi[k+1] is month k
    this.mchg = new Int32Array(months);                                    // monthly change in basis points
    this.energy = new Int32Array(months);                                  // x1000
    this.fund = new Int32Array(months);                                    // investment fund return, basis points a month
    this.demand = new Int32Array(months).fill(Q16);                        // the outer layers' spending on the city's goods (Q16)
    this.visitors = new Int32Array(months).fill(Q16);                      // and their trips to the city (Q16)
    this.known = CPI_2026.length;                                          // months of reported history
    this.set = 0;                                                          // months the agents have decided so far
    for (let k = 0; k < months; k++) {
      const m = k < CPI_2026.length ? CPI_2026[k] : 0;
      this.mchg[k] = m; this.cpi[k + 1] = Math.round((this.cpi[k] * (10000 + m)) / 10000);
      this.energy[k] = k < ENERGY_2026.length ? ENERGY_2026[k] : ENERGY_2026[ENERGY_2026.length - 1];
    }
    this.policy = FOMC_KNOWN.map(([e, l, h]) => [e, l, h]);
  }
  // the outer layers attach: from here on the months after the reported ones are theirs to set
  attachEmergent() { this.emergent = true; }
  monthIndex(e) { const d = dayInfo(e); return (d.y - 2026) * 12 + d.m - 1; }
  // month k's change in prices, as the agents' economy produced it (reported months are kept as reported)
  setInflation(k, bp) {
    if (k < 0 || k >= this.months) return;
    if (k >= this.known) { this.mchg[k] = bp; }
    this.set = Math.max(this.set, k + 1);
    for (let j = k; j < this.months; j++) { const m = j <= k || j < this.known ? this.mchg[j] : 0; this.cpi[j + 1] = Math.round((this.cpi[j] * (10000 + m)) / 10000); }
  }
  setEnergy(k, x1000) { if (k >= ENERGY_2026.length && k < this.months) for (let j = k; j < this.months; j++) this.energy[j] = x1000; }
  setFund(k, bp) { if (k >= 0 && k < this.months) this.fund[k] = bp; }
  setDemand(k, demandQ16, visitorsQ16) { if (k < 0 || k >= this.months) return; for (let j = k; j < this.months; j++) { this.demand[j] = demandQ16; this.visitors[j] = visitorsQ16; } }
  cpiAt(k) { return this.cpi[Math.max(0, Math.min(this.cpi.length - 1, k + 1))]; }
  // 12-month change in ppm for month k
  yoyPpm(k) {
    if (k < 0) return 0;
    if (k >= 11) return Math.round((this.cpiAt(k) / this.cpiAt(k - 12) - 1) * 1e6);
    return Math.round(((this.cpiAt(k) / this.cpiAt(-1) - 1) * 12 / (k + 1)) * 1e6);   // annualised before a full year exists
  }
  // Q16 ratio of the August indexing CPI of year y1 to that of year y0
  cpiRatio(y0, y1) { return Math.round((this.cpiAt((y1 - 2026) * 12 + 7) / this.cpiAt((y0 - 2026) * 12 + 7)) * Q16); }
  cpiwAugRatio(y) { return this.cpiRatio(y - 1, y); }
  cpiChangePpm(y) { return Math.round((this.cpiAt((y - 2026) * 12 + 8) / this.cpiAt((y - 2027) * 12 + 8) - 1) * 1e6); }
  // the national average wage index: prices plus 1% a year in real terms, 2025 = 1
  awiRatio(y0, y1) { let r = 1; for (let y = y0 + 1; y <= y1; y++) r *= this.cpiAt((y - 2026) * 12 + 11) / this.cpiAt((y - 2027) * 12 + 11) + 0.01; return Math.round(r * Q16); }
  colaPpm(y) {
    if (y === 2026) return 28000; if (y === 2027) return 36000;
    const q = (yy) => (this.cpiAt((yy - 2026) * 12 + 6) + this.cpiAt((yy - 2026) * 12 + 7) + this.cpiAt((yy - 2026) * 12 + 8)) / 3;
    return Math.max(0, Math.round((q(y - 1) / q(y - 2) - 1) * 1000) * 1000);
  }
  // the national bank's committee records a decision (periphery.js decides it at each meeting after the last real one)
  decide(e, lo, hi) { if (e > FOMC_LAST_KNOWN) this.policy.push([e + 1, lo, hi]); }
  rate(e) { let r = this.policy[0]; for (const p of this.policy) if (p[0] <= e) r = p; else break; return { lo: r[1], hi: r[2], mid: Math.round((r[1] + r[2]) / 2), since: r[0] }; }
  iorb(e) { return this.rate(e).hi - 10; }
  prime(e) { return this.rate(e).hi + 300; }
  // demand for the city's exports (Q16): kind 0 is visitors (the trips outer households decided to make), the rest the
  // outer layers' spending on the goods and services the city sells
  exportDemand(e, kind) { const k = Math.max(0, Math.min(this.months - 1, this.monthIndex(e))); return kind === 0 ? this.visitors[k] : this.demand[k]; }
  // import cost index by spending category (x1000), January 2026 = 1000: prices, and energy for transport
  importIndex(e, cat) {
    const k = this.monthIndex(e), base = this.cpiAt(k) / this.cpiAt(-1);
    if (cat === 5) return Math.round(1000 * (0.35 * base + 0.65 * this.energy[Math.max(0, Math.min(this.months - 1, k))] / 1000));
    return Math.round(1000 * base);
  }
  fundReturn(k) { return this.fund[Math.max(0, Math.min(this.months - 1, k))]; }
}
export const NATION_Q16 = Q16;
export { epochOf, divRound };
