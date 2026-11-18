// SPDX-License-Identifier: GPL-3.0-only
// Run Port Alder through its layer files: what a run writes into them is what the next run starts from.
//
//   node tools/edhx_run.mjs [--dir worlds/port-alder] [--days 30] [--from layers] [--quiet]
//
// The first run copies the five layer files (layers/*.edhx) into the folder. Every run then
//   1. opens city.edhx with src/edhx.js, checking its frames, its page root and every record it reads against the
//      SHA-512 in the container's state (whose root is in the head of the file);
//   2. takes the engine out of the file: every module, the XPU and the Simmy replay, as records, each checked against
//      the engine's index, and runs that engine (not the one in src/);
//   3. founds the city from the file's configuration and, if the file holds a state, restores it exactly and checks
//      its digest against the one the last run sealed;
//   4. lives the days asked for (the books are audited every day);
//   5. writes the new state back as the next generation: the tree, the tables that changed (in pieces, deflated), the
//      days' digests, and each layer's measures into its own file. The EDHX runtime inside the files does the writing
//      (tools/edhx_pack.py drives it), and old generations are compacted away so the files stay bounded.
// A state too large for one file is spread over city.s01.edhx, city.s02.edhx, ... so that no file passes 24 MB.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, copyFileSync, statSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { inflateSync, deflateSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const DIR = resolve(ROOT, opt('dir', 'worlds/port-alder')), DAYS = Number(opt('days', 30)), FROM = resolve(ROOT, opt('from', 'layers')), QUIET = args.includes('--quiet');
// a file's ceiling; the deflated state one file takes (a file briefly holds the versions a run replaces as well, and
// a hologram page is about 1.8 times what it carries, so 6 MB of state stays under the ceiling); a table's piece
const CEILING = 24 * 1024 * 1024, VOLUME = Number(process.env.PLUME_VOLUME_MB || 6) * 1024 * 1024, PIECE = Math.min(4, Number(process.env.PLUME_VOLUME_MB || 6)) * 1024 * 1024;
const LAYERS = ['city', 'county', 'state', 'nation', 'world'];
const say = (...a) => { if (!QUIET) console.log(...a); };
const E = await import('../src/edhx.js');
const inflate = async (z) => new Uint8Array(inflateSync(z));
const open = async (file) => { const c = await E.readContainer(new Uint8Array(readFileSync(file)), inflate); await E.recordIndex(c); return c; };
const text = async (c, key) => { const b = await E.getRecord(c, key, inflate); return b ? new TextDecoder().decode(b) : null; };
const py = (a) => { for (const exe of [process.env.PYTHON, 'python3', 'python'].filter(Boolean)) { try { return JSON.parse(execFileSync(exe, ['-I', '-B', join(ROOT, 'tools/edhx_pack.py'), ...a], { encoding: 'utf8', maxBuffer: 1 << 26 })); } catch (e) { if (e.code === 'ENOENT') continue; throw new Error((e.stdout || '') + (e.stderr || e.message)); } } throw new Error('Python 3.9 or later is needed to write EDHX files'); };

mkdirSync(DIR, { recursive: true });
for (const k of LAYERS) if (!existsSync(join(DIR, k + '.edhx'))) { if (!existsSync(join(FROM, k + '.edhx'))) throw new Error(`no ${k}.edhx in ${FROM}: build the layers first (node tools/make_layers.mjs)`); copyFileSync(join(FROM, k + '.edhx'), join(DIR, k + '.edhx')); }
const cityFile = join(DIR, 'city.edhx');
let t0 = Date.now();
const cont = await open(cityFile), rootBefore = cont.main.root_sha512;

/* ---------------------------------------------------------------- 2. the engine, out of the file */
const index = JSON.parse(await text(cont, 'engine/index')), work = mkdtempSync(join(tmpdir(), 'port-alder-engine-'));
process.on('exit', () => { try { rmSync(work, { recursive: true, force: true }); } catch { /* the folder is temporary either way */ } });
for (const [f, sha] of [...index.modules, ...index.data]) {
  const b = await E.getRecord(cont, 'engine/' + f, inflate); if (!b || E.sha512Hex(b) !== sha) throw new Error(`the engine's ${f} is not the one its index names`);
  mkdirSync(dirname(join(work, f)), { recursive: true }); writeFileSync(join(work, f), b);
}
const imp = (f) => import(pathToFileURL(join(work, f)).href);
const { City, CITY_VERSION } = await imp('src/city.js'), { simmyBoot } = await imp('src/core.js'), { createWasm1T } = await imp('src/engines.js'), { snapshot, restore } = await imp('src/snapshot.js');
const boot = simmyBoot(JSON.parse(readFileSync(join(work, 'data/simmy/cells.json'))), JSON.parse(readFileSync(join(work, 'data/simmy/authority_workload_rails.json'))));
const engine = await createWasm1T(readFileSync(join(work, 'web/xpu.wasm')));
say(`city.edhx: generation ${cont.main.generation}, root ${rootBefore.slice(0, 16)}…; engine ${CITY_VERSION} (${index.modules.length} modules) taken from the file and checked (${Date.now() - t0} ms)`);

/* ---------------------------------------------------------------- 3. the city: founded, then restored */
t0 = Date.now();
const cfg = JSON.parse(await text(cont, 'sim/config')), city = new City(cfg, boot);
const genesis = JSON.parse(await text(cont, 'sim/genesis')); if (city.genesisDigest !== genesis.digest) throw new Error('this engine does not found the city the file was sealed with');
const prior = JSON.parse((await text(cont, 'state/manifest')) || 'null'), volumes = new Map([[0, cont]]);
const volumeFile = (v) => (v === 0 ? cityFile : join(DIR, `city.s${String(v).padStart(2, '0')}.edhx`));
const volume = async (v) => { if (!volumes.has(v)) volumes.set(v, await open(volumeFile(v))); return volumes.get(v); };
if (prior) {
  const blobs = [];
  for (const b of prior.blobs) {
    const out = new Uint8Array(b.bytes); let o = 0;
    for (const p of b.pieces) { const z = await E.getRecordVersion(await volume(p.volume), p.key, p.stored, inflate); if (!z) throw new Error(`the state's ${p.key} is missing`); const raw = inflateSync(z); if (E.sha512Hex(raw) !== p.sha512) throw new Error(`the state's ${p.key} differs from its SHA-512`); out.set(raw, o); o += raw.length; }
    if (o !== b.bytes) throw new Error('a table of the state has the wrong length'); blobs.push(out);
  }
  const tree = JSON.parse(inflateSync(await E.getRecordVersion(cont, 'state/tree', prior.tree, inflate)).toString('utf8'));
  restore(city, { format: prior.format, cfg: prior.cfg, tree, blobs });
  if (city.digest !== prior.digest || city.epoch !== prior.epoch) throw new Error('the restored city is not the one the last run sealed');
  say(`restored day ${prior.epoch} (${prior.date}) exactly: digest ${city.digest.slice(0, 16)}… (${Date.now() - t0} ms)`);
} else say(`founded: ${city.people.count} citizens, ${city.hh.count} households, ${city.firms.count} firms; digest ${city.digest.slice(0, 16)}… (${Date.now() - t0} ms)`);

/* ---------------------------------------------------------------- 4. the days */
t0 = Date.now();
const chain = [], measures = []; let fails = 0, last = null;
for (let k = 0; k < DAYS; k++) {
  const R = await city.step(engine); last = R; chain.push([R.epoch, R.date, R.digest]); if (!R.audit.ok) fails++;
  if (R.date.endsWith('-01') || k === DAYS - 1) { const s = R.stats.series, K = city.outer.kpi; measures.push({ epoch: R.epoch, date: R.date, city: { citizens: s.pop, households: s.households, firms: s.firms, unemployment: s.unemployment, mood: s.mood }, county: K?.county || null, state: K?.state || null, nation: K?.nation || null });
    say(`${R.date} citizens ${s.pop} households ${s.households} firms ${s.firms} unemployment ${(s.unemployment / 100).toFixed(1)}%`); }
}
if (fails) throw new Error(`the books failed their audit on ${fails} days: nothing was written`);
say(`${DAYS} days in ${((Date.now() - t0) / 1000).toFixed(1)} s; digest ${city.digest.slice(0, 16)}…`);

/* ---------------------------------------------------------------- 5. the outputs, back into the files */
t0 = Date.now();
const snap = snapshot(city), stage = join(work, 'out'); mkdirSync(stage, { recursive: true });
const previous = new Map(); if (prior) for (const b of prior.blobs) for (const p of b.pieces) previous.set(p.key, p);
const perVolume = new Map(), room = new Map(), manifestBlobs = []; let written = 0, kept = 0, fileNo = 0;
const add = (v, key, bytes, type, tags) => { if (!perVolume.has(v)) perVolume.set(v, []); const path = `r${String(fileNo++).padStart(5, '0')}.bin`; writeFileSync(join(stage, path), bytes); perVolume.get(v).push({ key, path, type, tags, tier: 'fast' }); };
// what each volume already holds of the state that stays (so the pieces that change go where there is room)
for (const p of previous.values()) room.set(p.volume, (room.get(p.volume) || 0) + p.deflated);
const place = (size) => { for (let v = 0; ; v++) { const used = room.get(v) || 0; if (used + size <= VOLUME || used === 0) { room.set(v, used + size); return v; } } };
snap.blobs.forEach((blob, n) => {
  const pieces = [];
  for (let o = 0, k = 0; o < blob.length || (blob.length === 0 && k === 0); o += PIECE, k++) {
    const raw = blob.subarray(o, Math.min(blob.length, o + PIECE)), sha512 = E.sha512Hex(raw), key = `state/b/${n}/${k}`, was = previous.get(key);
    if (was && was.sha512 === sha512) { pieces.push(was); kept++; continue; }                     // unchanged since the last run: it stays where it is
    // a piece that changed replaces its earlier version in the file it is in; a new piece goes where there is room
    const z = deflateSync(raw, { level: 6 }); let v;
    if (was) { v = was.volume; room.set(v, (room.get(v) || 0) - was.deflated + z.length); } else v = place(z.length);
    add(v, key, z, 'binary', ['state']); pieces.push({ key, volume: v, sha512, stored: E.sha512Hex(z), deflated: z.length }); written++;
  }
  manifestBlobs.push({ bytes: blob.length, pieces });
});
const treeZ = deflateSync(Buffer.from(JSON.stringify(snap.tree), 'utf8'), { level: 6 });
add(0, 'state/tree', treeZ, 'binary', ['state']);
add(0, 'state/manifest', Buffer.from(JSON.stringify({ format: snap.format, cfg: snap.cfg, epoch: city.epoch, date: last.date, digest: city.digest, engine: CITY_VERSION, sealedOn: rootBefore, tree: E.sha512Hex(treeZ), volumes: Math.max(...room.keys(), 0) + 1, blobs: manifestBlobs }, null, 1)), 'json', ['state']);
add(0, `sim/chain/${String(chain[0][0]).padStart(6, '0')}`, Buffer.from(JSON.stringify({ from: chain[0][0], to: chain[chain.length - 1][0], startedOn: rootBefore, days: chain }, null, 1)), 'json', ['sim']);
add(0, 'sim/measures/latest', Buffer.from(JSON.stringify(measures, null, 1)), 'json', ['sim']);
// the pieces first, the manifest last: until city.edhx is committed the files still hold the state the last run
// sealed (earlier versions are kept until the compaction that follows), so a run that is cut short loses nothing
const order = [...perVolume].sort((a, b) => b[0] - a[0]);
for (const [v, records] of order) {
  const file = volumeFile(v), manifest = join(stage, `manifest-${v}.json`); writeFileSync(manifest, JSON.stringify({ summary: `day ${city.epoch} (${last.date})`, records }));
  if (existsSync(file)) py(['update', file, '--manifest', manifest, '--ceiling', String(CEILING)]); else py(['build', '--runtime', cityFile, '--out', file, '--name', `port-alder-city-state-${v}`, '--manifest', manifest, '--ceiling', String(CEILING)]);
}
for (const [v] of order) py(['compact', volumeFile(v), '--retain', '1', '--ceiling', String(CEILING)]);
// each outer layer's measures go into its own file
for (const k of ['county', 'state', 'nation']) {
  const rows = measures.map((m) => ({ epoch: m.epoch, date: m.date, ...m[k] })), path = `k-${k}.bin`, manifest = join(stage, `manifest-${k}.json`); writeFileSync(join(stage, path), JSON.stringify(rows, null, 1));
  writeFileSync(manifest, JSON.stringify({ summary: `day ${city.epoch} (${last.date})`, records: [{ key: 'sim/measures/latest', path, type: 'json', tags: ['sim'], tier: 'fast' }] }));
  py(['update', join(DIR, k + '.edhx'), '--manifest', manifest, '--retain', '2', '--ceiling', String(CEILING)]);
}
// read the state back with the JavaScript reader, as the next run will
const after = await open(cityFile), sealed = JSON.parse(await text(after, 'state/manifest'));
if (sealed.digest !== city.digest) throw new Error('the state did not read back as written');
let bytes = 0; for (let v = 0; v < sealed.volumes; v++) { const size = statSync(volumeFile(v)).size; bytes += size; if (size > CEILING) throw new Error(`${volumeFile(v)} passed the ceiling`); }
say(`written: ${written} table pieces changed, ${kept} unchanged; ${sealed.volumes} file${sealed.volumes > 1 ? 's' : ''} of state, ${bytes.toLocaleString('en-US')} bytes (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
say(`city.edhx: generation ${after.main.generation}, root ${after.main.root_sha512.slice(0, 16)}… (was ${rootBefore.slice(0, 16)}…)`);
console.log(JSON.stringify({ dir: DIR, epoch: city.epoch, date: last.date, digest: city.digest, generation: Number(after.main.generation), root: after.main.root_sha512, volumes: sealed.volumes, bytes }));
