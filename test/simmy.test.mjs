// SPDX-License-Identifier: GPL-3.0-only
// The JS rails executor must replay Simmy v3.0.0 byte for byte: the replay file it writes has the
// SHA-256 of GENERATED/unity_mesh_run.json, and the 840 authority oracle fields all match.
// Optional: SIMMY_PACKAGE=<Simmy v3.0.0 package root> also compares against the package files.
import { readFileSync, existsSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import {
  runSimmy, replayText, sha256Hex, pyDumps, Q, qToDouble, pyFixed6, SIMMY_REPLAY_SHA256, SIMMY_WORKLOAD_SHA256, projectManifest,
  SimmyRun, ModelValidationError, deriveAuthorityPolicy,
} from '../src/simmy.js';

let pass = 0, fail = 0; const check = (n, ok, info = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${info}`); };
const rd = (f) => readFileSync(new URL(f, import.meta.url));
const nodeSha = (b) => createHash('sha256').update(b).digest('hex');
const cellsBytes = rd('../data/simmy/cells.json'), workloadBytes = rd('../data/simmy/authority_workload_rails.json');
const manifest = JSON.parse(cellsBytes), workload = JSON.parse(workloadBytes);

// SHA-256 against node:crypto
{
  let ok = sha256Hex(new Uint8Array(0)) === nodeSha(Buffer.alloc(0));
  for (const n of [1, 55, 56, 63, 64, 65, 119, 120, 1000, 4097]) { const b = randomBytes(n); ok &&= sha256Hex(new Uint8Array(b)) === nodeSha(b); }
  check('synchronous SHA-256 = node:crypto on 11 lengths', ok);
}
// Python float formatting: correctly rounded double, then half-even at 6 places
{
  const cases = [[Q.of(1, 128), '0.007812'], [Q.of(3, 128), '0.023438'], [Q.of(2, 3), '0.666667'], [Q.of(1), '1.000000'], [Q.of(22, 7), '3.142857'], [Q.of(1, 3000000), '0.000000']];
  check('pyFixed6 matches Python f"{float(x):.6f}" (ties to even)', cases.every(([x, s]) => pyFixed6(x) === s), cases.map(([x]) => pyFixed6(x)).join(' '));
  const big = Q.of(10n ** 40n + 1n, 3n * 10n ** 39n);
  check('qToDouble is correctly rounded for 130-bit operands', qToDouble(big).value === 10 / 3);
}
check('pyDumps escapes like json.dumps(ensure_ascii=True)', pyDumps({ b: 'é\u007f"\\\n', a: [1, true, null] }) === '{"a":[1,true,null],"b":"\\u00e9\\u007f\\"\\\\\\n"}');
check('pyDumps indent=2 layout', pyDumps({ a: [], b: {}, c: [1, { d: 2 }] }, 2) === '{\n  "a": [],\n  "b": {},\n  "c": [\n    1,\n    {\n      "d": 2\n    }\n  ]\n}');
check('rails workload is the Simmy v3.0.0 file', nodeSha(workloadBytes) === SIMMY_WORKLOAD_SHA256);
{
  const legacy = manifest.cells.find((c) => c.kind === 'authority_minivm').policy;
  check('derive_authority_policy reproduces the workload policy exactly', pyDumps(deriveAuthorityPolicy(legacy)) === pyDumps(workload.policy));
}

const t0 = performance.now();
let ticks = 0;
const result = runSimmy(manifest, workload, { onTick: () => ticks++ });
const ms = performance.now() - t0;
const text = replayText(result), digest = sha256Hex(text);
check('replay SHA-256 = GENERATED/unity_mesh_run.json', digest === SIMMY_REPLAY_SHA256, `${digest.slice(0, 16)}… ${text.length} bytes, ${ms.toFixed(0)} ms`);
check('replay length is 145,213 bytes', text.length === 145213);
check('92 ticks, fixed point verified at the last', result.final_tick === 92 && ticks === 92 && result.rails.convergence.fixed_point_reached_at_tick === 91);
check('authority starts at tick 36; 840 oracle fields checked', result.authority_workload_started_at_tick === 36 && result.rails.authority_oracle_fields_checked === 840);
check('168,912 fold cross-checks; 33 bootstrap admissions', result.rails.fold_cross_checks === 168912 && result.rails.release.bootstrap_admissions === 33,
  `${result.rails.fold_cross_checks} / ${result.rails.release.bootstrap_admissions}`);
check('E14 certificate', result.rails.release.planning.spectral_radius_bound === '0.977102' && result.rails.release.planning.max_value === '43.671416');

// hostile inputs fail closed
for (const [why, mutate] of [
  ['workload with a tampered oracle', (w) => { w.oracle['3']['deer.04'].score += 1; }],
  ['workload with an undefined flag bit', (w) => { w.inputs['2'][5][3] = 64; }],
  ['policy that is not the exact calibration', (w) => { w.policy.evidence_weights.denial = '97/28'; }],
  ['mesh policy with gamma = 1', (w) => { w.mesh_policy.planning_discount = '1'; }],
]) {
  const w = JSON.parse(workloadBytes); mutate(w); let msg = '';
  try { runSimmy(manifest, w); } catch (e) { msg = e.name + ': ' + e.message; }
  check(`refuses a ${why}`, /ModelValidationError/.test(msg), msg.slice(0, 90));
}
{
  const m = JSON.parse(cellsBytes); m.cells[3].deps.push(m.cells[3].number); let msg = '';
  try { new SimmyRun(m, workload); } catch (e) { msg = e instanceof ModelValidationError ? e.message : 'other ' + e; }
  check('refuses a subsystem that depends on itself', /depend on itself/.test(msg), msg);
}

const pkg = process.env.SIMMY_PACKAGE;
if (pkg && existsSync(pkg)) {
  const full = JSON.parse(readFileSync(`${pkg}/SOURCE/Simmy 4.0.0/CELLS_MANIFEST.json`));
  const proj = projectManifest(full);
  check('data/simmy/cells.json is the projection of CELLS_MANIFEST.json', pyDumps(proj.cells) === pyDumps(manifest.cells) && manifest.source.sha256 === nodeSha(readFileSync(`${pkg}/SOURCE/Simmy 4.0.0/CELLS_MANIFEST.json`)));
  check('replay bytes = GENERATED/unity_mesh_run.json', Buffer.from(text).equals(readFileSync(`${pkg}/GENERATED/unity_mesh_run.json`)));
  check('the full manifest replays identically', sha256Hex(replayText(runSimmy(full, workload))) === SIMMY_REPLAY_SHA256);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
