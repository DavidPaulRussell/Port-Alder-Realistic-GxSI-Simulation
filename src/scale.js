// SPDX-License-Identifier: GPL-3.0-only
// The size of the city: how many cells its map has on a side, and how many people, households, businesses, loans and
// buildings its tables can hold.
//
// It is fixed before the city's modules load, because they build their own constants from it (a household's entity
// number, a cell's index). Set globalThis.PLUME_SCALE to "full" (or to an object of sizes) before importing anything
// else; left unset, it is the one-in-ten city, exactly as it has always been.
//
//   tenth   128 x 128 cells of 20 m (2.56 km), about 12,000 citizens standing for Everett's 115,000
//   full    1,024 x 1,024 cells of 20 m (20.48 km), every one of the 391,000 people of the map's area (docs/STAGE2.md)
const PRESETS = {
  tenth: { n: 128, people: 24576, households: 8192, firms: 2048, loans: 32768, buildings: 8192, dwellings: 12288, spaces: 4096, projects: 1024, proposals: 8192 },
  full: { n: 1024, people: 458752, households: 196608, firms: 24576, loans: 327680, buildings: 196608, dwellings: 229376, spaces: 49152, projects: 8192, proposals: 65536 },
};
// (in Node the environment variable PLUME_SCALE does the same: a name, or the sizes as JSON)
const fromEnv = () => { const v = typeof process !== "undefined" && process.env ? process.env.PLUME_SCALE : undefined; return v && v.trim().startsWith("{") ? JSON.parse(v) : v || undefined; };
const asked = globalThis.PLUME_SCALE ?? fromEnv(), base = typeof asked === "string" ? PRESETS[asked] : asked ? { ...PRESETS.tenth, ...asked } : PRESETS.tenth;
if (!base) throw new Error(`unknown scale "${asked}" (tenth or full)`);
if (!Number.isInteger(base.n) || base.n < 64 || base.n > 2048 || (base.n & (base.n - 1))) throw new Error("the map's side must be a power of two from 64 to 2048 cells");
export const SCALE = Object.freeze({ name: typeof asked === "string" ? asked : asked ? asked.name || "custom" : "tenth", ...base });
export const N = SCALE.n, CELLS = N * N, NSHIFT = 31 - Math.clz32(N), NMASK = N - 1;
// a cell's index from its column and row, and back
export const cellOf = (x, y) => (y << NSHIFT) | x, cellX = (c) => c & NMASK, cellY = (c) => c >> NSHIFT;
// a column or a row takes one byte on the small map and two on the large (the tables' bytes, and so the digests of
// the one-in-ten city, stay as they were)
export const CoordArray = N > 256 ? Uint16Array : Uint8Array;
// a check for the tests: look at every business when shopping, instead of only those near enough to matter
export const SHOP_ALL = !!(globalThis.PLUME_SHOP_ALL ?? (typeof process !== "undefined" && process.env && process.env.PLUME_SHOP_ALL));
