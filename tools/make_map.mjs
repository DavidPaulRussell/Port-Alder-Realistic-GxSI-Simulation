// SPDX-License-Identifier: GPL-3.0-only
// Make src/ground_data.js from the real place: what the map and the world around it are shaped from.
//
//   node tools/make_map.mjs <port_alder_world folder>
//
// It takes
//   - the population of the map's area (data/pop/everett_pop_3arcsec.*: people per 3 arc-second cell, cut out of a
//     WorldPop raster by tools/pop_extract.py). The map covers exactly this cut;
//   - what tools/world_fetch.py fetched for a square three times as wide: OpenStreetMap as vector map tiles (shores,
//     lakes, rivers, wetlands, land use, roads, railways, ferries, public buildings; OpenFreeMap's tiles in the
//     OpenMapTiles layout, or VersaTiles' in the Shortbread layout) and the Terrain Tiles' heights;
//   - the few hand-placed things the simulation names itself (data/ground/everett_outline.json: the centres and the
//     civic buildings),
// and writes one module the simulation reads in the page and in Node: the kind of ground of every 41 m of the map and
// every 82 m of the world around it, their heights, and the roads, rivers and railways as lines. Nothing is drawn
// here; src/ground.js lays it over the map's cells when the city is founded.
//
// (c) OpenStreetMap contributors, ODbL 1.0 (the shapes derived here stay under it). Terrain Tiles: Mapzen/Tilezen,
// USGS 3DEP and others. WorldPop R2025A v1, CC BY 4.0.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync, inflateSync } from 'node:zlib';
import { join } from 'node:path';

const dir = process.argv[2]; if (!dir || !existsSync(dir)) { console.error('usage: node tools/make_map.mjs <port_alder_world folder> [openfreemap|versatiles]'); process.exit(2); }
const SOURCE = process.argv[3] || (existsSync(join(dir, 'vector_openfreemap.json')) ? 'openfreemap' : 'versatiles');
const rd = (f) => readFileSync(new URL('../' + f, import.meta.url));
const meta = JSON.parse(rd('data/pop/everett_pop_3arcsec.json')), f32 = new Float32Array(new Uint8Array(rd('data/pop/everett_pop_3arcsec.f32')).buffer);
const outline = JSON.parse(rd('data/ground/everett_outline.json'));
const t00 = Date.now(), lap = (s) => console.log(`  ${((Date.now() - t00) / 1000).toFixed(1)} s  ${s}`);

/* the map (the population cut) and the world (three times as wide, the map in its middle) */
const dLat = meta.cell_degrees_lat, dLon = meta.cell_degrees_lon;
const mapN = meta.north, mapS = meta.north - meta.rows * dLat, mapW = meta.west, mapE = meta.west + meta.cols * dLon;
const centre = [Number(((mapN + mapS) / 2).toFixed(6)), Number(((mapW + mapE) / 2).toFixed(6))];
const M_LAT = 111194.9, M_LON = Number((M_LAT * Math.cos((centre[0] * Math.PI) / 180)).toFixed(3));
const halfX = Number((((mapE - mapW) / 2) * M_LON).toFixed(1)), halfY = Number((((mapN - mapS) / 2) * M_LAT).toFixed(1));
const TIMES = 3, N_ = centre[0] + (TIMES / 2) * (mapN - mapS), S_ = centre[0] - (TIMES / 2) * (mapN - mapS), W_ = centre[1] - (TIMES / 2) * (mapE - mapW), E_ = centre[1] + (TIMES / 2) * (mapE - mapW);
const FINE = 512;

/* the kinds of ground, and which wins where shapes overlap (the later in PRI, the stronger) */
const K = { none: 0, sea: 1, river: 2, lake: 3, wetland: 4, forest: 5, farm: 6, grass: 7, industrial: 8, commercial: 9, airfield: 10, runway: 11, beach: 12, residential: 13, pier: 14 };
const PRI = new Uint8Array(16); [K.none, K.residential, K.farm, K.grass, K.forest, K.wetland, K.industrial, K.commercial, K.airfield, K.runway, K.beach, K.lake, K.river, K.sea, K.pier].forEach((k, i) => { PRI[k] = i; });
// a working grid over a box: shapes are filled into it, the stronger kind winning
function Sheet(size, north, south, west, east) {
  const grid = new Uint8Array(size * size), fx = (lon) => ((lon - west) / (east - west)) * size, fy = (lat) => ((north - lat) / (north - south)) * size, xs = [];
  // fill a shape (every ring of it together, even-odd, so holes are holes); rings are [lon, lat, lon, lat, ...]
  const paint = (kind, rings) => {
    let y0 = 1e9, y1 = -1e9; const edges = [];
    for (const r of rings) for (let i = 0; i + 3 < r.length; i += 2) { const ax = fx(r[i]), ay = fy(r[i + 1]), bx = fx(r[i + 2]), by = fy(r[i + 3]); if (ay === by) continue; edges.push(ay < by ? [ax, ay, bx, by] : [bx, by, ax, ay]); if (Math.min(ay, by) < y0) y0 = Math.min(ay, by); if (Math.max(ay, by) > y1) y1 = Math.max(ay, by); }
    if (!edges.length) return;
    const r0 = Math.max(0, Math.ceil(y0 - 0.5)), r1 = Math.min(size - 1, Math.floor(y1 - 0.5)), p = PRI[kind];
    for (let r = r0; r <= r1; r++) {
      const y = r + 0.5; xs.length = 0;
      for (const e of edges) if (y >= e[1] && y < e[3]) xs.push(e[0] + ((y - e[1]) / (e[3] - e[1])) * (e[2] - e[0]));
      if (xs.length < 2) continue; xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) { const c0 = Math.max(0, Math.ceil(xs[k] - 0.5)), c1 = Math.min(size - 1, Math.ceil(xs[k + 1] - 0.5) - 1); for (let c = c0; c <= c1; c++) { const g = r * size + c; if (PRI[grid[g]] < p) grid[g] = kind; } }
    }
  };
  // every cell a line passes through
  const along = (kind, r) => { const p = PRI[kind]; for (let i = 0; i + 3 < r.length; i += 2) { const ax = fx(r[i]), ay = fy(r[i + 1]), bx = fx(r[i + 2]), by = fy(r[i + 3]), n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2)); for (let k = 0; k <= n; k++) { const x = Math.floor(ax + ((bx - ax) * k) / n), y = Math.floor(ay + ((by - ay) * k) / n); if (x >= 0 && y >= 0 && x < size && y < size && PRI[grid[y * size + x]] < p) grid[y * size + x] = kind; } } };
  return { grid, size, paint, along };
}
const world = Sheet(FINE * TIMES, N_, S_, W_, E_), map = Sheet(FINE * 2, mapN, mapS, mapW, mapE);   // 41 m cells over the world, 21 m over the map

/* reading vector map tiles (Mapbox Vector Tile: a protocol-buffer message of layers of features) */
function reader(buf) {
  let p = 0;
  return { more: () => p < buf.length, at: () => p,
    varint() { let r = 0, s = 1, b; do { b = buf[p++]; r += (b & 127) * s; s *= 128; } while (b & 128); return r; },
    bytes() { const n = this.varint(), o = buf.subarray(p, p + n); p += n; return o; },
    skip(wire) { if (wire === 0) this.varint(); else if (wire === 1) p += 8; else if (wire === 2) p += this.varint(); else if (wire === 5) p += 4; else throw new Error('a tile has a field of an unknown kind'); },
    f32() { const v = buf.readFloatLE(p); p += 4; return v; }, f64() { const v = buf.readDoubleLE(p); p += 8; return v; } };
}
const zz = (v) => (v % 2 ? -(v + 1) / 2 : v / 2);
function readTile(buf) {
  const layers = {}, top = reader(buf);
  while (top.more()) {
    const tag = top.varint(); if (tag >> 3 !== 3 || (tag & 7) !== 2) { top.skip(tag & 7); continue; }
    const L = reader(top.bytes()), keys = [], values = [], feats = []; let name = '', extent = 4096;
    while (L.more()) {
      const t = L.varint(), f = t >> 3, w = t & 7;
      if (f === 1) name = L.bytes().toString('utf8'); else if (f === 2) feats.push(L.bytes()); else if (f === 3) keys.push(L.bytes().toString('utf8')); else if (f === 5) extent = L.varint();
      else if (f === 4) { const V = reader(L.bytes()); let val = null; while (V.more()) { const vt = V.varint(), vf = vt >> 3; if (vf === 1) val = V.bytes().toString('utf8'); else if (vf === 2) val = V.f32(); else if (vf === 3) val = V.f64(); else if (vf === 4 || vf === 5) val = V.varint(); else if (vf === 6) val = zz(V.varint()); else if (vf === 7) val = V.varint() !== 0; else V.skip(vt & 7); } values.push(val); }
      else L.skip(w);
    }
    const out = [];
    for (const fb of feats) {
      const F = reader(fb), props = {}; let type = 0, g = null;
      while (F.more()) { const t = F.varint(), f = t >> 3; if (f === 2) { const T = reader(F.bytes()); while (T.more()) { const k = T.varint(), v = T.varint(); props[keys[k]] = values[v]; } } else if (f === 3) type = F.varint(); else if (f === 4) g = F.bytes(); else F.skip(t & 7); }
      if (!g) continue;
      // the shape: moves, lines and closings, each point the difference from the one before
      const G = reader(g), parts = []; let cur = null, x = 0, y = 0;
      while (G.more()) { const c = G.varint(), cmd = c & 7, n = c >> 3; if (cmd === 1) for (let k = 0; k < n; k++) { x += zz(G.varint()); y += zz(G.varint()); cur = [x, y]; parts.push(cur); } else if (cmd === 2) for (let k = 0; k < n; k++) { x += zz(G.varint()); y += zz(G.varint()); cur.push(x, y); } else if (cmd === 7 && cur) cur.push(cur[0], cur[1]); }
      out.push({ type, props, parts });
    }
    layers[name] = { extent, features: out };
  }
  return layers;
}
// a tile's own coordinates as longitude and latitude
const lonLat = (z, tx, ty, E, part) => { const n = 2 ** z, o = new Array(part.length); for (let i = 0; i < part.length; i += 2) { o[i] = ((tx + part[i] / E) / n) * 360 - 180; o[i + 1] = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + part[i + 1] / E)) / n))) * 180) / Math.PI; } return o; };
// a line cut to its tile's own square (tiles overlap a little; cut, the pieces of neighbouring tiles meet end to end)
function cut(part, E) {
  const out = []; let run = null;
  for (let i = 0; i + 3 < part.length; i += 2) {
    let ax = part[i], ay = part[i + 1], bx = part[i + 2], by = part[i + 3], t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay; let ok = true;
    for (const [p, q] of [[-dx, ax], [dx, E - ax], [-dy, ay], [dy, E - ay]]) { if (p === 0) { if (q < 0) ok = false; } else { const r = q / p; if (p < 0) { if (r > t1) ok = false; else if (r > t0) t0 = r; } else { if (r < t0) ok = false; else if (r < t1) t1 = r; } } }
    if (!ok || t0 > t1) { run = null; continue; }
    const sx = ax + t0 * dx, sy = ay + t0 * dy, ex = ax + t1 * dx, ey = ay + t1 * dy;
    if (run && run[run.length - 2] === sx && run[run.length - 1] === sy) run.push(ex, ey); else { run = [sx, sy, ex, ey]; out.push(run); }
    if (t1 < 1) run = null;
  }
  return out;
}

/* what each layout calls things: the kind of ground of a shape, the class of a road, and so on */
const has = (v, re) => typeof v === 'string' && re.test(v);
const LAYOUT = {
  openfreemap: {
    ground(layer, p) {
      if (layer === 'water') return p.class === 'ocean' ? K.sea : p.class === 'river' ? K.river : K.lake;
      if (layer === 'landcover') return p.class === 'wood' ? K.forest : p.class === 'wetland' ? K.wetland : p.class === 'sand' ? K.beach : p.class === 'farmland' ? K.farm : p.class === 'grass' ? (has(p.subclass, /^(meadow|grassland|heath|scrub)$/) ? K.farm : K.grass) : 0;
      if (layer === 'landuse') return p.class === 'residential' ? K.residential : has(p.class, /^(commercial|retail)$/) ? K.commercial : has(p.class, /^(industrial|railway|quarry|military|garages)$/) ? K.industrial : has(p.class, /^(cemetery|stadium|pitch|playground|track)$/) ? K.grass : 0;
      if (layer === 'aeroway') return p.class === 'aerodrome' ? K.airfield : has(p.class, /^(runway|taxiway|apron|helipad)$/) ? K.runway : 0;
      if (layer === 'transportation') return p.class === 'pier' ? K.pier : 0;
      return 0;
    },
    road: (layer, p) => (layer !== 'transportation' || p.brunnel === 'tunnel' ? -1 : { motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4, minor: 5 }[p.class] ?? -1), link: (p) => p.ramp === 1 || p.ramp === true, bridge: (p) => p.brunnel === 'bridge', oneway: (p) => (p.oneway === 1 || p.oneway === true ? 1 : p.oneway === -1 ? -1 : 0),
    pierLine: (layer, p) => layer === 'transportation' && p.class === 'pier',
    rail: (layer, p) => (layer !== 'transportation' ? -1 : p.class === 'ferry' ? 2 : p.class === 'rail' && !has(p.service, /^(yard|siding|spur|crossover)$/) ? 0 : p.class === 'transit' ? 1 : -1),
    river: (layer, p) => (layer !== 'waterway' ? -1 : p.class === 'river' ? 0 : p.class === 'canal' ? 1 : -1),
    runwayLine: (layer, p) => layer === 'aeroway' && has(p.class, /^(runway|taxiway)$/), runwayOnly: (p) => p.class === 'runway',
    point: (layer, p) => (layer !== 'poi' ? '' : ({ school: 's', college: 'c', university: 'c', hospital: 'h', fire_station: 'f', police: 'p', library: 'l', townhall: 't', town_hall: 't', ferry_terminal: 'y' })[p.subclass] || ({ school: 's', college: 'c', hospital: 'h', fire_station: 'f', police: 'p', library: 'l', town_hall: 't' })[p.class] || ''),
    town: (layer, p) => (layer === 'place' && has(p.class, /^(city|town|village)$/) ? p.class[0] : ''), building: 'building',
  },
  versatiles: {
    ground(layer, p) {
      if (layer === 'ocean') return K.sea;
      if (layer === 'water_polygons') return has(p.kind, /^(river|canal|riverbank)$/) ? K.river : K.lake;
      if (layer === 'sites') return p.kind === 'military' ? K.industrial : 0;
      if (layer === 'pier_polygons') return K.pier;
      if (layer !== 'land') return 0;
      const k = p.kind;
      return k === 'forest' ? K.forest : has(k, /^(swamp|bog|marsh|string_bog|wet_meadow)$/) ? K.wetland : has(k, /^(sand|beach|dune|shingle)$/) ? K.beach
        : has(k, /^(meadow|farmland|orchard|vineyard|farmyard|allotments|greenhouse_horticulture|plant_nursery|scrub|heath|grassland)$/) ? K.farm
        : has(k, /^(grass|park|village_green|recreation_ground|garden|golf_course|cemetery|playground)$/) ? K.grass : k === 'residential' ? K.residential : has(k, /^(commercial|retail)$/) ? K.commercial
        : has(k, /^(industrial|railway|quarry|landfill|brownfield)$/) ? K.industrial : 0;
    },
    road: (layer, p) => (layer !== 'streets' || p.tunnel === true ? -1 : { motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4, unclassified: 5, residential: 5 }[p.kind] ?? -1), link: (p) => p.link === true, bridge: (p) => p.bridge === true, oneway: (p) => (p.oneway === true || p.oneway === 1 ? 1 : 0),
    pierLine: (layer) => layer === 'pier_lines',
    rail: (layer, p) => (layer === 'ferries' ? 2 : layer !== 'streets' ? -1 : p.kind === 'rail' && !has(p.service, /^(yard|siding|spur|crossover)$/) ? 0 : p.kind === 'light_rail' ? 1 : -1),
    river: (layer, p) => (layer !== 'water_lines' ? -1 : p.kind === 'river' ? 0 : p.kind === 'canal' ? 1 : -1),
    runwayLine: (layer, p) => layer === 'streets' && has(p.kind, /^(runway|taxiway)$/), runwayOnly: (p) => p.kind === 'runway',
    point: (layer, p) => (layer !== 'pois' ? '' : ({ school: 's', college: 'c', university: 'c', hospital: 'h', fire_station: 'f', police: 'p', library: 'l', townhall: 't', ferry_terminal: 'y' })[p.amenity] || ''),
    town: (layer, p) => (layer === 'place_labels' && has(p.kind, /^(city|town|village)$/) ? p.kind[0] : ''), building: 'buildings',
  },
}[SOURCE];
if (!LAYOUT) { console.error('unknown source ' + SOURCE); process.exit(2); }

/* 1. every tile: its shapes into the sheets, its lines kept */
const Q = 1e5, qx = (lon) => Math.round((lon - W_) * Q), qy = (lat) => Math.round((N_ - lat) * Q), inMap = (lon, lat, m) => lon >= mapW - m && lon <= mapE + m && lat >= mapS - m && lat <= mapN + m;
const roadLines = Array.from({ length: 64 }, () => []), railLines = [[], [], []], riverLines = [[], []], stripLines = [[], []], points = [], towns = [], census = {}; let buildings = 0, tiles = 0, service = '';
{
  const idx = JSON.parse(readFileSync(join(dir, `vector_${SOURCE}.json`), 'utf8')), blob = readFileSync(join(dir, `vector_${SOURCE}.bin`)); service = idx.pattern.split('/')[2];
  const worldZoom = Math.min(...idx.tiles.map((t) => t[0])), seenPoint = new Set();
  for (const [z, tx, ty, off, len] of idx.tiles) {
    if (!len) continue; let raw = blob.subarray(off, off + len); if (raw[0] === 0x1f && raw[1] === 0x8b) raw = gunzipSync(raw);
    const layers = readTile(raw), sheet = z === worldZoom ? world : map; tiles++;
    for (const [name, { extent: E, features }] of Object.entries(layers)) {
      const cs = (census[name] ||= { n: 0, kinds: {} });
      for (const f of features) {
        cs.n++; const label = f.props.class ?? f.props.kind ?? f.props.amenity ?? ''; if (label !== '') cs.kinds[label] = (cs.kinds[label] || 0) + 1;
        if (f.type === 3) { const k = LAYOUT.ground(name, f.props); if (k) { const rings = f.parts.map((p) => lonLat(z, tx, ty, E, p)); sheet.paint(k, rings); if (k === K.airfield && sheet === world) map.paint(k, rings); /* an airfield's grounds are only in the coarser tiles */ } if (name === LAYOUT.building && z !== worldZoom) buildings++; continue; }
        if (f.type === 2) {
          if (LAYOUT.pierLine(name, f.props)) { for (const p of f.parts) { const ll = lonLat(z, tx, ty, E, p); let len = 0; for (let i = 0; i + 3 < ll.length; i += 2) len += Math.hypot((ll[i + 2] - ll[i]) * M_LON, (ll[i + 3] - ll[i + 1]) * M_LAT); if (len >= 110) sheet.along(K.pier, ll); } continue; }
          if (LAYOUT.runwayLine(name, f.props)) { for (const p of f.parts) { sheet.along(K.runway, lonLat(z, tx, ty, E, p)); if (z === worldZoom) for (const piece of cut(p, E)) { const ll = lonLat(z, tx, ty, E, piece), line = []; for (let i = 0; i < ll.length; i += 2) line.push([ll[i], ll[i + 1]]); stripLines[LAYOUT.runwayOnly(f.props) ? 0 : 1].push(line); } } continue; }
          if (z !== worldZoom) continue;                    // lines are taken from the world's tiles (one zoom, so their cut ends meet)
          const rc = LAYOUT.road(name, f.props), rl = rc < 0 ? LAYOUT.rail(name, f.props) : -1, rv = rc < 0 && rl < 0 ? LAYOUT.river(name, f.props) : -1; if (rc < 0 && rl < 0 && rv < 0) continue;
          for (const p of f.parts) for (const piece of cut(p, E)) { const ll = lonLat(z, tx, ty, E, piece), line = []; for (let i = 0; i < ll.length; i += 2) line.push([ll[i], ll[i + 1]]);
            if (rc >= 0) { const ramp = LAYOUT.link(f.props), way = LAYOUT.oneway(f.props); if (ramp && !line.some((q) => inMap(q[0], q[1], 0.012))) continue; if (way < 0) line.reverse(); roadLines[rc + (LAYOUT.bridge(f.props) ? 8 : 0) + (ramp ? 16 : 0) + (way ? 32 : 0)].push(line); } else if (rl >= 0) railLines[rl].push(line); else riverLines[rv].push(line); }
          continue;
        }
        if (f.type === 1) {
          const code = LAYOUT.point(name, f.props), town = code ? '' : LAYOUT.town(name, f.props); if (!code && !town) continue;
          for (const p of f.parts) { if (p[0] < 0 || p[1] < 0 || p[0] >= E || p[1] >= E) continue; const [lon, lat] = lonLat(z, tx, ty, E, p), key = `${code || town}${qx(lon) >> 3},${qy(lat) >> 3}`; if (seenPoint.has(key)) continue; seenPoint.add(key);
            if (town) towns.push([town, qx(lon), qy(lat), Number(f.props.population) || 0]);
            else { let c = code; if (c === 's') { const nm = String(f.props.name || '').toLowerCase(); c = /high|senior/.test(nm) ? 'H' : /middle|junior|intermediate/.test(nm) ? 'M' : 'E'; } points.push([c, qx(lon), qy(lat)]); } }
        }
      }
    }
  }
  lap(`${tiles} tiles from ${service} read`);
  for (const [name, cs] of Object.entries(census)) console.log(`      ${name}: ${cs.n.toLocaleString('en-US')}  ${Object.entries(cs.kinds).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, n]) => `${k} ${n}`).join(', ')}`);
}

// An airfield's grounds: the open or housing-marked ground within about 210 m of its runways, taxiways and aprons is
// the airfield's (the tiles carry its outline only at the coarser zoom, and not always whole).
for (const [sheet, reach] of [[map, 10], [world, 5]]) {
  const S = sheet.size, g = sheet.grid, d = new Uint8Array(S * S).fill(255), queue = [];
  for (let c = 0; c < S * S; c++) if (g[c] === K.runway) { d[c] = 0; queue.push(c); }
  for (let q = 0; q < queue.length; q++) { const c = queue[q], x = c % S, y = (c - x) / S; if (d[c] >= reach) continue; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue; const e = yy * S + xx; if (d[e] !== 255) continue; d[e] = d[c] + 1; queue.push(e); if (g[e] === K.none || g[e] === K.residential || g[e] === K.grass || g[e] === K.farm || g[e] === K.forest) g[e] = K.airfield; } }
}

/* 2. lines: joined end to end into long runs and thinned; in 1e-5 degree from the world's north-west corner */
const inWorld = (p) => p[0] >= W_ && p[0] <= E_ && p[1] >= S_ && p[1] <= N_;
// Douglas-Peucker in metres
function thin(line, tol) {
  if (line.length < 3) return line; const keep = new Uint8Array(line.length); keep[0] = keep[line.length - 1] = 1; const stack = [[0, line.length - 1]];
  const X = (p) => p[0] * M_LON, Y = (p) => p[1] * M_LAT;
  while (stack.length) { const [a, b] = stack.pop(); let far = -1, most = tol; const ax = X(line[a]), ay = Y(line[a]), dx = X(line[b]) - ax, dy = Y(line[b]) - ay, l2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) { const px = X(line[i]) - ax, py = Y(line[i]) - ay, u = l2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / l2)) : 0, d = Math.hypot(px - u * dx, py - u * dy); if (d > most) { most = d; far = i; } }
    if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]); } }
  return line.filter((_, i) => keep[i]);
}
// join lines end to end where exactly two of them meet (ends are matched to about a metre)
function join_(lines) {
  const key = (p) => Math.round(p[0] * 1e5) + ',' + Math.round(p[1] * 1e5), ends = new Map();
  lines.forEach((l, i) => { for (const e of [0, 1]) { const k = key(e ? l[l.length - 1] : l[0]); if (!ends.has(k)) ends.set(k, []); ends.get(k).push(i * 2 + e); } });
  const used = new Uint8Array(lines.length), out = [];
  const grow = (pts, i, e) => { for (;;) { const at = ends.get(key(pts[pts.length - 1])); if (!at || at.length !== 2) return; const o = at[0] === i * 2 + e ? at[1] : at[0], j = o >> 1; if (used[j]) return; used[j] = 1; const l = o & 1 ? lines[j].slice().reverse() : lines[j]; for (let q = 1; q < l.length; q++) pts.push(l[q]); i = j; e = o & 1 ? 0 : 1; } };
  for (let i = 0; i < lines.length; i++) { if (used[i]) continue; used[i] = 1; const fwd = lines[i].slice(); grow(fwd, i, 1); const head = lines[i].slice().reverse(); grow(head, i, 0); out.push(head.reverse().slice(0, head.length - lines[i].length).concat(fwd)); }
  return out;
}
// join one-way lines head to tail (never turned round) where exactly one ends and one begins
function joinOneWay(lines) {
  const key = (p) => Math.round(p[0] * 1e5) + ',' + Math.round(p[1] * 1e5), starts = new Map(), ends = new Map();
  const add = (m, k, i) => { if (!m.has(k)) m.set(k, []); m.get(k).push(i); };
  lines.forEach((l, i) => { add(starts, key(l[0]), i); add(ends, key(l[l.length - 1]), i); });
  const used = new Uint8Array(lines.length), out = [];
  for (let i = 0; i < lines.length; i++) {
    if (used[i]) continue; const first = key(lines[i][0]); if ((ends.get(first) || []).length === 1 && (starts.get(first) || []).length === 1 && !used[ends.get(first)[0]] && ends.get(first)[0] !== i) continue;   // not the head of its run
    used[i] = 1; const pts = lines[i].slice();
    for (;;) { const k = key(pts[pts.length - 1]), nx = starts.get(k) || []; if (nx.length !== 1 || (ends.get(k) || []).length !== 1 || used[nx[0]]) break; used[nx[0]] = 1; const l = lines[nx[0]]; for (let q = 1; q < l.length; q++) pts.push(l[q]); }
    out.push(pts);
  }
  for (let i = 0; i < lines.length; i++) if (!used[i]) out.push(lines[i]);          // (rings and whatever a head was not found for)
  return out;
}
// cut a line where it leaves the world, thin it (finely on and near the map), and write it as differences
function pack(cls, lines, tolIn, tolOut, keepOut) {
  const out = [];
  for (const whole of lines) {
    let run = [];
    const flush = () => { if (run.length > 1) { const near = run.some((p) => inMap(p[0], p[1], 0.012)); if (near || keepOut) { const t = thin(run, near ? tolIn : tolOut), a = []; let px = 0, py = 0; for (const p of t) { const x = qx(p[0]), y = qy(p[1]); if (a.length && x === px && y === py) continue; a.push(x - px, y - py); px = x; py = y; } if (a.length >= 4) out.push([cls, a]); } } run = []; };
    for (const p of whole) { if (inWorld(p)) run.push(p); else flush(); }
    flush();
  }
  return out;
}
const roads = []; { let pts = 0; const count = [0, 0, 0, 0, 0, 0]; roadLines.forEach((lines, code) => { const c = code & 7; count[c] += lines.length; if (c > 4) return; for (const r of pack(code, code & 32 ? joinOneWay(lines) : join_(lines), 4, 20, c < 4)) { roads.push(r); pts += r[1].length / 2; } });
  lap(`roads: ${count.slice(0, 5).join(' + ')} pieces (motorway, trunk, primary, secondary, tertiary) joined into ${roads.length.toLocaleString('en-US')} lines of ${pts.toLocaleString('en-US')} points (${roads.filter((r) => r[0] & 8).length} bridges, ${roads.filter((r) => r[0] & 16).length} ramps, ${roads.filter((r) => r[0] & 32).length} one-way); ${count[5]} smaller roads left for the full-scale city`); }
const rivers = [], rail = [], strips = [];
for (const c of [0, 1]) for (const r of pack(c, join_(stripLines[c]), 4, 10, true)) strips.push(r);
for (const c of [0, 1]) for (const r of pack(c, join_(riverLines[c]), 8, 30, true)) rivers.push(r);
for (const [c, a, b] of [[0, 6, 25], [1, 6, 25], [2, 40, 80]]) for (const r of pack(c, join_(railLines[c]), a, b, true)) rail.push(r);
points.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[2] - b[2] || a[1] - b[1])); towns.sort((a, b) => a[2] - b[2] || a[1] - b[1]);
lap(`rivers: ${rivers.length} lines; railways and ferries: ${rail.length} lines; runways and taxiways: ${strips.filter((r) => r[0] === 0).length} and ${strips.filter((r) => r[0] === 1).length}; public buildings: ${points.length}; towns: ${towns.length}; building outlines on the map: ${buildings.toLocaleString('en-US')}`);

/* the public traffic cameras on the map (tools/traffic_fetch.py): what each looks at, where it stands, where its live picture is */
const cameras = [];
if (existsSync(join(dir, 'traffic_cameras.json'))) {
  const doc = JSON.parse(readFileSync(join(dir, 'traffic_cameras.json'), 'utf8')), lay = doc.layers.find((l) => /camera/i.test(l.name || '')) || doc.layers[0];
  // (a picture's address is kept only if it is on WSDOT's own picture host; a title is plain text of a sensible length)
  const PICTURE = /^https:\/\/images\.wsdot\.wa\.gov\/[A-Za-z0-9_\-./%]+\.(?:jpg|jpeg|png)$/i; let refused = 0;
  for (const f of lay.features) {
    const a = f.attributes || {}, g = f.geometry || {}, url = String(a.ImageURL || a.ImageUrl || ''), title = String(a.CameraTitle || a.Title || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (typeof g.x !== 'number' || typeof g.y !== 'number' || !inMap(g.x, g.y, 0)) continue; if (!title || !PICTURE.test(url)) { refused++; continue; }
    cameras.push([title, url, String(a.CompassDirection || '').replace(/[^A-Za-z]/g, '').slice(0, 2), qx(g.x), qy(g.y)]);
  }
  if (refused) lap(`traffic cameras refused (no title, or a picture that is not on images.wsdot.wa.gov): ${refused}`);
  cameras.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  lap(`traffic cameras on the map: ${cameras.length} (of ${lay.features.length} fetched)`);
}

/* 5. heights from the terrain tiles (PNG pictures: metres = red * 256 + green + blue / 256 - 32768) */
function png(buf) {
  let at = 8, w = 0, h = 0, type = 2; const parts = [];
  while (at < buf.length) { const len = buf.readUInt32BE(at), tag = buf.toString('latin1', at + 4, at + 8), body = buf.subarray(at + 8, at + 8 + len); if (tag === 'IHDR') { w = body.readUInt32BE(0); h = body.readUInt32BE(4); type = body[9]; if (body[8] !== 8 || (type !== 2 && type !== 6) || body[12]) throw new Error('a terrain tile is not a plain 8-bit colour picture'); } else if (tag === 'IDAT') parts.push(body); at += 12 + len; }
  const raw = inflateSync(Buffer.concat(parts)), bpp = type === 6 ? 4 : 3, stride = w * bpp, out = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let i = 0; i < stride; i++) { const a = i >= bpp ? out[dst + i - bpp] : 0, b = y ? out[dst - stride + i] : 0, c = y && i >= bpp ? out[dst - stride + i - bpp] : 0; let p = 0;
      if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1; else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[dst + i] = (raw[src + i] + p) & 255; }
  }
  return { w, h, bpp, px: out };
}
const HG = 384; let coreH, worldH, heightNote;
{
  const idx = JSON.parse(readFileSync(join(dir, 'terrain_z12.json'), 'utf8')), blob = readFileSync(join(dir, 'terrain_z12.bin')), TP = idx.tile_pixels, cols = idx.x1 - idx.x0 + 1, rows = idx.y1 - idx.y0 + 1;
  const mosaic = new Float32Array(cols * TP * rows * TP), MW = cols * TP, MH = rows * TP;
  for (const [x, y, off, len] of idx.tiles) { const t = png(blob.subarray(off, off + len)); if (t.w !== TP || t.h !== TP) throw new Error('a terrain tile has an unexpected size'); const ox = (x - idx.x0) * TP, oy = (y - idx.y0) * TP; for (let j = 0; j < TP; j++) for (let i = 0; i < TP; i++) { const o = (j * TP + i) * t.bpp; mosaic[(oy + j) * MW + ox + i] = t.px[o] * 256 + t.px[o + 1] + t.px[o + 2] / 256 - 32768; } }
  const n = 2 ** idx.zoom, at = (lat, lon) => {
    const px = ((lon + 180) / 360) * n * TP - idx.x0 * TP - 0.5, py = ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n * TP - idx.y0 * TP - 0.5;
    const x0 = Math.max(0, Math.min(MW - 2, Math.floor(px))), y0 = Math.max(0, Math.min(MH - 2, Math.floor(py))), u = Math.max(0, Math.min(1, px - x0)), v = Math.max(0, Math.min(1, py - y0));
    return (mosaic[y0 * MW + x0] * (1 - u) + mosaic[y0 * MW + x0 + 1] * u) * (1 - v) + (mosaic[(y0 + 1) * MW + x0] * (1 - u) + mosaic[(y0 + 1) * MW + x0 + 1] * u) * v;
  };
  // half-metres at the centres of an HG x HG grid over a box
  const sample = (n0, s0, w0, e0) => { const a = new Int16Array(HG * HG); for (let j = 0; j < HG; j++) for (let i = 0; i < HG; i++) a[j * HG + i] = Math.max(-200, Math.min(32000, Math.round(at(n0 - ((j + 0.5) / HG) * (n0 - s0), w0 + ((i + 0.5) / HG) * (e0 - w0)) * 2))); return a; };
  coreH = sample(mapN, mapS, mapW, mapE); worldH = sample(N_, S_, W_, E_);
  let lo = 1e9, hi = -1e9; for (const v of worldH) { if (v < lo) lo = v; if (v > hi) hi = v; }
  heightNote = `${idx.tiles.length} tiles; the world runs from ${(lo / 2).toFixed(0)} m to ${(hi / 2).toFixed(0)} m`; lap('heights: ' + heightNote);
}

/* 6. writing it down */
// runs of one kind: [kind, how many more (0 to 255)] pairs
const runs = (a) => { const out = []; for (let i = 0; i < a.length;) { let j = i + 1; while (j < a.length && a[j] === a[i] && j - i < 256) j++; out.push(a[i], j - i - 1); i = j; } return Buffer.from(out).toString('base64'); };
// heights: the difference from the cell before, zig-zagged, seven bits to a byte
const deltas = (a) => { const out = []; let prev = 0; for (const v of a) { let d = v - prev; prev = v; d = d < 0 ? -d * 2 - 1 : d * 2; while (d >= 128) { out.push((d & 127) | 128); d = Math.floor(d / 128); } out.push(d); } return Buffer.from(out).toString('base64'); };
const asOf = (() => { const m = /\/(\d{4})(\d{2})(\d{2})_/.exec(JSON.parse(readFileSync(join(dir, `vector_${SOURCE}.json`), 'utf8')).pattern); return m ? `${m[1]}-${m[2]}-${m[3]}` : ''; })();
const lines = (b64) => { const l = []; for (let i = 0; i < b64.length; i += 160) l.push(b64.slice(i, i + 160)); return l.map((s) => `  "${s}"`).join(' +\n'); };
// both sheets brought to half their fineness: of each four cells, water if two or more are water, else the commonest kind
const halve = (sheet) => {
  const S = sheet.size, H = S / 2, g = sheet.grid, out = new Uint8Array(H * H), wetK = (k) => k >= K.sea && k <= K.lake;
  const pick = (list) => { let best = list[0], most = 0; for (const k of list) { const n = list.filter((q) => q === k).length; if (n > most || (n === most && PRI[k] > PRI[best])) { most = n; best = k; } } return best; };
  for (let y = 0; y < H; y++) for (let x = 0; x < H; x++) { const four = [g[2 * y * S + 2 * x], g[2 * y * S + 2 * x + 1], g[(2 * y + 1) * S + 2 * x], g[(2 * y + 1) * S + 2 * x + 1]], wet = four.filter(wetK); out[y * H + x] = four.includes(K.pier) ? K.pier : wet.length >= 2 ? pick(wet) : pick(four.filter((k) => !wetK(k))); }
  return out;
};
const core = halve(map), around = halve(world), HALF = world.size / 2;
const u16 = new Uint16Array(f32.length); let people = 0; for (let i = 0; i < f32.length; i++) { const v = Math.max(0, Math.min(65535, Math.round(f32[i] * 100))); u16[i] = v; people += v; }
const share = (a, k) => { let n = 0; for (const v of a) if (v === k) n++; return ((n / a.length) * 100).toFixed(1) + '%'; };
const G = { name: 'everett', centre, halfX, halfY, mLat: M_LAT, mLon: M_LON,
  pop: { rows: meta.rows, cols: meta.cols, north: meta.north, west: meta.west, dLat, dLon, people: Math.round(people / 100) },
  kinds: Object.keys(K), fine: FINE, heights: HG,
  world: { times: TIMES, north: Number(N_.toFixed(6)), west: Number(W_.toFixed(6)), south: Number(S_.toFixed(6)), east: Number(E_.toFixed(6)), cells: HALF, unit: 1 / Q },
  roads, rivers, rail, strips, points, towns, cameras, places: outline.places, sites: outline.sites, tiles: service + (asOf ? ' ' + asOf : '') };
const out = `// SPDX-License-Identifier: ODbL-1.0 AND CC-BY-4.0
// GENERATED by tools/make_map.mjs. Do not edit by hand. (This file is data, under its sources' terms: see NOTICE.)
// What the map of the real place, and the world around it, are shaped from.
//
// The map is the population cut: ${mapS.toFixed(4)} N to ${mapN.toFixed(4)} N, ${(-mapW).toFixed(4)} W to ${(-mapE).toFixed(4)} W, ${(2 * halfX / 1000).toFixed(2)} km by ${(2 * halfY / 1000).toFixed(2)} km,
// ${Math.round(people / 100).toLocaleString('en-US')} people. The world is three times as wide, with the map in its middle.
//
// Population: WorldPop (www.worldpop.org), R2025A v1, population 2026, 3 arc-second constrained, CC BY 4.0: people per
// cell in hundredths, ${meta.rows} rows by ${meta.cols} columns from the north-west corner.
// Ground, water, roads, railways, public buildings: (c) OpenStreetMap contributors, Open Database License 1.0
// (https://www.openstreetmap.org/copyright), as vector map tiles from ${service}${asOf ? ' built ' + asOf : ''}; what is derived from it
// here stays under that licence.
// Heights: Terrain Tiles (Mapzen/Tilezen; U.S. Geological Survey 3D Elevation Program and others),
// https://registry.opendata.aws/terrain-tiles/ (${heightNote}).
export const GROUND_SOURCE = "WorldPop R2025A v1 (CC BY 4.0); (c) OpenStreetMap contributors (ODbL 1.0), tiles from ${service}${asOf ? ' ' + asOf : ''}; Terrain Tiles (Mapzen/Tilezen, USGS 3DEP)";
export const GROUND = ${JSON.stringify(G)};
// the population cut: uint16 little-endian, base64
export const GROUND_POP_B64 =
${lines(Buffer.from(u16.buffer).toString('base64'))};
// the kind of ground of the map, ${FINE} x ${FINE} from the north-west corner: runs of [kind, how many more]
export const GROUND_KIND_B64 =
${lines(runs(core))};
// the kind of ground of the world, ${HALF} x ${HALF}
export const WORLD_KIND_B64 =
${lines(runs(around))};
// heights in half-metres at the centres of a ${HG} x ${HG} grid, as differences (zig-zag, seven bits to a byte): the map, then the world
export const GROUND_HEIGHT_B64 =
${lines(deltas(coreH))};
export const WORLD_HEIGHT_B64 =
${lines(deltas(worldH))};
`;
writeFileSync(new URL('../src/ground_data.js', import.meta.url), out);
console.log(`wrote src/ground_data.js: ${(out.length / 1e6).toFixed(2)} MB. The map: sea ${share(core, K.sea)}, river ${share(core, K.river)}, lake ${share(core, K.lake)}, wetland ${share(core, K.wetland)}, forest ${share(core, K.forest)}, farm ${share(core, K.farm)}, grass ${share(core, K.grass)}, industrial ${share(core, K.industrial)}, commercial ${share(core, K.commercial)}, airfield ${share(core, K.airfield)}, residential ${share(core, K.residential)}, unmarked ${share(core, K.none)}`);
