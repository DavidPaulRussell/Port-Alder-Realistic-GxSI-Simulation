// SPDX-License-Identifier: GPL-3.0-only
// The real place, laid over the map's cells: where its people live, what its ground is, how high it stands, and where
// its roads, rivers and railways run. And the wider world around the map, which the view draws but nobody lives in.
//
// The map is the piece of real ground the population cut covers (ground_data.js: about 21 km on a side around Everett,
// Washington), and each of its N x N cells stands for an equal piece of that ground. The people of every cell come from
// the population table; the kind of ground (sea, river, lake, wetland, forest, farmland, grass, works, shops,
// airfield, beach, housing), the heights and the lines come from OpenStreetMap and the Terrain Tiles as
// tools/make_map.mjs wrote them down. Nothing here is drawn or random: the same data gives the same ground on every
// machine (sums, comparisons and square roots only).
import { GROUND, GROUND_POP_B64, GROUND_KIND_B64, GROUND_HEIGHT_B64, WORLD_KIND_B64, WORLD_HEIGHT_B64 } from "./ground_data.js";
import { N, CELLS } from "./scale.js";

const bytes = (b64) => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
// runs of [kind, how many more]
const unRuns = (b64, n) => { const s = bytes(b64), a = new Uint8Array(n); let o = 0; for (let i = 0; i < s.length; i += 2) { a.fill(s[i], o, o + s[i + 1] + 1); o += s[i + 1] + 1; } return a; };
// differences from the cell before, zig-zagged, seven bits to a byte; half-metres in, metres out
const unHeights = (b64, n) => { const s = bytes(b64), a = new Float32Array(n); let prev = 0, k = 0; for (let i = 0; i < n; i++) { let d = 0, m = 1, b; do { b = s[k++]; d += (b & 127) * m; m *= 128; } while (b & 128); prev += d & 1 ? -(d + 1) / 2 : d / 2; a[i] = prev / 2; } return a; };
export const WATER = { NONE: 0, SOUND: 1, RIVER: 2, LAKE: 3 };
// the kinds of ground, as tools/make_map.mjs numbers them
export const KIND = { none: 0, sea: 1, river: 2, lake: 3, wetland: 4, forest: 5, farm: 6, grass: 7, industrial: 8, commercial: 9, airfield: 10, runway: 11, beach: 12, residential: 13, pier: 14 };
const wet = (k) => k >= 1 && k <= 3;
// of a block of kinds: water if half or more of it is water (the commonest water), otherwise the commonest land
function blockKind(count) {
  let water = 0, total = 0; for (let k = 0; k < 16; k++) { total += count[k]; if (wet(k)) water += count[k]; }
  let best = 0, most = -1;
  if (water * 2 >= total) { for (let k = 1; k <= 3; k++) if (count[k] > most) { most = count[k]; best = k; } }
  else for (let k = 0; k < 16; k++) if (!wet(k) && count[k] > most) { most = count[k]; best = k; }
  return best;
}
// a grid of kinds brought to another size (finer or coarser)
function resize(src, S, D) {
  const out = new Uint8Array(D * D), count = new Uint16Array(16);
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
    const x0 = Math.floor((x * S) / D), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * S) / D)), y0 = Math.floor((y * S) / D), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * S) / D));
    count.fill(0); for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) count[src[j * S + i]]++;
    out[y * D + x] = blockKind(count);
  }
  return out;
}
// heights at the centres of an S x S grid, read between them at the centres of a D x D grid over the same ground
function reHeight(src, S, D) {
  const out = new Float32Array(D * D);
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
    const fx = ((x + 0.5) * S) / D - 0.5, fy = ((y + 0.5) * S) / D - 0.5, x0 = Math.max(0, Math.min(S - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(S - 2, Math.floor(fy))), u = Math.max(0, Math.min(1, fx - x0)), v = Math.max(0, Math.min(1, fy - y0));
    out[y * D + x] = (src[y0 * S + x0] * (1 - u) + src[y0 * S + x0 + 1] * u) * (1 - v) + (src[(y0 + 1) * S + x0] * (1 - u) + src[(y0 + 1) * S + x0 + 1] * u) * v;
  }
  return out;
}
// lines as [class, [x, y, x, y, ...]] in the cells of a grid `size` across that covers `times` map-widths around the
// map's centre (the map itself when times is 1, the whole world when times is the world's)
function linesIn(list, size, times) {
  const Wd = GROUND.world, lonSpan = Wd.east - Wd.west, latSpan = Wd.north - Wd.south, per = size / times, off = ((Wd.times - times) / 2) * per;
  const sx = (Wd.unit / lonSpan) * Wd.times * per, sy = (Wd.unit / latSpan) * Wd.times * per;
  // (a line's class is its low three bits; 8 more marks a bridge, 16 more a ramp, 32 more a one-way road, drawn in its direction)
  return list.map(([code, d]) => { const pts = new Float32Array(d.length); let X = 0, Y = 0; for (let i = 0; i < d.length; i += 2) { X += d[i]; Y += d[i + 1]; pts[i] = X * sx - off; pts[i + 1] = Y * sy - off; } return [code & 7, pts, (code & 8) !== 0, (code & 16) !== 0, (code & 32) !== 0]; });
}
// every cell of a grid `size` across that a line passes through, in order (no gaps: corners are stepped round)
export function walkLine(pts, size, each) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < size && y < size; let px = -9, py = -9;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3], n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2));
    for (let k = 0; k <= n; k++) { const x = Math.floor(ax + ((bx - ax) * k) / n), y = Math.floor(ay + ((by - ay) * k) / n); if (x === px && y === py) continue; if (px !== -9 && x !== px && y !== py && inside(px, y)) each(px, y); px = x; py = y; if (inside(x, y)) each(x, y); }
  }
}

// a place on the real ground (latitude, longitude) in the map's cells, as fractions; null off the map
export function placeCell(lat, lon) { const T = GROUND.pop, x = ((lon - T.west) / (T.cols * T.dLon)) * N, y = ((T.north - lat) / (T.rows * T.dLat)) * N; return x >= 0 && y >= 0 && x < N && y < N ? [x, y] : null; }

// the public traffic cameras on the map: what each looks at, its live picture's address, where it stands in the map's
// cells, and (from its title, "I-5 at MP 192.6: 41st St") the number of its road and its milepost, which is how a
// flow sensor on the same road finds the camera it stands beside (route -1, milepost NaN where the title names none)
export function mapCameras() {
  const Wd = GROUND.world;
  return (GROUND.cameras || []).map(([title, url, dir, X, Y]) => {
    const p = placeCell(Wd.north - Y * Wd.unit, Wd.west + X * Wd.unit), m = /^(?:I-|US |SR )\s*(\d+)\b(?:.*?\bMP\s*(\d+(?:\.\d+)?))?/.exec(title);
    return p ? { title, url, dir, x: p[0], y: p[1], route: m ? Number(m[1]) : -1, mp: m && m[2] !== undefined ? Number(m[2]) : NaN } : null;
  }).filter(Boolean);
}

export function layGround() {
  const G = GROUND, realX = (2 * G.halfX) / N, realY = (2 * G.halfY) / N, real = (realX + realY) / 2;   // metres of real ground to a cell
  const T = G.pop, east = T.west + T.cols * T.dLon, south = T.north - T.rows * T.dLat;
  const cx = (lon) => ((lon - T.west) / (east - T.west)) * N, cy = (lat) => ((T.north - lat) / (T.north - south)) * N;
  const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N, N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  /* 1. the people: each cell of the table is shared out over the map cells it covers */
  const table = new Uint16Array(bytes(GROUND_POP_B64).buffer), people = new Float64Array(CELLS);
  const kx = Math.max(1, Math.ceil((N / T.cols) * 1.5)), ky = Math.max(1, Math.ceil((N / T.rows) * 1.5));
  for (let r = 0; r < T.rows; r++) for (let c = 0; c < T.cols; c++) {
    const v = table[r * T.cols + c]; if (!v) continue;
    const share = v / 100 / (kx * ky);
    for (let j = 0; j < ky; j++) for (let i = 0; i < kx; i++) {
      const x = Math.min(N - 1, Math.floor(((c + (i + 0.5) / kx) / T.cols) * N)), y = Math.min(N - 1, Math.floor(((r + (j + 0.5) / ky) / T.rows) * N));
      people[y * N + x] += share;
    }
  }

  /* 2. the kind of ground, and the water */
  const F = G.fine, fine = unRuns(GROUND_KIND_B64, F * F), kind = resize(fine, F, N), water = new Uint8Array(CELLS), count = new Uint16Array(16);
  // a cell that is partly land and has people living on it is land (its commonest kind of land)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const c = y * N + x; if (!wet(kind[c]) || people[c] === 0) continue;
    const x0 = Math.floor((x * F) / N), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * F) / N)), y0 = Math.floor((y * F) / N), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * F) / N));
    count.fill(0); let best = -1, most = 0; for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) { const k = fine[j * F + i]; if (!wet(k) && ++count[k] > most) { most = count[k]; best = k; } }
    if (best >= 0) kind[c] = best;
  }
  // runways and taxiways are drawn along their lines (a runway is narrower than a cell of a small map): 1 a runway, 2 a taxiway
  const strip = new Uint8Array(CELLS);
  for (const [cls, pts] of linesIn(G.strips || [], N, 1)) walkLine(pts, N, (x, y) => { const c = y * N + x; if (wet(kind[c])) return; kind[c] = KIND.runway; if (cls === 0) strip[c] = 1; else if (!strip[c]) strip[c] = 2; });
  // rivers are drawn along their lines as well, so a river narrower than a cell is never broken
  const rivers = linesIn(G.rivers, N, 1);
  for (const [cls, pts] of rivers) if (cls === 0) walkLine(pts, N, (x, y) => { const c = y * N + x; if (!wet(kind[c])) kind[c] = KIND.river; });
  for (let c = 0; c < CELLS; c++) water[c] = kind[c] === KIND.sea ? WATER.SOUND : kind[c] === KIND.river ? WATER.RIVER : kind[c] === KIND.lake ? WATER.LAKE : 0;
  // nobody lives on the water: the few the table counts there move to the nearest land
  for (let c = 0; c < CELLS; c++) {
    if (!water[c] || people[c] === 0) continue;
    const x0 = c % N, y0 = (c - x0) / N; let to = -1;
    for (let r = 1; r < 8 && to < 0; r++) for (let dy = -r; dy <= r && to < 0; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !inside(x0 + dx, y0 + dy)) continue; const d = (y0 + dy) * N + x0 + dx; if (!water[d]) { to = d; break; } }
    if (to >= 0) people[to] += people[c]; people[c] = 0;
  }

  /* 3. how far each cell is from the water (in cells) */
  const dist = new Uint16Array(CELLS).fill(65535), queue = [];
  for (let c = 0; c < CELLS; c++) if (water[c]) { dist[c] = 0; queue.push(c); }
  for (let q = 0; q < queue.length; q++) { const c = queue[q], x = c % N, y = (c - x) / N; for (const [dx, dy] of N4) { if (!inside(x + dx, y + dy)) continue; const e = (y + dy) * N + x + dx; if (dist[e] !== 65535) continue; dist[e] = dist[c] + 1; queue.push(e); } }

  /* 4. what each part is: how thickly settled (people to the square kilometre around it), and the places */
  const sums = new Float64Array((N + 1) * (N + 1));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) sums[(y + 1) * (N + 1) + x + 1] = people[y * N + x] + sums[y * (N + 1) + x + 1] + sums[(y + 1) * (N + 1) + x] - sums[y * (N + 1) + x];
  const around = (x, y, r) => { const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(N, x + r + 1), y1 = Math.min(N, y + r + 1); return sums[y1 * (N + 1) + x1] - sums[y0 * (N + 1) + x1] - sums[y1 * (N + 1) + x0] + sums[y0 * (N + 1) + x0]; };
  const reach = Math.max(1, Math.round(200 / real)), density = new Float32Array(CELLS), hood = new Uint8Array(CELLS);
  const places = G.places.map((p) => ({ kind: p.kind, x: cx(p.at[1]), y: cy(p.at[0]), r: p.radius_m / real }));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const c = y * N + x, w = Math.min(N, x + reach + 1) - Math.max(0, x - reach), h = Math.min(N, y + reach + 1) - Math.max(0, y - reach);
    const d = (around(x, y, reach) / (w * h * realX * realY)) * 1e6; density[c] = d;
    // the kinds of neighbourhood the simulation knows (citydata.js): 0 the centre, 1 an old town, 6 works and port,
    // 7 and 3 the thickly settled, 5 the middling, 2 and 4 the thinly settled
    let centre = false, old = false;
    for (const p of places) { const qx = x + 0.5 - p.x, qy = y + 0.5 - p.y; if (qx * qx + qy * qy > p.r * p.r) continue; if (p.kind === "downtown") centre = true; else if (p.kind === "oldtown") old = true; }
    hood[c] = centre ? 0 : old ? 1 : kind[c] === KIND.industrial ? 6 : d >= 4500 ? 7 : d >= 3000 ? 3 : d >= 1600 ? 5 : d >= 500 ? 2 : 4;
  }

  /* 5. heights (metres above the sea, as they really are), and the level of the water in every lake and river */
  const height = reHeight(unHeights(GROUND_HEIGHT_B64, G.heights * G.heights), G.heights, N), level = new Float32Array(CELLS);
  { // a lake is flat: every stretch of inland water takes the lowest height found on it; the Sound and the tidal river are the sea
    const seen = new Uint8Array(CELLS);
    for (let c0 = 0; c0 < CELLS; c0++) {
      if (!water[c0] || seen[c0]) continue; const part = [c0]; seen[c0] = 1; let low = 1e9, sea = false;
      for (let q = 0; q < part.length; q++) { const c = part[q], x = c % N, y = (c - x) / N; if (water[c] === WATER.SOUND) sea = true; if (height[c] < low) low = height[c]; for (const [dx, dy] of N4) { if (!inside(x + dx, y + dy)) continue; const e = (y + dy) * N + x + dx; if (water[e] && !seen[e]) { seen[e] = 1; part.push(e); } } }
      const lv = sea || low < 3 ? 0 : low; for (const c of part) level[c] = lv;
    }
  }

  let total = 0; for (let c = 0; c < CELLS; c++) total += people[c];
  const cellAt = (lat, lon) => { const x = Math.floor(cx(lon)), y = Math.floor(cy(lat)); return inside(x, y) ? [x, y] : null; };
  const Wd = G.world, points = G.points.map(([code, X, Y]) => [code, Math.floor(cx(Wd.west + X * Wd.unit)), Math.floor(cy(Wd.north - Y * Wd.unit))]).filter((p) => inside(p[1], p[2]));
  return { name: G.name, real, people, total, kind, strip, water, level, height, dist, density, hood, around, cellAt, sites: G.sites, places: G.places, points,
    roads: linesIn(G.roads, N, 1), rail: linesIn(G.rail, N, 1), rivers };
}

// The world around the map, for the view: `cells` across (the map is the middle third), the kind of ground and the
// height of each, and the lines in those cells. Nobody lives here; it is what the map sits in.
export function layWorld(cells) {
  const G = GROUND, Wd = G.world;
  return { cells, times: Wd.times, kind: resize(unRuns(WORLD_KIND_B64, Wd.cells * Wd.cells), Wd.cells, cells), height: reHeight(unHeights(WORLD_HEIGHT_B64, G.heights * G.heights), G.heights, cells),
    roads: linesIn(G.roads, cells, Wd.times), rail: linesIn(G.rail, cells, Wd.times), rivers: linesIn(G.rivers, cells, Wd.times), strips: linesIn(G.strips || [], cells, Wd.times), towns: G.towns };
}
