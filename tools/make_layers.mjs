// SPDX-License-Identifier: GPL-3.0-only
// Build Port Alder's layer files: one EDHX container for each layer of the Matryoshka.
//
//   node tools/make_layers.mjs --runtime <a folder holding the edhx package, or any .edhx file> [--out layers] [--force]
//
//   layers/world.edhx    the law book (every law the simulation runs, as the functions that run it), the constants
//   layers/nation.edhx   the nation's places, federal rules by year, the series, the movement matrix's geography
//   layers/state.edhx    the state's places, Washington's rules by year, the state's ballot measures
//   layers/county.edhx   the county's places and sector mixes
//   layers/city.edhx     the city: its tables, its variables, the engine itself (every module, the XPU, the Simmy
//                        replay), its configuration and its founding digest, and where its people live
//
// Each record's SHA-512 is in its container's state, and the state's root is in the container's head, so every
// law, rule and table the simulation runs on is pinned by the one hash at the top of its layer's file. The files are
// written by the EDHX runtime itself (tools/edhx_pack.py drives it); src/edhx.js reads them back here to check them.
// A layer whose records have not changed is left as it is, so rebuilding does not churn the repository.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const OUT = resolve(ROOT, opt('out', 'layers')), FORCE = args.includes('--force'), CEILING = 24 * 1024 * 1024;
const STAGE = join(ROOT, 'build', 'layers');
const src = (f) => readFileSync(join(ROOT, f));
const E = await import('../src/edhx.js');
const C = await import('../src/city.js'), LAWS_MOD = await import('../src/laws.js'), RULES = await import('../src/rules.js'), DATA = await import('../src/citydata.js');
const PER = await import('../src/periphery.js'), MOVE = await import('../src/movement_data.js'), NAT = await import('../src/nation.js'), TAB = await import('../src/tables.js');
const BOOKS = await import('../src/books.js'), REG = await import('../src/registry.js'), WEL = await import('../src/welfare.js'), VARS = await import('../src/variables.js');
const SPECS = { ...(await import('../src/people.js')), ...(await import('../src/economy.js')), ...(await import('../src/finance.js')), ...(await import('../src/world.js')), ...(await import('../src/develop.js')), ...PER };

/* ---------------------------------------------------------------- plain values out of the modules */
const plain = (v) => {
  if (typeof v === 'function' || typeof v === 'symbol' || v === undefined) return undefined;
  if (typeof v === 'bigint') return { $b: String(v) };
  if (typeof v === 'number') return Number.isFinite(v) ? v : { $n: String(v) };
  if (v === null || typeof v !== 'object') return v;
  if (ArrayBuffer.isView(v)) return { $t: v.constructor.name, data: Array.from(v, (x) => (typeof x === 'bigint' ? String(x) : x)) };
  if (v instanceof Map) return { $m: [...v].map(([a, b]) => [plain(a), plain(b)]) };
  if (v instanceof Set) return { $s: [...v].map(plain) };
  if (Array.isArray(v)) return v.map((x) => { const p = plain(x); return p === undefined ? null : p; });
  const p = Object.getPrototypeOf(v); if (p !== Object.prototype && p !== null) return undefined;       // class instances are not tables
  const o = {}; for (const k of Object.keys(v)) { const e = plain(v[k]); if (e !== undefined) o[k] = e; } return o;
};
const json = (v) => Buffer.from(JSON.stringify(v, null, 1) + '\n', 'utf8');
const tablesOf = (mod, names) => { const o = {}; for (const k of names || Object.keys(mod)) { const e = plain(mod[k]); if (e !== undefined) o[k] = e; } return o; };
const specOf = (spec) => spec.map(([k, T, w]) => [k, T.name, w || 1]);

/* ---------------------------------------------------------------- the laws: which, where, and the code that runs them */
const lawFns = {};                                                         // id -> [{ name, source }]
for (const [name, fn] of Object.entries(LAWS_MOD)) if (typeof fn === 'function') { const s = fn.toString(); for (const m of s.matchAll(/use\("(\d+\.\d+)"\)/g)) (lawFns[m[1]] = lawFns[m[1]] || []).push({ name, source: s }); }
const fnLaws = {}; for (const [id, fns] of Object.entries(lawFns)) for (const f of fns) (fnLaws[f.name] = fnLaws[f.name] || new Set()).add(id);
const lawsOfModule = (file) => {
  const s = src(file).toString('utf8'), ids = new Set([...s.matchAll(/(?:use|lawUse)\("(\d+\.\d+)"\)/g)].map((m) => m[1]));
  for (const m of s.matchAll(/import\s*\{([^}]*)\}\s*from\s*"\.\/laws\.js"/g)) for (const n of m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) for (const id of fnLaws[n] || []) ids.add(id);
  return ids;
};
const OUTER_MODULES = ['src/periphery.js', 'src/movement.js', 'src/nation.js'];
// the engine: every module the city needs, found from its imports
const engine = new Set();
const walk = (f) => { if (engine.has(f)) return; engine.add(f); const s = src(f).toString('utf8'); for (const m of s.matchAll(/from\s*"\.\/([\w.-]+\.js)"/g)) walk('src/' + m[1]); };
for (const f of ['src/city.js', 'src/engines.js', 'src/snapshot.js', 'src/edhx.js']) walk(f);
const CITY_MODULES = [...engine].filter((f) => !OUTER_MODULES.includes(f)).sort();
const union = (files) => { const u = new Set(); for (const f of files) for (const id of lawsOfModule(f)) u.add(id); return [...u].sort((a, b) => a.split('.').map(Number)[0] - b.split('.').map(Number)[0] || a.split('.').map(Number)[1] - b.split('.').map(Number)[1]); };
const lawRecord = (id) => { const L = C.LAWS[id]; return { id, title: L.title, class: L.cls, status: L.status, use: L.use, runs: (lawFns[id] || []).map((f) => ({ function: f.name, source: f.source })) }; };

/* ---------------------------------------------------------------- the five layers' records */
const layers = [];
const layer = (key, name, level) => { const L = { key, name, level, records: [] }; layers.push(L); return L; };
const put = (L, key, bytes, type, tags = []) => L.records.push({ key, bytes: Buffer.from(bytes), type, tags });
const about = (L, extra) => put(L, 'layer/about', json({ format: 'PLUME-LAYER/1', layer: L.key, name: L.name, level: L.level, simulation: 'Port Alder ' + C.CITY_VERSION, basis: PER.LAYERS[L.level].basis,
  people: PER.LAYERS[L.level].pop, ...extra }), 'json', ['layer']);
const lawsInto = (L, ids) => { put(L, 'laws/index', json({ corpus: C.CORPUS, laws: ids.map((id) => [id, C.LAWS[id].title]) }), 'json', ['law']); for (const id of ids) put(L, 'laws/' + id, json(lawRecord(id)), 'json', ['law']); };
const variablesInto = (L, groups) => { for (const [specName, group] of Object.entries(VARS.TABLE_GROUPS)) if (groups.includes(group) && SPECS[specName]) put(L, 'variables/' + group, json({ table: group, fields: specOf(SPECS[specName]), how: VARS.VARIABLES[group] || [] }), 'json', ['variable']); };
const placesOf = (lv) => PER.PLACES.map((p, i) => [p, i]).filter(([p]) => p[0] === lv).map(([p, i]) => ({ unit: i, name: p[1], basis: p[2], people: p[3], mix: p[4], wage: p[5], rent: p[6], home: p[7], minimumWage: p[8], medicaid: p[9],
  centre: MOVE.MOVE_CENTRE[i] || null, rasterPeople: MOVE.MOVE_RASTER_POP[i] ?? null }));
const movementInto = (L, units) => put(L, 'movement/geography', json({ source: MOVE.MOVE_SOURCE, units: units.map((u) => ({ unit: u, name: u === 26 ? 'Port Alder' : PER.PLACES[u][1], centre: MOVE.MOVE_CENTRE[u], kernel: MOVE.MOVE_KERNEL[u], km: MOVE.MOVE_DIST[u] })),
  columns: [...PER.PLACES.slice(0, 26).map((p) => p[1]), 'Port Alder'], law: '75.41' }), 'json', ['movement']);
const outerLaws = union(OUTER_MODULES), outerVars = ['outerHouseholds', 'outerFirms', 'places'];
const nation = new NAT.Nation(C.DEFAULT_CONFIG.seed), YEARS = [2026, 2027, 2028];
const sourcesWhere = (re, not) => Object.fromEntries(Object.entries(RULES.RULE_SOURCES).filter(([, v]) => { const t = JSON.stringify(v); return re.test(t) && !(not && not.test(t)); }));
const WA = /Washington|\bWA\b|RCW|ESD|esd\.wa|lni\.wa|dor\.wa|wa\.gov|Apple Health|Paid Family|WA Cares/i, LOCAL = /Everett|Snohomish/i;

{ const L = layer('world', PER.LAYERS[4].name, 4);
  about(L, { holds: 'the law book and the constants every layer shares' });
  put(L, 'laws/book', json({ corpus: C.CORPUS, part0: C.PART0, rows: C.LAW_ROWS }), 'json', ['law']);
  lawsInto(L, Object.keys(C.LAWS).sort((a, b) => a.split('.')[0] - b.split('.')[0] || a.split('.')[1] - b.split('.')[1]));
  put(L, 'tables/constants', json(tablesOf(TAB)), 'json', ['table']);
  put(L, 'places', json(placesOf(4)), 'json', ['place']);
  put(L, 'layers', json(plain(PER.LAYERS)), 'json', ['layer']); variablesInto(L, outerVars); }
{ const L = layer('nation', PER.LAYERS[3].name, 3);
  about(L, { holds: 'the nation beyond the state: its nine regions, federal rules, the series, the movement geography' });
  lawsInto(L, outerLaws); variablesInto(L, outerVars);
  put(L, 'places', json(placesOf(3)), 'json', ['place']); put(L, 'tables/sectors', json({ sectors: PER.SECTORS_OUT, mix: plain(PER.MIX) }), 'json', ['table']);
  movementInto(L, [...Array(27).keys()]);
  for (const y of YEARS) put(L, 'rules/federal/' + y, json(plain(RULES.federalYear(y, nation))), 'json', ['rule']);
  put(L, 'rules/series', json(tablesOf(RULES, ['START', 'FOMC_KNOWN', 'FOMC_LAST_KNOWN', 'CPI_2026', 'FIRST_PAYDAY', 'WEEKDAYS', 'MONTHS'])), 'json', ['rule']);
  put(L, 'rules/energy', json(tablesOf(NAT, ['ENERGY_2026'])), 'json', ['rule']);
  put(L, 'rules/sources', json(sourcesWhere(/./, new RegExp(WA.source + '|' + LOCAL.source, 'i'))), 'json', ['rule']); }
{ const L = layer('state', PER.LAYERS[2].name, 2);
  about(L, { holds: "the state beyond the county: its eight regions, Washington's rules, the state's ballot measures" });
  lawsInto(L, outerLaws); variablesInto(L, outerVars);
  put(L, 'places', json(placesOf(2)), 'json', ['place']); movementInto(L, PER.PLACES.map((p, i) => [p, i]).filter(([p]) => p[0] === 2).map(([, i]) => i));
  for (const y of YEARS) put(L, 'rules/payroll/' + y, json(plain(RULES.payrollYear(y, nation))), 'json', ['rule']);
  put(L, 'rules/taxes', json(tablesOf(RULES, ['STATE_SALES', 'BO', 'BO_NAMES', 'BO_SURCHARGE', 'RENT_NOTICE_DAYS', 'UI_WEEKS', 'PROPERTY_DUE', 'LEVY'])), 'json', ['rule']);
  put(L, 'rules/measures', json(plain(PER.STATE_MEASURES)), 'json', ['rule']);
  put(L, 'rules/sources', json({ ...sourcesWhere(WA, LOCAL), ...plain(PER.PERIPHERY_SOURCES) }), 'json', ['rule']); }
{ const L = layer('county', PER.LAYERS[1].name, 1);
  about(L, { holds: 'the county beyond the city: its nine places and their sector mixes' });
  lawsInto(L, outerLaws); variablesInto(L, outerVars);
  put(L, 'places', json(placesOf(1)), 'json', ['place']); movementInto(L, PER.PLACES.map((p, i) => [p, i]).filter(([p]) => p[0] === 1).map(([, i]) => i));
  put(L, 'tables/sectors', json({ sectors: PER.SECTORS_OUT, mix: plain(PER.MIX) }), 'json', ['table']);
  put(L, 'rules/sources', json(sourcesWhere(/Snohomish/i)), 'json', ['rule']); }
{ const L = layer('city', PER.LAYERS[0].name, 0);
  const boot = (await import('../src/core.js')).simmyBoot(JSON.parse(src('data/simmy/cells.json')), JSON.parse(src('data/simmy/authority_workload_rails.json')));
  const city = new C.City({ ...C.DEFAULT_CONFIG, boot: 'instant' }, boot);
  about(L, { holds: 'the city: its tables, its variables, the engine, its configuration and founding digest, where its people live',
    founding: { citizens: city.people.count, households: city.hh.count, firms: city.firms.count, digest: city.genesisDigest } });
  lawsInto(L, union(CITY_MODULES)); variablesInto(L, ['people', 'households', 'firms', 'loans', 'buildings', 'dwellings', 'spaces']);
  put(L, 'places', json([{ unit: 26, name: 'Port Alder', basis: PER.LAYERS[0].basis, people: PER.LAYERS[0].pop, centre: MOVE.MOVE_CENTRE[26], rasterPeople: MOVE.MOVE_RASTER_POP[26], cityCentre: PER.CITY_AT }]), 'json', ['place']);
  movementInto(L, [26]);
  put(L, 'tables/city', json(tablesOf(DATA)), 'json', ['table']);
  put(L, 'tables/books', json(tablesOf(BOOKS, ['ACCOUNTS', 'KINDS', 'SECTOR_NAMES', 'TAX_PAIRS', 'LOAN_PAIRS'])), 'json', ['table']);
  put(L, 'tables/registry', json(tablesOf(REG)), 'json', ['table']);
  put(L, 'rules/local', json({ ...tablesOf(RULES, ['LOCAL_SALES', 'CITY_BIZ', 'LEVY']), measures: plain(WEL.MEASURES), interventions: plain(C.INTERVENTIONS) }), 'json', ['rule']);
  put(L, 'rules/sources', json(sourcesWhere(/Everett/i)), 'json', ['rule']);
  put(L, 'sim/config', json(city.cfg), 'json', ['sim']);
  put(L, 'sim/genesis', json({ format: C.SAVE_FORMAT, version: C.CITY_VERSION, config: city.cfg, digest: city.genesisDigest, simmy: boot.sha256, law: city.lawSha, citizens: city.people.count, households: city.hh.count, firms: city.firms.count }), 'json', ['sim']);
  // the engine itself: the modules as they are in src/, the XPU and the Simmy replay it boots on
  const modules = [...engine].sort();
  put(L, 'engine/index', json({ entry: 'src/city.js', modules: modules.map((f) => [f, E.sha512Hex(new Uint8Array(src(f)))]), data: ['web/xpu.wasm', 'data/simmy/cells.json', 'data/simmy/authority_workload_rails.json'].map((f) => [f, E.sha512Hex(new Uint8Array(src(f)))]) }), 'json', ['engine']);
  for (const f of modules) put(L, 'engine/' + f, src(f), 'text', ['engine']);
  for (const f of ['web/xpu.wasm', 'data/simmy/cells.json', 'data/simmy/authority_workload_rails.json']) put(L, 'engine/' + f, src(f), f.endsWith('.json') ? 'json' : 'binary', ['engine']);
  // where its people live: the population raster's cut for the map's area, people per 3 arc-second cell in hundredths
  if (existsSync(join(ROOT, 'data/pop/everett_pop_3arcsec.json'))) {
    const meta = JSON.parse(src('data/pop/everett_pop_3arcsec.json')), f32 = new Float32Array(new Uint8Array(src('data/pop/everett_pop_3arcsec.f32')).buffer), u16 = new Uint16Array(f32.length);
    let people = 0; for (let i = 0; i < f32.length; i++) { const v = Math.max(0, Math.min(65535, Math.round(f32[i] * 100))); u16[i] = v; people += v; }
    put(L, 'map/population', json({ what: 'people per cell, in hundredths', rows: meta.rows, cols: meta.cols, north: meta.north, west: meta.west, cellDegreesLat: meta.cell_degrees_lat, cellDegreesLon: meta.cell_degrees_lon,
      people: Math.round(people / 100), order: 'uint16 little-endian, row by row from the north-west corner (record map/population.u16)', credit: meta.source_credit }), 'json', ['map']);
    put(L, 'map/population.u16', Buffer.from(u16.buffer), 'binary', ['map']);
  } }

/* ---------------------------------------------------------------- write, entangle, check */
mkdirSync(OUT, { recursive: true });
const inflate = async (z) => new Uint8Array(inflateSync(z));
const readBack = async (file) => { const c = await E.readContainer(new Uint8Array(readFileSync(file)), inflate); return { c, idx: await E.recordIndex(c) }; };
const py = (a) => { for (const exe of [process.env.PYTHON, 'python3', 'python'].filter(Boolean)) { try { return execFileSync(exe, ['-I', '-B', join(ROOT, 'tools/edhx_pack.py'), ...a], { encoding: 'utf8', maxBuffer: 1 << 26 }); } catch (e) { if (e.code === 'ENOENT') continue; throw new Error((e.stdout || '') + (e.stderr || e.message)); } } throw new Error('Python 3.9 or later is needed to write EDHX files'); };
let runtime = opt('runtime', ''); if (!runtime) for (const L of layers) { const f = join(OUT, L.key + '.edhx'); if (existsSync(f)) { runtime = f; break; } }
if (!runtime) { console.error('make_layers: give --runtime <a folder holding the edhx package, or any .edhx file> for the first build'); process.exit(64); }
const rebuilt = [];
for (const L of layers) {
  const file = join(OUT, L.key + '.edhx'), want = new Map(L.records.map((r) => [r.key, E.sha512Hex(new Uint8Array(r.bytes))]));
  if (want.size !== L.records.length) throw new Error(`${L.key}: a record key is used twice`);
  let same = existsSync(file) && !FORCE;
  if (same) { const { c, idx } = await readBack(file); const keys = [...idx.keys()].filter((k) => !idx.get(k).versions.at(-1).deleted); same = keys.length === want.size; if (same) for (const [k, h] of want) { const v = idx.get(k)?.versions.at(-1); if (!v || v.deleted || v.sha512 !== h) { same = false; break; } } }
  if (same) { console.log(`${L.key.padEnd(7)} unchanged (${L.records.length} records, ${statSync(file).size.toLocaleString('en-US')} bytes)`); continue; }
  const dir = join(STAGE, L.key); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const manifest = { summary: `Port Alder ${C.CITY_VERSION}: ${L.name}`, records: L.records.map((r, i) => { const p = String(i).padStart(4, '0') + '.bin'; writeFileSync(join(dir, p), r.bytes); return { key: r.key, path: p, type: r.type, tags: r.tags, tier: 'fast' }; }) };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  const rt = existsSync(file) && resolve(runtime) === resolve(file) ? join(STAGE, 'runtime.edhx') : runtime; if (rt !== runtime) writeFileSync(rt, readFileSync(file));
  const r = JSON.parse(py(['build', '--runtime', rt, '--out', file, '--name', 'port-alder-' + L.key, '--manifest', join(dir, 'manifest.json'), '--ceiling', String(CEILING)]));
  console.log(`${L.key.padEnd(7)} written: ${r.records} records, ${r.payload.toLocaleString('en-US')} bytes in, ${r.bytes.toLocaleString('en-US')} bytes on disk`);
  rebuilt.push(L.key); if (!opt('runtime', '')) runtime = file;
}
// the layers are nested: each is entangled with the one that holds it (their joint SHA-512 is in both)
if (rebuilt.length) for (let k = 0; k + 1 < layers.length; k++) { const a = join(OUT, layers[k].key + '.edhx'), b = join(OUT, layers[k + 1].key + '.edhx'); JSON.parse(py(['entangle', a, b, '--ceiling', String(CEILING)])); }
let total = 0;
for (const L of layers) {
  const file = join(OUT, L.key + '.edhx'), v = JSON.parse(py(['verify', file])), size = statSync(file).size; total += size;
  if (!v.ok) throw new Error(`${L.key}: the EDHX runtime's own verification failed: ${JSON.stringify(v.problems)}`);
  const { c, idx } = await readBack(file);
  for (const r of L.records) { const b = await E.getRecord(c, r.key, inflate); if (!b || Buffer.compare(Buffer.from(b), r.bytes) !== 0) throw new Error(`${L.key}: record ${r.key} does not read back as written`); }
  if (size > CEILING) throw new Error(`${file} is ${size} bytes, over the ceiling`);
  console.log(`${L.key.padEnd(7)} verified by EDHX and read back by src/edhx.js: ${idx.size} records, generation ${c.main.generation}, ${size.toLocaleString('en-US')} bytes, root ${String(c.main.root_sha512).slice(0, 16)}…`);
}
console.log(`layers: ${total.toLocaleString('en-US')} bytes in ${layers.length} files (each under ${(CEILING / 1048576).toFixed(0)} MB)`);
