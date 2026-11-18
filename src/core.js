// Shared machinery for Port Alder: chance, slot tables, the Simmy rails trust law on the integer lattice,
// the nested-VM boot table and E1 K-slot admission.
// SPDX-License-Identifier: GPL-3.0-only
import { Q, sha256Hex, LEVELS, F_RUNNING, F_FAULT, F_RESTART, F_TERMINATE, MAT_DEV_FUNCTIONAL, MAT_VERIFIED, MAT_BLOCKED, SimmyRun, replayText, parseQ, SIMMY_REPLAY_SHA256 } from "./simmy.js";

/* ------------------------------------------------------------------ chance */
// A stateless 32-bit mix of four integers. The city no longer draws anything with it: a cryptographic-style hash has no
// faithful linear form (Corpus Compendium, Lemma D14), so no simulated quantity may come from one. Kept for tools.
export function hash(a, b, c, d) {
  let h = Math.imul((a | 0) ^ 0x3c6ef372, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15) ^ (b | 0), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ (c | 0), 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16) ^ (d | 0), 0x27d4eb2f);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return h >>> 0;
}
export const chance = (h, permille) => h % 1000 < permille;
export const rangeOf = (h, lo, hi) => lo + (h % (hi - lo + 1));
// a draw from a roughly normal distribution: the sum of four uniform bytes, centred (-510..510)
export const bell = (h) => (h & 255) + ((h >>> 8) & 255) + ((h >>> 16) & 255) + (h >>> 24) - 510;
export function isqrt(n) { if (n <= 0) return 0; let r = Math.floor(Math.sqrt(n)); while (r * r > n) r--; while ((r + 1) * (r + 1) <= n) r++; return r; }
export const sat = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/* ------------------------------------------------------------------ slot tables */
// Struct-of-arrays tables with stable slots: a freed slot is reused last-freed-first, so allocation
// order depends only on the history of the run.
export class Slots {
  constructor(cap, spec) {
    for (const [k] of spec) if (["cap", "spec", "top", "free", "count", "alloc", "release", "each", "bytes", "snapshot", "restore"].includes(k)) throw new Error(`table field "${k}" shadows a table member`);
    this.cap = cap; this.spec = spec; this.top = 0; this.free = []; this.count = 0; for (const [k, T, w] of spec) this[k] = new T(cap * (w || 1)); }
  alloc() {
    let i;
    if (this.free.length) i = this.free.pop(); else if (this.top < this.cap) i = this.top++; else return -1;
    for (const [k, , w] of this.spec) { const n = w || 1; this[k].fill(0, i * n, i * n + n); }
    this.alive[i] = 1; this.count++; return i;
  }
  release(i) { if (!this.alive[i]) return; this.alive[i] = 0; this.free.push(i); this.count--; }
  // the rows in use, in order (a plain iterator: the tables are walked millions of times a day, and a generator is slow)
  each() {
    const t = this, alive = this.alive, r = { value: 0, done: false }; let i = -1;
    return { [Symbol.iterator]() { return this; }, next() { while (++i < t.top) if (alive[i]) { r.value = i; return r; } r.value = undefined; r.done = true; return r; } };
  }
  bytes() {
    const parts = this.spec.map(([k, , w]) => new Uint8Array(this[k].buffer, 0, this.top * (w || 1) * this[k].BYTES_PER_ELEMENT));
    const head = new Uint32Array([this.top, this.count, ...this.free]);
    const out = new Uint8Array(head.byteLength + parts.reduce((s, p) => s + p.length, 0));
    out.set(new Uint8Array(head.buffer), 0); let o = head.byteLength; for (const p of parts) { out.set(p, o); o += p.length; } return out;
  }
  snapshot() { return { top: this.top, count: this.count, free: this.free.slice(), cols: Object.fromEntries(this.spec.map(([k]) => [k, this[k].slice()])) }; }
  restore(s) { this.top = s.top; this.count = s.count; this.free = s.free.slice(); for (const [k] of this.spec) this[k].set(s.cols[k]); }
}

/* ------------------------------------------------------------------ the Simmy rails trust law on the lattice */
// Evidence is held as integers in units of 1/U with U = 4158 x 256, which makes the Simmy prior and every
// calibrated evidence weight exact. Forgetting rounds the excess down (floor(24e/25)) so it reaches the
// prior in finite time. Reliability (decay 1/2) is a 16-bit shift register of clean and dirty ticks.
export const U = 4158 * 256;
export const RUNNING = 0, FAULTED = 1, TERMINATED = 2;
const MAX_EVIDENCE = 2 ** 42;
export const TRUST_SPEC = (p) => [[p + "A", Float64Array], [p + "B", Float64Array], [p + "Rel", Uint16Array], [p + "Lv", Uint8Array], [p + "Life", Uint8Array], [p + "Rev", Uint8Array]];
export function latticePolicy(p) {
  const toU = (q, what) => { const v = q.mul(U); if (v.d !== 1n) throw new Error(`${what} is not on the lattice (1/${U})Z`); return Number(v.n); };
  if (!p.rdec.eq(Q.of(1, 2))) throw new Error("the lattice reliability filter needs reliability_decay = 1/2");
  const r16 = (q, what) => { const v = q.mul(65536); if (v.d !== 1n) throw new Error(`${what} is not a 16-bit dyadic`); return Number(v.n); };
  return {
    U, lo: p.lo, scale: p.scale, a0: toU(p.a0, "prior_alpha"), b0: toU(p.b0, "prior_beta"), n0: toU(p.n0, "prior_strength"),
    w: Object.fromEntries(Object.entries(p.w).map(([k, v]) => [k, toU(v, k)])),
    dn: Number(p.delta.n), dd: Number(p.delta.d), rex: r16(p.rex, "reliability_expand_at_least"), rhold: r16(p.rhold, "reliability_hold_at_least"), th: { ...p.th },
  };
}
const fdiv = (t, d) => (t >= 0 ? (t - (t % d)) / d : -((-t + d - 1 - ((-t + d - 1) % d)) / d));
export const ge = (P, a, b, theta) => P.scale * a >= (theta - P.lo) * (a + b);
export function scoreL(P, a, b) {
  const num = P.scale * a, den = a + b; let q = Math.floor(num / den);
  while (q * den > num) q--; while ((q + 1) * den <= num) q++;
  return P.lo + q;
}
export function nextLevelL(level, a, b, rel, P) {
  const th = P.th;
  if (level === 0) return ge(P, a, b, th.restore_from_suspend_above) ? 1 : 0;
  if (level === 1) { if (!ge(P, a, b, th.suspend_below)) return 0; return ge(P, a, b, th.restore_nominal_above) ? 2 : 1; }
  if (level === 2) { if (!ge(P, a, b, th.restrict_below)) return 1; return ge(P, a, b, th.expand_above) && rel >= P.rex ? 3 : 2; }
  if (!ge(P, a, b, th.restrict_below)) return 1;
  if (!ge(P, a, b, th.expand_hold_above) || rel < P.rhold) return 2;
  return 3;
}
export function settleL(level, a, b, rel, P) {
  let steps = 0;
  for (let i = 0; i < 5; i++) { const nx = nextLevelL(level, a, b, rel, P); if (nx === level) return [level, steps]; level = nx; steps++; }
  throw new Error("hysteresis map did not reach a fixed point");
}
// one tick of relationship i in trust table p of T: it interactions, co commits, de denials, fl lifecycle flags
export function tickTrust(P, T, p, i, it, co, de, fl, C) {
  const A = T[p + "A"], B = T[p + "B"], Rl = T[p + "Rel"], Lv = T[p + "Lv"], Lf = T[p + "Life"], Rv = T[p + "Rev"];
  if (Lf[i] === TERMINATED) return;
  let ea = 0, eb = 0, clean = -1;
  if (fl & F_RUNNING && it === 0) { A[i] = P.a0 + fdiv((A[i] - P.a0) * P.dn, P.dd); B[i] = P.b0 + fdiv((B[i] - P.b0) * P.dn, P.dd); }
  if (fl & F_FAULT) { eb += P.w.fault; Lf[i] = FAULTED; clean = 0; }
  if (fl & F_RUNNING && it > 0) { ea += P.w.commit * co; eb += P.w.denial * de; if (de > 0) clean = 0; else if (co > 0 && clean === -1) clean = 1; }
  A[i] = Math.min(MAX_EVIDENCE, A[i] + ea); B[i] = Math.min(MAX_EVIDENCE, B[i] + eb);
  if (clean !== -1) Rl[i] = (Rl[i] >>> 1) | (clean << 15);
  if (fl & F_RESTART) { Lf[i] = RUNNING; Rl[i] = 0; }
  if (fl & F_TERMINATE) { Lf[i] = TERMINATED; Lv[i] = 0; A[i] = 0; B[i] = P.n0; Rv[i] = (Rv[i] + 1) & 255; return; }
  const [nw, steps] = settleL(Lv[i], A[i], B[i], Rl[i], P);
  if (steps) { Lv[i] = nw; Rv[i] = (Rv[i] + steps) & 255; if (C) C.transitions += steps; }
}
export function priorTrust(P, T, p, i, level = 2) { T[p + "A"][i] = P.a0; T[p + "B"][i] = P.b0; T[p + "Rel"][i] = 0; T[p + "Lv"][i] = level; T[p + "Life"][i] = RUNNING; T[p + "Rev"][i] = 0; }
export function copyTrust(T, p, i, st) { T[p + "A"][i] = st.alpha; T[p + "B"][i] = st.beta; T[p + "Rel"][i] = st.rel; T[p + "Lv"][i] = st.level; T[p + "Life"][i] = st.life; T[p + "Rev"][i] = st.rev; }
export const trustScore = (P, T, p, i) => scoreL(P, T[p + "A"][i], T[p + "B"][i]);
export const LEVEL_NAMES = LEVELS.map((s) => s[0] + s.slice(1).toLowerCase());
export function projectFounder(P, a) {
  const lat = (s) => { const q = parseQ(s, "founder"); return Number(q.mul(U).floor()); };
  const rel = parseQ(a.reliability, "founder.reliability").mul(65536);
  return { alpha: lat(a.alpha), beta: lat(a.beta), rel: Number(rel.floor()), level: LEVELS.indexOf(a.level), life: ["running", "faulted", "terminated"].indexOf(a.lifecycle), rev: a.revision };
}

/* ------------------------------------------------------------------ the nested-VM boot */
// The city boots on the verified Simmy replay. Its rails policy is the trust law of every relationship;
// the founder agents' final states seed the banks' and the city's standing. Optional mechanisms switch on
// at the first mesh tick at which their certifying Simmy subsystem is ready (DEV_FUNCTIONAL or better);
// the money rules, the books and the audit run from the first day.
export const MECHANISMS = [
  ["streetlife", 1, "The street-life law runs on the XPU", true], ["calendar", 2, "The calendar, paydays and holidays", true],
  ["books", 17, "Double-entry books for every entity", true], ["audit", 61, "The books are audited after every day", true],
  ["statutes", 12, "Washington and United States rules", true], ["markets", 13, "Shops, prices and wages", true],
  ["minds", 16, "Needs, moods, memories and expectations", true], ["banking", 46, "Banks, loans and reserves", true],
  ["authority", 67, "Rails trust between people and institutions", true], ["provenance", 36, "Epochs sealed as R files", true],
  ["reproducibility", 50, "Cross-engine checks", true], ["view3d", 47, "The live 3D city", true],
  ["housing", 30, "Moving house, buying and renting", false], ["entrepreneurs", 32, "New businesses open", false],
  ["construction", 33, "New buildings go up", false], ["migration", 15, "People arrive and leave", false],
  ["families", 18, "Couples, births and new households", false], ["elections", 58, "Levy votes in November", false],
];
export function simmyBoot(manifest, workload) {
  const run = new SimmyRun(manifest, workload);
  const subs = manifest.cells.filter((c) => c.kind === "subsystem");
  const ready = {}, verified = {};
  while (!run.done) {
    const info = run.step();
    for (const c of subs) {
      const m = run.maturity(c.container);
      if (m >= MAT_DEV_FUNCTIONAL && m !== MAT_BLOCKED) ready[c.number] ??= info.tick;
      if (m >= MAT_VERIFIED && m !== MAT_BLOCKED) verified[c.number] ??= info.tick;
    }
  }
  const result = run.result(), text = replayText(result);
  const auth = Object.values(result.cells).find((c) => c.kind === "authority_minivm").final;
  return { sha256: sha256Hex(text), ready, verified, policy: run.p, founders: auth.agents, titles: Object.fromEntries(subs.map((c) => [c.number, c.title])) };
}
export const BOOT_SHA = SIMMY_REPLAY_SHA256;

/* ------------------------------------------------------------------ E1 K-slot admission */
// Candidates [k1, k2, k3, id] are ranked by (k1, k2, k3) descending, then id ascending. The first K are
// admitted; the first refused key is the slot price, and the certificate is that no admitted key is
// below it.
const keyCmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]) || (b[3] - a[3]);
export function admitE1(cands, K) {
  const sorted = cands.slice().sort((a, b) => keyCmp(b, a));
  const take = sorted.slice(0, Math.max(0, K)), price = sorted.length > take.length ? sorted[take.length] : null;
  if (price && take.some((k) => keyCmp(k, price) < 0)) throw new Error("E1 admission certificate failed: an admitted key is below the slot price");
  return { admitted: take.map((k) => k[3]), refused: sorted.slice(take.length).map((k) => k[3]), price };
}
export { F_RUNNING, F_FAULT, F_RESTART, F_TERMINATE, sha256Hex };
