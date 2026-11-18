// SPDX-License-Identifier: GPL-3.0-only
// Build the movement matrix's geography from population tables cut out of a WorldPop raster by tools/pop_extract.py:
//
//   node tools/make_movement.mjs <folder with everett_pop_3arcsec, wa_pop_36arcsec and us_pop_0p1deg (.f32 + .json)>
//
// It writes src/movement_data.js: for Port Alder and each of the 26 places of its three outer layers, where their
// people actually live (the population-weighted centre) and, for each pair, the mean gravity kernel between one
// place's people and the other's (law 75.41: (d + 20 km)^-1.6, averaged over where both populations really are).
// Only those small tables enter the repository; the raster and the 0.1 degree national table do not.
//
// Which place a raster cell belongs to is approximate: Washington by an outline of the Columbia and the Idaho line,
// Snohomish County by its straight north and south lines and the shore, and places within them by the nearest of the
// towns each stands for. The model's own published populations stay as they are; the raster gives the geometry.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { PLACES } from '../src/periphery.js';
import { haversine } from '../src/laws.js';

const dir = process.argv[2]; if (!dir) { console.error('usage: node tools/make_movement.mjs <folder of population tables>'); process.exit(64); }
const load = (name) => { const m = JSON.parse(readFileSync(`${dir}/${name}.json`, 'utf8')), b = readFileSync(`${dir}/${name}.f32`); return { ...m, v: new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4) }; };
const WA = load('wa_pop_36arcsec'), US = load('us_pop_0p1deg');
const CITY = 26, NU = 27;                                  // units 0..25 are PLACES[0..25]; 26 is Port Alder
// the towns each place stands for (latitude, longitude)
const ANCHORS = {
  26: [[47.979, -122.202], [48.010, -122.190], [47.955, -122.210], [47.925, -122.225], [47.900, -122.235], [47.880, -122.215]],
  0: [[47.945, -122.304], [47.906, -122.282]], 1: [[48.052, -122.177], [48.070, -122.290], [48.150, -122.180]], 2: [[47.821, -122.315], [47.788, -122.309]],
  3: [[47.811, -122.377], [47.790, -122.380]], 4: [[47.860, -122.205], [47.800, -122.200]], 5: [[48.015, -122.064]],
  6: [[47.913, -122.098], [47.855, -121.971], [47.862, -121.817], [47.857, -121.697]], 7: [[48.199, -122.125], [48.241, -122.371], [48.084, -121.969], [48.255, -121.602]],
  8: [[47.851, -122.239], [47.866, -122.155], [47.820, -122.180], [47.870, -122.260], [47.785, -122.274], [47.805, -122.113], [47.834, -122.126], [48.140, -122.290]],
  9: [[47.606, -122.332], [47.610, -122.201], [47.381, -122.235], [47.674, -122.121], [47.322, -122.313], [47.204, -121.991], [47.496, -121.787], [47.756, -122.342], [47.709, -121.360]],
  10: [[47.253, -122.444], [47.185, -122.293], [47.172, -122.518], [47.177, -122.186], [46.867, -122.266], [47.329, -122.580]],
  11: [[47.567, -122.633], [47.736, -122.647], [47.540, -122.636], [48.118, -123.431], [48.117, -122.760], [48.080, -123.102], [47.215, -123.101], [47.950, -124.385], [47.626, -122.521]],
  12: [[47.038, -122.900], [47.034, -122.823], [46.716, -122.954], [46.975, -123.816], [46.352, -124.054], [46.942, -122.606], [46.558, -122.275]],
  13: [[45.639, -122.661], [45.781, -122.533], [45.587, -122.400], [46.138, -122.938], [45.905, -122.744], [45.696, -121.885], [45.821, -120.822], [45.728, -121.486]],
  14: [[48.750, -122.478], [48.421, -122.334], [48.513, -122.613], [48.293, -122.643], [48.534, -123.017], [48.946, -122.452], [48.040, -122.406], [48.170, -122.500], [48.504, -122.236], [48.539, -121.746]],
  15: [[46.602, -120.506], [46.211, -119.137], [46.240, -119.101], [46.286, -119.284], [47.424, -120.310], [46.997, -120.548], [47.130, -119.278], [48.411, -119.528], [46.324, -120.009], [47.596, -120.661]],
  16: [[47.659, -117.426], [47.673, -117.239], [46.731, -117.180], [46.065, -118.343], [48.546, -117.905], [47.487, -117.576], [47.127, -118.380], [46.416, -117.045]],
  17: [[42.36, -71.06], [41.76, -72.68], [41.82, -71.41], [43.66, -70.26], [44.48, -73.21], [42.99, -71.46]],
  18: [[40.71, -74.01], [39.95, -75.17], [40.44, -80.00], [42.89, -78.88], [42.65, -73.75], [40.27, -76.88], [43.05, -76.15]],
  19: [[41.88, -87.63], [42.33, -83.05], [39.96, -83.00], [41.50, -81.69], [39.10, -84.51], [39.77, -86.16], [43.04, -87.91], [42.96, -85.67], [39.80, -89.64], [44.51, -88.01], [46.54, -87.40]],
  20: [[44.98, -93.27], [39.10, -94.58], [38.63, -90.20], [41.26, -95.93], [41.59, -93.62], [37.69, -97.34], [46.88, -96.79], [43.55, -96.73], [46.81, -100.78], [44.08, -103.23], [37.21, -93.29], [46.79, -92.10]],
  21: [[33.75, -84.39], [25.76, -80.19], [38.91, -77.04], [39.29, -76.61], [35.23, -80.84], [35.78, -78.64], [28.54, -81.38], [27.95, -82.46], [30.33, -81.66], [37.54, -77.44], [36.85, -76.00], [32.78, -79.93], [38.35, -81.63], [32.08, -81.09], [30.44, -84.28], [34.00, -81.03]],
  22: [[36.16, -86.78], [35.15, -90.05], [38.25, -85.76], [33.52, -86.80], [32.30, -90.18], [35.96, -83.92], [38.04, -84.50], [30.69, -88.04], [34.73, -86.59], [35.05, -85.31]],
  23: [[32.78, -96.80], [29.76, -95.37], [29.42, -98.49], [30.27, -97.74], [35.47, -97.52], [36.15, -95.99], [29.95, -90.07], [34.75, -92.29], [31.76, -106.49], [33.58, -101.86], [32.53, -93.75], [26.20, -98.23], [35.22, -101.83], [30.45, -91.19]],
  24: [[39.74, -104.99], [33.45, -112.07], [40.76, -111.89], [36.17, -115.14], [35.08, -106.65], [43.62, -116.20], [32.22, -110.97], [39.53, -119.81], [45.78, -108.50], [41.14, -104.82], [47.68, -116.78], [46.87, -113.99], [38.83, -104.82], [43.49, -112.03]],
  25: [[34.05, -118.24], [37.77, -122.42], [32.72, -117.16], [38.58, -121.49], [37.34, -121.89], [36.74, -119.79], [45.52, -122.68], [44.05, -123.09], [42.33, -122.87], [44.06, -121.31], [45.67, -118.79], [21.31, -157.86], [61.22, -149.90], [64.84, -147.72], [40.59, -122.39], [33.95, -117.40]],
};
const km = (la1, lo1, la2, lo2) => haversine(la1, lo1, la2, lo2);                // law 76.5, as the simulation computes it
const nearest = (lat, lon, units) => { let best = -1, bd = 1e18; for (const u of units) for (const [la, lo] of ANCHORS[u]) { const d = km(lat, lon, la, lo); if (d < bd) { bd = d; best = u; } } return best; };
// Washington's southern line (the Columbia, then 46 N) and its eastern (117.04 W)
const SOUTH = [[-124.2, 46.27], [-124.0, 46.25], [-123.4, 46.23], [-123.0, 46.14], [-122.9, 46.07], [-122.8, 45.86], [-122.76, 45.68], [-122.67, 45.61], [-122.4, 45.57], [-122.2, 45.56], [-121.94, 45.65], [-121.5, 45.70], [-121.18, 45.61], [-120.82, 45.66], [-120.2, 45.72], [-119.6, 45.92], [-119.3, 45.93], [-118.98, 46.0], [-116.9, 46.0]];
const southLat = (lon) => { if (lon <= SOUTH[0][0]) return SOUTH[0][1]; for (let k = 1; k < SOUTH.length; k++) if (lon <= SOUTH[k][0]) { const [x0, y0] = SOUTH[k - 1], [x1, y1] = SOUTH[k]; return y0 + ((y1 - y0) * (lon - x0)) / (x1 - x0); } return 46.0; };
const inWA = (lat, lon) => lat <= 49.005 && lon < -117.04 && lat > southLat(lon);
const inSnohomish = (lat, lon) => lat >= 47.777 && lat <= 48.298 && lon <= -120.9 && lon > (lat < 47.90 ? -122.46 : lat <= 48.06 ? -122.33 : -122.395);
const COUNTY = [26, 0, 1, 2, 3, 4, 5, 6, 7, 8], STATE = [9, 10, 11, 12, 13, 14, 15, 16], NATION = [17, 18, 19, 20, 21, 22, 23, 24, 25];
// each unit's people as blocks: Snohomish at the table's 36 arc-seconds, the rest of Washington in 0.05 degree blocks,
// the rest of the country in 0.5 degree blocks
const blocks = Array.from({ length: NU }, () => new Map());
const add = (u, lat, lon, pop, res) => { const key = `${Math.floor(lat / res)},${Math.floor(lon / res)}`, b = blocks[u].get(key) || [0, 0, 0]; b[0] += pop; b[1] += pop * lat; b[2] += pop * lon; blocks[u].set(key, b); };
for (let r = 0; r < WA.rows; r++) for (let c = 0; c < WA.cols; c++) {
  const pop = WA.v[r * WA.cols + c]; if (!(pop > 0)) continue;
  const lat = WA.north - (r + 0.5) * WA.cell_degrees_lat, lon = WA.west + (c + 0.5) * WA.cell_degrees_lon;
  if (inWA(lat, lon)) { if (inSnohomish(lat, lon)) add(nearest(lat, lon, COUNTY), lat, lon, pop, 0.01); else add(nearest(lat, lon, STATE), lat, lon, pop, 0.05); }
  else add(nearest(lat, lon, NATION), lat, lon, pop, 0.5);
}
const waS = WA.north - WA.rows * WA.cell_degrees_lat, waE = WA.west + WA.cols * WA.cell_degrees_lon;
for (let r = 0; r < US.rows; r++) for (let c = 0; c < US.cols; c++) {
  const pop = US.v[r * US.cols + c]; if (!(pop > 0)) continue;
  const lat = US.north - (r + 0.5) * US.cell_degrees_lat; let lon = US.west + (c + 0.5) * US.cell_degrees_lon; if (lon > 180) lon -= 360;
  if (lat > waS && lat < WA.north && lon > WA.west && lon < waE) continue;                 // counted from the finer table
  add(nearest(lat, lon, NATION), lat, lon, pop, 0.5);
}
const units = blocks.map((m, u) => { let p = 0, la = 0, lo = 0; const cells = []; for (const [w, wl, wo] of m.values()) { p += w; la += wl; lo += wo; cells.push([w, wl / w, wo / w]); } return { u, pop: p, lat: la / p, lon: lo / p, cells }; });
// the mean kernel between two places' people (law 75.41's pull of distance, as the simulation uses it)
const kernel = (d) => Math.pow(d + 20, -1.6);
const K = Array.from({ length: NU }, () => new Float64Array(NU)), D = Array.from({ length: NU }, () => new Float64Array(NU));
for (let i = 0; i < NU; i++) for (let j = i + 1; j < NU; j++) {
  let s = 0, sd = 0; for (const [wa, la, lo] of units[i].cells) for (const [wb, lb, lob] of units[j].cells) { const d = km(la, lo, lb, lob); s += wa * wb * kernel(d); sd += wa * wb * d; }
  K[i][j] = K[j][i] = s / (units[i].pop * units[j].pop); D[i][j] = D[j][i] = sd / (units[i].pop * units[j].pop);
}
const name = (u) => (u === CITY ? 'Port Alder' : PLACES[u][1]), model = (u) => (u === CITY ? 115000 : PLACES[u][3]);
console.log('unit                 raster people   model people   centre (lat, lon)   blocks');
for (const x of units) console.log(name(x.u).padEnd(18), String(Math.round(x.pop)).padStart(14), String(model(x.u)).padStart(14), `   ${x.lat.toFixed(3)}, ${x.lon.toFixed(3)}`.padEnd(22), x.cells.length);
// where Port Alder's movers would go on the kernel alone, with the model's populations
{ let z = 0; const sh = units.map((x) => (x.u === CITY ? 0 : model(x.u) * K[CITY][x.u])); for (const v of sh) z += v; const by = [0, 0, 0, 0];
  units.forEach((x) => { if (x.u !== CITY) by[PLACES[x.u][0]] += sh[x.u] / z; });
  console.log(`Port Alder's movers by the kernel alone: county ${(by[1] * 100).toFixed(1)}%, state ${(by[2] * 100).toFixed(1)}%, nation ${(by[3] * 100).toFixed(1)}%`);
  console.log('  nearest shares:', units.filter((x) => x.u !== CITY).map((x) => [name(x.u), sh[x.u] / z]).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, v]) => `${n} ${(v * 100).toFixed(1)}%`).join(', ')); }
const f = (x) => Number(x.toPrecision(6));
const out = `// SPDX-License-Identifier: GPL-3.0-only
// GENERATED by tools/make_movement.mjs from population tables cut out of a WorldPop raster. Do not edit by hand.
// Source of the geography: WorldPop (www.worldpop.org), population counts 2026, R2025A v1, 3 arc-second
// constrained, CC BY 4.0 (${WA.source || US.source || 'usa_pop_2026_CN_100m_R2025A_v1'}). Only these derived tables are kept.
// Units 0..25 are PLACES[0..25] of periphery.js; unit 26 is Port Alder.
export const MOVE_SOURCE = "WorldPop R2025A v1, population 2026, 3 arc-second constrained, CC BY 4.0";
// where each unit's people live: [latitude, longitude] of the population-weighted centre, and the people the raster counts there
export const MOVE_CENTRE = ${JSON.stringify(units.map((x) => [f(x.lat), f(x.lon)]))};
export const MOVE_RASTER_POP = ${JSON.stringify(units.map((x) => Math.round(x.pop)))};
// the mean distance (km) between a person of one unit and a person of another
export const MOVE_DIST = ${JSON.stringify(D.map((row) => Array.from(row, (v) => Number(v.toPrecision(5)))))};
// the mean gravity kernel (d + 20 km)^-1.6 between a person of one unit and a person of another (law 75.41)
export const MOVE_KERNEL = ${JSON.stringify(K.map((row) => Array.from(row, f)))};
`;
writeFileSync(new URL('../src/movement_data.js', import.meta.url), out);
// the Everett table is kept for the full-scale map (where people live, cell by cell)
mkdirSync(new URL('../data/pop/', import.meta.url), { recursive: true });
for (const ext of ['f32', 'json']) copyFileSync(`${dir}/everett_pop_3arcsec.${ext}`, new URL(`../data/pop/everett_pop_3arcsec.${ext}`, import.meta.url));
console.log(`wrote src/movement_data.js (${out.length} bytes) and data/pop/everett_pop_3arcsec.f32`);
