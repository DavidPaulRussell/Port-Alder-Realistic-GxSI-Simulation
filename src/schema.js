// Port of corpus/tooling/schema_subset.py: the explicitly supported JSON Schema keyword subset.
// SPDX-License-Identifier: GPL-3.0-only
// Not a general Draft 2020-12 implementation. Unknown keywords are errors; nothing is skipped.
export class SchemaMismatch extends Error {}
const KEYWORDS = new Set(["type", "const", "enum", "required", "properties", "additionalProperties", "items", "prefixItems", "minItems", "maxItems", "uniqueItems", "minLength", "maxLength", "pattern", "minimum", "maximum", "minProperties", "maxProperties", "$defs", "$ref", "allOf", "anyOf", "oneOf", "not"]);
const ANNOTATIONS = new Set(["$schema", "$id", "title", "description", "$comment", "default", "examples"]);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const typeOf = (v, t) => ({ null: v === null, boolean: typeof v === "boolean", integer: Number.isInteger(v), number: typeof v === "number" && Number.isFinite(v),
  string: typeof v === "string", array: Array.isArray(v), object: isObj(v) })[t] ?? false;
const plen = (s) => Array.from(s).length;    // Python len() counts code points
function equal(a, b, budget) {
  if (--budget.comparisons < 0) throw new Error("schema comparison work limit");
  if ((typeof a === "boolean") !== (typeof b === "boolean")) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equal(x, b[i], budget));
  if (isObj(a) && isObj(b)) { const ka = Object.keys(a).sort(), kb = Object.keys(b).sort(); return ka.join("\0") === kb.join("\0") && ka.every((k) => equal(a[k], b[k], budget)); }
  return a === b;
}
export function checkSchema(schema, root = schema, depth = 0) {
  if (depth > 64) throw new Error("schema nesting limit");
  if (typeof schema === "boolean") return;
  if (!isObj(schema)) throw new Error("schema must be object or boolean");
  for (const k of Object.keys(schema)) if (!KEYWORDS.has(k) && !ANNOTATIONS.has(k)) throw new Error("unsupported schema keyword: " + k);
  if (own(schema, "$ref") && (typeof schema.$ref !== "string" || !schema.$ref.startsWith("#/$defs/") || !own(root.$defs || {}, schema.$ref.slice(8)))) throw new Error("only local $defs references supported");
  for (const k of ["properties", "$defs"]) if (own(schema, k)) for (const c of Object.values(schema[k])) checkSchema(c, root, depth + 1);
  for (const k of ["items", "additionalProperties", "not"]) if (own(schema, k)) checkSchema(schema[k], root, depth + 1);
  for (const k of ["prefixItems", "allOf", "anyOf", "oneOf"]) if (own(schema, k)) for (const c of schema[k]) checkSchema(c, root, depth + 1);
}
export function validate(value, schema, root = schema, path = "$", depth = 0, budget = { nodes: 100000, comparisons: 100000 }) {
  if (--budget.nodes < 0) throw new Error("instance validation work limit");
  if (depth > 64) throw new Error(path + ": instance/schema nesting limit");
  if (schema === false) throw new SchemaMismatch(path + ": forbidden");
  if (schema === true) return;
  const fail = (m) => { throw new SchemaMismatch(path + ": " + m); };
  if (own(schema, "$ref")) validate(value, root.$defs[schema.$ref.slice(8)], root, path, depth + 1, budget);
  if (own(schema, "type")) { const ts = Array.isArray(schema.type) ? schema.type : [schema.type]; if (!ts.some((t) => typeOf(value, t))) fail("type " + JSON.stringify(ts)); }
  if (own(schema, "const") && !equal(value, schema.const, budget)) fail("const mismatch");
  if (own(schema, "enum") && !schema.enum.some((x) => equal(value, x, budget))) fail("enum mismatch");
  if (isObj(value)) {
    const missing = (schema.required || []).filter((k) => !own(value, k)); if (missing.length) fail("missing keys " + missing.sort().join(","));
    for (const [k, v] of Object.entries(value)) {
      const child = schema.properties && own(schema.properties, k) ? schema.properties[k] : (own(schema, "additionalProperties") ? schema.additionalProperties : true);
      validate(v, child, root, path + "." + k, depth + 1, budget);
    }
    const n = Object.keys(value).length; if (n < (schema.minProperties ?? 0) || n > (schema.maxProperties ?? Infinity)) fail("object size");
  }
  if (Array.isArray(value)) {
    if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)) fail("array size");
    if (schema.uniqueItems) { if (value.length * (value.length - 1) / 2 > budget.comparisons) throw new Error("uniqueItems comparison work limit");
      for (let i = 0; i < value.length; i++) for (let j = 0; j < i; j++) if (equal(value[i], value[j], budget)) fail("duplicate array item"); }
    const pre = schema.prefixItems || [];
    value.forEach((v, i) => validate(v, i < pre.length ? pre[i] : (own(schema, "items") ? schema.items : true), root, `${path}[${i}]`, depth + 1, budget));
  }
  if (typeof value === "string") {
    const n = plen(value); if (n < (schema.minLength ?? 0) || n > (schema.maxLength ?? Infinity)) fail("string size");
    if (own(schema, "pattern") && !new RegExp(schema.pattern, "u").test(value)) fail("pattern mismatch");
  }
  if (typeOf(value, "number") && (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) fail("number bounds");
  for (const c of schema.allOf || []) validate(value, c, root, path, depth + 1, budget);
  for (const kw of ["anyOf", "oneOf"]) if (own(schema, kw)) {
    let count = 0; for (const c of schema[kw]) { try { validate(value, c, root, path, depth + 1, budget); count++; } catch (e) { if (!(e instanceof SchemaMismatch)) throw e; } }
    if ((kw === "anyOf" && count === 0) || (kw === "oneOf" && count !== 1)) fail(kw + " mismatch");
  }
  if (own(schema, "not")) { let matched = true; try { validate(value, schema.not, root, path, depth + 1, budget); } catch (e) { if (!(e instanceof SchemaMismatch)) throw e; matched = false; } if (matched) fail("not mismatch"); }
}
export function validateDocument(value, schema) { checkSchema(schema); validate(value, schema); }
