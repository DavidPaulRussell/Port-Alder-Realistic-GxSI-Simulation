// The City of Port Alder and its school district: buses, streets, patrols, the municipal light and water
// utility, school funding, budgets, the levy and the November vote. Also the city's price index.
// SPDX-License-Identifier: GPL-3.0-only
import { ppm, mulDiv, divRound, LEVY, electionDay, epochOf } from "./rules.js";
import { SECTORS, S as SK, CATS, NCAT, O } from "./citydata.js";
import { N, NSHIFT, NMASK } from "./scale.js";
import { AC, K, E_H0, E_F0, E_B0, E_CITY, E_SCHOOL, E_STATE, E_FEDGOV, E_ROW } from "./books.js";
import { sat } from "./core.js";
import { members, ageYears, addMemory, M, trait, T_CIVIC, T_N, T_A, T_THRIFT, homeCell, schoolDay } from "./people.js";
import { lif, pid, uValue, kinetic, heatLoss, degreeDays, energy, solarFlux, responsivity, beerLambert, rational, shoelace, dbAdd, dbAt } from "./laws.js";
import { tempOn } from "./health.js";
import { urge, URGE, URGE_N } from "./economy.js";
import { ROAD } from "./world.js";

export const FARE = 250, SENIOR_FARE = 100;                 // the city's own fares, cents
export function civicDay(c, d, g) {
  const P = c.people, H = c.hh, B = c.books, W = c.world, s = c.cfg.seed, e = c.epoch, G = c.gov;
  // buses: fares for every ride; a late bus is remembered, and counts against the city
  const freq = (G.busFreq || 100), drivers = G.drivers || 0;
  const fares = new Float64Array(H.top); let rides = 0, late = 0;
  for (const i of P.each()) {
    if (P.mode[i] !== 2 || !(P.today[i] & 1)) continue;
    const h = P.hh[i]; if (h < 0) continue; const age = ageYears(c, i, e);
    if (age >= 18) fares[h] += age >= 65 ? SENIOR_FARE * 2 : FARE * 2; rides += 2;
    const hc = homeCell(c, h), cond = hc >= 0 ? W.cond[hc] : 800;
    const lateOdds = Math.max(10, 25 + Math.max(0, 100 - freq) * 3 + (900 - cond) / 8 - Math.min(20, drivers / 4));
    // the late buses a rider meets come at the rate the route's conditions set (law 57.9); the bothered remember them
    if (urge(P.urge, i * URGE_N + URGE.busLate, lateOdds / 1000)) { late++; P.cDe[i]++; if (trait(P.traits[i], T_N) >= 10) addMemory(c, i, M.the_bus_was_late); }
    else if (urge(P.urge, i * URGE_N + URGE.busPraise, 1 / 3)) P.cCo[i]++;
  }
  for (const h of H.each()) if (fares[h] && c.fund(E_H0 + h, fares[h], true)) B.pay(E_H0 + h, E_CITY, fares[h], AC.X_TRANSPORT, AC.R_FEES, K.fee);
  // streets wear with traffic; the worst are repaired under contract at month end
  if (d.wd === 1) for (let cc = 0; cc < W.cond.length; cc++) { const r = W.road[cc]; if (!r) continue; W.cond[cc] = Math.max(100, W.cond[cc] - (r === ROAD.ARTERIAL ? 4 : r === ROAD.BRIDGE ? 3 : 1) - (c.vital[cc * 8 + 6] >> 3)); }
  // police patrols clear disorder where it is strongest; where it persists, people are robbed
  const officers = G.officers || 0, patrols = Math.max(2, Math.floor(officers / 6));
  const hot = []; for (let cc = 0; cc < W.land.length; cc++) { const v = c.vital[cc * 8 + 7]; if (v) hot.push([v, cc]); }
  hot.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  c.patrol = hot.slice(0, patrols).map((x) => x[1]);
  for (const cc of c.patrol) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = (cc & NMASK) + dx, y = (cc >> NSHIFT) + dy; if (x < 0 || y < 0 || x > N - 1 || y > N - 1) continue; const q = c.frameAt((y << NSHIFT) | x) + 7; c.frame[q] &= ~1; }
  let crimes = 0;
  for (const [v, cc] of hot.slice(patrols, patrols + 40)) {
    const life = c.vital[cc * 8] + c.vital[cc * 8 + 1] + c.vital[cc * 8 + 2];
    // disorder charges a cell's crime until it fires (law 57.9): theft where disorder is strong and street life thin
    const q = c.crimeQ || (c.crimeQ = new Float32Array(W.land.length)), v2 = lif(q[cc], Math.max(0, v * 6 - life * 2) / 1000, 0.05);
    q[cc] = v2 >= 1 ? v2 - 1 : v2;
    if (v2 >= 1) {
      crimes++;
      const b = W.bldOf[cc]; let victim = -1;
      let vd = 99; for (const i of P.each()) { const h = P.hh[i]; if (h < 0 || H.home[h] < 0 || !(P.today[i] & 1) || ageYears(c, i) < 16) continue; const dd = Math.abs((homeCell(c, h) & NMASK) - (cc & NMASK)) + Math.abs((homeCell(c, h) >> NSHIFT) - (cc >> NSHIFT)); if (dd <= 3 && dd < vd) { vd = dd; victim = i; } }   // the nearest resident out on the street
      if (victim >= 0) { addMemory(c, victim, M.was_robbed); P.cDe[victim] += 2; P.need[victim * 8 + 3] = Math.max(0, P.need[victim * 8 + 3] - 60); const he = E_H0 + P.hh[victim], loss = Math.min(B.get(he, AC.DEPOSITS), 4000 + v * 2500); if (loss > 0) B.pay(he, E_ROW, loss, AC.X_OTHER, AC.R_OTHER, K.other); }
    }
  }
  c.R.city = { rides, late, crimes, patrols: c.patrol.length };
}

export function civicMonth(c, d, g) {
  const P = c.people, H = c.hh, B = c.books, F = c.firms, W = c.world, G = c.gov, s = c.cfg.seed;
  // the light and water bill; the utility buys power and water wholesale
  let billed = 0;
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][d.m - 1], first = d.doy - d.d + 1;
  let hdd = 0; for (let k = 0; k < days; k++) hdd += degreeDays(tempOn(first + k), 18);
  // the structural layer's conductivity by the kinetic formula: timber sheathing, or concrete (law 37.25)
  const kWood = kinetic(1.6e6, 3000, 8.1e-11), kConcrete = kinetic(2.0e6, 3700, 5.7e-10), cloud = [0.55, 0.5, 0.45, 0.35, 0.3, 0.25, 0.15, 0.18, 0.25, 0.4, 0.55, 0.6][d.m - 1];
  const solar = solarFlux(0.12 + 0.08 * (d.m >= 4 && d.m <= 8 ? 1 : 0), beerLambert(cloud)) * days * 9 / 1000;   // kWh per m2 of panel, month
  const W2 = c.world;
  for (const h of H.each()) {
    if (H.home[h] < 0) continue;
    const dw = H.home[h], b = W2.dwellings.bld[dw], age = Math.max(0, d.y - W2.buildings.built[b]), rooms = W2.dwellings.rooms[dw] || 1, area = 30 + rooms * 22;
    // walls of timber frame and insulation (older homes have less); windows; a roof share for houses
    const frame = W2.buildings.kind[b] <= 1 ? [0.012, kWood] : [0.2, kConcrete], wall = uValue([frame, [age > 50 ? 0.04 : age > 25 ? 0.09 : 0.14, 0.04], [0.0125, 0.25]]), win = age > 40 ? 4.8 : 2.0, roof = W2.buildings.kind[b] <= 1 ? 0.25 : 0.05;
    const UA = heatLoss([[area * 1.1, wall], [area * 0.15, win], [area * roof * 4, 0.3]], 1) + area * 0.35;   // fabric and air leakage, W/K
    const heatKWh = (UA * hdd * 24) / 1000 / (W2.buildings.cond[b] < 400 ? 0.8 : 1), appliances = energy(250 + H.size[h] * 180, days * 24);
    const panel = W2.buildings.green[b] ? (area * 0.4 * solar * 0.2) / Math.max(1, W2.buildings.units[b]) : 0, kwh = Math.max(0, heatKWh * 0.6 + appliances - responsivity(panel, 1));
    const stormwater = W2.buildings.units[b] ? Math.round((rational(W2.buildings.green[b] ? 0.45 : 0.9, 25, shoelace([[0, 0], [W2.buildings.w[b] * 20, 0], [W2.buildings.w[b] * 20, W2.buildings.h[b] * 20], [0, W2.buildings.h[b] * 20]])) * 1500) / W2.buildings.units[b]) : 0;
    const bill = Math.round(days * 62 + kwh * 11.4) + 4200 + H.size[h] * 1800 + stormwater;   // base charge, energy, water and sewer, surface water
    H.kwh[h] = Math.round(kwh); H.heat[h] = Math.round(heatKWh * 0.6 * 11.4);
    if (c.fund(E_H0 + h, bill, true)) { B.pay(E_H0 + h, E_CITY, bill, AC.X_UTILITIES, AC.R_FEES, K.fee); billed += bill; } else H.util[h] += bill;
  }
  for (const f of F.each()) { if (F.status[f] === 1) continue; const bill = 12000 + F.staff[f] * 1500 * F.nspace[f]; if (c.fund(E_F0 + f, bill, true)) { B.pay(E_F0 + f, E_CITY, bill, AC.X_PURCHASES, AC.R_FEES, K.fee); billed += bill; } }
  const wholesale = Math.round(billed * 0.58); if (c.fund(E_CITY, wholesale)) B.pay(E_CITY, E_ROW, wholesale, AC.X_PURCHASES, AC.R_SALES, K.purchase);
  // street repairs: the worst cells, contracted to the builders
  const builders = [...F.each()].filter((f) => F.status[f] === 0 && F.sector[f] === SK.construction);
  const worst = []; for (let cc = 0; cc < W.cond.length; cc++) if (W.road[cc] && W.cond[cc] < 550) worst.push([W.cond[cc], cc]);
  worst.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const budget = G.roadBudget ?? Math.round(P.count * 900); let spent = 0;
  for (const [, cc] of worst) {
    const cost = 4200000; if (spent + cost > budget || !builders.length) break;
    let f = builders[0]; for (const x of builders) if (F.mRev[x] < F.mRev[f]) f = x;   // the contract goes to the builder with the most room in its month
    if (!c.fund(E_CITY, cost)) break;
    B.pay(E_CITY, E_F0 + f, cost, AC.X_PURCHASES, AC.R_SALES, K.construction); F.mRev[f] += cost; F.ytdGross[f] += cost;
    W.cond[cc] = 980; spent += cost;
  }
  G.roadSpent = spent;
  // state school funding by enrolment (the state's per-pupil amount here is illustrative)
  let pupils = 0; for (const i of P.each()) if (P.status[i] === 1 && ageYears(c, i) < 18) pupils++;
  const perPupil = Math.round(1180000 * (G.schoolIndex || 1000) / 1000 / 12);
  B.pay(E_STATE, E_SCHOOL, pupils * perPupil, AC.X_TRANSFER, AC.R_INTERGOV, K.transfer);
  G.pupils = pupils;
  // supplies for the city and the schools
  for (const [ent, amt] of [[E_CITY, P.count * 2500], [E_SCHOOL, pupils * 9000]]) if (c.fund(ent, amt)) B.pay(ent, E_ROW, amt, AC.X_PURCHASES, AC.R_SALES, K.purchase);
  // staffing: the city's officers and drivers
  let officers = 0, drivers = 0; for (const i of P.each()) if (P.emp[i] === E_CITY) { if (P.occ[i] === O.safety) officers++; if (P.occ[i] === O.driver) drivers++; }
  G.officers = officers; G.drivers = drivers;
  // the city's price index: what was paid for each category, against January 2026, weighted by spending
  cityPrices(c, d);
  // the month's figures
  G.monthRevenue = -B.get(E_CITY, AC.R_SALES_TAX) - B.get(E_CITY, AC.R_PROP_TAX) - B.get(E_CITY, AC.R_FEES) - B.get(E_CITY, AC.R_CITYBIZ) - (G.revMark || 0);
  G.revMark = (G.revMark || 0) + G.monthRevenue;
  G.monthSales = c.gov.monthSalesTax || 0; c.gov.monthSalesTax = 0;
  let rent = 0, nr = 0; for (const h of H.each()) if (H.tenure[h] === 0 && H.rent[h]) { rent += H.rent[h]; nr++; } G.avgRent = nr ? Math.round(rent / nr) : 0;
}
function cityPrices(c, d) {
  const F = c.firms, G = c.gov;
  const avg = new Float64Array(NCAT), n = new Float64Array(NCAT);
  for (const f of F.each()) { if (F.status[f] === 1) continue; const cat = SECTORS[F.sector[f]].cat; if (cat < 0 || cat > 7) continue; avg[cat] += Math.round((F.price[f] * 1e6) / SECTORS[F.sector[f]].price); n[cat]++; }
  const W = [300, 110, 160, 90, 70, 120, 80, 70];
  if (!G.basePrice) G.basePrice = Array.from(avg, (v, k) => (n[k] ? Math.round(v / n[k]) : 1000000));
  let idx = 0, ws = 0; for (let k = 0; k < NCAT; k++) { if (!n[k]) continue; idx += W[k] * (avg[k] / n[k]) / G.basePrice[k]; ws += W[k]; }
  const cpi = Math.round((idx / Math.max(1, ws)) * 1e6), months = Math.max(1, (d.y - 2026) * 12 + d.m);
  G.cpiHist = (G.cpiHist || []).concat([cpi]);
  const back = G.cpiHist.length > 12 ? G.cpiHist[G.cpiHist.length - 13] : 1e6;
  G.inflation = G.cpiHist.length > 12 ? Math.round((cpi / back - 1) * 10000) : Math.round(((cpi / 1e6 - 1) * 12 / months) * 10000);
  G.cpi = cpi;
}

export function civicYear(c, d, g) {
  const B = c.books, G = c.gov, P = c.people;
  // next year's levy: the regular levy may grow 1% plus new construction (the 101% limit); a passed lid lift adds to it
  const av = c.assessedValue(), prev = G.levyCityAmount || ppm(av, G.cityLevy ?? LEVY.city);
  const allowed = Math.round(prev * 1.01 + (G.newConstruction || 0) * (G.cityLevy ?? LEVY.city) / 1e6);
  const want = G.lidLiftPassed ? allowed + ppm(av, LEVY.cityLidLift) : allowed;
  G.cityLevy = Math.min(3600, Math.max(200, Math.round((want * 1e6) / Math.max(1, av))));
  G.levyCityAmount = ppm(av, G.cityLevy); G.lidLiftPassed = false; G.newConstruction = 0;
  // the budget: revenue against costs sets next year's staffing; a shortfall puts a levy on the ballot
  const rev = -B.get(E_CITY, AC.R_SALES_TAX) - B.get(E_CITY, AC.R_PROP_TAX) - B.get(E_CITY, AC.R_FEES) - B.get(E_CITY, AC.R_CITYBIZ);
  const cost = B.get(E_CITY, AC.X_WAGES) + B.get(E_CITY, AC.X_PAYROLL_TAX) + B.get(E_CITY, AC.X_PURCHASES) + B.get(E_CITY, AC.X_INTEREST);
  const gap = cost - rev, cash = B.get(E_CITY, AC.DEPOSITS) + B.get(E_CITY, AC.SAVINGS);
  const steer = pid(c.budgetPid || (c.budgetPid = {}), gap / Math.max(1, cost), 0.5, 0.15, 0.1), change = sat(-steer, -0.04, 0.03);
  G.cityStaff = Math.max(50, Math.round((G.cityStaff || 0) * (1 + change)));
  if (gap > 0 && cash < cost / 6) G.proposeLidLift = true;
  G.revMark = 0;
  G.budget = { y: d.y + 1, revenue: rev, cost, gap, staff: G.cityStaff, levy: G.cityLevy };
  c.event("budget", `The city adopts its ${d.y + 1} budget: ${G.cityStaff} staff, levy $${(G.cityLevy / 1000).toFixed(2)} per $1,000${G.proposeLidLift ? "; a levy lid lift will go to the voters" : ""}`);
}
// the November vote on the levy lid lift
export function election(c, d) {
  const P = c.people, G = c.gov, s = c.cfg.seed;
  if (!G.proposeLidLift) return;
  let yes = 0, no = 0;
  for (const i of P.each()) {
    if (ageYears(c, i) < 18 || P.hh[i] < 0) continue;
    const civic = trait(P.traits[i], T_CIVIC); if (civic + 3 + P.tcLv[i] < 10) continue;   // the civic-minded and the trusting turn out
    const lean = P.tcLv[i] * 220 + P.need[i * 8 + 7] / 4 - P.stress[i] / 5 + (c.hh.tenure[P.hh[i]] === 1 ? -60 : 40) + (trait(P.traits[i], T_A) - 8) * 12 - (trait(P.traits[i], T_THRIFT) - 8) * 12;
    if (lean > 400) yes++; else no++; addMemory(c, i, M.voted);
  }
  const pass = yes > no; G.lidLiftPassed = pass; G.proposeLidLift = false;
  G.lastVote = { y: d.y, yes, no, pass };
  c.event("election", `Proposition 1 (levy lid lift) ${pass ? "passes" : "fails"}, ${yes} to ${no}`);
}
export function civicGenesis(c) {
  const G = c.gov; G.cityLevy = LEVY.city; G.schoolLevy = LEVY.school; G.busFreq = 100; G.cpi = 1000000; G.stateAww = 191900;
}
