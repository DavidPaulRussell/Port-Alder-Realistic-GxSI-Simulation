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
check('every citizen keeps a Social Information Number', [...a.people.each()].every((i) => a.people.sin[i] >= 0 && a.slotOf(a.people.sin[i]) === i));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
