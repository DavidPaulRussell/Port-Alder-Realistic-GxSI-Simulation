// SPDX-License-Identifier: GPL-3.0-only
// The city at another size: the same engine founds four times the map (about 49,000 citizens), its books balance
// every day, and shopping by the squares near home chooses exactly what looking at every business would.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let pass = 0, fail = 0; const check = (n, ok, info = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${info}`); };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), DAYS = Number(process.env.DAYS || 4);
const SIZES = { n: 256, people: 98304, households: 32768, firms: 8192, loans: 131072, buildings: 32768, dwellings: 49152, spaces: 16384 };
const run = (extra = {}) => {
  const out = execFileSync(process.execPath, [join(ROOT, 'tools/run_city.mjs'), String(DAYS)], { encoding: 'utf8', env: { ...process.env, PLUME_SCALE: JSON.stringify(SIZES), ...extra }, maxBuffer: 1 << 26 });
  const founded = /founded in \d+ ms: (\d+) citizens, (\d+) households, (\d+) firms/.exec(out), end = /audits failed on (\d+) days; digest ([0-9a-f]+)/.exec(out);
  return { citizens: Number(founded?.[1] || 0), households: Number(founded?.[2] || 0), firms: Number(founded?.[3] || 0), failed: Number(end?.[1] ?? -1), digest: end?.[2] || '' };
};
const a = run(), b = run({ PLUME_SHOP_ALL: '1' });
check('the engine founds a city on four times the map', a.citizens > 40000 && a.households > 18000 && a.firms > 600, `${a.citizens.toLocaleString('en-US')} citizens, ${a.households.toLocaleString('en-US')} households, ${a.firms} firms`);
check(`its books balance on each of ${DAYS} days`, a.failed === 0);
check('shopping near home chooses what looking at every business would', a.digest.length >= 16 && a.digest === b.digest, `digest ${a.digest}…`);
const tenth = (() => { const out = execFileSync(process.execPath, [join(ROOT, 'tools/run_city.mjs'), '3'], { encoding: 'utf8', env: { ...process.env, PLUME_SCALE: '' }, maxBuffer: 1 << 26 }); return /founded in \d+ ms: (\d+) citizens/.exec(out)?.[1]; })();
check('left unset, the size is the one-in-ten city', Number(tenth) > 11000 && Number(tenth) < 13000, `${tenth} citizens`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
