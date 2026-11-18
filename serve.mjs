// Serve web/ on http://127.0.0.1:8788 with cross-origin isolation, so the XPU can use
// SharedArrayBuffer threads. 8788 is already in JA21 Blank Console's local_origins.
// Hardened: loopback only, GET/HEAD only, no path escapes, malformed URLs answer 400.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), 'web');
const shards = resolve(fileURLToPath(new URL('.', import.meta.url)), 'shards');   // baked shards, served at /shards/
const type = { '.html': 'text/html; charset=utf-8', '.wasm': 'application/wasm', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.bin': 'application/octet-stream', '.gz': 'application/gzip' };
const port = Number(process.env.PLUME_PORT || 8788);
const base = {
  'cache-control': 'no-store',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'credentialless',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

const server = createServer(async (req, res) => {
  const send = (code, body = '', extra = {}) => { res.writeHead(code, { ...base, 'content-type': 'text/plain; charset=utf-8', ...extra }); res.end(req.method === 'HEAD' ? undefined : body); };
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'method not allowed', { allow: 'GET, HEAD' });
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); } catch { return send(400, 'bad request'); }
    if (pathname.includes('\0')) return send(400, 'bad request');
    const inShards = pathname.startsWith('/shards/'), dir = inShards ? shards : root;
    const file = resolve(dir, '.' + (inShards ? pathname.slice(7) : pathname === '/' ? '/index.html' : pathname));
    if (file !== dir && !file.startsWith(dir + sep)) return send(403, 'forbidden');
    // Zarr chunk and shard files have no extension: serve those, inside shards/zarr only, as bytes
    const zarrChunk = inShards && file.startsWith(resolve(shards, 'zarr') + sep) && extname(file) === '';
    const ctype = zarrChunk ? 'application/octet-stream' : type[extname(file)];
    if (!ctype) return send(404, 'not found');
    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) return send(404, 'not found');
    const body = await readFile(file);
    res.writeHead(200, { ...base, 'content-type': ctype, 'content-length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { if (!res.headersSent) send(500, 'server error'); else res.destroy(); }
});
server.on('clientError', (_e, socket) => socket.destroy());
server.listen(port, '127.0.0.1', () => console.log(`Plume XPU Console on http://127.0.0.1:${port}/`));
