// SPDX-License-Identifier: GPL-3.0-only
// Port Alder replays: the same seed gives the same digest chain, a save with interventions replays to the same chain,
// and the books balance every day. DAYS=n runs longer (default 40).
import { readFileSync } from 'node:fs';
import { createWasm1T } from '../src/engines.js';
import { simmyBoot } from '../src/core.js';
import { City, SAVE_FORMAT, CITY_VERSION } from '../src/city.js';

let pass = 0, fail = 0; const check = (n, ok, info = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${info}`); };
const rd = (f) => readFileSync(new URL(f, import.meta.url));
const boot = simmyBoot(JSON.parse(rd('../data/simmy/cells.json')), JSON.parse(rd('../data/simmy/authority_workload_rails.json')));
const engine = await createWasm1T(rd('../web/xpu.wasm'));
const DAYS = Number(process.env.DAYS || 40), cfg = { seed: 20261117, boot: 'instant' };

async function run(city, days, plan = []) {
  const chain = []; let bad = 0;
  for (let k = 0; k < days; k++) {
    for (const [at, kind, args] of plan) if (city.epoch + 1 === at) city.intervene(kind, args);
    const R = await city.step(engine); chain.push(R.digest); if (!R.audit.ok) bad++;
  }
  return { chain, bad };
}
const a = new City(cfg, boot), b = new City(cfg, boot);
check('two foundings from one seed are identical', a.digest === b.digest && a.genesisDigest === b.genesisDigest);
const ra = await run(a, DAYS), rb = await run(b, DAYS);
check(`${DAYS} days from one seed give one digest chain`, ra.chain.join() === rb.chain.join());
check('the books balance every day', ra.bad === 0, `${ra.bad} days failed the audit`);
const plan = [[5, 'newHousing', { units: 40 }]];
const c = new City(cfg, boot), rc = await run(c, DAYS, plan);
check('an intervention changes the chain from its day', rc.chain[3] === ra.chain[3] && rc.chain[DAYS - 1] !== ra.chain[DAYS - 1]);
const save = JSON.parse(c.saveText());
check('the save names its format and version', save.format === SAVE_FORMAT && save.version === CITY_VERSION);
const r = new City(save.config, boot); r.interventions = save.interventions.map((x) => ({ ...x }));
const rr = await run(r, save.epoch);
check('the save replays to the same digest chain', rr.chain.join() === rc.chain.join() && rr.chain[rr.chain.length - 1] === save.chain[save.chain.length - 1][1]);
const seeds = new City({ ...cfg, seed: 7 }, boot);
check('another seed founds another city', seeds.genesisDigest !== a.genesisDigest);
// the movement matrix: measured geography, the simulation's own masses, every move counted
{
  const { MOVE_UNITS, M_CITY, M_ABROAD, movedLastYear, topMoves } = await import('../src/movement.js');
  const { MOVE_KERNEL, MOVE_DIST, MOVE_SOURCE } = await import('../src/movement_data.js');
  const mv = a.outer.move, n = MOVE_UNITS; let rowsOk = true, sym = true;
  for (let i = 0; i < M_ABROAD; i++) { let z = 0; for (let j = 0; j < n; j++) z += mv.prior[i * n + j]; if (Math.abs(z - 1) > 1e-9 || mv.prior[i * n + i] !== 0) rowsOk = false; for (let j = 0; j < M_ABROAD; j++) if (MOVE_KERNEL[i][j] !== MOVE_KERNEL[j][i] || MOVE_DIST[i][j] !== MOVE_DIST[j][i]) sym = false; }
  check("each place's row of the movement matrix sums to one, with nothing on the diagonal", rowsOk);
  check('the measured kernel and distances are symmetric and credit their source', sym && /WorldPop/.test(MOVE_SOURCE) && /CC BY 4\.0/.test(MOVE_SOURCE));
  check('the prior follows the people as they are now', Math.abs(mv.pop[M_CITY] - (a.people.count * a.outer.cityWeight) / 1000) < a.outer.cityWeight && mv.pop[9] > 1e6);
  const m = movedLastYear(mv); let moved = 0, diag = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { moved += m[i * n + j]; if (i === j) diag += m[i * n + j]; }
  const top = topMoves(mv, 3);
  check('moves between places are counted origin by destination', moved > 0 && diag === 0 && top.length === 3 && top[0][2] >= top[1][2], `${Math.round(moved)} people in ${DAYS} days`);
  check('households leave the city by their own decision at a calibrated rate', a.outer.leaveScale > 0 && Number.isFinite(a.outer.leaveScale) && a.outer.moveScale > 0, `leaveScale ${a.outer.leaveScale}`);
}
// an exact snapshot: a city restored from one goes on as the one it was taken from
{
  const { snapshot, restore, snapshotBytes, snapshotFromBytes } = await import('../src/snapshot.js');
  const bytes = snapshotBytes(snapshot(a)), twin = new City(cfg, boot); restore(twin, snapshotFromBytes(bytes));
  const again = snapshotBytes(snapshot(twin)); let same = again.length === bytes.length; if (same) for (let i = 0; i < bytes.length; i++) if (again[i] !== bytes[i]) { same = false; break; }
  check('a restored city snapshots to the same bytes', same, `${bytes.length.toLocaleString('en-US')} bytes`);
  const more = 12, rx = await run(a, more), ry = await run(twin, more);
  check(`and lives the next ${more} days to the same digests, with the books balanced`, rx.chain.join() === ry.chain.join() && ry.bad === 0);
  const ea = snapshotBytes(snapshot(a)), eb = snapshotBytes(snapshot(twin)); let end = ea.length === eb.length; if (end) for (let i = 0; i < ea.length; i++) if (ea[i] !== eb[i]) { end = false; break; }
  check('ending in the same state, byte for byte', end);
  let threw = false; try { restore(new City({ ...cfg, seed: 7 }, boot), snapshotFromBytes(bytes)); } catch (e) { threw = /another configuration/.test(e.message); }
  check('a snapshot is refused by a city of another configuration', threw);
}
check('every citizen keeps a Social Information Number', [...a.people.each()].every((i) => a.people.sin[i] >= 0 && a.slotOf(a.people.sin[i]) === i));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
