// The ground, streets, parcels and buildings of Port Alder, made from the seed.
// SPDX-License-Identifier: GPL-3.0-only
import { N, CELLS, CELL_M, L, B, BKIND, MAT, NEIGHBOURHOODS } from "./citydata.js";
import { Slots, sat } from "./core.js";
import { SCALE, NSHIFT, NMASK, CoordArray, cellOf } from "./scale.js";
// the founding survey of the land draws from the city's founding census (law 12.42); nothing after genesis may
let DRAW = () => { throw new Error("the land is surveyed only at the founding"); };

export { cellOf };
export const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
export const ROAD = { NONE: 0, LOCAL: 1, ARTERIAL: 2, BRIDGE: 3, PROMENADE: 4 };
export const ARTERIAL_X = [16, 40, 64, 88, 112], ARTERIAL_Y = [12, 36, 60, 84, 108];
export const isStreetLine = (v, art) => art.includes(v) || art.some((a) => (v - a) % 6 === 0 && v > 2 && v < N - 3);

// integer value noise in [0, 1000): smoothstep interpolation of a lattice drawn from the founding census
export function vnoise(seed, salt, x, y, step) {
  const gx = Math.floor(x / step), gy = Math.floor(y / step), fx = x - gx * step, fy = y - gy * step;
  const v = (i, j) => DRAW(salt, i, j) % 1000;
  const s = (t) => (t * t * (3 * step - 2 * t)) / (step * step * step);        // smoothstep, IEEE arithmetic only
  const a = v(gx, gy), b = v(gx + 1, gy), c = v(gx, gy + 1), d = v(gx + 1, gy + 1), sx = s(fx), sy = s(fy);
  return Math.floor((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy);
}

export const BUILDING_SPEC = [["alive", Uint8Array], ["x", CoordArray], ["y", CoordArray], ["w", Uint8Array], ["h", Uint8Array], ["kind", Uint8Array], ["floors", Uint8Array],
  ["units", Uint16Array], ["spaces", Uint8Array], ["built", Int16Array], ["facade", Uint8Array], ["roof", Uint8Array], ["tint", Uint8Array], ["cond", Uint16Array],
  ["owner", Int32Array], ["value", Float64Array], ["land", Float64Array], ["hood", Uint8Array], ["civic", Uint8Array], ["occupied", Uint16Array], ["seed", Uint32Array], ["started", Int32Array],
  // redevelopment (develop.js): the stage a building is in (0 standing, 2 tenants on notice, 3 coming down, 4 going up), progress in
  // thousandths, the project and the winning design (each stored + 1, so 0 is none), and the design's features
  ["stage", Uint8Array], ["progress", Uint16Array], ["proj", Int32Array], ["design", Int32Array], ["cover", Uint16Array], ["podium", Uint8Array],
  ["green", Uint8Array], ["balcony", Uint8Array], ["glazing", Uint16Array], ["afford", Uint16Array], ["opened", Int32Array]];
export const DWELLING_SPEC = [["alive", Uint8Array], ["bld", Int32Array], ["hh", Int32Array], ["rent", Int32Array], ["rentSince", Int32Array], ["rooms", Uint8Array], ["forSale", Uint8Array], ["price", Float64Array], ["owner", Int32Array], ["value", Float64Array], ["afford", Uint8Array], ["vacM", Uint8Array]];
export const SPACE_SPEC = [["alive", Uint8Array], ["bld", Int32Array], ["kind", Uint8Array], ["tenant", Int32Array], ["rent", Int32Array], ["floor", Uint8Array]];
export const SPACE_KINDS = ["shop", "office", "industrial", "hotel", "clinic", "hospital", "bank", "civic", "school"];
export const CIVIC = ["", "City Hall", "Public Library", "Police Station", "Fire Station", "Transit Center", "Elementary School", "Middle School", "High School", "Community Center"];

export class World {
  constructor(seed, draw) {
    if (draw) DRAW = draw;
    this.seed = seed;
    this.land = new Uint8Array(CELLS); this.height = new Int32Array(CELLS); this.water = new Uint8Array(CELLS); this.road = new Uint8Array(CELLS);
    this.hood = new Uint8Array(CELLS); this.bldOf = new Int32Array(CELLS).fill(-1); this.landValue = new Int32Array(CELLS); this.tree = new Uint8Array(CELLS);
    this.cond = new Uint16Array(CELLS).fill(900);                                   // road condition
    this.buildings = new Slots(SCALE.buildings, BUILDING_SPEC); this.dwellings = new Slots(SCALE.dwellings, DWELLING_SPEC); this.spaces = new Slots(SCALE.spaces, SPACE_SPEC);
    this.shore = new Int16Array(N); this.rev = 0;                                   // rev: bumped whenever a building comes down or goes up
    this.makeGround(); this.makeStreets(); this.makeDistricts(); this.makeParcels(); this.makeRoutes(); this.valueLand();
  }
  makeGround() {
    const s = this.seed;
    for (let y = 0; y < N; y++) {
      let xs = 8 + Math.floor((vnoise(s, 0x5401, 0, y, 24) - 500) / 160);
      if (y >= 92 && y <= 124) xs += Math.floor(14 * Math.min(y - 92, 124 - y, 10) / 10);   // the port cove
      this.shore[y] = xs;
    }
    // Alder Creek: from the east edge near y = 72 to the bay near y = 66
    this.creek = [];
    let cy = 72;
    for (let x = N - 1; x >= 0; x--) {
      if (x < this.shore[cy]) break;
      cy = sat(cy + ((DRAW(0xc4ee, x, 0) % 7) === 0 ? ((DRAW(0xc4ee, x, 1) & 1) ? 1 : -1) : 0) + (x % 23 === 0 && cy > 66 ? -1 : 0), 62, 76);
      this.creek.push([x, cy]);
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const c = cellOf(x, y), xs = this.shore[y];
      const hill = vnoise(s, 0x4111, x, y, 32) * 30 + vnoise(s, 0x4112, x, y, 12) * 8;      // mm
      let z = Math.max(0, x - xs) * 520 + hill;                                              // rising to the east
      if (x < xs) { this.water[c] = 1; this.land[c] = L.water; z = -3000 - (xs - x) * 500; }
      else if (x === xs) this.land[c] = L.beach;
      this.height[c] = Math.floor(z);
    }
    for (const [x, y] of this.creek) for (let dy = 0; dy <= 1; dy++) {
      const c = cellOf(x, y + dy); this.water[c] = 1; this.land[c] = L.water; this.height[c] = Math.min(this.height[c], this.height[cellOf(x, y)]) - 2500;
    }
    // the valley of the creek: ground near it dips toward it
    for (const [x, y] of this.creek) for (let dy = -4; dy <= 5; dy++) { if (!inside(x, y + dy)) continue; const c = cellOf(x, y + dy); if (!this.water[c]) this.height[c] -= Math.max(0, 5 - Math.abs(dy)) * 900; }
    // the margins (north and south) are woodland, so the street-life field never wraps across them
    for (let x = 0; x < N; x++) for (const y of [0, 1, N - 2, N - 1]) { const c = cellOf(x, y); if (!this.water[c]) { this.land[c] = L.park; this.tree[c] = 3; } }
  }
  makeStreets() {
    for (let y = 2; y < N - 2; y++) for (let x = 0; x < N; x++) {
      const c = cellOf(x, y), xs = this.shore[y];
      if (x <= xs) continue;
      const art = ARTERIAL_X.includes(x) || ARTERIAL_Y.includes(y), line = isStreetLine(x, ARTERIAL_X) || isStreetLine(y, ARTERIAL_Y);
      if (x === xs + 1 && y >= 40 && y <= 90) { this.road[c] = ROAD.PROMENADE; this.land[c] = L.road; continue; }
      if (!line) continue;
      if (this.water[c]) { if (art) { this.road[c] = ROAD.BRIDGE; this.land[c] = L.road; } continue; }
      this.road[c] = art ? ROAD.ARTERIAL : ROAD.LOCAL; this.land[c] = L.road;
    }
    // dead-end stubs that would end in the creek become footpaths (park)
    for (let y = 2; y < N - 2; y++) for (let x = 1; x < N - 1; x++) {
      const c = cellOf(x, y); if (this.road[c] !== ROAD.LOCAL) continue;
      const wn = this.water[cellOf(x, y - 1)] + this.water[cellOf(x, y + 1)] + this.water[cellOf(x - 1, y)] + this.water[cellOf(x + 1, y)];
      if (wn && !this.road[cellOf(x, y - 1)] + !this.road[cellOf(x, y + 1)] + !this.road[cellOf(x - 1, y)] + !this.road[cellOf(x + 1, y)] >= 3) { this.road[c] = 0; this.land[c] = L.park; }
    }
  }
  hoodAt(x, y) {
    const xs = this.shore[y];
    if (y >= 44 && y <= 78 && x <= 40) return 0;               // Downtown
    if (y >= 50 && y <= 82 && x > 40 && x <= 58) return 1;      // Old Town
    if (y >= 88 && x <= 48) return 6;                           // Port District
    if (y < 42 && x <= 62) return 2;                            // Northgate
    if (y < 42 && x > 62 && x <= 94) return 7;                  // Bayview
    if (x > 94 && y <= 82) return 4;                            // Eastside Hills
    if (y >= 84) return 5;                                      // Southridge
    return xs >= 0 ? 3 : 3;                                     // Creekside
  }
  makeDistricts() {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) this.hood[cellOf(x, y)] = this.hoodAt(x, y);
    const park = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const c = cellOf(x, y); if (!this.water[c] && !this.road[c]) { this.land[c] = L.park; this.tree[c] = (DRAW(0x7ee, c, 0) % 3 === 0) ? 2 : 1; } } };
    // the waterfront park, the creek greenway, Hilltop Park, Northgate Park and pocket parks
    for (let y = 40; y <= 90; y++) for (let x = this.shore[y] + 2; x <= this.shore[y] + 3; x++) { const c = cellOf(x, y); if (!this.road[c] && !this.water[c]) { this.land[c] = L.park; this.tree[c] = y % 3 === 0 ? 1 : 0; } }
    for (const [x, y] of this.creek) for (let dy = -2; dy <= 3; dy++) { if (!inside(x, y + dy)) continue; const c = cellOf(x, y + dy); if (!this.water[c] && !this.road[c]) { this.land[c] = L.park; this.tree[c] = (DRAW(0x7ef, c, 0) % 2) + 1; } }
    park(103, 19, 117, 33); park(29, 19, 33, 23); park(71, 91, 75, 95); park(47, 13, 51, 17); park(95, 103, 99, 107);
    for (let y = 2; y < N - 2; y++) for (let x = 0; x < N; x++) { const c = cellOf(x, y); if (this.road[c] === ROAD.ARTERIAL && this.hood[c] !== 6 && (x + y) % 2 === 0) this.tree[c] = 4; }  // street trees
  }
  // blocks are the 5 x 5 (or smaller) rectangles between streets; each becomes parcels and buildings
  makeParcels() {
    const s = this.seed, W = this;
    const free = (x, y) => inside(x, y) && !W.road[cellOf(x, y)] && !W.water[cellOf(x, y)] && W.land[cellOf(x, y)] !== L.park && W.land[cellOf(x, y)] !== L.beach && W.land[cellOf(x, y)] !== L.yard && W.bldOf[cellOf(x, y)] === -1;
    // civic buildings, the hospital and the banks first, each on the nearest free rectangle to its site
    const SITES = [[24, 62, B.civic, 1, 3, 3], [30, 50, B.civic, 2, 2, 2], [48, 63, B.civic, 3, 2, 2], [78, 50, B.civic, 4, 2, 2], [102, 93, B.civic, 4, 2, 2],
      [24, 69, B.civic, 5, 3, 2], [42, 26, B.school, 6, 4, 3], [78, 63, B.school, 6, 4, 3], [78, 100, B.school, 6, 4, 3], [78, 26, B.school, 7, 4, 3], [108, 51, B.school, 8, 5, 4],
      [60, 32, B.civic, 9, 2, 2], [90, 116, B.hospital, 0, 5, 4], [20, 56, B.bank, 0, 2, 2], [32, 66, B.bank, 0, 2, 2], [26, 74, B.bank, 0, 2, 2],
      [60, 20, B.bank, 0, 1, 1], [100, 62, B.bank, 0, 1, 1], [66, 104, B.bank, 0, 1, 1]];
    const fits = (x, y, w, h) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (!free(xx, yy)) return false; return true; };
    this.sites = [];
    for (const [tx, ty, kind, civic, w, h] of SITES) {
      let done = false;
      for (let r = 0; r < 16 && !done; r++) for (let dy = -r; dy <= r && !done; dy++) for (let dx = -r; dx <= r && !done; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = tx + dx, y = ty + dy; if (!fits(x, y, w, h)) continue;
        const i = this.place(x, y, w, h, kind, civic, DRAW(0xc1c, tx, ty)); this.sites.push(i); done = true;
      }
    }
    for (let by = 2; by < N - 2; by++) for (let bx = 0; bx < N; bx++) {
      if (!free(bx, by) || (inside(bx - 1, by) && free(bx - 1, by)) || (inside(bx, by - 1) && free(bx, by - 1))) continue;
      let w = 0, h = 0; while (free(bx + w, by)) w++; while (free(bx, by + h) && h < 8) h++;
      if (w > 8) w = 8;
      const hood = this.hood[cellOf(bx, by)], r = DRAW(0xb10c, bx, by);
      const onArt = (x, y) => [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([a, b]) => inside(a, b) && W.road[cellOf(a, b)] === ROAD.ARTERIAL);
      if (hood === 0) {                                                 // downtown: towers and podiums
        if (w >= 4 && h >= 4 && r % 3 === 0) this.place(bx, by, w, h, r % 2 ? B.office : B.hotel, 0, r);
        else for (let y = by; y < by + h; y += 2) for (let x = bx; x < bx + w; x += 3) if (free(x, y)) { const ww = Math.min(3, bx + w - x), hh = Math.min(2, by + h - y); this.place(x, y, ww, hh, [B.office, B.mixed, B.office, B.office, B.mixed, B.apartments][DRAW(0xd0, x, y) % 6], 0, DRAW(0xd1, x, y)); }
      } else if (hood === 1) {                                          // Old Town: shops with flats over, around a courtyard
        for (let y = by; y < by + h; y++) for (let x = bx; x < bx + w; x++) if (free(x, y) && (x === bx || y === by || x === bx + w - 1 || y === by + h - 1)) this.place(x, y, 1, 1, DRAW(0x01d, x, y) % 5 ? B.mixed : B.shop, 0, DRAW(0x01e, x, y));
      } else if (hood === 6) {                                          // the port: works and warehouses
        for (let y = by; y < by + h; y += 3) for (let x = bx; x < bx + w; x += 3) if (free(x, y)) this.place(x, y, Math.min(3, bx + w - x), Math.min(3, by + h - y), DRAW(0x907, x, y) % 9 ? B.industrial : B.shop, 0, DRAW(0x908, x, y));
      } else {                                                          // neighbourhoods: houses, townhouses, flats; shops on the arterials
        const dense = hood === 7 || hood === 3 ? 380 : hood === 5 ? 220 : 120;
        for (let y = by; y < by + h; y++) for (let x = bx; x < bx + w; x++) {
          if (!free(x, y)) continue;
          const edge = x === bx || y === by || x === bx + w - 1 || y === by + h - 1, hh = DRAW(0x0e5, x, y);
          if (onArt(x, y) && hh % 1000 < 120) { this.place(x, y, 1, 1, hh % 7 === 0 ? B.clinic : hh % 3 ? B.shop : B.mixed, 0, hh); continue; }
          if (!edge) { this.land[cellOf(x, y)] = L.yard; this.tree[cellOf(x, y)] = hh % 4 === 0 ? 1 : 0; continue; }
          if (hh % 1000 < dense && free(x + 1, y) && free(x, y + 1) && free(x + 1, y + 1)) { this.place(x, y, 2, 2, hh % 2 ? B.apartments : B.townhouse, 0, hh); continue; }
          // outer neighbourhoods have deeper lots: a house and its garden take two cells
          if ((hood === 4 || hood === 5 || hood === 2) && hh % 3 && free(x, y + 1) && !(y + 1 === by + h - 1 && x !== bx && x !== bx + w - 1)) { this.place(x, y, 1, 1, B.house, 0, hh); this.land[cellOf(x, y + 1)] = L.yard; this.bldOf[cellOf(x, y + 1)] = -2; continue; }
          this.place(x, y, 1, 1, B.house, 0, hh);
        }
      }
    }
    for (let c = 0; c < CELLS; c++) if (this.bldOf[c] === -2) this.bldOf[c] = -1;
  }
  place(x, y, w, h, kind, civic, r) {
    const T = this.buildings, i = T.alloc(), K = BKIND[kind];
    T.x[i] = x; T.y[i] = y; T.w[i] = w; T.h[i] = h; T.kind[i] = kind; T.civic[i] = civic; T.seed[i] = r;
    const [f0, f1] = K.floors, tall = this.hood[cellOf(x, y)] === 0 ? 1 : 0;
    T.floors[i] = kind === B.office && tall ? f0 + (r % (f1 - f0 + 1)) : f0 + ((r >>> 4) % (Math.min(f1, f0 + 2) - f0 + 1));
    if (kind === B.hotel) T.floors[i] = f0 + (r % (f1 - f0 + 1));
    T.built[i] = 1905 + (r >>> 8) % 118; T.cond[i] = Math.max(180, Math.min(1000, 1000 - (2026 - T.built[i]) * 5 - (r >>> 12) % 260 + 120)); T.hood[i] = this.hood[cellOf(x, y)];
    const facades = { [B.house]: ["siding", "siding", "brick_red", "stucco"], [B.townhouse]: ["brick_red", "siding", "stucco"], [B.apartments]: ["stucco", "brick_yellow", "concrete", "brick_red"],
      [B.mixed]: ["brick_red", "brick_yellow", "stucco", "sandstone"], [B.shop]: ["brick_yellow", "stucco", "brick_red", "metal_panel"], [B.office]: ["curtain_glass", "concrete", "curtain_glass", "sandstone"],
      [B.industrial]: ["metal_panel", "concrete", "rust_steel", "brick_red"], [B.hotel]: ["concrete", "curtain_glass", "brick_yellow"], [B.civic]: ["sandstone", "brick_red"], [B.school]: ["brick_red", "brick_yellow"],
      [B.hospital]: ["concrete", "curtain_glass"], [B.clinic]: ["stucco", "concrete"], [B.bank]: ["sandstone", "marble"] }[kind];
    T.facade[i] = MAT[facades[(r >>> 16) % facades.length]];
    T.roof[i] = MAT[K.roof === "gable" ? ((r >>> 20) % 4 === 0 ? "slate" : "shingle") : K.roof === "sawtooth" ? "metal_roof" : (r >>> 20) % 3 === 0 ? "gravel" : "membrane"];
    T.tint[i] = (r >>> 24) & 255;
    const cells = w * h, fl = T.floors[i];
    if (kind === B.house) T.units[i] = 1;
    else if (kind === B.townhouse) T.units[i] = cells;
    else if (kind === B.apartments) T.units[i] = cells * fl;
    else if (kind === B.mixed) T.units[i] = cells * (fl - 1);
    T.spaces[i] = kind === B.shop ? cells : kind === B.mixed ? ((r >>> 3) % 5 < 3 ? cells : 0) : kind === B.office ? Math.min(12, Math.ceil(cells * fl / 8)) : kind === B.industrial ? 1 : kind === B.hotel || kind === B.hospital || kind === B.clinic || kind === B.bank ? 1 : 0;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const c = cellOf(xx, yy); this.bldOf[c] = i; this.land[c] = this.landUseOf(kind); }
    for (let u = 0; u < T.units[i]; u++) { const d = this.dwellings.alloc(); this.dwellings.bld[d] = i; this.dwellings.hh[d] = -1; this.dwellings.owner[d] = -1; this.dwellings.rooms[d] = kind === B.house ? 3 + ((r >>> u) & 1) : 1 + ((r >>> (u % 24)) % 3); }
    const sk = { [B.shop]: 0, [B.mixed]: 0, [B.office]: 1, [B.industrial]: 2, [B.hotel]: 3, [B.clinic]: 4, [B.hospital]: 5, [B.bank]: 6 }[kind];
    for (let k = 0; k < T.spaces[i]; k++) { const p = this.spaces.alloc(); this.spaces.bld[p] = i; this.spaces.kind[p] = sk; this.spaces.tenant[p] = -1; this.spaces.floor[p] = kind === B.office ? 1 + (k % fl) : 0; }
    if (kind === B.civic || kind === B.school) { const p = this.spaces.alloc(); this.spaces.bld[p] = i; this.spaces.kind[p] = kind === B.school ? 8 : 7; this.spaces.tenant[p] = -1; }
    return i;
  }
  landUseOf(kind) { return kind === B.house || kind === B.townhouse || kind === B.apartments ? L.residential : kind === B.mixed ? L.mixed : kind === B.shop || kind === B.hotel || kind === B.bank ? L.commercial : kind === B.office || kind === B.clinic ? L.office : kind === B.industrial ? L.industrial : L.civic; }
  // four bus routes along the arterials, with a stop every sixth cell
  makeRoutes() {
    const along = (pts) => { const cells = []; for (let k = 0; k + 1 < pts.length; k++) { let [x, y] = pts[k]; const [x1, y1] = pts[k + 1]; while (x !== x1 || y !== y1) { cells.push(cellOf(x, y)); x += Math.sign(x1 - x); y += Math.sign(y1 - y); } } cells.push(cellOf(...pts[pts.length - 1])); return cells.filter((c) => this.road[c]); };
    this.routes = [
      { name: "1 Main Street", colour: [0.86, 0.22, 0.18], cells: along([[this.shore[60] + 2, 60], [112, 60]]) },
      { name: "2 Harbor Avenue", colour: [0.16, 0.46, 0.82], cells: along([[40, 12], [40, 108]]) },
      { name: "3 Eastside Loop", colour: [0.20, 0.66, 0.30], cells: along([[64, 36], [112, 36], [112, 84], [64, 84], [64, 36]]) },
      { name: "4 Port and Southridge", colour: [0.90, 0.62, 0.10], cells: along([[16, 108], [112, 108], [112, 84]]) },
    ];
    for (const r of this.routes) r.stops = r.cells.filter((_, k) => k % 6 === 0);
    this.stopNear = new Int32Array(CELLS).fill(-1);
    for (let c = 0; c < CELLS; c++) {
      if (this.water[c]) continue; let best = -1, bd = 7;
      for (const r of this.routes) for (const st of r.stops) { const d = Math.max(Math.abs((st & NMASK) - (c & NMASK)), Math.abs((st >> NSHIFT) - (c >> NSHIFT))); if (d < bd) { bd = d; best = st; } }
      this.stopNear[c] = best;
    }
  }
  // land value, dollars per square metre in cents: downtown, the water, parks and the hills' views
  valueLand() {
    const pk = new Uint8Array(CELLS);
    for (let c = 0; c < CELLS; c++) if (this.land[c] === L.park) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const x = (c & NMASK) + dx, y = (c >> NSHIFT) + dy; if (inside(x, y)) pk[cellOf(x, y)] = 1; }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const c = cellOf(x, y); if (this.water[c]) continue;
      const dd = Math.abs(x - 26) + Math.abs(y - 62), shoreD = x - this.shore[y];
      let v = 26000 + Math.max(0, 95000 - dd * 1700) + Math.max(0, 40000 - shoreD * 3000) + (pk[c] ? 12000 : 0) + Math.max(0, this.height[c] - 30000) / 3;
      if (this.hood[c] === 6) v = 30000 + Math.max(0, 40000 - dd * 600);
      this.landValue[c] = Math.floor(v);
    }
    const T = this.buildings, D = this.dwellings, homesOf = new Map();
    for (const d of D.each()) { const b = D.bld[d]; if (!homesOf.has(b)) homesOf.set(b, []); homesOf.get(b).push(d); }
    for (const i of T.each()) {
      let lv = 0; for (let y = T.y[i]; y < T.y[i] + T.h[i]; y++) for (let x = T.x[i]; x < T.x[i] + T.w[i]; x++) lv += this.landValue[cellOf(x, y)] * CELL_M * CELL_M;
      const k = T.kind[i], cover = [0.42, 0.55, 0.6, 0.7, 0.75, 0.62, 0.8, 0.6, 0.55, 0.5, 0.6, 0.6, 0.6][k], lot = T.w[i] * T.h[i] * CELL_M * CELL_M, env = lot * cover * T.floors[i];   // the envelope's floor area, m2
      // what is valued is what is built inside the envelope: homes of the floor areas their rooms make (Everett's typical
      // units: a flat of r rooms about 30 + 25r m2 with 15% for halls and stairs, a townhouse about 100 + 25r m2), a mixed
      // building's shopfronts on its ground floor, office suites of about 650 m2 and a hotel of about 110 rooms (history)
      let area = env;
      if (k === B.townhouse || k === B.apartments || k === B.mixed) { let a = 0; for (const d of homesOf.get(i) || []) a += k === B.townhouse ? 100 + 25 * D.rooms[d] : (30 + 25 * D.rooms[d]) * 1.15; area = Math.min(env, a + (k === B.mixed && T.spaces[i] ? lot * cover : 0)); }
      else if (k === B.office) area = Math.min(env, T.spaces[i] * 650);
      else if (k === B.hotel) area = Math.min(env, 6500);
      const cost = [195000, 190000, 200000, 210000, 180000, 260000, 110000, 250000, 280000, 240000, 330000, 230000, 290000][T.kind[i]];   // cents per m2
      T.land[i] = Math.round(lv); T.value[i] = Math.round(lv + area * cost * (500 + T.cond[i] / 2) / 1000);
    }
  }
  centre(i) { const T = this.buildings; return [(T.x[i] + T.w[i] / 2) * CELL_M, (T.y[i] + T.h[i] / 2) * CELL_M]; }
  frontCell(i) { const T = this.buildings; return this.frontOf(T.x[i], T.y[i], T.w[i], T.h[i]); }   // the street cell a building opens on
  frontOf(px, py, pw, ph) {
    const x0 = px, y0 = py, x1 = x0 + pw - 1, y1 = y0 + ph - 1;
    let best = -1, bd = 1e9;
    for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
      if (!inside(x, y) || (x >= x0 && x <= x1 && y >= y0 && y <= y1)) continue;
      const c = cellOf(x, y); if (!this.road[c]) continue;
      const d = (this.road[c] === ROAD.ARTERIAL ? 0 : 1) + Math.abs(x - (x0 + x1) / 2) + Math.abs(y - (y0 + y1) / 2);
      if (d < bd) { bd = d; best = c; }
    }
    if (best < 0) { for (let r = 2; r < 12 && best < 0; r++) for (let y = y0 - r; y <= y1 + r && best < 0; y++) for (let x = x0 - r; x <= x1 + r; x++) if (inside(x, y) && this.road[cellOf(x, y)]) { best = cellOf(x, y); break; } }
    return best;
  }
  hoodName(c) { return NEIGHBOURHOODS[this.hood[c]]; }
  // a building comes down: its homes and premises go (they must be empty), its cells become a cleared site
  remove(i) {
    const T = this.buildings, D = this.dwellings, SP = this.spaces;
    for (const d of D.each()) if (D.bld[d] === i) { if (D.hh[d] >= 0) throw new Error(`building ${i} still has a household in it`); D.release(d); }
    for (const p of SP.each()) if (SP.bld[p] === i) { if (SP.tenant[p] >= 0) throw new Error(`building ${i} still has a tenant firm in it`); SP.release(p); }
    for (let y = T.y[i]; y < T.y[i] + T.h[i]; y++) for (let x = T.x[i]; x < T.x[i] + T.w[i]; x++) { const c = cellOf(x, y); this.bldOf[c] = -1; this.land[c] = L.site; }
    T.release(i); this.rev++;
  }
  // a designed building is set out on a parcel: it stands as a construction site until it opens (develop.js adds its homes then)
  raise(x, y, w, h, d, seed) {
    const T = this.buildings, i = T.alloc(); if (i < 0) return -1;
    T.x[i] = x; T.y[i] = y; T.w[i] = w; T.h[i] = h; T.kind[i] = d.kind; T.floors[i] = d.floors; T.seed[i] = seed; T.hood[i] = this.hood[cellOf(x, y)];
    T.facade[i] = d.facade; T.roof[i] = d.roof; T.tint[i] = d.tint; T.cover[i] = d.cover; T.podium[i] = d.podium; T.green[i] = d.green; T.balcony[i] = d.balcony; T.glazing[i] = d.glazing;
    T.cond[i] = 1000; T.stage[i] = 4; T.progress[i] = 0;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const c = cellOf(xx, yy); this.bldOf[c] = i; this.land[c] = L.site; }
    this.rev++; return i;
  }
  // the parcel's cells take the use of the building that now stands on them; any not built over become a plaza or a yard
  settle(i) {
    const T = this.buildings, use = this.landUseOf(T.kind[i]);
    for (let y = T.y[i]; y < T.y[i] + T.h[i]; y++) for (let x = T.x[i]; x < T.x[i] + T.w[i]; x++) this.land[cellOf(x, y)] = use;
    this.rev++;
  }
}
