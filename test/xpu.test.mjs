import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import os from 'node:os';
import { compile, referenceRun, BF1_SOURCE, BF2_SOURCE, LcufaDiagnostic } from '../src/lcufa.js';
import { createWasm1T, createWasmMT, createWasm1TWorker } from '../src/engines.js';
const rd = (f) => new Uint32Array(readFileSync(new URL(f, import.meta.url)).buffer.slice(0));
const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
let pass = 0, fail = 0; const check = (n, ok, info = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${info}`); };
const spawn = (src) => { const w = new Worker(src, { eval: true }); const hs = new Set(); w.on('message', (m) => hs.forEach((h) => h(m))); w.on('error', (e) => hs.forEach((h) => h({ type: 'error', message: e.message }))); w.on('exit', (c) => hs.forEach((h) => h({ type: 'error', message: 'worker exited with code ' + c })));
  return { post: (m) => w.postMessage(m), onMessage: (f) => hs.add(f), offMessage: (f) => hs.delete(f), terminate: () => w.terminate() }; };

const bf1 = compile(BF1_SOURCE), bf2 = compile(BF2_SOURCE);
check('BF1 program compiles', bf1.ninit === 1 && bf1.nstep === 10 && bf1.nfinal === 1, `slots=${Object.keys(bf1.slot).length}`);
check('BF2 program compiles', bf2.p === 5 && bf2.M === 390625, `slots=${Object.keys(bf2.slot).length}`);
const input = rd('in.bin');
const w1 = await createWasm1T(readFileSync(new URL('../web/xpu.wasm', import.meta.url)));
const nt = Math.min(8, os.cpus().length);
const wm = await createWasmMT(readFileSync(new URL('../web/xpu-mt.wasm', import.meta.url)), nt, spawn);
for (const [name, prog, ref] of [['BF1 (Z/2^20)', bf1, 'bf1_40.bin'], ['BF2 (Z/5^8)', bf2, 'bf2_40.bin']]) {
  const want = rd(ref);
  const a = await w1.run(prog, input, 40); check(`${name} wasm-1t 40 steps = NumPy`, eq(a.out, want), `${a.ms.toFixed(0)} ms`);
  const b = await wm.run(prog, input, 40); check(`${name} wasm-mt(${nt}) 40 steps = NumPy`, eq(b.out, want), `${b.ms.toFixed(0)} ms`);
  const r = referenceRun(prog, input, 3); const c = await w1.run(prog, input, 3);
  check(`${name} JS reference interpreter = wasm (3 steps)`, eq(r, c.out));
}
const s1 = await wm.run(bf1, input, 40); const s2 = await wm.run(bf2, s1.out, 40);
check('pipeline BF1(40) then BF2(40) = NumPy', eq(s2.out, rd('pipe_40_40.bin')));
// throughput
const big = await wm.run(bf1, input, 400); const big1 = await w1.run(bf1, input, 100);
console.log(`throughput BF1: 1 thread ${(131072 * 100 / big1.ms / 1000).toFixed(1)} M lane-updates/s; ${nt} threads ${(131072 * 400 / big.ms / 1000).toFixed(1)} M lane-updates/s`);
// diagnostics
const bad = [[BF1_SOURCE.replace('ring p=2 n=20', 'ring p=4 n=10'), 'not prime'], [BF1_SOURCE.replace('| sq    | x      | q', '| sq    | zz     | q'), 'read before'], [BF2_SOURCE.replace('mulc  | q      | q5     | 5', 'orc   | q      | q5     | 5'), '2-adic'], [BF1_SOURCE.replace('final | f1 | to2   | x      | out    | -\n', ''), 'never writes out'], [BF1_SOURCE.replace('| rot   | x      | r      | 1', '| rot   | x      | x2     | 9'), 'rot arg']];
for (const [src, want] of bad) { let msg = ''; try { compile(src); } catch (e) { msg = e instanceof LcufaDiagnostic ? e.message : 'other ' + e; } check(`diagnostic: ${want}`, msg.includes(want), msg); }
// hardening (1.1.0)
for (const [src, want] of [[BF2_SOURCE.replace('ring p=5 n=8', 'ring p=5 n=0'), 'n ≥ 1'], [BF1_SOURCE.replace('ring p=2 n=20', 'ring p=99999999989 n=1'), 'too large'], [BF1_SOURCE.replace('| 5\n', '| 99999999999\n'), 'at most 10 digits']]) {
  let msg = ''; try { compile(src); } catch (e) { msg = e.message; } check(`diagnostic: ${want}`, msg.includes(want), msg); }
{ const c = compile(BF2_SOURCE.replace('addc  | t      | t1     | 1', 'addc  | t      | t1     | 4294967295'));
  const a = referenceRun(c, input, 2), b = (await w1.run(c, input, 2)).out, m = (await wm.run(c, input, 2)).out;
  check('addc with a 32-bit constant: reference = wasm-1t = wasm-mt in Z/5^8', eq(a, b) && eq(a, m)); }
for (const [steps, why] of [[0, 'zero'], [1.5, 'fraction'], [1e9, 'huge']]) { let msg = ''; try { await w1.run(bf1, input, steps); } catch (e) { msg = e.message; } check(`engine refuses steps=${steps} (${why})`, msg.includes('steps must')); }
{ let msg = ''; try { await w1.run(bf1, input.subarray(0, 10), 1); } catch (e) { msg = e.message; } check('engine refuses a short input frame', msg.includes('input must')); }
{ const bad = { ...bf1, code: Uint32Array.from(bf1.code) }; bad.code[1] = 99; let msg = ''; try { await w1.run(bad, input, 1); } catch (e) { msg = e.message; } check('C engine refuses an out-of-range slot', msg.includes('refused the program')); }
{ const bad = { ...bf1, p: 4, n: 10 }; let msg = ''; try { await w1.run(bad, input, 1); } catch (e) { msg = e.message; } check('C engine refuses a non-prime ring', msg.includes('refused ring')); }
{ const [a, b] = await Promise.all([wm.run(bf1, input, 40), wm.run(bf2, input, 40)]);
  check('two overlapping wasm-mt runs are queued and both correct', eq(a.out, rd('bf1_40.bin')) && eq(b.out, rd('bf2_40.bin'))); }
{ const big = input.slice(); big[5] = 0xfffffff0; let msg = ''; try { await w1.run(bf2, big, 1); } catch (e) { msg = e.message; } check('engine refuses input words above 20 bits', msg.includes('above bit 19'), msg); }
for (const [src, want] of [[BF1_SOURCE.replace('ring p=2 n=20', 'ring p=02 n=20'), 'no leading zeros'], [BF1_SOURCE.replace('| sq    | x      | q ', '| sq    | x      | __proto__ ').replace('orc   | q ', 'orc   | __proto__ '), 'reserved'], [BF1_SOURCE.replace('| rot   | x      | r      | 1', '| rot   | x      | undefined | 1').replace('nsum  | r ', 'nsum  | undefined '), 'reserved']]) {
  let msg = ''; try { compile(src); } catch (e) { msg = e.message; } check(`diagnostic: ${want}`, msg.includes(want), msg); }
// a worker killed mid-run must fail the run, not hang it
{ const spawned = []; const spawn2 = (src) => { const h = spawn(src); spawned.push(h); return h; };
  const wk = await createWasmMT(readFileSync(new URL('../web/xpu-mt.wasm', import.meta.url)), 2, spawn2);
  const p = wk.run(bf2, input, 3000); setTimeout(() => spawned[1].terminate(), 200);
  const t0 = Date.now(); let msg = ''; try { await p; msg = 'finished'; } catch (e) { msg = e.message; }
  check('a worker killed mid-run fails the run instead of hanging', /exited|failed/.test(msg) && Date.now() - t0 < 10000, `${msg} after ${Date.now() - t0} ms`);
  let after = ''; try { await wk.run(bf1, input, 1); } catch (e) { after = e.message; } check('the stopped engine refuses further runs', after.includes('stopped'), after);
  wk.terminate(); }
// 1.2.0: watchdog, cancel, 1-thread worker engine
{ // a worker that dies silently (no error, no exit event) can only be caught by the progress watchdog
  const quiet = []; const spawnQuiet = (src) => { const w = new Worker(src, { eval: true }); const hs = new Set(); w.on('message', (m) => hs.forEach((h) => h(m))); quiet.push(w);
    return { post: (m) => w.postMessage(m), onMessage: (f) => hs.add(f), offMessage: (f) => hs.delete(f), terminate: () => w.terminate() }; };
  const wq = await createWasmMT(readFileSync(new URL('../web/xpu-mt.wasm', import.meta.url)), 2, spawnQuiet, 1500);
  const t0 = Date.now(); const p = wq.run(bf2, input, 5000); setTimeout(() => quiet[1].terminate(), 300);
  let msg = ''; try { await p; msg = 'finished'; } catch (e) { msg = e.message; }
  check('watchdog stops a run whose worker died silently', /no progress/.test(msg) && Date.now() - t0 < 6000, `${msg} after ${Date.now() - t0} ms`);
  wq.terminate(); }
{ // a long legitimate run is not cut off: 1.5 s stall window, run takes several seconds
  const wl = await createWasmMT(readFileSync(new URL('../web/xpu-mt.wasm', import.meta.url)), 2, spawn, 1500);
  const t0 = Date.now(); let ok = false; try { const r = await wl.run(bf2, input, 600); ok = r.out.length === input.length; } catch (e) { console.log('   ', e.message); }
  check('a long run (several seconds) is not cut off by the watchdog', ok, `${Date.now() - t0} ms`);
  // cancel mid-run, then the engine is usable again
  const p = wl.run(bf2, input, 5000); setTimeout(() => wl.cancel(), 200); let cm = ''; try { await p; cm = 'finished'; } catch (e) { cm = e.message; }
  const again = await wl.run(bf1, input, 40);
  check('wasm-mt cancel stops the run and the engine keeps working', cm === 'stopped' && eq(again.out, rd('bf1_40.bin')), cm);
  wl.terminate(); }
{ const wk = await createWasm1TWorker(readFileSync(new URL('../web/xpu.wasm', import.meta.url)), spawn);
  const a = await wk.run(bf2, input, 40); check('wasm-1t in a worker = NumPy (BF2, 40 steps)', eq(a.out, rd('bf2_40.bin')));
  const p = wk.run(bf2, input, 5000); setTimeout(() => wk.cancel(), 200); let cm = ''; try { await p; cm = 'finished'; } catch (e) { cm = e.message; }
  const b = await wk.run(bf1, input, 40);
  check('wasm-1t worker cancel stops the run and the engine keeps working', cm === 'stopped' && eq(b.out, rd('bf1_40.bin')), cm);
  await wk.cancel(); }
wm.terminate();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
