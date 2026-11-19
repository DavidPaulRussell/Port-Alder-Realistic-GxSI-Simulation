// SPDX-License-Identifier: GPL-3.0-only
// The city on the real map: it is founded where the population table counts people, on ground shaped from
// OpenStreetMap and the terrain (the Sound, the lakes, the airfield, the motorways and their bridges, the piers),
// it houses the citizens the table calls for, its books balance, and the same seed gives the same city twice.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let pass = 0, fail = 0; const check = (n, ok, info = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${info}`); };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), DAYS = Number(process.env.DAYS || 2);
// a look at the founded map, in a process of its own (the map's size is fixed when the modules load)
const PROBE = `
const root = ${JSON.stringify(ROOT)}, fs = await import('node:fs');
const { simmyBoot } = await import(root + '/src/core.js'), { City, BKIND } = await import(root + '/src/city.js'), { KIND, layWorld } = await import(root + '/src/ground.js'), { GROUND } = await import(root + '/src/ground_data.js'), { N, SCALE } = await import(root + '/src/scale.js');
const rd = (f) => JSON.parse(fs.readFileSync(root + '/' + f, 'utf8')), city = new City({ seed: 20261117, boot: 'instant' }, simmyBoot(rd('data/simmy/cells.json'), rd('data/simmy/authority_workload_rails.json'))), W = city.world, T = GROUND.pop;
const at = (lat, lon) => Math.floor(((T.north - lat) / (T.rows * T.dLat)) * N) * N + Math.floor(((lon - T.west) / (T.cols * T.dLon)) * N);
const near = (c, f) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (f(c + dy * N + dx)) return true; return false; };
let hwy = 0, bridge = 0, real = 0, pier = 0, runway = 0, sea = 0; for (let c = 0; c < N * N; c++) { hwy += W.hwy[c]; bridge += W.road[c] === 3; real += W.real[c] ? 1 : 0; pier += W.cover[c] === KIND.pier; runway += W.strip[c] === 1; sea += W.cover[c] === KIND.sea; }
const homes = {}; for (const b of W.buildings.each()) { const k = BKIND[W.buildings.kind[b]].key; homes[k] = (homes[k] || 0) + W.buildings.units[b]; }
const A = layWorld(96); let top = 0, west = 0; for (let i = 0; i < 96 * 96; i++) { if (A.height[i] > top) top = A.height[i]; } for (let y = 0; y < 96; y++) for (let x = 0; x < 32; x++) west += A.kind[y * 96 + x] === KIND.sea;
console.log(JSON.stringify({ n: N, ratio: SCALE.ratio, people: T.people, citizens: city.people.count, households: city.hh.count, firms: city.firms.count, homes, hwy, bridge, real, pier, runway, sea,
  corner: W.water[N + 1], field: (() => { let n = 0; for (let c = 0; c < N * N; c++) { if (W.strip[c] !== 1) continue; const x = c % N, y = (c - x) / N, lat = T.north - ((y + 0.5) / N) * T.rows * T.dLat, lon = T.west + ((x + 0.5) / N) * T.cols * T.dLon; if (lat > 47.895 && lat < 47.925 && lon > -122.29 && lon < -122.27) n++; } return n; })(), lake: W.water[at(48.007, -122.085)], silver: near(at(47.8925, -122.21), (c) => W.water[c] === 1), hall: W.water[at(47.979, -122.2085)],
  routes: W.routes.length, sites: W.sites.length, top: Math.round(top), west, roads: A.roads.length }));
`;
const probe = (scale) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', PROBE], { encoding: 'utf8', env: { ...process.env, PLUME_SCALE: scale }, maxBuffer: 1 << 26 }).trim().split('\n').pop());
const run = (scale) => { const out = execFileSync(process.execPath, [join(ROOT, 'tools/run_city.mjs'), String(DAYS)], { encoding: 'utf8', env: { ...process.env, PLUME_SCALE: scale }, maxBuffer: 1 << 26 }), end = /audits failed on (\d+) days; digest ([0-9a-f]+)/.exec(out); return { failed: Number(end?.[1] ?? -1), digest: end?.[2] || '' }; };

const q = probe('quick'), e = probe('everett');
for (const [name, m] of [['the quick map (82 m to a cell)', q], ['the map (41 m to a cell)', e]]) {
  const want = m.people / m.ratio;
  check(`${name} is founded with the citizens the population table calls for`, Math.abs(m.citizens - want) / want < 0.015, `${m.citizens.toLocaleString('en-US')} citizens for ${m.people.toLocaleString('en-US')} people at one in ${m.ratio}; ${m.households.toLocaleString('en-US')} households, ${m.firms} firms`);
  check(`${name}: the Sound is water, the lakes are lakes, the centre is land`, m.corner === 1 && m.lake === 1 && m.silver && m.hall === 0 && m.sea > m.n * m.n * 0.1, `${((m.sea / (m.n * m.n)) * 100).toFixed(1)}% sea`);
  check(`${name}: the airfield's runway is where Paine Field's is`, m.field > m.n / 26 && m.runway > 20, `${m.runway} runway cells, ${m.field} of them Paine Field's`);
  check(`${name}: real roads, motorways and bridges`, m.real > 1500 && m.hwy > 300 && m.bridge > 10, `${m.real} road cells on real lines, ${m.hwy} of motorway, ${m.bridge} on bridges`);
  check(`${name}: civic sites and bus routes`, m.sites >= 19 && m.routes >= 4, `${m.sites} sites, ${m.routes} routes`);
}
check('the fine map has the piers of the port', e.pier > 10, `${e.pier} cells of pier`);
check('most homes on the fine map are houses, as around Everett', e.homes.house > (e.homes.apartments || 0), JSON.stringify(e.homes));
check('the world around the map: the Sound to the west, the mountains to the east, the roads beyond', e.top > 1000 && e.west > 0.4 * 96 * 32 && e.roads > 1000, `highest ground ${e.top} m, ${e.roads} road lines`);
const a = run('quick'), b = run('quick');
check(`the books balance on each of ${DAYS} days`, a.failed === 0);
check('the same seed founds the same city twice', a.digest.length >= 16 && a.digest === b.digest, `digest ${a.digest}…`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
