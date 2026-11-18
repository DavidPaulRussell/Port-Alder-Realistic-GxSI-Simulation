// EDHX/1 (Entangled Data Hologram eXecutable) in plain JavaScript, for Node and the browser: the container format of
// David Paul Russell's EDHX 1.0.0 (spec/FORMAT.md), read and written byte for byte as that specification lays out.
//
//   HEAD     UTF-8 text in ED's lexical grammar ("edhx 1.0;" + container/artifact/entangle blocks), then 0A 1A 0A
//   RUNTIME  "EDHXRT01" | u64 n | SHA-512(zip) | ZIP of the EDHX runtime (what makes a container self-executing)
//   CONTROL  "EDHXCTL1" | u64 n | SHA-512(text) | the MSSL 0.3 control document
//   PAGES    "EDHXPGS1" | u64 N | page root | N hologram pages of 43,328 bytes
//   FOOTER   376 bytes: offsets and SHA-512 cross-hashes
//
// A hologram page spreads up to 24,576 data bytes (the fast tier) over the 16,384 sites of the Penteract lattice as
// the evaluations of the data polynomial at the 16,384th roots of unity in GF(65537): a Reed-Solomon code, so any k
// intact sites rebuild the page. Each 16x16 tile of sites carries its own SHA-512 in both copies of the page header.
//
// SHA-512 identifies and verifies content; it does not replace it. Every record is stored once, in pages, and is
// found by its key and checked against its SHA-512 on every read.
// SPDX-License-Identifier: GPL-3.0-only

export const EDHX_VERSION = "1.0.0";
const enc = new TextEncoder(), dec = new TextDecoder("utf-8", { fatal: true });

/* ------------------------------------------------------------------ SHA-512 (FIPS 180-4), synchronous, 32-bit halves */
const K512 = (() => {
  const h = ["428a2f98d728ae22", "7137449123ef65cd", "b5c0fbcfec4d3b2f", "e9b5dba58189dbbc", "3956c25bf348b538", "59f111f1b605d019", "923f82a4af194f9b", "ab1c5ed5da6d8118",
    "d807aa98a3030242", "12835b0145706fbe", "243185be4ee4b28c", "550c7dc3d5ffb4e2", "72be5d74f27b896f", "80deb1fe3b1696b1", "9bdc06a725c71235", "c19bf174cf692694",
    "e49b69c19ef14ad2", "efbe4786384f25e3", "0fc19dc68b8cd5b5", "240ca1cc77ac9c65", "2de92c6f592b0275", "4a7484aa6ea6e483", "5cb0a9dcbd41fbd4", "76f988da831153b5",
    "983e5152ee66dfab", "a831c66d2db43210", "b00327c898fb213f", "bf597fc7beef0ee4", "c6e00bf33da88fc2", "d5a79147930aa725", "06ca6351e003826f", "142929670a0e6e70",
    "27b70a8546d22ffc", "2e1b21385c26c926", "4d2c6dfc5ac42aed", "53380d139d95b3df", "650a73548baf63de", "766a0abb3c77b2a8", "81c2c92e47edaee6", "92722c851482353b",
    "a2bfe8a14cf10364", "a81a664bbc423001", "c24b8b70d0f89791", "c76c51a30654be30", "d192e819d6ef5218", "d69906245565a910", "f40e35855771202a", "106aa07032bbd1b8",
    "19a4c116b8d2d0c8", "1e376c085141ab53", "2748774cdf8eeb99", "34b0bcb5e19b48a8", "391c0cb3c5c95a63", "4ed8aa4ae3418acb", "5b9cca4f7763e373", "682e6ff3d6b2b8a3",
    "748f82ee5defb2fc", "78a5636f43172f60", "84c87814a1f0ab72", "8cc702081a6439ec", "90befffa23631e28", "a4506cebde82bde9", "bef9a3f7b2c67915", "c67178f2e372532b",
    "ca273eceea26619c", "d186b8c721c0c207", "eada7dd6cde0eb1e", "f57d4f7fee6ed178", "06f067aa72176fba", "0a637dc5a2c898a6", "113f9804bef90dae", "1b710b35131c471b",
    "28db77f523047d84", "32caab7b40c72493", "3c9ebe0a15c9bebc", "431d67c49c100d4c", "4cc5d4becb3e42b6", "597f299cfc657e2a", "5fcb6fab3ad6faec", "6c44198c4a475817"];
  const k = new Uint32Array(160); h.forEach((x, i) => { k[2 * i] = parseInt(x.slice(0, 8), 16); k[2 * i + 1] = parseInt(x.slice(8), 16); }); return k;
})();
const H512 = [0x6a09e667, 0xf3bcc908, 0xbb67ae85, 0x84caa73b, 0x3c6ef372, 0xfe94f82b, 0xa54ff53a, 0x5f1d36f1, 0x510e527f, 0xade682d1, 0x9b05688c, 0x2b3e6c1f, 0x1f83d9ab, 0xfb41bd6b, 0x5be0cd19, 0x137e2179];
export function sha512(bytes) {
  bytes = bytes instanceof Uint8Array ? bytes : enc.encode(String(bytes));
  const n = bytes.length, total = ((n + 17 + 127) >> 7) << 7, m = new Uint8Array(total); m.set(bytes); m[n] = 0x80;
  const bits = n * 8; const dv = new DataView(m.buffer); dv.setUint32(total - 8, Math.floor(bits / 4294967296)); dv.setUint32(total - 4, bits >>> 0);
  const h = Uint32Array.from(H512), w = new Uint32Array(160);
  for (let off = 0; off < total; off += 128) {
    for (let i = 0; i < 32; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) {
      // sigma0 of w[i-15] and sigma1 of w[i-2], on (hi, lo) pairs
      let xh = w[2 * (i - 15)], xl = w[2 * (i - 15) + 1];
      const s0h = ((xh >>> 1) | (xl << 31)) ^ ((xh >>> 8) | (xl << 24)) ^ (xh >>> 7), s0l = ((xl >>> 1) | (xh << 31)) ^ ((xl >>> 8) | (xh << 24)) ^ ((xl >>> 7) | (xh << 25));
      xh = w[2 * (i - 2)]; xl = w[2 * (i - 2) + 1];
      const s1h = ((xh >>> 19) | (xl << 13)) ^ ((xl >>> 29) | (xh << 3)) ^ (xh >>> 6), s1l = ((xl >>> 19) | (xh << 13)) ^ ((xh >>> 29) | (xl << 3)) ^ ((xl >>> 6) | (xh << 26));
      let lo = (s0l >>> 0) + (s1l >>> 0) + w[2 * (i - 7) + 1] + w[2 * (i - 16) + 1];
      let hi = s0h + s1h + w[2 * (i - 7)] + w[2 * (i - 16)] + Math.floor(lo / 4294967296);
      w[2 * i] = hi >>> 0; w[2 * i + 1] = lo >>> 0;
    }
    let ah = h[0], al = h[1], bh = h[2], bl = h[3], ch = h[4], cl = h[5], dh = h[6], dl = h[7], eh = h[8], el = h[9], fh = h[10], fl = h[11], gh = h[12], gl = h[13], hh = h[14], hl = h[15];
    for (let i = 0; i < 80; i++) {
      const S1h = ((eh >>> 14) | (el << 18)) ^ ((eh >>> 18) | (el << 14)) ^ ((el >>> 9) | (eh << 23)), S1l = ((el >>> 14) | (eh << 18)) ^ ((el >>> 18) | (eh << 14)) ^ ((eh >>> 9) | (el << 23));
      const chh = (eh & fh) ^ (~eh & gh), chl = (el & fl) ^ (~el & gl);
      let lo = (hl >>> 0) + (S1l >>> 0) + (chl >>> 0) + K512[2 * i + 1] + w[2 * i + 1];
      let hi = hh + S1h + chh + K512[2 * i] + w[2 * i] + Math.floor(lo / 4294967296);
      const t1h = hi >>> 0, t1l = lo >>> 0;
      const S0h = ((ah >>> 28) | (al << 4)) ^ ((al >>> 2) | (ah << 30)) ^ ((al >>> 7) | (ah << 25)), S0l = ((al >>> 28) | (ah << 4)) ^ ((ah >>> 2) | (al << 30)) ^ ((ah >>> 7) | (al << 25));
      const mjh = (ah & bh) ^ (ah & ch) ^ (bh & ch), mjl = (al & bl) ^ (al & cl) ^ (bl & cl);
      lo = (S0l >>> 0) + (mjl >>> 0); hi = S0h + mjh + Math.floor(lo / 4294967296);
      const t2h = hi >>> 0, t2l = lo >>> 0;
      hh = gh; hl = gl; gh = fh; gl = fl; fh = eh; fl = el;
      lo = (dl >>> 0) + t1l; eh = (dh + t1h + Math.floor(lo / 4294967296)) >>> 0; el = lo >>> 0;
      dh = ch; dl = cl; ch = bh; cl = bl; bh = ah; bl = al;
      lo = t1l + t2l; ah = (t1h + t2h + Math.floor(lo / 4294967296)) >>> 0; al = lo >>> 0;
    }
    const add = (k, xh, xl) => { const lo = h[k + 1] + (xl >>> 0); h[k] = (h[k] + (xh >>> 0) + Math.floor(lo / 4294967296)) >>> 0; h[k + 1] = lo >>> 0; };
    add(0, ah, al); add(2, bh, bl); add(4, ch, cl); add(6, dh, dl); add(8, eh, el); add(10, fh, fl); add(12, gh, gl); add(14, hh, hl);
  }
  const out = new Uint8Array(64), ov = new DataView(out.buffer); for (let i = 0; i < 16; i++) ov.setUint32(i * 4, h[i]); return out;
}
/* ------------------------------------------------------------------ SHA-256 (for MSSL's kappa and ED's sha256 pins) */
const K256 = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
export function sha256(bytes) {
  bytes = bytes instanceof Uint8Array ? bytes : enc.encode(String(bytes));
  const n = bytes.length, total = ((n + 9 + 63) >> 6) << 6, m = new Uint8Array(total); m.set(bytes); m[n] = 0x80;
  const dv = new DataView(m.buffer); dv.setUint32(total - 8, Math.floor((n * 8) / 4294967296)); dv.setUint32(total - 4, (n * 8) >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), w = new Uint32Array(64);
  const r = (x, k) => (x >>> k) | (x << (32 - k));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) w[i] = (w[i - 16] + (r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3)) + w[i - 7] + (r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10))) >>> 0;
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) >>> 0, t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0; h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  const out = new Uint8Array(32), ov = new DataView(out.buffer); for (let i = 0; i < 8; i++) ov.setUint32(i * 4, h[i]); return out;
}
export const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export const unhex = (s) => { const o = new Uint8Array(s.length >> 1); for (let i = 0; i < o.length; i++) o[i] = parseInt(s.substr(i * 2, 2), 16); return o; };
export const sha512Hex = (b) => hex(sha512(b)), sha256Hex = (b) => hex(sha256(b));
const cat = (parts) => { let n = 0; for (const p of parts) n += p.length; const o = new Uint8Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };
const eq = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
// a domain-separated digest: SHA-512 of an ASCII tag, NUL, then the payload (EDHX's one pattern for every such hash)
export const domainHash = (tag, payload) => sha512(cat([enc.encode(tag), new Uint8Array([0]), payload]));

/* ------------------------------------------------------------------ GF(65537) and the length-16384 number-theoretic transform */
const P = 65537, NSITES = 16384, G = 3;
const powmod = (b, e) => { let r = 1, x = b % P; while (e > 0) { if (e & 1) r = (r * x) % P; x = (x * x) % P; e = Math.floor(e / 2); } return r; };
const REV = (() => { const r = new Uint16Array(NSITES); for (let i = 0; i < NSITES; i++) { let x = i, y = 0; for (let b = 0; b < 14; b++) { y = (y << 1) | (x & 1); x >>= 1; } r[i] = y; } return r; })();
const TW = new Map();
function twiddles(len, inv) { const key = len * 2 + (inv ? 1 : 0); let t = TW.get(key); if (t) return t; let w = powmod(G, (P - 1) / len); if (inv) w = powmod(w, P - 2); t = new Float64Array(len >> 1); t[0] = 1; for (let k = 1; k < len >> 1; k++) t[k] = (t[k - 1] * w) % P; TW.set(key, t); return t; }
// A_j = sum_i a_i w^(ij) with w = 81, a primitive 16384th root of unity (the inverse includes 1/n)
export function ntt(values, inverse = false) {
  const a = new Float64Array(NSITES); for (let i = 0; i < NSITES; i++) a[i] = values[REV[i]] % P;
  for (let len = 2; len <= NSITES; len <<= 1) {
    const half = len >> 1, ws = twiddles(len, inverse);
    for (let s = 0; s < NSITES; s += len) for (let k = 0; k < half; k++) {
      const u = a[s + k], v = (a[s + k + half] * ws[k]) % P;
      a[s + k] = u + v >= P ? u + v - P : u + v; a[s + k + half] = u - v < 0 ? u - v + P : u - v;
    }
  }
  if (inverse) { const ninv = powmod(NSITES, P - 2); for (let i = 0; i < NSITES; i++) a[i] = (a[i] * ninv) % P; }
  return a;
}

/* ------------------------------------------------------------------ hologram pages (43,328 bytes) */
export const TIERS = { fast: 12288, std: 8192, safe: 4096, vault: 1024 }, TIER_ORDER = ["fast", "std", "safe", "vault"];
const TILES = 64, TILE_SITES = 256, TILE_BYTES = 544, HEAD_FIXED = 96, HEADER_BYTES = HEAD_FIXED + TILES * 64 + 64;
export const PAGE_BYTES = HEADER_BYTES + TILES * TILE_BYTES + HEADER_BYTES;   // 43,328
export const capacity = (tier) => TIERS[tier] * 2;
const PAGE_MAGIC = enc.encode("EDHXPAGE");
const tileDigest = (blob) => domainHash("EDHX-TILE/1", blob);
function pageHeader(tier, index, generation, k, data, digests, flags) {
  const head = new Uint8Array(HEAD_FIXED), dv = new DataView(head.buffer);
  head.set(PAGE_MAGIC, 0); dv.setUint16(8, 1); head[10] = TIER_ORDER.indexOf(tier); head[11] = flags; dv.setUint32(12, index); dv.setUint32(16, generation);
  dv.setUint32(20, k); dv.setUint32(24, NSITES); dv.setUint32(28, data.length); head.set(sha512(data), 32);
  const body = cat([head, ...digests]); return cat([body, sha512(body)]);
}
// one page: the data (at most 2k bytes) as k big-endian 16-bit symbols, evaluated at every site; the tiles of 256
// sites are stored as 16-bit values with an escape bitmap for the value 65536 (stored as 0), most significant bit first
export function encodePage(data, tier, index, generation, flags = 0) {
  const k = TIERS[tier]; if (!k) throw new Error(`EDHX: unknown tier ${tier}`); if (data.length > 2 * k) throw new Error("EDHX: data larger than the page's capacity");
  const sym = new Float64Array(NSITES); for (let i = 0; i < k; i++) { const a = data[2 * i] ?? 0, b = data[2 * i + 1] ?? 0; sym[i] = (a << 8) | b; }
  const sites = ntt(sym), tiles = [];
  for (let t = 0; t < TILES; t++) {
    const blob = new Uint8Array(TILE_BYTES), dv = new DataView(blob.buffer);
    for (let j = 0; j < TILE_SITES; j++) { const v = sites[t * TILE_SITES + j]; dv.setUint16(j * 2, v & 0xffff); if (v === 65536) blob[512 + (j >> 3)] |= 0x80 >> (j & 7); }
    tiles.push(blob);
  }
  const header = pageHeader(tier, index, generation, k, data, tiles.map(tileDigest), flags);
  return cat([header, ...tiles, header]);
}
function parsePageHeader(b) {
  const body = b.subarray(0, HEADER_BYTES - 64); if (!eq(sha512(body), b.subarray(HEADER_BYTES - 64))) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.length); if (!eq(b.subarray(0, 8), PAGE_MAGIC) || dv.getUint16(8) !== 1) return null;
  const tier = TIER_ORDER[b[10]], k = dv.getUint32(20); if (!tier || k !== TIERS[tier] || dv.getUint32(24) !== NSITES) return null;
  const digests = []; for (let t = 0; t < TILES; t++) digests.push(b.subarray(HEAD_FIXED + t * 64, HEAD_FIXED + (t + 1) * 64));
  return { tier, flags: b[11], index: dv.getUint32(12), generation: dv.getUint32(16), k, length: dv.getUint32(28), dataSha512: b.slice(32, 96), digests, headerSha512: b.slice(HEADER_BYTES - 64, HEADER_BYTES) };
}
export function readPageHeader(page) { return parsePageHeader(page.subarray(0, HEADER_BYTES)) || parsePageHeader(page.subarray(PAGE_BYTES - HEADER_BYTES)); }
// decode an intact page: every tile must match its sealed digest (damaged pages are healed by the EDHX runtime itself)
export function decodePage(page) {
  const h = readPageHeader(page); if (!h) throw new Error("EDHX: both page header copies failed");
  const sites = new Float64Array(NSITES);
  for (let t = 0; t < TILES; t++) {
    const blob = page.subarray(HEADER_BYTES + t * TILE_BYTES, HEADER_BYTES + (t + 1) * TILE_BYTES);
    if (!eq(tileDigest(blob), h.digests[t])) throw new Error(`EDHX: page ${h.index} tile ${t} fails its digest (heal it with the EDHX runtime)`);
    const dv = new DataView(blob.buffer, blob.byteOffset, blob.length);
    for (let j = 0; j < TILE_SITES; j++) { let v = dv.getUint16(j * 2); if (blob[512 + (j >> 3)] & (0x80 >> (j & 7))) { if (v) throw new Error("EDHX: escape bit on a nonzero value"); v = 65536; } sites[t * TILE_SITES + j] = v; }
  }
  const coef = ntt(sites, true);
  for (let i = h.k; i < NSITES; i++) if (coef[i] !== 0) throw new Error(`EDHX: page ${h.index} is not a codeword`);
  const out = new Uint8Array(2 * h.k); for (let i = 0; i < h.k; i++) { if (coef[i] > 65535) throw new Error("EDHX: symbol out of range"); out[2 * i] = coef[i] >> 8; out[2 * i + 1] = coef[i] & 255; }
  const data = out.slice(0, h.length); if (!eq(sha512(data), h.dataSha512)) throw new Error(`EDHX: page ${h.index} data digest mismatch`);
  return { data, header: h };
}

/* ------------------------------------------------------------------ frames, head and footer */
const HEAD_END = new Uint8Array([0x0a, 0x1a, 0x0a]), RT = enc.encode("EDHXRT01"), CTL = enc.encode("EDHXCTL1"), PGS = enc.encode("EDHXPGS1"), FOOT = enc.encode("EDHX1\0\0\0");
const STAT = enc.encode("EDHXSTAT"), SEG = enc.encode("EDHXSEG1");
const u64 = (n) => { const b = new Uint8Array(8), dv = new DataView(b.buffer); dv.setUint32(0, Math.floor(n / 4294967296)); dv.setUint32(4, n >>> 0); return b; };
const rd64 = (b, o) => { const dv = new DataView(b.buffer, b.byteOffset); return dv.getUint32(o) * 4294967296 + dv.getUint32(o + 4); };
const find = (hay, needle, from = 0) => { outer: for (let i = from; i <= hay.length - needle.length; i++) { for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer; return i; } return -1; };
export const frame = (magic, payload) => cat([magic, u64(payload.length), sha512(payload), payload]);
function readFrame(data, off, magic, what) {
  if (!eq(data.subarray(off, off + 8), magic)) throw new Error(`EDHX: ${what} frame missing`);
  const n = rd64(data, off + 8), body = data.subarray(off + 80, off + 80 + n);
  if (body.length !== n) throw new Error(`EDHX: ${what} frame truncated`);
  if (!eq(sha512(body), data.subarray(off + 16, off + 80))) throw new Error(`EDHX: ${what} SHA-512 mismatch`);
  return { body, end: off + 80 + n };
}
// the head's fields: `container main { ... }`, `artifact r... { ... }` and `entangle ... { ... }` blocks
export function parseHead(text) {
  const blocks = [], re = /(container|artifact|entangle)\s+([A-Za-z0-9_.\-]+)\s*\{([^}]*)\}/g; let m;
  while ((m = re.exec(text))) { const fields = {}; for (const f of m[3].matchAll(/([a-z_0-9]+)\s*=\s*("(?:[^"\\]|\\.)*"|-?\d+)\s*;/g)) fields[f[1]] = f[2].startsWith('"') ? JSON.parse(f[2]) : Number(f[2]); blocks.push({ kind: m[1], id: m[2], fields }); }
  return blocks;
}
// read a container: its frames, footer and pages, verified; then its state root (the newest generation)
export async function readContainer(data, inflate) {
  const eot = find(data, HEAD_END); if (eot < 0) throw new Error("EDHX: end-of-text mark missing");
  const headText = dec.decode(data.subarray(0, eot)), headLen = eot + 3;
  const rt = readFrame(data, headLen, RT, "runtime"), ctl = readFrame(data, rt.end, CTL, "control");
  if (!eq(data.subarray(ctl.end, ctl.end + 8), PGS)) throw new Error("EDHX: pages frame missing");
  const count = rd64(data, ctl.end + 8), pagesRoot = data.slice(ctl.end + 16, ctl.end + 80), base = ctl.end + 80;
  const pages = []; for (let i = 0; i < count; i++) pages.push(data.subarray(base + i * PAGE_BYTES, base + (i + 1) * PAGE_BYTES));
  const headers = pages.map((p) => readPageHeader(p));
  const root = domainHash("EDHX-PAGES/1", cat(headers.map((h) => h.headerSha512)));
  if (!eq(root, pagesRoot)) throw new Error("EDHX: page root mismatch");
  const fo = base + count * PAGE_BYTES, foot = data.subarray(fo, fo + 376);
  if (foot.length !== 376 || !eq(foot.subarray(0, 8), FOOT) || !eq(sha512(foot.subarray(0, 312)), foot.subarray(312))) throw new Error("EDHX: footer fails");
  const head = parseHead(headText), main = head.find((b) => b.kind === "container")?.fields || {};
  const cache = new Map(), pageData = (i) => { if (!cache.has(i)) cache.set(i, decodePage(pages[i]).data); return cache.get(i); };
  const readExtents = (ext) => cat(ext.map(([p, o, n]) => pageData(p).subarray(o, o + n)));
  // a segment frame: magic | u64 json length | SHA-512(json) | u64 zlib length | zlib(json)
  const segment = async (ref, magic) => {
    const raw = readExtents(ref.extents); if (ref.sha512 && sha512Hex(raw) !== ref.sha512) throw new Error("EDHX: segment SHA-512 mismatch");
    if (!eq(raw.subarray(0, 8), magic)) throw new Error("EDHX: segment magic");
    const jl = rd64(raw, 8), zl = rd64(raw, 80), json = await inflate(raw.subarray(88, 88 + zl));
    if (json.length !== jl || !eq(sha512(json), raw.subarray(16, 80))) throw new Error("EDHX: segment JSON digest mismatch");
    return JSON.parse(dec.decode(json));
  };
  const rootRef = { extents: String(main.root_extents || "").split(";").filter(Boolean).map((s) => s.split(":").map(Number)), sha512: main.root_sha512 };
  const state = await segment(rootRef, STAT);
  return { headText, head, main, runtime: rt.body, control: dec.decode(ctl.body), pages, headers, state, segment: (ref) => segment(ref, SEG), readExtents, pageData };
}

/* ------------------------------------------------------------------ records */
// edac1, EDHX's order-1 bitwise adaptive binary arithmetic coder: 256 contexts (the previous byte) x 255 tree nodes of
// 12-bit P(bit = 1), a 32-bit range; the stream is the length (u32), the code bytes and the low bound's four bytes
export function edacDecode(blob) {
  if (blob.length < 8) throw new Error("EDHX: edac stream too short");
  const dv = new DataView(blob.buffer, blob.byteOffset, blob.length), n = dv.getUint32(0), p = new Uint16Array(65536).fill(2048), out = new Uint8Array(n), L = blob.length;
  let x = dv.getUint32(4), x1 = 0, x2 = 0xffffffff, pos = 8, prev = 0;
  for (let k = 0; k < n; k++) {
    const base = prev * 256; let node = 1;
    for (let i = 0; i < 8; i++) {
      const j = base + node, pj = p[j], xmid = x1 + ((x2 - x1) >>> 12) * pj; let bit;
      if (x <= xmid) { bit = 1; x2 = xmid; p[j] = pj + ((4096 - pj) >> 4); } else { bit = 0; x1 = xmid + 1; p[j] = pj - (pj >> 4); }
      while (!(((x1 ^ x2) >>> 0) & 0xff000000)) { x1 = (x1 << 8) >>> 0; x2 = (((x2 << 8) >>> 0) | 255) >>> 0; x = (((x << 8) >>> 0) | (pos < L ? blob[pos] : 0)) >>> 0; pos++; }
      node = node * 2 + bit;
    }
    out[k] = node - 256; prev = out[k];
  }
  return out;
}
export function edacEncode(data) {
  const p = new Uint16Array(65536).fill(2048), out = [(data.length >>> 24) & 255, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255];
  let x1 = 0, x2 = 0xffffffff, prev = 0;
  for (const byte of data) {
    const base = prev * 256; let node = 1;
    for (let i = 7; i >= 0; i--) {
      const bit = (byte >> i) & 1, j = base + node, pj = p[j], xmid = x1 + ((x2 - x1) >>> 12) * pj;
      if (bit) { x2 = xmid; p[j] = pj + ((4096 - pj) >> 4); } else { x1 = xmid + 1; p[j] = pj - (pj >> 4); }
      while (!(((x1 ^ x2) >>> 0) & 0xff000000)) { out.push(x2 >>> 24); x1 = (x1 << 8) >>> 0; x2 = (((x2 << 8) >>> 0) | 255) >>> 0; }
      node = node * 2 + bit;
    }
    prev = byte;
  }
  out.push((x1 >>> 24) & 255, (x1 >>> 16) & 255, (x1 >>> 8) & 255, x1 & 255);
  return Uint8Array.from(out);
}
// the records of a container read with readContainer: their keys, and a record's newest bytes, checked against its SHA-512
export async function recordIndex(c) {
  if (c.records) return c.records;
  const dir = await c.segment(c.state.directory), records = new Map();
  for (const ref of Object.values(dir.segments.shards || {})) { const shard = await c.segment(ref); for (const [key, r] of Object.entries(shard)) records.set(key, r); }
  c.directory = dir; c.records = records; return records;
}
export async function getRecord(c, key, inflate) {
  const r = (await recordIndex(c)).get(key); if (!r) return null;
  const v = r.versions[r.versions.length - 1]; if (!v || v.deleted) return null;
  const coded = c.readExtents(v.loc.extents);
  const data = v.loc.codec === "raw" ? coded : v.loc.codec === "zlib" ? await inflate(coded) : v.loc.codec === "edac1" ? edacDecode(coded) : null;
  if (!data) throw new Error(`EDHX: unknown codec ${v.loc.codec}`);
  if (data.length !== v.loc.raw_len || sha512Hex(data) !== v.sha512) throw new Error(`EDHX: record ${key} differs from its SHA-512`);
  return data;
}
// the version of a record whose stored bytes have a given SHA-512 (a file keeps a record's earlier versions until it
// is compacted, so a reader can ask for the one a manifest names, whatever was written after it)
export async function getRecordVersion(c, key, sha512hex, inflate) {
  const r = (await recordIndex(c)).get(key); if (!r) return null;
  const v = [...r.versions].reverse().find((x) => !x.deleted && x.sha512 === sha512hex); if (!v) return null;
  const coded = c.readExtents(v.loc.extents);
  const data = v.loc.codec === "raw" ? coded : v.loc.codec === "zlib" ? await inflate(coded) : v.loc.codec === "edac1" ? edacDecode(coded) : null;
  if (!data || data.length !== v.loc.raw_len || sha512Hex(data) !== v.sha512) throw new Error(`EDHX: record ${key} differs from its SHA-512`);
  return data;
}
export const recordText = async (c, key, inflate) => { const b = await getRecord(c, key, inflate); return b ? dec.decode(b) : null; };
