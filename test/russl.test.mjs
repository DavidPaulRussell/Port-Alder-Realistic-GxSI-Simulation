// JS RUSSL lowering (src/russl.js) must agree with the Python reference on every corpus source:
// same canonical IR bytes for valid sources, same error code for invalid ones.
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { lowerRussl, canonicalJson, RusslError } from '../src/russl.js';
const corpus = process.argv[2]; if (!corpus) { console.log('usage: node test/russl.test.mjs <RUSSL-Zarr-main/corpus>'); process.exit(2); }
const py = (file) => { try { return { ir: execFileSync('python3', ['-B', '-c', `import sys;sys.path.insert(0,'${corpus}/tooling');import russl_reference as rr;sys.stdout.write(rr.canonical_json_bytes(rr.lower_russl(open(sys.argv[1],encoding='utf-8').read())).decode())`, file], { stdio: ['ignore', 'pipe', 'pipe'] }).toString() }; }
  catch (e) { const m = /RUSSL-E-[A-Z]+-[0-9]+/.exec(e.stderr.toString()); return { code: m ? m[0] : 'PY-ERROR' }; } };
const files = [];
for (const d of ['examples/source', 'tests/vectors/syntax/valid', 'tests/vectors/syntax/invalid', 'lineage']) { try { for (const f of readdirSync(`${corpus}/${d}`)) if (f.endsWith('.russl')) files.push(`${corpus}/${d}/${f}`); } catch {} }
const T = JSON.parse(readFileSync(new URL('../web/r-templates.json', import.meta.url)));
let ok = true, n = 0;
for (const f of files) {
  const want = py(f); let got;
  try { got = { ir: canonicalJson(await lowerRussl(readFileSync(f, 'utf8'))) }; } catch (e) { got = { code: e instanceof RusslError ? e.code : 'JS-CRASH ' + e.message }; }
  const pass = want.ir ? got.ir === want.ir : got.code === want.code; ok &&= pass; n++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${f.split('/corpus/')[1]}: ${want.ir ? 'same IR' : 'both ' + want.code}${pass ? '' : ` (JS ${got.code || 'IR differs'})`}`);
}
for (const st of T.stages) { const ir = canonicalJson(await lowerRussl(st.source)); const pass = ir === st.ir; ok &&= pass; n++; console.log(`${pass ? 'PASS' : 'FAIL'}  ${st.unit} template: JS lowering = stored IR`); }
// mutations of a valid source must fail identically
const base = T.stages[1].source; const muts = [['row op', base.replace('│FS│', '│ZZ│')], ['duplicate row', base.replace('L002│', 'L001│')], ['storage leak', base.replace('# Layers', '# logical/state.russ.zarr Layers')], ['bad digest', base.replace(/digest=sha256:[0-9a-f]{4}/, 'digest=sha256:zz')], ['forward dep', base.replace('C001│mechanics│CD│coupling.moore│Y001', 'C001│mechanics│CD│coupling.moore│E001')], ['control char', base.replace('# Field', '#\u0007 Field')], ['eff mismatch', base.replace('mapping=identity5│eff=derive', 'mapping=identity5│eff=read')]];
for (const [name, src] of muts) {
  const tmp = `/tmp/russl-mut-${name.replace(/\W/g, '_')}.russl`; (await import('node:fs')).writeFileSync(tmp, src);
  const want = py(tmp); let got; try { await lowerRussl(src); got = 'ACCEPTED'; } catch (e) { got = e.code || 'JS-CRASH'; }
  const pass = !want.ir && got === want.code; ok &&= pass; n++; console.log(`${pass ? 'PASS' : 'FAIL'}  mutation (${name}): Python ${want.code || 'accepted'}, JS ${got}`);
}
console.log(`\n${n} cases, ${ok ? 'all agree' : 'DISAGREEMENT'}`); process.exit(ok ? 0 : 1);
