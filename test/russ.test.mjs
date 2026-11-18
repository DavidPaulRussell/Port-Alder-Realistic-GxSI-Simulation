import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { compile, BF1_SOURCE, BF2_SOURCE } from '../src/lcufa.js';
import { createWasm1T } from '../src/engines.js';
import { buildRuss, readRuss, sha256 } from '../src/russ.js';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const T = JSON.parse(readFileSync(new URL('../web/r-templates.json', import.meta.url)));
// the NumPy references (test/*.bin) are written locally, not kept in the repository: make them if they are missing
if (!existsSync(new URL('in.bin', import.meta.url))) {
  let made = false;
  for (const exe of [process.env.PYTHON, 'python3', 'python'].filter(Boolean)) { try { execFileSync(exe, ['test/ref_numpy.py'], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'ignore' }); made = existsSync(new URL('in.bin', import.meta.url)); if (made) break; } catch { /* try the next */ } }
  if (!made) { console.log('SKIP  the NumPy references are not here: run "python3 test/ref_numpy.py" from the repository folder (it needs numpy)'); process.exit(0); }
}
const input = new Uint32Array(readFileSync(new URL('in.bin', import.meta.url)).buffer.slice(0));
const w1 = await createWasm1T(readFileSync(new URL('../web/xpu.wasm', import.meta.url)));
const enc = new TextEncoder();
const bf1 = compile(BF1_SOURCE), bf2 = compile(BF2_SOURCE);
const p1 = await sha256(enc.encode(BF1_SOURCE)), p2 = await sha256(enc.encode(BF2_SOURCE));
mkdirSync('test/out', { recursive: true });
const r0 = await buildRuss(T, 0, input, { stage: 'R0', origin: 'seed', seed: 7 });
const s1 = await w1.run(bf1, input, 40);
const r1 = await buildRuss(T, 1, s1.out, { stage: 'R1', xpu: 'ByteFoundry 1', law: 'plume step mod 2^20', steps: 40, input_tuple_id: r0.tuple_id, lcuf_program_sha256: p1 });
const s2 = await w1.run(bf2, s1.out, 40);
const r2 = await buildRuss(T, 2, s2.out, { stage: 'R2', xpu: 'ByteFoundry 2', law: 'plume step mod 5^8', steps: 40, input_tuple_id: r1.tuple_id, lcuf_program_sha256: p2 });
for (const [n, r] of [['r0', r0], ['r1', r1], ['r2', r2]]) { writeFileSync(`test/out/${n}.russ`, r.bytes); writeFileSync(`test/out/${n}.russl`, r.source); }
let ok = true;
for (const [n, r, want] of [['r0', r0, input], ['r1', r1, s1.out], ['r2', r2, s2.out]]) {
  const back = await readRuss(r.bytes);
  const same = back.chunky.every((v, i) => v === want[i]);
  console.log(`${back.problems.length || !same ? 'FAIL' : 'PASS'}  ${n}.russ JS read-back: ${r.bytes.length} bytes, field round-trips ${same}, problems ${JSON.stringify(back.problems)}`);
  ok &&= same && !back.problems.length;
}
const again = await buildRuss(T, 1, s1.out, { stage: 'R1', xpu: 'ByteFoundry 1', law: 'plume step mod 2^20', steps: 40, input_tuple_id: r0.tuple_id, lcuf_program_sha256: p1 });
console.log(`${again.tuple_id === r1.tuple_id ? 'PASS' : 'FAIL'}  R1 is reproducible: same tuple id on rebuild`);
// tamper detection
const bad = r1.bytes.slice(); bad[bad.length - 100] ^= 1;
{ let o; try { const tb = await readRuss(bad); o = tb.problems.length ? 'reported: ' + tb.problems[0] : 'ACCEPTED'; } catch (e) { o = 'refused: ' + e.message; }
  console.log(`${o !== 'ACCEPTED' ? 'PASS' : 'FAIL'}  one flipped byte is detected: ${o}`); ok &&= o !== 'ACCEPTED'; }
// hostile containers (1.1.0): every one must be refused with a RussError or reported, never crash
import('../src/russ.js').then(async ({ RussError }) => {
  const g = r1.bytes, set64 = (b, off, v) => { const x = Uint8Array.from(b); new DataView(x.buffer).setBigUint64(off, v); return x; };
  const cases = [
    ['empty', new Uint8Array(0)], ['truncated header', g.subarray(0, 20)], ['truncated records', g.subarray(0, 5000)],
    ['manifest length 2^60', set64(g, 16, 2n ** 60n)], ['manifest length 0', set64(g, 16, 0n)],
    ['trailing byte', Uint8Array.from([...g, 0])], ['bad magic', Uint8Array.from(g).fill(0, 0, 1)],
  ];
  for (const [n, b] of cases) {
    let outcome; try { const r = await readRuss(b); outcome = r.problems.length ? 'reported: ' + r.problems[0] : 'ACCEPTED'; } catch (e) { outcome = (e instanceof RussError ? 'refused: ' : 'CRASH ' + e.constructor.name + ': ') + e.message; }
    const good = !outcome.startsWith('CRASH') && outcome !== 'ACCEPTED';
    ok &&= good; console.log(`${good ? 'PASS' : 'FAIL'}  hostile .russ (${n}) -> ${outcome}`);
  }
  // unsafe path: rewrite one record path in a copy, keep lengths equal
  const txt = new TextDecoder().decode(g.subarray(0, 24 + Number(new DataView(g.buffer, g.byteOffset).getBigUint64(16))));
  const evil = Uint8Array.from(g); const enc2 = new TextEncoder(); const at = txt.indexOf('"mssl/final_admission.mssl"');
  evil.set(enc2.encode('"../l/final_admission.mssl"'), at);
  let o; try { await readRuss(evil); o = 'ACCEPTED'; } catch (e) { o = (e instanceof RussError ? 'refused: ' : 'CRASH: ') + e.message; }
  console.log(`${o.startsWith('refused') ? 'PASS' : 'FAIL'}  path escape in manifest -> ${o}`); ok &&= o.startsWith('refused');
  process.exit(ok ? 0 : 1);
});
