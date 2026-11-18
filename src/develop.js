// Port Alder rebuilds itself. Buildings age and run down unless their owners keep them up; owners weigh repair
// against redevelopment; for each site to be rebuilt the people around it draw designs out of who they are, what
// they need and what they remember, and choose among the designs by approval; Washington's notice rule and the
// city's relocation assistance protect the tenants; a prime contractor demolishes and builds under one contract
// (a retail sale in Washington, so sales tax is due on the whole contract price), paid in monthly draws from a
// construction loan admitted by E1 at a bank; and the new building opens with homes and premises whose rents come
// from the street around it. All of it is integer arithmetic, and every payment goes through the books.
// SPDX-License-Identifier: GPL-3.0-only
import { ppm } from "./rules.js";
import { B as BK, SECTORS, S as SK, O as OC, MAT, MATERIALS, CELL_M, N, NEIGHBOURHOODS, personName } from "./citydata.js";
import { AC, K, E_H0, E_F0, E_B0, E_CITY, E_ROW, E_STATE } from "./books.js";
import { sat, admitE1, trustScore, Slots } from "./core.js";
import { SCALE, NSHIFT, NMASK, CoordArray } from "./scale.js";
import { columnLoad, effectiveStress, headLeft, drag, gutenberg, npv, potential, miner } from "./laws.js";
import { members, ageYears, addMemory, M, trait, homeBuilding, T_O, T_C, T_E, T_A, T_N, T_RISK, T_THRIFT, T_CIVIC } from "./people.js";
import { annuity, lenderOf, ROW_LENDER, originate } from "./finance.js";
import { moveInto, findHome, leaveCity, removeAsset } from "./housing.js";
import { cellOf } from "./world.js";

export const DEVELOP_VERSION = "1.0.0";
export const STAGES = ["vacant lot", "design call", "tenants on notice", "demolition", "construction", "open", "shelved", "renovated"];
export const ST = { LOT: 0, DESIGN: 1, NOTICE: 2, DEMOLISH: 3, BUILD: 4, OPEN: 5, SHELVED: 6, RENOVATED: 7 };
export const MOTIVES = ["more homes for people like us", "homes people can afford", "the street's character kept", "a corner for shops and cafes", "a green roof and trees",
  "a landmark for the neighbourhood", "family homes with room to grow", "work close to home", "a safer, livelier street", "the most the zoning allows"];
const MV = { homes: 0, afford: 1, context: 2, shops: 3, green: 4, landmark: 5, family: 6, work: 7, safety: 8, maxed: 9 };
export const WHY = ["run down", "worth more rebuilt", "empty", "a teardown", "unsafe", "a vacant lot"];

// Port Alder's land-use code (the city's own rules): the uses, height and lot coverage each neighbourhood allows,
// two more storeys where at least a fifth of the homes are income-restricted, one more within two cells of a bus stop
export const ZONES = [
  { uses: [BK.mixed, BK.apartments, BK.office], floors: 16, cover: 900 },                       // Downtown
  { uses: [BK.mixed, BK.apartments, BK.townhouse, BK.shop], floors: 6, cover: 850 },             // Old Town
  { uses: [BK.mixed, BK.apartments, BK.townhouse, BK.office, BK.shop], floors: 7, cover: 750 },  // Northgate
  { uses: [BK.townhouse, BK.apartments, BK.house, BK.mixed], floors: 4, cover: 600 },            // Creekside
  { uses: [BK.house, BK.townhouse], floors: 3, cover: 500 },                                     // Eastside Hills
  { uses: [BK.house, BK.townhouse, BK.apartments], floors: 4, cover: 550 },                      // Southridge
  { uses: [BK.industrial, BK.office, BK.mixed], floors: 5, cover: 850 },                         // Port District
  { uses: [BK.apartments, BK.mixed, BK.townhouse, BK.house], floors: 6, cover: 700 },            // Bayview
];
const KIND_MAX = { [BK.house]: 2, [BK.townhouse]: 3, [BK.shop]: 2, [BK.industrial]: 3 };
export const RULES = {
  noticeDays: 120,            // RCW 59.18.200(2)(c)(i): written notice at least 120 days before a tenancy ends for demolition
  commercialNotice: 90,       // the city's own: premises leases end on 90 days' notice
  relocation: 200000,         // the city's relocation assistance (RCW 59.18.440 allows up to $2,000 a unit): half from the owner, half from the city
  lowIncome: 500,             // ... for households at or below 50% of the city's median household income
  affordShare: 600, affordRentShare: 300,   // the city's own: income-restricted homes for households at or below 60% of median income, rent at 30% of that income
  callDays: 14, proposers: 8, approveShare: 400, ownerShare: 250, feasible: 60,   // design call: 14 days, up to 8 citizen designs, 40% approval to win
  equity: 250, materialsOut: 600,           // a quarter of the cost from the developer's own funds; 60% of a contract goes to suppliers out of town
};
const COST_M2 = { [BK.house]: 230000, [BK.townhouse]: 240000, [BK.apartments]: 265000, [BK.mixed]: 280000, [BK.shop]: 215000, [BK.office]: 325000, [BK.industrial]: 145000 };   // cents a square metre (illustrative)
const MAT_COST = new Map([[MAT.brick_red, 1060], [MAT.brick_yellow, 1050], [MAT.concrete, 1000], [MAT.curtain_glass, 1120], [MAT.stucco, 960], [MAT.siding, 920], [MAT.metal_panel, 980], [MAT.sandstone, 1150], [MAT.rust_steel, 1080], [MAT.marble, 1250], [MAT.timber_deck, 1010]]);
const UNIT_M2 = [0, 46, 68, 92, 118];
const BOLD = [MAT.curtain_glass, MAT.metal_panel, MAT.rust_steel, MAT.timber_deck], DURABLE = [MAT.brick_red, MAT.brick_yellow, MAT.sandstone], THRIFTY = [MAT.stucco, MAT.siding, MAT.concrete];
export const KIND_NOUN = ["house", "row of townhouses", "apartment building", "mixed-use building", "shopfront building", "office building", "workshop and warehouse", "hotel", "civic building", "school", "hospital", "clinic", "bank"];
const NAME_SUFFIX = ["House", "Row", "Court", "Block", "Corner", "Building", "Works"];
const FACADE_WORD = { [MAT.brick_red]: "red-brick", [MAT.brick_yellow]: "buff-brick", [MAT.concrete]: "concrete", [MAT.curtain_glass]: "glass", [MAT.stucco]: "stucco", [MAT.siding]: "clapboard",
  [MAT.metal_panel]: "metal-panel", [MAT.sandstone]: "sandstone", [MAT.rust_steel]: "weathered-steel", [MAT.marble]: "marble-faced", [MAT.timber_deck]: "timber-clad" };
const MB = { evicted: 1, rentUp: 2, robbed: 4, started: 8, failed: 16, empty: 32, meal: 64 };

export const PROJECT_SPEC = [["alive", Uint8Array], ["stage", Uint8Array], ["site", Int32Array], ["x", CoordArray], ["y", CoordArray], ["w", Uint8Array], ["h", Uint8Array], ["hood", Uint8Array],
  ["owner", Int32Array], ["why", Uint8Array], ["opened", Int32Array], ["stageAt", Int32Array], ["due", Int32Array], ["design", Int32Array], ["builder", Int32Array], ["loan", Int32Array],
  ["build", Float64Array], ["demo", Float64Array], ["paid", Float64Array], ["tax", Float64Array], ["equity", Float64Array], ["credit", Float64Array], ["drawn", Float64Array], ["interest", Float64Array],
  ["hours", Float64Array], ["done", Float64Array], ["progress", Uint16Array], ["minDays", Uint16Array], ["bld", Int32Array], ["voters", Uint16Array], ["nprop", Uint8Array],
  ["moved", Uint16Array], ["left", Uint16Array], ["closed", Uint16Array], ["relief", Float64Array], ["oldKind", Uint8Array], ["oldFloors", Uint8Array], ["oldUnits", Uint16Array],
  ["oldArea", Int32Array], ["value0", Float64Array], ["price", Float64Array], ["topped", Uint8Array], ["payer", Int32Array], ["rate", Int32Array], ["soft", Float64Array]];
export const PROPOSAL_SPEC = [["alive", Uint8Array], ["proj", Int32Array], ["author", Int32Array], ["given", Uint16Array], ["family", Uint16Array], ["motive", Uint8Array],
  ["kind", Uint8Array], ["floors", Uint8Array], ["podium", Uint8Array], ["cover", Uint16Array], ["facade", Uint8Array], ["roof", Uint8Array], ["tint", Uint8Array],
  ["green", Uint8Array], ["balcony", Uint8Array], ["glazing", Uint16Array], ["units", Uint16Array], ["afford", Uint16Array], ["rooms", Uint8Array], ["shops", Uint8Array],
  ["offices", Uint8Array], ["trees", Uint8Array], ["craft", Uint16Array], ["approvals", Uint16Array], ["build", Float64Array], ["value", Float64Array], ["margin", Int32Array],
  ["area", Int32Array], ["feasible", Uint8Array], ["won", Uint8Array]];

export function attachDevelop(c) {
  c.projects = new Slots(SCALE.projects, PROJECT_SPEC); c.proposals = new Slots(SCALE.proposals, PROPOSAL_SPEC);
  c.gov.dev = { demolished: 0, built: 0, homes: 0, afford: 0, designs: 0, votes: 0, shelved: 0, renovated: 0, relocated: 0, left: 0, closed: 0, abated: 0, relief: 0 };
  incomes(c);
}
const taxRate = (c) => 65000 + (c.gov.localSales ?? 30000);
const builders = (c) => { const F = c.firms, out = []; for (const f of F.each()) if (F.status[f] === 0 && F.sector[f] === SK.construction) out.push(f); return out; };
const isRealty = (c, e) => e >= E_F0 && e < E_B0 && c.firms.alive[e - E_F0] && c.firms.sector[e - E_F0] === SK.realty && c.firms.status[e - E_F0] === 0;
const ownerName = (c, e) => (e >= E_F0 && e < E_B0 ? c.names.firm(e - E_F0) : e === E_ROW ? "Its out-of-town owners" : e === E_CITY ? "The city" : e >= E_B0 && e < E_B0 + 4 && c.banks[e - E_B0] ? c.banks[e - E_B0].short : "Its owner");
const money = (cents) => "$" + Math.round(cents / 100).toLocaleString("en-US");
const possessive = (n) => (n.endsWith("s") ? n + "'" : n + "'s");
export const authorName = (c, p) => (c.proposals.author[p] >= 0 ? personName(c.proposals.given[p], c.proposals.family[p]) : "the owner's architects");
export function buildingName(c, b) {
  const T = c.world.buildings; if (!T.design[b]) return null; const p = T.design[b] - 1, R = c.proposals;
  if (R.author[p] >= 0) return `${personName(R.given[p], R.family[p]).split(" ")[1]} ${NAME_SUFFIX[Math.min(6, T.kind[b])]}`;
  return `${NEIGHBOURHOODS[T.hood[b]]} ${["Place", "Commons", "Yards", "Square"][T.seed[b] % 4]}`;
}
export function describeDesign(c, p) {
  const R = c.proposals, mat = FACADE_WORD[R.facade[p]] || MATERIALS[R.facade[p]][1].toLowerCase(), k = R.kind[p];
  const bits = [`a ${R.floors[p]}-storey ${mat} ${KIND_NOUN[k]}`];
  if (R.units[p] > 1) bits.push(`${R.units[p]} homes${R.afford[p] ? ` (${R.afford[p]} income-restricted)` : ""}`);
  if (R.shops[p]) bits.push(`${R.shops[p]} shop${R.shops[p] > 1 ? "s" : ""} on the street`);
  if (R.offices[p]) bits.push(`${R.offices[p]} office suite${R.offices[p] > 1 ? "s" : ""}`);
  if (R.green[p]) bits.push("a green roof");
  if (R.podium[p]) bits.push(`stepped back above the ${ordinal(R.podium[p])} floor`);
  if (R.balcony[p] === 2) bits.push("deep balconies");
  if (R.trees[p]) bits.push(`${R.trees[p]} street tree${R.trees[p] > 1 ? "s" : ""}`);
  return bits.length > 2 ? `${bits.slice(0, -1).join(", ")} and ${bits[bits.length - 1]}` : bits.join(" with ");
}
const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
export function oldDescription(c, j) { const Pj = c.projects; return Pj.site[j] >= 0 || Pj.oldUnits[j] || Pj.oldFloors[j] ? `the ${Pj.oldFloors[j]}-storey ${KIND_NOUN[Pj.oldKind[j]]}` : "the vacant lot"; }

/* ------------------------------------------------------------------ incomes the city's rules refer to */
function incomes(c) {
  const H = c.hh, inc = []; for (const h of H.each()) if (H.size[h] > 0) inc.push(Math.round(H.inc[h])); inc.sort((a, b) => a - b);
  const med = inc.length ? inc[inc.length >> 1] : 500000, G = c.gov;
  G.medianInc = med; G.affordLimit = Math.round((med * RULES.affordShare) / 1000); G.lowIncome = Math.round((med * RULES.lowIncome) / 1000);
  G.affordRent = Math.round((G.affordLimit * RULES.affordRentShare) / 1000 / 500) * 500;
  const D = c.world.dwellings, byR = [0, 0, 0, 0, 0], byN = [0, 0, 0, 0, 0]; let rr = 0, rn = 0;
  for (const d of D.each()) if (!D.afford[d] && D.rooms[d] && D.rent[d]) { rr += Math.floor(D.rent[d] / D.rooms[d]); rn++; const k = Math.min(4, D.rooms[d]); byR[k] += D.rent[d]; byN[k]++; }
  G.rentRoom = rn ? Math.round(rr / rn) : 60000; G.rentBy = byR.map((v, k) => (byN[k] ? Math.round(v / byN[k]) : 0));
}

/* ------------------------------------------------------------------ the site and its street */
export function siteContext(c, x0, y0, w, h, self = -1) {
  const W = c.world, T = W.buildings, D = W.dwellings, SP = W.spaces, R = 6, R2 = 10;
  const fl = [], mats = new Map(), seen = new Set();
  for (let y = Math.max(0, y0 - R); y < Math.min(N, y0 + h + R); y++) for (let x = Math.max(0, x0 - R); x < Math.min(N, x0 + w + R); x++) {
    const b = W.bldOf[cellOf(x, y)]; if (b < 0 || b === self || seen.has(b) || T.stage[b] >= 3) continue;
    seen.add(b); fl.push(T.floors[b]); mats.set(T.facade[b], (mats.get(T.facade[b]) || 0) + T.w[b] * T.h[b]);
  }
  fl.sort((a, b) => a - b); const floors = fl.length ? fl[fl.length >> 1] : 2;
  let facade = MAT.brick_red, most = -1; for (const [m, n] of [...mats.entries()].sort((a, b) => a[0] - b[0])) if (n > most) { most = n; facade = m; }
  const cx = x0 + (w >> 1), cy = y0 + (h >> 1), near = (b) => Math.max(Math.abs(T.x[b] + (T.w[b] >> 1) - cx), Math.abs(T.y[b] + (T.h[b] >> 1) - cy)) <= R2;
  let rr = 0, rn = 0, hv = 0, hn = 0, vac = 0, du = 0; const byR = [0, 0, 0, 0, 0], byN = [0, 0, 0, 0, 0];
  for (const d of D.each()) {
    const b = D.bld[d]; if (b === self || !near(b)) continue; du++; if (D.hh[d] < 0) vac++;
    if (!D.afford[d] && D.rooms[d] && D.rent[d]) { rr += Math.floor(D.rent[d] / D.rooms[d]); rn++; const k = Math.min(4, D.rooms[d]); byR[k] += D.rent[d]; byN[k]++; }
    if ((T.kind[b] === BK.house || T.kind[b] === BK.townhouse) && D.rooms[d]) { hv += Math.floor(D.value[d] / D.rooms[d]); hn++; }
  }
  const sr = [0, 0, 0], sn = [0, 0, 0]; let sv = 0, st = 0;
  for (const p of SP.each()) { const b = SP.bld[p], k = SP.kind[p]; if (b === self || k > 2 || !near(b)) continue; sr[k] += SP.rent[p]; sn[k]++; st++; if (SP.tenant[p] === -1) sv++; }
  const fc = W.frontOf(x0, y0, w, h), v = (k) => (fc >= 0 ? c.vital[fc * 8 + k] : 0);
  let lv = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) lv += W.landValue[cellOf(x, y)];
  const stop = fc >= 0 ? W.stopNear[fc] : -1;
  const masses = c.jobMasses || []; const access = Math.round(potential(masses, x0 + w / 2, y0 + h / 2));
  return { floors, facade, fc, access, hood: W.hood[cellOf(x0, y0)], land: lv * CELL_M * CELL_M, x0, y0, w, h,
    rentRoom: rn ? Math.round(rr / rn) : c.gov.rentRoom || 60000, rentBy: byR.map((v, k) => (k === 0 ? 0 : byN[k] >= 3 ? Math.round(v / byN[k]) : (c.gov.rentBy?.[k] || 120000 * k))), homeRoom: hn ? Math.round(hv / hn) : Math.round((c.gov.avgHomePrice || 60000000) / 3),
    shopRent: sn[0] ? Math.round(sr[0] / sn[0]) : 250000, officeRent: sn[1] ? Math.round(sr[1] / sn[1]) : 300000, workRent: sn[2] ? Math.round(sr[2] / sn[2]) : 400000,
    homeVac: du ? Math.round((vac * 1000) / du) : 50, spaceVac: st ? Math.round((sv * 1000) / st) : 100,
    shopping: v(1), dining: v(2), work: v(3), night: v(4), parks: v(5), transit: v(6), disorder: v(7),
    stop: stop >= 0 && Math.max(Math.abs((stop & NMASK) - (fc & NMASK)), Math.abs((stop >> NSHIFT) - (fc >> NSHIFT))) <= 2 };
}
const zoneOf = (ctx) => ZONES[ctx.hood] || ZONES[3];
const houseCover = (z, ctx) => Math.min(z.cover, Math.floor(160000 / (ctx.w * ctx.h * CELL_M * CELL_M)));
function maxFloors(ctx, kind, afford) {
  const z = zoneOf(ctx); let hi = z.floors + (ctx.stop ? 1 : 0);
  if (afford >= 200 && (kind === BK.apartments || kind === BK.mixed)) hi += 2;
  return Math.min(hi, KIND_MAX[kind] ?? hi);
}

/* ------------------------------------------------------------------ what a design builds, costs and is worth */
export function geometry(d, w, h) {
  const lot = w * h * CELL_M * CELL_M, foot = Math.floor((lot * d.cover) / 1000), top = d.podium ? Math.floor((foot * 600) / 1000) : foot;
  return { lot, foot, top, area: d.podium ? foot * d.podium + top * (d.floors - d.podium) : foot * d.floors };
}
function program(d, w, h, g) {
  let units = 0;
  if (d.kind === BK.house) units = 1;
  else if (d.kind === BK.townhouse) units = Math.max(1, Math.floor(g.area / 140));
  else if (d.kind === BK.apartments || d.kind === BK.mixed) units = Math.max(1, Math.floor((((d.kind === BK.mixed ? g.area - g.foot : g.area) * 820) / 1000) / UNIT_M2[d.rooms]));
  const shops = d.kind === BK.mixed || d.kind === BK.shop ? Math.max(1, Math.min(12, d.shops)) : 0;
  const offices = d.kind === BK.office ? Math.max(1, Math.min(12, Math.ceil(g.area / 900))) : 0;
  const afford = d.kind === BK.apartments || d.kind === BK.mixed || d.kind === BK.townhouse ? Math.floor((units * d.affordShare) / 1000) : 0;
  return { units, shops, offices, works: d.kind === BK.industrial ? 1 : 0, afford };
}
export function costOf(d, g, oldArea) {
  let m2 = COST_M2[d.kind] ?? 260000;
  m2 = Math.round((m2 * (MAT_COST.get(d.facade) ?? 1000)) / 1000);
  m2 = Math.round((m2 * (1000 + Math.max(0, d.floors - 5) * 12 + (d.balcony === 2 ? 30 : d.balcony ? 10 : 0) + (d.podium ? 20 : 0) + Math.floor(Math.max(0, d.glazing - 500) / 5))) / 1000);
  const build = g.area * m2 + (d.green ? g.top * 25000 : 0) + d.trees * 350000;
  const demo = oldArea > 0 ? oldArea * 9000 + 1500000 : 400000;
  return { build, demo, hours: g.area * 5 + Math.floor(oldArea / 2) + 40 };
}
export function valueOf(c, d, ctx, pr, rateBp) {
  if (d.kind === BK.house || d.kind === BK.townhouse) {
    const rooms = d.kind === BK.house ? d.rooms : 3;
    return { value: Math.round((pr.units * rooms * ctx.homeRoom * 1150) / 1000), rent: Math.round((ctx.rentBy[Math.min(4, rooms)] * 1100) / 1000 / 500) * 500 };
  }
  const reach = 1 + Math.min(0.15, (ctx.access || 0) / 40000);   // tenants pay for access to work and shops
  const rent = Math.round((ctx.rentBy[d.rooms] * 1100 * reach) / 1000 / 500) * 500, ar = Math.min(rent, c.gov.affordRent || rent);
  const gross = 12 * ((pr.units - pr.afford) * rent + pr.afford * ar + Math.round(((pr.shops * ctx.shopRent + pr.offices * ctx.officeRent + pr.works * ctx.workRent) * 1100) / 1000));
  const noi = Math.round((gross * 950 * 680) / 1000000), cap = sat(rateBp - 80 + ctx.disorder * 3, 450, 850);
  return { value: Math.round((noi * 10000) / cap), rent };
}
// the whole cost of a design (contract, sales tax, the construction loan's interest, the city's relocation share) against
// the site's present value: the developer's margin, in thousandths
// what height and ground add to a building (laws 67.11, 23.9, 24.11, 25.2, 45.8): columns carry every floor above;
// on the waterfront fill the effective stress is low, so foundations go deeper; above the water main's head booster
// pumps are needed; wind on a tall facade; and design for the Puget Sound faults' earthquakes
export function groundAndHeight(d, ctx, g) {
  const structural = Math.max(0, columnLoad(d.floors, 7, 36) - columnLoad(4, 7, 36)) * 900;
  const fill = ctx.hood === 6, sigma = effectiveStress(12, fill ? 1 : 8), dry = effectiveStress(12, 12), foundation = fill ? Math.round(g.area * 18000 * Math.max(0, dry / sigma - 1)) : 0;
  const pumps = headLeft(450, d.floors * 3.2) < 140 ? 4500000 + d.floors * 120000 : 0;
  const wind = d.floors >= 8 ? Math.round(drag(32, ctx.w * 20 * d.floors * 3.2) * 2500) : 0;
  const seismic = Math.round(g.area * 6000 * Math.min(2, gutenberg(3.2, 1, 6.5) * 475) * (fill ? 1.5 : 1));
  return structural + foundation + pumps + wind + seismic;
}
function appraise(c, d, ctx, oldArea, v0, displaced, rateBp) {
  const g = geometry(d, ctx.w, ctx.h), pr = program(d, ctx.w, ctx.h, g), cost = costOf(d, g, oldArea), val = valueOf(c, d, ctx, pr, rateBp);
  cost.build += groundAndHeight(d, ctx, g);
  const contract = cost.build + cost.demo, months = Math.ceil(minDays(d.floors, g.area) / 30);
  const finance = Math.round((contract * 750 / 1000) * rateBp / 10000 * months / 24), soft = softCosts(contract);
  const all = contract + ppm(contract, taxRate(c)) + finance + soft.design + soft.permit + displaced * (RULES.relocation >> 1);
  // the developer also tests the project as cash flows: the outlay, then thirty years of rents less costs (law 68.59)
  const noi = Math.round(((val.rent || 0) * Math.max(1, pr.units) * 12 * 0.6) / 12), flows = [-(all + v0)]; for (let t = 0; t < 360; t += 12) flows.push(noi * 12);
  const test = npv(flows, Math.max(0.003, rateBp / 120000) * 12);
  return { g, pr, cost, val, npv: Math.round(test.npv), payback: test.payback, margin: Math.round(((val.value - all - v0) * 1000) / Math.max(1, all + v0)) };
}
const minDays = (floors, area) => Math.min(540, 75 + floors * 21 + Math.floor(area / 400));
// architects, engineers and the rest of the design team (paid to a professional firm in town) and the city's building permit
export const softCosts = (contract) => ({ design: Math.round((contract * 180) / 1000), permit: Math.round((contract * 12) / 1000) + 50000 });

/* ------------------------------------------------------------------ a citizen's design */
function memBits(c, i) {
  const P = c.people, o = i * 8; let m = 0;
  for (let k = 0; k < 8; k++) { const kk = P.memK[o + k]; if (kk === M.was_evicted) m |= MB.evicted; else if (kk === M.rent_went_up) m |= MB.rentUp; else if (kk === M.was_robbed) m |= MB.robbed;
    else if (kk === M.started_a_business) m |= MB.started; else if (kk === M.the_business_failed) m |= MB.failed; else if (kk === M.found_the_shelves_empty) m |= MB.empty; else if (kk === M.had_a_good_meal_out) m |= MB.meal; }
  return m;
}
function personalDesign(c, j, i, ctx, oldArea, v0, displaced, rateBp) {
  const P = c.people, H = c.hh, s = c.cfg.seed, t = P.traits[i], hh = P.hh[i], z = zoneOf(ctx);
  // the designer's taste: a fixed linear reading of who they are and what they have lived through (no draws)
  const feat = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => trait(t, k)).concat([P.edu[i], P.skill[i] >> 6, Math.floor((c.epoch - P.born[i]) / 1826), memBits(c, i) & 255, (memBits(c, i) >> 8) & 255, P.need[i * 8 + 4] >> 6, P.need[i * 8 + 6] >> 6]);
  const r = (k) => feat.reduce((v, f, m) => v + f * ((((k + 3) * (m + 5)) % 13) + 1), 0);
  const O = trait(t, T_O), C = trait(t, T_C), E = trait(t, T_E), A = trait(t, T_A), Nn = trait(t, T_N), R = trait(t, T_RISK), Th = trait(t, T_THRIFT), Cv = trait(t, T_CIVIC);
  const renter = hh >= 0 && H.tenure[hh] === 0, kids = hh >= 0 && H.kids[hh] > 0, burden = renter ? Math.round((H.rent[hh] * 1000) / Math.max(1, H.inc[hh])) : 0, mem = memBits(c, i), occ = P.occ[i];
  const score = (u) => {
    if (u === BK.apartments) return 6 + (renter ? 5 : 0) + (burden > 350 ? 5 : 0) + (mem & MB.evicted ? 6 : 0) + (mem & MB.rentUp ? 4 : 0) + (Cv >> 2);
    if (u === BK.mixed) return 5 + (E >> 1) + (mem & MB.started ? 6 : 0) + ((ctx.shopping + ctx.dining) >> 3) + (mem & MB.empty ? 3 : 0) + (mem & MB.meal ? 2 : 0) + (renter ? 2 : 0);
    if (u === BK.townhouse) return 4 + (kids ? 6 : 0) + (A >> 2) + (ctx.floors <= 3 ? 4 : 0);
    if (u === BK.house) return (kids ? 4 : 0) + (A >> 1) + (renter ? 0 : 4) + (ctx.floors <= 2 ? 5 : 0) - (Cv >> 2);
    if (u === BK.office) return 3 + (occ === OC.professional || occ === OC.manager || occ === OC.engineer ? 6 : 0) + (R >> 2) + (ctx.spaceVac < 80 ? 3 : 0);
    if (u === BK.shop) return 2 + (E >> 2) + (mem & MB.started ? 4 : 0);
    if (u === BK.industrial) return 4 + (occ === OC.production || occ === OC.driver || occ === OC.trades ? 7 : 0);
    return 0;
  };
  let kind = z.uses[0], ks = -1e9; z.uses.forEach((u, k) => { const sc = score(u) * 4 + (r(1 + k) % 7); if (sc > ks) { ks = sc; kind = u; } });
  const residential = kind === BK.apartments || kind === BK.mixed || kind === BK.townhouse;
  let affordShare = residential ? sat((Cv + A - 12) * 25 + (mem & MB.evicted ? 150 : 0) + (mem & MB.rentUp ? 80 : 0) + (burden > 400 ? 100 : 0) - (Th > 10 && !renter ? 60 : 0), 0, 500) : 0;
  affordShare = Math.round(affordShare / 50) * 50;
  const lo = kind === BK.house || kind === BK.shop || kind === BK.industrial ? 1 : 2, hi = Math.max(lo, maxFloors(ctx, kind, affordShare));
  const landmark = O >= 12 && R >= 10, lean = sat(O + R + 8 - Nn - (A >> 1) - (!renter ? 3 : 0), 0, 30);
  const floors = landmark ? hi : lo + Math.floor(((hi - lo) * lean) / 30);
  const pitched = kind === BK.house || kind === BK.townhouse;
  let facade;
  if (A >= 11 || (ctx.hood === 1 && C >= 8)) facade = ctx.facade;
  else if (O >= 11) facade = BOLD[r(2) % 4];
  else if (C >= 10) facade = DURABLE[r(2) % 3];
  else if (Th >= 11) facade = THRIFTY[r(2) % 3];
  else facade = pitched ? [MAT.siding, MAT.brick_red, MAT.stucco][r(2) % 3] : kind === BK.office ? [MAT.curtain_glass, MAT.concrete][r(2) % 2] : kind === BK.industrial ? [MAT.metal_panel, MAT.concrete][r(2) % 2] : [MAT.brick_red, MAT.stucco, MAT.brick_yellow, MAT.concrete][r(2) % 4];
  if (pitched && (facade === MAT.curtain_glass || facade === MAT.marble)) facade = MAT.timber_deck;
  const green = !pitched && kind !== BK.industrial && Cv + O + (ctx.parks < 3 ? 2 : 0) + (P.need[i * 8 + 6] < 450 ? 3 : 0) + (r(8) % 4) >= 26 ? 1 : 0;
  const roof = kind === BK.industrial ? MAT.metal_roof : pitched ? (O >= 11 ? MAT.metal_roof : C >= 10 ? MAT.slate : MAT.shingle) : green ? MAT.lawn : Th >= 10 ? MAT.membrane : MAT.gravel;
  const rooms = kind === BK.house ? (kids ? 4 : 3) : kids ? 3 : hh >= 0 && H.size[hh] >= 3 ? 2 : ageYears(c, i) < 30 ? 1 : 2;
  const d = { kind, floors, podium: floors >= 6 && O + C >= 18 ? Math.min(floors - 2, 2 + (r(3) % 3)) : 0,
    cover: kind === BK.house ? houseCover(z, ctx) : sat(z.cover - (Cv >= 11 && E >= 9 ? 150 : 0) - (green ? 50 : 0) + (Th >= 11 ? 50 : 0), 400, z.cover),
    facade, roof, tint: (r(5) + E * 9) & 255, green, balcony: kind === BK.apartments || kind === BK.mixed ? (E >= 10 ? 2 : A >= 9 ? 1 : 0) : 0,
    glazing: sat(350 + O * 25 - Nn * 10 + (kind === BK.office ? 200 : 0), 250, 850), rooms, affordShare,
    shops: kind === BK.mixed ? Math.max(1, Math.floor((ctx.w * ctx.h * (E >= 10 ? 1000 : 700)) / 1000)) : kind === BK.shop ? ctx.w * ctx.h : 0,
    trees: sat(Cv - 10 + (O >> 3) + (ctx.parks < 3 ? 1 : 0) - (Th >> 2) + (r(9) % 3), 0, 5),
    craft: sat(P.edu[i] * 110 + Math.floor(P.skill[i] / 3) + C * 15 + (occ === OC.trades || occ === OC.engineer || occ === OC.professional || occ === OC.manager ? 120 : 0) + (r(7) % 120), 0, 1000) };
  const a = appraise(c, d, ctx, oldArea, v0, displaced, rateBp);
  // why this design: the strongest of the reasons that shaped it
  const w = [a.pr.units / 8 + (renter ? 4 : 0), (affordShare / 25) + (mem & MB.evicted ? 8 : 0), (facade === ctx.facade ? A : 0) + (floors <= ctx.floors + 1 ? 4 : 0),
    a.pr.shops * 3 + (E >> 1), (green ? 7 : 0) + (d.trees >> 1) + (Cv >> 2), floors >= hi && landmark ? O + R - 8 : 0, kids && rooms >= 3 ? 12 : 0,
    kind === BK.office || kind === BK.industrial ? 14 : 0, mem & MB.robbed && a.pr.shops ? 13 : 0];
  let motive = 0; for (let k = 1; k < w.length; k++) if (w[k] > w[motive]) motive = k;
  return store(c, j, i, d, a, motive);
}
// the owner's own design: the use, height and income-restricted share that give the best margin
function ownersDesign(c, j, ctx, oldArea, v0, displaced, rateBp) {
  const z = zoneOf(ctx); let best = null;
  for (const kind of z.uses) for (const aff of kind === BK.apartments || kind === BK.mixed ? [0, 200] : [0]) {
    const hi = maxFloors(ctx, kind, aff), lo = kind === BK.house || kind === BK.shop || kind === BK.industrial ? 1 : 2;
    for (let f = lo; f <= hi; f++) {
      const d = { kind, floors: f, podium: f >= 9 ? 3 : 0, cover: kind === BK.house ? houseCover(z, ctx) : z.cover, facade: kind === BK.office ? MAT.curtain_glass : kind === BK.industrial ? MAT.metal_panel : kind === BK.house || kind === BK.townhouse ? MAT.siding : MAT.stucco,
        roof: kind === BK.industrial ? MAT.metal_roof : kind === BK.house || kind === BK.townhouse ? MAT.shingle : MAT.membrane, tint: 128, green: 0, balcony: 0, glazing: kind === BK.office ? 700 : 420,
        rooms: kind === BK.house ? 3 : 2, affordShare: aff, shops: kind === BK.mixed ? ctx.w * ctx.h : kind === BK.shop ? ctx.w * ctx.h : 0, trees: 0, craft: 600 };
      const a = appraise(c, d, ctx, oldArea, v0, displaced, rateBp);
      if (!best || a.margin > best.a.margin) best = { d, a };
    }
  }
  return best;
}
function store(c, j, author, d, a, motive) {
  const R = c.proposals, p = R.alloc(); if (p < 0) return -1; const P = c.people;
  R.proj[p] = j; R.author[p] = author >= 0 ? P.sin[author] : -1; R.given[p] = author >= 0 ? P.given[author] : 0; R.family[p] = author >= 0 ? P.family[author] : 0; R.motive[p] = motive;
  R.kind[p] = d.kind; R.floors[p] = d.floors; R.podium[p] = d.podium; R.cover[p] = d.cover; R.facade[p] = d.facade; R.roof[p] = d.roof; R.tint[p] = d.tint; R.green[p] = d.green;
  R.balcony[p] = d.balcony; R.glazing[p] = d.glazing; R.rooms[p] = d.rooms; R.units[p] = a.pr.units; R.afford[p] = a.pr.afford; R.shops[p] = a.pr.shops; R.offices[p] = a.pr.offices;
  R.trees[p] = d.trees; R.craft[p] = d.craft; R.build[p] = a.cost.build; R.value[p] = a.val.value; R.margin[p] = a.margin; R.area[p] = a.g.area;
  R.feasible[p] = a.margin >= RULES.feasible ? 1 : 0; c.gov.dev.designs++;
  return p;
}
export const designOf = (c, p) => { const R = c.proposals; return { kind: R.kind[p], floors: R.floors[p], podium: R.podium[p], cover: R.cover[p], facade: R.facade[p], roof: R.roof[p], tint: R.tint[p], green: R.green[p], balcony: R.balcony[p], glazing: R.glazing[p], rooms: R.rooms[p], trees: R.trees[p] }; };

/* ------------------------------------------------------------------ choosing sites */
const developable = new Set([BK.house, BK.townhouse, BK.apartments, BK.mixed, BK.shop, BK.office, BK.industrial]);
function floorArea(T, b) { const cover = [420, 550, 600, 700, 750, 620, 800][T.kind[b]] ?? 600; return Math.floor((T.w[b] * T.h[b] * CELL_M * CELL_M * cover * T.floors[b]) / 1000); }
// who could start a project on building b, and on what terms: [developer, price to acquire, displaced households]
function siteTerms(c, b) {
  const W = c.world, T = W.buildings, D = W.dwellings, SP = W.spaces, o = T.owner[b];
  if (T.stage[b] || T.proj[b] || T.started[b] || T.civic[b] || !developable.has(T.kind[b]) || W.sites.includes(b)) return null;
  if (T.design[b] && c.epoch - T.opened[b] < 3650) return null;                                   // built here in the last ten years
  let hhOwned = 0, units = 0, homes = 0, sale = -1;
  for (const d of D.each()) if (D.bld[d] === b) { units++; if (D.hh[d] >= 0) homes++; if (D.owner[d] < E_F0) hhOwned++; if (D.forSale[d] && D.hh[d] < 0) sale = d; }
  for (const p of SP.each()) if (SP.bld[p] === b && SP.tenant[p] === o && !isRealty(c, o)) return null;   // the occupier owns it and is staying
  if (T.kind[b] === BK.house) { if (sale >= 0 && D.owner[sale] !== o) return { seller: D.owner[sale], price: D.price[sale], displaced: 0, dwelling: sale }; if (hhOwned) return null; }
  else if (hhOwned) return null;
  return { seller: o, price: 0, displaced: homes, dwelling: -1 };
}
function selectSites(c, d) {
  const W = c.world, T = W.buildings, Pj = c.projects, e = c.epoch, s = c.cfg.seed, G = c.gov;
  let active = 0; for (const j of Pj.each()) if (Pj.stage[j] >= ST.DESIGN && Pj.stage[j] <= ST.BUILD) active++;
  const bl = builders(c).length, pop = c.people.count, cap = Math.min(3 + Math.floor(pop / 5000), Math.max(1, bl * 2));
  const slots = Math.min(2 + (pop > 12000 ? 1 : 0), cap - active); if (slots <= 0) return;
  // a cheap first look: run down, empty, or worth less than its land
  const pre = [];
  for (const b of T.each()) {
    if (T.stage[b] || T.proj[b] || !developable.has(T.kind[b]) || T.civic[b]) continue;
    const struct = T.value[b] - T.land[b], empty = (T.units[b] || T.spaces[b]) && !T.occupied[b];
    const sc = (1000 - T.cond[b]) + (struct < T.land[b] * 0.6 ? 300 : 0) + (empty ? 250 : 0) + Math.min(60, Math.max(0, 2026 - T.built[b]) >> 1);
    if (T.cond[b] < 450 || struct < T.land[b] * 0.6 || empty) pre.push([sc, b]);
  }
  for (const j of Pj.each()) if (Pj.stage[j] === ST.LOT) pre.push([960, -1 - j]);   // cleared lots, first come first served
  pre.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const cands = [], plans = new Map();
  for (const [, key] of pre.slice(0, 14)) {
    let x0, y0, w, h, self = -1, terms, why, oldArea = 0, v0;
    if (key >= 0) { const b = key; terms = siteTerms(c, b); if (!terms) continue; x0 = T.x[b]; y0 = T.y[b]; w = T.w[b]; h = T.h[b]; self = b; oldArea = floorArea(T, b);
      v0 = terms.price || T.value[b]; why = T.kind[b] === BK.house && terms.dwelling >= 0 ? 3 : T.cond[b] < 450 ? 0 : !T.occupied[b] ? 2 : 1; }
    else { const j = -1 - key; x0 = Pj.x[j]; y0 = Pj.y[j]; w = Pj.w[j]; h = Pj.h[j]; terms = { seller: Pj.owner[j], price: 0, displaced: 0, dwelling: -1 }; why = 5; v0 = 0; }
    const ctx = siteContext(c, x0, y0, w, h, self); if (key < 0) v0 = ctx.land;
    const dev = developerFor(c, terms.seller, v0); if (dev < 0) continue;
    const rate = c.banks[c.books.bankOf[dev] ?? 0]?.rates.mortgage ?? 700;
    const best = ownersDesign(c, -1, ctx, oldArea, v0, terms.displaced, rate); if (!best) continue;
    const t = c.ownerTraits(dev - E_F0), hurdle = 150 - (trait(t, T_RISK) - 8) * 10 - ((G.newHousing || 0) > 0 ? 50 : 0) - (why === 0 ? 60 : why === 5 ? 40 : 0);
    if (best.a.margin < hurdle) continue;
    plans.set(key, { x0, y0, w, h, self, terms, why, oldArea, v0, dev, ctx });
    cands.push([Math.min(4000, best.a.margin), 1000 - (key >= 0 ? T.cond[key] : 0), Math.min(1023, Math.floor(ctx.land / 10000000)), key]);
  }
  if (!cands.length) return;
  const { admitted } = admitE1(cands, slots);
  for (const key of admitted) openProject(c, plans.get(key), key);
}
// the developer: a property company that owns the site, or the best-funded one that can buy it
function developerFor(c, seller, price) {
  if (isRealty(c, seller)) return seller;
  const F = c.firms, B = c.books; let best = -1, cash = 0;
  for (const f of F.each()) { if (F.status[f] !== 0 || F.sector[f] !== SK.realty) continue; const fe = E_F0 + f, cf = B.get(fe, AC.DEPOSITS) + B.get(fe, AC.SAVINGS); if (cf > cash) { cash = cf; best = fe; } }
  return best >= 0 && cash > price * 0.6 ? best : -1;
}

/* ------------------------------------------------------------------ the owner's share of a building's books */
// a property company's buildings and land are on its books in total; a building's share follows its value
function bookShare(c, owner, b) {
  const W = c.world, T = W.buildings, D = W.dwellings, B = c.books;
  const own = new Map(), all = new Map(), add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
  for (const d of D.each()) { add(all, D.bld[d], D.value[d]); if (D.owner[d] === owner) add(own, D.bld[d], D.value[d]); }
  const valueOf = (x) => (T.owner[x] === owner ? Math.max(0, T.value[x] - (all.get(x) || 0)) : 0) + (own.get(x) || 0);
  let tot = 0, landTot = 0;
  for (const x of T.each()) { if (T.stage[x] === 4) continue; const v = valueOf(x); if (v > 0) { tot += v; if (T.owner[x] === owner) landTot += T.land[x]; } }
  const v = valueOf(b), bv = Math.max(0, B.get(owner, AC.BUILDINGS)), lv = Math.max(0, B.get(owner, AC.LAND));
  return { building: tot > 0 ? Math.min(bv, Math.floor((bv * v) / tot)) : 0, land: landTot > 0 && T.owner[b] === owner ? Math.min(lv, Math.floor((lv * T.land[b]) / landTot)) : 0 };
}
// the developer buys the site: building and land from a company, or a house from its owner or estate
function acquire(c, j, plan) {
  const B = c.books, W = c.world, T = W.buildings, D = W.dwellings, Pj = c.projects, dev = plan.dev, seller = plan.terms.seller, b = plan.self;
  if (seller === dev) return true;
  if (b >= 0 && plan.terms.dwelling >= 0) {
    const dd = plan.terms.dwelling, price = D.price[dd]; if (!c.fund(dev, price, true)) return false;
    const land = Math.min(price, T.land[b]);
    B.pay(dev, seller, land, AC.LAND, AC.R_OTHER, K.property); if (price > land) B.pay(dev, seller, price - land, AC.BUILDINGS, AC.R_OTHER, K.property);
    removeAsset(c, seller, D.value[dd]); D.owner[dd] = dev; D.forSale[dd] = 0; T.owner[b] = dev; Pj.price[j] = price;
    if (seller >= E_H0 && seller < E_F0 && c.hh.alive[seller - E_H0] && c.hh.size[seller - E_H0] === 0) c.dissolveHousehold(seller - E_H0, "estate sold");
    return true;
  }
  const share = b >= 0 ? bookShare(c, seller, b) : { building: 0, land: Math.min(Math.max(0, B.get(seller, AC.LAND)), Pj.value0[j]) };
  const price = b >= 0 ? T.value[b] : plan.ctx.land; if (!c.fund(dev, price, true)) return false;
  const land = Math.min(price, b >= 0 ? T.land[b] : price);
  B.pay(dev, seller, land, AC.LAND, AC.R_OTHER, K.property); if (price > land) B.pay(dev, seller, price - land, AC.BUILDINGS, AC.R_OTHER, K.property);
  if (share.building > 0) B.post(seller, AC.R_OTHER, AC.BUILDINGS, share.building, K.property);
  if (share.land > 0 && B.get(seller, AC.LAND) >= share.land) B.post(seller, AC.R_OTHER, AC.LAND, share.land, K.property);
  if (b >= 0) { T.owner[b] = dev; for (const d of D.each()) if (D.bld[d] === b) { D.owner[d] = dev; } for (const h of c.hh.each()) if (c.hh.landlord[h] === seller && D.bld[c.hh.home[h]] === b) c.hh.landlord[h] = dev; }
  for (const f of c.firms.each()) if (c.firms.landlord[f] === seller && b >= 0 && W.spaces.bld[c.firms.space[f]] === b) c.firms.landlord[f] = dev;
  Pj.price[j] = price; return true;
}

/* ------------------------------------------------------------------ a project opens: the design call */
function openProject(c, plan, key) {
  const Pj = c.projects, W = c.world, T = W.buildings, e = c.epoch;
  const j = key >= 0 ? Pj.alloc() : -1 - key; if (j < 0) return;
  if (key < 0) for (const p of [...c.proposals.each()]) if (c.proposals.proj[p] === j) c.proposals.release(p);
  if (!acquire(c, j, plan)) { if (key >= 0) Pj.release(j); return; }
  Pj.stage[j] = ST.DESIGN; Pj.site[j] = plan.self; Pj.x[j] = plan.x0; Pj.y[j] = plan.y0; Pj.w[j] = plan.w; Pj.h[j] = plan.h; Pj.hood[j] = plan.ctx.hood; Pj.owner[j] = plan.dev; Pj.payer[j] = plan.dev;
  Pj.why[j] = plan.why; Pj.opened[j] = e; Pj.stageAt[j] = e; Pj.due[j] = e + RULES.callDays; Pj.design[j] = -1; Pj.builder[j] = -1; Pj.loan[j] = -1; Pj.bld[j] = -1; Pj.oldArea[j] = plan.oldArea; Pj.value0[j] = plan.v0;
  if (plan.self >= 0) { const b = plan.self; T.proj[b] = j + 1; Pj.oldKind[j] = T.kind[b]; Pj.oldFloors[j] = T.floors[b]; Pj.oldUnits[j] = T.units[b]; }
  const rate = c.banks[c.books.bankOf[plan.dev]]?.rates.mortgage ?? 700;
  // the owner's architects draw first; then the neighbours, the ones who care most and draw best admitted by E1
  const own = ownersDesign(c, j, plan.ctx, plan.oldArea, plan.v0, plan.terms.displaced, rate);
  store(c, j, -1, own.d, own.a, MV.maxed);
  const cands = []; for (const i of nearPeople(c, plan, 8, 4)) {
    const t = c.people.traits[i], interest = trait(t, T_CIVIC) + trait(t, T_O) + (trait(t, T_E) >> 1) - (trait(t, T_N) >> 1) + (c.people.need[i * 8 + 5] < 500 ? 3 : 0);   // those short of purpose take it up
    if (interest < 18 || c.people.tcLv[i] === 0) continue;
    cands.push([interest + (c.people.skill[i] >> 7), Math.min(62, (c.people.edu[i] * 110 + trait(t, T_C) * 15) >> 4), trustScore(c.P, c.people, "tc", i) >> 4, i]);
  }
  const { admitted } = admitE1(cands, RULES.proposers);
  for (const i of admitted) { const p = personalDesign(c, j, i, plan.ctx, plan.oldArea, plan.v0, plan.terms.displaced, rate); if (p >= 0) addMemory(c, i, M.drew_a_design, E_CITY + 0); }
  Pj.nprop[j] = 1 + admitted.length;
  c.event("design", `${ownerName(c, plan.dev)} plans to rebuild ${oldDescription(c, j)} in ${NEIGHBOURHOODS[plan.ctx.hood]} (${WHY[plan.why]}); ${admitted.length} neighbour${admitted.length === 1 ? "" : "s"} draw${admitted.length === 1 ? "s" : ""} designs for the site`, [j]);
}
// adults who live within rHome cells of the site or work within rWork of it
function nearPeople(c, plan, rHome, rWork) {
  const P = c.people, T = c.world.buildings, out = [], cx = plan.x0 + (plan.w >> 1), cy = plan.y0 + (plan.h >> 1);
  for (const i of P.each()) {
    if (P.status[i] <= 1 || P.hh[i] < 0) continue;
    const hb = homeBuilding(c, P.hh[i]); let ok = false;
    if (hb >= 0 && Math.max(Math.abs(T.x[hb] - cx), Math.abs(T.y[hb] - cy)) <= rHome) ok = true;
    if (!ok && P.emp[i] >= E_F0 && P.emp[i] < E_B0) { const f = P.emp[i] - E_F0, sp = c.firms.space[f]; if (sp >= 0) { const wb = c.world.spaces.bld[sp]; if (Math.max(Math.abs(T.x[wb] - cx), Math.abs(T.y[wb] - cy)) <= rWork) ok = true; } }
    if (ok && ageYears(c, i) >= 18) out.push(i);
  }
  return out;
}

/* ------------------------------------------------------------------ the vote */
function voterOf(c, i, j) {
  const P = c.people, H = c.hh, T = c.world.buildings, Pj = c.projects, t = P.traits[i], hh = P.hh[i], hb = homeBuilding(c, hh);
  const renter = H.tenure[hh] === 0, burden = renter ? Math.round((H.rent[hh] * 1000) / Math.max(1, H.inc[hh])) : 0;
  const north = hb >= 0 && T.y[hb] < Pj.y[j] && Pj.y[j] - T.y[hb] <= 4 && Math.abs(T.x[hb] - Pj.x[j]) <= 3;
  let competes = false; for (const f of c.firms.each()) if (c.firms.owner[f] === c.people.sin[i] && c.firms.status[f] === 0 && (SECTORS[c.firms.sector[f]].space === "shop")) { competes = true; break; }
  return { i, O: trait(t, T_O), C: trait(t, T_C), E: trait(t, T_E), A: trait(t, T_A), Nn: trait(t, T_N), Cv: trait(t, T_CIVIC), renter, burden, north, competes, mem: memBits(c, i),
    social: P.need[i * 8 + 4], leisure: P.need[i * 8 + 6], tc: P.tcLv[i], tenant: hb >= 0 && hb === Pj.site[j], hh, friends: [P.friend[i * 4], P.friend[i * 4 + 1], P.friend[i * 4 + 2], P.friend[i * 4 + 3], P.partner[i]] };
}
export function utility(c, v, p, ctx) {
  const R = c.proposals, floors = R.floors[p], author = R.author[p];
  let u = 0;
  if (v.north) u -= Math.trunc((Math.max(0, floors - 3) * (v.Nn + 4)) / (v.renter ? 2 : 1));         // the winter sun a tall building takes from the homes north of it
  u -= Math.trunc((Math.max(0, floors - ctx.floors - 1) * v.A) / 4);                                // a jump in scale over the street
  u += Math.trunc((Math.min(40, R.units[p] >> 2) * (v.renter ? (v.burden > 300 ? 3 : 2) : 1)) / 2);
  u += Math.trunc((R.afford[p] * (v.Cv + (v.mem & MB.evicted ? 10 : 0) + (v.mem & MB.rentUp ? 6 : 0) + (v.burden > 400 ? 8 : 0))) / 8);
  u += Math.trunc((R.shops[p] * (v.E + (v.social < 500 ? 4 : 0) - (v.competes ? 8 : 0))) / 2) + (v.mem & MB.robbed && R.shops[p] ? 6 : 0);
  if (R.facade[p] === ctx.facade) u += (v.A >> 1) + (v.C >> 2); else if (BOLD.includes(R.facade[p])) u += v.O - 8;
  u += R.green[p] * ((v.Cv >> 1) + (v.leisure < 450 ? 4 : 0)) + R.trees[p] * 2 + (R.balcony[p] ? v.E >> 2 : 0);
  u += Math.trunc(R.craft[p] / 100);
  const as = c.slotOf(author); if (author >= 0 && (author === c.people.sin[v.i] || v.friends.includes(author) || (as >= 0 && c.people.hh[as] === v.hh))) u += 14;
  if (author < 0) u -= (2 - Math.min(2, v.tc)) * 4;                                                // the owner's design, to those who do not trust the city
  return u;
}
function review(c, j) {
  const Pj = c.projects, R = c.proposals, P = c.people, s = c.cfg.seed, e = c.epoch;
  const props = []; for (const p of R.each()) if (R.proj[p] === j) props.push(p);
  const plan = { x0: Pj.x[j], y0: Pj.y[j], w: Pj.w[j], h: Pj.h[j] }, ctx = siteContext(c, plan.x0, plan.y0, plan.w, plan.h, Pj.site[j]);
  const voters = [];
  for (const i of nearPeople(c, plan, 8, 4)) {
    const v = voterOf(c, i, j), t = P.traits[i];
    if ((v.tc === 0 && !v.tenant) || 8 + trait(t, T_CIVIC) + (trait(t, T_E) >> 1) + (v.tenant ? 12 : 0) < 16) continue;   // those who care enough take part
    voters.push(v);
  }
  const approvals = new Map(props.map((p) => [p, 0])), approvedBy = new Map(props.map((p) => [p, []]));
  for (const v of voters) {
    const tau = 4 + ((v.Nn - 8) >> 1) + (v.tenant ? 6 : 0), us = props.map((p) => utility(c, v, p, ctx)), top = Math.max(...us), slack = 3 + (v.A >> 2);
    props.forEach((p, k) => { if (us[k] >= tau && us[k] >= top - slack) { approvals.set(p, approvals.get(p) + 1); approvedBy.get(p).push(v.i); } });
  }
  for (const p of props) R.approvals[p] = approvals.get(p);
  Pj.voters[j] = voters.length; c.gov.dev.votes += voters.length;
  const n = Math.max(1, voters.length), qualified = props.filter((p) => R.feasible[p] && R.approvals[p] * 1000 >= n * RULES.approveShare);
  let win = -1, runnerUp = null;
  if (qualified.length) { const res = admitE1(qualified.map((p) => [R.approvals[p], Math.max(0, R.margin[p] + 2000), R.craft[p], p]), 1); win = res.admitted[0]; runnerUp = res.price; }
  else { const own = props.find((p) => R.author[p] < 0); if (own !== undefined && R.margin[own] >= 120 && R.approvals[own] * 1000 >= n * RULES.ownerShare) win = own; }
  const where = NEIGHBOURHOODS[Pj.hood[j]];
  if (win < 0) {
    shelve(c, j, `None of the ${props.length} designs for ${oldDescription(c, j)} in ${where} won enough of the ${voters.length} neighbours who took part`);
    for (const p of props) { const a = c.slotOf(R.author[p]); if (a >= 0) addMemory(c, a, M.my_design_was_passed_over); }
    return;
  }
  R.won[win] = 1; Pj.design[j] = win;
  for (const p of props) { const a = c.slotOf(R.author[p]); if (a < 0) continue; if (p === win) { addMemory(c, a, M.my_design_was_chosen, E_CITY); P.cCo[a] = Math.min(255, P.cCo[a] + 4); P.need[a * 8 + 5] = Math.min(1000, P.need[a * 8 + 5] + 200); } else addMemory(c, a, M.my_design_was_passed_over); }
  for (const i of approvedBy.get(win)) P.cCo[i] = Math.min(255, P.cCo[i] + 1);
  c.event("design", `${voters.length} neighbours choose ${possessive(authorName(c, win))} design for ${where}: ${describeDesign(c, win)}, for ${MOTIVES[R.motive[win]]} (${R.approvals[win]} approve${runnerUp ? `, against ${R.approvals[runnerUp[3]]} for the next` : ""})`, [j]);
  if (!financeProject(c, j, win)) return;
  // the losing designs are kept a while for the record, then let go (developMonth)
  startNotice(c, j);
}
function shelve(c, j, why) {
  const Pj = c.projects, T = c.world.buildings, b = Pj.site[j];
  Pj.stage[j] = b >= 0 ? ST.SHELVED : ST.LOT; Pj.stageAt[j] = c.epoch; c.gov.dev.shelved++;
  if (b >= 0) { T.proj[b] = 0; T.stage[b] = 0; c.event("design", `${why}; ${ownerName(c, Pj.owner[j])} shelves the project`, [j]); if (T.cond[b] < 520) renovate(c, j, b); }
  else c.event("design", `${why}; the lot stays empty for now`, [j]);
}
// the alternative to rebuilding: a renovation contract, a retail sale like any construction in Washington
function renovate(c, j, b) {
  const T = c.world.buildings, B = c.books, F = c.firms, owner = T.owner[b], bl = builders(c); if (!bl.length) return;
  const net = floorArea(T, b) * 50 * (1000 - T.cond[b]), f = bestBuilder(c, bl), tax = ppm(net, taxRate(c));
  if (!c.fund(owner, net + tax, true)) { c.event("design", `${ownerName(c, owner)} shelves its plans for ${oldDescription(c, j)} and cannot afford to renovate`, [j]); return; }
  contractPay(c, owner, f, net, tax);
  const before = T.cond[b]; T.cond[b] = 950; T.value[b] = Math.round(T.land[b] + ((T.value[b] - T.land[b]) * (500 + 475)) / (500 + (before >> 1)));
  Pj_set(c, j, ST.RENOVATED); c.gov.dev.renovated++;
  c.event("construction", `${ownerName(c, owner)} renovates ${oldDescription(c, j)} in ${NEIGHBOURHOODS[T.hood[b]]} instead, for ${money(net + tax)} with ${c.names.firm(f)}`, [j]);
}
const Pj_set = (c, j, st) => { c.projects.stage[j] = st; c.projects.stageAt[j] = c.epoch; };
// a contract payment: the owner pays the price and the sales tax; the builder owes the tax to the State and buys its materials
function contractPay(c, owner, f, net, tax, expense = false) {
  const B = c.books, F = c.firms, be = E_F0 + f;
  B.pay(owner, be, net + tax, expense ? AC.X_PURCHASES : AC.BUILDINGS, AC.R_SALES, K.construction);
  if (expense) B.post(owner, AC.X_TAX_SALES, AC.X_PURCHASES, tax, K.tax_accrual);
  B.post(be, AC.R_SALES, AC.SALES_TAX_PAY, tax, K.tax_accrual, E_STATE); c.accrueSalesTax(be, tax);
  F.mRev[f] += net; F.ytdGross[f] += net;
  const out = Math.round((net * RULES.materialsOut) / 1000); if (out > 0 && c.fund(be, out, true)) B.pay(be, E_ROW, out, AC.X_COGS, AC.R_SALES, K.purchase);
}

/* ------------------------------------------------------------------ the money: equity, and a construction loan admitted by E1 */
function financeProject(c, j, p) {
  const Pj = c.projects, R = c.proposals, B = c.books, F = c.firms, owner = Pj.owner[j], e = c.epoch;
  const g = geometry(designOf(c, p), Pj.w[j], Pj.h[j]), cost = costOf(designOf(c, p), g, Pj.oldArea[j]);
  Pj.build[j] = cost.build; Pj.demo[j] = cost.demo; Pj.minDays[j] = minDays(R.floors[p], g.area);
  const total = cost.build + cost.demo + ppm(cost.build + cost.demo, taxRate(c)); Pj.equity[j] = Math.ceil((total * RULES.equity) / 1000 / 100) * 100;
  const cash = B.get(owner, AC.DEPOSITS) + B.get(owner, AC.SAVINGS);
  if (cash < Pj.equity[j] * 0.6) { shelve(c, j, `${ownerName(c, owner)} cannot raise its share of the ${money(total)} cost of ${oldDescription(c, j)}'s replacement`); return false; }
  const f = owner - E_F0, month = Math.floor(e / 30), home = B.bankOf[owner], SLOTS = [2, 1, 1];
  const offers = [];
  c.banks.forEach((bank, k) => {
    if (bank.devMonth !== month) { bank.devMonth = month; bank.devLoans = 0; }
    if (bank.fear > 300 || bank.devLoans >= (SLOTS[k] ?? 1) || F.kbLv[f] < 1) return;
    offers.push([k === home ? 1 : 0, 1000 - bank.fear, Math.min(1000, Math.floor((cash * 1000) / Math.max(1, total))), k]);
  });
  let lender = -1, rate = 0;
  if (offers.length) { const k = admitE1(offers, 1).admitted[0], bank = c.banks[k]; lender = k; rate = bank.rates.business + 50 + (k === home ? 0 : 25); bank.approvals++; bank.devLoans++; }
  else { const bank = c.banks[home]; if (bank) bank.denials++; if (R.margin[p] >= 120) { lender = ROW_LENDER; rate = (bank ? bank.rates.prime : 750) + 300; } }
  if (lender < 0) { shelve(c, j, `No lender would finance the replacement of ${oldDescription(c, j)}`); return false; }
  const L = c.loans, l = L.alloc(); if (l < 0) return false;
  L.status[l] = 1; L.bank[l] = lender; L.type[l] = 1; L.who[l] = owner; L.prin[l] = 0; L.rate[l] = rate; L.term[l] = 360; L.col[l] = -1; L.orig[l] = e; L.pay[l] = 0; L.due[l] = 2000000000; L.lim[l] = 0;
  Pj.loan[j] = l; Pj.credit[j] = total - Pj.equity[j]; Pj.rate[j] = rate;
  c.event("finance", `${lender === ROW_LENDER ? "National lenders" : c.banks[lender].short} commit${lender === ROW_LENDER ? "" : "s"} ${money(Pj.credit[j])} of construction credit to ${ownerName(c, owner)} at ${(rate / 100).toFixed(2)}%`, [j]);
  return true;
}

/* ------------------------------------------------------------------ the tenants: notice and relocation */
function startNotice(c, j) {
  const Pj = c.projects, W = c.world, T = W.buildings, D = W.dwellings, SP = W.spaces, H = c.hh, b = Pj.site[j], e = c.epoch;
  if (b < 0) { startDemolition(c, j); return; }
  let homes = 0, firms = 0;
  for (const d of D.each()) if (D.bld[d] === b && D.hh[d] >= 0) { const h = D.hh[d]; homes++; H.demoAt[h] = e + RULES.noticeDays; for (const i of members(c, h)) { addMemory(c, i, M.my_home_is_to_be_torn_down, Pj.owner[j]); c.people.cDe[i] = Math.min(255, c.people.cDe[i] + 1); c.people.lDe[i] = Math.min(255, c.people.lDe[i] + 2); } }
  for (const p of SP.each()) if (SP.bld[p] === b) { if (SP.tenant[p] >= 0) firms++; else SP.tenant[p] = -2; }
  T.stage[b] = 2; Pj_set(c, j, ST.NOTICE); Pj.due[j] = e + (homes ? RULES.noticeDays : firms ? RULES.commercialNotice : 0);
  W.rev++;
  if (homes || firms) c.event("notice", `${homes ? `${homes} household${homes > 1 ? "s" : ""}` : ""}${homes && firms ? " and " : ""}${firms ? `${firms} business${firms > 1 ? "es" : ""}` : ""} in ${oldDescription(c, j)} receive${homes + firms === 1 ? "s" : ""} notice: it comes down in ${homes ? RULES.noticeDays : RULES.commercialNotice} days`, [j]);
}
function relocate(c, j, d) {
  const Pj = c.projects, W = c.world, D = W.dwellings, SP = W.spaces, H = c.hh, F = c.firms, B = c.books, b = Pj.site[j], e = c.epoch, last = e >= Pj.due[j];
  const lookToday = last || d.wd === 3 || d.wd === 6 || Pj.due[j] - e < 14;
  if (lookToday) for (const dd of D.each()) {
    if (D.bld[dd] !== b || D.hh[dd] < 0) continue;
    const h = D.hh[dd], budget = Math.round(H.inc[h] * (last ? 0.6 : Pj.due[j] - e < 30 ? 0.45 : 0.36)), alt = findHome(c, h, budget);
    if (alt >= 0) {
      const he = E_H0 + h, low = H.inc[h] <= (c.gov.lowIncome || 0);
      moveInto(c, h, alt); H.demoAt[h] = 0; Pj.moved[j]++; c.gov.dev.relocated++;
      if (low) {                                                  // relocation assistance: half from the owner, half from the city
        const half = RULES.relocation >> 1;
        if (c.fund(Pj.owner[j], half, true)) { B.pay(Pj.owner[j], he, half, AC.X_OTHER, AC.R_TRANSFER, K.transfer); Pj.relief[j] += half; }
        if (c.fund(E_CITY, half)) { B.pay(E_CITY, he, half, AC.X_TRANSFER, AC.R_TRANSFER, K.transfer); Pj.relief[j] += half; c.gov.dev.relief += half; }
      }
    } else if (last) { for (const i of members(c, h)) addMemory(c, i, M.was_evicted, Pj.owner[j]); H.demoAt[h] = 0; Pj.left[j]++; c.gov.dev.left++; leaveCity(c, h, "when their building was torn down"); }
  }
  // businesses look for premises of the same kind nearby
  for (const p of SP.each()) {
    if (SP.bld[p] !== b || SP.tenant[p] < 0) continue;
    const fe = SP.tenant[p], f = fe - E_F0;
    if (fe < E_F0 || fe >= E_B0 || !F.alive[f] || F.status[f] === 1) { SP.tenant[p] = -2; continue; }
    if (F.space[f] !== p) { SP.tenant[p] = -2; F.nspace[f] = Math.max(1, F.nspace[f] - 1); continue; }        // a second space: given up
    const alt = premisesFor(c, p); if (alt < 0 && !last) continue;
    if (alt < 0) { SP.tenant[p] = -2; Pj.closed[j]++; c.gov.dev.closed++; c.closeFirm(f, "lost its premises to redevelopment"); continue; }
    SP.tenant[p] = -2; SP.tenant[alt] = fe; F.space[f] = alt; F.landlord[f] = W.buildings.owner[SP.bld[alt]];
    let rent = 0; for (const q of SP.each()) if (SP.tenant[q] === fe && W.buildings.owner[SP.bld[q]] !== fe) rent += SP.rent[q]; F.rentDue[f] = rent;
    const bl = builders(c); if (bl.length) { const net = 1500000, tax = ppm(net, taxRate(c)), bf = bestBuilder(c, bl); if (c.fund(fe, net + tax, true)) contractPay(c, fe, bf, net, tax, true); }
    c.event("move", `${c.names.firm(f)} moves to new premises in ${W.hoodName(W.frontCell(SP.bld[alt]))}`, [fe]);
  }
  let left = 0; for (const dd of D.each()) if (D.bld[dd] === b && D.hh[dd] >= 0) left++;
  for (const p of SP.each()) if (SP.bld[p] === b && SP.tenant[p] >= 0) left++;
  if (!left) startDemolition(c, j);
}
function premisesFor(c, p) {
  const W = c.world, SP = W.spaces, T = W.buildings, home = W.frontCell(SP.bld[p]); let best = -1, bd = 1e9;
  for (const q of SP.each()) {
    if (SP.tenant[q] !== -1 || SP.kind[q] !== SP.kind[p] || T.stage[SP.bld[q]]) continue;
    const fc = W.frontCell(SP.bld[q]), dd = Math.abs((fc & NMASK) - (home & NMASK)) + Math.abs((fc >> NSHIFT) - (home >> NSHIFT)); if (dd < bd) { bd = dd; best = q; }
  }
  return bd <= 24 ? best : -1;
}

/* ------------------------------------------------------------------ demolition and construction */
// the builder with the best name among those who can take the work
function bestBuilder(c, bl) { let best = bl[0]; for (const f of bl) if (trustScore(c.P, c.firms, "cr", f) > trustScore(c.P, c.firms, "cr", best)) best = f; return best; }
function pickBuilder(c, j) {
  const F = c.firms, Pj = c.projects, load = new Map(); for (const k of Pj.each()) if (Pj.stage[k] === ST.DEMOLISH || Pj.stage[k] === ST.BUILD) load.set(Pj.builder[k], (load.get(Pj.builder[k]) || 0) + 1);
  const cands = []; for (const f of builders(c)) { if ((load.get(f) || 0) >= Math.max(1, Math.floor(F.staff[f] / 6))) continue; cands.push([F.crLv[f], Math.floor(F.quality[f] / 4), Math.min(255, F.staff[f]), f]); }
  if (!cands.length) for (const f of builders(c)) cands.push([0, Math.floor(F.quality[f] / 4), Math.min(255, F.staff[f]), f]);
  return cands.length ? admitE1(cands, 1).admitted[0] : -1;
}
function startDemolition(c, j) {
  const Pj = c.projects, W = c.world, T = W.buildings, B = c.books, b = Pj.site[j], owner = Pj.owner[j];
  Pj.builder[j] = pickBuilder(c, j); if (Pj.builder[j] < 0) return;                 // no builder in town: wait
  if (b >= 0) {
    const share = bookShare(c, owner, b);                                          // the old building's value leaves the owner's books
    if (share.building > 0) B.post(owner, AC.X_OTHER, AC.BUILDINGS, share.building, K.property);
    T.stage[b] = 3; T.progress[b] = 0;
    for (const dd of W.dwellings.each()) if (W.dwellings.bld[dd] === b) W.dwellings.forSale[dd] = 0;
  }
  Pj_set(c, j, ST.DEMOLISH); Pj.hours[j] = Math.floor(Pj.oldArea[j] / 2) + 40; Pj.done[j] = 0; Pj.progress[j] = 0; W.rev++;
  if (Pj.moved[j] || Pj.left[j]) c.event("notice", `${Pj.moved[j]} household${Pj.moved[j] === 1 ? "" : "s"} moved out of ${oldDescription(c, j)}${Pj.left[j] ? `; ${Pj.left[j]} left Port Alder` : ""}${Pj.relief[j] ? `; ${money(Pj.relief[j])} of relocation assistance was paid` : ""}`, [j]);
  c.event("demolition", `${c.names.firm(Pj.builder[j])} begins taking down ${oldDescription(c, j)} in ${NEIGHBOURHOODS[Pj.hood[j]]}`, [j]);
  if (b >= 0) { const P = c.people, cx = T.x[b], cy = T.y[b]; for (const i of nearPeople(c, { x0: cx, y0: cy, w: T.w[b], h: T.h[b] }, 3, 0)) if (P.hh[i] >= 0 && c.epoch - c.hh.moved[P.hh[i]] > 730) addMemory(c, i, M.saw_a_familiar_building_come_down, E_F0 + Pj.builder[j]); }
}
function finishDemolition(c, j) {
  const Pj = c.projects, W = c.world, T = W.buildings, b = Pj.site[j];
  if (b >= 0) { W.remove(b); Pj.site[j] = -1; c.gov.dev.demolished++; }
  const p = Pj.design[j];
  if (p < 0) { Pj_set(c, j, ST.LOT); Pj.builder[j] = -1; c.event("demolition", `The site in ${NEIGHBOURHOODS[Pj.hood[j]]} is cleared`, [j]); return; }
  const nb = W.raise(Pj.x[j], Pj.y[j], Pj.w[j], Pj.h[j], designOf(c, p), (c.proposals.facade[p] << 8) | (c.proposals.tint[p] & 255));
  if (nb < 0) { Pj_set(c, j, ST.LOT); return; }
  T.owner[nb] = Pj.owner[j]; T.proj[nb] = j + 1; T.design[nb] = p + 1; T.built[nb] = c.today.y; Pj.bld[j] = nb;
  groundBreaking(c, j, p);
  Pj_set(c, j, ST.BUILD); Pj.hours[j] = c.proposals.area[p] * 5; Pj.done[j] = 0; Pj.progress[j] = 0;
  c.event("construction", `${c.names.firm(Pj.builder[j])} breaks ground on ${buildingName(c, nb)} in ${NEIGHBOURHOODS[Pj.hood[j]]}: ${describeDesign(c, p)}`, [j]);
}
// breaking ground: the design team's fees to a professional firm in town, the city's building permit, and the honorarium
// the developer pays the citizen whose design won (the city's own rule: $2,500)
function groundBreaking(c, j, p) {
  const Pj = c.projects, B = c.books, F = c.firms, owner = Pj.payer[j], R = c.proposals, soft = softCosts(Pj.build[j] + Pj.demo[j]);
  const pros = []; for (const f of F.each()) if (F.status[f] === 0 && F.sector[f] === SK.professional) pros.push([F.crLv[f], Math.floor(F.quality[f] / 4), Math.min(255, F.staff[f]), f]);
  if (pros.length && c.fund(owner, soft.design, true)) { const f = admitE1(pros, 1).admitted[0]; B.pay(owner, E_F0 + f, soft.design, AC.BUILDINGS, AC.R_SALES, K.purchase); F.mRev[f] += soft.design; F.ytdGross[f] += soft.design; Pj.soft[j] += soft.design; }
  if (c.fund(owner, soft.permit, true)) { B.pay(owner, E_CITY, soft.permit, AC.BUILDINGS, AC.R_FEES, K.fee); Pj.soft[j] += soft.permit; }
  const a = R.author[p], P = c.people;
  if (a >= 0 && P.alive[a] && P.hh[a] >= 0 && c.fund(owner, 250000, true)) { B.pay(owner, E_H0 + P.hh[a], 250000, AC.BUILDINGS, AC.R_OTHER, K.transfer); Pj.soft[j] += 250000; }
}
// today's work: each builder's staff hours go to its projects; a project cannot go faster than its sequence allows
function labour(c) {
  const Pj = c.projects, F = c.firms, T = c.world.buildings, byB = new Map();
  for (const j of Pj.each()) {
    if (Pj.stage[j] !== ST.DEMOLISH && Pj.stage[j] !== ST.BUILD) continue;
    let f = Pj.builder[j]; if (f < 0 || !F.alive[f] || F.status[f] === 1) { f = pickBuilder(c, j); Pj.builder[j] = f; if (f < 0) continue; }
    if (!byB.has(f)) byB.set(f, []); byB.get(f).push(j);
  }
  for (const [f, list] of byB) {
    let avail = Math.max(0, F.capa[f] - F.sold[f]); if (!avail) continue;
    const share = Math.floor(avail / list.length);
    for (const j of list) {
      const days = Pj.stage[j] === ST.DEMOLISH ? 8 + Pj.oldFloors[j] * 3 : Pj.minDays[j], cap = Math.ceil(Pj.hours[j] / Math.max(1, days)) + 1;
      const use = Math.min(share, cap, Math.max(0, Pj.hours[j] - Pj.done[j])); if (use <= 0) continue;
      Pj.done[j] += use; F.sold[f] += use; avail -= use;
      Pj.progress[j] = Math.min(1000, Math.floor((Pj.done[j] * 1000) / Math.max(1, Pj.hours[j])));
      const b = Pj.stage[j] === ST.DEMOLISH ? Pj.site[j] : Pj.bld[j]; if (b >= 0) T.progress[b] = Pj.progress[j];
      if (Pj.stage[j] === ST.BUILD && Pj.progress[j] >= 700 && !Pj.topped[j]) { Pj.topped[j] = 1; c.event("construction", `${buildingName(c, Pj.bld[j])} tops out at ${c.proposals.floors[Pj.design[j]]} storeys`, [j]); }
    }
  }
}
// the builder is paid what it has earned, with sales tax: from the developer's own funds first, then the construction loan
function draw(c, j, all = false) {
  const Pj = c.projects, B = c.books, L = c.loans, f = Pj.builder[j]; if (f < 0) return;
  const owner = Pj.payer[j], earned = Pj.stage[j] === ST.DEMOLISH ? Math.floor((Pj.demo[j] * Pj.progress[j]) / 1000) : Pj.demo[j] + (all ? Pj.build[j] : Math.floor((Pj.build[j] * Pj.progress[j]) / 1000));
  const due = earned - Pj.paid[j]; if (due <= 0) return;
  const tax = ppm(due, taxRate(c)), need = due + tax;
  let fromOwn = Math.max(0, Math.min(need, Pj.equity[j] - (Pj.paid[j] + Pj.tax[j]))), fromLoan = need - fromOwn;
  const l = Pj.loan[j], live = l >= 0 && L.alive[l] && L.status[l] === 1 && L.who[l] === owner;
  if (fromLoan > 0 && (!live || Pj.drawn[j] + fromLoan > Pj.credit[j] + 100)) { fromOwn += fromLoan; fromLoan = 0; }
  if (fromOwn > 0 && !c.fund(owner, fromOwn, true)) {
    if (live && Pj.drawn[j] + need <= Pj.credit[j] + Pj.equity[j]) { fromLoan += fromOwn; fromOwn = 0; } else { c.event("finance", `${ownerName(c, owner)} falls behind on paying ${c.names.firm(f)}`, [j]); return; }
  }
  if (fromLoan > 0) { B.pay(lenderOf(c, l), owner, fromLoan, AC.LOAN_BIZ, AC.L_BIZ, K.loan); L.prin[l] += fromLoan; Pj.drawn[j] += fromLoan; }
  contractPay(c, owner, f, due, tax, Pj.design[j] < 0);
  Pj.paid[j] += due; Pj.tax[j] += tax;
}
// the construction loan's interest is capitalised: drawn from the loan, paid to the lender, added to the building's cost
function capitalise(c, j) {
  const Pj = c.projects, B = c.books, L = c.loans, l = Pj.loan[j]; if (l < 0 || !L.alive[l] || L.status[l] !== 1 || L.prin[l] <= 0) return;
  const owner = Pj.payer[j], le = lenderOf(c, l), i = Math.round((L.prin[l] * L.rate[l]) / 120000); if (i <= 0) return;
  B.pay(le, owner, i, AC.LOAN_BIZ, AC.L_BIZ, K.loan); L.prin[l] += i;
  B.pay(owner, le, i, AC.BUILDINGS, AC.R_INTEREST, K.interest); Pj.interest[j] += i; L.due[l] = 2000000000;
}
// the building opens: its homes and premises, rents from the street, the income-restricted homes, the loan's 30 years
function openBuilding(c, j) {
  const Pj = c.projects, R = c.proposals, W = c.world, T = W.buildings, D = W.dwellings, SP = W.spaces, L = c.loans, s = c.cfg.seed, e = c.epoch, b = Pj.bld[j], p = Pj.design[j];
  draw(c, j, true);
  const ctx = siteContext(c, T.x[b], T.y[b], T.w[b], T.h[b], b), d = designOf(c, p), rate = c.banks[0].rates.mortgage;
  const pr = { units: R.units[p], afford: R.afford[p], shops: R.shops[p], offices: R.offices[p], works: R.kind[p] === BK.industrial ? 1 : 0 }, val = valueOf(c, { ...d, affordShare: 0 }, ctx, pr, rate);
  let units = Math.min(pr.units, D.cap - D.count - 64), spaces = Math.min(pr.shops + pr.offices + pr.works, SP.cap - SP.count - 16);
  units = Math.max(0, units); spaces = Math.max(0, spaces);
  T.units[b] = units; T.spaces[b] = spaces; T.afford[b] = Math.min(pr.afford, units); T.stage[b] = 0; T.progress[b] = 1000; T.opened[b] = e; T.cond[b] = 1000; T.proj[b] = 0;
  T.land[b] = ctx.land; T.value[b] = Math.max(ctx.land + Pj.paid[j], val.value);
  const forSale = R.kind[p] === BK.house || R.kind[p] === BK.townhouse;
  for (let u = 0; u < units; u++) {
    const dd = D.alloc(); if (dd < 0) break;
    D.bld[dd] = b; D.hh[dd] = -1; D.owner[dd] = T.owner[b]; D.rooms[dd] = R.kind[p] === BK.townhouse ? 3 : R.kind[p] === BK.house ? d.rooms : Math.max(1, d.rooms + ((u % 3) - 1));   // the plan mixes smaller and larger units evenly
    D.value[dd] = Math.round(T.value[b] / Math.max(1, units + spaces)); D.afford[dd] = u < T.afford[b] ? 1 : 0;
    D.rent[dd] = D.afford[dd] ? Math.min(val.rent, c.gov.affordRent || val.rent) : Math.round(((ctx.rentRoom * D.rooms[dd] * 1100) / 1000) / 500) * 500; D.rentSince[dd] = e;
    if (forSale) { D.forSale[dd] = 1; D.price[dd] = Math.round(D.value[dd] / 100000) * 100000; }
  }
  const kinds = []; for (let k = 0; k < pr.shops; k++) kinds.push(0); for (let k = 0; k < pr.offices; k++) kinds.push(1); if (pr.works) kinds.push(2);
  for (let k = 0; k < spaces; k++) { const q = SP.alloc(); if (q < 0) break; SP.bld[q] = b; SP.kind[q] = kinds[k]; SP.tenant[q] = -1; SP.floor[q] = kinds[k] === 1 ? 1 + (k % Math.max(1, R.floors[p])) : 0; SP.rent[q] = Math.round(((kinds[k] === 0 ? ctx.shopRent : kinds[k] === 1 ? ctx.officeRent : ctx.workRent) * 1100) / 1000 / 100) * 100; }
  // street trees along its front, where the street has room
  if (R.trees[p]) { let n = R.trees[p]; for (let y = T.y[b] - 1; y <= T.y[b] + T.h[b] && n > 0; y++) for (let x = T.x[b] - 1; x <= T.x[b] + T.w[b] && n > 0; x++) { if (x < 0 || y < 0 || x >= N || y >= N) continue; const cc = cellOf(x, y); if (W.road[cc] === 1 && !W.tree[cc]) { W.tree[cc] = 4; n--; } } }
  W.settle(b);
  // the construction loan becomes a thirty-year loan
  const l = Pj.loan[j]; if (l >= 0 && L.alive[l] && L.status[l] === 1) { if (L.prin[l] > 0) { L.term[l] = 360; L.pay[l] = annuity(L.prin[l], L.rate[l], 360); L.due[l] = e + 30; } else { L.status[l] = 3; L.release(l); Pj.loan[j] = -1; } }
  Pj_set(c, j, ST.OPEN); c.gov.dev.built++; c.gov.dev.homes += units; c.gov.dev.afford += T.afford[b];
  const a = R.author[p], P = c.people, name = buildingName(c, b);
  if (a >= 0 && P.alive[a]) { addMemory(c, a, M.my_design_was_chosen, E_CITY, 127); P.cCo[a] = Math.min(255, P.cCo[a] + 3); }
  for (const i of nearPeople(c, { x0: T.x[b], y0: T.y[b], w: T.w[b], h: T.h[b] }, 5, 0)) if (trait(c.people.traits[i], T_O) >= 9) addMemory(c, i, M.a_new_building_opened_nearby, E_CITY);
  c.event("opening", `${name} opens in ${NEIGHBOURHOODS[T.hood[b]]}${units ? `: ${units} home${units > 1 ? "s" : ""}${T.afford[b] ? ` (${T.afford[b]} income-restricted at ${money(c.gov.affordRent)} a month)` : ""}` : ""}${spaces ? `${units ? " and" : ":"} ${spaces} premises` : ""}; designed by ${authorName(c, p)} for ${MOTIVES[R.motive[p]]}; cost ${money(Pj.paid[j] + Pj.tax[j] + Pj.interest[j] + Pj.soft[j])}`, [j]);
  W.rev++;
}

/* ------------------------------------------------------------------ the city's day and month */
export function developDay(c, d, g) {
  const Pj = c.projects; if (!g.construction || !Pj) return;
  for (const j of [...Pj.each()]) {
    const st = Pj.stage[j];
    if (st >= ST.DESIGN && st <= ST.BUILD) syncOwner(c, j);
    if (st === ST.DESIGN && c.epoch >= Pj.due[j]) review(c, j);
    else if (st === ST.NOTICE) relocate(c, j, d);
  }
  labour(c);
  for (const j of [...Pj.each()]) {
    if (Pj.stage[j] === ST.DEMOLISH && Pj.progress[j] >= 1000) { draw(c, j); finishDemolition(c, j); }
    else if (Pj.stage[j] === ST.BUILD && Pj.progress[j] >= 1000) openBuilding(c, j);
  }
  if (d.d === 10) { abate(c, d); selectSites(c, d); }
}
// if the developer closed and its buildings were sold, the buyer carries the project on (and pays the builder from its own funds)
function syncOwner(c, j) {
  const Pj = c.projects, T = c.world.buildings, b = Pj.bld[j] >= 0 ? Pj.bld[j] : Pj.site[j]; if (b < 0) return;
  const o = T.owner[b]; if (o === Pj.owner[j]) return;
  Pj.owner[j] = o; Pj.payer[j] = o; Pj.loan[j] = -1; Pj.equity[j] = 1e15;
}
// derelict and empty: the city orders it taken down (and pays for it if its owner cannot)
function abate(c, d) {
  const W = c.world, T = W.buildings, Pj = c.projects, B = c.books;
  let n = 0;
  for (const b of [...T.each()]) {
    if (n >= 2 || T.cond[b] >= 120 || T.stage[b] || T.proj[b] || T.occupied[b] || T.civic[b] || !developable.has(T.kind[b]) || W.sites.includes(b)) continue;
    let tenants = 0; for (const p of W.spaces.each()) if (W.spaces.bld[p] === b && W.spaces.tenant[p] >= 0) tenants++; if (tenants) continue;
    let owned = 0; for (const dd of W.dwellings.each()) if (W.dwellings.bld[dd] === b && W.dwellings.owner[dd] < E_F0) owned++; if (owned) continue;
    const j = Pj.alloc(); if (j < 0) return;
    Pj.site[j] = b; Pj.x[j] = T.x[b]; Pj.y[j] = T.y[b]; Pj.w[j] = T.w[b]; Pj.h[j] = T.h[b]; Pj.hood[j] = T.hood[b]; Pj.owner[j] = T.owner[b]; Pj.why[j] = 4; Pj.opened[j] = c.epoch;
    Pj.design[j] = -1; Pj.loan[j] = -1; Pj.bld[j] = -1; Pj.oldKind[j] = T.kind[b]; Pj.oldFloors[j] = T.floors[b]; Pj.oldUnits[j] = T.units[b]; Pj.oldArea[j] = floorArea(T, b);
    Pj.demo[j] = Pj.oldArea[j] * 9000 + 1500000; Pj.equity[j] = 1e15; Pj.minDays[j] = 30;
    const canPay = T.owner[b] !== E_ROW && c.fund(T.owner[b], ppm(Pj.demo[j], 1000000 + taxRate(c)), true);
    Pj.payer[j] = canPay ? T.owner[b] : E_CITY; Pj.value0[j] = bookShare(c, T.owner[b], b).land;
    T.proj[b] = j + 1;
    startDemolition(c, j);
    if (Pj.builder[j] < 0) { T.proj[b] = 0; T.stage[b] = 0; Pj.release(j); continue; }
    c.gov.dev.abated++; n++;
    c.event("demolition", `The city orders the derelict ${T.floors[b]}-storey ${KIND_NOUN[T.kind[b]]} in ${NEIGHBOURHOODS[T.hood[b]]} taken down${canPay ? "" : "; its owner cannot pay, so the city does"}`, [j]);
  }
}
export function developMonth(c, d, g) {
  const Pj = c.projects, R = c.proposals; if (!Pj) return;
  incomes(c);
  for (const j of Pj.each()) if (Pj.stage[j] === ST.LOT) { const o = Pj.owner[j]; if (o >= E_F0 && o < E_B0 && (!c.firms.alive[o - E_F0] || c.firms.status[o - E_F0] === 1)) { Pj.owner[j] = E_ROW; Pj.value0[j] = 0; } }
  if (g.construction) {
    upkeep(c, d);
    for (const j of Pj.each()) if (Pj.stage[j] === ST.DEMOLISH || Pj.stage[j] === ST.BUILD) { capitalise(c, j); draw(c, j); }
  }
  // the record: losing designs are let go two months after their vote, closed projects after two years
  for (const p of [...R.each()]) { const j = R.proj[p]; if (!R.won[p] && Pj.alive[j] && Pj.stage[j] >= ST.NOTICE && c.epoch - Pj.stageAt[j] > 60) R.release(p); }
  for (const j of [...Pj.each()]) if ((Pj.stage[j] === ST.SHELVED || Pj.stage[j] === ST.RENOVATED) && c.epoch - Pj.stageAt[j] > 730) { for (const p of [...R.each()]) if (R.proj[p] === j && !R.won[p]) R.release(p); Pj.release(j); }
}
// buildings wear with age, emptiness, absent owners and the disorder on their street; property companies pay for upkeep
function upkeep(c, d) {
  const W = c.world, T = W.buildings, SP = W.spaces, F = c.firms, B = c.books, s = c.cfg.seed, e = c.epoch;
  const used = new Uint16Array(T.top), all = new Uint16Array(T.top);
  for (const p of SP.each()) { const b = SP.bld[p]; all[b]++; if (SP.tenant[p] >= 0) used[b]++; }
  for (const b of T.each()) {
    if (T.stage[b] >= 3 || T.civic[b] || !developable.has(T.kind[b])) continue;
    let wear = 2 + Math.floor(Math.max(0, d.y - T.built[b]) / 25);
    if (T.units[b] && !T.occupied[b]) wear += 6; else if (T.units[b] && T.occupied[b] * 2 < T.units[b]) wear += 2;
    if (all[b] && !used[b]) wear += 4;
    const o = T.owner[b]; if (o === E_ROW) wear += 3; else if (o >= E_F0 && o < E_B0 && F.alive[o - E_F0] && F.distress[o - E_F0] > 10) wear += 3;
    const fc = W.frontCell(b); if (fc >= 0) wear += c.vital[fc * 8 + 7] >> 2;
    const before = T.cond[b], damage = miner(0, wear, 70 * 12 * 3);   // a month's cycles against the building's life of cycles
    T.cond[b] = Math.max(0, Math.round(T.cond[b] - damage * 1000 * 3));
    if (before !== T.cond[b] && T.value[b] > T.land[b]) T.value[b] = Math.round(T.land[b] + ((T.value[b] - T.land[b]) * (500 + (T.cond[b] >> 1))) / (500 + (before >> 1)));
  }
  const bl = builders(c); if (!bl.length) return;
  const mine = new Map(); for (const b of T.each()) { if (T.stage[b] || !developable.has(T.kind[b])) continue; const o = T.owner[b]; if (!mine.has(o)) mine.set(o, []); mine.get(o).push(b); }
  for (const f of F.each()) {
    if (F.status[f] !== 0 || F.sector[f] !== SK.realty) continue;
    const fe = E_F0 + f, bv = B.get(fe, AC.BUILDINGS), list = mine.get(fe); if (bv <= 0 || !list) continue;
    const budget = Math.round((bv * (8 + trait(c.ownerTraits(f), T_C))) / 10000), bf = bestBuilder(c, bl), tax = ppm(budget, taxRate(c));
    if (budget <= 0 || !c.fund(fe, budget + tax, true)) continue;
    contractPay(c, fe, bf, budget, tax, true);
    list.sort((a, b) => T.cond[a] - T.cond[b] || a - b); let left = budget;
    for (const b of list) { if (left <= 0) break; const per = Math.max(1, Math.floor(floorArea(T, b) * 50)), pts = Math.min(1000 - T.cond[b], Math.floor(left / per)); if (pts <= 0) continue; const before = T.cond[b]; T.cond[b] += pts; left -= pts * per; if (T.value[b] > T.land[b]) T.value[b] = Math.round(T.land[b] + ((T.value[b] - T.land[b]) * (500 + (T.cond[b] >> 1))) / (500 + (before >> 1))); }
  }
}
// for the page: every project in a form a table can show
export function projectRows(c) {
  const Pj = c.projects, R = c.proposals, out = [];
  for (const j of Pj.each()) {
    const props = []; for (const p of R.each()) if (R.proj[p] === j) props.push({ p, author: authorName(c, p), design: describeDesign(c, p), motive: MOTIVES[R.motive[p]], approvals: R.approvals[p], margin: R.margin[p], feasible: !!R.feasible[p], won: !!R.won[p], craft: R.craft[p] });
    out.push({ j, stage: STAGES[Pj.stage[j]], why: WHY[Pj.why[j]], where: NEIGHBOURHOODS[Pj.hood[j]], x: Pj.x[j], y: Pj.y[j], w: Pj.w[j], h: Pj.h[j], owner: ownerName(c, Pj.owner[j]), old: oldDescription(c, j),
      opened: Pj.opened[j], stageAt: Pj.stageAt[j], due: Pj.due[j], progress: Pj.progress[j], voters: Pj.voters[j], builder: Pj.builder[j] >= 0 ? c.names.firm(Pj.builder[j]) : null,
      contract: Pj.build[j] + Pj.demo[j], paid: Pj.paid[j], tax: Pj.tax[j], interest: Pj.interest[j], soft: Pj.soft[j], drawn: Pj.drawn[j], credit: Pj.credit[j], moved: Pj.moved[j], left: Pj.left[j], closed: Pj.closed[j], relief: Pj.relief[j],
      building: Pj.bld[j], name: Pj.bld[j] >= 0 ? buildingName(c, Pj.bld[j]) : null, proposals: props.sort((a, b) => b.approvals - a.approvals || a.p - b.p) });
  }
  return out.sort((a, b) => b.stageAt - a.stageAt || b.j - a.j);
}
