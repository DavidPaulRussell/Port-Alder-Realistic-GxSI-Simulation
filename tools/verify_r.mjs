// Verify .russ files with the console's own toolchain (no Python): every structural check of the
// RUSSL corpus verifier, plus re-lowering the .russl source and comparing it with the stored IR.
// usage: node tools/verify_r.mjs file.russ [file.russ ...]
import { readFileSync } from 'node:fs';
import { readRuss } from '../src/russ.js';
let bad = 0;
for (const path of process.argv.slice(2)) {
  try {
    const r = await readRuss(new Uint8Array(readFileSync(path)));
    if (r.problems.length) { bad++; console.log(`FAIL ${path}: ${r.problems.join('; ')}`); continue; }
    const p = r.provenance?.pipeline || {};
    console.log(`OK   ${path}: ${r.tuple_id} (${p.stage ?? '?'}${p.input_tuple_id ? ', input ' + p.input_tuple_id : ''})${r.warnings.length ? ' note: ' + r.warnings.join('; ') : ''}`);
  } catch (e) { bad++; console.log(`FAIL ${path}: ${e.message}`); }
}
if (!process.argv[2]) { console.log('usage: node tools/verify_r.mjs file.russ [...]'); process.exit(2); }
process.exit(bad ? 1 : 0);
