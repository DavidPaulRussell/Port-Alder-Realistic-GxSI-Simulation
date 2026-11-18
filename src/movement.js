// SPDX-License-Identifier: GPL-3.0-only
// The movement matrix: who moves between Port Alder, the 26 places of its three outer layers and the world beyond.
//
// Its geography is measured, not assumed. movement_data.js holds, for every pair of places, the kernel of the gravity
// law (75.41) averaged over where the two places' people actually live, and the mean distance between them, both
// taken from a 100 m population raster (WorldPop R2025A v1, CC BY 4.0) by tools/make_movement.mjs. Its masses are the
// simulation's own, month by month: a place that grows draws more of every other place's movers, one that empties
// draws fewer. What households then make of it (their work, their rents, their ties, the years they look ahead) is
// theirs to decide, in periphery.js; the moves they make are counted here, origin by destination, month by month.
import { MOVE_KERNEL, MOVE_DIST } from "./movement_data.js";
import { lawUse } from "./laws.js";

// units of the matrix: 0..25 are the places of periphery.js in their order, 26 is Port Alder, 27 the world beyond
export const MOVE_UNITS = 28, M_CITY = 26, M_ABROAD = 27, MOVE_MONTHS = 12;
// a place index of periphery.js (-1: Port Alder; 26: abroad) as a unit of the matrix
export const moveUnit = (p) => (p < 0 ? M_CITY : p >= 26 ? M_ABROAD : p);
// the mean distance (km) between a person of one place and a person of another (law 76.5 over where people live)
export function moveKm(p, q) { const a = moveUnit(p), b = moveUnit(q); return a === b ? 0 : a === M_ABROAD || b === M_ABROAD ? 9000 : MOVE_DIST[a][b]; }
export function newMovement() {
  lawUse("76.5");                                                           // the distances are great-circle distances between where people live
  const n = MOVE_UNITS * MOVE_UNITS;
  return { prior: new Float64Array(n), months: new Float64Array(n * MOVE_MONTHS), slot: 0, total: new Float64Array(n), pop: new Float64Array(MOVE_UNITS) };
}
// The prior: of a unit's movers, the share each other unit draws by its people and by how near to the origin's people
// they live (law 75.41 with the distance term averaged over both populations). Rows sum to 1; the world beyond has
// no row and no column here (its movers answer the news, and the nation's capacity admits them).
export function movePrior(mv, pop) {
  lawUse("75.41");
  for (let i = 0; i < M_ABROAD; i++) {
    let z = 0; for (let j = 0; j < M_ABROAD; j++) if (j !== i) z += pop[j] * MOVE_KERNEL[i][j];
    for (let j = 0; j < M_ABROAD; j++) mv.prior[i * MOVE_UNITS + j] = j === i || z <= 0 ? 0 : (pop[j] * MOVE_KERNEL[i][j]) / z;
    mv.pop[i] = pop[i];
  }
  return mv;
}
export const priorOf = (mv, p, q) => mv.prior[moveUnit(p) * MOVE_UNITS + moveUnit(q)];
// persons who moved from one place to another, counted in the current month
export function countMove(mv, p, q, persons) { const k = moveUnit(p) * MOVE_UNITS + moveUnit(q); mv.months[mv.slot * MOVE_UNITS * MOVE_UNITS + k] += persons; mv.total[k] += persons; }
// a new month: the oldest month's moves leave the twelve-month window
export function rollMovement(mv) { const n = MOVE_UNITS * MOVE_UNITS; mv.slot = (mv.slot + 1) % MOVE_MONTHS; mv.months.fill(0, mv.slot * n, (mv.slot + 1) * n); }
// the matrix of the last twelve months (persons), row = from, column = to
export function movedLastYear(mv) {
  const n = MOVE_UNITS * MOVE_UNITS, out = new Float64Array(n);
  for (let m = 0; m < MOVE_MONTHS; m++) for (let k = 0; k < n; k++) out[k] += mv.months[m * n + k];
  return out;
}
// the largest flows of the last twelve months: [from unit, to unit, persons], largest first
export function topMoves(mv, count = 12) {
  const m = movedLastYear(mv), rows = [];
  for (let i = 0; i < MOVE_UNITS; i++) for (let j = 0; j < MOVE_UNITS; j++) if (m[i * MOVE_UNITS + j] >= 0.5) rows.push([i, j, Math.round(m[i * MOVE_UNITS + j])]);
  return rows.sort((x, y) => y[2] - x[2] || x[0] - y[0] || x[1] - y[1]).slice(0, count);
}
