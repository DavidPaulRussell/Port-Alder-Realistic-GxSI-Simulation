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
import { CITY_PROGRAMS } from "./city3d_shaders.js";
import { N, CELL_M, MATERIALS, SECTORS, B as BK, L as LAND } from "./citydata.js";
import { E_F0, E_B0, E_CITY, E_SCHOOL, E_ROW } from "./books.js";
import { dayInfo, DAY0 } from "./rules.js";
import { along, sunAt, LAMP, tideAt } from "./motion.js";
// the look of things (where a tree stands in its cell, a car's colour, which way a walker steps) is read from what
// they are, along irrational rotations (law 12.42), not drawn
const weyl = (n, a = 0.6180339887498949) => (((n * a) % 1) + 1) % 1, look = (n) => Math.floor(weyl(n) * 4294967296) >>> 0;
import { homeCell } from "./people.js";

export const CITY3D_VERSION = "1.1.0";
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
    this.perf = new Perf(gl); this.cam = { tx: 30 * CELL_M, tz: 62 * CELL_M, yaw: -0.6, pitch: 0.55, dist: 900, mode: "orbit" };
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
    const hgt = new Float32Array(N * N); for (let c = 0; c < N * N; c++) hgt[c] = W.water[c] && !W.road[c] ? -2.5 : Math.max(0.3, W.height[c] / 1000);
    for (let c = 0; c < N * N; c++) if (W.road[c] === 3) hgt[c] = Math.max(hgt[c], 2.5);   // bridges
    this.hgt = hgt;
    this.heightTex = texture(gl, N, N, { internal: gl.R32F, format: gl.RED, type: gl.FLOAT, filter: gl.NEAREST, data: hgt });
    this.landTex = texture(gl, N, N, { filter: gl.NEAREST, data: this.landData() });
    this.lightsData = new Uint8Array(128 * 64 * 4); this.lightsTex = texture(gl, 128, 64, { filter: gl.NEAREST, data: this.lightsData });
    // the ground: a 257 x 257 grid, ten metres apart, heights smoothed from the cells
    const G = 2 * N + 1, P = new Float32Array(G * G * 3), Nm = new Float32Array(G * G * 3), I = new Uint32Array((G - 1) * (G - 1) * 6);
    const hAt = (x, z) => { const cx = Math.max(0, Math.min(N - 1, Math.floor(x / CELL_M - 0.5))), cz = Math.max(0, Math.min(N - 1, Math.floor(z / CELL_M - 0.5))), fx = Math.max(0, Math.min(1, x / CELL_M - 0.5 - cx)), fz = Math.max(0, Math.min(1, z / CELL_M - 0.5 - cz));
      const h = (i, j) => hgt[(Math.min(N - 1, j) << 7) | Math.min(N - 1, i)]; return (h(cx, cz) * (1 - fx) + h(cx + 1, cz) * fx) * (1 - fz) + (h(cx, cz + 1) * (1 - fx) + h(cx + 1, cz + 1) * fx) * fz; };
    this.groundAt = hAt;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const k = j * G + i, x = i * 10, z = j * 10; P[k * 3] = x; P[k * 3 + 1] = hAt(x, z); P[k * 3 + 2] = z; }
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const k = j * G + i, hl = P[(j * G + Math.max(0, i - 1)) * 3 + 1], hr = P[(j * G + Math.min(G - 1, i + 1)) * 3 + 1], hd = P[(Math.max(0, j - 1) * G + i) * 3 + 1], hu = P[(Math.min(G - 1, j + 1) * G + i) * 3 + 1]; const n = V3.norm([hl - hr, 20, hd - hu]); Nm.set(n, k * 3); }
    let o = 0; for (let j = 0; j < G - 1; j++) for (let i = 0; i < G - 1; i++) { const a = j * G + i; I[o++] = a; I[o++] = a + G; I[o++] = a + 1; I[o++] = a + 1; I[o++] = a + G; I[o++] = a + G + 1; }
    this.ground = { va: vao(gl, [[gl.getAttribLocation(this.P.ground.p, "a_pos"), buffer(gl, P), 3], [gl.getAttribLocation(this.P.ground.p, "a_nrm"), buffer(gl, Nm), 3]], buffer(gl, I, gl.ELEMENT_ARRAY_BUFFER)), count: I.length };
    const wq = new Float32Array([-2000, 0, -2000, WORLD + 2000, 0, -2000, WORLD + 2000, 0, WORLD + 2000, -2000, 0, WORLD + 2000]);
    this.water = { va: vao(gl, [[gl.getAttribLocation(this.P.water.p, "a_pos"), buffer(gl, wq), 3]], buffer(gl, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.ELEMENT_ARRAY_BUFFER)), count: 6 };
    this.buildBuildings(); this.buildTrees();
    this.carBuf = gl.createBuffer(); this.personBuf = gl.createBuffer();
    this.carVao = this.instVao(this.P.vehicle, this.meshes.car, this.carBuf, ["i_car", "i_col"]);
    this.carShadowVao = this.instVao(this.P.shadowVehicle, this.meshes.car, this.carBuf, ["i_car", "i_col"]);
    this.personVao = this.instVao(this.P.person, this.meshes.person, this.personBuf, ["i_p", "i_c"]);
    this.routes = new Map(); this.dayKey = -1;
  }
  landData() {
    const W = this.city.world, d = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const c = (y << 7) | x, r = W.road[c];
      let nb = 0; if (r) { if (x < N - 1 && W.road[c + 1]) nb |= 1; if (x > 0 && W.road[c - 1]) nb |= 2; if (y < N - 1 && W.road[c + N]) nb |= 4; if (y > 0 && W.road[c - N]) nb |= 8; }
      d[c * 4] = W.land[c]; d[c * 4 + 1] = r; d[c * 4 + 2] = Math.min(255, Math.round(W.cond[c] / 4)); d[c * 4 + 3] = nb;
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
      let base = 1e9; for (let y = T.y[b]; y < T.y[b] + T.h[b]; y++) for (let x = T.x[b]; x < T.x[b] + T.w[b]; x++) base = Math.min(base, this.hgt[(y << 7) | x]);
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
  buildTrees() {
    const gl = this.gl, W = this.city.world, s = this.city.cfg.seed, t = [];
    for (let c = 0; c < N * N; c++) {
      const k = W.tree[c]; if (!k) continue; const x = (c & 127) * CELL_M, z = (c >> 7) * CELL_M, n = k === 3 ? 4 : k === 4 ? 1 : k;
      for (let j = 0; j < n; j++) {
        const jx = weyl(c * 7 + j), jz = weyl(c * 7 + j, 0.41421356237309515), h = look(c * 7 + j);
        const px = k === 4 ? x + (jx < 0.5 ? 2.5 : CELL_M - 2.5) : x + 2 + jx * (CELL_M - 4), pz = k === 4 ? z + CELL_M / 2 : z + 2 + jz * (CELL_M - 4);
        t.push(px, pz, (k === 3 ? 14 : 8) + ((h >>> 20) % 80) / 10, k === 3 || (h & 7) === 0 ? 2 : 1);
      }
    }
    this.tCount = t.length / 4; this.tBuf = buffer(gl, new Float32Array(t));
    this.tVao = this.instVao(this.P.tree, this.meshes.tree, this.tBuf, ["i_tree"]); this.tShadowVao = this.instVao(this.P.shadowTree, this.meshes.tree, this.tBuf, ["i_tree"]);
  }

  /* -------------------------------------------------------------- the day's traffic and people */
  // shortest street paths to a destination cell: breadth-first parents over the road grid, kept per destination
  route(to) {
    let r = this.routes.get(to); if (r) return r;
    const W = this.city.world, par = new Int32Array(N * N).fill(-1), q = new Int32Array(N * N); let h = 0, t = 0;
    if (!W.road[to]) return null;
    par[to] = to; q[t++] = to;
    while (h < t) { const c = q[h++], x = c & 127, y = c >> 7; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue; const n = (ny << 7) | nx; if (!W.road[n] || par[n] >= 0) continue; par[n] = c; q[t++] = n; } }
    r = par; if (this.routes.size > 600) this.routes.clear(); this.routes.set(to, r); return r;
  }
  path(from, to) {
    const par = this.route(to); if (!par || par[from] < 0) return null;
    const out = [from]; let c = from; while (c !== to && out.length < 400) { c = par[c]; out.push(c); } return out;
  }
  planDay() {
    const c = this.city, P = c.people, W = c.world, e = c.epoch, s = c.cfg.seed;
    this.trips = []; this.walkers = []; this.dayKey = e;
    const exitCell = (y) => { for (let x = N - 1; x > 100; x--) if (W.road[(y << 7) | x] === 2) return (y << 7) | x; return -1; };
    const exits = [12, 36, 60, 84, 108].map(exitCell).filter((x) => x >= 0);
    for (const i of P.each()) {
      const h = P.hh[i]; if (h < 0) continue; const hc = homeCell(c, h); if (hc < 0) continue;
      const t = P.today[i], mode = P.mode[i];
      if (t & 1) {
        let wc = c.workCell(i); if (P.emp[i] === E_ROW) { const f = P.away[i] - 1, south = f >= 0 && c.outer?.F.place[f] >= 9; let best = exits[0]; for (const x of exits) if (south ? (x >> 7) > (best >> 7) : (x >> 7) < (best >> 7)) best = x; wc = best; }   // toward the outer workplace
        if (wc >= 0 && wc !== hc) {
          const start = P.shift[i], end = start + P.hours[i] * 60 + (P.hours[i] >= 8 ? 30 : 0);
          if (mode === 1) { this.trips.push({ from: hc, to: wc, at: start - 25, kind: 0, col: look(P.sin[i] * 3 + 1) }); this.trips.push({ from: wc, to: hc, at: end + 2, kind: 0, col: look(P.sin[i] * 3 + 1) }); }
          else this.walkers.push({ from: hc, to: mode === 2 ? W.stopNear[hc] : wc, at: start - (mode === 2 ? 30 : 22), back: end, speed: mode === 3 ? 3.5 : 1.3, i });
        }
      }
      if (t & 4 && P.school[i] >= 0) this.walkers.push({ from: hc, to: W.frontCell(P.school[i]), at: 470 + (i % 20), back: 905 + (i % 25), speed: 1.2, i, kid: true });
      for (let k = 0; k < 3; k++) { const f = P.visit[i * 3 + k]; if (f < 0) continue; const fc = c.firmCell(f - E_F0); if (fc >= 0) this.walkers.push({ stay: fc, at: P.vtime[i * 3 + k] - 10, back: P.vtime[i * 3 + k] + 25, i, speed: 0.6 }); }
    }
    // deliveries between the port and the highway; buses on their routes
    for (let k = 0; k < 120; k++) { const from = W.frontCell(W.sites[0]) >= 0 ? exits[k % exits.length] : -1, port = (100 << 7) | 30; if (from >= 0 && W.road[port]) this.trips.push({ from: k & 1 ? from : port, to: k & 1 ? port : from, at: 300 + (k * 7) % 1080, kind: 2, col: 0xd0d0d0 }); }
    for (const t of this.trips) { t.path = this.path(t.from, t.to); }
    for (const w of this.walkers) if (w.to !== undefined && w.to >= 0) w.path = this.path(w.from, w.to);
    this.trips = this.trips.filter((t) => t.path && t.path.length > 1);
  }
  traffic() {
    const c = this.city, m = this.minutes, out = [], buses = [];
    if (this.dayKey !== c.epoch) this.planDay();
    const pos = (path, f) => { const L = path.length - 1, x = f * L, k = Math.min(L - 1, Math.floor(x)), u = x - k, a = path[k], b = path[k + 1]; const ax = (a & 127) * CELL_M + 10, az = (a >> 7) * CELL_M + 10, bx = (b & 127) * CELL_M + 10, bz = (b >> 7) * CELL_M + 10; const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1; return [ax + dx * u + (dz / len) * 3, az + dz * u - (dx / len) * 3, Math.atan2(dx, dz)]; };
    for (const t of this.trips) {
      const dur = t.path.length * 1.7 / 60 * (t.kind === 2 ? 1.4 : 1); if (m < t.at || m > t.at + dur) continue;
      const [x, z, hd] = pos(t.path, t.kind === 2 ? (m - t.at) / dur : along((m - t.at) / dur)), col = t.col;   // pulling away and braking (motion.js)
      out.push(x, z, hd, t.kind === 2 ? 2 : (col & 7) === 0 ? 3 : 0, ((col >> 8) & 255) / 300 + 0.05, ((col >> 16) & 255) / 300 + 0.05, ((col >> 24) & 255) / 300 + 0.05, m > 1140 || m < 420 ? 0.4 : 0);
    }
    // buses: evenly spaced around each route, more often at the city's chosen frequency
    const W = c.world, freq = (c.gov.busFreq || 100) / 100;
    if (m > 330 && m < 1410) W.routes.forEach((r, ri) => { const L = r.cells.length, n = Math.max(1, Math.round(L / 40 * freq)); for (let k = 0; k < n; k++) { const f = ((m / 60 * 0.9 + k / n + ri * 0.13) % 1 + 1) % 1, path = r.cells; const [x, z, hd] = pos(path, f); const col = r.colour; out.push(x, z, hd, 1, col[0], col[1], col[2], 0); } });
    return new Float32Array(out);
  }
  people() {
    const m = this.minutes, out = [], s = this.city.cfg.seed;
    for (const w of this.walkers) {
      if (w.stay !== undefined) { if (m < w.at || m > w.back) continue; const cx = (w.stay & 127) * CELL_M, cz = (w.stay >> 7) * CELL_M, h = look(w.i * 131 + w.at); const jx = (h % 100) / 100, jz = ((h >> 8) % 100) / 100; out.push(cx + 2 + jx * 16, cz + 1 + jz * 3, (h % 628) / 100, h % 50, ((h >> 4) % 100) / 100, ((h >> 12) % 100) / 100, 0.92 + ((h >> 20) % 16) / 100, ((m - w.at) % 7 < 2) ? 0.8 : 0); continue; }
      if (!w.path || w.path.length < 2) continue;
      const dur = (w.path.length * CELL_M) / w.speed / 60; let f = -1, path = w.path;
      if (m >= w.at && m <= w.at + dur) f = (m - w.at) / dur; else if (m >= w.back && m <= w.back + dur) { f = 1 - (m - w.back) / dur; }
      if (f < 0) continue;
      const L = path.length - 1, x = f * L, k = Math.min(L - 1, Math.floor(x)), u = x - k, a = path[k], b = path[k + 1];
      const ax = (a & 127) * CELL_M + 10, az = (a >> 7) * CELL_M + 10, bx = (b & 127) * CELL_M + 10, bz = (b >> 7) * CELL_M + 10, dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
      const side = (w.i & 1 ? 1 : -1) * 7.6, h = look(w.i * 131 + 7), back = m >= w.back;
      out.push(ax + dx * u + (dz / len) * side, az + dz * u - (dx / len) * side, Math.atan2(back ? -dx : dx, back ? -dz : dz), h % 50, ((h >> 4) % 100) / 100, ((h >> 12) % 100) / 100 * 0 + (w.kid ? 0.66 : 0.95 + ((h >> 20) % 12) / 100), w.speed > 2 ? 2.2 : 1.0);
    }
    return new Float32Array(out);
  }
  // window lights for the hour: homes by how many residents are in, businesses while open, vacancies dark
  updateLights() {
    const c = this.city, W = c.world, T = W.buildings, D = W.dwellings, F = c.firms, m = this.minutes, d = this.lightsData; d.fill(0);
    const home = new Float32Array(T.top), units = new Float32Array(T.top);
    for (const dd of D.each()) { const b = D.bld[dd]; units[b]++; if (D.hh[dd] >= 0) home[b]++; }
    const dark = m > 30 && m < 330, eve = m > 1050 || m < 30, morn = m > 330 && m < 480;
    for (const b of T.each()) { if (b >= 8192) break; const frac = units[b] ? home[b] / units[b] : 0; d[b * 4] = Math.round(255 * frac * (dark ? 0.08 : eve ? 0.72 : morn ? 0.45 : 0.12)); d[b * 4 + 2] = T.units[b] && !home[b] ? 255 : 0; }
    for (const f of F.each()) {
      if (F.status[f] === 1) continue; const b = W.spaces.bld[F.space[f]], S = SECTORS[F.sector[f]];
      const open = m >= S.open && m < Math.min(S.close, 1440) || (S.close > 1440 && m < S.close - 1440);
      d[b * 4 + 1] = Math.max(d[b * 4 + 1], open ? 230 : 18); d[b * 4 + 3] = F.sector[f] + 1;
    }
    for (const b of [...T.each()].filter((x) => T.civic[x] || T.kind[x] === BK.school || T.kind[x] === BK.hospital)) d[b * 4 + 1] = (m > 450 && m < 1080) || T.kind[b] === BK.hospital ? 200 : 20;
    const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.lightsTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 128, 64, gl.RGBA, gl.UNSIGNED_BYTE, d);
    // scaffolding where a floor is going up
    for (let k = 0; k < this.bList.length; k++) this.bInst[k * 16 + 15] = T.started[this.bList[k]] ? 1 : 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.bInst);
  }

  /* -------------------------------------------------------------- the camera and input */
  inputs() {
    const cv = this.canvas; let drag = null;
    this.onDown = (e) => { drag = { x: e.clientX, y: e.clientY, b: e.button, yaw: this.cam.yaw, pitch: this.cam.pitch, tx: this.cam.tx, tz: this.cam.tz, moved: false }; cv.setPointerCapture?.(e.pointerId); };
    this.onMove = (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.b === 2 || e.shiftKey) { const s = this.cam.dist / 900, c = Math.cos(this.cam.yaw), sn = Math.sin(this.cam.yaw); this.cam.tx = drag.tx - (dx * c - dy * sn) * s; this.cam.tz = drag.tz - (dx * sn + dy * c) * s; }
      else { this.cam.yaw = drag.yaw + dx * 0.005; this.cam.pitch = Math.max(0.05, Math.min(1.45, drag.pitch + dy * 0.004)); } this.cam.mode = "orbit"; };
    this.onUp = (e) => { if (drag && !drag.moved && drag.b === 0) this.pick(e); drag = null; };
    this.onWheel = (e) => { e.preventDefault(); this.cam.dist = Math.max(25, Math.min(4200, this.cam.dist * Math.exp(e.deltaY * 0.0012))); };
    this.onCtx = (e) => e.preventDefault();
    cv.addEventListener("pointerdown", this.onDown); cv.addEventListener("pointermove", this.onMove); cv.addEventListener("pointerup", this.onUp); cv.addEventListener("wheel", this.onWheel, { passive: false }); cv.addEventListener("contextmenu", this.onCtx);
  }
  eye() { const c = this.cam, cp = Math.cos(c.pitch); const ty = this.groundAt ? this.groundAt(c.tx, c.tz) : 0; return [c.tx + Math.sin(c.yaw) * cp * c.dist, ty + Math.sin(c.pitch) * c.dist + 2, c.tz + Math.cos(c.yaw) * cp * c.dist]; }
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
    const env = this.environment(), t = (now - this.t0) / 1000;
    if (this.builtRev !== this.city.world.rev || (this.hasWorks && this.builtEpoch !== this.city.epoch)) { this.buildBuildings(); this.builtRev = this.city.world.rev; this.builtEpoch = this.city.epoch; }   // a building came down, went up, or its works moved on
    if (this.lightsMinute === undefined || Math.abs(this.minutes - this.lightsMinute) >= 10 || this.lightsEpoch !== this.city.epoch) { this.updateLights(); this.lightsMinute = this.minutes; this.lightsEpoch = this.city.epoch; }
    this.atmos.update(env, 40, 1.4);
    // the camera
    const eye = this.eye(), target0 = [this.cam.tx, this.groundAt(this.cam.tx, this.cam.tz), this.cam.tz];
    const proj = M4.persp(0.95, this.W / this.H, Math.max(0.5, this.cam.dist / 400), Math.max(6000, this.cam.dist * 8)), view = M4.lookAt(eye, target0, [0, 1, 0]);
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
      this.drawInst(this.P.shadowTree, this.tShadowVao, this.meshes.tree, this.tCount, { u_VP: SVP, u_time: t });
    }
    gl.colorMask(true, true, true, true);
    // 2. the scene, into the high dynamic range target
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.hdr.fb); gl.viewport(0, 0, this.W, this.H); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); this.drawSky(VP, env); gl.enable(gl.DEPTH_TEST);
    const common = { u_VP: VP, u_eye: eye, u_sun: env.sun, u_sunCol: env.sunCol, u_amb: [0.05 + 0.25 * (1 - env.night), 0.06 + 0.27 * (1 - env.night), 0.08 + 0.3 * (1 - env.night)], u_night: env.night, u_time: t,
      u_fogCol: [0.5, 0.56, 0.62].map((x) => x * (1 - env.night * 0.95)), u_fogK: 0.00028, u_shadowVP: SVP, u_shadowTexel: 1 / this.q.shadow, u_keepLoops: 0, u_cell: CELL_M, u_season: env.season, u_matReady: this.matReady , u_lamp: env.lamp, u_tide: env.tide};
    this.use(this.P.ground, common); this.bindCommon(this.P.ground); this.tex(this.P.ground, "u_land", 4, this.landTex); gl.bindVertexArray(this.ground.va); gl.drawElements(gl.TRIANGLES, this.ground.count, gl.UNSIGNED_INT, 0);
    this.use(this.P.water, common); this.bindCommon(this.P.water); gl.bindVertexArray(this.water.va); gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    for (const [va, mesh, n] of [[this.bVao, this.meshes.box, this.bCount], [this.gVao, this.meshes.gable, this.gCount]]) { this.use(this.P.building, common); this.bindCommon(this.P.building); this.tex(this.P.building, "u_lights", 5, this.lightsTex); if (this.P.building.u.u_signs) gl.uniform3fv(this.P.building.u.u_signs, SECTORS.flatMap((x) => x.sign).concat([1, 1, 1])); gl.bindVertexArray(va); gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0, n); }
    this.use(this.P.tree, common); this.bindCommon(this.P.tree); gl.bindVertexArray(this.tVao); gl.drawElementsInstanced(gl.TRIANGLES, this.meshes.tree.count, gl.UNSIGNED_SHORT, 0, this.tCount);
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
    cv.removeEventListener("webglcontextlost", this.lostHandler); cv.removeEventListener("pointerdown", this.onDown); cv.removeEventListener("pointermove", this.onMove); cv.removeEventListener("pointerup", this.onUp); cv.removeEventListener("wheel", this.onWheel); cv.removeEventListener("contextmenu", this.onCtx);
  }
}
