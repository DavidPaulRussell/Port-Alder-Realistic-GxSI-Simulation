// SPDX-License-Identifier: GPL-3.0-only
// An exact snapshot of a running city, and its restoration: the simulation's outputs as its next inputs.
//
// A snapshot is everything the city knows that is not written in its code: every table, every ledger, every plan in
// progress, the outer layers, the registry and the digest chain. It is a tree (plain values, in the order they were
// made) and a list of blobs (the typed arrays' bytes). Restoring founds a city from the same configuration (which
// gives it its laws and its functions) and then puts every value back in its place. A restored city goes on exactly
// as the one it was taken from would have: the same days, the same digests (test/city.test.mjs checks it).
//
// Nothing here draws, hashes or reads a clock. Sharing is kept: two names for one object are two names for one object
// after the restore. Maps and sets keep their order. What the configuration alone determines (the Simmy replay, the
// compiled law, the policy lattice) is not stored.
import { SCALE } from "./scale.js";

export const SNAP_FORMAT = "PLUME-CITY-STATE/1";
const TYPED = { Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array };
// what the configuration alone determines, by where it hangs
const SKIP_TOP = new Set(["boot", "P", "law", "founders", "breathe", "stepping"]);
const SKIP_IN = { Slots: new Set(["spec"]) };
// timings are not state (how long a day took to compute says nothing of the day)
const TIMINGS = "ms";
const isPlain = (v) => { const p = Object.getPrototypeOf(v); return p === Object.prototype || p === null; };
const className = (v) => (v.constructor && v.constructor.name) || "Object";

export function snapshot(city) {
  // first pass: which objects have more than one name
  const seen = new Map();
  const count = (v, top) => {
    if (v === null || typeof v !== "object") return;
    const n = seen.get(v) || 0; seen.set(v, n + 1); if (n) return;
    if (ArrayBuffer.isView(v)) return;
    if (v instanceof Map) { for (const [a, b] of v) { count(a); count(b); } return; }
    if (v instanceof Set) { for (const a of v) count(a); return; }
    if (Array.isArray(v)) { for (const x of v) count(x); return; }
    const skip = top ? SKIP_TOP : SKIP_IN[className(v)];
    for (const k of Object.keys(v)) if (!(skip && skip.has(k)) && k !== TIMINGS) count(v[k]);
  };
  count(city, true);
  const ids = new Map(), blobs = []; let nextId = 1;
  const num = (x) => (Number.isFinite(x) && !Object.is(x, -0) ? x : { $n: Object.is(x, -0) ? "-0" : String(x) });
  const enc = (v, top) => {
    const t = typeof v;
    if (t === "number") return num(v);
    if (t === "string" || t === "boolean" || v === null) return v;
    if (t === "undefined") return { $u: 1 };
    if (t === "bigint") return { $b: String(v) };
    if (t === "function" || t === "symbol") return undefined;
    if (ids.has(v)) return { $r: ids.get(v) };
    let id = 0; if (seen.get(v) > 1) { id = nextId++; ids.set(v, id); }
    const tag = (o) => { if (id) o.$id = id; return o; };
    if (ArrayBuffer.isView(v)) {
      const name = className(v); if (!TYPED[name]) throw new Error(`snapshot: a ${name} is not a kind of table`);
      blobs.push(new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice());
      return tag({ $t: name, blob: blobs.length - 1, len: v.length });
    }
    if (v instanceof Map) return tag({ $m: [...v].map(([a, b]) => [enc(a), enc(b)]) });
    if (v instanceof Set) return tag({ $s: [...v].map((a) => enc(a)) });
    if (Array.isArray(v)) {
      const out = new Array(v.length); let holes = false;
      for (let i = 0; i < v.length; i++) { if (!(i in v)) { holes = true; out[i] = { $h: 1 }; continue; } const e = enc(v[i]); out[i] = e === undefined ? { $f: 1 } : e; }
      return id || holes ? tag({ $a: out }) : out;
    }
    const out = {}, skip = top ? SKIP_TOP : SKIP_IN[className(v)];
    if (!isPlain(v)) out.$c = className(v);
    for (const k of Object.keys(v)) {
      if ((skip && skip.has(k)) || k === TIMINGS) continue;
      if (k[0] === "$") throw new Error(`snapshot: a field named ${k} cannot be stored`);
      const e = enc(v[k]); if (e !== undefined) out[k] = e;
    }
    return tag(out);
  };
  const tree = enc(city, true);
  return { format: SNAP_FORMAT, cfg: encPlain(city.cfg), scale: { ...SCALE }, tree, blobs };
}

// put a snapshot back into a city founded from the same configuration
export function restore(city, snap) {
  if (!snap || snap.format !== SNAP_FORMAT) throw new Error(`restore: not a ${SNAP_FORMAT} snapshot`);
  const made = new Map(), blobs = snap.blobs, used = new Set();
  // a live value takes one stored value only: two stored values never share a home the snapshot did not give them
  const fresh = (live) => { if (live === null || typeof live !== "object" || used.has(live)) return undefined; used.add(live); return live; };
  const typed = (node, live) => {
    const T = TYPED[node.$t], src = blobs[node.blob]; if (!T || !src) throw new Error("restore: a table is missing");
    const bytes = src.byteLength, want = node.len * T.BYTES_PER_ELEMENT; if (bytes !== want) throw new Error("restore: a table has the wrong length");
    const out = live instanceof T && live.length === node.len ? live : new T(node.len);
    new Uint8Array(out.buffer, out.byteOffset, out.byteLength).set(src);
    return out;
  };
  const dec = (node, live) => {
    if (node === null || typeof node !== "object") return node;
    if (!Array.isArray(node)) {
      if ("$n" in node) return node.$n === "-0" ? -0 : Number(node.$n);
      if ("$u" in node) return undefined;
      if ("$b" in node) return BigInt(node.$b);
      if ("$r" in node) { if (!made.has(node.$r)) throw new Error("restore: a shared value is named before it is made"); return made.get(node.$r); }
    }
    const keep = (o) => { if (!Array.isArray(node) && node.$id) made.set(node.$id, o); return o; };
    live = fresh(live);
    if (!Array.isArray(node) && "$t" in node) return keep(typed(node, live));
    if (!Array.isArray(node) && "$m" in node) { const m = keep(new Map()); for (const [a, b] of node.$m) m.set(dec(a), dec(b)); return m; }
    if (!Array.isArray(node) && "$s" in node) { const s = keep(new Set()); for (const a of node.$s) s.add(dec(a)); return s; }
    if (Array.isArray(node) || "$a" in node) {
      const src = Array.isArray(node) ? node : node.$a, out = keep(Array.isArray(live) ? live : []);
      const old = out.slice(); out.length = 0; out.length = src.length;
      for (let i = 0; i < src.length; i++) {
        const e = src[i];
        if (e && typeof e === "object" && !Array.isArray(e) && "$h" in e) { delete out[i]; continue; }
        if (e && typeof e === "object" && !Array.isArray(e) && "$f" in e) { out[i] = old[i]; continue; }
        out[i] = dec(e, old[i]);
      }
      return out;
    }
    // an object: into the live one when there is one of the same kind (it keeps its functions and its class)
    const cls = node.$c, liveOk = live !== null && typeof live === "object" && !Array.isArray(live) && !ArrayBuffer.isView(live) && !(live instanceof Map) && !(live instanceof Set) && (cls ? className(live) === cls : isPlain(live));
    if (cls && !liveOk) throw new Error(`restore: there is no ${cls} here to restore into`);
    const out = keep(liveOk ? live : {}), keys = Object.keys(node).filter((k) => k[0] !== "$");
    const skip = cls ? SKIP_IN[cls] : null, dataKeys = Object.keys(out).filter((k) => typeof out[k] !== "function" && !(skip && skip.has(k)) && k !== TIMINGS), olds = {};
    const sameOrder = dataKeys.length === keys.length && dataKeys.every((k, i) => k === keys[i]);
    for (const k of dataKeys) { olds[k] = out[k]; if (!sameOrder && !cls) delete out[k]; else if (!keys.includes(k)) delete out[k]; }
    for (const k of keys) out[k] = dec(node[k], olds[k]);
    return out;
  };
  const tree = snap.tree;
  if (JSON.stringify(snap.cfg) !== JSON.stringify(encPlain(city.cfg))) throw new Error("restore: the snapshot was taken from a city of another configuration");
  if (snap.scale && JSON.stringify(snap.scale) !== JSON.stringify({ ...SCALE })) throw new Error(`restore: the snapshot was taken from a city of another size (${snap.scale.name}); this one is ${SCALE.name}`);
  if (tree.$id) made.set(tree.$id, city);
  // the top level: every stored field back in its place; what the configuration determines stays as founded
  const liveKeys = Object.keys(city).filter((k) => typeof city[k] !== "function" && !SKIP_TOP.has(k));
  for (const k of liveKeys) if (!(k in tree)) delete city[k];
  for (const k of Object.keys(tree)) { if (k[0] === "$") continue; city[k] = dec(tree[k], city[k]); }
  return city;
}
// the configuration as the snapshot stores it (plain values only)
function encPlain(v) {
  if (typeof v === "number") return Number.isFinite(v) && !Object.is(v, -0) ? v : { $n: Object.is(v, -0) ? "-0" : String(v) };
  if (v === null || typeof v !== "object") return v === undefined ? { $u: 1 } : v;
  if (Array.isArray(v)) return v.map(encPlain);
  const o = {}; for (const k of Object.keys(v)) { const e = encPlain(v[k]); if (typeof v[k] !== "function") o[k] = e; } return o;
}

// One file's worth of bytes: the tree as JSON and the blobs, behind a small header.
//   "PLUMESNP" | u32 version | u32 tree length | tree (UTF-8 JSON) | u32 blob count | (u32 length | bytes)*
export function snapshotBytes(snap) {
  const tree = new TextEncoder().encode(JSON.stringify({ cfg: snap.cfg, scale: snap.scale, tree: snap.tree })); let n = 8 + 4 + 4 + tree.length + 4; for (const b of snap.blobs) n += 4 + b.length;
  const out = new Uint8Array(n), dv = new DataView(out.buffer); let o = 0;
  out.set(new TextEncoder().encode("PLUMESNP"), 0); o = 8; dv.setUint32(o, 1, true); o += 4; dv.setUint32(o, tree.length, true); o += 4; out.set(tree, o); o += tree.length;
  dv.setUint32(o, snap.blobs.length, true); o += 4; for (const b of snap.blobs) { dv.setUint32(o, b.length, true); o += 4; out.set(b, o); o += b.length; }
  return out;
}
export function snapshotFromBytes(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let o = 8;
  if (new TextDecoder().decode(bytes.subarray(0, 8)) !== "PLUMESNP" || dv.getUint32(o, true) !== 1) throw new Error("not a city snapshot"); o += 4;
  const tl = dv.getUint32(o, true); o += 4; const head = JSON.parse(new TextDecoder().decode(bytes.subarray(o, o + tl))); o += tl;
  const nb = dv.getUint32(o, true); o += 4; const blobs = []; for (let k = 0; k < nb; k++) { const l = dv.getUint32(o, true); o += 4; blobs.push(bytes.subarray(o, o + l)); o += l; }
  if (o !== bytes.length) throw new Error("the city snapshot has trailing bytes");
  return { format: SNAP_FORMAT, cfg: head.cfg, scale: head.scale, tree: head.tree, blobs };
}
