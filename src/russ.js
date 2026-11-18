// RUSS 1.3 tuple-executable containers for the plume pipeline (R0, R1, R2).
// Byte layout and identities follow corpus/tooling/russ_container.py (RUSSL corpus 2.0.0):
//   header  '>8sHHIQ'  magic RUSS\r\n\x1a\n, 1, 3, flags 1, manifest length
//   manifest (corpus-canonical JSON: sorted keys, compact, UTF-8)
//   records '>IQ32s' path length, data length, sha256 + path + data, sorted by path
// The .russl source and its IR come from r-templates.json; readRuss re-lowers the source with
// russl.js (the console's own RUSSL lowering) and requires the stored IR to match it.
import { WORDS, LANES, HEIGHT, WIDTH } from "./lcufa.js";
import { sha256, domainHash, canonicalJson, lowerRussl, RusslError } from "./russl.js";
import { validateDocument, SchemaMismatch } from "./schema.js";
import { SCHEMAS } from "./schemas.js";

const enc = new TextEncoder(), dec = new TextDecoder("utf-8", { fatal: true });
const MAGIC = [0x52, 0x55, 0x53, 0x53, 0x0d, 0x0a, 0x1a, 0x0a];
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const concat = (parts) => { const n = parts.reduce((s, p) => s + p.length, 0); const o = new Uint8Array(n); let c = 0; for (const p of parts) { o.set(p, c); c += p.length; } return o; };
export { sha256, domainHash, canonicalJson };

// chunky (y, x, lane) <-> planar Penteract order (c6 = lane, c7 = y, c8 = x)
export function toPlanar(chunky) {
  const out = new Uint32Array(WORDS);
  for (let c = 0; c < HEIGHT * WIDTH; c++) for (let k = 0; k < LANES; k++) out[k * HEIGHT * WIDTH + c] = chunky[c * LANES + k];
  return out;
}
export function toChunky(planar) {
  const out = new Uint32Array(WORDS);
  for (let c = 0; c < HEIGHT * WIDTH; c++) for (let k = 0; k < LANES; k++) out[c * LANES + k] = planar[k * HEIGHT * WIDTH + c];
  return out;
}
// little-endian bytes of u32 words (a plain byte copy on little-endian machines, which is all of them in practice)
const LITTLE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const leBytes = (u32) => {
  if (LITTLE) return new Uint8Array(u32.buffer.slice(u32.byteOffset, u32.byteOffset + u32.byteLength));
  const b = new Uint8Array(u32.length * 4); const v = new DataView(b.buffer); u32.forEach((x, i) => v.setUint32(i * 4, x, true)); return b;
};

export async function pyramid(planar) {
  const levels = [], red = new Uint32Array(planar.length);
  for (let j = 1; j <= 20; j++) {
    const m = (1 << j) - 1; for (let i = 0; i < planar.length; i++) red[i] = planar[i] & m;
    levels.push({ level: j, modulus: `2^${j}`, sha256: await sha256(leBytes(red)) });
  }
  return levels;
}

const FIELD_DESCRIPTOR = {
  schema: "RUSS.PenteractField/1.0", rank: 5, axes: ["c4", "c5", "c6", "c7", "c8"], shape: [1, 1, 8, 128, 128],
  sample: { kind: "scalar", dtype: "u32", endianness: "little" },
  coordinate_map: { extent: [-1, 1], singleton_anchor: 0 }, sparse: false, levels: 20, population_mapping: "identity5",
};

export async function buildRuss(templates, stage, chunky, provenance) {
  const t = templates.stages[stage];
  const planar = toPlanar(chunky);
  const levels = await pyramid(planar);
  const files = {
    "evidence/provenance.json": enc.encode(canonicalJson({ schema: "RUSS.Provenance/1.0", corpus: "RUSSL Research & Institutional Corpus 2.0.0",
      note: "Plume pipeline frame; no external authorization or empirical validation implied.", pipeline: provenance })),
    "language/main.russir.json": enc.encode(t.ir),
    "language/main.russl": enc.encode(t.source),
    "mssl/final_admission.mssl": enc.encode(templates.mssl.final_admission),
    "mssl/master_coupled_mechanics.mssl": enc.encode(templates.mssl.master_coupled_mechanics),
    "state/field.u32le": leBytes(planar),
    "state/field_descriptor.json": enc.encode(canonicalJson(FIELD_DESCRIPTOR)),
    "state/pyramid.json": enc.encode(canonicalJson({ schema: "PlumeLattice.Pyramid2/1.0", levels })),
  };
  const paths = Object.keys(files).sort();
  const payload = [];
  for (const p of paths) payload.push({ path: p, sha256: await sha256(files[p]), size: files[p].length });
  const root = await domainHash("RUSS-PAYLOAD/1.0", enc.encode(canonicalJson(payload)));
  const tuple = [
    ["identity", { format: "RUSS", version: "1.3.0", profile: "russl.penteract.corpus", media_type: "application/vnd.russ.tuple-executable" }],
    ["language", { source: "language/main.russl", ir: "language/main.russir.json", ir_id: t.ir_id }],
    ["geometry", { base: "P5", axes: ["c4", "c5", "c6", "c7", "c8"], normalized_extent: [-1, 1], field_descriptor: "state/field_descriptor.json" }],
    ["state", { model: "RUSS.PenteractField/1.0", mutation: "immutable-candidate-root", physical_backend: null }],
    ["coupling", { model: "declared-by-field-or-mssl", representation: "logical" }],
    ["mechanics", { modules: ["mssl/master_coupled_mechanics.mssl", "mssl/final_admission.mssl"], authority: "digest-bound MSSL" }],
    ["admission", { policy: "mssl/final_admission.mssl", commit_requires_independent_authorization: true }],
    ["projection", { model: "derived-view", canonical: false }],
    ["fabric", { addressing: "sha256", payload_root_sha256: root, storage_adapter: "unspecified" }],
    ["evidence", { provenance: "evidence/provenance.json", immutable: true }],
    ["execution", { model: "declarative-allowlist", arbitrary_code: false, entrypoint: "verify-resolve-evaluate-authorize-evidence" }],
  ];
  const tuple_id = "russ:sha256:" + await domainHash("RUSS-TUPLE/1.0", enc.encode(canonicalJson(tuple)));
  const manifest = { format: "RUSS.TupleExecutable", version: "1.3.0", tuple_id, tuple, payload, payload_root_sha256: root,
    hash: "sha256", container_mode: "portable", status: "plume-pipeline-candidate" };
  const raw = enc.encode(canonicalJson(manifest));
  const head = new Uint8Array(24); const hv = new DataView(head.buffer);
  head.set(MAGIC, 0); hv.setUint16(8, 1); hv.setUint16(10, 3); hv.setUint32(12, 1); hv.setBigUint64(16, BigInt(raw.length));
  const parts = [head, raw];
  for (const e of payload) {
    const p = enc.encode(e.path), rec = new Uint8Array(44), rv = new DataView(rec.buffer);
    rv.setUint32(0, p.length); rv.setBigUint64(4, BigInt(e.size));
    rec.set(e.sha256.match(/../g).map((h) => parseInt(h, 16)), 12);
    parts.push(rec, p, files[e.path]);
  }
  return { bytes: concat(parts), tuple_id, root, levels, source: t.source, unit: t.unit };
}

// Read + verify a .russ container. Mirrors russ_container.verify_bytes (RUSSL corpus 2.0.0):
// structural failures throw RussError; content findings are returned in `problems`.
// Re-lowering the .russl source to IR is left to the Python reference (Verify R files.cmd);
// here the IR is checked for integrity: its ir_id and source_sha256 must recompute.
export class RussError extends Error {}
const MAX_BYTES = 64 * 1024 * 1024, MAX_MANIFEST = 1024 * 1024, MAX_RECORDS = 1024;
const COMPONENTS = ["identity", "language", "geometry", "state", "coupling", "mechanics", "admission", "projection", "fabric", "evidence", "execution"];
const RESERVED = /^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\..*)?$/i;
function safeMember(path) {
  if (typeof path !== "string" || path.length > 1024 || !/^[A-Za-z0-9_.\-/]+$/.test(path)) throw new RussError("unsafe payload path");
  for (const part of path.split("/")) {
    if (part === "" || part === "." || part === ".." || part.endsWith(".") || part.endsWith(" ")) throw new RussError("unsafe payload path: " + path);
    if (RESERVED.test(part)) throw new RussError("Windows reserved payload path: " + path);
  }
  return path;
}
// Like rr.strict_json_loads: UTF-8, no duplicate keys, no NaN/Infinity, bounded depth and size.
function strictJson(bytes, label, maxBytes = 4194304) {
  if (bytes.length > maxBytes) throw new RussError(`${label} is larger than ${maxBytes} bytes`);
  let text; try { text = dec.decode(bytes); } catch { throw new RussError(`${label} is not UTF-8`); }
  let value; try { value = JSON.parse(text); } catch { throw new RussError(`${label} is not JSON`); }
  // duplicate-key scan over the raw text (JSON.parse silently keeps the last duplicate)
  const stack = []; let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1, str = ""; while (text[j] !== '"') { if (text[j] === "\\") { str += text.slice(j, j + 2); j += 2; } else str += text[j++]; }
      const top = stack[stack.length - 1]; let k = j + 1; while (" \t\n\r".includes(text[k])) k++;
      if (top && top.obj && text[k] === ":") { const key = JSON.parse('"' + str + '"'); if (top.keys.has(key)) throw new RussError(`${label} has a duplicate key "${key}"`); top.keys.add(key); }
      i = j + 1; continue;
    }
    if (ch === "{" || ch === "[") stack.push({ obj: ch === "{", keys: new Set() });
    else if (ch === "}" || ch === "]") stack.pop();
    i++;
  }
  // like _json_object_valid: count every value, bound depth, refuse lone surrogates and non-finite numbers
  let nodes = 0;
  const walk = (v, depth) => {
    if (++nodes > 100000 || depth > 64) throw new RussError(`${label} exceeds the JSON resource limit`);
    if (typeof v === "string") { if (!wellFormedText(v)) throw new RussError(`${label} contains invalid Unicode`); }
    else if (typeof v === "number") { if (!Number.isFinite(v)) throw new RussError(`${label} has a non-finite number`); }
    else if (Array.isArray(v)) { if (v.length + nodes > 100000) throw new RussError(`${label} exceeds the JSON resource limit`); v.forEach((x) => walk(x, depth + 1)); }
    else if (v !== null && typeof v === "object") { for (const [k, x] of Object.entries(v)) { if (!wellFormedText(k)) throw new RussError(`${label} has a key with invalid Unicode`); walk(x, depth + 1); } }
  };
  walk(value, 0);
  return value;
}
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const wellFormedText = (s) => !/[\uD800-\uDFFF]/.test(s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ""));
function schemaCheck(value, schema, label) {
  try { validateDocument(value, schema); } catch (e) { throw new RussError(`${label} does not match the corpus schema: ${e.message}`); }
}

export async function readRuss(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length > MAX_BYTES) throw new RussError("container is larger than 64 MB");
  if (bytes.length < 24 || MAGIC.some((m, i) => bytes[i] !== m)) throw new RussError("not a RUSS container (bad magic)");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.getUint16(8) !== 1 || v.getUint16(10) !== 3 || v.getUint32(12) !== 1) throw new RussError("unsupported RUSS version or flags (need 1.3, flags 1)");
  const mlen64 = v.getBigUint64(16);
  if (mlen64 === 0n || mlen64 > BigInt(MAX_MANIFEST) || 24n + mlen64 > BigInt(bytes.length)) throw new RussError("manifest length out of bounds");
  const mlen = Number(mlen64);
  const raw = bytes.subarray(24, 24 + mlen);
  const manifest = strictJson(raw, "manifest");
  if (!isObj(manifest)) throw new RussError("manifest is not an object");
  const problems = [];
  let canon; try { canon = canonicalJson(manifest); } catch (e) { throw new RussError("manifest: " + e.message); }
  if (canon !== dec.decode(raw)) throw new RussError("manifest is not corpus canonical JSON");
  if (manifest.format !== "RUSS.TupleExecutable" || manifest.version !== "1.3.0") throw new RussError("manifest format/version is not RUSS.TupleExecutable 1.3.0");
  schemaCheck(manifest, SCHEMAS.manifest, "manifest");
  const entries = manifest.payload;
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > MAX_RECORDS) throw new RussError("payload cardinality");
  let off = 24 + mlen; const files = new Map(); const observed = []; const seen = new Set();
  for (const e of entries) {
    if (!isObj(e) || Object.keys(e).sort().join() !== "path,sha256,size") throw new RussError("payload entry keys");
    const path = safeMember(e.path);
    if (seen.has(path.toLowerCase())) throw new RussError("duplicate or case-colliding payload path: " + path);
    seen.add(path.toLowerCase());
    if (!Number.isInteger(e.size) || e.size < 0 || e.size > MAX_BYTES) throw new RussError("declared payload size");
    if (typeof e.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(e.sha256)) throw new RussError("declared payload digest");
    if (off + 44 > bytes.length) throw new RussError("truncated record header");
    const pl = v.getUint32(off), dl64 = v.getBigUint64(off + 4), dg = hex(bytes.subarray(off + 12, off + 44)); off += 44;
    if (pl === 0 || pl > 1024 || dl64 !== BigInt(e.size) || off + pl + e.size > bytes.length) throw new RussError(`record bounds or declared size mismatch at ${path}`);
    let rpath; try { rpath = dec.decode(bytes.subarray(off, off + pl)); } catch { throw new RussError("record path is not UTF-8"); }
    off += pl;
    const data = bytes.subarray(off, off + e.size); off += e.size;
    const actual = await sha256(data);
    if (rpath !== path || actual !== e.sha256 || dg !== actual) throw new RussError(`record ${path}: path or digest mismatch`);
    files.set(path, data); observed.push({ path, sha256: actual, size: e.size });
  }
  const order = observed.map((o) => o.path);
  if (off !== bytes.length) throw new RussError("trailing data after the last record");
  if (order.some((p, i) => i > 0 && order[i - 1] >= p)) throw new RussError("payload records are not sorted by path");
  const root = await domainHash("RUSS-PAYLOAD/1.0", enc.encode(canonicalJson(observed)));
  if (root !== manifest.payload_root_sha256) throw new RussError("payload root mismatch");
  const tuples = manifest.tuple;
  if (!Array.isArray(tuples) || tuples.length !== 11) throw new RussError("tuple arity");
  tuples.forEach((c, i) => { if (!Array.isArray(c) || c.length !== 2 || c[0] !== COMPONENTS[i] || !isObj(c[1])) throw new RussError("tuple component ordering/type"); });
  const parts = Object.fromEntries(tuples);
  const id = parts.identity;
  if (id.format !== "RUSS" || id.version !== "1.3.0" || id.profile !== "russl.penteract.corpus" || id.media_type !== "application/vnd.russ.tuple-executable"
      || parts.geometry.base !== "P5" || parts.state.model !== "RUSS.PenteractField/1.0") throw new RussError("unsupported identity/geometry/state profile");
  let tupleJson; try { tupleJson = canonicalJson(tuples); } catch (e) { throw new RussError("tuple: " + e.message); }
  const tid = "russ:sha256:" + await domainHash("RUSS-TUPLE/1.0", enc.encode(tupleJson));
  if (tid !== manifest.tuple_id) throw new RussError("tuple id mismatch");
  if (parts.fabric.payload_root_sha256 !== root) throw new RussError("fabric payload root mismatch");
  if (parts.state.physical_backend !== null || parts.admission.commit_requires_independent_authorization !== true) throw new RussError("state/authorization boundary");
  if (parts.execution.arbitrary_code !== false) throw new RussError("execution allowlist boundary (arbitrary_code must be false)");
  const member = (p) => { safeMember(p); if (!files.has(p)) throw new RussError("missing referenced payload: " + p); return files.get(p); };
  // language: IR integrity (ids recompute from content); the Python reference also re-lowers
  const srcBytes = member(parts.language.source), irBytes = member(parts.language.ir);
  let source; try { source = dec.decode(srcBytes); } catch { throw new RussError("RUSSL source is not UTF-8"); }
  const ir = strictJson(irBytes, "IR");
  schemaCheck(ir, SCHEMAS.ir, "IR");
  if (!isObj(ir) || !Array.isArray(ir.program) || !Array.isArray(ir.mssl_bindings)) throw new RussError("IR is not a RUSSL canonical IR object");
  const { ir_id, ...rest } = ir;
  let irJson; try { irJson = canonicalJson(rest); } catch (e) { throw new RussError("IR: " + e.message); }
  if (ir_id !== "russir:sha256:" + await domainHash("RUSSIR/1.0", enc.encode(irJson)) || parts.language.ir_id !== ir_id) throw new RussError("IR id does not recompute");
  if (ir.source_sha256 !== await domainHash("RUSSL-SOURCE/1.0", enc.encode(source))) throw new RussError("IR does not belong to this .russl source");
  let lowered;
  try { lowered = await lowerRussl(source); } catch (e) { throw new RussError("RUSSL source does not validate: " + (e instanceof RusslError ? e.message : String(e))); }
  if (canonicalJson(lowered) !== canonicalJson(ir)) throw new RussError("source/IR binding mismatch: the stored IR is not the lowering of the .russl source");
  // mechanics: unique modules, each bound by digest, none unbound; admission policy bound to ADMISSION_EVAL
  const mods = parts.mechanics.modules;
  if (!Array.isArray(mods) || new Set(mods).size !== mods.length) throw new RussError("mechanics module list");
  const declared = new Set(), aliases = Object.create(null);
  for (const b of ir.mssl_bindings) {
    if (!isObj(b) || typeof b.module !== "string" || typeof b.digest !== "string") throw new RussError("MSSL binding shape");
    const mp = "mssl/" + b.module + ".mssl";
    if (!mods.includes(mp) || "sha256:" + await sha256(member(mp)) !== b.digest) throw new RussError(`MSSL binding ${b.module} does not match its digest`);
    declared.add(mp); aliases[b.alias] = mp;
  }
  if (declared.size !== mods.length || mods.some((m) => !declared.has(m))) throw new RussError("unbound mechanics module");
  const policy = parts.admission.policy;
  const admissionModules = new Set(ir.program.filter((r) => isObj(r) && r.op === "ADMISSION_EVAL" && Array.isArray(r.inputs) && r.inputs[0] in aliases).map((r) => aliases[r.inputs[0]]));
  if (!mods.includes(policy) || !admissionModules.has(policy)) throw new RussError("admission policy does not bind an ADMISSION_EVAL module");
  member(policy);
  member(parts.evidence.provenance);
  // geometry: descriptor axes = geometry axes, one FIELD_DEFINE matching the descriptor
  const fd = strictJson(member(parts.geometry.field_descriptor), "field descriptor");
  schemaCheck(fd, SCHEMAS.field, "field descriptor");
  if (!isObj(fd) || canonicalJson(parts.geometry.axes ?? null) !== canonicalJson(fd.axes ?? null) || fd.rank !== 5) throw new RussError("geometry/field mismatch");
  const defs = ir.program.filter((r) => isObj(r) && r.op === "FIELD_DEFINE");
  if (defs.length !== 1 || !isObj(defs[0].arg)) throw new RussError("golden field binding requires exactly one FIELD_DEFINE");
  const arg = defs[0].arg;
  if (typeof arg.shape !== "string" || typeof arg.axes !== "string" || canonicalJson(fd.shape) !== "[" + arg.shape + "]" || canonicalJson(fd.axes) !== canonicalJson(arg.axes.split(",")) || fd.sample?.dtype !== arg.sample)
    throw new RussError("source/field shape, axes or dtype binding mismatch");
  if (arg.shape !== "1,1,8,128,128" || arg.sample !== "u32") throw new RussError(`field is ${arg.shape} ${arg.sample}; this console reads 1,1,8,128,128 u32`);
  const fb = files.get("state/field.u32le");
  if (!fb || fb.length !== WORDS * 4) throw new RussError("container has no 8x128x128 u32 field (state/field.u32le)");
  const planar = new Uint32Array(WORDS); const fv = new DataView(fb.buffer, fb.byteOffset, fb.byteLength);
  let wide = 0;
  for (let i = 0; i < WORDS; i++) { const x = fv.getUint32(i * 4, true); if (x > 0xfffff) wide++; planar[i] = x & 0xfffff; }
  const warnings = [];
  if (wide) warnings.push(`${wide} words had bits above bit 19; they were masked to 20 bits`);
  const pyr = files.has("state/pyramid.json") ? strictJson(files.get("state/pyramid.json"), "pyramid") : null;
  if (pyr) { const again = await pyramid(planar); if (!isObj(pyr) || !Array.isArray(pyr.levels) || again.some((l, i) => l.sha256 !== pyr.levels[i]?.sha256)) problems.push("pyramid level digests do not match the field"); }
  else problems.push("no state/pyramid.json (20-layer digests)");
  const provenance = strictJson(files.get(parts.evidence.provenance), "provenance");
  return { manifest, files, chunky: toChunky(planar), tuple_id: manifest.tuple_id, root, problems, warnings, source, provenance, pyramid: pyr };
}
