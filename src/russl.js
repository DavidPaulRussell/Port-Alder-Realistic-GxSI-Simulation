// RUSSL/1.0 reference-profile parser and lowering, in the console's own toolchain.
// SPDX-License-Identifier: GPL-3.0-only (port of corpus/tooling/russl_reference.py, RUSSL corpus 2.0.0)
//
// parseRussl / lowerRussl follow russl_reference.parse_russl / lower_russl rule for rule, so a
// .russ container can be checked source → IR without Python. Error codes match the reference
// (RUSSL-E-PARSE-001 …). Strings are handled as Unicode code points, as Python does.

export class RusslError extends Error {
  constructor(code, message, line) { super(`${code}: ${message}${line ? ` at line ${line}` : ""}`); this.code = code; this.line = line; }
}
const fail = (code, msg, line) => { throw new RusslError(code, msg, line); };

/* ---------- shared hashing + canonical JSON (also used by russ.js) ---------- */
const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export const sha256 = async (bytes) => hex(await crypto.subtle.digest("SHA-256", bytes));
export async function domainHash(domain, payload) {
  const tag = enc.encode(domain), out = new Uint8Array(tag.length + 1 + payload.length);
  out.set(tag, 0); out[tag.length] = 0; out.set(payload, tag.length + 1); return sha256(out);
}
// Python sorts keys by code point; JS sorts strings by UTF-16 unit, so compare code points here.
const byCodePoint = (a, b) => { const x = [...a], y = [...b]; for (let i = 0; i < Math.min(x.length, y.length); i++) { const d = x[i].codePointAt(0) - y[i].codePointAt(0); if (d) return d; } return x.length - y.length; };
// json.dumps(sort_keys=True, separators=(',',':'), ensure_ascii=False) for the value set used here
export function canonicalJson(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "[" + v.map(canonicalJson).join(",") + "]";
  if (typeof v === "object") return "{" + Object.keys(v).sort(byCodePoint).map((k) => JSON.stringify(k) + ":" + canonicalJson(v[k])).join(",") + "}";
  if (typeof v === "number" && !Number.isSafeInteger(v)) throw new Error("only safe integers are used in these manifests");
  if (typeof v !== "number" && typeof v !== "string" && typeof v !== "boolean") throw new Error("unsupported JSON value");
  return JSON.stringify(v);
}

/* ---------- reference profile tables ---------- */
const OPERATORS = { SOURCE_BIND: ["DECL", "source_binding", "read"], CONST: ["DECL", "constant", "read"], FIELD_DEFINE: ["FIELD", "field_descriptor", "derive"], FIELD_POPULATE: ["FIELD", "field_candidate", "derive"], FIELD_SLICE: ["FIELD", "field_slice", "derive"], FIELD_REGION: ["FIELD", "field_region", "derive"], PYRAMID_DEFINE: ["FIELD", "multiresolution_descriptor", "derive"], COUPLING_DEFINE: ["MECHANICS", "coupling_descriptor", "derive"], MSSL_EVAL: ["MECHANICS", "mssl_result", "derive"], MECHANICS_STEP: ["MECHANICS", "mechanics_state", "derive"], ADMISSION_EVAL: ["ADMISSION", "admission_disposition", "derive"], PROJECT: ["PROJECTION", "projection", "project"], VERIFY_SOURCE: ["VERIFY", "verification", "read"], VERIFY_MSSL: ["VERIFY", "verification", "read"], VERIFY_TUPLE: ["VERIFY", "verification", "read"], VERIFY_EVIDENCE: ["VERIFY", "verification", "read"], HASH: ["EVIDENCE", "digest", "read"], EMIT_RECEIPT: ["EVIDENCE", "receipt", "write:evidence"], NODE: ["DISTRIBUTED", "node_descriptor", "read"], SHARD: ["DISTRIBUTED", "shard_descriptor", "derive"], ROUTE: ["DISTRIBUTED", "route_descriptor", "derive"], CHECKPOINT: ["FABRIC", "checkpoint", "derive"], CAS_GET: ["FABRIC", "content_fetch", "read"], CAS_PUT: ["FABRIC", "content_put", "write:state"], ROOT_BUILD: ["FABRIC", "root_descriptor", "derive"], STATE_COMMIT: ["FABRIC", "commit", "commit"], ROLLBACK: ["FABRIC", "rollback", "commit"], REPLICATE: ["FABRIC", "replication", "replicate"], PUBLISH: ["FABRIC", "publication", "publish"], ASSERT: ["CONTROL", "assertion", "read"], BARRIER: ["CONTROL", "barrier", "read"], NOP: ["CONTROL", "nop", "read"] };
const ALIASES = { SB: "SOURCE_BIND", FD: "FIELD_DEFINE", FP: "FIELD_POPULATE", FS: "FIELD_SLICE", FR: "FIELD_REGION", PY: "PYRAMID_DEFINE", CD: "COUPLING_DEFINE", ME: "MSSL_EVAL", MS: "MECHANICS_STEP", AE: "ADMISSION_EVAL", PJ: "PROJECT", VS: "VERIFY_SOURCE", VM: "VERIFY_MSSL", VT: "VERIFY_TUPLE", VE: "VERIFY_EVIDENCE", H: "HASH", ER: "EMIT_RECEIPT", CP: "CHECKPOINT", CG: "CAS_GET", CT: "CAS_PUT", RB: "ROOT_BUILD", SC: "STATE_COMMIT", RO: "ROLLBACK", RP: "REPLICATE", PB: "PUBLISH", A: "ASSERT", B: "BARRIER", N: "NOP" };
const ARG_KEYS = { SOURCE_BIND: ["media", "profile"], FIELD_DEFINE: ["shape", "sample", "axes", "sparse"], FIELD_POPULATE: ["mapping"], FIELD_SLICE: ["selector"], FIELD_REGION: ["selector"], PYRAMID_DEFINE: ["levels", "downsample", "spatial_axes"], COUPLING_DEFINE: ["neighborhood", "radius", "representation"], MSSL_EVAL: ["mode", "lab_ids", "coupling"], ADMISSION_EVAL: ["policy", "authorization"], PROJECT: ["selector", "output"], EMIT_RECEIPT: ["content_bound", "expected"], SHARD: ["partition", "count"], ROOT_BUILD: ["hash"], STATE_COMMIT: ["grant"] };
const STORAGE_LEAK = /(?:\.zarr(?:\b|\/)|ome[-_.]?zarr|zarr[-_]?v[0-9]|logical\/state\.russ\.zarr)/i;
const COLUMNS = "ID│LANE│OP│OUT│CTRL│IN│ARG│META";
const SYMBOL = /^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*$/;
const KEY = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const VERSION = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*))?$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
export const LIMITS = { source_bytes: 1048576, line_chars: 65536, cell_chars: 16384, symbol_chars: 256, rows: 10000, frames: 1024, bindings: 256, dependencies_per_row: 128, dependencies_total: 100000, structured_fields: 64 };
const CTRL_CHAR = /[\p{Cc}\p{Cf}]/u;
const cps = (s) => Array.from(s);                 // code points
const plen = (s) => cps(s).length;
const utf8len = (s) => enc.encode(s).length;
const wellFormed = (s) => !/[\uD800-\uDFFF]/.test(s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ""));

export function canonicalSource(text, maxBytes = LIMITS.source_bytes) {
  if (typeof text !== "string") fail("RUSSL-E-PARSE-001", "source must be text");
  if (!wellFormed(text)) fail("RUSSL-E-PARSE-001", "source contains invalid Unicode");
  if (plen(text) > maxBytes || utf8len(text) > maxBytes) fail("RUSSL-E-RESOURCE-001", "source byte limit");
  if (text.startsWith("﻿")) text = text.slice(1);
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").normalize("NFC");
  for (const ch of text) if ((CTRL_CHAR.test(ch) && ch !== "\n" && ch !== "\t") || ch === " " || ch === " ") fail("RUSSL-E-PARSE-001", "forbidden source controls or line separators");
  const lines = text.split("\n").map((l) => l.replace(/[ \t]+$/, ""));
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  const result = lines.join("\n") + "\n";
  if (utf8len(result) > maxBytes) fail("RUSSL-E-RESOURCE-001", "canonical source byte limit");
  return result;
}

function splitFields(text, separator) {
  const ch = cps(text), fields = []; let start = 0, quoted = false, escaped = false;
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i];
    if (quoted) { if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if ((separator === null && (c === " " || c === "\t")) || c === separator) {
      if (separator !== null || i > start) fields.push(ch.slice(start, i).join(""));
      start = i + 1;
    }
  }
  if (quoted || escaped) fail("RUSSL-E-PARSE-002", "unterminated quoted value");
  if (start < ch.length || separator !== null) fields.push(ch.slice(start).join(""));
  return fields;
}
function fieldValue(raw) {
  if (!raw) fail("RUSSL-E-PARSE-002", "empty field value");
  let value;
  if (raw.startsWith('"')) {
    try { value = JSON.parse(raw); } catch { fail("RUSSL-E-PARSE-002", "invalid quoted value"); }
    if (typeof value !== "string") fail("RUSSL-E-PARSE-002", "quoted value must be a string");
  } else {
    if (/['"\\ \t]/.test(raw)) fail("RUSSL-E-PARSE-002", "unquoted quote, escape or whitespace");
    value = raw;
  }
  if (!wellFormed(value)) fail("RUSSL-E-PARSE-001", "field value contains invalid Unicode");
  if (!value || cps(value).some((c) => CTRL_CHAR.test(c) || "│›  ".includes(c))) fail("RUSSL-E-PARSE-002", "forbidden structural characters in field value");
  return value;
}
function parseFields(text, separator, maxFields = LIMITS.structured_fields) {
  const parts = splitFields(text, separator);
  if (!parts.length || parts.length > maxFields) fail("RUSSL-E-RESOURCE-001", "structured field count");
  const result = {};
  for (const part of parts) {
    if (!part || !part.includes("=")) fail("RUSSL-E-PARSE-002", "structured field lacks key=value");
    const k = part.indexOf("="), key = part.slice(0, k), raw = part.slice(k + 1);
    if (!KEY.test(key)) fail("RUSSL-E-PARSE-002", "invalid field key");
    if (Object.prototype.hasOwnProperty.call(result, key)) fail("RUSSL-E-PARSE-002", "duplicate field key");
    result[key] = fieldValue(raw);
  }
  return result;
}
function keys(record, allowed, required = []) {
  if (Object.keys(record).some((k) => !allowed.includes(k))) fail("RUSSL-E-PARSE-002", "unknown profile field key");
  if (required.some((k) => !(k in record))) fail("RUSSL-E-PARSE-002", "missing required profile field");
}
function symbol(value, label = "symbol") {
  if (value === "_" || plen(value) > LIMITS.symbol_chars || !SYMBOL.test(value)) fail("RUSSL-E-PARSE-002", `invalid ${label}`);
}

export function parseRussl(text, rejectStorageLeak = true) {
  text = canonicalSource(text);
  if (rejectStorageLeak && STORAGE_LEAK.test(text)) fail("RUSSL-E-STORAGE-001", "storage-specific lexical leakage in core source");
  const lines = text.split("\n");
  if (lines[0] !== "RUSSL/1.0") fail("RUSSL-E-PARSE-001", "RUSSL/1.0 header required", 1);
  let unit = null, defaults = {}, defaultsSeen = false, frame = null, sawColumns = false, dependencyCount = 0;
  const mssl = [], bindings = Object.create(null), frames = [], frameIds = new Set();
  const rows = new Map(), outputs = new Map(), ancestors = new Map(), externalConsumed = new Set();
  const requiredInput = (handle, bits) => {
    if (outputs.has(handle)) { if (!((bits >> BigInt(outputs.get(handle))) & 1n)) fail("RUSSL-E-DEP-001", "input producer absent from control ancestry"); }
    else if (handle in bindings) return;
    else if (handle.startsWith("source.")) externalConsumed.add(handle);
    else fail("RUSSL-E-BIND-001", "unresolved input symbol");
  };
  for (let index = 2; index <= lines.length; index++) {
    const line = lines[index - 1];
    if (plen(line) > LIMITS.line_chars) fail("RUSSL-E-RESOURCE-001", "line character limit", index);
    if (!line || line.startsWith("#")) continue;
    const dm = /^@(unit|defaults|mssl|frame)[ \t]+(.*)$/s.exec(line);
    const directive = dm ? dm[1] : null, body = dm ? dm[2] : null;
    try {
      if (directive === "unit") {
        if (unit !== null || mssl.length || frame !== null || frames.length) fail("RUSSL-E-PARSE-001", "unit directive order or duplication");
        unit = parseFields(body, null);
        keys(unit, ["id", "version", "profile", "target", "fail"], ["id", "version", "fail"]);
        symbol(unit.id, "unit ID");
        if (!/^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/.test(unit.version)) fail("RUSSL-E-PARSE-001", "unit version requires three decimal components");
        if (unit.fail !== "closed" || (unit.profile ?? "russl.core") !== "russl.core" || (unit.target ?? "russ") !== "russ") fail("RUSSL-E-PARSE-001", "unsupported profile, target or failure policy");
      } else if (directive === "defaults") {
        if (unit === null || defaultsSeen || mssl.length || frame !== null || frames.length) fail("RUSSL-E-PARSE-001", "defaults directive order or duplication");
        defaults = parseFields(body, null);
        keys(defaults, ["mode", "regime", "effect", "scope"]);
        if ((defaults.mode ?? "deterministic") !== "deterministic" || (defaults.regime ?? "exact") !== "exact") fail("RUSSL-E-PARSE-001", "unsupported reference execution annotation");
        if ((defaults.effect ?? "read") !== "read" || (defaults.scope ?? "self") !== "self") fail("RUSSL-E-EFFECT-001", "unsupported reference default effect or scope");
        defaultsSeen = true;
      } else if (directive === "mssl") {
        if (unit === null || frame !== null || frames.length) fail("RUSSL-E-PARSE-001", "MSSL directive outside binding preamble");
        const b = parseFields(body, null);
        if (!DIGEST.test(b.digest ?? "")) fail("RUSSL-E-MSSL-001", "missing or invalid SHA-256 module digest");
        keys(b, ["alias", "module", "source_version", "digest"], ["alias", "module", "source_version", "digest"]);
        for (const k of ["alias", "module"]) symbol(b[k], `MSSL ${k}`);
        if (b.alias.startsWith("source.") || b.alias in bindings) fail("RUSSL-E-MSSL-001", "duplicate or reserved MSSL alias");
        if (!VERSION.test(b.source_version)) fail("RUSSL-E-MSSL-001", "invalid module source version");
        if (mssl.length >= LIMITS.bindings) fail("RUSSL-E-RESOURCE-001", "MSSL binding count");
        mssl.push(b); bindings[b.alias] = b;
      } else if (directive === "frame") {
        if (unit === null || frame !== null) fail("RUSSL-E-PARSE-001", "frame directive order or nesting");
        if (frames.length >= LIMITS.frames) fail("RUSSL-E-RESOURCE-001", "frame count");
        frame = parseFields(body, null);
        keys(frame, ["id", "parent", "module", "phase"], ["id", "parent", "module"]);
        for (const k of ["id", "parent", "module"]) symbol(frame[k], `frame ${k}`);
        if (frame.id === "ROOT" || frameIds.has(frame.id)) fail("RUSSL-E-PARSE-003", "duplicate or reserved frame ID");
        if (frame.parent !== "ROOT" && !frameIds.has(frame.parent)) fail("RUSSL-E-DEP-001", "unresolved frame parent");
        frame.rows = []; sawColumns = false;
      } else if (line === COLUMNS) {
        if (frame === null || sawColumns || frame.rows.length) fail("RUSSL-E-PARSE-002", "columns must occur once before frame rows");
        sawColumns = true;
      } else if (line === "@end") {
        if (frame === null || !sawColumns || !frame.rows.length) fail("RUSSL-E-PARSE-002", "empty or malformed frame terminator");
        frames.push(frame); frameIds.add(frame.id); frame = null;
      } else if (line.startsWith("@")) {
        fail("RUSSL-E-PARSE-001", "unknown directive");
      } else if (frame !== null) {
        if (!sawColumns) fail("RUSSL-E-PARSE-002", "row before columns");
        const cells = line.split("│");
        if (cells.length !== 8 || cells.some((c) => !c)) fail("RUSSL-E-PARSE-002", "eight nonempty cells required");
        if (cells.some((c) => plen(c) > LIMITS.cell_chars)) fail("RUSSL-E-RESOURCE-001", "cell character limit");
        const [rid, lane, op, out, ctrl, inp, arg, meta] = cells;
        symbol(rid, "row ID"); symbol(lane, "lane");
        if (rows.has(rid)) fail("RUSSL-E-PARSE-003", "duplicate row ID");
        if (rows.size >= LIMITS.rows) fail("RUSSL-E-RESOURCE-001", "row count");
        const norm = Object.prototype.hasOwnProperty.call(ALIASES, op) ? ALIASES[op] : op;
        if (!Object.prototype.hasOwnProperty.call(OPERATORS, norm)) fail("RUSSL-E-OP-001", "unregistered operator");
        const [face, typ, effect] = OPERATORS[norm];
        if (out === "_") { if (face !== "CONTROL") fail("RUSSL-E-BIND-001", "output required"); }
        else {
          symbol(out, "output handle");
          if (outputs.has(out) || out in bindings || externalConsumed.has(out)) fail("RUSSL-E-BIND-001", "duplicate or shadowed output handle");
          if (out.startsWith("source.") && norm !== "SOURCE_BIND") fail("RUSSL-E-BIND-001", "source namespace requires SOURCE_BIND");
        }
        const deps = ctrl === "_" ? [] : ctrl.split(",");
        if (deps.length > LIMITS.dependencies_per_row) fail("RUSSL-E-RESOURCE-001", "per-row dependency count");
        dependencyCount += deps.length;
        if (dependencyCount > LIMITS.dependencies_total) fail("RUSSL-E-RESOURCE-001", "total dependency count");
        if (new Set(deps).size !== deps.length) fail("RUSSL-E-DEP-001", "duplicate predecessor");
        let bits = 0n;
        for (const dep of deps) {
          symbol(dep, "control predecessor");
          if (!rows.has(dep)) fail("RUSSL-E-DEP-001", "predecessor must be prior row");
          bits |= ancestors.get(dep) | (1n << BigInt(rows.get(dep)));
        }
        const inputs = inp === "_" ? [] : inp.split("›");
        if (inputs.length > 2) fail("RUSSL-E-PARSE-002", "at most two primary operands");
        for (const h of inputs) { symbol(h, "input handle"); if (h === out) fail("RUSSL-E-BIND-001", "row cannot consume its own output"); requiredInput(h, bits); }
        if ((norm === "MSSL_EVAL" || norm === "ADMISSION_EVAL") && (inputs.length !== 2 || !(inputs[0] in bindings) || inputs[1] in bindings)) fail("RUSSL-E-MSSL-001", "invocation requires bound alias and data handle");
        if (!["MSSL_EVAL", "ADMISSION_EVAL", "VERIFY_MSSL"].includes(norm) && inputs.some((h) => h in bindings)) fail("RUSSL-E-MSSL-001", "module alias outside module operation");
        const args = arg === "_" ? {} : parseFields(arg, ";");
        const metaObj = meta === "_" ? {} : parseFields(meta, ";");
        keys(args, ARG_KEYS[norm] || []); keys(metaObj, ["eff", "scope", "proof"]);
        if ("eff" in metaObj && metaObj.eff !== effect) fail("RUSSL-E-EFFECT-001", "effect differs from operator effect");
        if ("scope" in metaObj && metaObj.scope !== "self") fail("RUSSL-E-EFFECT-001", "unsupported reference scope");
        if ("coupling" in args) {
          symbol(args.coupling, "coupling handle");
          if (!outputs.has(args.coupling)) fail("RUSSL-E-BIND-001", "unresolved coupling");
          requiredInput(args.coupling, bits);
        }
        frame.rows.push({ id: rid, lane, op: norm, face, type: typ, effect, out, ctrl: deps, inputs, arg: args, meta: metaObj, source_line: index });
        rows.set(rid, rows.size); ancestors.set(rid, bits);
        if (out !== "_") outputs.set(out, rows.get(rid));
      } else fail("RUSSL-E-PARSE-001", "content outside frame");
    } catch (e) {
      if (e instanceof RusslError && !e.line) { e.line = index; e.message += ` at line ${index}`; }
      throw e;
    }
  }
  if (unit === null || frame !== null || !frames.length) fail("RUSSL-E-PARSE-001", "incomplete unit");
  return { unit, defaults, mssl_bindings: mssl, frames, source: text };
}

export async function lowerRussl(text) {
  const parsed = parseRussl(text);
  const obj = { schema: "RUSSL.CanonicalIR/1.0", source_sha256: await domainHash("RUSSL-SOURCE/1.0", enc.encode(parsed.source)),
    unit: parsed.unit, defaults: parsed.defaults, mssl_bindings: parsed.mssl_bindings, frames: parsed.frames,
    program: parsed.frames.flatMap((f) => f.rows) };
  obj.ir_id = "russir:sha256:" + await domainHash("RUSSIR/1.0", enc.encode(canonicalJson(obj)));
  return obj;
}
