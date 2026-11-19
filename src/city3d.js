// The live 3D Port Alder: terrain and streets, the bay, every building with its windows lit by who is home
// and which businesses are open, street trees and parks, the day's traffic and the people on the pavements,
// a spectral sky with the sun where it is over Washington on that date and hour, shadows and a filmic image.
// SPDX-License-Identifier: GPL-3.0-only
//
// The renderer follows the lessons of Deer Valley 1.4.1: every program is compiled without blocking the GPU
// process (KHR_parallel_shader_compile), safe graphics come up first and full detail is compiled behind them,
// a lost context is reported (the page rebuilds on a fresh canvas), and the shaders are written for FXC.
import { ContextLost, compilePrograms, buffer, vao, texture, target, freeTarget, M4, V3, gpuName } from "./gl.js";
import { Atmosphere, ATMOS_PROGRAMS, sunColor } from "./atmos.js";
import { Perf } from "./perf.js";
import { CITY_PROGRAMS, LIGHTS_W, LIGHTS_H } from "./city3d_shaders.js";
import { N, CELL_M, MATERIALS, SECTORS, B as BK, L as LAND } from "./citydata.js";
import { SCALE, NSHIFT, NMASK } from "./scale.js";
import { layWorld, walkLine, placeCell, mapCameras, KIND } from "./ground.js";
import { E_F0, E_B0, E_CITY, E_SCHOOL, E_ROW } from "./books.js";
import { dayInfo, DAY0 } from "./rules.js";
import { along, sunAt, LAMP, tideAt } from "./motion.js";
// the look of things (where a tree stands in its cell, a car's colour, which way a walker steps) is read from what
// they are, along irrational rotations (law 12.42), not drawn
const weyl = (n, a = 0.6180339887498949) => (((n * a) % 1) + 1) % 1, look = (n) => Math.floor(weyl(n) * 4294967296) >>> 0;
import { homeCell } from "./people.js";

export const CITY3D_VERSION = "1.4.0";
const WORLD = N * CELL_M, LAT = 47.6, LON = -122.6;
// base colours of the 24 materials (linear), used in safe graphics and until the library is loaded
const MAT_COL = [[0.05, 0.05, 0.055], [0.42, 0.41, 0.39], [0.36, 0.16, 0.10], [0.30, 0.29, 0.28], [0.10, 0.22, 0.05], [0.20, 0.14, 0.08], [0.62, 0.55, 0.42], [0.16, 0.11, 0.07],
  [0.40, 0.14, 0.09], [0.60, 0.46, 0.28], [0.48, 0.47, 0.45], [0.20, 0.25, 0.30], [0.70, 0.66, 0.58], [0.62, 0.64, 0.66], [0.38, 0.40, 0.43], [0.62, 0.52, 0.38],
  [0.14, 0.14, 0.15], [0.32, 0.33, 0.34], [0.34, 0.32, 0.30], [0.30, 0.34, 0.36], [0.17, 0.18, 0.21], [0.42, 0.30, 0.18], [0.40, 0.20, 0.09], [0.78, 0.76, 0.72]];
export const QUALITY = { low: { shadow: 1024, scale: 0.7 }, medium: { shadow: 2048, scale: 0.85 }, high: { shadow: 2048, scale: 1.0 }, ultra: { shadow: 4096, scale: 1.0 } };

/* ------------------------------------------------------------------ meshes */
function boxMesh() {                // the unit box: walls (part 0) and the flat roof (part 1), no floor
  const P = [], Nn = [], A = [], I = [];
  const quad = (a, b, c, d, n, part) => { const o = P.length / 3; for (const v of [a, b, c, d]) { P.push(...v); Nn.push(...n); A.push(part); } I.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  quad([0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1], 0); quad([1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, -1], 0);
  quad([1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 0], 0); quad([0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0], [-1, 0, 0], 0);
  quad([0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0], [0, 1, 0], 1);
  return { P: new Float32Array(P), N: new Float32Array(Nn), A: new Float32Array(A), I: new Uint16Array(I) };
}
function gableMesh() {              // a pitched roof over the unit footprint: two slopes (part 2) and two gable ends (part 0)
  const P = [], Nn = [], A = [], I = [];
  const tri = (a, b, c, n, part) => { const o = P.length / 3; for (const v of [a, b, c]) { P.push(...v); Nn.push(...n); A.push(part); } I.push(o, o + 1, o + 2); };
  const quad = (a, b, c, d, n, part) => { const o = P.length / 3; for (const v of [a, b, c, d]) { P.push(...v); Nn.push(...n); A.push(part); } I.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  quad([0, 0, 0], [0, 0, 1], [0.5, 1, 1], [0.5, 1, 0], [-0.7, 0.7, 0], 2); quad([1, 0, 1], [1, 0, 0], [0.5, 1, 0], [0.5, 1, 1], [0.7, 0.7, 0], 2);
  tri([0, 0, 1], [1, 0, 1], [0.5, 1, 1], [0, 0, 1], 0); tri([1, 0, 0], [0, 0, 0], [0.5, 1, 0], [0, 0, -1], 0);
  return { P: new Float32Array(P), N: new Float32Array(Nn), A: new Float32Array(A), I: new Uint16Array(I) };
}
function treeMesh() {                // a trunk (part 0) and a rounded crown (part 1), height 1
  const P = [], Nn = [], A = [], I = [];
  const ring = (y, r, part) => { const o = P.length / 3; for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; P.push(Math.cos(a) * r, y, Math.sin(a) * r); Nn.push(Math.cos(a), 0, Math.sin(a)); A.push(part); } return o; };
  const a0 = ring(0, 1, 0), a1 = ring(0.45, 0.7, 0); for (let k = 0; k < 6; k++) { const k1 = (k + 1) % 6; I.push(a0 + k, a1 + k, a1 + k1, a0 + k, a1 + k1, a0 + k1); }
  // crown: a stack of rings, an approximate sphere centred at 0.66 with radius 0.34
  const rows = []; for (let j = 0; j <= 6; j++) { const t = j / 6, ph = t * Math.PI, y = 0.66 - Math.cos(ph) * 0.34, r = Math.sin(ph) * 1.0 + 0.0001; const o = P.length / 3; for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; P.push(Math.cos(a) * r, y, Math.sin(a) * r); Nn.push(Math.cos(a) * Math.sin(ph), -Math.cos(ph), Math.sin(a) * Math.sin(ph)); A.push(1); } rows.push(o); }
  for (let j = 0; j < 6; j++) for (let k = 0; k < 8; k++) { const k1 = (k + 1) % 8, a = rows[j] + k, b = rows[j] + k1, c = rows[j + 1] + k, d = rows[j + 1] + k1; I.push(a, c, d, a, d, b); }
  return { P: new Float32Array(P), N: new Float32Array(Nn), A: new Float32Array(A), I: new Uint16Array(I) };
}
function carMesh() {                 // body (0), glass (1), headlights (2), tail lights (3); unit size, forward is +z
  const P = [], Nn = [], A = [], I = [];
  const box = (x0, y0, z0, x1, y1, z1, part, top = part) => {
    const f = (a, b, c, d, n, p) => { const o = P.length / 3; for (const v of [a, b, c, d]) { P.push(...v); Nn.push(...n); A.push(p); } I.push(o, o + 1, o + 2, o, o + 2, o + 3); };
    f([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], part); f([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], part);
    f([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], part); f([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], part);
    f([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], top);
  };
  box(-0.5, 0.12, -0.5, 0.5, 0.55, 0.5, 0); box(-0.44, 0.55, -0.28, 0.44, 0.95, 0.22, 1, 0);
  box(-0.42, 0.3, 0.5, -0.2, 0.42, 0.51, 2); box(0.2, 0.3, 0.5, 0.42, 0.42, 0.51, 2); box(-0.45, 0.32, -0.51, -0.25, 0.42, -0.5, 3); box(0.25, 0.32, -0.51, 0.45, 0.42, -0.5, 3);
  return { P: new Float32Array(P), N: new Float32Array(Nn), A: new Float32Array(A), I: new Uint16Array(I) };
}
function personMesh() {              // torso and head (0), legs (1, 2), arms (3, 4); about 1.7 m tall
  const P = [], Nn = [], A = [], I = [];
  const box = (x0, y0, z0, x1, y1, z1, part) => {
    const f = (a, b, c, d, n) => { const o = P.length / 3; for (const v of [a, b, c, d]) { P.push(...v); Nn.push(...n); A.push(part); } I.push(o, o + 1, o + 2, o, o + 2, o + 3); };
    f([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]); f([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
    f([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]); f([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
    f([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
  };
  box(-0.19, 0.9, -0.11, 0.19, 1.45, 0.11, 0); box(-0.1, 1.47, -0.1, 0.1, 1.7, 0.12, 0);
  box(-0.17, 0.0, -0.08, -0.02, 0.92, 0.08, 1); box(0.02, 0.0, -0.08, 0.17, 0.92, 0.08, 2);
  box(-0.27, 0.82, -0.06, -0.19, 1.44, 0.06, 3); box(0.19, 0.82, -0.06, 0.27, 1.44, 0.06, 4);
  return { P: new Float32Array(P), N: new Float32Array(Nn), A: new Float32Array(A), I: new Uint16Array(I) };
}

/* ------------------------------------------------------------------ where the sun is */
// solar position (NOAA's simplified equations), for the given day of the year and local clock time
export function sunDirection(doy, minutes, y) {
  const g = (2 * Math.PI / 365) * (doy - 1 + (minutes / 60 - 12) / 24);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dst = isDST(y, doy) ? 60 : 0, tz = -8 * 60 + dst;
  const tst = minutes + eq + 4 * LON - tz, ha = ((tst / 4) - 180) * Math.PI / 180, lat = LAT * Math.PI / 180;
  const cz = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha), zen = Math.acos(Math.max(-1, Math.min(1, cz)));
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) + Math.PI;   // from north, clockwise
  const el = Math.PI / 2 - zen;
  // world axes: x east, z south, y up
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}
function isDST(y, doy) { const mar = nth(y, 3, 0, 2), nov = nth(y, 11, 0, 1); return doy >= mar && doy < nov; }
function nth(y, m, wd, n) { const z = Date.UTC(y, m - 1, 1) / 86400000, first = ((z % 7) + 11) % 7; const d = 1 + ((wd - first + 7) % 7) + 7 * (n - 1); return (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000 + 1; }

/* ------------------------------------------------------------------ the renderer */
export class City3D {
  constructor(canvas, { quality = "high", gfx = "auto", onPick = null, onStatus = null, onLost = null, onError = null, onUpgrade = null } = {}) {
    this.canvas = canvas; this.onPick = onPick; this.onStatus = onStatus; this.onLost = onLost; this.onError = onError; this.onUpgrade = onUpgrade;
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, depth: true, stencil: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
    if (!gl) { const e = new Error("no WebGL 2 context"); e.noContext = true; throw e; }
    this.gl = gl; this.gpu = gpuName(gl); this.d3d = /Direct3D|D3D1\d|D3D9/i.test(this.gpu);
    this.gfx = gfx === "auto" ? (this.d3d ? "progressive" : "full") : gfx; this.safe = this.gfx !== "full";
    this.half = !!gl.getExtension("EXT_color_buffer_float"); gl.getExtension("OES_texture_float_linear");
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.q = QUALITY[quality] || QUALITY.high; this.qualityName = quality;
    this.perf = new Perf(gl); this.cam = { tx: 30 * CELL_M, tz: 62 * CELL_M, yaw: -0.6, pitch: 0.55, dist: 900, mode: "orbit" }; this.reach = 4200 * (N / 128);
    this.minutes = 9 * 60; this.ready = false; this.running = false; this.lost = false; this.matReady = 0; this.t0 = performance.now();
    this.lostHandler = (ev) => { ev.preventDefault(); this.lost = true; this.running = false; this.onLost?.({ preparing: !this.ready, upgrading: !!this.upgradingNow }); };
    canvas.addEventListener("webglcontextlost", this.lostHandler);
    this.inputs();
    this.whenReady = this.prepare();
  }
  status(text) { this.onStatus?.(text); }
  async prepare() {
    const gl = this.gl;
    this.status("compiling shaders");
    const specs = { ...CITY_PROGRAMS, ...Object.fromEntries(Object.entries(ATMOS_PROGRAMS).map(([k, v]) => ["atmos_" + k, v])) };
    const defs = (this.safe ? "#define PLUME_SAFE 1\n" : "");
    const progs = await compilePrograms(gl, specs, { defines: defs, onProgress: (d, t, l) => this.status(`compiling shaders: ${d} of ${t} (${l})`) });
    // the shadow passes are the same vertex shaders with SHADOW_PASS defined
    this.P = progs;
    this.atmos = new Atmosphere(gl, { trans: progs.atmos_trans, ms: progs.atmos_ms, view: progs.atmos_view, rgb: progs.atmos_rgb });
    this.meshes = { box: this.mesh(boxMesh()), gable: this.mesh(gableMesh()), tree: this.mesh(treeMesh()), car: this.mesh(carMesh()), person: this.mesh(personMesh()) };
    this.shadowT = target(gl, this.q.shadow, this.q.shadow, { color: [], depth: true, depthTexture: true });
    gl.bindTexture(gl.TEXTURE_2D, this.shadowT.depthTex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.empty = gl.createVertexArray();
    this.resize(true);
    this.ready = true; this.status(this.safe ? "safe graphics" : "ready");
    if (this.gfx === "progressive") setTimeout(() => this.upgrade(), 1500);
    return true;
  }
  // compile the full-detail programs behind the safe ones, then swap them in
  async upgrade() {
    if (!this.safe || this.lost || this.upgradingNow) return;
    this.upgradingNow = true;
    try {
      const full = await compilePrograms(this.gl, CITY_PROGRAMS, { onProgress: (d, t) => this.status(`full detail: ${d} of ${t}`) });
      if (this.lost) return;
      Object.assign(this.P, full); this.safe = false; this.onUpgrade?.(true); this.status("ready");
    } catch (e) { if (e instanceof ContextLost || this.gl.isContextLost()) return; this.onUpgrade?.(false, e); }
    finally { this.upgradingNow = this.gl.isContextLost(); }
  }
  mesh(m) {
    const gl = this.gl;
    return { pos: buffer(gl, m.P), nrm: buffer(gl, m.N), part: buffer(gl, m.A), idx: buffer(gl, m.I, gl.ELEMENT_ARRAY_BUFFER), count: m.I.length };
  }
  // a VAO for a mesh with an instance buffer laid out as named vec4 attributes
  instVao(prog, mesh, inst, names) {
    const gl = this.gl, va = gl.createVertexArray(); gl.bindVertexArray(va);
    const bindAttr = (name, buf, size, stride = 0, offset = 0, div = 0) => { const loc = gl.getAttribLocation(prog.p, name); if (loc < 0) return; gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset); gl.vertexAttribDivisor(loc, div); };
    bindAttr("a_pos", mesh.pos, 3); bindAttr("a_nrm", mesh.nrm, 3); bindAttr("a_part", mesh.part, 1);
    names.forEach((n, k) => bindAttr(n, inst, 4, names.length * 16, k * 16, 1));
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx); gl.bindVertexArray(null);
    return va;
  }

  /* -------------------------------------------------------------- the city's static geometry */
  attach(city) {
    this.city = city; const W = city.world, gl = this.gl;
    // heights: metres per cell (the bay floor lies below the water line)
    const hgt = new Float32Array(N * N); for (let c = 0; c < N * N; c++) hgt[c] = W.water[c] && !W.road[c] ? (W.level ? W.height[c] / 1000 : -2.5) : Math.max(0.3, W.height[c] / 1000);
    for (let c = 0; c < N * N; c++) if (W.road[c] === 3) hgt[c] = Math.max(hgt[c], (W.level ? W.level[c] : 0) + 2.5);   // bridges
    this.hgt = hgt;
    // on the real map bridges and piers are decks of their own: the ground under them is the bed of the water
    const bed = W.cover ? hgt.slice() : hgt; this.bed = bed;
    if (W.cover) for (let c = 0; c < N * N; c++) {
      if (W.cover[c] === KIND.pier) { bed[c] = -4; continue; }
      if (!W.water[c]) continue;
      if (W.road[c] === 3) bed[c] = W.height[c] / 1000;
      // beside the land the water is shallow, so the shore falls where the cells say it does
      const x = c & NMASK, y = c >> NSHIFT; let shore = false; for (let dy = -1; dy <= 1 && !shore; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < N && yy < N && !W.water[(yy << NSHIFT) | xx] && W.cover[(yy << NSHIFT) | xx] !== KIND.pier) { shore = true; break; } }
      if (shore) bed[c] = Math.max(bed[c], W.level[c] - 1.1);
    }
    // where a vehicle on a cell drives: the cell's middle, or on a real road the nearest point of its centre line (buildRoads)
    this.snapX = new Float32Array(N * N); this.snapZ = new Float32Array(N * N); this.snapT = new Float32Array(N * N * 3);      // snapT: the road's direction there (x, z) and its half-width
    for (let c = 0; c < N * N; c++) { this.snapX[c] = ((c & NMASK) + 0.5) * CELL_M; this.snapZ[c] = ((c >> NSHIFT) + 0.5) * CELL_M; }
    this.landTex = texture(gl, N, N, { filter: gl.NEAREST, data: this.landData() });
    this.lightsData = new Uint8Array(LIGHTS_W * LIGHTS_H * 4); this.lightsTex = texture(gl, LIGHTS_W, LIGHTS_H, { filter: gl.NEAREST, data: this.lightsData });
    // the ground: a 257 x 257 grid, ten metres apart, heights smoothed from the cells
    // (on the real map: a point at the middle of every cell, so a wharf or a slough one cell wide keeps its own height)
    const mid = !!W.cover, per = mid ? 1 : 2, gap = CELL_M / per, G = mid ? N : per * N + 1, off = mid ? CELL_M / 2 : 0, P = new Float32Array(G * G * 3), Nm = new Float32Array(G * G * 3), I = new Uint32Array((G - 1) * (G - 1) * 6);
    const hAt = (x, z) => { const cx = Math.max(0, Math.min(N - 1, Math.floor(x / CELL_M - 0.5))), cz = Math.max(0, Math.min(N - 1, Math.floor(z / CELL_M - 0.5))), fx = Math.max(0, Math.min(1, x / CELL_M - 0.5 - cx)), fz = Math.max(0, Math.min(1, z / CELL_M - 0.5 - cz));
      const h = (i, j) => bed[(Math.min(N - 1, j) << NSHIFT) | Math.min(N - 1, i)]; return (h(cx, cz) * (1 - fx) + h(cx + 1, cz) * fx) * (1 - fz) + (h(cx, cz + 1) * (1 - fx) + h(cx + 1, cz + 1) * fx) * fz; };
    this.groundAt = hAt;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const k = j * G + i, x = i * gap + off, z = j * gap + off; P[k * 3] = x; P[k * 3 + 1] = hAt(x, z); P[k * 3 + 2] = z; }
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const k = j * G + i, hl = P[(j * G + Math.max(0, i - 1)) * 3 + 1], hr = P[(j * G + Math.min(G - 1, i + 1)) * 3 + 1], hd = P[(Math.max(0, j - 1) * G + i) * 3 + 1], hu = P[(Math.min(G - 1, j + 1) * G + i) * 3 + 1]; const n = V3.norm([hl - hr, 2 * gap, hd - hu]); Nm.set(n, k * 3); }
    let o = 0; for (let j = 0; j < G - 1; j++) for (let i = 0; i < G - 1; i++) { const a = j * G + i; I[o++] = a; I[o++] = a + G; I[o++] = a + 1; I[o++] = a + 1; I[o++] = a + G; I[o++] = a + G + 1; }
    this.ground = { va: vao(gl, [[gl.getAttribLocation(this.P.ground.p, "a_pos"), buffer(gl, P), 3], [gl.getAttribLocation(this.P.ground.p, "a_nrm"), buffer(gl, Nm), 3]], buffer(gl, I, gl.ELEMENT_ARRAY_BUFFER)), count: I.length };
    const far = W.cover ? WORLD + 2000 : 2000, wq = new Float32Array([-far, 0, -far, WORLD + far, 0, -far, WORLD + far, 0, WORLD + far, -far, 0, WORLD + far]);
    this.water = { va: vao(gl, [[gl.getAttribLocation(this.P.water.p, "a_pos"), buffer(gl, wq), 3]], buffer(gl, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.ELEMENT_ARRAY_BUFFER)), count: 6 };
    this.around = null; this.lakes = null; this.roads = null; this.decks = null; if (W.cover) { this.buildWorld(); this.buildRoads(); }
    this.heightTex = texture(gl, N, N, { internal: gl.R32F, format: gl.RED, type: gl.FLOAT, filter: gl.NEAREST, data: hgt });
    this.buildBuildings(); this.buildTrees();
    this.carBuf = gl.createBuffer(); this.personBuf = gl.createBuffer();
    this.carVao = this.instVao(this.P.vehicle, this.meshes.car, this.carBuf, ["i_car", "i_col"]);
    this.carShadowVao = this.instVao(this.P.shadowVehicle, this.meshes.car, this.carBuf, ["i_car", "i_col"]);
    this.personVao = this.instVao(this.P.person, this.meshes.person, this.personBuf, ["i_p", "i_c"]);
    this.routes = new Map(); this.dayKey = -1;
    if (W.cover && W.sites.length) { const [x, z] = W.centre(W.sites[0]); this.cam.tx = x; this.cam.tz = z; this.cam.dist = 1500; }
  }
  // The world around the map (the real map only): three map-widths across with the map in its middle, drawn like the
  // map's own ground from a table of the same kind. And the lakes and rivers that stand above the sea, each at its level.
  buildWorld() {
    const gl = this.gl, W = this.city.world, C = 3 * N, A = layWorld(C), rel = W.relief, wet = (k) => k >= 1 && k <= 3, CC = C * C;
    // the level of every stretch of water (the sea and what is joined to it: 0; a lake: the lowest height on it), and the ground's heights
    const lvl = new Float32Array(CC), hg = new Float32Array(CC), seen = new Uint8Array(CC);
    for (let c0 = 0; c0 < CC; c0++) {
      if (!wet(A.kind[c0]) || seen[c0]) continue; const part = [c0]; seen[c0] = 1; let low = 1e9, sea = false;
      for (let q = 0; q < part.length; q++) { const c = part[q], x = c % C, y = (c - x) / C; if (A.kind[c] === KIND.sea) sea = true; if (A.height[c] < low) low = A.height[c];
        if (x > 0 && !seen[c - 1] && wet(A.kind[c - 1])) { seen[c - 1] = 1; part.push(c - 1); } if (x < C - 1 && !seen[c + 1] && wet(A.kind[c + 1])) { seen[c + 1] = 1; part.push(c + 1); }
        if (y > 0 && !seen[c - C] && wet(A.kind[c - C])) { seen[c - C] = 1; part.push(c - C); } if (y < C - 1 && !seen[c + C] && wet(A.kind[c + C])) { seen[c + C] = 1; part.push(c + C); } }
      const lv = sea || low < 3 ? 0 : low * rel; for (const c of part) lvl[c] = lv;
    }
    const road = new Uint8Array(CC), hwy = new Uint8Array(CC);
    for (const [cls, pts] of A.roads) if (cls <= 3) walkLine(pts, C, (x, y) => { const c = y * C + x; road[c] = wet(A.kind[c]) ? 3 : 2; if (cls <= 1) hwy[c] = 1; });
    const strip = new Uint8Array(CC); for (const [cls, pts] of A.strips) walkLine(pts, C, (x, y) => { const c = y * C + x; if (wet(A.kind[c])) return; A.kind[c] = KIND.runway; if (cls === 0) strip[c] = 1; });
    for (let c = 0; c < CC; c++) { const k = A.kind[c]; hg[c] = wet(k) ? lvl[c] - (k === KIND.sea ? 6 : 2.5) : Math.max(1.6, A.height[c] * rel); }
    this.wd = { A, C, hg, lvl };
    // the table the ground shader reads: land use, road, road condition, neighbours and the kind of open ground
    const d = new Uint8Array(CC * 4);
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      const c = y * C + x, k = A.kind[c], r = road[c]; let nb = 0; if (r) { if (x < C - 1 && road[c + 1]) nb |= 1; if (x > 0 && road[c - 1]) nb |= 2; if (y < C - 1 && road[c + C]) nb |= 4; if (y > 0 && road[c - C]) nb |= 8; }
      else if (strip[c]) { if (x < C - 1 && strip[c + 1]) nb |= 1; if (x > 0 && strip[c - 1]) nb |= 2; if (y < C - 1 && strip[c + C]) nb |= 4; if (y > 0 && strip[c - C]) nb |= 8; if (!nb) nb = 15; }
      const town = (q) => q === KIND.residential || q === KIND.commercial || q === KIND.industrial, urban = r && (town(k) || (x > 0 && town(A.kind[c - 1])) || (x < C - 1 && town(A.kind[c + 1])));
      d[c * 4] = wet(k) ? LAND.water : k === KIND.beach ? LAND.beach : k === KIND.runway ? LAND.plaza : LAND.park; d[c * 4 + 1] = r | (hwy[c] ? 16 : 0) | (r ? 32 : 0) | (urban ? 64 : 0); d[c * 4 + 2] = 225; d[c * 4 + 3] = nb | ((k === KIND.none ? (A.height[c] < 9 ? KIND.farm : KIND.forest) : k) << 4);   // unmarked ground: fields on the valley floors, woods elsewhere
    }
    // the ground: a point every two cells; under the map itself it is sunk out of sight, and its middle is left out
    const S = 2, G = C / S + 1, P = new Float32Array(G * G * 3), Nm = new Float32Array(G * G * 3), I = [];
    const at = (i, j) => hg[Math.max(0, Math.min(C - 1, j)) * C + Math.max(0, Math.min(C - 1, i))];
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const k = j * G + i, x = i * S, y = j * S, inMap = x > N + 1 && x < 2 * N - 1 && y > N + 1 && y < 2 * N - 1;
      P[k * 3] = (x - N) * CELL_M; P[k * 3 + 1] = (at(x - 1, y - 1) + at(x, y - 1) + at(x - 1, y) + at(x, y)) / 4 - (inMap ? 3 : 0); P[k * 3 + 2] = (y - N) * CELL_M;
    }
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const k = j * G + i, hl = P[(j * G + Math.max(0, i - 1)) * 3 + 1], hr = P[(j * G + Math.min(G - 1, i + 1)) * 3 + 1], hd = P[(Math.max(0, j - 1) * G + i) * 3 + 1], hu = P[(Math.min(G - 1, j + 1) * G + i) * 3 + 1]; Nm.set(V3.norm([hl - hr, 2 * S * CELL_M, hd - hu]), k * 3); }
    for (let j = 0; j < G - 1; j++) for (let i = 0; i < G - 1; i++) { const x = i * S, y = j * S; if (x >= N + 2 && x + S <= 2 * N - 2 && y >= N + 2 && y + S <= 2 * N - 2) continue; const a = j * G + i; I.push(a, a + G, a + 1, a + 1, a + G, a + G + 1); }
    this.around = { cells: C, tex: texture(gl, C, C, { filter: gl.NEAREST, data: d }), count: I.length,
      va: vao(gl, [[gl.getAttribLocation(this.P.ground.p, "a_pos"), buffer(gl, P), 3], [gl.getAttribLocation(this.P.ground.p, "a_nrm"), buffer(gl, Nm), 3]], buffer(gl, new Uint32Array(I), gl.ELEMENT_ARRAY_BUFFER)) };
    // water above the sea: a flat piece over every such cell, in the world and on the map
    const q = [], qi = []; const piece = (x0, z0, y) => { const o = q.length / 3; q.push(x0, y, z0, x0 + CELL_M, y, z0, x0 + CELL_M, y, z0 + CELL_M, x0, y, z0 + CELL_M); qi.push(o, o + 1, o + 2, o, o + 2, o + 3); };
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) { if (x >= N && x < 2 * N && y >= N && y < 2 * N) continue; const c = y * C + x; if (lvl[c] > 0.5 && !road[c]) piece((x - N) * CELL_M, (y - N) * CELL_M, lvl[c]); }
    for (let c = 0; c < N * N; c++) if (W.water[c] && W.level[c] > 0.5 && !W.road[c]) piece((c & NMASK) * CELL_M, (c >> NSHIFT) * CELL_M, W.level[c]);
    this.lakes = qi.length ? { count: qi.length, va: vao(gl, [[gl.getAttribLocation(this.P.water.p, "a_pos"), buffer(gl, new Float32Array(q)), 3]], buffer(gl, new Uint32Array(qi), gl.ELEMENT_ARRAY_BUFFER)) } : null;
    this.reach = WORLD * 0.95;
  }
  // The real roads, drawn from their centre lines as ribbons over the ground (ROAD_FS), on the map and in the world
  // around it: a point at least every 12 m, the edges at the road's half-width to either side, following the ground;
  // a long bridge rises to a deck above the water or the marsh. And the piers: a deck over every cell of one.
  buildRoads() {
    const gl = this.gl, W = this.city.world, { A, C, hg, lvl } = this.wd, VP = [], VR = [], I = [], HALF = [12, 10, 6.5, 5.5, 4.5], near = new Float32Array(N * N).fill(1e9);
    const inMap = (x, z) => x >= 0 && z >= 0 && x < WORLD && z < WORLD;
    const read = (a, S, fx, fz) => { const x0 = Math.max(0, Math.min(S - 2, Math.floor(fx - 0.5))), z0 = Math.max(0, Math.min(S - 2, Math.floor(fz - 0.5))), u = Math.max(0, Math.min(1, fx - 0.5 - x0)), v = Math.max(0, Math.min(1, fz - 0.5 - z0)); return (a[z0 * S + x0] * (1 - u) + a[z0 * S + x0 + 1] * u) * (1 - v) + (a[(z0 + 1) * S + x0] * (1 - u) + a[(z0 + 1) * S + x0 + 1] * u) * v; };
    // the ground under a point and the level of the water there (none: far below), from the map's tables or the world's
    const earth = (x, z) => (inMap(x, z) ? read(this.bed, N, x / CELL_M, z / CELL_M) : read(hg, C, x / CELL_M + N, z / CELL_M + N));
    const level = (x, z) => { if (inMap(x, z)) { const c = (Math.floor(z / CELL_M) << NSHIFT) | Math.floor(x / CELL_M); return W.water[c] ? W.level[c] : -99; } const cx = Math.floor(x / CELL_M) + N, cz = Math.floor(z / CELL_M) + N; if (cx < 0 || cz < 0 || cx >= C || cz >= C) return -99; const k = A.kind[cz * C + cx]; return k >= 1 && k <= 3 ? lvl[cz * C + cx] : -99; };
    this.runs = [];
    for (const [cls, pts, bridge, ramp, oneway] of A.roads) {
      const half = ramp ? 3.5 : oneway ? [5.8, 4.3, 3.6, 3.4, 3.0][cls] : HALF[cls], code = cls + (ramp ? 16 : 0) + (oneway ? 32 : 0), P = [];
      for (let i = 0; i + 1 < pts.length; i += 2) { const x = (pts[i] - N) * CELL_M, z = (pts[i + 1] - N) * CELL_M; if (P.length) { const [px, pz] = P[P.length - 1], n = Math.ceil(Math.hypot(x - px, z - pz) / 12); for (let k = 1; k < n; k++) P.push([px + ((x - px) * k) / n, pz + ((z - pz) * k) / n]); } P.push([x, z]); }
      if (P.length < 2) continue;
      const S = [0]; for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
      const L = S[S.length - 1] || 1, long = bridge && L > 110, lift = 0.3 + (4 - cls) * 0.05, first = VP.length / 3, end = P[P.length - 1];
      const y0 = Math.max(earth(P[0][0], P[0][1]), level(P[0][0], P[0][1]) + 1), y1 = Math.max(earth(end[0], end[1]), level(end[0], end[1]) + 1);
      for (let i = 0; i < P.length; i++) {
        const [x, z] = P[i], a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / tl, nz = (b[0] - a[0]) / tl;
        const lx = x - nx * half, lz = z - nz * half, rx = x + nx * half, rz = z + nz * half; let yl, yr;
        if (bridge) { const e = Math.min(1, Math.min(S[i], L - S[i]) / 45), rise = long ? 5 * e * e * (3 - 2 * e) : 0.5; yl = yr = Math.max(y0 + ((y1 - y0) * S[i]) / L, earth(x, z), level(x, z) + 1) + rise + lift; }
        else { const wl = level(x, z) + 0.8; yl = Math.max(earth(lx, lz), wl) + lift; yr = Math.max(earth(rx, rz), wl) + lift; }
        VP.push(lx, yl, lz, rx, yr, rz); VR.push(-1, S[i], code, 1, S[i], code);
        if (inMap(x, z)) { const c = (Math.floor(z / CELL_M) << NSHIFT) | Math.floor(x / CELL_M), d = Math.hypot(x - ((c & NMASK) + 0.5) * CELL_M, z - ((c >> NSHIFT) + 0.5) * CELL_M); if (d < near[c]) { near[c] = d; this.snapX[c] = x; this.snapZ[c] = z; this.snapT[c * 3] = nz; this.snapT[c * 3 + 1] = -nx; this.snapT[c * 3 + 2] = half; } this.hgt[c] = Math.max(this.hgt[c], (yl + yr) / 2 - 0.03); }
      }
      for (let i = 0; i + 1 < P.length; i++) { const a = first + i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      // the run the passing traffic drives on: the line at even steps, and its lanes (how far to the right of the line, which way)
      if (L > 40 && P.some(([x, z]) => inMap(x, z))) {
        const n = Math.max(2, Math.ceil(L / 10) + 1), X = new Float32Array(n), Z = new Float32Array(n); let k = 0, minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
        for (let j = 0; j < n; j++) { const sj = (j * L) / (n - 1); while (k < P.length - 2 && S[k + 1] < sj) k++; const u = Math.max(0, Math.min(1, (sj - S[k]) / Math.max(1e-6, S[k + 1] - S[k]))); X[j] = P[k][0] + (P[k + 1][0] - P[k][0]) * u; Z[j] = P[k][1] + (P[k + 1][1] - P[k][1]) * u; if (X[j] < minx) minx = X[j]; if (X[j] > maxx) maxx = X[j]; if (Z[j] < minz) minz = Z[j]; if (Z[j] > maxz) maxz = Z[j]; }
        const count = ramp || cls === 4 ? 1 : cls === 0 ? 3 : 2, lanes = [], most = Math.max(1, Math.ceil((L / 1000) * 110));          // (a lane's places for vehicles: one every 9 m, which is a standing queue)
        if (oneway) { const w = (2 * half - 2) / count; for (let q = 0; q < count; q++) lanes.push({ off: -half + 1 + w * (q + 0.5), dir: 1, n: most, quick: 1 + 0.07 * (count - 1 - q) }); }
        else { const base = cls === 0 ? 3.1 : cls === 1 ? 2.9 : cls === 2 ? 1.7 : cls === 3 ? 1.4 : ramp ? 1.6 : 2.1; for (let q = 0; q < count; q++) for (const dir of [1, -1]) lanes.push({ off: dir * (base + 3.1 * q), dir, n: most, quick: 1 + 0.07 * (count - 1 - q) }); }
        this.runs.push({ cls: ramp ? 5 : cls, L, step: L / (n - 1), n, X, Z, minx, maxx, minz, maxz, lanes, obs: -1, id: this.runs.length });
      }
      if (long) for (const side of [0, 1]) {                           // the sides of the deck
        const sf = VP.length / 3; for (let i = 0; i < P.length; i++) { const o = (first + i * 2 + side) * 3, u = side ? 1.1 : -1.1; VP.push(VP[o], VP[o + 1], VP[o + 2], VP[o], VP[o + 1] - 1.4, VP[o + 2]); VR.push(u, S[i], code, u, S[i], code); }
        for (let i = 0; i + 1 < P.length; i++) { const a = sf + i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
    }
    this.roads = I.length ? { count: I.length, va: vao(gl, [[gl.getAttribLocation(this.P.road.p, "a_pos"), buffer(gl, new Float32Array(VP)), 3], [gl.getAttribLocation(this.P.road.p, "a_road"), buffer(gl, new Float32Array(VR)), 3]], buffer(gl, new Uint32Array(I), gl.ELEMENT_ARRAY_BUFFER)) } : null;
    // The traffic cameras on the map, and the stretch of road each one watches: every point of a run takes the nearest
    // camera of its own kind of road (freeway or main road) within about 1.3 km.
    this.cams = mapCameras().map((k, i) => ({ ...k, i, sx: k.x * CELL_M, sz: k.y * CELL_M, level: -1, flow: null, kind: -1 }));
    const kindOf = (cls) => (cls <= 1 || cls === 5 ? 0 : cls <= 3 ? 1 : 2);
    for (const k of this.cams) { let bd = 150; for (const r of this.runs) { if (r.maxx < k.sx - 150 || r.minx > k.sx + 150 || r.maxz < k.sz - 150 || r.minz > k.sz + 150 || r.cls === 5) continue; for (let j = 0; j < r.n; j += 2) { const d = Math.hypot(r.X[j] - k.sx, r.Z[j] - k.sz) + (r.cls <= 1 ? 0 : 25); if (d < bd) { bd = d; k.kind = kindOf(r.cls); } } } }
    for (const r of this.runs) { r.camAt = new Int16Array(r.n).fill(-1); r.watched = false; const g = kindOf(r.cls); if (g > 1) continue; for (let j = 0; j < r.n; j++) { let bd = 1300; for (const k of this.cams) { if (k.kind !== g) continue; const dx = r.X[j] - k.sx, dz = r.Z[j] - k.sz; if (Math.abs(dx) > bd || Math.abs(dz) > bd) continue; const d = Math.hypot(dx, dz); if (d < bd) { bd = d; r.camAt[j] = k.i; r.watched = true; } } } }
    // piers: the top of the deck, and a side wherever the next cell is not pier
    const dp = [], dn = [], di = [], quad = (p, n) => { const o = dp.length / 3; dp.push(...p); for (let k = 0; k < 4; k++) dn.push(...n); di.push(o, o + 1, o + 2, o, o + 2, o + 3); };
    const pier = (x, y) => x >= 0 && y >= 0 && x < N && y < N && W.cover[(y << NSHIFT) | x] === KIND.pier;
    for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
      if (!pier(cx, cy)) continue; const x0 = cx * CELL_M, x1 = x0 + CELL_M, z0 = cy * CELL_M, z1 = z0 + CELL_M, y = this.hgt[(cy << NSHIFT) | cx], b = -2;
      quad([x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0], [0, 1, 0]);
      if (!pier(cx - 1, cy)) quad([x0, y, z0, x0, b, z0, x0, b, z1, x0, y, z1], [-1, 0, 0]); if (!pier(cx + 1, cy)) quad([x1, y, z0, x1, y, z1, x1, b, z1, x1, b, z0], [1, 0, 0]);
      if (!pier(cx, cy - 1)) quad([x0, y, z0, x1, y, z0, x1, b, z0, x0, b, z0], [0, 0, -1]); if (!pier(cx, cy + 1)) quad([x0, y, z1, x0, b, z1, x1, b, z1, x1, y, z1], [0, 0, 1]);
    }
    this.decks = di.length ? { count: di.length, va: vao(gl, [[gl.getAttribLocation(this.P.ground.p, "a_pos"), buffer(gl, new Float32Array(dp)), 3], [gl.getAttribLocation(this.P.ground.p, "a_nrm"), buffer(gl, new Float32Array(dn)), 3]], buffer(gl, new Uint32Array(di), gl.ELEMENT_ARRAY_BUFFER)) } : null;
  }
  landData() {
    const W = this.city.world, d = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const c = (y << NSHIFT) | x, r = W.road[c];
      let nb = 0; if (r) { if (x < N - 1 && W.road[c + 1]) nb |= 1; if (x > 0 && W.road[c - 1]) nb |= 2; if (y < N - 1 && W.road[c + N]) nb |= 4; if (y > 0 && W.road[c - N]) nb |= 8; }
      else if (W.strip && W.strip[c] === 1) { const S = W.strip; if (x < N - 1 && S[c + 1] === 1) nb |= 1; if (x > 0 && S[c - 1] === 1) nb |= 2; if (y < N - 1 && S[c + N] === 1) nb |= 4; if (y > 0 && S[c - N] === 1) nb |= 8; if (!nb) nb = 15; }   // a runway: which way it runs
      const ribbon = W.real && W.real[c], built = (q) => q >= 0 && q < N * N && (W.bldOf[q] >= 0 || W.land[q] === LAND.yard), urban = ribbon && (built(c - 1) || built(c + 1) || built(c - N) || built(c + N));
      d[c * 4] = W.land[c]; d[c * 4 + 1] = r | (W.hwy && W.hwy[c] ? 16 : 0) | (ribbon ? 32 : 0) | (urban ? 64 : 0); d[c * 4 + 2] = Math.min(255, Math.round(W.cond[c] / 4)); d[c * 4 + 3] = nb | ((W.cover ? W.cover[c] : 0) << 4);
    }
    return d;
  }
  buildBuildings() {
    const gl = this.gl, W = this.city.world, T = W.buildings, list = [], gables = [];
    for (const x of [this.bBuf, this.gBuf]) if (x) gl.deleteBuffer(x);                        // a rebuild replaces the last one's buffers
    for (const x of [this.bVao, this.gVao, this.bShadowVao, this.gShadowVao]) if (x) gl.deleteVertexArray(x);
    for (const b of T.each()) list.push(b);
    this.bList = list;
    const inst = new Float32Array(list.length * 16), ginst = [];
    this.boxes = new Float32Array(list.length * 6);
    list.forEach((b, k) => {
      const kind = T.kind[b], set = kind === BK.house ? 3.5 : kind === BK.townhouse ? 2.0 : kind <= BK.mixed ? 1.2 : 1.0;
      const x0 = T.x[b] * CELL_M + set, z0 = T.y[b] * CELL_M + set, w = T.w[b] * CELL_M - 2 * set, dd = T.h[b] * CELL_M - 2 * set;
      let base = 1e9; for (let y = T.y[b]; y < T.y[b] + T.h[b]; y++) for (let x = T.x[b]; x < T.x[b] + T.w[b]; x++) base = Math.min(base, this.hgt[(y << NSHIFT) | x]);
      const fl = T.floors[b], fh = kind === BK.office || kind === BK.hotel || kind === BK.hospital ? 3.8 : kind === BK.industrial ? 7.5 : 3.1;
      // a building coming down shrinks with the demolition's progress, a new one rises with the builder's, under scaffold
      const st = T.stage[b], prog = Math.max(0, Math.min(1000, T.progress[b])) / 1000, grow = st === 4 ? Math.max(0.06, prog) : st === 3 ? Math.max(0.06, 1 - prog) : 1, works = st >= 3 ? 1 : 0;
      const wall = ((kind === BK.mixed || kind === BK.shop ? 4.5 : 0) + fl * fh - (kind === BK.shop ? fh : 0)) * grow;
      const pitched = (kind === BK.house || kind === BK.townhouse || kind === BK.industrial) && !works, rise = pitched ? Math.min(w, dd) * (kind === BK.industrial ? 0.12 : 0.38) : 0;
      inst.set([x0, z0, w, dd, base - 1.5, wall + 1.5, rise, fl, T.facade[b], T.roof[b], kind, b, (T.tint[b] / 255), (T.seed[b] % 997) / 97, 0, works], k * 16);
      this.boxes.set([x0, base, z0, x0 + w, base + wall + rise, z0 + dd], k * 6);
      if (pitched) ginst.push(x0, z0, w, dd, base - 1.5, wall + 1.5, rise, fl, T.facade[b], T.roof[b], kind, b, (T.tint[b] / 255), (T.seed[b] % 997) / 97, 0, 0);
    });
    this.hasWorks = list.some((b) => T.stage[b] >= 3);
    this.bInst = inst; this.bBuf = buffer(gl, inst, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW); this.bCount = list.length;
    this.gBuf = buffer(gl, new Float32Array(ginst)); this.gCount = ginst.length / 16;
    const names = ["i_box", "i_dims", "i_mat", "i_look"];
    this.bVao = this.instVao(this.P.building, this.meshes.box, this.bBuf, names); this.gVao = this.instVao(this.P.building, this.meshes.gable, this.gBuf, names);
    this.bShadowVao = this.instVao(this.P.shadowBuilding, this.meshes.box, this.bBuf, names); this.gShadowVao = this.instVao(this.P.shadowBuilding, this.meshes.gable, this.gBuf, names);
  }
  // The trees, in groups: on the invented map one group, always drawn; on the real map (tens of thousands of trees) a
  // group for every 32 x 32 cells, drawn when it is near enough to the camera to be seen as trees.
  buildTrees() {
    const gl = this.gl, W = this.city.world, TS = 32, across = Math.ceil(N / TS), groups = new Map();
    for (const g of this.tGroups || []) { gl.deleteBuffer(g.buf); gl.deleteVertexArray(g.va); gl.deleteVertexArray(g.shadow); }
    for (let c = 0; c < N * N; c++) {
      const k = W.tree[c]; if (!k) continue; const cx = c & NMASK, cz = c >> NSHIFT, x = cx * CELL_M, z = cz * CELL_M, n = W.cover ? 1 : k === 3 ? 4 : k === 4 ? 1 : k;
      const key = W.cover ? Math.floor(cz / TS) * across + Math.floor(cx / TS) : 0; let t = groups.get(key); if (!t) groups.set(key, (t = []));
      for (let j = 0; j < n; j++) {
        const jx = weyl(c * 7 + j), jz = weyl(c * 7 + j, 0.41421356237309515), h = look(c * 7 + j);
        const px = k === 4 ? x + (jx < 0.5 ? 2.5 : CELL_M - 2.5) : x + 2 + jx * (CELL_M - 4), pz = k === 4 ? z + CELL_M / 2 : z + 2 + jz * (CELL_M - 4);
        t.push(px, pz, (k === 3 ? (W.cover ? 19 : 14) : 8) + ((h >>> 20) % 80) / 10, k === 3 || (h & 7) === 0 ? 2 : 1);
      }
    }
    this.tGroups = []; this.tCount = 0;
    for (const [key, t] of groups) {
      const buf = buffer(gl, new Float32Array(t)); this.tCount += t.length / 4;
      this.tGroups.push({ buf, count: t.length / 4, va: this.instVao(this.P.tree, this.meshes.tree, buf, ["i_tree"]), shadow: this.instVao(this.P.shadowTree, this.meshes.tree, buf, ["i_tree"]),
        all: !W.cover, x: ((key % across) + 0.5) * TS * CELL_M, z: (Math.floor(key / across) + 0.5) * TS * CELL_M });
    }
  }
  // the groups of trees near enough to draw
  treesNear() { const c = this.cam, reach = Math.min(2800, 800 + c.dist * 1.3) + 32 * CELL_M * 0.75; return this.tGroups.filter((g) => g.all || Math.hypot(g.x - c.tx, g.z - c.tz) < reach); }

  /* -------------------------------------------------------------- the day's traffic and people */
  // shortest street paths to a destination cell: breadth-first parents over the road grid, kept per destination
  route(to) {
    let r = this.routes.get(to); if (r) return r;
    const W = this.city.world, par = new Int32Array(N * N).fill(-1), q = this.searchQ || (this.searchQ = new Int32Array(N * N)); let h = 0, t = 0;
    if (!W.road[to]) return null;
    par[to] = to; q[t++] = to;
    while (h < t) { const c = q[h++], x = c & NMASK, y = c >> NSHIFT; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue; const n = (ny << NSHIFT) | nx; if (!W.road[n] || par[n] >= 0) continue; par[n] = c; q[t++] = n; } }
    r = par; if (this.routes.size > Math.max(40, Math.floor(600 * 16384 / (N * N)))) this.routes.clear(); this.routes.set(to, r); return r;
  }
  path(from, to) {
    const par = this.route(to); if (!par || par[from] < 0) return null;
    const out = [from]; let c = from; while (c !== to && out.length < 4 * N) { c = par[c]; out.push(c); } return out;
  }
  planDay() {
    const c = this.city, P = c.people, W = c.world, e = c.epoch, s = c.cfg.seed;
    this.trips = []; this.walkers = []; this.dayKey = e;
    const exitCell = (y) => { for (let x = N - 1; x > 100; x--) if (W.road[(y << NSHIFT) | x] === 2) return (y << NSHIFT) | x; return -1; };
    let exits = [12, 36, 60, 84, 108].map(exitCell).filter((x) => x >= 0), port = (100 << NSHIFT) | 30;
    const every = P.count > 20000 ? Math.ceil(P.count / 8000) : 1;                  // on a large map one citizen in `every` is drawn on the streets
    if (W.cover) {
      // the real map: the ways out are where its main roads cross its edge; the port is the works street nearest the water
      exits = []; for (let k = 0; k < N; k++) for (const c of [k, (N - 1) * N + k, k * N, k * N + N - 1]) if (W.road[c] === 2 && (!exits.length || exits[exits.length - 1] !== c)) exits.push(c);
      if (this.portCell === undefined) { let best = -1, bd = 1e9; for (let c = 0; c < N * N; c++) if (W.road[c] && !W.hwy[c] && W.hood[c] === 6 && W.waterDist[c] < bd) { bd = W.waterDist[c]; best = c; } this.portCell = best; }
      port = this.portCell;
    }
    for (const i of P.each()) {
      if (i % every) continue;
      const h = P.hh[i]; if (h < 0) continue; const hc = homeCell(c, h); if (hc < 0) continue;
      const t = P.today[i], mode = P.mode[i];
      if (t & 1) {
        let wc = c.workCell(i); if (P.emp[i] === E_ROW) { const f = P.away[i] - 1, south = f >= 0 && c.outer?.F.place[f] >= 9; let best = exits[0]; for (const x of exits) if (south ? (x >> NSHIFT) > (best >> NSHIFT) : (x >> NSHIFT) < (best >> NSHIFT)) best = x; wc = best; }   // toward the outer workplace
        if (wc >= 0 && wc !== hc) {
          const start = P.shift[i], end = start + P.hours[i] * 60 + (P.hours[i] >= 8 ? 30 : 0);
          if (mode === 1) { this.trips.push({ from: hc, to: wc, at: start - 25, kind: 0, col: look(P.sin[i] * 3 + 1) }); this.trips.push({ from: hc, to: wc, back: true, at: end + 2, kind: 0, col: look(P.sin[i] * 3 + 1) }); }
          else this.walkers.push({ from: hc, to: mode === 2 ? W.stopNear[hc] : wc, at: start - (mode === 2 ? 30 : 22), back: end, speed: mode === 3 ? 3.5 : 1.3, i });
        }
      }
      if (t & 4 && P.school[i] >= 0) this.walkers.push({ from: hc, to: W.frontCell(P.school[i]), at: 470 + (i % 20), back: 905 + (i % 25), speed: 1.2, i, kid: true });
      for (let k = 0; k < 3; k++) { const f = P.visit[i * 3 + k]; if (f < 0) continue; const fc = c.firmCell(f - E_F0); if (fc >= 0) this.walkers.push({ stay: fc, at: P.vtime[i * 3 + k] - 10, back: P.vtime[i * 3 + k] + 25, i, speed: 0.6 }); }
    }
    // deliveries between the port and the highway; buses on their routes
    for (let k = 0; k < 120; k++) { const from = exits.length && W.frontCell(W.sites[0]) >= 0 ? exits[k % exits.length] : -1; if (from >= 0 && port >= 0 && W.road[port]) this.trips.push({ from: k & 1 ? from : port, to: k & 1 ? port : from, at: 300 + (k * 7) % 1080, kind: 2, col: 0xd0d0d0 }); }
    // (one search of the streets serves every trip to the same place, so the trips are taken place by place; the way home is the way there, backwards)
    const jobs = this.trips.concat(this.walkers.filter((w) => w.to !== undefined && w.to >= 0)).sort((a, b) => a.to - b.to);
    for (const t of jobs) { t.path = this.path(t.from, t.to); if (t.back && t.path) t.path = t.path.slice().reverse(); }
    // the rhythm of the streets through the day, in half hours: when the city's own workers set out and come home
    // (their shifts), with the errands of the day between; quieter when it is not a working day
    const bins = new Float32Array(48), put = (min, w) => { const b = ((Math.floor(min / 30) % 48) + 48) % 48; bins[b] += w; bins[(b + 1) % 48] += w * 0.5; bins[(b + 47) % 48] += w * 0.5; };
    const step = Math.max(1, Math.ceil(P.count / 6000)); for (const i of P.each()) { if (i % step || P.emp[i] < 0 || !P.hours[i]) continue; const a = P.shift[i]; put(a - 20, 1); put(a + P.hours[i] * 60 + (P.hours[i] >= 8 ? 30 : 0) + 10, 1); }
    let top = 0; for (const v of bins) if (v > top) top = v; const work = c.today && c.today.workday === false ? 0.4 : 1;
    this.act = new Float32Array(48); for (let b = 0; b < 48; b++) { const hour = b / 2, errands = hour >= 9 && hour <= 20 ? 0.42 : hour >= 6 && hour < 22 ? 0.2 : 0.05; this.act[b] = Math.min(1, Math.max(errands, top ? (bins[b] / top) * work : 0)); }
    this.trips = this.trips.filter((t) => t.path && t.path.length > 1);
  }
  traffic() {
    const c = this.city, m = this.minutes, out = [], buses = [];
    if (this.dayKey !== c.epoch && !c.stepping) this.planDay();
    const pos = (path, f) => { const L = path.length - 1, x = f * L, k = Math.min(L - 1, Math.floor(x)), u = x - k, a = path[k], b = path[k + 1]; const ax = this.snapX[a], az = this.snapZ[a], bx = this.snapX[b], bz = this.snapZ[b]; const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1; return [ax + dx * u - (dz / len) * 3, az + dz * u + (dx / len) * 3, Math.atan2(dx, dz)]; };   // (keeping to the right)
    for (const t of this.trips) {
      const dur = t.path.length * 1.7 / 60 * (t.kind === 2 ? 1.4 : 1); if (m < t.at || m > t.at + dur) continue;
      const [x, z, hd] = pos(t.path, t.kind === 2 ? (m - t.at) / dur : along((m - t.at) / dur)), col = t.col;   // pulling away and braking (motion.js)
      out.push(x, z, hd, t.kind === 2 ? 2 : (col & 7) === 0 ? 3 : 0, ((col >> 8) & 255) / 300 + 0.05, ((col >> 16) & 255) / 300 + 0.05, ((col >> 24) & 255) / 300 + 0.05, m > 1140 || m < 420 ? 0.4 : 0);
    }
    // buses: evenly spaced around each route, more often at the city's chosen frequency
    const W = c.world, freq = (c.gov.busFreq || 100) / 100;
    if (m > 330 && m < 1410) W.routes.forEach((r, ri) => { const L = r.cells.length, n = Math.max(1, Math.round(L / 40 * freq)); for (let k = 0; k < n; k++) { const f = ((m / 60 * 0.9 + k / n + ri * 0.13) % 1 + 1) % 1, path = r.cells; const [x, z, hd] = pos(path, f); const col = r.colour; out.push(x, z, hd, 1, col[0], col[1], col[2], 0); } });
    this.passing(out, m);
    return new Float32Array(out);
  }
  // how busy the streets are at a minute of the day, 0 to 1 (planDay's rhythm, read between its half hours)
  busy(m) { const a = this.act; if (!a) return 0.35; const f = ((m / 30) % 48 + 48) % 48, i = Math.floor(f), u = f - i; return a[i] * (1 - u) + a[(i + 1) % 48] * u; }
  // The passing traffic of the real roads: every lane of every run near the camera carries vehicles, as thickly and
  // as fast as its level says (0 wide open, 1 moderate, 2 heavy, 3 stop and go). The level is the one known for the
  // stretch (reading: set for the camera that watches it, or reported by the flow sensors beside that camera for the
  // lane's direction of travel) or, without one, the day's rhythm. The vehicles are drawn, not simulated: they stand
  // for the flow, they move with the clock on the wall, and a lane keeps its own vehicles.
  passing(out, m) {
    const c = this.cam, runs = this.runs, t = this.wall || 0, dt = Math.min(0.25, Math.max(0, t - (this.passed ?? t))); this.passed = t;
    if (!runs || !runs.length || (c.mode !== "walk" && c.dist > 5200)) return;
    const R = c.mode === "walk" ? 1100 : Math.min(2600, 500 + c.dist * 1.4), busy = this.busy(m), lights = m > 1140 || m < 420 ? 0.4 : 0, cams = this.cams;
    // vehicles to a kilometre of lane at each level, and metres a second for each kind of road at each level
    const DENS = [7, 16, 32, 95], SPEED = [[27, 23, 12, 4], [24, 20, 11, 4], [15, 13, 8, 3], [13, 11, 7, 3], [11, 10, 6, 3], [12, 10, 6, 3]], at = (a, v) => { const i = Math.min(2, Math.floor(v)), u = v - i; return a[i] * (1 - u) + a[i + 1] * u; };
    const thin = 0.15 + 0.85 * Math.min(1, busy * 2), WAVE = 180, TURN = (2 * Math.PI) / WAVE; let shown = 0;
    for (const r of runs) {
      if (r.maxx < c.tx - R || r.minx > c.tx + R || r.maxz < c.tz - R || r.minz > c.tz + R) continue;
      // the level without a reading: the day's rhythm
      const plain = Math.max(0, Math.min(3, (r.cls <= 1 ? 2.2 : r.cls === 5 ? 1.2 : 1.5) * Math.pow(busy, 1.3)));
      for (let q = 0; q < r.lanes.length; q++) {
        // the lane's speed, from the readings along it where there are any; its vehicles move on by it, and come to a
        // new speed gently
        const lane = r.lanes[q], seed = r.id * 977 + q * 131; let seen = 0, sum = 0;
        if (r.watched) for (let j = 0; j < r.n - 1; j += 8) { const w = r.camAt[j]; if (w < 0) continue; const v = this.reading(cams[w], (r.X[j + 1] - r.X[j]) * lane.dir, (r.Z[j + 1] - r.Z[j]) * lane.dir); if (v >= 0) { seen++; sum += v; } }
        const want = at(SPEED[r.cls], seen ? sum / seen : plain) * lane.quick;
        if (lane.v === undefined) { lane.v = want; lane.s = (want * t) % r.L; } else lane.v += (want - lane.v) * Math.min(1, dt * 0.7);
        lane.s = (lane.s + lane.v * dt) % r.L;
        for (let k = 0; k < lane.n; k++) {
          let s = (((k + 0.5) / lane.n) * r.L + lane.s * lane.dir) % r.L; if (s < 0) s += r.L;
          const i0 = Math.min(r.n - 2, Math.floor(s / r.step)), w = r.watched ? r.camAt[i0] : -1; let level = plain;
          if (w >= 0) { const v = this.reading(cams[w], (r.X[i0 + 1] - r.X[i0]) * lane.dir, (r.Z[i0 + 1] - r.Z[i0]) * lane.dir); if (v >= 0) level = v; }
          // (a free road is emptier still at night)
          if (weyl(seed + k * 7) >= (at(DENS, level) * (level < 1 ? thin + (1 - thin) * level : 1)) / 110) continue;
          // in heavy traffic the vehicles close up and open out, in waves that travel back along the lane
          if (level > 1.5) { s += lane.dir * Math.min(1, (level - 1.5) / 1.5) * 8 * Math.sin(TURN * s * lane.dir + t * 0.157 + q); s %= r.L; if (s < 0) s += r.L; }
          const f = s / r.step, i = Math.min(r.n - 2, Math.floor(f)), u = f - i;
          const dx = r.X[i + 1] - r.X[i], dz = r.Z[i + 1] - r.Z[i], len = Math.hypot(dx, dz) || 1;
          const x = r.X[i] + dx * u - (dz / len) * lane.off, z = r.Z[i] + dz * u + (dx / len) * lane.off;
          if (x < 0 || z < 0 || x >= WORLD || z >= WORLD || Math.abs(x - c.tx) > R || Math.abs(z - c.tz) > R) continue;
          const h = look(seed + k * 13 + 5), lorry = r.cls <= 1 && (h & 15) === 0;
          out.push(x, z, Math.atan2(dx * lane.dir, dz * lane.dir), lorry ? 2 : (h & 7) === 1 ? 3 : 0, lorry ? 0.82 : ((h >> 8) & 255) / 300 + 0.05, lorry ? 0.82 : ((h >> 16) & 255) / 300 + 0.05, lorry ? 0.8 : ((h >> 24) & 255) / 300 + 0.05, lights);
          if (++shown > 9000) return;
        }
      }
    }
  }
  // What is known of the traffic a camera watches, for vehicles heading (hx, hz) on the map (x east, z south): the
  // level set for the camera, else what the flow sensors beside it report for that direction of travel, else -1.
  reading(k, hx, hz) {
    if (k.level >= 0) return k.level; const f = k.flow; if (!f) return -1;
    const len = Math.hypot(hx, hz) || 1; hx /= len; hz /= len; let best = 0.2, v = -1;
    if (f[0] >= 0 && -hz > best) { best = -hz; v = f[0]; } if (f[1] >= 0 && hx > best) { best = hx; v = f[1]; }
    if (f[2] >= 0 && hz > best) { best = hz; v = f[2]; } if (f[3] >= 0 && -hx > best) { best = -hx; v = f[3]; }
    return v;
  }
  // A walker keeps off the surface of a real road they are walking along: where (x, z) lies on such a road and the
  // walker is heading along it (hx, hz: a unit vector; both 0 for someone standing, who keeps off any road), the place
  // is moved sideways to just beyond the road's edge. Someone crossing a road is left to cross it. The roads looked at
  // are those of the cell and its eight neighbours; where two run side by side (the carriageways of a divided road)
  // the walker is moved on the same way past the second.
  kerb(x, z, hx, hz) {
    const T = this.snapT, at = this.kerbAt || (this.kerbAt = [0, 0]), still = !hx && !hz; let px = 0, pz = 0;
    for (let pass = 0; pass < 3; pass++) {
      const cx = Math.floor(x / CELL_M), cz = Math.floor(z / CELL_M); let best = 1e9, mx = 0, mz = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = cx + dx, Z = cz + dy; if (X < 0 || Z < 0 || X >= N || Z >= N) continue; const c = (Z << NSHIFT) | X, half = T[c * 3 + 2]; if (!(half > 0)) continue;
        const tx = T[c * 3], tz = T[c * 3 + 1]; if (!still && Math.abs(hx * tx + hz * tz) < 0.7) continue;
        const rx = x - this.snapX[c], rz = z - this.snapZ[c]; if (Math.abs(rx * tx + rz * tz) > CELL_M * 1.2) continue;
        const d = rz * tx - rx * tz, ad = Math.abs(d); if (ad >= half + 1.2 || ad >= best) continue;
        let way = d < 0 ? -1 : 1; if (pass && (-tz * px + tx * pz) * way < 0) way = -way;
        best = ad; const push = way * (half + 1.3) - d; mx = -tz * push; mz = tx * push;
      }
      if (best === 1e9) break; x += mx; z += mz; px += mx; pz += mz;
    }
    at[0] = x; at[1] = z; return at;
  }
  // The people on the pavements near the camera: along every street, walking its length on one side or the other, more
  // of them in the centre and by the shops and when the day is busy. Like the passing traffic they are drawn, not
  // simulated: the city's own citizens on their way to work and school are the walkers planDay sets out.
  strollers(out, m) {
    const c = this.cam, W = this.city.world; if (c.mode !== "walk" && c.dist > 950) return;
    const R = c.mode === "walk" ? 260 : Math.min(420, 140 + c.dist * 0.45), t = this.wall || 0, busy = this.busy(m), GAP = 26, cx0 = Math.max(0, Math.floor((c.tx - R) / CELL_M)), cx1 = Math.min(N - 1, Math.floor((c.tx + R) / CELL_M)), cz0 = Math.max(0, Math.floor((c.tz - R) / CELL_M)), cz1 = Math.min(N - 1, Math.floor((c.tz + R) / CELL_M));
    const lively = (cell) => { if (!W.road[cell] || W.road[cell] === 3 || (W.hwy && W.hwy[cell])) return 0; const hd = W.hood[cell], cov = W.cover ? W.cover[cell] : 0; return busy * (hd <= 1 ? 0.95 : cov === KIND.commercial ? 0.8 : cov === KIND.industrial || hd === 6 ? 0.18 : 0.34); };
    const walk = (line, lo, hi, across) => {
      // one street line (a row or a column of cells): walkers every GAP metres, half going each way
      for (const dir of [1, -1]) {
        const shift = dir * 1.25 * t + weyl(line * 31 + (dir > 0 ? 7 : 3) + (across ? 500 : 0)) * GAP;
        for (let k = Math.floor((lo - shift) / GAP); k <= Math.ceil((hi - shift) / GAP); k++) {
          const p = k * GAP + shift; if (p < lo || p >= hi) continue;
          const cell = across ? (Math.floor(p / CELL_M) << NSHIFT) | line : (line << NSHIFT) | Math.floor(p / CELL_M), h = look(line * 7919 + k * 31 + (dir > 0 ? 1 : 2) + (across ? 9000 : 0));
          const nbA = across ? cell - N : cell - 1, nbB = across ? cell + N : cell + 1; if (!(nbA >= 0 && W.road[nbA]) && !(nbB < N * N && W.road[nbB])) continue;       // the street runs the other way here
          if (((h >>> 8) % 1000) / 1000 >= lively(cell)) continue;
          const edge = dir > 0 ? CELL_M - 2.1 : 2.1, q = line * CELL_M + edge; let x = across ? q : p, z = across ? p : q;
          if (W.real && W.real[cell] && this.snapT[cell * 3 + 2] > 0 && Math.abs(this.snapT[cell * 3 + (across ? 1 : 0)]) >= 0.7) { const T = this.snapT, tx = T[cell * 3], tz = T[cell * 3 + 1], out2 = (T[cell * 3 + 2] + 1.3) * (dir > 0 ? 1 : -1), a = (p / CELL_M - Math.floor(p / CELL_M) - 0.5) * CELL_M * (across ? Math.sign(tz || 1) : Math.sign(tx || 1)); x = this.snapX[cell] + tx * a - tz * out2; z = this.snapZ[cell] + tz * a + tx * out2; const at = this.kerb(x, z, tx, tz); x = at[0]; z = at[1]; }       // beside the road's own line (where it runs the walker's way), and off any beside it
          else if (W.real) { const at = this.kerb(x, z, across ? 0 : 1, across ? 1 : 0); x = at[0]; z = at[1]; }
          out.push(x, z, across ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2), h % 50, ((h >> 4) % 100) / 100, ((h >> 12) % 100) / 100, 0.9 + ((h >> 20) % 18) / 100, 1);
        }
      }
    };
    for (let y = cz0; y <= cz1; y++) walk(y, cx0 * CELL_M, (cx1 + 1) * CELL_M, false);
    for (let x = cx0; x <= cx1; x++) walk(x, cz0 * CELL_M, (cz1 + 1) * CELL_M, true);
  }
  people() {
    const m = this.minutes, out = [], s = this.city.cfg.seed;
    for (const w of this.walkers) {
      if (w.stay !== undefined) { if (m < w.at || m > w.back) continue; const cx = (w.stay & NMASK) * CELL_M, cz = (w.stay >> NSHIFT) * CELL_M, h = look(w.i * 131 + w.at); const jx = (h % 100) / 100, jz = ((h >> 8) % 100) / 100, at = this.kerb(cx + 2 + jx * 16, cz + 1 + jz * 3, 0, 0); out.push(at[0], at[1], (h % 628) / 100, h % 50, ((h >> 4) % 100) / 100, ((h >> 12) % 100) / 100, 0.92 + ((h >> 20) % 16) / 100, ((m - w.at) % 7 < 2) ? 0.8 : 0); continue; }
      if (!w.path || w.path.length < 2) continue;
      const dur = (w.path.length * CELL_M) / w.speed / 60; let f = -1, path = w.path;
      if (m >= w.at && m <= w.at + dur) f = (m - w.at) / dur; else if (m >= w.back && m <= w.back + dur) { f = 1 - (m - w.back) / dur; }
      if (f < 0) continue;
      const L = path.length - 1, x = f * L, k = Math.min(L - 1, Math.floor(x)), u = x - k, a = path[k], b = path[k + 1];
      const ax = this.snapX[a], az = this.snapZ[a], bx = this.snapX[b], bz = this.snapZ[b], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
      const side = (w.i & 1 ? 1 : -1) * 7.6, h = look(w.i * 131 + 7), back = m >= w.back, at = this.kerb(ax + dx * u + (dz / len) * side, az + dz * u - (dx / len) * side, dx / len, dz / len);
      out.push(at[0], at[1], Math.atan2(back ? -dx : dx, back ? -dz : dz), h % 50, ((h >> 4) % 100) / 100, ((h >> 12) % 100) / 100 * 0 + (w.kid ? 0.66 : 0.95 + ((h >> 20) % 12) / 100), w.speed > 2 ? 2.2 : 1.0);
    }
    this.strollers(out, m);
    return new Float32Array(out);
  }
  // window lights for the hour: homes by how many residents are in, businesses while open, vacancies dark
  updateLights() {
    const c = this.city, W = c.world, T = W.buildings, D = W.dwellings, F = c.firms, m = this.minutes, d = this.lightsData; d.fill(0);
    const home = new Float32Array(T.top), units = new Float32Array(T.top);
    for (const dd of D.each()) { const b = D.bld[dd]; units[b]++; if (D.hh[dd] >= 0) home[b]++; }
    const dark = m > 30 && m < 330, eve = m > 1050 || m < 30, morn = m > 330 && m < 480;
    for (const b of T.each()) { if (b >= LIGHTS_W * LIGHTS_H) break; const frac = units[b] ? home[b] / units[b] : 0; d[b * 4] = Math.round(255 * frac * (dark ? 0.08 : eve ? 0.72 : morn ? 0.45 : 0.12)); d[b * 4 + 2] = T.units[b] && !home[b] ? 255 : 0; }
    for (const f of F.each()) {
      if (F.status[f] === 1) continue; const b = W.spaces.bld[F.space[f]], S = SECTORS[F.sector[f]];
      const open = m >= S.open && m < Math.min(S.close, 1440) || (S.close > 1440 && m < S.close - 1440);
      d[b * 4 + 1] = Math.max(d[b * 4 + 1], open ? 230 : 18); d[b * 4 + 3] = F.sector[f] + 1;
    }
    for (const b of [...T.each()].filter((x) => T.civic[x] || T.kind[x] === BK.school || T.kind[x] === BK.hospital)) d[b * 4 + 1] = (m > 450 && m < 1080) || T.kind[b] === BK.hospital ? 200 : 20;
    const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.lightsTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, LIGHTS_W, LIGHTS_H, gl.RGBA, gl.UNSIGNED_BYTE, d);
    // scaffolding where a floor is going up
    for (let k = 0; k < this.bList.length; k++) this.bInst[k * 16 + 15] = T.started[this.bList[k]] ? 1 : 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.bInst);
  }

  /* -------------------------------------------------------------- the camera and input */
  inputs() {
    const cv = this.canvas, fingers = new Map(); let drag = null, pinch = null;
    // Travelling. Drag moves across the ground; right-drag (or Ctrl-drag) turns and tilts; the wheel zooms toward the
    // pointer; W A S D and the arrow keys travel, Q and E turn; a double-click flies to the place under the pointer.
    // On a touch screen two fingers zoom (pinch) and turn (twist). At street level (cam.mode "walk") a drag looks
    // around, the keys walk (Shift goes at a car's speed) and a double-click walks to the place under the pointer.
    this.keys = new Set(); this.fly = null;
    this.onDown = (e) => { cv.focus?.({ preventScroll: true }); this.fly = null; try { cv.setPointerCapture?.(e.pointerId); } catch { /* not a pointer that can be held */ }
      if (e.pointerType === "touch") { fingers.set(e.pointerId, [e.clientX, e.clientY]); if (fingers.size > 2) return; if (fingers.size === 2) { const [a, b] = [...fingers.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, ang: Math.atan2(b[1] - a[1], b[0] - a[0]), dist: this.cam.dist, yaw: this.cam.yaw }; drag = null; return; } }
      drag = { x: e.clientX, y: e.clientY, b: e.button, turn: e.button === 2 || e.ctrlKey || e.altKey || this.cam.mode === "walk", yaw: this.cam.yaw, pitch: this.cam.pitch, look: this.cam.look || 0, tx: this.cam.tx, tz: this.cam.tz, moved: false }; };
    this.onMove = (e) => { if (fingers.has(e.pointerId)) fingers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch) { if (fingers.size === 2 && this.cam.mode !== "walk") { const [a, b] = [...fingers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, da = Math.atan2(b[1] - a[1], b[0] - a[0]) - pinch.ang; this.cam.dist = Math.max(25, Math.min(this.reach, (pinch.dist * pinch.d) / d)); this.cam.yaw = pinch.yaw + Math.atan2(Math.sin(da), Math.cos(da)); } return; }
      if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (this.cam.mode === "walk") { this.cam.yaw = drag.yaw - dx * 0.004; this.cam.look = Math.max(-1.2, Math.min(1.2, drag.look + dy * 0.003)); return; }
      if (drag.turn) { this.cam.yaw = drag.yaw + dx * 0.005; this.cam.pitch = Math.max(0.05, Math.min(1.45, drag.pitch + dy * 0.004)); }
      else { const s = (this.cam.dist / 900) * (900 / Math.max(300, this.H / (window.devicePixelRatio || 1))), c = Math.cos(this.cam.yaw), sn = Math.sin(this.cam.yaw); this.cam.tx = Math.max(0, Math.min(WORLD, drag.tx - (dx * c - dy * sn) * s)); this.cam.tz = Math.max(0, Math.min(WORLD, drag.tz - (dx * sn + dy * c) * s)); } };
    this.onUp = (e) => { fingers.delete(e.pointerId); if (pinch) { if (!fingers.size) pinch = null; drag = null; return; } if (drag && !drag.moved && drag.b === 0 && e.type === "pointerup") this.pick(e); drag = null; };
    this.onWheel = (e) => { e.preventDefault(); const c = this.cam; if (c.mode === "walk") return; const was = c.dist, g = this.groundUnder(e); c.dist = Math.max(25, Math.min(this.reach, c.dist * Math.exp(e.deltaY * 0.0012)));
      if (g && c.dist < was) { const f = 1 - c.dist / was; c.tx = Math.max(0, Math.min(WORLD, c.tx + (g[0] - c.tx) * f)); c.tz = Math.max(0, Math.min(WORLD, c.tz + (g[1] - c.tz) * f)); } };
    this.onDbl = (e) => { const g = this.groundUnder(e), c = this.cam; if (!g) return; if (c.mode !== "walk") { this.flyTo(g[0], g[1], Math.max(120, c.dist * 0.4)); return; }
      const dx = g[0] - c.tx, dz = g[1] - c.tz, k = Math.min(1, 300 / Math.max(1, Math.hypot(dx, dz))); this.flyTo(c.tx + dx * k, c.tz + dz * k); };
    this.onCtx = (e) => e.preventDefault();
    const TRAVEL = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
    this.onKey = (e) => { if (!TRAVEL.has(e.code)) return; if (e.type === "keyup") { this.keys.delete(e.code); return; } if (e.ctrlKey || e.metaKey || e.altKey) return; this.keys.add(e.code); this.fly = null; e.preventDefault(); };       // (the browser's own shortcuts are left alone)
    this.onBlur = () => this.keys.clear();
    cv.addEventListener("pointerdown", this.onDown); cv.addEventListener("pointermove", this.onMove); cv.addEventListener("pointerup", this.onUp); cv.addEventListener("pointercancel", this.onUp); cv.addEventListener("wheel", this.onWheel, { passive: false }); cv.addEventListener("contextmenu", this.onCtx);
    cv.addEventListener("dblclick", this.onDbl); cv.addEventListener("keydown", this.onKey); cv.addEventListener("keyup", this.onKey); cv.addEventListener("blur", this.onBlur); globalThis.addEventListener?.("blur", this.onBlur);
  }
  // the camera: looking down at a point on the ground from a distance (orbit), or standing on it at street level (walk)
  eye() { const c = this.cam, ty = this.groundAt ? this.groundAt(c.tx, c.tz) : 0; if (c.mode === "walk") return [c.tx, Math.max(ty, 0.5) + 2.4, c.tz]; const cp = Math.cos(c.pitch); return [c.tx + Math.sin(c.yaw) * cp * c.dist, ty + Math.sin(c.pitch) * c.dist + 2, c.tz + Math.cos(c.yaw) * cp * c.dist]; }
  aim() { const c = this.cam, ty = this.groundAt(c.tx, c.tz); if (c.mode !== "walk") return [c.tx, ty, c.tz]; const e = this.eye(), cl = Math.cos(c.look || 0); return [e[0] - Math.sin(c.yaw) * cl * 20, e[1] - Math.sin(c.look || 0) * 20, e[2] - Math.cos(c.yaw) * cl * 20]; }
  // the point of the ground under the pointer (taken as level with the ground at the camera's aim)
  groundUnder(e) {
    if (!this.VP) return null; const r = this.canvas.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * 2 - 1, y = 1 - ((e.clientY - r.top) / r.height) * 2;
    const inv = M4.invert(this.VP), un = (z) => { const o = [0, 0, 0, 0]; for (let k = 0; k < 4; k++) o[k] = inv[k] * x + inv[4 + k] * y + inv[8 + k] * z + inv[12 + k]; return [o[0] / o[3], o[1] / o[3], o[2] / o[3]]; };
    const p0 = un(-1), p1 = un(1), dy = p1[1] - p0[1], y0 = this.groundAt(this.cam.tx, this.cam.tz); if (dy >= -1e-6) return null;
    const t = (y0 - p0[1]) / dy; return [Math.max(0, Math.min(WORLD, p0[0] + (p1[0] - p0[0]) * t)), Math.max(0, Math.min(WORLD, p0[2] + (p1[2] - p0[2]) * t))];
  }
  // the traffic cameras for the page: the list, the one nearest the view, and setting the level of traffic one watches
  // (-1: as the day runs; 0 wide open, 1 moderate, 2 heavy, 3 stop and go)
  cameras() { return this.cams || []; }
  cameraNear(x = this.cam.tx, z = this.cam.tz) { let best = -1, bd = 1e9; for (const k of this.cams || []) { const d = Math.hypot(k.sx - x, k.sz - z); if (d < bd) { bd = d; best = k.i; } } return best; }
  setLevel(i, level) { const k = (this.cams || [])[i], v = Number(level); if (k) k.level = Number.isFinite(v) ? Math.max(-1, Math.min(3, v)) : -1; }
  // what the flow sensors beside a camera report, by direction of travel: [northbound, eastbound, southbound, westbound],
  // each -1 (nothing known) or 0 to 3; null when there is nothing
  setFlow(i, four) { const k = (this.cams || [])[i]; if (!k) return; const f = Array.isArray(four) && four.length === 4 ? four.map((v) => (Number.isFinite(v) ? Math.max(-1, Math.min(3, v)) : -1)) : null; k.flow = f && f.some((v) => v >= 0) ? f : null; }
  sceneOf(lat, lon) { const p = this.city && this.city.world.cover && Number.isFinite(lat) && Number.isFinite(lon) ? placeCell(lat, lon) : null; return p ? [p[0] * CELL_M, p[1] * CELL_M] : null; }
  // travel to a place on the real ground
  goTo(lat, lon, dist) { const p = this.sceneOf(lat, lon); if (p) this.flyTo(p[0], p[1], dist); return !!p; }
  // travel to a place: the camera glides there (and to that distance, when one is given)
  flyTo(x, z, dist) { if (!Number.isFinite(x) || !Number.isFinite(z)) return; const c = this.cam; this.fly = { x: Math.max(0, Math.min(WORLD, x)), z: Math.max(0, Math.min(WORLD, z)), dist: c.mode !== "walk" && Number.isFinite(dist) && dist > 0 ? Math.max(25, Math.min(this.reach, dist)) : c.dist }; }
  // down to street level where the camera is aimed, or back up
  walk(on) { const c = this.cam; this.fly = null; if (on && c.mode !== "walk") { c.mode = "walk"; c.look = 0.05; c.back = c.dist; c.dist = 80; } else if (!on && c.mode === "walk") { c.mode = "orbit"; c.dist = Math.min(this.reach, Math.max(260, c.back || 600)); c.pitch = 0.6; } }
  // the keys and a flight under way move the camera, by the time since the last frame
  travel(dt) {
    const c = this.cam, K = this.keys, has = (a, b) => (K.has(a) || K.has(b) ? 1 : 0), fwd = has("KeyW", "ArrowUp") - has("KeyS", "ArrowDown"), side = has("KeyD", "ArrowRight") - has("KeyA", "ArrowLeft"), turn = (K.has("KeyE") ? 1 : 0) - (K.has("KeyQ") ? 1 : 0);
    if (fwd || side || turn) {
      const fast = K.has("ShiftLeft") || K.has("ShiftRight"), v = (c.mode === "walk" ? (fast ? 45 : 7) : c.dist * (fast ? 2.4 : 1.1)) * dt, sn = Math.sin(c.yaw), cs = Math.cos(c.yaw);
      c.tx = Math.max(0, Math.min(WORLD, c.tx + (-sn * fwd + cs * side) * v)); c.tz = Math.max(0, Math.min(WORLD, c.tz + (-cs * fwd - sn * side) * v)); c.yaw += (c.mode === "walk" ? -1 : 1) * turn * 1.4 * dt;
    }
    if (this.fly) { const f = this.fly, k = 1 - Math.exp(-dt * 5); c.tx += (f.x - c.tx) * k; c.tz += (f.z - c.tz) * k; c.dist += (f.dist - c.dist) * k; if (Math.abs(f.x - c.tx) + Math.abs(f.z - c.tz) < 0.5 && Math.abs(f.dist - c.dist) < 1) this.fly = null; }
  }
  focusBuilding(b) { const T = this.city.world.buildings; this.cam.tx = (T.x[b] + T.w[b] / 2) * CELL_M; this.cam.tz = (T.y[b] + T.h[b] / 2) * CELL_M; this.cam.dist = Math.max(90, T.floors[b] * 14); this.cam.pitch = 0.45; }
  // a click: the nearest building box along the ray
  pick(e) {
    if (!this.VP || !this.boxes) return;
    const r = this.canvas.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * 2 - 1, y = 1 - ((e.clientY - r.top) / r.height) * 2;
    const inv = M4.invert(this.VP), un = (z) => { const v = [x, y, z, 1], o = [0, 0, 0, 0]; for (let r = 0; r < 4; r++) o[r] = inv[r] * v[0] + inv[4 + r] * v[1] + inv[8 + r] * v[2] + inv[12 + r]; return [o[0] / o[3], o[1] / o[3], o[2] / o[3]]; };
    const p0 = un(-1), p1 = un(1), d = V3.norm(V3.sub(p1, p0));
    let best = -1, bt = 1e9; const B = this.boxes;
    for (let k = 0; k < this.bList.length; k++) {
      const o = k * 6; let t0 = 0, t1 = bt;
      for (let a = 0; a < 3; a++) { const inv1 = 1 / (d[a] || 1e-9), ta = (B[o + a] - p0[a]) * inv1, tb = (B[o + 3 + a] - p0[a]) * inv1; t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb)); }
      if (t0 <= t1 && t0 < bt) { bt = t0; best = this.bList[k]; }
    }
    this.selected = best; this.onPick?.(best >= 0 ? { building: best } : null);
  }
  setTime(minutes) { this.minutes = ((minutes % 1440) + 1440) % 1440; }
  resize(force = false) {
    const gl = this.gl, dpr = Math.min(2, window.devicePixelRatio || 1) * this.q.scale, w = Math.max(2, Math.round(this.canvas.clientWidth * dpr)), h = Math.max(2, Math.round(this.canvas.clientHeight * dpr));
    if (!force && w === this.W && h === this.H) return;
    this.W = w; this.H = h; this.canvas.width = w; this.canvas.height = h;
    if (this.hdr) freeTarget(gl, this.hdr);
    const fmt = this.half ? { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT } : { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
    this.hdr = target(gl, w, h, { color: [fmt], depth: true });
    gl.bindTexture(gl.TEXTURE_2D, this.hdr.tex[0]); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  }
  start() { if (this.running) return; this.running = true; const loop = (now) => { if (!this.running) return; try { this.frame(now); } catch (e) { this.running = false; if (e instanceof ContextLost || this.gl.isContextLost()) return; this.onError?.(e); return; } requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  stop() { this.running = false; }

  /* -------------------------------------------------------------- one frame */
  environment() {
    const d = dayInfo(Math.max(1, this.city.epoch)), S = sunAt(d.y, d.m, d.d, this.minutes, isDST(d.y, d.doy)), sun = S.dir;
    const sc = sunColor(sun[1]).map((x, k) => x * (0.6 + 0.4 * S.rgb[k]) * (0.85 + 0.15 * S.lum)), night = Math.max(0, Math.min(1, (0.08 - sun[1]) / 0.16));
    return { sun, trueSun: sun, sunCol: sc, lamp: LAMP, night, season: Math.max(0, Math.min(1, 1 - Math.abs(d.doy - 196) / 120)), d, tide: tideAt(this.city.epoch * 24 + this.minutes / 60) };
  }
  frame(now) {
    const gl = this.gl; if (!this.ready || !this.city || this.lost) return;
    this.resize(); this.perf.frameStart();
    const env = this.environment(), t = (now - this.t0) / 1000; this.wall = t;
    if (this.builtRev !== this.city.world.rev || (this.hasWorks && this.builtEpoch !== this.city.epoch)) { this.buildBuildings(); this.builtRev = this.city.world.rev; this.builtEpoch = this.city.epoch; }   // a building came down, went up, or its works moved on
    if (this.lightsMinute === undefined || Math.abs(this.minutes - this.lightsMinute) >= 10 || this.lightsEpoch !== this.city.epoch) { this.updateLights(); this.lightsMinute = this.minutes; this.lightsEpoch = this.city.epoch; }
    this.atmos.update(env, 40, 1.4);
    // the camera
    this.travel(Math.min(0.1, Math.max(0, (now - (this.lastFrame || now)) / 1000))); this.lastFrame = now;
    const eye = this.eye(), target0 = this.aim();
    const proj = M4.persp(0.95, this.W / this.H, Math.max(0.5, this.cam.dist / 400), Math.max(6000, this.cam.dist * 8, this.around ? WORLD * 4.5 : 0)), view = M4.lookAt(eye, target0, [0, 1, 0]);
    const VP = M4.mul(proj, view); this.VP = VP;
    // the sun's shadow: an orthographic box around the camera's target, as large as the view needs
    const sunDir = env.sun[1] > 0.02 ? env.sun : [0.3, 0.6, 0.2], span = Math.min(2600, Math.max(260, this.cam.dist * 1.6));
    const sEye = V3.add(target0, V3.scale(V3.norm(sunDir), 2200)), sView = M4.lookAt(sEye, target0, Math.abs(sunDir[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0]);
    const sProj = M4.ortho(-span, span, -span, span, 10, 5000), SVP = M4.mul(sProj, sView);
    // dynamic instances
    const cars = this.traffic(), people = this.people();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.carBuf); gl.bufferData(gl.ARRAY_BUFFER, cars, gl.STREAM_DRAW); this.carCount = cars.length / 8;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.personBuf); gl.bufferData(gl.ARRAY_BUFFER, people, gl.STREAM_DRAW); this.personCount = people.length / 8;
    // 1. shadows
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowT.fb); gl.viewport(0, 0, this.q.shadow, this.q.shadow); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.clear(gl.DEPTH_BUFFER_BIT); gl.colorMask(false, false, false, false);
    if (env.sun[1] > 0.02) {
      this.drawInst(this.P.shadowBuilding, this.bShadowVao, this.meshes.box, this.bCount, { u_VP: SVP }); this.drawInst(this.P.shadowBuilding, this.gShadowVao, this.meshes.gable, this.gCount, { u_VP: SVP });
      for (const g of this.treesNear()) this.drawInst(this.P.shadowTree, g.shadow, this.meshes.tree, g.count, { u_VP: SVP, u_time: t });
    }
    gl.colorMask(true, true, true, true);
    // 2. the scene, into the high dynamic range target
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.hdr.fb); gl.viewport(0, 0, this.W, this.H); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); this.drawSky(VP, env); gl.enable(gl.DEPTH_TEST);
    // (on the real map the haze thins as the camera rises, so the whole of it can be seen)
    const common = { u_VP: VP, u_eye: eye, u_sun: env.sun, u_sunCol: env.sunCol, u_amb: [0.05 + 0.25 * (1 - env.night), 0.06 + 0.27 * (1 - env.night), 0.08 + 0.3 * (1 - env.night)], u_night: env.night, u_time: t,
      u_fogCol: [0.5, 0.56, 0.62].map((x) => x * (1 - env.night * 0.95)), u_fogK: this.around ? Math.min(0.00028, 0.22 / Math.max(300, this.cam.dist)) : 0.00028, u_shadowVP: SVP, u_shadowTexel: 1 / this.q.shadow, u_keepLoops: 0, u_cell: CELL_M, u_season: env.season, u_matReady: this.matReady , u_lamp: env.lamp, u_tide: env.tide};
    this.use(this.P.ground, { ...common, u_origin: [0, 0], u_cells: N }); this.bindCommon(this.P.ground); this.tex(this.P.ground, "u_land", 4, this.landTex); gl.bindVertexArray(this.ground.va); gl.drawElements(gl.TRIANGLES, this.ground.count, gl.UNSIGNED_INT, 0);
    if (this.around) { this.use(this.P.ground, { ...common, u_origin: [N, N], u_cells: this.around.cells }); this.bindCommon(this.P.ground); this.tex(this.P.ground, "u_land", 4, this.around.tex); gl.bindVertexArray(this.around.va); gl.drawElements(gl.TRIANGLES, this.around.count, gl.UNSIGNED_INT, 0); }
    if (this.decks) { this.use(this.P.ground, { ...common, u_origin: [0, 0], u_cells: N }); this.bindCommon(this.P.ground); this.tex(this.P.ground, "u_land", 4, this.landTex); gl.bindVertexArray(this.decks.va); gl.drawElements(gl.TRIANGLES, this.decks.count, gl.UNSIGNED_INT, 0); }
    if (this.roads) { gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1.5, -1.5); this.use(this.P.road, common); this.bindCommon(this.P.road); gl.bindVertexArray(this.roads.va); gl.drawElements(gl.TRIANGLES, this.roads.count, gl.UNSIGNED_INT, 0); gl.disable(gl.POLYGON_OFFSET_FILL); }
    this.use(this.P.water, common); this.bindCommon(this.P.water); gl.bindVertexArray(this.water.va); gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    if (this.lakes) { gl.bindVertexArray(this.lakes.va); gl.drawElements(gl.TRIANGLES, this.lakes.count, gl.UNSIGNED_INT, 0); }
    for (const [va, mesh, n] of [[this.bVao, this.meshes.box, this.bCount], [this.gVao, this.meshes.gable, this.gCount]]) { this.use(this.P.building, common); this.bindCommon(this.P.building); this.tex(this.P.building, "u_lights", 5, this.lightsTex); if (this.P.building.u.u_signs) gl.uniform3fv(this.P.building.u.u_signs, SECTORS.flatMap((x) => x.sign).concat([1, 1, 1])); gl.bindVertexArray(va); gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0, n); }
    this.use(this.P.tree, common); this.bindCommon(this.P.tree); for (const g of this.treesNear()) { gl.bindVertexArray(g.va); gl.drawElementsInstanced(gl.TRIANGLES, this.meshes.tree.count, gl.UNSIGNED_SHORT, 0, g.count); }
    if (this.carCount) { this.use(this.P.vehicle, common); this.bindCommon(this.P.vehicle); this.tex(this.P.vehicle, "u_height", 6, this.heightTex); gl.bindVertexArray(this.carVao); gl.drawElementsInstanced(gl.TRIANGLES, this.meshes.car.count, gl.UNSIGNED_SHORT, 0, this.carCount); }
    if (this.personCount) { this.use(this.P.person, common); this.bindCommon(this.P.person); this.tex(this.P.person, "u_height", 6, this.heightTex); gl.bindVertexArray(this.personVao); gl.drawElementsInstanced(gl.TRIANGLES, this.meshes.person.count, gl.UNSIGNED_SHORT, 0, this.personCount); }
    // 3. the final image: bloom from the target's mipmaps, filmic tone mapping
    gl.bindTexture(gl.TEXTURE_2D, this.hdr.tex[0]); gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.W, this.H); gl.disable(gl.DEPTH_TEST);
    this.use(this.P.final, { u_exposure: 1.0 + env.night * 0.6, u_bloom: 0.35, u_keepLoops: 0 }); this.tex(this.P.final, "u_hdr", 0, this.hdr.tex[0]);
    gl.bindVertexArray(this.empty); gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (gl.isContextLost()) throw new ContextLost("drawing the city");
    this.perf.frameEnd(); this.frames = (this.frames || 0) + 1;
  }
  drawSky(VP, env) {
    const gl = this.gl, p = this.P.sky; gl.useProgram(p.p);
    gl.uniformMatrix4fv(p.u.u_invVP, false, M4.invert(VP)); gl.uniform3fv(p.u.u_sun, env.sun); gl.uniform3fv(p.u.u_sunCol, env.sunCol); gl.uniform1f(p.u.u_night, env.night);
    this.atmos.bind(p, 10); gl.bindVertexArray(this.empty); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  drawInst(p, va, mesh, n, uni) { const gl = this.gl; if (!n) return; this.use(p, uni); gl.bindVertexArray(va); gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0, n); }
  use(p, uni) {
    const gl = this.gl; gl.useProgram(p.p);
    for (const [k, v] of Object.entries(uni)) {
      const loc = p.u[k]; if (loc === undefined || loc === null) continue;
      if (typeof v === "number") { if (k === "u_keepLoops") gl.uniform1i(loc, v); else gl.uniform1f(loc, v); }
      else if (v.length === 16) gl.uniformMatrix4fv(loc, false, v); else if (v.length === 3) gl.uniform3fv(loc, v); else if (v.length === 4) gl.uniform4fv(loc, v); else if (v.length === 2) gl.uniform2fv(loc, v);
    }
  }
  tex(p, name, unit, t) { const gl = this.gl; if (p.u[name] === undefined) return; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(p.u[name], unit); }
  bindCommon(p) {
    const gl = this.gl, u = p.u;
    this.atmos.bind(p, 10);
    if (u.u_shadow !== undefined) { gl.activeTexture(gl.TEXTURE0 + 11); gl.bindTexture(gl.TEXTURE_2D, this.shadowT.depthTex); gl.uniform1i(u.u_shadow, 11); }
    if (u.u_matCol !== undefined) gl.uniform3fv(u.u_matCol, MAT_COL.flat());
    if (u.u_matTile !== undefined) gl.uniform4fv(u.u_matTile, MATERIALS.flatMap(([, , t]) => [t, 0, 0, 0]));
    if (this.matTexA && u.u_matA !== undefined) { gl.activeTexture(gl.TEXTURE0 + 12); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.matTexA); gl.uniform1i(u.u_matA, 12); gl.activeTexture(gl.TEXTURE0 + 13); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.matTexN); gl.uniform1i(u.u_matN, 13); }
    else if (u.u_matA !== undefined) { gl.activeTexture(gl.TEXTURE0 + 12); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.dummyArray()); gl.uniform1i(u.u_matA, 12); gl.activeTexture(gl.TEXTURE0 + 13); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.dummyArray()); gl.uniform1i(u.u_matN, 13); }
  }
  dummyArray() { if (this._dummy) return this._dummy; const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, t); gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 255, 180])); this._dummy = t; return t; }
  // the urban material library (shards/materials): albedo+height and normal+roughness for 24 materials, as two texture arrays
  async loadMaterials(base = "shards/materials/", size = 1024) {
    if (this.safe || this.matLoading) return; this.matLoading = true;
    const gl = this.gl, n = MATERIALS.length, lvls = Math.floor(Math.log2(size)) + 1;
    const mk = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, t); gl.texStorage3D(gl.TEXTURE_2D_ARRAY, lvls, gl.RGBA8, size, size, n); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT); const ani = gl.getExtension("EXT_texture_filter_anisotropic"); if (ani) gl.texParameterf(gl.TEXTURE_2D_ARRAY, ani.TEXTURE_MAX_ANISOTROPY_EXT, 8); return t; };
    const A = mk(), Nt = mk(); let done = 0;
    const cv = document.createElement("canvas"); cv.width = size; cv.height = size; const g2 = cv.getContext("2d", { willReadFrequently: true });
    for (let k = 0; k < n; k++) {
      for (const [suffix, tex] of [["ah", A], ["nr", Nt]]) {
        try {
          const r = await fetch(`${base}${String(k).padStart(2, "0")}_${MATERIALS[k][0]}_${suffix}.png`); if (!r.ok) throw new Error(r.status);
          const bmp = await createImageBitmap(await r.blob(), { resizeWidth: size, resizeHeight: size, premultiplyAlpha: "none", colorSpaceConversion: "none" });
          g2.clearRect(0, 0, size, size); g2.drawImage(bmp, 0, 0); const px = g2.getImageData(0, 0, size, size).data;
          if (this.lost) return; gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex); gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, k, size, size, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        } catch { this.status("the material library is not here: flat colours"); this.matLoading = false; return; }
      }
      done++; this.status(`materials ${done} of ${n}`);
    }
    for (const t of [A, Nt]) { gl.bindTexture(gl.TEXTURE_2D_ARRAY, t); gl.generateMipmap(gl.TEXTURE_2D_ARRAY); }
    this.matTexA = A; this.matTexN = Nt; this.matReady = 1; this.status("ready");
  }
  hud() { return `${this.W}x${this.H} · ${this.carCount || 0} vehicles · ${this.personCount || 0} people${this.safe ? " · safe graphics" : ""} · ${this.gpu.split(" (")[0]}`; }
  dispose() {
    this.stop(); const cv = this.canvas;
    cv.removeEventListener("webglcontextlost", this.lostHandler); cv.removeEventListener("dblclick", this.onDbl); cv.removeEventListener("keydown", this.onKey); cv.removeEventListener("keyup", this.onKey); cv.removeEventListener("blur", this.onBlur); globalThis.removeEventListener?.("blur", this.onBlur); cv.removeEventListener("pointerdown", this.onDown); cv.removeEventListener("pointermove", this.onMove); cv.removeEventListener("pointerup", this.onUp); cv.removeEventListener("pointercancel", this.onUp); cv.removeEventListener("wheel", this.onWheel); cv.removeEventListener("contextmenu", this.onCtx);
  }
}
