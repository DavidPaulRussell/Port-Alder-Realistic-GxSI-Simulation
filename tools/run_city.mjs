// Run Port Alder headless in Node for a number of days and print what happens: each month's measures for the city
// and its three outer layers, the books' audits, the events, and which laws of the law book ran.
// usage: node tools/run_city.mjs [days] [seed] [--events]      (PLUME_SCALE=full, or sizes as JSON, runs another size)
// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs';
import { createWasm1T } from '../src/engines.js';
import { simmyBoot } from '../src/core.js';
import { City, LAW_ROWS, LAW_USE } from '../src/city.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--')), days = Number(args[0] || 30), seed = Number(args[1] || 20261117), show = process.argv.includes('--events');
const rd = (f) => readFileSync(new URL(f, import.meta.url));
let t = Date.now();
const boot = simmyBoot(JSON.parse(rd('../data/simmy/cells.json')), JSON.parse(rd('../data/simmy/authority_workload_rails.json')));
const city = new City({ seed, boot: 'instant' }, boot), engine = await createWasm1T(rd('../web/xpu.wasm'));
console.log(`founded in ${Date.now() - t} ms: ${city.people.count} citizens, ${city.hh.count} households, ${city.firms.count} firms; outer layers ${city.outer.A.count} households, ${city.outer.F.count} employers sampled`);
const pct = (x, d = 100) => (x / d).toFixed(1) + '%';
let fails = 0; const kinds = new Map(); t = Date.now();
for (let k = 0; k < days; k++) {
  const R = await city.step(engine);
  if (!R.audit.ok) { fails++; if (fails < 4) console.log(R.date, 'AUDIT FAILED', R.audit.problems.slice(0, 2).join(' | ')); }
  for (const x of city.events.filter((x) => x.epoch === city.epoch)) { kinds.set(x.kind, (kinds.get(x.kind) || 0) + 1); if (show) console.log(`  ${R.date} ${x.kind.padEnd(11)} ${x.text}`); }
  if (R.date.endsWith('-01') || k === days - 1) {
    const s = R.stats.series, b = city.board, K = city.outer.kpi;
    console.log(`${R.date} citizens ${s.pop} households ${s.households} firms ${s.firms} unemployment ${pct(s.unemployment)} mood ${s.mood}` +
      (b ? ` | poverty ${pct(b.income.poverty, 10)} uninsured ${pct(b.health.uninsured, 10)} rent ${(b.housing.medianRent / 100).toFixed(0)} vacancy ${pct(b.housing.vacancy, 10)}` : '') +
      (K ? ` | unemployment county ${pct(K.county.unemployment)} state ${pct(K.state.unemployment)} nation ${pct(K.nation.unemployment)}` : ''));
  }
}
console.log(`${days} days in ${((Date.now() - t) / 1000).toFixed(1)} s; audits failed on ${fails} days; digest ${city.digest.slice(0, 16)}…`);
console.log('events', JSON.stringify(Object.fromEntries([...kinds].sort((a, b) => b[1] - a[1]))));
const used = new Set(LAW_USE.keys()), unused = LAW_ROWS.filter((r) => !used.has(r[0])).map((r) => `${r[0]} ${r[1]}`);
console.log(`laws used ${used.size} of ${LAW_ROWS.length}${unused.length ? '; not yet: ' + unused.join('; ') : ''}`);
process.exit(fails ? 1 : 0);
