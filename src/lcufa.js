// LCUF-A/0.3 — the LCUF array profile (ByteFoundry virtual XPU).
// SPDX-License-Identifier: MIT OR GPL-3.0-only
//
// An LCUF-style column language whose values are whole frames: 8 lanes x 128 x 128
// words in the ring Z/p^n. It plays the role NumPy plays for Python: each row is one
// array operation that a native backend runs over the whole frame.
//
//   LCUF-A/0.3
//   module <name>
//   ring p=<prime> n=<digits>
//   frame lanes=8 height=128 width=128
//   phase | id | op | inputs | output | arg
//   init  | i1 | from2 | in | x | -
//   step  | s1 | life  | x  | lo | -
//   ...
//   final | f1 | to2   | x  | out | -
//   end
//
// Phases: init runs once, step runs n times, final runs once. `in` is the input
// frame; the program must write `out`. Names are registers; a row's output must
// differ from its inputs (the GPU cannot alias a written buffer).

export const LCUFA_LANGUAGE = "LCUF-A/0.3";
export const LANES = 8, HEIGHT = 128, WIDTH = 128, WORDS = LANES * HEIGHT * WIDTH;
export const MAX_SLOTS = 16, MAX_ROWS = 256, MAX_SOURCE_CHARS = 65536, MAX_STEPS = 100000;
export const LCUFA_COMPILER_VERSION = "0.3.2";
export const COLUMNS = ["phase", "id", "op", "inputs", "output", "arg"];

// op name -> [code, inputs, takes const arg, neighbour access, description]
export const OPS = {
  copy:  [1, 1, false, false, "copy a frame"],
  life:  [2, 1, false, true,  "Life rule on digit 0 of each lane (alive = digit 0 ≠ 0) → 0/1"],
  rot:   [3, 1, true,  false, "lane rotation: lane k takes lane (k + c) mod 8"],
  nsum:  [4, 1, false, true,  "Moore 8-neighbour sum, same lane, mod p^n"],
  sq:    [5, 1, false, false, "x² mod p^n"],
  mul:   [6, 2, false, false, "a·b mod p^n"],
  mulc:  [7, 1, true,  false, "a·c mod p^n"],
  add:   [8, 2, false, false, "a + b mod p^n"],
  addc:  [9, 1, true,  false, "a + c mod p^n"],
  orc:   [10, 1, true, false, "a ∨ c (p = 2 only)"],
  dadd:  [11, 2, false, false, "digit-wise addition mod p, no carries (XOR when p = 2)"],
  shift: [12, 1, false, false, "a·p mod p^n (moves every digit up one place)"],
  from2: [13, 1, false, false, "re-encode a 20-bit word: digit 0 = bit 0, digits 1.. = (x >> 1) mod p^(n−1)"],
  to2:   [14, 1, false, false, "decode to a 20-bit word: bit 0 = digit 0 mod 2, bits 1.. = x div p"],
  modj:  [15, 1, true,  false, "a mod p^c (pyramid level c)"],
};

export class LcufaDiagnostic extends Error {
  constructor(message, line) { super(line ? `line ${line}: ${message}` : message); this.line = line; }
}
const fail = (m, l) => { throw new LcufaDiagnostic(m, l); };
const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
// names that collide with JavaScript object machinery are not register names
const RESERVED_NAMES = new Set(["__proto__", "constructor", "prototype", "undefined", "null", "hasOwnProperty", "toString", "valueOf"]);
const isName = (h) => IDENT.test(h) && !RESERVED_NAMES.has(h);
const isPrime = (p) => { if (p < 2) return false; for (let d = 2; d * d <= p; d++) if (p % d === 0) return false; return true; };

export function parse(text) {
  if (typeof text !== "string") fail("source must be text");
  if (text.length > MAX_SOURCE_CHARS) fail(`source is longer than ${MAX_SOURCE_CHARS} characters`);
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  const next = () => { while (i < lines.length) { const raw = lines[i++]; const t = raw.trim(); if (t && !t.startsWith("#")) return [t, i]; } return [null, i]; };
  let [t, ln] = next();
  if (t !== LCUFA_LANGUAGE) fail(`first line must be ${LCUFA_LANGUAGE}`, ln);
  [t, ln] = next(); const mm = /^module ([A-Za-z_][A-Za-z0-9_.-]*)$/.exec(t || ""); if (!mm) fail("expected: module <name>", ln);
  [t, ln] = next(); const rm = /^ring p=([1-9][0-9]*) n=([1-9][0-9]*)$/.exec(t || ""); if (!rm) fail("expected: ring p=<prime> n=<digits> (decimal, no leading zeros, n ≥ 1)", ln);
  if (rm[1].length > 7 || rm[2].length > 2) fail("p or n is too large; p^n must fit in 21 bits", ln);
  const p = Number(rm[1]), n = Number(rm[2]);
  if (n < 1) fail("n must be at least 1", ln);
  if (p > 2 ** 21 || p ** n > 2 ** 21) fail(`p^n is larger than 2^21; the XPU word ring must fit in 21 bits`, ln);
  if (!isPrime(p)) fail(`p=${p} is not prime`, ln);
  if (p === 2 && n !== 20) fail("for p=2 the XPU ring is the Byte20 ring, n=20", ln);
  [t, ln] = next(); if (t !== "frame lanes=8 height=128 width=128") fail("expected: frame lanes=8 height=128 width=128", ln);
  [t, ln] = next(); if ((t || "").split("|").map((s) => s.trim()).join("|") !== COLUMNS.join("|")) fail(`expected column header: ${COLUMNS.join(" | ")}`, ln);
  const rows = []; const ids = new Set(); let ended = false; const order = { init: 0, step: 1, final: 2 }; let last = 0;
  for (;;) {
    [t, ln] = next(); if (t === null) break;
    if (t === "end") { ended = true; [t, ln] = next(); if (t !== null) fail("content after end", ln); break; }
    const cells = t.split("|").map((s) => s.trim());
    if (cells.length !== 6 || cells.some((c) => !c)) fail("a row needs six non-empty cells", ln);
    const [phase, id, op, ins, out, arg] = cells;
    if (!(phase in order)) fail(`phase must be init, step or final, not "${phase}"`, ln);
    if (order[phase] < last) fail("phases must appear in the order init, step, final", ln);
    last = order[phase];
    if (!IDENT.test(id) || ids.has(id)) fail(`row id "${id}" is invalid or repeated`, ln); ids.add(id);
    if (!(op in OPS)) fail(`unknown op "${op}"`, ln);
    const [, nin, takesC] = OPS[op];
    const inputs = ins === "-" ? [] : ins.split(",").map((s) => s.trim());
    if (inputs.length !== nin) fail(`${op} takes ${nin} input${nin > 1 ? "s" : ""}`, ln);
    for (const h of inputs) if (!isName(h)) fail(`bad or reserved input name "${h}"`, ln);
    if (!isName(out) || out === "in") fail(`bad or reserved output name "${out}"`, ln);
    if (inputs.includes(out)) fail(`output ${out} must differ from the inputs`, ln);
    let c = 0;
    if (takesC) { if (!/^[0-9]{1,10}$/.test(arg)) fail(`${op} needs a non-negative integer arg (at most 10 digits)`, ln); c = Number(arg); if (c > 0xffffffff) fail("arg too large", ln); }
    else if (arg !== "-") fail(`${op} takes no arg; write -`, ln);
    if (op === "orc" && p !== 2) fail("orc is a 2-adic operation; use p=2", ln);
    if (op === "rot" && c > 7) fail("rot arg must be 0..7", ln);
    if (op === "modj" && (c < 1 || c > n)) fail(`modj arg must be 1..${n}`, ln);
    // constants act in the ring: reduce them so every backend sees the same in-range value
    if (op === "addc" || op === "mulc" || op === "orc") c = c % p ** n;
    rows.push({ phase, id, op, inputs, output: out, c, line: ln });
  }
  if (!ended) fail("missing end");
  if (rows.length > MAX_ROWS) fail(`more than ${MAX_ROWS} rows`);
  return { language: LCUFA_LANGUAGE, module: mm[1], p, n, M: p ** n, rows };
}

// Static admission: definitions before use, `out` written, slot budget.
export function compile(text) {
  const prog = parse(text);
  // Definitions before use. A step row may read a name written earlier in the same
  // iteration, or a name that already has a value from init.
  const defined = new Set(["in"]);
  for (const ph of ["init", "step", "final"]) {
    const known = new Set(defined);
    for (const r of prog.rows.filter((x) => x.phase === ph)) {
      for (const h of r.inputs) if (!known.has(h)) fail(`${h} is read before it is written${ph === "step" ? " (a step row can only read init values or rows above it)" : ""}`, r.line);
      known.add(r.output);
    }
    known.forEach((k) => defined.add(k));
  }
  if (!defined.has("out")) fail("the program never writes out");
  const names = ["in", ...[...defined].filter((x) => x !== "in")];
  if (names.length > MAX_SLOTS) fail(`${names.length} registers; the XPU has ${MAX_SLOTS} frame slots`);
  const slot = Object.assign(Object.create(null), Object.fromEntries(names.map((nm, k) => [nm, k])));
  const code = new Uint32Array(prog.rows.length * 5);
  prog.rows.forEach((r, k) => {
    code.set([OPS[r.op][0], slot[r.output], slot[r.inputs[0]], r.inputs.length > 1 ? slot[r.inputs[1]] : 0, r.c], k * 5);
  });
  const count = (ph) => prog.rows.filter((r) => r.phase === ph).length;
  return { ...prog, slot, code, ninit: count("init"), nstep: count("step"), nfinal: count("final"), outSlot: slot.out };
}

/* ---------------- reference interpreter (independent of the C engine) ---------------- */
export function referenceRun(compiled, input, steps, rule = { birth: 1 << 3, survive: 12 }) {
  const { p, n, M } = compiled;
  const regs = new Map([["in", Uint32Array.from(input)]]);
  const mod = (x) => ((x % M) + M) % M;
  const dadd = (a, b) => { let r = 0, pw = 1; for (let i = 0; i < n; i++) { r += ((a % p + b % p) % p) * pw; pw *= p; a = Math.floor(a / p); b = Math.floor(b / p); } return r; };
  const runRow = (r) => {
    const a = regs.get(r.inputs[0]), b = regs.get(r.inputs[1]), o = new Uint32Array(WORDS), c = r.c;
    const nb = (y, x) => { const out = []; for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) if (dy || dx) out.push((((y + dy + HEIGHT) % HEIGHT) * WIDTH + ((x + dx + WIDTH) % WIDTH)) * LANES); return out; };
    switch (r.op) {
      case "copy": o.set(a); break;
      case "add": for (let i = 0; i < WORDS; i++) o[i] = mod(a[i] + b[i]); break;
      case "addc": for (let i = 0; i < WORDS; i++) o[i] = mod(a[i] + c); break;
      case "orc": for (let i = 0; i < WORDS; i++) o[i] = mod((a[i] | c) >>> 0); break;
      case "sq": for (let i = 0; i < WORDS; i++) o[i] = Number((BigInt(a[i]) * BigInt(a[i])) % BigInt(M)); break;
      case "mul": for (let i = 0; i < WORDS; i++) o[i] = Number((BigInt(a[i]) * BigInt(b[i])) % BigInt(M)); break;
      case "mulc": for (let i = 0; i < WORDS; i++) o[i] = Number((BigInt(a[i]) * BigInt(c)) % BigInt(M)); break;
      case "shift": for (let i = 0; i < WORDS; i++) o[i] = mod(a[i] * p); break;
      case "dadd": for (let i = 0; i < WORDS; i++) o[i] = p === 2 ? (a[i] ^ b[i]) >>> 0 : dadd(a[i], b[i]); break;
      case "modj": { const m = p ** c; for (let i = 0; i < WORDS; i++) o[i] = a[i] % m; break; }
      case "from2": for (let i = 0; i < WORDS; i++) o[i] = p === 2 ? mod(a[i]) : (a[i] & 1) + p * ((a[i] >>> 1) % (M / p)); break;
      case "to2": for (let i = 0; i < WORDS; i++) o[i] = p === 2 ? a[i] : (((a[i] % p) & 1) | ((Math.floor(a[i] / p) << 1) & 0xfffff)) >>> 0; break;
      case "rot": for (let cell = 0; cell < HEIGHT * WIDTH; cell++) for (let k = 0; k < LANES; k++) o[cell * LANES + k] = a[cell * LANES + ((k + c) & 7)]; break;
      case "nsum": case "life":
        for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
          const ns = nb(y, x), base = (y * WIDTH + x) * LANES;
          for (let k = 0; k < LANES; k++) {
            if (r.op === "nsum") { let s = 0; for (const q of ns) s += a[q + k]; o[base + k] = mod(s); }
            else { let live = 0; for (const q of ns) live += (a[q + k] % p) !== 0 ? 1 : 0; const alive = (a[base + k] % p) !== 0; o[base + k] = alive ? (rule.survive >> live) & 1 : (rule.birth >> live) & 1; }
          }
        }
        break;
    }
    regs.set(r.output, o);
  };
  const ph = (name) => compiled.rows.filter((r) => r.phase === name);
  ph("init").forEach(runRow);
  for (let s = 0; s < steps; s++) ph("step").forEach(runRow);
  ph("final").forEach(runRow);
  return regs.get("out");
}

/* ---------------- WGSL kernel (one generic shader, one dispatch per row) ---------------- */
export const WGSL = /* wgsl */ `
struct P { op: u32, c: u32, p: u32, n: u32, M: u32, birth: u32, survive: u32, pad: u32 };
@group(0) @binding(0) var<uniform> pr: P;
@group(0) @binding(1) var<storage, read> a: array<u32>;
@group(0) @binding(2) var<storage, read> b: array<u32>;
@group(0) @binding(3) var<storage, read_write> o: array<u32>;
const W: u32 = 128u; const H: u32 = 128u; const L: u32 = 8u;
fn modM(x: u32) -> u32 { if (pr.p == 2u) { return x & (pr.M - 1u); } return x % pr.M; }
fn mulmod(x: u32, y: u32) -> u32 {
  if (pr.p == 2u) { return (x * y) & (pr.M - 1u); }
  var r = (x * (y >> 10u)) % pr.M; r = (r << 10u) % pr.M; return (r + (x * (y & 1023u)) % pr.M) % pr.M;
}
fn dadd(x0: u32, y0: u32) -> u32 {
  if (pr.p == 2u) { return x0 ^ y0; }
  var x = x0; var y = y0; var r = 0u; var pw = 1u;
  for (var i = 0u; i < pr.n; i++) { r += ((x % pr.p + y % pr.p) % pr.p) * pw; pw *= pr.p; x /= pr.p; y /= pr.p; }
  return r;
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let cell = gid.x; if (cell >= W * H) { return; }
  let y = cell / W; let x = cell % W; let base = cell * L;
  let ym = (y + H - 1u) % H; let yp = (y + 1u) % H; let xm = (x + W - 1u) % W; let xp = (x + 1u) % W;
  var nb = array<u32, 8>((ym*W+xm)*L, (ym*W+x)*L, (ym*W+xp)*L, (y*W+xm)*L, (y*W+xp)*L, (yp*W+xm)*L, (yp*W+x)*L, (yp*W+xp)*L);
  for (var k = 0u; k < L; k++) {
    let i = base + k; let av = a[i]; var r = 0u;
    switch (pr.op) {
      case 1u: { r = av; }
      case 2u: { var live = 0u; for (var j = 0u; j < 8u; j++) { if (a[nb[j] + k] % pr.p != 0u) { live++; } }
                 if (av % pr.p != 0u) { r = (pr.survive >> live) & 1u; } else { r = (pr.birth >> live) & 1u; } }
      case 3u: { r = a[base + ((k + pr.c) & 7u)]; }
      case 4u: { var s = 0u; for (var j = 0u; j < 8u; j++) { s += a[nb[j] + k]; } r = modM(s); }
      case 5u: { r = mulmod(av, av); }
      case 6u: { r = mulmod(av, b[i]); }
      case 7u: { r = mulmod(av, pr.c % pr.M); }
      case 8u: { r = modM(av + b[i]); }
      case 9u: { r = modM(av + (pr.c % pr.M)); }
      case 10u: { r = modM(av | (pr.c % pr.M)); }
      case 11u: { r = dadd(av, b[i]); }
      case 12u: { r = mulmod(av, pr.p % pr.M); }
      case 13u: { if (pr.p == 2u) { r = modM(av); } else { r = (av & 1u) + pr.p * ((av >> 1u) % (pr.M / pr.p)); } }
      case 14u: { if (pr.p == 2u) { r = av; } else { r = ((av % pr.p) & 1u) | (((av / pr.p) << 1u) & 0xFFFFFu); } }
      case 15u: { var m = 1u; for (var t = 0u; t < min(pr.c, pr.n); t++) { m *= pr.p; } r = av % m; }
      default: { r = 0u; }
    }
    o[i] = r;
  }
}`;

/* ---------------- the two ByteFoundry stage programs ---------------- */
export const BF1_SOURCE = `LCUF-A/0.3
module bytefoundry.bf1.plume2
ring p=2 n=20
frame lanes=8 height=128 width=128
phase | id | op    | inputs | output | arg
init  | i1 | from2 | in     | x      | -
step  | s1 | life  | x      | lo     | -
step  | s2 | rot   | x      | r      | 1
step  | s3 | nsum  | r      | s      | -
step  | s4 | sq    | x      | q      | -
step  | s5 | orc   | q      | qc     | 5
step  | s6 | add   | x,qc   | t      | -
step  | s7 | dadd  | t,s    | phi    | -
step  | s8 | shift | phi    | sp     | -
step  | s9 | add   | lo,sp  | y      | -
step  | s10| copy  | y      | x      | -
final | f1 | to2   | x      | out    | -
end
`;
export const BF2_SOURCE = `LCUF-A/0.3
module bytefoundry.bf2.plume5
ring p=5 n=8
frame lanes=8 height=128 width=128
phase | id | op    | inputs | output | arg
init  | i1 | from2 | in     | x      | -
step  | s1 | life  | x      | lo     | -
step  | s2 | rot   | x      | r      | 1
step  | s3 | nsum  | r      | s      | -
step  | s4 | sq    | x      | q      | -
step  | s5 | mulc  | q      | q5     | 5
step  | s6 | add   | x,q5   | t      | -
step  | s7 | addc  | t      | t1     | 1
step  | s8 | dadd  | t1,s   | phi    | -
step  | s9 | shift | phi    | sp     | -
step  | s10| add   | lo,sp  | y      | -
step  | s11| copy  | y      | x      | -
final | f1 | to2   | x      | out    | -
end
`;
