// The KPI board of Port Alder, nested in the Matryoshka: every figure is an expectation value of an observable over
// the citizens' and households' state (law 32.4), and the layers' boards (periphery.js) wrap the city's. Also the
// month's measurements other modules use: who is listened to (centrality), access to jobs, comparable rents, street
// noise, and the day's light.
// SPDX-License-Identifier: GPL-3.0-only
import { NEIGHBOURHOODS, LAND, L } from "./citydata.js";
import { AC, E_H0, E_F0, E_B0, E_CITY, E_ROW } from "./books.js";
import { expectation, gini, dissimilarity, entropy, kl, mad, unionSize, stochastic, betti, connectivity, centrality, deflate, dbAdd, dbAt, sun, julian, beerLambert, okun, dijkstra, continuity, greenshields } from "./laws.js";
import { ageYears, members, friendOf } from "./people.js";
import { coverage } from "./health.js";

export const KPI_VERSION = "1.0.0";
// Everett's cloudiness by month as a base-ten absorbance of daylight (illustrative climatology of a cloudy coast)
const CLOUD = [0.55, 0.5, 0.45, 0.35, 0.3, 0.25, 0.15, 0.18, 0.25, 0.4, 0.55, 0.6];

/* ------------------------------------------------------------------ each day: the light */
export function lightDay(c, d) {
  // hours of daylight at Port Alder (laws 40.10 and 40.6), dimmed by the month's clouds (law 29.49)
  const s = sun(julian(d.y, d.m, d.d), 20, 47.979, -122.202), lit = s.daylight * beerLambert(CLOUD[d.m - 1]);
  c.gov.light = Math.round((lit - 7) * 10); c.gov.daylight = Math.round(s.daylight * 100);
}

/* ------------------------------------------------------------------ each month: measurements, then the board */
export function measureMonth(c) {
  const P = c.people, W = c.world, F = c.firms, D = W.dwellings, T = W.buildings;
  // who is listened to: eigenvector centrality of the friendship network (law 77.19); and its cohesion (law 43.5)
  const idx = new Map(), slots = []; for (const i of P.each()) { idx.set(i, slots.length); slots.push(i); }
  const adj = slots.map((i) => { const out = []; for (let k = 0; k < 4; k++) { const f = friendOf(c, i, k); if (f >= 0 && idx.has(f)) out.push(idx.get(f)); } return out; });
  for (let x = 0; x < adj.length; x++) for (const y of adj[x]) if (!adj[y].includes(x)) adj[y].push(x);
  const cent = centrality(adj); slots.forEach((i, x) => { P.cent[i] = Math.round(cent[x] * 1000); });
  // the giant component's algebraic connectivity
  const comp = new Int32Array(adj.length).fill(-1); let best = -1, bestN = 0;
  for (let s0 = 0; s0 < adj.length; s0++) { if (comp[s0] >= 0) continue; const st = [s0]; comp[s0] = s0; let n = 0; while (st.length) { const u = st.pop(); n++; for (const v of adj[u]) if (comp[v] < 0) { comp[v] = s0; st.push(v); } } if (n > bestN) { bestN = n; best = s0; } }
  const gi = [], gmap = new Map(); for (let x = 0; x < adj.length; x++) if (comp[x] === best) { gmap.set(x, gi.length); gi.push(x); }
  c.cohesion = gi.length > 2 && gi.length < 20000 ? connectivity(gi.map((x) => adj[x].filter((y) => gmap.has(y)).map((y) => gmap.get(y)))) : 0; c.giant = bestN;
  // jobs as masses for the access potential; comparable rents per room for asking rents
  c.jobMasses = []; for (const f of F.each()) if (F.status[f] === 0 && F.staff[f] > 0) { const cell = c.firmCell(f); if (cell >= 0) c.jobMasses.push([cell & 127, cell >> 7, F.staff[f]]); }
  c.rentComps = []; for (const d of D.each()) if (D.hh[d] >= 0 && D.rent[d] && D.rooms[d] && !D.afford[d]) { const b = D.bld[d]; c.rentComps.push([T.x[b], T.y[b], D.rent[d] / D.rooms[d]]); if (c.rentComps.length > 2500) break; }
  // street noise at each building: traffic on the street in front, heavier on arterials (laws 31.17 and 31.18)
  const noise = new Int16Array(T.top);
  for (const b of T.each()) {
    const fc = W.frontCell(b); if (fc < 0) continue; const road = W.road[fc], transit = c.vital[fc * 8 + 6], work = c.vital[fc * 8 + 3];
    const L0 = 50 + (road === 2 ? 14 : road ? 6 : 0) + transit * 1.2, Lw = 45 + work * 1.5;
    noise[b] = Math.round(dbAdd([dbAt(L0, 10, 15), dbAt(Lw, 10, 30)]));
  }
  c.noise = noise;
  // the street network's travel times from the city centre: each street's traffic is conserved along it (law 22.17) and
  // slows it (Greenshields); Dijkstra's algorithm gives every cell its time from the centre (law 58.36)
  const N2 = W.land.length, speed = new Float32Array(N2);
  for (let x = 0; x < N2; x++) { if (!W.road[x]) continue; const rho = continuity(0, c.vital[x * 8 + 6] * 8 + c.vital[x * 8 + 3] * 5, 0, 1); speed[x] = greenshields(W.road[x] === 2 ? 13.9 : 8.3, rho, 120); }
  const centre = c.gov.cityCell ?? (64 * 128 + 64), dist = dijkstra(N2, centre, (u, visit) => { const ux = u & 127, uy = u >> 7; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const vx = ux + dx, vy = uy + dy; if (vx < 0 || vy < 0 || vx > 127 || vy > 127) continue; const v = (vy << 7) | vx; if (!W.road[v] && !W.road[u]) continue; visit(v, 20 / Math.max(1.4, (speed[u] || 1.4) + (speed[v] || 1.4)) * 2); } });
  let tsum = 0, tn = 0; for (const h of c.hh.each()) { const hd = c.hh.home[h]; if (hd < 0) continue; const t = dist[W.frontCell(D.bld[hd])]; if (Number.isFinite(t)) { tsum += t; tn++; } }
  c.travelToCentre = tn ? Math.round(tsum / tn / 60 * 10) / 10 : 0;
  c.noiseAt = (h) => { const hd = c.hh.home[h]; if (hd < 0 || !c.noise) return 0; const L = c.noise[D.bld[hd]] || 0; return Math.max(0, L - 55) * 3; };
}

export function cityBoard(c) {
  const P = c.people, H = c.hh, F = c.firms, B = c.books, W = c.world, D = W.dwellings, T = W.buildings, G = c.gov, o = c.outer, wC = (o?.cityWeight ?? 7600) / 1000;
  const e = c.epoch, k = c.nation.monthIndex(Math.max(1, e));
  let living = 0; for (const h of H.each()) if (H.size[h]) living++;
  const people = { citizens: P.count, households: living, represented: Math.round(P.count * wC) };
  // work
  let emp = 0, un = 0, nilf = 0, away = 0, ret = 0, kids = 0; const flows = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], now = new Map();
  const cls = (st) => (st === 2 || st === 6 ? 0 : st === 3 ? 1 : 2);
  for (const i of P.each()) {
    const st = P.status[i]; if (st === 0 || st === 1) { kids++; continue; } if (st === 5) ret++;
    if (st === 2 || st === 6) emp++; else if (st === 3) un++; else nilf++; if (P.emp[i] === E_ROW) away++;
    const g = P.sin[i], x = cls(st); now.set(g, x); if (c.lastClass?.has(g)) flows[c.lastClass.get(g)][x]++;
  }
  c.lastClass = now;
  const lf = emp + un, work = { employed: emp, looking: un, outOfLabourForce: nilf, retired: ret, outCommuters: away, unemployment: lf ? Math.round((un * 10000) / lf) : 0,
    flows: stochastic(flows).map((r) => r.map((v) => Math.round(v * 1000))), outputGap: Math.round(okun(lf ? (un * 100) / lf : 4.2, 4.2) * 100) };
  // income and poverty
  const inc = [], poorH = [], rich = new Array(NEIGHBOURHOODS.length).fill(0), low = new Array(NEIGHBOURHOODS.length).fill(0);
  let personsPoor = 0, persons = 0, burden30 = 0, burden50 = 0, renters = 0;
  for (const h of H.each()) { inc.push(H.inc[h] * 12); }
  const sorted = [...inc].sort((a, b) => a - b), median = sorted.length ? sorted[sorted.length >> 1] : 0;
  for (const h of H.each()) {
    const n = H.size[h]; persons += n; if (H.inc[h] < c.fpl(c.today.y, n) / 12) personsPoor += n;       // the year's poverty line (indexed to prices)
    if (H.home[h] >= 0) { const hood = T.hood[D.bld[H.home[h]]] ?? 0; if (H.inc[h] * 12 < median * 0.5) low[hood]++; if (H.inc[h] * 12 > median * 1.5) rich[hood]++; }
    if (H.tenure[h] === 0 && H.home[h] >= 0 && H.inc[h] > 0) { renters++; const bu = (H.rent[h] * 1000) / H.inc[h]; if (bu > 300) burden30++; if (bu > 500) burden50++; }
  }
  const income = { medianHousehold: median, realMedian: Math.round(deflate(median, 1e6, c.nation.cpiAt(k))), poverty: persons ? Math.round((personsPoor * 1000) / persons) : 0, gini: Math.round(gini(inc) * 1000),
    rentBurdened: renters ? Math.round((burden30 * 1000) / renters) : 0, severelyBurdened: renters ? Math.round((burden50 * 1000) / renters) : 0, segregation: Math.round(dissimilarity(low, rich) * 1000) };
  // programs: enrolment, and households on any of them counted from the overlaps (law 10.11)
  const bits = [1, 2, 4, 8, 16], inter = new Array(32).fill(0); let snapP = 0, ahP = 0, ssi = 0, abd = 0, vouch = 0, wait = 0;
  for (const h of H.each()) { const pg = H.progs[h]; for (let m = 1; m < 32; m++) { let all = true; for (let j = 0; j < 5; j++) if (m & (1 << j) && !(pg & bits[j])) { all = false; break; } if (all) inter[m]++; } if (pg & 1) snapP += H.size[h]; if (H.voucher[h]) vouch++; if (H.vWait[h] && !H.voucher[h]) wait++; }
  for (const i of P.each()) { if (P.ah[i]) ahP++; if (P.ssi[i]) ssi++; if (P.abd[i]) abd++; }
  const programs = { snapHouseholds: inter[1], snapPersons: snapP, tanf: inter[2], appleHealth: ahP, wic: inter[8], childCare: inter[16], ssi, abd, vouchers: vouch, voucherWaitlist: wait, anyProgram: unionSize(inter, 5),
    applications: G.wel?.applications || 0, denials: G.wel?.denials || 0, schoolMealsFree: G.wel?.mealsFree || 0 };
  // health and care
  const cov = [0, 0, 0, 0, 0]; let distress = 0, episodes = 0, inTx = 0, sessions = 0, crisis = 0, forgone = 0, visits = 0, sick = 0, vax = 0;
  for (const i of P.each()) { cov[coverage(c, i)]++; if (P.mh[i] > 700) distress++; if (P.mhEp[i]) episodes++; if (P.mhTx[i]) inTx++; sessions += P.mhYtd[i]; crisis += P.crisis[i]; forgone += P.forgone[i]; visits += P.visits[i]; if (P.sick[i]) sick++; if (P.vax[i] && e - P.vax[i] < 200) vax++; }
  const n = Math.max(1, P.count), care = c.care || {}, gc = G.care || {};
  const health = { uninsured: Math.round((cov[0] * 1000) / n), employerPlan: Math.round((cov[1] * 1000) / n), appleHealth: Math.round((cov[2] * 1000) / n), medicare: Math.round((cov[3] * 1000) / n), cascadeCare: Math.round((cov[4] * 1000) / n),
    careVisitsYear: visits, wentWithoutCare: forgone, clinicWaitDays: Math.round((care.waitGP || 0) * 10) / 10, ill: sick, fluPrevalence: Math.round((care.prevalence || 0) * 10000), reproduction: care.r || 0, vaccinated: Math.round((vax * 1000) / n),
    deathsYear: G.deathsYear || 0, birthsYear: G.birthsYear || 0, dampHomes: gc.damp || 0, premiumPerMember: gc.premium || 0 };
  const mental = { distressed: Math.round((distress * 1000) / n), episodes, inCounselling: inTx, sessionsYear: sessions, counsellingWaitDays: Math.round((care.waitMH || 0) * 10) / 10, crisisContacts: crisis, mobileCrisis: gc.mobile || 0,
    helpSought: distress ? Math.round((inTx * 1000) / distress) : 0, wentWithoutHelp: gc.mhForgone || 0 };
  // housing and homes
  let units = 0, vacant = 0, owners = 0, homeless = 0, notices = 0;
  for (const d of D.each()) { units++; if (D.hh[d] < 0) vacant++; }
  for (const h of H.each()) { if (H.tenure[h] === 1) owners++; if (H.home[h] < 0) homeless++; if (H.noticeAt[h] > e || H.demoAt[h] > e) notices++; }
  const rents = []; for (const h of H.each()) if (H.tenure[h] === 0 && H.rent[h]) rents.push(H.rent[h]); rents.sort((a, b) => a - b);
  const housing = { homes: units, vacancy: units ? Math.round((vacant * 1000) / units) : 0, ownership: H.count ? Math.round((owners * 1000) / H.count) : 0, medianRent: rents.length ? rents[rents.length >> 1] : 0, homeless, notices, evictions: G.evictions || 0, newHomes: G.dev?.homes || 0 };
  // the city's land, streets and social fabric
  const landCount = new Array(LAND.length).fill(0); for (let x = 0; x < W.land.length; x++) landCount[W.land[x]]++;
  const roadEdges = [], roadId = new Int32Array(W.land.length).fill(-1); let rn = 0; for (let x = 0; x < W.land.length; x++) if (W.road[x]) roadId[x] = rn++;
  for (let x = 0; x < W.land.length; x++) { if (roadId[x] < 0) continue; const cx = x & 127, cy = x >> 7; if (cx < 127 && roadId[x + 1] >= 0) roadEdges.push([roadId[x], roadId[x + 1]]); if (cy < 127 && roadId[x + 128] >= 0) roadEdges.push([roadId[x], roadId[x + 128]]); }
  const bt = betti(rn, roadEdges);
  const fabric = { landMix: Math.round(entropy(landCount.filter((_, k) => k !== L.water && k !== L.road)) * 1000) / 1000, streetComponents: bt.b0, streetLoops: bt.b1, cohesion: Math.round((c.cohesion || 0) * 10000) / 10000, connected: c.giant || 0,
    trustCity: [0, 1, 2, 3].map((lv) => { let m = 0; for (const i of P.each()) if (P.tcLv[i] === lv) m++; return Math.round((m * 1000) / n); }) };
  // mood: an expectation value; how surprising this month's spread of moods is against last month's (law 79.8)
  const moods = [], hist = new Array(10).fill(0); for (const i of P.each()) { moods.push(P.val[i]); hist[Math.max(0, Math.min(9, Math.floor((P.val[i] + 1000) / 200)))]++; }
  const mood = { mean: Math.round(expectation(moods)), stress: Math.round(expectation([...P.each()].map((i) => P.stress[i]))), surprise: c.lastMoodHist ? Math.round(kl(hist, c.lastMoodHist.map((x) => x + 0.5)) * 1000) / 1000 : 0 };
  c.lastMoodHist = hist;
  // business, banks and the city's books
  let firms = 0, openFirms = 0; for (const f of F.each()) { firms++; if (F.status[f] === 0) openFirms++; }
  let dep = 0, loans = 0; for (let x = 0; x < c.banks.length; x++) { dep -= B.get(E_B0 + x, AC.DEP_PAY) + B.get(E_B0 + x, AC.SAV_PAY); loans += B.get(E_B0 + x, AC.LOAN_MORT) + B.get(E_B0 + x, AC.LOAN_BIZ) + B.get(E_B0 + x, AC.LOAN_AUTO) + B.get(E_B0 + x, AC.LOAN_CARD); }
  const business = { firms, open: openFirms, deposits: dep, loans, chargeoffs: c.banks.reduce((s, b) => s + (b.chargeoffs || 0), 0) };
  const city = { cash: B.get(E_CITY, AC.DEPOSITS) + B.get(E_CITY, AC.SAVINGS), levyPer1000: G.cityLevy ?? 0, staff: G.cityStaff || 0, budget: G.budget || null };
  const transit = { rides: c.R?.city?.rides || 0, late: c.R?.city?.late || 0, minutesToCentre: c.travelToCentre || 0 }, safety = { crimes: c.R?.city?.crimes || 0, patrols: c.R?.city?.patrols || 0 };
  const prices = { cpiCity: G.cpi || 1000000, cpiNation: Math.round(c.nation.cpiAt(k)), inflationNation: c.nation.yoyPpm(k), policyRate: c.nation.rate(Math.max(1, e)).hi };
  const elections = { city: G.lastBallot || null, state: G.stateBallot || [] };
  // unusual months in the main series, by median absolute deviation (law 59.5)
  const flags = []; for (const key of ["unemployment", "mood", "rent", "pop"]) { const series = (c.months || []).slice(-12).map((m) => m[key] ?? 0); if (series.length >= 6) { const { median: md, mad: dv } = mad(series), last = series[series.length - 1]; if (dv > 0 && Math.abs(last - md) > 3 * dv) flags.push(key); } }
  const board = { epoch: e, people, work, income, programs, health, mental, housing, fabric, mood, business, city, transit, safety, prices, elections, flags };
  // the city's entry in the Matryoshka
  if (o) o.kpi.city = { pop: Math.round(P.count * wC), households: Math.round(living * wC), unemployment: work.unemployment, poverty: income.poverty, uninsured: health.uninsured, snap: Math.round((snapP * 1000) / n), medicaid: health.appleHealth, mood: mood.mean, stress: mood.stress, distress: mental.distressed, trust: Math.round(fabric.trustCity[2] + fabric.trustCity[3]), income: median };
  c.board = board;
  return board;
}
