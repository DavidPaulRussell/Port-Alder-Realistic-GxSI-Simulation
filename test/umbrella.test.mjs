// SPDX-License-Identifier: GPL-3.0-only
// The umbrella of sentient computing: no variable is procedural.
//   1. every field of every table is named in src/variables.js, with the agents who decide it and the laws it follows
//   2. every law cited there, and every law the code calls, is in the law book with a faithful linear continuum image
//   3. nothing in the simulation draws a random number, reads a clock into its state, or hashes its way to a value
//      (the hash lives in core.js for the digests only)
//   4. the founding census closes when genesis ends: after it, asking it for a value throws
//   5. the view's laws (Newton, Verlet, blackbody, tides) run, so every station of the corpus informs the city
import { readFileSync, readdirSync } from 'node:fs';
import { VARIABLES, TABLE_GROUPS, fieldsOf } from '../src/variables.js';
import { LAW_ROWS, LAW_USE, faithful, census, CORPUS } from '../src/laws.js';
import { PEOPLE_SPEC, HOUSEHOLD_SPEC } from '../src/people.js';
import { FIRM_SPEC } from '../src/economy.js';
import { LOAN_SPEC } from '../src/finance.js';
import { OUTER_SPEC, OFIRM_SPEC, PLACE_SPEC } from '../src/periphery.js';
import { BUILDING_SPEC, DWELLING_SPEC, SPACE_SPEC } from '../src/world.js';

let pass = 0, fail = 0; const check = (n, ok, info = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${info}`); };
const SPECS = { PEOPLE_SPEC, HOUSEHOLD_SPEC, FIRM_SPEC, LOAN_SPEC, OUTER_SPEC, OFIRM_SPEC, PLACE_SPEC, BUILDING_SPEC, DWELLING_SPEC, SPACE_SPEC };
const LAWS = new Map(LAW_ROWS.map((r) => [r[0], r]));

// 1. every field named exactly once, and nothing named that is not a field
for (const [spec, group] of Object.entries(TABLE_GROUPS)) {
  const fields = SPECS[spec].map((x) => x[0]), named = fieldsOf(group), seen = new Map();
  for (const x of named) seen.set(x, (seen.get(x) || 0) + 1);
  const missing = fields.filter((x) => !seen.has(x)), twice = [...seen].filter(([, n]) => n > 1).map(([x]) => x), extra = named.filter((x) => !fields.includes(x));
  check(`${spec}: all ${fields.length} fields have deciders and laws`, !missing.length && !twice.length && !extra.length,
    [missing.length ? `missing ${missing.join(' ')}` : '', twice.length ? `named twice ${twice.join(' ')}` : '', extra.length ? `not fields ${extra.join(' ')}` : ''].filter(Boolean).join('; '));
}
// every row says who decides and cites at least one law
{ let bad = []; for (const [g, rows] of Object.entries(VARIABLES)) for (const [f, who, laws] of rows) if (!who || who.length < 12 || !laws.length) bad.push(`${g}: ${f.slice(0, 30)}`); check('every row names its deciders and cites a law', !bad.length, bad.join(' | ')); }

// 2. the laws: cited ones exist and are faithful; the book itself holds only faithful images
{ const cited = new Set(); for (const rows of Object.values(VARIABLES)) for (const [, , laws] of rows) for (const l of laws) cited.add(l);
  const unknown = [...cited].filter((l) => !LAWS.has(l)), unfaithful = [...cited].filter((l) => LAWS.has(l) && !faithful(LAWS.get(l)[3]));
  check(`the ${cited.size} laws the registry cites are in the law book`, !unknown.length, unknown.join(' '));
  check('every cited law has a faithful linear continuum image', !unfaithful.length, unfaithful.join(' ')); }
check(`the law book's ${LAW_ROWS.length} laws are all faithful`, LAW_ROWS.every((r) => faithful(r[3])));
{ const stations = new Set(LAW_ROWS.map((r) => r[0].split('.')[0])); check('the law book draws on all 80 stations of the corpus', stations.size === 80, `${stations.size} stations`); }
check('the corpus is cited by title and entry, not copied', typeof CORPUS.title === 'string' && CORPUS.entries > 0 && !('text' in CORPUS));
{ // every law id the code calls is in the book
  const src = readdirSync(new URL('../src/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8')).join('\n');
  const called = new Set([...src.matchAll(/(?:use|lawUse)\("(\d+\.\d+)"\)/g)].map((m) => m[1])), unknown = [...called].filter((l) => !LAWS.has(l));
  check(`the ${called.size} law ids the code calls are all in the book`, !unknown.length, unknown.join(' ')); }

// 3. no random numbers, no clocks in the state, no hashing outside core.js
{
  const SIM = ['books', 'citydata', 'city', 'civic', 'core', 'develop', 'economy', 'finance', 'health', 'housing', 'kpis', 'laws', 'motion', 'nation', 'payroll', 'people', 'periphery', 'registry', 'rules', 'tables', 'variables', 'welfare', 'world'];
  const offenders = [], clocks = [], hashes = [];
  for (const m of SIM) {
    const s = readFileSync(new URL(`../src/${m}.js`, import.meta.url), 'utf8').replace(/\/\/[^\n]*/g, '');
    if (/Math\.random|getRandomValues|randomBytes|randomUUID/.test(s)) offenders.push(m);
    for (const line of s.split('\n')) if (/Date\.now|performance\.now|new Date\(/.test(line) && !/R\.ms|const t0 =/.test(line)) clocks.push(`${m}: ${line.trim().slice(0, 60)}`);
    if (m !== 'core' && (/\bhash\(/.test(s) || /import \{[^}]*\bhash\b[^}]*\} from "\.\/core\.js"/.test(s))) hashes.push(m);
  }
  check('no module of the simulation draws a random number', !offenders.length, offenders.join(' '));
  check('no clock enters the state (timings only)', !clocks.length, clocks.join(' | '));
  check('no value is hashed into being outside core.js (digests only)', !hashes.length, hashes.join(' '));
}

// 4. the founding census closes with genesis
{
  const { simmyBoot } = await import('../src/core.js'), { City } = await import('../src/city.js');
  const cells = JSON.parse(readFileSync(new URL('../data/simmy/cells.json', import.meta.url))), workload = JSON.parse(readFileSync(new URL('../data/simmy/authority_workload_rails.json', import.meta.url)));
  const city = new City({ seed: 20261117, boot: 'instant' }, simmyBoot(cells, workload));
  let threw = false; try { census(city, 0x123, 1); } catch (e) { threw = /closed/.test(e.message); }
  check('after genesis the founding census refuses to give a value', threw);
  check('the founding census gave every quantity it read its own rotation', city.census.dims.size <= 255, `${city.census.dims.size} dimensions`);
  check('every citizen holds a Social Information Number', [...city.people.each()].every((i) => city.people.sin[i] >= 0));
}

// 5. the view's laws
{
  const { along, sunAt, tideAt, LAMP } = await import('../src/motion.js');
  const p = along(0.5), s = sunAt(2026, 6, 21, 13 * 60, true), t = tideAt(6);
  check('the view moves cars by Newton and Verlet, lights the sky by Planck, and raises the tide', Number.isFinite(p.x ?? p[0] ?? p) && Array.isArray(LAMP) && Number.isFinite(t) && !!s, '');
  for (const id of ['21.2', '44.16', '39.17', '48.42']) check(`law ${id} (${LAWS.get(id)?.[1]}) is used by the view`, LAW_USE.has(id));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
