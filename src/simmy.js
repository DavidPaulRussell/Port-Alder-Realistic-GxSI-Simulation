// Simmy 4.0.0 UNITY rails executor (Simmy package v3.0.0), in the console's own toolchain.
// SPDX-License-Identifier: GPL-3.0-only
//
// A rule-for-rule port of GENERATED/toolchain/simmy_rails_model.py and the legacy helpers it imports
// from simmy_unity_model.py. Everything runs in exact BigInt rational arithmetic. The replay object,
// written as Python's json.dumps(obj, indent=2, sort_keys=True) + "\n", is byte-identical to
// GENERATED/unity_mesh_run.json of the Simmy package (SHA-256 SIMMY_REPLAY_SHA256 below), and every
// state digest along the way is the Python canonical_digest of the same state.
//
//   release      E1  K-slot admission ranked by (readiness, E14 planning value, -number)
//   gates, votes E20 thresholds on exact counts, cross-checked against the lattice fold
//   authority    E6  Beta evidence (alpha, beta); E3 idle-clock forgetting; reliability filter;
//                E2/E15 hysteresis cones; E20 termination latch
//   convergence  E8  exact fixed point of the tick map
//   cycles       E17 contradiction certificates;  integration  E16 component count
//
// No result is asserted as proof of phenomenal consciousness.

export const SIMMY_PACKAGE_VERSION = "3.0.0";
export const SIMMY_REPLAY_SHA256 = "18c48c87f7c8f604dbdbc6be4676cc5cb1edddc261896528d419eafb76bf0f49";
export const SIMMY_WORKLOAD_SHA256 = "01f13aef862c7e3f238db4b0ec114d37bfbb11a9842b3248c781c80f7e02f3c6";

/* ------------------------------------------------------------------ SHA-256 (synchronous) */
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
const W256 = new Uint32Array(64);
const ror = (x, n) => (x >>> n) | (x << (32 - n));
const ENC = new TextEncoder();
export const utf8 = (s) => ENC.encode(s);

export function sha256Hex(input) {
  const bytes = typeof input === "string" ? utf8(input) : input;
  const l = bytes.length, nb = ((l + 9 + 63) >>> 6) << 6;
  const m = new Uint8Array(nb); m.set(bytes); m[l] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(nb - 4, (l * 8) >>> 0); dv.setUint32(nb - 8, Math.floor((l * 8) / 4294967296));
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = W256;
  for (let off = 0; off < nb; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2];
      w[i] = (w[i - 16] + (ror(x, 7) ^ ror(x, 18) ^ (x >>> 3)) + w[i - 7] + (ror(y, 17) ^ ror(y, 19) ^ (y >>> 10))) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) | 0;
      const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}

/* ------------------------------------------------------------------ Python-compatible JSON */
// json.dumps(..., sort_keys=True, ensure_ascii=True): keys sorted by code point, every character
// outside space..tilde escaped (lower-case hex), integers only (the Simmy replay holds no floats).
const SHORT_ESC = { '"': '\\"', "\\": "\\\\", "\n": "\\n", "\r": "\\r", "\t": "\\t", "\b": "\\b", "\f": "\\f" };
function pyString(s) {
  let out = '"', run = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x20 && c <= 0x7e && c !== 0x22 && c !== 0x5c) continue;
    out += s.slice(run, i) + (SHORT_ESC[s[i]] || "\\u" + c.toString(16).padStart(4, "0"));
    run = i + 1;
  }
  return out + s.slice(run) + '"';
}
const ASCII = /^[\x00-\x7f]*$/;
function byCodePoint(a, b) {
  if (ASCII.test(a) && ASCII.test(b)) return a < b ? -1 : a > b ? 1 : 0;
  const x = [...a], y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) { const d = x[i].codePointAt(0) - y[i].codePointAt(0); if (d) return d; }
  return x.length - y.length;
}
const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

// pyDumps(v)            → json.dumps(v, sort_keys=True, separators=(',', ':'), ensure_ascii=True)
// pyDumps(v, 2)         → json.dumps(v, indent=2, sort_keys=True)
export function pyDumps(value, indent = null) {
  const enc = (v, level) => {
    if (v === null || v === undefined) return "null";
    if (v === true) return "true";
    if (v === false) return "false";
    if (typeof v === "number") { if (!Number.isSafeInteger(v)) throw new TypeError(`not a JSON integer: ${v}`); return String(v); }
    if (typeof v === "bigint") return v.toString();
    if (typeof v === "string") return pyString(v);
    if (Array.isArray(v)) {
      if (!v.length) return "[]";
      if (indent === null) return "[" + v.map((x) => enc(x, 0)).join(",") + "]";
      const ni = "\n" + " ".repeat(indent * (level + 1));
      return "[" + ni + v.map((x) => enc(x, level + 1)).join("," + ni) + "\n" + " ".repeat(indent * level) + "]";
    }
    if (isPlain(v)) {
      const keys = Object.keys(v).sort(byCodePoint);
      if (!keys.length) return "{}";
      if (indent === null) return "{" + keys.map((k) => pyString(k) + ":" + enc(v[k], 0)).join(",") + "}";
      const ni = "\n" + " ".repeat(indent * (level + 1));
      return "{" + ni + keys.map((k) => pyString(k) + ": " + enc(v[k], level + 1)).join("," + ni) + "\n" + " ".repeat(indent * level) + "}";
    }
    throw new TypeError(`Object of type ${v?.constructor?.name ?? typeof v} is not JSON serializable`);
  };
  return enc(value, 0);
}

export const canonicalDigest = (obj, previous = "") => sha256Hex(pyDumps({ previous, state: obj }));

/* ------------------------------------------------------------------ exact rationals */
const babs = (x) => (x < 0n ? -x : x);
function bgcd(a, b) { a = babs(a); b = babs(b); while (b !== 0n) { const t = a % b; a = b; b = t; } return a; }

export class Q {
  constructor(n, d) { this.n = n; this.d = d; } // normalized: gcd(n, d) = 1, d > 0
  static of(n, d = 1n) {
    n = BigInt(n); d = BigInt(d);
    if (d === 0n) throw new RangeError("Fraction(" + n + ", 0)");
    if (d < 0n) { n = -n; d = -d; }
    const g = bgcd(n, d);
    return g === 1n ? new Q(n, d) : new Q(n / g, d / g);
  }
  static int(k) { return new Q(BigInt(k), 1n); }
  add(o) { o = toQ(o); return this.d === o.d ? Q.of(this.n + o.n, this.d) : Q.of(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { o = toQ(o); return this.d === o.d ? Q.of(this.n - o.n, this.d) : Q.of(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { o = toQ(o); if (this.n === 0n || o.n === 0n) return Q.ZERO; return Q.of(this.n * o.n, this.d * o.d); }
  div(o) { o = toQ(o); if (o.n === 0n) throw new RangeError("division by zero"); return Q.of(this.n * o.d, this.d * o.n); }
  inv() { return Q.ONE.div(this); }
  neg() { return new Q(-this.n, this.d); }
  cmp(o) { o = toQ(o); const l = this.n * o.d, r = o.n * this.d; return l < r ? -1 : l > r ? 1 : 0; }
  lt(o) { return this.cmp(o) < 0; } le(o) { return this.cmp(o) <= 0; }
  gt(o) { return this.cmp(o) > 0; } ge(o) { return this.cmp(o) >= 0; }
  eq(o) { o = toQ(o); return this.n === o.n && this.d === o.d; }
  isZero() { return this.n === 0n; }
  floor() { const q = this.n / this.d; return this.n < 0n && q * this.d !== this.n ? q - 1n : q; }
  pow(k) { let r = Q.ONE; for (let i = 0; i < k; i++) r = r.mul(this); return r; }
  toString() { return this.d === 1n ? this.n.toString() : `${this.n}/${this.d}`; }
  toNumber() { return qToDouble(this).value; }
}
Q.ZERO = new Q(0n, 1n); Q.ONE = new Q(1n, 1n);
const toQ = (v) => (v instanceof Q ? v : Q.of(v));
const bitlen = (x) => x.toString(2).length;
export const qs = (x) => toQ(x).toString(); // Python str(Fraction(x))

// Python float(Fraction): the correctly rounded double, returned with its exact form m * 2^e.
export function qToDouble(x) {
  let { n, d } = toQ(x); const neg = n < 0n; if (neg) n = -n;
  if (n === 0n) return { value: 0, m: 0n, e: 0, neg: false };
  const s = 55 - (bitlen(n) - bitlen(d));
  const num = s >= 0 ? n << BigInt(s) : n, den = s >= 0 ? d : d << BigInt(-s);
  let q = num / den; const sticky = q * den !== num;
  const shift = bitlen(q) - 53, half = 1n << BigInt(shift - 1), low = q & ((1n << BigInt(shift)) - 1n);
  q >>= BigInt(shift);
  if (low > half || (low === half && (sticky || (q & 1n) === 1n))) q += 1n;
  const e = shift - s;
  return { value: (neg ? -1 : 1) * Number(q) * 2 ** e, m: q, e, neg };
}
// f'{float(x):.6f}': the exact binary value of the double, rounded half-to-even at 6 places.
export function pyFixed6(x) {
  const { m, e, neg } = qToDouble(x);
  let num = m * 1000000n, den = 1n;
  if (e >= 0) num <<= BigInt(e); else den <<= BigInt(-e);
  let q = num / den; const r2 = 2n * (num - q * den);
  if (r2 > den || (r2 === den && (q & 1n) === 1n)) q += 1n;
  const t = q.toString().padStart(7, "0");
  return (neg && q !== 0n ? "-" : "") + t.slice(0, -6) + "." + t.slice(-6);
}

/* ------------------------------------------------------------------ constants (simmy_unity_model.py) */
export const CODE_NOT_RUN = 0, CODE_PASS = 1, CODE_FAIL = 2, CODE_BLOCKED = 3, CODE_NA = 4;
export const RESULT_NAMES = ["NOT_RUN", "PASS", "FAIL", "BLOCKED", "NOT_APPLICABLE"];
export const VOTE_NAMES = ["NOT_VOTED", "PASS", "FAIL", "BLOCKED", "ABSTAIN"];
export const MAT_NOT_IMPLEMENTED = 0, MAT_SCAFFOLDED = 1, MAT_DEV_FUNCTIONAL = 2, MAT_VERIFIED = 3, MAT_OPERATIONAL = 4, MAT_BLOCKED = 5;
export const MATURITY_NAMES = ["NOT_IMPLEMENTED", "SCAFFOLDED", "DEV_FUNCTIONAL", "VERIFIED", "OPERATIONAL", "BLOCKED"];
export const N_PHASES = 24, N_GATES = 8, N_SCN = 6, N_NODES = 13;
export const VOTE_QUORUM = 9;
export const AGENTS = ["warden.a", "warden.b", ...Array.from({ length: 11 }, (_, i) => `deer.${String(i).padStart(2, "0")}`), "deer.unlicensed"];
export const F_RUNNING = 1, F_FAULT = 2, F_RESTART = 4, F_TERMINATE = 8, F_MIGRATE = 16;
export const F_ALL = F_RUNNING | F_FAULT | F_RESTART | F_TERMINATE | F_MIGRATE;
export const MAX_VERDICTS_PER_TICK = 4, EXPECTED_SUBSYSTEMS = 67;
export const LEVELS = ["SUSPENDED", "RESTRICTED", "NOMINAL", "EXPANDED"];
const LIFECYCLES = new Set(["running", "faulted", "terminated"]);
const RESULT_CODE_BY_NAME = Object.fromEntries(RESULT_NAMES.map((nm, i) => [nm, i]));
const BASE_POLICY_KEYS = ["initial_score", "min_score", "max_score", "growth_per_commit", "decay_per_denial", "idle_decay",
  "fault_decay", "gate_pass_growth", "gate_fail_decay", "flawless_streak_for_expansion", "thresholds"];
export const THRESHOLD_NAMES = ["suspend_below", "restore_from_suspend_above", "restrict_below", "restore_nominal_above", "expand_hold_above", "expand_above"];

/* ------------------------------------------------------------------ constants (simmy_rails_model.py) */
export const RAILS_WORKLOAD_SCHEMA = "SIMMY4.UNITY.AUTHORITY_WORKLOAD/2-RAILS";
export const RAILS_RUN_SCHEMA = "SIMMY4.UNITY_MESH_RUN/2-RAILS";
export const AUTHORITY_POLICY_VERSION = "simmy.rails.authority/1.0";
export const MESH_POLICY_VERSION = "simmy.rails.mesh/1.0";
const RAILS_WORKLOAD_KEYS = ["schema", "ticks", "inputs", "verdicts", "oracle", "policy", "mesh_policy",
  "source_workload_sha256", "source_trace_sha256", "source_telemetry_sha256"];
const AUTHORITY_POLICY_KEYS = ["policy_version", "score_scale", "prior_mean", "prior_strength", "prior_alpha", "prior_beta",
  "evidence_weights", "idle_forgetting", "reliability_decay", "reliability_expand_at_least", "reliability_hold_at_least", "thresholds"];
const EVIDENCE_KEYS = ["commit", "denial", "fault", "gate_pass", "gate_fail"];
const MESH_POLICY_KEYS = ["policy_version", "release_capacity", "planning_discount"];
export const ORACLE_FIELDS = ["alpha", "beta", "score", "level", "lifecycle", "reliability"];
const READY = new Set([MAT_DEV_FUNCTIONAL, MAT_VERIFIED, MAT_OPERATIONAL]);
const RATIONAL = /^(0|[1-9][0-9]*)(\/[1-9][0-9]*)?$/;
export const DEFAULT_IDLE_FORGETTING = Q.of(24, 25), DEFAULT_RELIABILITY_DECAY = Q.of(1, 2), DEFAULT_RELIABILITY_HOLD = Q.of(3, 4);
const HOLD_TIME_TOLERANCE_TICKS = 0.5;

export class ModelValidationError extends Error { constructor(m) { super(m); this.name = "ModelValidationError"; } }
export class SimulationConvergenceError extends Error { constructor(m) { super(m); this.name = "SimulationConvergenceError"; } }
export class RailsCertificateError extends Error { constructor(m) { super(m); this.name = "RailsCertificateError"; } }
const bad = (m) => { throw new ModelValidationError(m); };

/* ------------------------------------------------------------------ validation */
const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const sameKeys = (obj, keys) => { const a = Object.keys(obj).sort(), b = [...keys].sort(); return a.length === b.length && a.every((k, i) => k === b[i]); };
const keyDiff = (obj, keys) => `missing=${JSON.stringify(keys.filter((k) => !(k in obj)).sort())}, extra=${JSON.stringify(Object.keys(obj).filter((k) => !keys.includes(k)).sort())}`;
const deepEq = (a, b) => pyDumps(a) === pyDumps(b);

function requireInt(value, label, minimum = null, maximum = null) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) bad(`${label} must be an integer`);
  if (minimum !== null && value < minimum) bad(`${label} must be >= ${minimum}`);
  if (maximum !== null && value > maximum) bad(`${label} must be <= ${maximum}`);
  return value;
}
const requireSha256 = (v, label) => (typeof v === "string" && /^[0-9a-f]{64}$/.test(v) ? v : bad(`${label} must be a lowercase 64-hex SHA-256 digest`));

function validateIndexLists(lists, width, label) {
  lists.forEach((members, i) => {
    if (!Array.isArray(members)) bad(`${label}[${i}] must be a list`);
    if (!members.length) bad(`${label}[${i}] must not be empty (empty folds are vacuous PASS)`);
    if (new Set(members).size !== members.length) bad(`${label}[${i}] contains duplicate indices`);
    members.forEach((idx, j) => requireInt(idx, `${label}[${i}][${j}]`, 0, width - 1));
  });
}

function validateLegacyPolicy(policy, label) {
  if (!isMap(policy)) bad(`${label} must be an object`);
  if (!sameKeys(policy, BASE_POLICY_KEYS)) bad(`${label} keys must match the declared contract; ${keyDiff(policy, BASE_POLICY_KEYS)}`);
  for (const key of BASE_POLICY_KEYS.slice(0, 10)) requireInt(policy[key], `${label}.${key}`, key === "flawless_streak_for_expansion" ? 1 : 0);
  if (!(policy.min_score <= policy.initial_score && policy.initial_score <= policy.max_score)) bad(`${label} score bounds must satisfy min <= initial <= max`);
  const th = policy.thresholds;
  if (!isMap(th)) bad(`${label}.thresholds must be an object`);
  if (!sameKeys(th, THRESHOLD_NAMES)) bad(`${label}.thresholds keys must match the declared contract; ${keyDiff(th, THRESHOLD_NAMES)}`);
  for (const k of THRESHOLD_NAMES) requireInt(th[k], `${label}.thresholds.${k}`, policy.min_score, policy.max_score);
  const ordered = [policy.min_score, ...THRESHOLD_NAMES.map((k) => th[k]), policy.max_score];
  if (!ordered.every((x, i) => i === 0 || ordered[i - 1] <= x)) bad(`${label} thresholds must be monotone within min/max score bounds`);
  if (!(th.suspend_below < th.restore_from_suspend_above)) bad(`${label} suspend hysteresis requires suspend_below < restore_from_suspend_above`);
  if (!(th.restrict_below < th.restore_nominal_above)) bad(`${label} nominal hysteresis requires restrict_below < restore_nominal_above`);
  if (!(th.expand_hold_above < th.expand_above)) bad(`${label} expansion hysteresis requires expand_hold_above < expand_above`);
}

function validateTargetMetadata(cell) {
  const name = cell.container;
  if (cell.targets !== undefined) {
    const want = Array.from({ length: N_PHASES }, (_, i) => `P${String(i).padStart(2, "0")}`);
    if (!isMap(cell.targets) || !sameKeys(cell.targets, want)) bad(`${name}.targets must contain exactly P00..P23`);
    cell.target_codes.forEach((code, i) => { if (RESULT_CODE_BY_NAME[cell.targets[want[i]]] !== code) bad(`${name}.targets[${want[i]}] disagrees with target_codes[${i}]`); });
  }
  if (cell.phases !== undefined) {
    if (!Array.isArray(cell.phases) || cell.phases.length !== N_PHASES) bad(`${name}.phases must contain ${N_PHASES} entries`);
    cell.phases.forEach((ph, i) => {
      if (!isMap(ph)) bad(`${name}.phases[${i}] must be an object`);
      if (RESULT_CODE_BY_NAME[ph.target] !== cell.target_codes[i]) bad(`${name}.phases[${i}].target disagrees with target_codes[${i}]`);
    });
  }
}

function validateCellTables(c, name, isControlPlane) {
  for (const [key, n] of [["target_codes", N_PHASES], ["gate_lists", N_GATES], ["scenario_lists", N_SCN], ["node_lists", N_NODES]])
    if (!Array.isArray(c[key]) || c[key].length !== n) bad(isControlPlane ? `${name}.${key} must contain ${n} entries` : `${name}.${key} must contain ${n} ${key === "target_codes" ? "entries" : "lists"}`);
  c.target_codes.forEach((code, i) => requireInt(code, `${name}.target_codes[${i}]`, 0, CODE_NA));
  validateIndexLists(c.gate_lists, N_PHASES, `${name}.gate_lists`);
  validateIndexLists(c.scenario_lists, N_PHASES, `${name}.scenario_lists`);
  if (c.vote_source !== "phases" && c.vote_source !== "gates") bad(`${name}.vote_source must be phases or gates`);
  validateIndexLists(c.node_lists, c.vote_source === "phases" ? N_PHASES : N_GATES + N_SCN, `${name}.node_lists`);
  if (c.maturity_cap !== "VERIFIED" && c.maturity_cap !== "OPERATIONAL") bad(`${name}.maturity_cap must be VERIFIED or OPERATIONAL`);
  requireInt(c.census_len, `${name}.census_len`, 0, EXPECTED_SUBSYSTEMS);
  validateTargetMetadata(c);
}

export function validateManifest(manifest) {
  if (!isMap(manifest)) bad("manifest must be an object");
  if (manifest.schema !== "SIMMY4.CELLS/1") bad("manifest.schema must be SIMMY4.CELLS/1");
  const cells = manifest.cells;
  if (!Array.isArray(cells) || !cells.length) bad("manifest.cells must be a non-empty list");
  for (const c of cells) {
    if (!isMap(c)) bad("every cell must be an object");
    if (!["subsystem", "control_plane", "authority_minivm"].includes(c.kind)) bad(`unsupported cell kind: ${JSON.stringify(c.kind)}`);
  }
  const subs = cells.filter((c) => c.kind === "subsystem"), cps = cells.filter((c) => c.kind === "control_plane"), auth = cells.filter((c) => c.kind === "authority_minivm");
  if (subs.length !== EXPECTED_SUBSYSTEMS) bad(`exactly ${EXPECTED_SUBSYSTEMS} subsystems are required; found ${subs.length}`);
  if (cps.length !== 1) bad(`exactly one control_plane is required; found ${cps.length}`);
  if (auth.length !== 1) bad(`exactly one authority_minivm is required; found ${auth.length}`);
  const numbers = new Set(), containers = new Set();
  for (const c of cells) {
    const name = c.container;
    if (typeof name !== "string" || !name) bad("every cell requires a non-empty container");
    if (containers.has(name)) bad(`duplicate container: ${name}`);
    containers.add(name);
    if (c.kind === "subsystem") {
      const n = requireInt(c.number, `${name}.number`, 1, EXPECTED_SUBSYSTEMS);
      if (numbers.has(n)) bad(`duplicate subsystem number: ${n}`);
      numbers.add(n);
    }
  }
  for (let n = 1; n <= EXPECTED_SUBSYSTEMS; n++) if (!numbers.has(n)) bad("subsystem numbers must be exactly 1..67");
  for (const c of subs) {
    const name = c.container, deps = c.deps ?? [];
    if (!Array.isArray(deps)) bad(`${name}.deps must be a list`);
    if (new Set(deps).size !== deps.length) bad(`${name}.deps contains duplicates`);
    if (deps.includes(c.number)) bad(`${name} must not depend on itself`);
    for (const dep of deps) { requireInt(dep, `${name}.deps[]`, 1, EXPECTED_SUBSYSTEMS); if (!numbers.has(dep)) bad(`${name} depends on unknown subsystem ${dep}`); }
    validateCellTables(c, name, false);
  }
  const cp = cps[0];
  if (requireInt(cp.number, `${cp.container}.number`, 0, 0) !== 0) bad("control_plane.number must be 0");
  if (!deepEq(cp.deps ?? [], [])) bad("control_plane.deps must be empty because the companion executor does not gate control-plane release");
  validateCellTables(cp, cp.container, true);
  const a = auth[0], adeps = a.deps ?? [];
  if (!Array.isArray(adeps) || !adeps.length) bad("authority_minivm.deps must name at least one subsystem gate");
  if (new Set(adeps).size !== adeps.length) bad("authority_minivm.deps contains duplicates");
  for (const dep of adeps) { requireInt(dep, "authority_minivm.deps[]", 1, EXPECTED_SUBSYSTEMS); if (!numbers.has(dep)) bad(`authority_minivm depends on unknown subsystem ${dep}`); }
  if (!deepEq(a.agents, AGENTS)) bad("authority_minivm.agents must exactly match the 14-agent canonical order");
  validateLegacyPolicy(a.policy, "authority_minivm.policy");
}

export function parseQ(value, label) {
  if (typeof value !== "string" || !RATIONAL.test(value)) bad(`${label} must be a non-negative rational string such as "97/6"`);
  const [n, d = "1"] = value.split("/"); const x = Q.of(n, d);
  if (x.toString() !== value) bad(`${label} must be written in lowest terms (${x} expected)`);
  return x;
}

/* ------------------------------------------------------------------ policy derivation (calibration) */
export function deriveAuthorityPolicy(legacy, { idleForgetting = DEFAULT_IDLE_FORGETTING, reliabilityDecay = DEFAULT_RELIABILITY_DECAY, reliabilityHold = DEFAULT_RELIABILITY_HOLD } = {}) {
  const lo = legacy.min_score, hi = legacy.max_score, init = legacy.initial_score, scale = hi - lo;
  if (scale <= 0) bad("authority policy needs max_score > min_score");
  const m = Q.of(init - lo, scale);
  if (!(m.gt(0) && m.lt(1))) bad("authority policy needs min_score < initial_score < max_score");
  const stepC = legacy.growth_per_commit;
  if (stepC <= 0) bad("growth_per_commit must be positive to calibrate the prior strength");
  const n0 = Q.ONE.sub(m).mul(scale).div(stepC).sub(1);
  if (n0.le(0)) bad("growth_per_commit is too large to calibrate a positive prior strength");
  const wSuccess = (step, key) => { const den = Q.ONE.sub(m).mul(scale).sub(step); if (step <= 0 || den.le(0)) bad(`${key} cannot be calibrated as success evidence`); return n0.mul(step).div(den); };
  const wFailure = (step, key) => { const den = m.mul(scale).sub(step); if (step <= 0 || den.le(0)) bad(`${key} cannot be calibrated as failure evidence`); return n0.mul(step).div(den); };
  const weights = {
    commit: wSuccess(stepC, "growth_per_commit"), denial: wFailure(legacy.decay_per_denial, "decay_per_denial"),
    fault: wFailure(legacy.fault_decay, "fault_decay"), gate_pass: wSuccess(legacy.gate_pass_growth, "gate_pass_growth"),
    gate_fail: wFailure(legacy.gate_fail_decay, "gate_fail_decay"),
  };
  if (!weights.commit.eq(1)) bad("internal calibration error: commit weight must be exactly 1");
  const rhoExpand = Q.ONE.sub(reliabilityDecay.pow(legacy.flawless_streak_for_expansion));
  return {
    policy_version: AUTHORITY_POLICY_VERSION, score_scale: scale, prior_mean: qs(m), prior_strength: qs(n0),
    prior_alpha: qs(n0.mul(m)), prior_beta: qs(n0.mul(Q.ONE.sub(m))),
    evidence_weights: Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, qs(v)])),
    idle_forgetting: qs(idleForgetting), reliability_decay: qs(reliabilityDecay),
    reliability_expand_at_least: qs(rhoExpand), reliability_hold_at_least: qs(reliabilityHold),
    thresholds: { ...legacy.thresholds },
  };
}

// E3 calibration certificate: idle ticks needed to fall from expand_above to expand_hold_above.
export function idleHoldTime(policy) {
  const n0 = parseQ(policy.prior_strength, "policy.prior_strength"), a0 = parseQ(policy.prior_alpha, "policy.prior_alpha");
  const delta = parseQ(policy.idle_forgetting, "policy.idle_forgetting"), scale = policy.score_scale, th = policy.thresholds;
  const excess = (theta) => { const t = Q.of(theta, scale); return t.mul(n0).sub(a0).div(Q.ONE.sub(t)); };
  const ratio = excess(th.expand_hold_above).div(excess(th.expand_above)).toNumber();
  return [Math.log(ratio) / Math.log(delta.toNumber()), ratio];
}

export function validateAuthorityPolicy(policy, legacy) {
  if (!isMap(policy)) bad("policy must be an object");
  if (!sameKeys(policy, AUTHORITY_POLICY_KEYS)) bad(`rails policy keys must match the contract; ${keyDiff(policy, AUTHORITY_POLICY_KEYS)}`);
  if (policy.policy_version !== AUTHORITY_POLICY_VERSION) bad(`policy.policy_version must be ${AUTHORITY_POLICY_VERSION}`);
  if (!isMap(policy.evidence_weights) || !sameKeys(policy.evidence_weights, EVIDENCE_KEYS)) bad(`policy.evidence_weights must have exactly ${JSON.stringify([...EVIDENCE_KEYS].sort())}`);
  const delta = parseQ(policy.idle_forgetting, "policy.idle_forgetting"), rdec = parseQ(policy.reliability_decay, "policy.reliability_decay");
  const rhold = parseQ(policy.reliability_hold_at_least, "policy.reliability_hold_at_least");
  if (!(delta.gt(0) && delta.lt(1))) bad("policy.idle_forgetting must lie strictly between 0 and 1");
  if (!(rdec.gt(0) && rdec.lt(1))) bad("policy.reliability_decay must lie strictly between 0 and 1");
  const expected = deriveAuthorityPolicy(legacy, { idleForgetting: delta, reliabilityDecay: rdec, reliabilityHold: rhold });
  for (const key of [...AUTHORITY_POLICY_KEYS].sort())
    if (!deepEq(policy[key], expected[key])) bad(`rails policy ${key} is not the exact calibration of the manifest policy: expected ${JSON.stringify(expected[key])}, found ${JSON.stringify(policy[key])}`);
  const rex = parseQ(policy.reliability_expand_at_least, "policy.reliability_expand_at_least");
  if (!(rdec.lt(rhold) && rhold.le(rex))) bad("reliability thresholds need decay < hold <= expand so one dirty tick ends expansion");
  const [railsTicks] = idleHoldTime(policy), th = legacy.thresholds;
  const legacyTicks = (th.expand_above - th.expand_hold_above) / legacy.idle_decay;
  if (Math.abs(railsTicks - legacyTicks) > HOLD_TIME_TOLERANCE_TICKS) bad(`idle_forgetting is not calibrated: expansion hold time ${railsTicks.toFixed(3)} idle ticks vs historical ${legacyTicks.toFixed(3)}`);
  return {
    scale: policy.score_scale, lo: legacy.min_score,
    n0: parseQ(policy.prior_strength, "policy.prior_strength"), a0: parseQ(policy.prior_alpha, "policy.prior_alpha"),
    b0: parseQ(policy.prior_beta, "policy.prior_beta"),
    w: Object.fromEntries(Object.entries(policy.evidence_weights).map(([k, v]) => [k, parseQ(v, `policy.evidence_weights.${k}`)])),
    delta, rdec, rex, rhold, th: { ...policy.thresholds },
  };
}

export function validateMeshPolicy(mesh) {
  if (!isMap(mesh) || !sameKeys(mesh, MESH_POLICY_KEYS)) bad(`mesh_policy keys must be exactly ${JSON.stringify([...MESH_POLICY_KEYS].sort())}`);
  if (mesh.policy_version !== MESH_POLICY_VERSION) bad(`mesh_policy.policy_version must be ${MESH_POLICY_VERSION}`);
  const k = requireInt(mesh.release_capacity, "mesh_policy.release_capacity", 1, EXPECTED_SUBSYSTEMS);
  const gamma = parseQ(mesh.planning_discount, "mesh_policy.planning_discount");
  if (!(gamma.gt(0) && gamma.lt(1))) bad("mesh_policy.planning_discount must lie strictly between 0 and 1");
  return [k, gamma];
}

function validateEventRows(workload, ticks) {
  const want = ticks.map(String);
  for (const section of ["inputs", "verdicts"]) if (!isMap(workload[section]) || !sameKeys(workload[section], want)) bad(`workload.${section} keys must exactly match ticks`);
  for (const key of want) {
    const rows = workload.inputs[key];
    if (!Array.isArray(rows) || rows.length !== AGENTS.length) bad(`inputs[${key}] must contain exactly ${AGENTS.length} agent rows`);
    rows.forEach((row, i) => {
      if (!Array.isArray(row) || row.length !== 4) bad(`inputs[${key}][${i}] must be [intents, commits, denials, flags]`);
      const [it, co, de, fl] = row.map((v, j) => requireInt(v, `inputs[${key}][${i}][${j}]`, 0, 255));
      if (co + de > it) bad(`inputs[${key}][${i}] commits+denials must not exceed intents`);
      if (fl & ~F_ALL) bad(`inputs[${key}][${i}].flags contains undefined bits: 0x${fl.toString(16).padStart(2, "0")}`);
    });
    const verdicts = workload.verdicts[key];
    if (!Array.isArray(verdicts) || verdicts.length > MAX_VERDICTS_PER_TICK) bad(`verdicts[${key}] must be a list with at most ${MAX_VERDICTS_PER_TICK} rows`);
    verdicts.forEach((row, i) => {
      if (!Array.isArray(row) || row.length !== 4) bad(`verdicts[${key}][${i}] must be [agent_index, result, weight, gate]`);
      requireInt(row[0], `verdicts[${key}][${i}].agent_index`, 0, AGENTS.length - 1);
      requireInt(row[1], `verdicts[${key}][${i}].result`, 1, 2);
      requireInt(row[2], `verdicts[${key}][${i}].weight`, 1, 255);
      requireInt(row[3], `verdicts[${key}][${i}].gate`, 0, 255);
    });
  }
}

function validateRailsOracle(workload, ticks) {
  const oracle = workload.oracle;
  if (!isMap(oracle) || !sameKeys(oracle, ticks.map(String))) bad("workload.oracle keys must exactly match ticks");
  for (const tick of ticks) {
    const states = oracle[String(tick)];
    if (!isMap(states) || !sameKeys(states, AGENTS)) bad(`oracle[${tick}] must contain exactly the canonical 14 agents`);
    for (const name of AGENTS) {
      const st = states[name];
      if (!isMap(st) || !sameKeys(st, ORACLE_FIELDS)) bad(`oracle[${tick}][${name}] must have exactly ${JSON.stringify(ORACLE_FIELDS)}`);
      for (const k of ["alpha", "beta", "reliability"]) parseQ(st[k], `oracle[${tick}][${name}].${k}`);
      requireInt(st.score, `oracle[${tick}][${name}].score`, 0, 65535);
      if (!LEVELS.includes(st.level)) bad(`oracle[${tick}][${name}].level is invalid`);
      if (!LIFECYCLES.has(st.lifecycle)) bad(`oracle[${tick}][${name}].lifecycle is invalid`);
    }
  }
}

export function validateRailsWorkload(workload) {
  if (!isMap(workload)) bad("workload must be an object");
  if (!sameKeys(workload, RAILS_WORKLOAD_KEYS)) bad(`rails workload keys must match the contract; ${keyDiff(workload, RAILS_WORKLOAD_KEYS)}`);
  if (workload.schema !== RAILS_WORKLOAD_SCHEMA) bad(`workload.schema must be ${RAILS_WORKLOAD_SCHEMA}`);
  for (const k of ["source_workload_sha256", "source_trace_sha256", "source_telemetry_sha256"]) requireSha256(workload[k], `workload.${k}`);
  const ticks = workload.ticks;
  if (!Array.isArray(ticks) || !ticks.length) bad("workload.ticks must be a non-empty list");
  const norm = ticks.map((t, i) => requireInt(t, `workload.ticks[${i}]`, 1));
  if (!norm.every((t, i) => t === i + 1)) bad("workload.ticks must be the contiguous canonical range 1..N");
  validateEventRows(workload, norm);
  validateRailsOracle(workload, norm);
  validateMeshPolicy(workload.mesh_policy);
  return norm;
}

export function validateRailsContract(manifest, workload) {
  validateManifest(manifest);
  validateRailsWorkload(workload);
  return validateAuthorityPolicy(workload.policy, manifest.cells.find((c) => c.kind === "authority_minivm").policy);
}

/* ------------------------------------------------------------------ E14 planning value, E16, E17 */
export function planningValues(subs, gamma) {
  const nums = [...subs.keys()].sort((a, b) => a - b), pos = new Map(nums.map((n, i) => [n, i])), size = nums.length;
  const mat = nums.map((_, i) => [...nums.map((__, j) => (i === j ? Q.ONE : Q.ZERO)), Q.ONE]);
  for (const c of subs.values()) { const j = pos.get(c.number); for (const d of c.deps ?? []) mat[pos.get(d)][j] = mat[pos.get(d)][j].sub(gamma); }
  for (let col = 0; col < size; col++) {
    let piv = -1; for (let r = col; r < size; r++) if (!mat[r][col].isZero()) { piv = r; break; }
    if (piv < 0) throw new RailsCertificateError("planning system I - gamma*A is singular");
    [mat[col], mat[piv]] = [mat[piv], mat[col]];
    const inv = mat[col][col].inv(); mat[col] = mat[col].map((x) => x.mul(inv));
    const prow = mat[col];
    for (let r = 0; r < size; r++) {
      if (r === col || mat[r][col].isZero()) continue;
      const f = mat[r][col], row = mat[r];
      mat[r] = row.map((a, j) => (prow[j].isZero() ? a : a.sub(f.mul(prow[j]))));
    }
  }
  const values = new Map(nums.map((n) => [n, mat[pos.get(n)][size]]));
  for (const c of subs.values()) {
    const n = c.number; let acc = Q.ZERO;
    for (const x of subs.values()) if ((x.deps ?? []).includes(n)) acc = acc.add(values.get(x.number));
    if (!values.get(n).sub(gamma.mul(acc)).eq(1)) throw new RailsCertificateError(`planning value residual is non-zero at subsystem ${n}`);
  }
  const vals = [...values.values()];
  const vmin = vals.reduce((a, b) => (b.lt(a) ? b : a)), vmax = vals.reduce((a, b) => (b.gt(a) ? b : a));
  if (vmin.le(0)) throw new RailsCertificateError("planning values must be positive for a convergent Neumann series");
  const bound = vals.map((v) => v.sub(1).div(v)).reduce((a, b) => (b.gt(a) ? b : a));
  if (bound.ge(1)) throw new RailsCertificateError("Collatz-Wielandt bound does not certify rho(gamma*A) < 1");
  const cert = {
    rule: "E14: v = (I - gamma A)^-1 1 solved exactly; v > 0 and max (v_i - 1)/v_i < 1 bound rho(gamma A)",
    planning_discount: qs(gamma), spectral_radius_bound: pyFixed6(bound), min_value: pyFixed6(vmin), max_value: pyFixed6(vmax),
  };
  return [values, cert, bound];
}

// Tarjan strongly connected components that contain a cycle (simmy_unity_model.dependency_cycles).
export function dependencyCycles(cells) {
  const subs = new Map(cells.filter((c) => c.kind === "subsystem").map((c) => [c.number, c]));
  let index = 0; const stack = [], onStack = new Set(), indices = new Map(), low = new Map(), comps = [];
  const strong = (v) => {
    indices.set(v, index); low.set(v, index); index++; stack.push(v); onStack.add(v);
    for (const w of subs.get(v).deps ?? []) {
      if (!indices.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), indices.get(w)));
    }
    if (low.get(v) === indices.get(v)) {
      const comp = []; for (;;) { const w = stack.pop(); onStack.delete(w); comp.push(w); if (w === v) break; }
      comps.push(comp.sort((a, b) => a - b));
    }
  };
  for (const n of [...subs.keys()].sort((a, b) => a - b)) if (!indices.has(n)) strong(n);
  return comps.filter((c) => c.length > 1 || (subs.get(c[0]).deps ?? []).includes(c[0])).sort((x, y) => x[0] - y[0] || x.length - y.length);
}

export function cycleCertificates(cells) {
  const subs = new Map(cells.filter((c) => c.kind === "subsystem").map((c) => [c.number, c]));
  return dependencyCycles(cells).map((comp) => {
    const members = new Set(comp), start = comp[0], path = [start], seen = new Set([start]);
    const dfs = (node) => {
      for (const d of [...(subs.get(node).deps ?? [])].sort((a, b) => a - b)) {
        if (d === start && path.length >= 1) return [...path];
        if (members.has(d) && !seen.has(d)) {
          seen.add(d); path.push(d);
          const found = dfs(d); if (found) return found;
          path.pop();
        }
      }
      return null;
    };
    const witness = dfs(start);
    if (!witness) throw new RailsCertificateError(`no cycle witness found in component ${JSON.stringify(comp)}`);
    const k = witness.length;
    return { component: comp, cycle: [...witness, start], certificate: `summing t(next) - t(node) <= -1 over the ${k} edges gives 0 <= -${k}: the claims are inconsistent` };
  });
}

export function componentCount(subs) {
  const adj = new Map([...subs.keys()].map((n) => [n, new Set()]));
  for (const c of subs.values()) for (const d of c.deps ?? []) { adj.get(c.number).add(d); adj.get(d).add(c.number); }
  const seen = new Set(); let comps = 0;
  for (const n of [...subs.keys()].sort((a, b) => a - b)) {
    if (seen.has(n)) continue; comps++;
    const st = [n];
    while (st.length) { const x = st.pop(); if (seen.has(x)) continue; seen.add(x); for (const y of adj.get(x)) if (!seen.has(y)) st.push(y); }
  }
  return comps;
}

/* ------------------------------------------------------------------ E1 admission */
export function readiness(subs, n, released) {
  const deps = subs.get(n).deps ?? [];
  if (!deps.length) return Q.ONE;
  return Q.of(deps.filter((d) => released.has(d)).length, deps.length);
}

const keyCmp = (x, y) => x[0].cmp(y[0]) || x[1].cmp(y[1]) || x[2] - y[2];
export function admit(subs, released, values, capacity) {
  const cand = [...subs.keys()].sort((a, b) => a - b).filter((n) => !released.has(n));
  const keyed = cand.map((n) => [readiness(subs, n, released), values.get(n), -n]).sort((a, b) => keyCmp(b, a));
  const take = keyed.slice(0, capacity), rest = keyed.slice(capacity), nu = rest.length ? rest[0] : null;
  if (nu && take.some((k) => keyCmp(k, nu) < 0)) throw new RailsCertificateError("E1 admission certificate failed: an admitted key is below the slot price");
  const admitted = take.map((k) => -k[2]);
  return [admitted, {
    admitted, readiness: take.map((k) => qs(k[0])), bootstrap: take.map((k) => k[0].lt(1)),
    slot_price: nu ? { subsystem: -nu[2], readiness: qs(nu[0]) } : null,
  }];
}

/* ------------------------------------------------------------------ E20 cell dynamics */
export function latticeFold(indices, values) {
  let seen = 0;
  for (const i of indices) { const c = values[i]; if (c === CODE_NOT_RUN) seen |= 1; else if (c === CODE_FAIL) seen |= 2; else if (c === CODE_BLOCKED) seen |= 4; }
  return seen & 2 ? CODE_FAIL : seen & 4 ? CODE_BLOCKED : seen & 1 ? CODE_NOT_RUN : CODE_PASS;
}
export function countFold(indices, values) {
  let fail = 0, blocked = 0, notRun = 0;
  for (const i of indices) { const c = values[i]; if (c === CODE_FAIL) fail++; else if (c === CODE_BLOCKED) blocked++; else if (c === CODE_NOT_RUN) notRun++; }
  return fail > 0 ? CODE_FAIL : blocked > 0 ? CODE_BLOCKED : notRun > 0 ? CODE_NOT_RUN : CODE_PASS;
}
export class FoldAudit {
  constructor() { this.checks = 0; }
  fold(indices, values) {
    const a = countFold(indices, values), b = latticeFold(indices, values); this.checks++;
    if (a !== b) throw new RailsCertificateError(`E20 count fold ${a} disagrees with the lattice fold ${b}`);
    return a;
  }
}

const cellRaw = (s) => ({ tick: s.tick, cursor: s.cursor, waited: s.waited, deps_seen: s.deps_seen, maturity_code: s.maturity_code, pass_votes: s.pass_votes,
  census_verified: s.census_verified, phases: s.phases, gates: s.gates, scenarios: s.scenarios, votes: s.votes });
export function genesisCell() {
  const s = { tick: 0, cursor: 0, waited: 0, deps_seen: 0, maturity_code: 0, pass_votes: 0, census_verified: 0,
    phases: new Array(24).fill(0), gates: new Array(8).fill(0), scenarios: new Array(6).fill(0), votes: new Array(13).fill(0), digest: "" };
  s.digest = canonicalDigest(cellRaw(s));
  return s;
}

export function tickCellRails(spec, state, unready, released, census, audit) {
  const s = { ...state, phases: [...state.phases], gates: [...state.gates], scenarios: [...state.scenarios], votes: [...state.votes] };
  const prev = s.digest ?? "", deps = spec.deps ?? [];
  s.tick += 1;
  s.deps_seen = deps.length - unready;
  if (s.cursor < N_PHASES && released) {
    const gated = deps.length > 0 && s.cursor >= 6;
    if (!gated || unready === 0) { s.phases[s.cursor] = spec.target_codes[s.cursor]; s.cursor += 1; } // E20: zero unready deps
    else s.waited += 1;
  }
  const ag = [...spec.gate_lists, ...spec.scenario_lists].map((x) => audit.fold(x, s.phases));
  s.gates = ag.slice(0, N_GATES); s.scenarios = ag.slice(N_GATES);
  const voteSrc = spec.vote_source === "phases" ? s.phases : ag;
  s.votes = spec.node_lists.map((x) => audit.fold(x, voteSrc));
  s.pass_votes = s.votes.filter((x) => x === CODE_PASS).length;
  const censusLen = spec.census_len ?? 0;
  s.census_verified = census.slice(0, censusLen).filter((x) => x >= MAT_VERIFIED).length;
  const gatesPass = s.gates.filter((x) => x === CODE_PASS).length, gatesFail = s.gates.filter((x) => x === CODE_FAIL).length;
  const aggPass = ag.filter((x) => x === CODE_PASS).length;
  let m = MAT_NOT_IMPLEMENTED;
  if (s.cursor >= 1) {
    m = MAT_SCAFFOLDED;
    if (s.cursor >= 5 && s.phases[4] === CODE_PASS) {
      m = MAT_DEV_FUNCTIONAL;
      if (gatesPass === N_GATES && s.pass_votes >= VOTE_QUORUM && s.census_verified === censusLen) {
        m = MAT_VERIFIED;
        if (s.cursor === N_PHASES && aggPass === N_GATES + N_SCN) m = MAT_OPERATIONAL;
      }
    }
  }
  if (gatesFail) m = MAT_BLOCKED;
  const cap = spec.maturity_cap === "OPERATIONAL" ? MAT_OPERATIONAL : MAT_VERIFIED;
  if (m > cap && m !== MAT_BLOCKED) m = cap;
  s.maturity_code = m;
  s.digest = canonicalDigest(cellRaw(s), prev);
  return s;
}

export function decodeCell(s) {
  return { tick: s.tick, cursor: s.cursor, waited: s.waited, deps_seen: s.deps_seen, maturity: MATURITY_NAMES[s.maturity_code],
    pass_votes: s.pass_votes, census_verified: s.census_verified, digest: s.digest, phases: s.phases.map((x) => RESULT_NAMES[x]),
    gates: s.gates.map((x) => RESULT_NAMES[x]), scenarios: s.scenarios.map((x) => RESULT_NAMES[x]), votes: s.votes.map((x) => VOTE_NAMES[x]) };
}
export function decodeCellRails(spec, s) {
  const out = decodeCell(s), censusLen = spec.census_len ?? 0;
  out.e20_margins = { unready_dependencies: (spec.deps ?? []).length - s.deps_seen, gate_deficit: N_GATES - s.gates.filter((x) => x === CODE_PASS).length,
    quorum_margin: s.pass_votes - VOTE_QUORUM, census_deficit: censusLen - s.census_verified };
  return out;
}

/* ------------------------------------------------------------------ E6/E3/E2/E15/E20 authority dynamics */
export const scoreOf = (alpha, beta, p) => alpha.mul(p.scale).div(alpha.add(beta)).add(p.lo); // E6 posterior mean, no clamp

export function nextLevelRails(level, s, rel, p) {
  const th = p.th;
  if (level === 0) return s.ge(th.restore_from_suspend_above) ? 1 : 0;
  if (level === 1) { if (s.lt(th.suspend_below)) return 0; return s.ge(th.restore_nominal_above) ? 2 : 1; }
  if (level === 2) { if (s.lt(th.restrict_below)) return 1; return s.ge(th.expand_above) && rel.ge(p.rex) ? 3 : 2; }
  if (s.lt(th.restrict_below)) return 1;
  if (s.lt(th.expand_hold_above) || rel.lt(p.rhold)) return 2;
  return 3;
}
export function settleLevel(level, s, rel, p) {
  let steps = 0;
  for (let i = 0; i < LEVELS.length + 1; i++) { const nx = nextLevelRails(level, s, rel, p); if (nx === level) return [level, steps]; level = nx; steps++; }
  throw new RailsCertificateError("hysteresis map did not reach a fixed point");
}
export function levelMargin(level, s, p) {
  const th = p.th;
  const b = [[Q.int(th.restore_from_suspend_above).sub(s)], [s.sub(th.suspend_below), Q.int(th.restore_nominal_above).sub(s)],
    [s.sub(th.restrict_below), Q.int(th.expand_above).sub(s)], [s.sub(th.expand_hold_above)]][level];
  return b.reduce((x, y) => (y.lt(x) ? y : x));
}

function serialAgent(a, p) {
  return { agent: a.agent, alpha: qs(a.alpha), beta: qs(a.beta), score: scoreOf(a.alpha, a.beta, p).floor(), reliability: qs(a.reliability),
    level_code: a.level_code, class: a.class, revision: a.revision, lifecycle: a.lifecycle };
}
function serialAuthority(s, p, withDigest = true) {
  const out = { tick: s.tick, transitions: s.transitions, commits: s.commits, denials: s.denials, verdicts: s.verdicts, faults: s.faults, mesh_tick: s.mesh_tick };
  out.agents = s.agents.map((a) => serialAgent(a, p));
  if (withDigest) out.digest = s.digest;
  return out;
}

export function genesisAuthorityRails(p, names = AGENTS) {
  const agents = names.map((name) => ({ agent: name, alpha: p.a0, beta: p.b0, reliability: Q.ZERO, level_code: 2,
    class: name.startsWith("warden") ? "MAVM" : "MiAVM", revision: 0, lifecycle: "running" }));
  const s = { tick: 0, transitions: 0, commits: 0, denials: 0, verdicts: 0, faults: 0, mesh_tick: 0, agents, digest: "" };
  s.digest = canonicalDigest(serialAuthority(s, p, false));
  return s;
}

export function tickAuthorityRails(state, meshTick, active, inputRows, verdictRows, p) {
  const s = { ...state, agents: state.agents.map((a) => ({ ...a })) };
  const prev = s.digest;
  s.tick += 1; s.mesh_tick = meshTick;
  if (active) {
    const w = p.w, n = s.agents.length;
    const evA = new Array(n).fill(Q.ZERO), evB = new Array(n).fill(Q.ZERO), clean = new Array(n).fill(null);
    const restart = new Array(n).fill(false), terminate = new Array(n).fill(false);
    s.agents.forEach((a, i) => {
      const [it, co, de, fl] = inputRows[i];
      if (a.lifecycle === "terminated") return; // E20 latch: only an explicit human release could lift it
      if (fl & F_RUNNING && it === 0) { // E3 on the idle clock: the evidence excess decays toward the prior
        a.alpha = p.a0.add(p.delta.mul(a.alpha.sub(p.a0)));
        a.beta = p.b0.add(p.delta.mul(a.beta.sub(p.b0)));
      }
      if (fl & F_FAULT) { evB[i] = evB[i].add(w.fault); a.lifecycle = "faulted"; s.faults += 1; clean[i] = 0; }
      if (fl & F_RUNNING && it > 0) {
        evA[i] = evA[i].add(w.commit.mul(co)); evB[i] = evB[i].add(w.denial.mul(de));
        s.commits += co; s.denials += de;
        if (de > 0) clean[i] = 0; else if (co > 0 && clean[i] === null) clean[i] = 1;
      }
      if (fl & F_RESTART) restart[i] = true;
      if (fl & F_MIGRATE) a.class = a.class === "MAVM" ? "MiAVM" : "MAVM";
      if (fl & F_TERMINATE) terminate[i] = true;
    });
    for (const [idx, res, weight] of verdictRows) {
      s.verdicts += 1;
      if (s.agents[idx].lifecycle === "terminated") continue;
      if (res === 1) evA[idx] = evA[idx].add(w.gate_pass.mul(weight));
      else { evB[idx] = evB[idx].add(w.gate_fail.mul(weight)); clean[idx] = 0; }
    }
    s.agents.forEach((a, i) => {
      if (a.lifecycle === "terminated") return;
      a.alpha = a.alpha.add(evA[i]); a.beta = a.beta.add(evB[i]); // E6: evidence adds in natural parameters
      if (clean[i] !== null) a.reliability = p.rdec.mul(a.reliability).add(Q.ONE.sub(p.rdec).mul(clean[i]));
      if (restart[i]) { a.lifecycle = "running"; a.reliability = Q.ZERO; }
      if (terminate[i]) { a.lifecycle = "terminated"; a.level_code = 0; a.alpha = Q.ZERO; a.beta = p.n0; a.revision = (a.revision + 1) & 255; return; }
      const [nw, steps] = settleLevel(a.level_code, scoreOf(a.alpha, a.beta, p), a.reliability, p);
      if (steps) { a.level_code = nw; a.revision = (a.revision + steps) & 255; s.transitions += steps; }
    });
  }
  for (const a of s.agents) { // E6 readout identity, checked exactly
    const tot = a.alpha.add(a.beta);
    if (tot.le(0) || !scoreOf(a.alpha, a.beta, p).mul(tot).eq(tot.mul(p.lo).add(a.alpha.mul(p.scale)))) throw new RailsCertificateError(`E6 readout identity failed for ${a.agent}`);
  }
  s.digest = canonicalDigest(serialAuthority(s, p, false), prev);
  return s;
}

export function projectAgent(a, p) {
  const sa = serialAgent(a, p);
  return { alpha: sa.alpha, beta: sa.beta, score: Number(sa.score), level: LEVELS[a.level_code], lifecycle: a.lifecycle, reliability: sa.reliability };
}
export function oracleMismatches(state, expected, p) {
  const out = [], byName = new Map(state.agents.map((a) => [a.agent, a]));
  for (const name of AGENTS) { const got = projectAgent(byName.get(name), p); for (const f of ORACLE_FIELDS) if (got[f] !== expected[name][f]) out.push([name, f, got[f], expected[name][f]]); }
  return out;
}
export function decodeAuthorityRails(s, p) {
  const agents = s.agents.map((a) => {
    const sa = serialAgent(a, p); sa.level = LEVELS[a.level_code];
    if (a.lifecycle !== "terminated") sa.level_margin = qs(levelMargin(a.level_code, scoreOf(a.alpha, a.beta, p), p));
    return sa;
  });
  return { tick: s.tick, transitions: s.transitions, commits: s.commits, denials: s.denials, verdicts: s.verdicts, faults: s.faults, mesh_tick: s.mesh_tick, digest: s.digest, agents };
}

/* ------------------------------------------------------------------ run */
function dynamicSignature(states, released, ast, p) {
  const cells = {};
  for (const [k, st] of states) { const c = cellRaw(st); delete c.tick; cells[k] = c; }
  const auth = serialAuthority(ast, p, false); delete auth.tick; delete auth.mesh_tick;
  return pyDumps({ cells, released: [...released].sort((a, b) => a - b), authority: auth });
}

// A tick-by-tick run. step() advances one mesh tick and returns what happened in it; when the state
// is an exact fixed point (E8) the run is complete and result() returns the replay object.
export class SimmyRun {
  constructor(manifest, workload, { maxTicks = 160 } = {}) {
    this.p = validateRailsContract(manifest, workload);
    requireInt(maxTicks, "max_ticks", 1); this.maxTicks = maxTicks;
    [this.capacity, this.gamma] = validateMeshPolicy(workload.mesh_policy);
    this.workload = workload; this.cells = manifest.cells;
    this.subs = new Map(this.cells.filter((c) => c.kind === "subsystem").map((c) => [c.number, c]));
    this.cp = this.cells.find((c) => c.kind === "control_plane"); this.amspec = this.cells.find((c) => c.kind === "authority_minivm");
    [this.values, this.valueCert, this.spectralBound] = planningValues(this.subs, this.gamma);
    this.contradictions = cycleCertificates(this.cells);
    this.audit = new FoldAudit();
    this.states = new Map(this.cells.filter((c) => c.kind !== "authority_minivm").map((c) => [c.container, genesisCell()]));
    this.ast = genesisAuthorityRails(this.p);
    this.releasedOrder = []; this.releasedSet = new Set(); this.admissions = [];
    this.releasedAt = new Map(this.cells.map((c) => [c.container, null]));
    this.amStart = null; this.prevSig = null; this.tickHistory = []; this.completed = false;
    this.workloadEnd = Math.max(...workload.ticks); this.authorityDeps = [...(this.amspec.deps ?? [])];
    this.oracleFields = 0; this.tick = 0;
  }
  get done() { return this.completed; }
  step() {
    if (this.completed) return null;
    if (this.tick >= this.maxTicks) throw new SimulationConvergenceError(`rails simulation did not reach an exact fixed point within max_ticks=${this.maxTicks}`);
    const tick = ++this.tick, subs = this.subs, states = this.states;
    const mats = new Map([...subs].map(([n, c]) => [n, states.get(c.container).maturity_code]));
    let admitted = [];
    if (this.releasedSet.size < subs.size) {
      let record; [admitted, record] = admit(subs, this.releasedSet, this.values, this.capacity);
      for (const n of admitted) { this.releasedSet.add(n); this.releasedOrder.push(n); }
      record.tick = tick; this.admissions.push(record);
    }
    for (const [n, c] of subs) {
      const rel = this.releasedSet.has(n);
      if (rel && this.releasedAt.get(c.container) === null) this.releasedAt.set(c.container, tick);
      const unready = (c.deps ?? []).filter((d) => !READY.has(mats.get(d))).length;
      states.set(c.container, tickCellRails(c, states.get(c.container), unready, rel, [], this.audit));
    }
    const census = [...subs.keys()].sort((a, b) => a - b).map((n) => mats.get(n));
    if (this.releasedAt.get(this.cp.container) === null) this.releasedAt.set(this.cp.container, tick);
    states.set(this.cp.container, tickCellRails(this.cp, states.get(this.cp.container), 0, true, census, this.audit));
    if (this.amStart === null && this.authorityDeps.every((d) => mats.get(d) >= MAT_DEV_FUNCTIONAL && mats.get(d) !== MAT_BLOCKED)) {
      this.amStart = tick; this.releasedAt.set(this.amspec.container, tick);
    }
    const wt = this.amStart === null ? null : tick - this.amStart + 1;
    let mismatches = [];
    if (wt !== null && wt <= this.workloadEnd) {
      this.ast = tickAuthorityRails(this.ast, tick, true, this.workload.inputs[String(wt)], this.workload.verdicts[String(wt)], this.p);
      mismatches = oracleMismatches(this.ast, this.workload.oracle[String(wt)], this.p);
      if (mismatches.length) throw new ModelValidationError(`rails authority oracle mismatch at workload tick ${wt}: ${JSON.stringify(mismatches.slice(0, 5))}`);
      this.oracleFields += AGENTS.length * ORACLE_FIELDS.length;
    } else this.ast = tickAuthorityRails(this.ast, tick, false, null, [], this.p);
    const sig = dynamicSignature(states, this.releasedOrder, this.ast, this.p);
    this.tickHistory.push({ tick, released: this.releasedSet.size, authority_workload_tick: wt });
    const allDone = this.cells.every((c) => c.kind === "authority_minivm" || states.get(c.container).cursor === N_PHASES) && wt !== null && wt > this.workloadEnd;
    if (allDone && sig === this.prevSig) this.completed = true;
    this.prevSig = sig;
    return { tick, admitted, wt, completed: this.completed };
  }
  maturity(container) { return this.states.get(container).maturity_code; }
  result() {
    if (!this.completed) throw new SimulationConvergenceError("the run has not reached its fixed point");
    const final = {};
    for (const c of this.cells) {
      final[c.container] = { kind: c.kind, released_at: this.releasedAt.get(c.container),
        final: c.kind === "authority_minivm" ? decodeAuthorityRails(this.ast, this.p) : decodeCellRails(c, this.states.get(c.container)) };
    }
    const tick = this.tick;
    return {
      schema: RAILS_RUN_SCHEMA, dynamics: "rails", final_tick: tick, authority_workload_started_at_tick: this.amStart,
      release_order: this.releasedOrder, cells: final, tick_summary: this.tickHistory,
      rails: {
        release: { rule: "E1 K-slot admission by (readiness, E14 planning value, -number)", capacity: this.capacity, planning: this.valueCert,
          admissions: this.admissions, bootstrap_admissions: this.admissions.reduce((t, r) => t + r.bootstrap.filter(Boolean).length, 0) },
        convergence: { rule: "E8: the state is an exact fixed point of the tick map", fixed_point_reached_at_tick: tick - 1, verified_at_tick: tick },
        dependency_contradictions: this.contradictions,
        integration: { rule: "E16: dim ker L of the undirected dependency graph", components: componentCount(this.subs) },
        fold_cross_checks: this.audit.checks, authority_oracle_fields_checked: this.oracleFields,
      },
      translation_digest_semantics: "SHA256 over canonical JSON state chained with previous translated digest; rationals are serialized exactly as p/q strings",
    };
  }
}

export function runSimmy(manifest, workload, opts = {}) {
  const r = new SimmyRun(manifest, workload, opts);
  while (!r.done) { const info = r.step(); opts.onTick?.(info, r); }
  return r.result();
}
// The replay file exactly as GENERATED/toolchain/run_translation.py writes it.
export const replayText = (result) => pyDumps(result, 2) + "\n";

// The fields of CELLS_MANIFEST.json the executor reads, plus titles for display.
export const MANIFEST_FIELDS = ["kind", "container", "number", "title", "deps", "target_codes", "gate_lists", "scenario_lists", "node_lists",
  "vote_source", "maturity_cap", "census_len", "agents", "policy"];
export const projectManifest = (m) => ({ schema: m.schema, cells: m.cells.map((c) => Object.fromEntries(MANIFEST_FIELDS.filter((k) => k in c).map((k) => [k, c[k]]))) });
