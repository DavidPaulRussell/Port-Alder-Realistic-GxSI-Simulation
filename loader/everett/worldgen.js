/* =====================================================================
   PXM world generator — deterministic terrain, coast, river, roads, lots
   and trees for the Everett diorama. Pure JS, no DOM. Runs in the
   console and in Node (the cartridge build uses it for the site survey).
   Canonical layout: sea on the left (−x), Cascades back-right (−z, +x).
   ===================================================================== */
(function (root) {
  'use strict';

  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  function smoothstep(e0, e1, x) {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function makeNoise(seed) {
    const r = mulberry32(seed);
    const base = new Uint8Array(256);
    for (let i = 0; i < 256; i++) base[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = base[i]; base[i] = base[j]; base[j] = t; }
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
    const gx = [1, -1, 1, -1, 1, -1, 0, 0], gy = [1, 1, -1, -1, 0, 0, 1, -1];
    function grad(h, x, y) { h &= 7; return gx[h] * x + gy[h] * y; }
    function noise(x, y) {
      const X = Math.floor(x), Y = Math.floor(y);
      const xf = x - X, yf = y - Y, xi = X & 255, yi = Y & 255;
      const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
      const aa = perm[perm[xi] + yi], ab = perm[perm[xi] + yi + 1], ba = perm[perm[xi + 1] + yi], bb = perm[perm[xi + 1] + yi + 1];
      const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
      const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
      return lerp(x1, x2, v);
    }
    function fbm(x, y, oct) { let a = 1, f = 1, s = 0, n = 0; for (let i = 0; i < (oct || 4); i++) { s += a * noise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
    function ridged(x, y, oct) { let a = 1, f = 1, s = 0, n = 0; for (let i = 0; i < (oct || 4); i++) { let v = 1 - Math.abs(noise(x * f, y * f)); v *= v; s += a * v; n += a; a *= 0.5; f *= 2.1; } return s / n; }
    return { noise, fbm, ridged };
  }

  function catmull(pts, per) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < per; k++) {
        const t = k / per, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    out.push(pts[pts.length - 1].slice());
    return out;
  }

  function polyLength(p) { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; }

  // distance from (x,z) to polyline; returns [dist, t(0..1 along), segIndex]
  function distPoly(x, z, p, cum) {
    let best = 1e9, bt = 0, bi = 0;
    for (let i = 0; i < p.length - 1; i++) {
      const ax = p[i][0], az = p[i][1], bx = p[i + 1][0], bz = p[i + 1][1];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
      let t = ((x - ax) * dx + (z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(x - qx, z - qz);
      if (d < best) { best = d; bi = i; bt = cum ? (cum[i] + (cum[i + 1] - cum[i]) * t) / cum[cum.length - 1] : (i + t) / (p.length - 1); }
    }
    return [best, bt, bi];
  }
  function cumLen(p) { const c = [0]; for (let i = 1; i < p.length; i++) c.push(c[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return c; }
  function resample(p, step) {
    const c = cumLen(p), L = c[c.length - 1], n = Math.max(2, Math.ceil(L / step)), out = [];
    let seg = 0;
    for (let k = 0; k <= n; k++) {
      const d = (k / n) * L;
      while (seg < p.length - 2 && c[seg + 1] < d) seg++;
      const t = (d - c[seg]) / Math.max(1e-9, c[seg + 1] - c[seg]);
      out.push([lerp(p[seg][0], p[seg + 1][0], t), lerp(p[seg][1], p[seg + 1][1], t)]);
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  function generateWorld(opt) {
    opt = opt || {};
    const seed = (opt.seed | 0) || 1893;
    const N = clamp(opt.size | 0 || 96, 64, 128);
    const S = N, half = S / 2, V = N + 1;
    const rnd = mulberry32(seed ^ 0xA5A5A5);
    const R = { range: (a, b) => a + (b - a) * rnd(), chance: (p) => rnd() < p };
    const nz = makeNoise(seed * 31 + 7), nz2 = makeNoise(seed * 131 + 17), nz3 = makeNoise(seed * 911 + 3);
    const toX = (u) => u * S - half, toZ = (v) => v * S - half, toU = (x) => (x + half) / S, toV = (z) => (z + half) / S;

    /* ---------- layout ---------- */
    const L = {};
    L.coast0 = 0.30 + R.range(-0.012, 0.012);
    const portCalm = (v) => 1 - smoothstep(0.0, 0.05, Math.min(Math.abs(v - 0.535) - 0.13, 1)) * 0;
    const PORTV = [0.40, 0.67];
    function calm(v) { const d = Math.max(PORTV[0] - v, 0, v - PORTV[1]); return smoothstep(0.0, 0.05, d); }
    const coastU = (v) => L.coast0 + 0.045 * nz.fbm(v * 2.2 + 3.1, 0.37, 3) + 0.018 * nz2.noise(v * 8.3 + 1.1, 2.7) * calm(v);
    void portCalm;
    L.dtV = 0.50 + R.range(-0.015, 0.015);
    const DT = { u: coastU(L.dtV) + 0.215, v: L.dtV, r: 0.128 };
    const AIR = { u0: 0.60, u1: 0.93, v0: 0.73, v1: 0.87 };
    const IND = { u0: 0.54, u1: 0.70, v0: 0.655, v1: 0.725 };
    const SPC = { u0: 0.62, u1: 0.95, v0: 0.865, v1: 0.985 };
    const PORT_W = 0.075;
    function rectMask(u, v, Rr, soft) { const dx = Math.max(Rr.u0 - u, 0, u - Rr.u1), dz = Math.max(Rr.v0 - v, 0, v - Rr.v1); return 1 - smoothstep(0, soft, Math.hypot(dx, dz)); }
    function portMask(u, v) { const cu = coastU(v); return rectMask(u, v, { u0: cu - 0.03, u1: cu + PORT_W, v0: PORTV[0], v1: PORTV[1] }, 0.03); }
    function dtMask(u, v) { return 1 - smoothstep(DT.r * 0.95, DT.r * 1.45, Math.hypot(u - DT.u, v - DT.v)); }

    function landField(u, v) {
      const cu = coastU(v);
      let c = u - cu;
      const sv = 0.94 + 0.30 * (u - 0.42) + 0.018 * nz.noise(u * 5.3 + 2, 9.1);
      c = Math.min(c, (sv - v) * 0.9);
      if (opt.island !== false) {
        const du = (u - 0.12) / 0.085, dv = (v - 0.15) / 0.06, d = Math.hypot(du, dv);
        c = Math.max(c, (1 - d) * 0.045 + 0.01 * nz2.noise(u * 13 + 5, v * 13 + 1));
      }
      c += 0.010 * nz3.fbm(u * 7.3, v * 7.3, 3) * (1 - portMask(u, v));
      return c;
    }
    function baseH(u, v) {
      const c = landField(u, v);
      if (c <= 0) return Math.max(-3.0, c * 26) - 0.06;
      const inland = smoothstep(0, 0.12, c);
      const hills = (0.5 + 0.5 * nz.fbm(u * 3.1 + 11, v * 3.1 - 7, 4)) * 1.5 * inland;
      const rise = smoothstep(0.38, 1.0, u) * 1.2 * inland;
      const h = 0.10 + c * 2.0 + hills + rise;
      return lerp(0.04 + c * 3.0, h, smoothstep(0.0, 0.035, c));
    }
    const peaks = [];
    for (let i = 0; i < 4; i++) {
      let pu, pv, tries = 0;
      do { pu = R.range(0.64, 0.95); pv = R.range(0.05, 0.36); tries++; } while (tries < 30 && peaks.some((p) => Math.hypot(p.u - pu, p.v - pv) < 0.13));
      peaks.push({ u: pu, v: pv, r: R.range(0.09, 0.13), h: R.range(10.5, 14.5) });
    }
    function mountainH(u, v) {
      if (opt.mountains === false) return 0;
      const m = smoothstep(0.52, 0.86, u) * smoothstep(0.62, 0.20, v);
      let h = 0;
      if (m > 0) { const r = nz2.ridged(u * 4.2 + 5, v * 4.2 + 9, 4); h = m * m * (1.5 + 8 * r * r); }
      for (const p of peaks) {
        const d = Math.hypot(u - p.u, v - p.v) / p.r;
        if (d < 1) { const r2 = nz3.ridged(u * 9 + p.u * 10, v * 9, 3); h = Math.max(h, p.h * Math.pow(1 - d, 1.3) * (0.82 + 0.18 * r2)); }
      }
      return h;
    }

    /* ---------- river ---------- */
    const rv0 = 0.27 + R.range(-0.015, 0.015);
    const rctrl = [[0.75, 0.355], [0.67, 0.315], [0.585, rv0 - 0.005], [0.50, rv0 + 0.012], [0.42, rv0 + 0.02], [coastU(rv0 + 0.02) - 0.035, rv0 + 0.02]];
    for (let i = 1; i < rctrl.length - 1; i++) { rctrl[i][1] += R.range(-0.012, 0.012); }
    const riverUV = catmull(rctrl, 10);
    const river = riverUV.map((p) => [toX(p[0]), toZ(p[1])]);
    const riverCum = cumLen(river);

    /* ---------- heights ---------- */
    const H = new Float32Array(V * V), M = new Float32Array(V * V), zoneK = new Uint8Array(V * V);
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        const x = -half + i, z = -half + j, u = toU(x), v = toV(z), id = j * V + i;
        let h = baseH(u, v), m = mountainH(u, v);
        const md = dtMask(u, v), mp = portMask(u, v), ma = rectMask(u, v, AIR, 0.03), mi = rectMask(u, v, IND, 0.03), ms = rectMask(u, v, SPC, 0.03);
        const city = Math.max(md, mp, ma, mi, ms);
        if (h > 0) {
          h = lerp(h, 0.62, md);
          h = lerp(h, 0.20, mp * (1 - md));
          h = lerp(h, 0.42, ma);
          h = lerp(h, 0.40, mi * (1 - ma));
          h = lerp(h, 0.44, ms * (1 - ma));
        }
        m *= 1 - smoothstep(0.0, 0.6, city);
        const [dr, tr] = distPoly(x, z, river, riverCum);
        const hw = lerp(0.6, 1.5, tr);
        const carve = 1 - smoothstep(hw * 0.55, hw * 1.5, dr);
        const valley = 1 - smoothstep(hw * 2.0, hw * 7.0, dr);
        if (h > 0) h = lerp(h, Math.min(h, 0.35), valley * 0.85);
        m *= 1 - valley;
        if (opt.river !== false) h = lerp(h, -0.35, carve);
        H[id] = h; M[id] = m;
        zoneK[id] = md > 0.5 ? 1 : mp > 0.5 && h > 0 ? 3 : ma > 0.5 ? 5 : mi > 0.5 ? 4 : 0;
      }
    }
    const idx = (i, j) => clamp(j, 0, N) * V + clamp(i, 0, N);
    const total = (id) => H[id] + M[id];
    function heightAt(x, z, useM) {
      const fx0 = clamp(x + half, 0, N - 1e-4), fz0 = clamp(z + half, 0, N - 1e-4);
      const i = Math.floor(fx0), j = Math.floor(fz0), fx = fx0 - i, fz = fz0 - j;
      const g = (a, b) => { const id = idx(a, b); return H[id] + (useM === false ? 0 : M[id]); };
      const a = g(i, j), b = g(i + 1, j), c = g(i, j + 1), d = g(i + 1, j + 1);
      if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
      return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
    }

    /* ---------- roads ---------- */
    const roads = [];
    const dtX = toX(DT.u), dtZ = toZ(DT.v), dtR = DT.r * S;
    const BLK = 5.0;
    for (let k = -4; k <= 4; k++) {
      const o = k * BLK, hl = Math.sqrt(Math.max(0, (dtR * 1.04) ** 2 - o * o));
      if (hl < 2.2) continue;
      roads.push({ pts: [[dtX + o, dtZ - hl], [dtX + o, dtZ + hl]], w: k === 0 ? 1.25 : 0.95, style: k === 0 ? 1 : 0, group: 'downtown', order: Math.abs(k) / 4 });
      roads.push({ pts: [[dtX - hl, dtZ + o], [dtX + hl, dtZ + o]], w: k === 0 ? 1.25 : 0.95, style: k === 0 ? 1 : 0, group: 'downtown', order: Math.abs(k) / 4 + 0.05 });
    }
    const hwyUV = [[0.64, -0.02], [0.645, 0.14], [0.665, 0.29], [0.685, 0.42], [0.69, 0.55], [0.72, 0.645], [0.85, 0.685], [1.03, 0.70]];
    roads.push({ pts: catmull(hwyUV.map((p) => [toX(p[0]), toZ(p[1])]), 8), w: 1.6, style: 2, group: 'highway', order: 0 });
    const wf = [];
    for (let v = 0.33; v <= 0.865; v += 0.01) wf.push([toX(coastU(v) + 0.087), toZ(v)]);
    roads.push({ pts: wf, w: 1.05, style: 1, group: 'waterfront', order: 0 });
    roads.push({ pts: catmull([[dtX + 2, dtZ + dtR * 0.98], [toX(0.60), toZ(0.70)], [toX(0.64), toZ(0.745)]], 8), w: 1.0, style: 0, group: 'air', order: 0 });
    // runway + taxiway
    const rwA = [toX(0.635), toZ(0.815)], rwB = [toX(0.915), toZ(0.785)];
    roads.push({ pts: [rwA, rwB], w: 2.3, style: 4, group: 'runway', order: 0 });
    const tvx = (rwB[0] - rwA[0]), tvz = (rwB[1] - rwA[1]), tl = Math.hypot(tvx, tvz), nxr = -tvz / tl, nzr = tvx / tl;
    const twOff = -2.9;
    const twA = [rwA[0] + nxr * twOff + tvx / tl * 2, rwA[1] + nzr * twOff + tvz / tl * 2], twB = [rwB[0] + nxr * twOff - tvx / tl * 2, rwB[1] + nzr * twOff - tvz / tl * 2];
    roads.push({ pts: [twA, twB], w: 1.0, style: 5, group: 'runway', order: 0.3 });
    roads.push({ pts: [twA, [rwA[0] + tvx / tl * 2, rwA[1] + tvz / tl * 2]], w: 0.9, style: 5, group: 'runway', order: 0.5 });
    roads.push({ pts: [twB, [rwB[0] - tvx / tl * 2, rwB[1] - tvz / tl * 2]], w: 0.9, style: 5, group: 'runway', order: 0.5 });

    // occupancy grid (0.5 units)
    const OG = N * 4, occ = new Uint8Array(OG * OG);
    const ogi = (x, z) => { const a = Math.floor((x + half) * 4), b = Math.floor((z + half) * 4); return a < 0 || b < 0 || a >= OG || b >= OG ? -1 : b * OG + a; };
    function stampDisk(x, z, r, val) { for (let dz = -r; dz <= r; dz += 0.25) for (let dx = -r; dx <= r; dx += 0.25) { if (dx * dx + dz * dz > r * r + 0.01) continue; const k = ogi(x + dx, z + dz); if (k >= 0) occ[k] = Math.max(occ[k], val); } }
    function stampRect(cx, cz, w, d, yaw, val) {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      for (let a = -w / 2; a <= w / 2 + 1e-6; a += 0.2) for (let b = -d / 2; b <= d / 2 + 1e-6; b += 0.2) {
        const k = ogi(cx + a * c - b * s, cz + a * s + b * c); if (k >= 0) occ[k] = Math.max(occ[k], val);
      }
    }
    function rectFree(cx, cz, w, d, yaw) {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      for (let a = -w / 2; a <= w / 2 + 1e-6; a += 0.2) for (let b = -d / 2; b <= d / 2 + 1e-6; b += 0.2) {
        const k = ogi(cx + a * c - b * s, cz + a * s + b * c); if (k < 0 || occ[k]) return false;
      }
      return true;
    }

    // residential streets: grid lines aligned with downtown, keep valid runs
    const RP = 5.6;
    function slopeAt(x, z) { const e = 0.6; return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e); }
    function resOk(x, z) {
      if (Math.abs(x) > half - 2 || Math.abs(z) > half - 2) return false;
      const u = toU(x), v = toV(z), h = heightAt(x, z);
      if (h < 0.16 || h > 4.0) return false;
      if (slopeAt(x, z) > 0.5) return false;
      const dd = Math.hypot(x - dtX, z - dtZ);
      if (dd < dtR * 1.1 || dd > S * 0.46) return false;
      if (portMask(u, v) > 0.15 || rectMask(u, v, AIR, 0.03) > 0.15 || rectMask(u, v, IND, 0.03) > 0.15 || rectMask(u, v, SPC, 0.03) > 0.15) return false;
      if (distPoly(x, z, river)[0] < 2.6) return false;
      if (mountainH(u, v) > 0.8) return false;
      return true;
    }
    for (let axis = 0; axis < 2; axis++) {
      for (let k = -12; k <= 12; k++) {
        const o = k * RP;
        let run = [];
        const flush = () => { if (run.length * 0.5 >= 5.5) { roads.push({ pts: [run[0], run[run.length - 1]], w: 0.85, style: 0, group: 'res', order: 0 }); } run = []; };
        for (let t = -half + 2; t <= half - 2; t += 0.5) {
          const x = axis === 0 ? dtX + o : t, z = axis === 0 ? t : dtZ + o;
          if (resOk(x, z)) run.push([x, z]); else flush();
        }
        flush();
      }
    }
    for (const r of roads) {
      r.pts = resample(r.pts, 0.5);
      r.len = polyLength(r.pts);
      const mx = r.pts.reduce((a, p) => a + p[0], 0) / r.pts.length, mz = r.pts.reduce((a, p) => a + p[1], 0) / r.pts.length;
      if (r.group === 'res') r.order = clamp(Math.hypot(mx - dtX, mz - dtZ) / (S * 0.43), 0, 1);
    }

    // corridor flattening + bridges
    const bridges = [];
    for (const r of roads) {
      if (r.group === 'downtown' || r.group === 'runway') { r.y = r.pts.map((p) => heightAt(p[0], p[1]) + 0.035); continue; }
      const raw = r.pts.map((p) => heightAt(p[0], p[1]));
      const prof = raw.map((_, i) => { let s = 0, n = 0; for (let k = -4; k <= 4; k++) { const q = raw[clamp(i + k, 0, raw.length - 1)]; s += q; n++; } return s / n; });
      const wet = raw.map((h) => h < 0.08);
      r.y = prof.map((h, i) => (wet[i] ? Math.max(h, 0.5) : Math.max(h, 0.12)) + 0.035);
      // flatten terrain under dry parts
      const rad = r.w / 2 + 1.1;
      for (let pi = 0; pi < r.pts.length; pi += 1) {
        if (wet[pi]) continue;
        const [px, pz] = r.pts[pi];
        for (let j = Math.floor(pz + half - rad); j <= Math.ceil(pz + half + rad); j++) for (let i = Math.floor(px + half - rad); i <= Math.ceil(px + half + rad); i++) {
          if (i < 0 || j < 0 || i > N || j > N) continue;
          const vx = -half + i, vz = -half + j, d = Math.hypot(vx - px, vz - pz);
          if (d > rad) continue;
          const id = j * V + i;
          if (H[id] < 0.05) continue;
          const t = 1 - smoothstep(r.w / 2 + 0.3, rad, d);
          M[id] *= 1 - t;
          H[id] = lerp(H[id], r.y[pi] - 0.05, t);
        }
      }
      // bridge spans
      let s0 = -1;
      for (let i = 0; i <= wet.length; i++) {
        if (i < wet.length && wet[i]) { if (s0 < 0) s0 = i; } else if (s0 >= 0) {
          if (i - s0 >= 2) bridges.push({ road: r, a: Math.max(0, s0 - 1), b: Math.min(wet.length - 1, i) });
          s0 = -1;
        }
      }
    }
    for (const r of roads) for (let i = 0; i < r.pts.length; i += 1) stampDisk(r.pts[i][0], r.pts[i][1], r.w / 2 + 0.25, 1);

    /* ---------- final per-vertex data ---------- */
    const F = new Float32Array(V * V);
    for (let k = 0; k < V * V; k++) F[k] = total(k);
    // coast distance (chamfer): + land, − water, in units
    const BIG = 1e6, dist = new Float32Array(V * V).fill(BIG);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const id = j * V + i, l = F[id] > 0;
      for (const [di, dj] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a > N || b > N) continue;
        if ((F[b * V + a] > 0) !== l) { dist[id] = 0.5; break; }
      }
    }
    const D1 = 1, D2 = Math.SQRT2;
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
        const id = j * V + i; let d = dist[id];
        if (i > 0) d = Math.min(d, dist[id - 1] + D1);
        if (j > 0) { d = Math.min(d, dist[id - V] + D1); if (i > 0) d = Math.min(d, dist[id - V - 1] + D2); if (i < N) d = Math.min(d, dist[id - V + 1] + D2); }
        dist[id] = d;
      }
      for (let j = N; j >= 0; j--) for (let i = N; i >= 0; i--) {
        const id = j * V + i; let d = dist[id];
        if (i < N) d = Math.min(d, dist[id + 1] + D1);
        if (j < N) { d = Math.min(d, dist[id + V] + D1); if (i < N) d = Math.min(d, dist[id + V + 1] + D2); if (i > 0) d = Math.min(d, dist[id + V - 1] + D2); }
        dist[id] = d;
      }
    }
    let maxIn = 1, maxOut = 1;
    for (let k = 0; k < V * V; k++) { if (F[k] > 0) maxIn = Math.max(maxIn, dist[k]); else maxOut = Math.max(maxOut, dist[k]); }
    const coastDist = new Float32Array(V * V);
    for (let k = 0; k < V * V; k++) coastDist[k] = F[k] > 0 ? dist[k] : -dist[k];

    // colours
    const col = new Float32Array(V * V * 3);
    const C = {
      bed: [0.55, 0.50, 0.38], sand: [0.93, 0.83, 0.60], grassA: [0.55, 0.74, 0.32], grassB: [0.37, 0.59, 0.25],
      forest: [0.29, 0.49, 0.23], rock: [0.57, 0.54, 0.51], rockD: [0.45, 0.43, 0.42], snow: [0.95, 0.96, 0.985],
      concrete: [0.58, 0.62, 0.55], yard: [0.56, 0.57, 0.55], airgrass: [0.56, 0.71, 0.36], ind: [0.62, 0.61, 0.57],
    };
    const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const id = j * V + i, h = F[id], x = -half + i, z = -half + j, u = toU(x), v = toV(z);
      let c;
      if (h <= 0) c = C.bed;
      else {
        const n = 0.5 + 0.5 * nz3.fbm(x * 0.21, z * 0.21, 3);
        c = mix3(C.grassA, C.grassB, n);
        c = mix3(c, C.forest, smoothstep(1.5, 4.5, h) * 0.8);
        const sl = Math.hypot(F[idx(i + 1, j)] - F[idx(i - 1, j)], F[idx(i, j + 1)] - F[idx(i, j - 1)]) / 2;
        c = mix3(c, mix3(C.rock, C.rockD, n), Math.max(smoothstep(0.9, 1.6, sl), smoothstep(5.0, 7.0, h)));
        const snowLine = 7.4 + 1.6 * nz2.noise(x * 0.17, z * 0.17);
        c = mix3(c, C.snow, smoothstep(snowLine, snowLine + 0.6, h));
        if (coastDist[id] < 1.6 && h < 0.34) c = mix3(c, C.sand, 1 - smoothstep(0.8, 1.6, coastDist[id]));
        const md = dtMask(u, v), mp = portMask(u, v), ma = Math.max(rectMask(u, v, AIR, 0.025), rectMask(u, v, SPC, 0.025)), mi = rectMask(u, v, IND, 0.025);
        c = mix3(c, C.concrete, smoothstep(0.35, 0.9, md));
        c = mix3(c, C.yard, smoothstep(0.4, 0.9, mp) * (h > 0.05 ? 1 : 0));
        c = mix3(c, C.airgrass, smoothstep(0.4, 0.9, ma));
        c = mix3(c, C.ind, smoothstep(0.4, 0.9, mi) * (1 - ma));
      }
      col[id * 3] = c[0]; col[id * 3 + 1] = c[1]; col[id * 3 + 2] = c[2];
    }

    /* ---------- coastline contours (marching squares on F at 0) ---------- */
    const segs = [];
    const P = (i, j) => F[j * V + i];
    const interp = (x1, z1, h1, x2, z2, h2) => { const t = h1 / (h1 - h2); return [x1 + (x2 - x1) * t, z1 + (z2 - z1) * t]; };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      const x0 = -half + i, z0 = -half + j;
      const pts = [];
      if ((a > 0) !== (b > 0)) pts.push(interp(x0, z0, a, x0 + 1, z0, b));
      if ((b > 0) !== (c > 0)) pts.push(interp(x0 + 1, z0, b, x0 + 1, z0 + 1, c));
      if ((c > 0) !== (d > 0)) pts.push(interp(x0 + 1, z0 + 1, c, x0, z0 + 1, d));
      if ((d > 0) !== (a > 0)) pts.push(interp(x0, z0 + 1, d, x0, z0, a));
      if (pts.length === 2) segs.push(pts);
      else if (pts.length === 4) { segs.push([pts[0], pts[1]]); segs.push([pts[2], pts[3]]); }
    }
    const key = (p) => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000);
    const ends = new Map();
    segs.forEach((s, k) => { for (const e of [0, 1]) { const kk = key(s[e]); if (!ends.has(kk)) ends.set(kk, []); ends.get(kk).push(k); } });
    const used = new Uint8Array(segs.length), coastLines = [];
    for (let k0 = 0; k0 < segs.length; k0++) {
      if (used[k0]) continue;
      used[k0] = 1;
      const line = [segs[k0][0], segs[k0][1]];
      for (const dir of [1, 0]) {
        let guard = 0;
        while (guard++ < 20000) {
          const tip = dir ? line[line.length - 1] : line[0];
          const cand = (ends.get(key(tip)) || []).find((q) => !used[q]);
          if (cand === undefined) break;
          used[cand] = 1;
          const s = segs[cand], nxt = key(s[0]) === key(tip) ? s[1] : s[0];
          if (dir) line.push(nxt); else line.unshift(nxt);
        }
      }
      if (polyLength(line) > 3) coastLines.push(line);
    }
    coastLines.sort((a, b) => polyLength(b) - polyLength(a));

    /* ---------- piers ---------- */
    const piers = [];
    for (const pv of [0.445, 0.535, 0.625]) {
      const cx = toX(coastU(pv)), cz = toZ(pv);
      let len = 0; for (let t = 1; t < 12; t += 0.5) { if (heightAt(cx - t, cz) < -0.35) len = t; else if (t > 2 && len) break; }
      len = clamp(len, 4, 9);
      piers.push({ x: cx - len / 2 + 0.6, z: cz, w: len + 1.2, d: 1.9, h: 0.28 });
      stampRect(cx - len / 2 + 0.6, cz, len + 1.2, 2.3, 0, 2);
    }

    /* ---------- sites (lots) ---------- */
    const sites = [];
    function addSite(x, z, w, d, yaw, zone, area, minEra, y) {
      sites.push({ x, z, w, d, yaw, zone, area, minEra, y: y == null ? heightAt(x, z) : y });
      stampRect(x, z, w + 0.1, d + 0.1, yaw, 3);
    }
    // downtown blocks → lots
    const sw = 0.95;
    for (let bx = -4; bx <= 3; bx++) for (let bz = -4; bz <= 3; bz++) {
      const x0 = dtX + bx * BLK + sw, x1 = dtX + (bx + 1) * BLK - sw, z0 = dtZ + bz * BLK + sw, z1 = dtZ + (bz + 1) * BLK - sw;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (Math.hypot(cx - dtX, cz - dtZ) > dtR * 0.93) continue;
      const bw = x1 - x0, bd = z1 - z0;
      if (R.chance(0.18)) { if (rectFree(cx, cz, bw - 0.2, bd - 0.2, 0)) addSite(cx, cz, bw - 0.25, bd - 0.25, 0, 1, 3, 0); continue; }
      for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const lx = cx + fx * bw / 4, lz = cz + fz * bd / 4;
        if (Math.hypot(lx - dtX, lz - dtZ) > dtR * 1.0) continue;
        if (rectFree(lx, lz, bw / 2 - 0.3, bd / 2 - 0.3, 0)) addSite(lx, lz, bw / 2 - 0.35, bd / 2 - 0.35, 0, 1, 2, 0);
      }
    }
    // port yard + quay crane lots
    for (let v = PORTV[0] + 0.02; v <= PORTV[1] - 0.02; v += 0.034) {
      const cx = toX(coastU(v)), cz = toZ(v);
      const qx = cx + 1.0;
      if (heightAt(qx, cz) > 0.1 && rectFree(qx, cz, 1.2, 2.2, 0)) addSite(qx, cz, 1.3, 2.4, 0, 3, 9, 0);
      for (let k = 0; k < 2; k++) {
        const yx = cx + 3.0 + k * 2.6;
        if (heightAt(yx, cz) > 0.1 && rectFree(yx, cz, 2.1, 2.6, 0)) addSite(yx, cz, 2.2, 2.7, 0, 3, 2, 0);
      }
    }
    // industrial grid
    for (let u = IND.u0 + 0.02; u <= IND.u1 - 0.015; u += 0.034) for (let v = IND.v0 + 0.015; v <= IND.v1 - 0.01; v += 0.034) {
      const x = toX(u), z = toZ(v);
      if (heightAt(x, z) > 0.12 && rectFree(x, z, 2.6, 2.6, 0)) addSite(x, z, 2.7, 2.7, 0, 4, 2, 0);
    }
    // airport: hangar, terminal, apron sheds
    const ra = Math.atan2(rwB[1] - rwA[1], rwB[0] - rwA[0]);
    const along = (t, off) => [lerp(rwA[0], rwB[0], t) + nxr * off, lerp(rwA[1], rwB[1], t) + nzr * off];
    { const [hx, hz] = along(0.55, -7.6); addSite(hx, hz, 11.5, 5.0, ra, 5, 8, 0); }
    { const [tx, tz] = along(0.18, -6.6); addSite(tx, tz, 4.2, 1.9, ra, 5, 7, 0); }
    for (const t of [0.30, 0.80, 0.90]) { const [sx, sz] = along(t, -6.8); if (rectFree(sx, sz, 2.4, 2.4, ra)) addSite(sx, sz, 2.4, 2.4, ra, 5, 2, 0); }
    // spaceport beside the airport (zone 8, from era 3): launch pads 11, landing rings 14, terminal 13, elevator anchor 15
    const spaceport = [];
    const spcPlan = [
      [11, 4.4, 4.4, [[0.30, 9.4], [0.28, 12.5]]], [11, 4.4, 4.4, [[0.52, 9.8], [0.50, 13.0]]], [11, 4.4, 4.4, [[0.74, 9.4], [0.72, 12.6]]],
      [14, 2.8, 2.8, [[0.41, 5.0], [0.40, 14.5]]], [14, 2.8, 2.8, [[0.63, 5.2], [0.62, 14.8]]],
      [13, 5.2, 2.4, [[0.12, 6.4], [0.17, 5.4], [0.15, 12.5], [0.06, 9.5], [0.20, 15.0]]], [15, 4.0, 4.0, [[0.93, 11.2], [0.88, 14.5], [0.95, 7.5], [0.84, 6.0]]]];
    for (const [area, w, d, cands] of spcPlan) {
      for (const [t, off] of cands) {
        const [x, z] = along(t, off);
        if (Math.abs(x) < half - w / 2 - 0.4 && Math.abs(z) < half - d / 2 - 0.4 && heightAt(x, z) > 0.1 && rectFree(x, z, w, d, ra)) { addSite(x, z, w, d, ra, 8, area, 3); spaceport.push([x, z, area]); break; }
      }
    }
    // residential lots along residential streets
    for (const r of roads) {
      if (r.group !== 'res') continue;
      const p = r.pts;
      for (let i = 2; i < p.length - 2; i += 3) {
        const dx = p[i + 1][0] - p[i - 1][0], dz = p[i + 1][1] - p[i - 1][1], l = Math.hypot(dx, dz) || 1;
        const tx = dx / l, tz = dz / l, nx = -tz, nzz = tx, yaw = Math.atan2(tz, tx);
        for (const side of [-1, 1]) {
          const off = r.w / 2 + 0.95, x = p[i][0] + nx * off * side, z = p[i][1] + nzz * off * side;
          if (!resOk(x, z)) continue;
          if (rectFree(x, z, 1.3, 1.25, yaw)) addSite(x, z, 1.25, 1.2, yaw, 2, 1, 0);
        }
      }
    }
    // hill expansion (era 2+)
    for (let z = -half + 3; z < half - 3; z += 3.5) for (let x = -half + 3; x < half - 3; x += 3.5) {
      const jx = x + R.range(-1, 1), jz = z + R.range(-1, 1), h = heightAt(jx, jz), u = toU(jx), v = toV(jz);
      if (h < 1.0 || h > 5.6 || slopeAt(jx, jz) > 0.7) continue;
      if (Math.hypot(jx - dtX, jz - dtZ) < dtR * 1.3) continue;
      if (distPoly(jx, jz, river)[0] < 2.5) continue;
      if (mountainH(u, v) > 2.5) continue;
      if (rectFree(jx, jz, 2.4, 2.4, 0)) addSite(jx, jz, 2.3, 2.3, 0, 6, 2, 2);
    }
    // bay sites (floating, era 3+)
    const ferryLane = [];
    for (let z = -half + 3; z < half - 3; z += 3.6) for (let x = -half + 3; x < half - 3; x += 3.6) {
      const jx = x + R.range(-0.6, 0.6), jz = z + R.range(-0.6, 0.6), id = idx(Math.round(jx + half), Math.round(jz + half));
      const h = heightAt(jx, jz);
      if (h > -0.6 || h < -2.9 || coastDist[id] > -2.2) continue;
      if (toU(jx) > 0.35 || toV(jz) < 0.22 || toV(jz) > 0.9) continue;
      if (rectFree(jx, jz, 2.2, 2.2, 0)) { addSite(jx, jz, 2.0, 2.0, 0, 7, 2, 3, 0); }
    }
    void ferryLane;
    // ring (distance rank) and global sort
    let maxR = 1;
    for (const s of sites) { s.dist = Math.hypot(s.x - dtX, s.z - dtZ); maxR = Math.max(maxR, s.dist); }
    for (const s of sites) s.ring = Math.round(1000 * s.dist / maxR);
    sites.sort((a, b) => a.ring - b.ring || a.zone - b.zone || a.x - b.x || a.z - b.z);
    sites.forEach((s, i) => { s.id = i; });

    /* ---------- trees ---------- */
    const trees = [];
    const maxTrees = opt.maxTrees || 5200;
    for (let z = -half + 0.6; z < half - 0.4 && trees.length < maxTrees; z += 0.78) for (let x = -half + 0.6; x < half - 0.4; x += 0.78) {
      const tx = x + R.range(-0.33, 0.33), tz = z + R.range(-0.33, 0.33);
      const k = ogi(tx, tz); if (k < 0 || occ[k]) continue;
      const h = heightAt(tx, tz); if (h < 0.15 || h > 7.0) continue;
      const id = idx(Math.round(tx + half), Math.round(tz + half)); if (coastDist[id] < 1.3) continue;
      const u = toU(tx), v = toV(tz);
      if (dtMask(u, v) > 0.3 || portMask(u, v) > 0.3 || rectMask(u, v, AIR, 0.02) > 0.2 || rectMask(u, v, IND, 0.02) > 0.4 || rectMask(u, v, SPC, 0.02) > 0.2) continue;
      if (slopeAt(tx, tz) > 1.25) continue;
      const dens = 0.42 + 0.45 * (0.5 + 0.5 * nz.fbm(tx * 0.09 + 40, tz * 0.09, 3)) + 0.25 * smoothstep(1.0, 3.5, h) - 0.2 * smoothstep(5.5, 7.0, h);
      if (rnd() > dens) continue;
      const pine = h > 1.7 || rnd() < 0.58;
      trees.push({ x: tx, z: tz, y: h, pine, s: pine ? R.range(0.85, 1.55) : R.range(0.65, 1.05), r: rnd(), hue: rnd() });
      if (trees.length >= maxTrees) break;
    }

    /* ---------- routes for life ---------- */
    const waterAt = (x, z) => heightAt(x, z) < -0.45;
    function waterPath(pts) { return pts.every((p) => waterAt(p[0], p[1])); }
    const ferryA = [toX(coastU(0.80)) - 1.4, toZ(0.80)];
    const ferryB = [toX(0.215), toZ(0.17)];
    let ferry = catmull([ferryA, [ferryA[0] - 7, ferryA[1] - 4], [toX(0.19), toZ(0.48)], [toX(0.21), toZ(0.27)], ferryB], 10);
    ferry = ferry.filter((p) => Math.abs(p[0]) < half - 0.5 && Math.abs(p[1]) < half - 0.5);
    const boatLoops = [];
    for (let tries = 0; tries < 40 && boatLoops.length < 6; tries++) {
      const cx = toX(R.range(0.06, 0.24)), cz = toZ(R.range(0.3, 0.88)), rx = R.range(2.5, 6), rz = R.range(2.5, 7);
      const loop = []; for (let a = 0; a < 24; a++) { const t = (a / 24) * Math.PI * 2; loop.push([cx + Math.cos(t) * rx, cz + Math.sin(t) * rz]); }
      if (waterPath(loop)) boatLoops.push(loop);
    }
    const ship = { x: toX(coastU(0.58)) - 3.2, z: toZ(0.58) };

    return {
      seed, N, S, half, V, H, M, F, col, coastDist, maxIn, maxOut, zoneK,
      river, riverCum, coastLines, roads, bridges, piers, sites, trees, heightAt, slopeAt,
      ferry, boatLoops, ship, runway: { a: rwA, b: rwB, yaw: ra },
      layout: {
        downtown: [dtX, 0.62, dtZ], dtR, port: [toX(coastU(0.535) + 0.03), 0.2, toZ(0.535)],
        airport: [toX(0.77), 0.42, toZ(0.80)], mountains: [toX(0.80), 6, toZ(0.18)],
        island: [toX(0.12), 0.5, toZ(0.15)], bay: [toX(0.16), 0, toZ(0.55)], river: [toX(0.55), 0.2, toZ(rv0)],
        spaceport: (() => { const [x, z] = along(0.55, 8.6); return [x, 1.2, z]; })(),
      },
      farH: (x, z) => { const u = toU(x), v = toV(z); return baseH(u, v) + mountainH(u, v); },
      util: { mulberry32, makeNoise, smoothstep, clamp, lerp, catmull, cumLen, resample, polyLength, distPoly },
    };
  }

  const api = { generateWorld, mulberry32, makeNoise, smoothstep, clamp, lerp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PXMWorld = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
