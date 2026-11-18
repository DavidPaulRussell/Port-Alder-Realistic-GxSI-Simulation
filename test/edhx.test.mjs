// SPDX-License-Identifier: GPL-3.0-only
// The layer files (layers/*.edhx): each reads with src/edhx.js and every record matches its SHA-512; the laws in the
// files are the functions that run; the engine inside the city's file is the one in src/; damage is noticed; and a
// run through the files goes on exactly as an uninterrupted run does. EDHX_QUICK=1 skips the runs (they need Python).
import { readFileSync, existsSync, statSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as E from '../src/edhx.js';
import * as LAWS_MOD from '../src/laws.js';
import { LAW_ROWS, City, DEFAULT_CONFIG } from '../src/city.js';
import { simmyBoot } from '../src/core.js';
import { createWasm1T } from '../src/engines.js';

let pass = 0, fail = 0; const check = (n, ok, info = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${info}`); };
const ROOT = new URL('..', import.meta.url).pathname, rd = (f) => readFileSync(new URL('../' + f, import.meta.url));
const inflate = async (z) => new Uint8Array(inflateSync(z)), dec = new TextDecoder();
const LAYERS = ['world', 'nation', 'state', 'county', 'city'];

// 1. a page is a codeword: what goes in comes out, in every tier
{ let ok = true; for (const tier of E.TIER_ORDER) { const n = E.capacity(tier) - 7, data = new Uint8Array(n); for (let i = 0; i < n; i++) data[i] = (i * 131 + (i >> 5) * 17 + 3) & 255; const page = E.encodePage(data, tier, 5, 9), back = E.decodePage(page); if (page.length !== E.PAGE_BYTES || back.data.length !== n || !back.data.every((x, i) => x === data[i]) || back.header.tier !== tier) ok = false; }
  check('a hologram page gives back what was put in, in all four tiers', ok); }
{ const t = new TextEncoder().encode('Port Alder, on the Salish shore. '.repeat(50)), e = E.edacEncode(t), d = E.edacDecode(e); check("EDHX's arithmetic coder round-trips", d.length === t.length && d.every((x, i) => x === t[i]) && e.length < t.length / 2, `${t.length} -> ${e.length} bytes`); }

// 2. the five layers
const open = {};
for (const k of LAYERS) {
  const f = `layers/${k}.edhx`; if (!existsSync(new URL('../' + f, import.meta.url))) { check(`${f} is here`, false, '(node tools/make_layers.mjs builds it)'); continue; }
  const bytes = new Uint8Array(rd(f)), c = await E.readContainer(bytes, inflate), idx = await E.recordIndex(c); open[k] = { c, idx, bytes };
  let n = 0, bad = 0; for (const key of idx.keys()) { try { const b = await E.getRecord(c, key, inflate); if (b) n++; } catch { bad++; } }
  const about = JSON.parse(dec.decode(await E.getRecord(c, 'layer/about', inflate)));
  check(`${f}: frames, page root and footer verify; ${n} records match their SHA-512`, bad === 0 && n > 20 && about.layer === k && /^[0-9a-f]{128}$/.test(c.main.root_sha512), `${bytes.length.toLocaleString('en-US')} bytes`);
  check(`${f} is under GitHub's 25 MB`, bytes.length < 25 * 1024 * 1024);
}
if (open.world) {
  const { c } = open.world, book = JSON.parse(dec.decode(await E.getRecord(c, 'laws/book', inflate)));
  let same = true, runs = 0;
  for (const [id] of LAW_ROWS) { const L = JSON.parse(dec.decode(await E.getRecord(c, 'laws/' + id, inflate))); for (const r of L.runs) { runs++; if (typeof LAWS_MOD[r.function] !== 'function' || LAWS_MOD[r.function].toString() !== r.source) same = false; } }
  check('the world file holds the whole law book, each law as the function that runs it', book.rows.length === LAW_ROWS.length && same && runs > 60, `${LAW_ROWS.length} laws, ${runs} functions`);
}
if (open.city) {
  const { c } = open.city, index = JSON.parse(dec.decode(await E.getRecord(c, 'engine/index', inflate)));
  const stale = [...index.modules, ...index.data].filter(([f, sha]) => E.sha512Hex(new Uint8Array(rd(f))) !== sha).map(([f]) => f);
  check("the engine inside the city's file is the engine in src/", stale.length === 0 && index.modules.length > 20, stale.length ? `stale: ${stale.join(' ')} (node tools/make_layers.mjs)` : `${index.modules.length} modules`);
  const pop = JSON.parse(dec.decode(await E.getRecord(c, 'map/population', inflate))), u16 = await E.getRecord(c, 'map/population.u16', inflate);
  check('the city file holds where its people live, credited to its source', u16.length === pop.rows * pop.cols * 2 && pop.people > 300000 && /WorldPop/.test(pop.credit) && /CC BY 4\.0/.test(pop.credit), `${pop.people.toLocaleString('en-US')} people in ${pop.rows} x ${pop.cols} cells`);
  const tif = readdirSync(new URL('..', import.meta.url), { recursive: true }).filter((f) => /\.tiff?$/i.test(String(f)) && !String(f).includes('node_modules'));
  check('no raster file is in the repository', tif.length === 0, tif.join(' '));
}
{ const ent = (k) => Object.keys(open[k]?.c.state.entanglements || {}).length; check('each layer is entangled with the layers next to it', ent('world') === 1 && ent('nation') === 2 && ent('state') === 2 && ent('county') === 2 && ent('city') === 1); }
// 3. damage is noticed
if (open.county) {
  const last = open.county.bytes.length - 376 - E.PAGE_BYTES, all = async (b) => { const c = await E.readContainer(b, inflate); for (let i = 0; i < c.pages.length; i++) c.pageData(i); return true; };
  const tile = open.county.bytes.slice(); tile[last + 4400] ^= 0x40;                          // in the page's first tile
  let threw = false; try { await all(tile); } catch (e) { threw = /digest|codeword|mismatch|fail/i.test(e.message); }
  check('one flipped bit in a page is noticed', threw);
  const head = open.county.bytes.slice(); head[last + 3000] ^= 0x40;                          // in the first copy of the page's header
  let ok = false; try { ok = await all(head); } catch { ok = false; }
  check("a page whose first header copy is damaged is read by its second", ok);
}

// 4. a run through the files continues exactly (the state in two files, to exercise the spreading)
const python = (() => { for (const exe of [process.env.PYTHON, 'python3', 'python'].filter(Boolean)) { try { execFileSync(exe, ['-c', 'import sys; sys.exit(0 if sys.version_info[:2] >= (3, 9) else 1)']); return exe; } catch { /* next */ } } return null; })();
if (process.env.EDHX_QUICK || !python || !open.city) console.log('SKIP  the runs through the files' + (python ? '' : ' (Python 3.9 or later is needed to write EDHX files)'));
else {
  const dir = mkdtempSync(join(tmpdir(), 'port-alder-world-')), env = { ...process.env, PLUME_VOLUME_MB: '3' };
  const run = (days) => JSON.parse(execFileSync(process.execPath, [join(ROOT, 'tools/edhx_run.mjs'), '--dir', dir, '--days', String(days), '--quiet'], { encoding: 'utf8', env, maxBuffer: 1 << 26 }).trim().split('\n').pop());
  const r1 = run(5), r2 = run(4);
  const boot = simmyBoot(JSON.parse(rd('data/simmy/cells.json')), JSON.parse(rd('data/simmy/authority_workload_rails.json'))), engine = await createWasm1T(rd('web/xpu.wasm'));
  const direct = new City({ ...DEFAULT_CONFIG, boot: 'instant' }, boot); for (let k = 0; k < 9; k++) await direct.step(engine);
  check('two runs through the files end where one uninterrupted run does', r2.epoch === 9 && r2.digest === direct.digest, `day ${r2.epoch}, digest ${r2.digest.slice(0, 16)}…`);
  check('every run seals a new generation under a new root', r2.generation > r1.generation && r1.root !== r2.root && /^[0-9a-f]{128}$/.test(r2.root));
  const sizes = readdirSync(dir).map((f) => statSync(join(dir, f)).size);
  check('the state is spread over files that each stay under 25 MB', r2.volumes >= 2 && sizes.every((s) => s < 25 * 1024 * 1024), `${r2.volumes} files of state, largest ${Math.max(...sizes).toLocaleString('en-US')} bytes`);
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
