// The national registry of Social Information Numbers. Every person the simulation knows individually, in Port Alder
// and in the sampled households of the outer layers, is issued a number: at the founding census, at birth, on arrival
// from a place where they were not known one by one, or on admission from abroad. A number is never reused or
// changed; it follows its holder through moves between the layers, and every reference to a person that outlives a
// day (friends, partners, owners, authors, memories, cases, returns, events) is by number, not by memory slot.
// Format: office, serial, check letter, e.g. PA-0004172-K. The check letter is a weighted congruence (law 9.3).
// SPDX-License-Identifier: GPL-3.0-only
import { sinCheck, SIN_ALPHABET, lamport } from "./laws.js";

export const OFFICES = ["PA", "PC", "PG", "UN", "AB"];
export const OFFICE_NAMES = ["Port Alder", "Pilchuck County", "State of Puget", "United North American States", "admitted from abroad"];
export const CAUSES = ["founding census", "birth", "arrival", "admission"];
export const SIN_STATUS = ["in Port Alder", "in the outer layers", "deceased"];
const SYM = (ch) => { const k = SIN_ALPHABET.indexOf(ch); return k >= 0 ? k : 0; };
const grow = (a, n) => { const b = new a.constructor(n); b.set(a); return b; };

export function attachRegistry(c) {
  const R = { n: 0, cap: 0, serial: [0, 0, 0, 0, 0], clock: 0 };
  for (const [k, T] of [["office", Uint8Array], ["number", Int32Array], ["slot", Int32Array], ["outer", Int32Array], ["place", Int16Array], ["issued", Int32Array], ["cause", Uint8Array], ["status", Uint8Array], ["ended", Int32Array], ["stamp", Int32Array]]) R[k] = new T(0);
  c.reg = R;
  c.sinText = (g) => sinText(c, g);
  c.slotOf = (g) => (g >= 0 && g < R.n && R.status[g] === 0 ? R.slot[g] : -1);
  c.who = (i) => (i >= 0 && c.people.alive[i] ? `${c.names.person(i)} (${sinText(c, c.people.sin[i])})` : "someone");
  c.personRef = (i) => -(c.people.sin[i] + 2);                // a memory's reference to a person: by number, negative
  c.refPerson = (w) => (w <= -2 ? c.slotOf(-w - 2) : -1);
}
function room(R, need) { if (need <= R.cap) return; const cap = Math.max(1024, need * 2); for (const k of ["office", "number", "slot", "outer", "place", "issued", "cause", "status", "ended", "stamp"]) R[k] = grow(R[k], cap); R.cap = cap; }
// issue a number; slot is the citizen's slot (or -1), outer is outer household * 8 + member (or -1)
export function issue(c, office, cause, slot = -1, outer = -1, place = -1) {
  const R = c.reg; room(R, R.n + 1); const g = R.n++;
  R.office[g] = office; R.number[g] = ++R.serial[office]; R.slot[g] = slot; R.outer[g] = outer; R.place[g] = place; R.issued[g] = c.epoch; R.cause[g] = cause; R.status[g] = slot >= 0 ? 0 : 1; R.ended[g] = 0;
  R.clock = lamport(R.clock); R.stamp[g] = R.clock;
  return g;
}
export function sinText(c, g) {
  const R = c.reg; if (g < 0 || g >= R.n) return "none";
  const off = OFFICES[R.office[g]], digits = String(R.number[g]).padStart(7, "0");
  return `${off}-${digits}-${sinCheck([SYM(off[0]), SYM(off[1]), ...[...digits].map(Number)])}`;
}
// the holder of a written number, or -1 if it is malformed, fails its check letter or was never issued
export function lookup(c, text) {
  const m = /^([A-Z]{2})-(\d{7})-([A-Z2-9])$/.exec(String(text).trim().toUpperCase()); if (!m) return -1;
  const off = OFFICES.indexOf(m[1]); if (off < 0) return -1;
  if (sinCheck([SYM(m[1][0]), SYM(m[1][1]), ...[...m[2]].map(Number)]) !== m[3]) return -1;
  const R = c.reg, num = +m[2]; for (let g = 0; g < R.n; g++) if (R.office[g] === off && R.number[g] === num) return g;
  return -1;
}
// the holder moves: into the city (slot), or out to an outer household (outer, place)
export function relocate(c, g, slot, outer = -1, place = -1) { const R = c.reg; if (g < 0) return; R.slot[g] = slot; R.outer[g] = outer; R.place[g] = place; R.status[g] = slot >= 0 ? 0 : 1; R.clock = lamport(R.clock, R.stamp[g]); R.stamp[g] = R.clock; }
export function retire(c, g) { const R = c.reg; if (g < 0) return; R.status[g] = 2; R.slot[g] = -1; R.outer[g] = -1; R.ended[g] = c.epoch; R.clock = lamport(R.clock, R.stamp[g]); R.stamp[g] = R.clock; }
export function registryBytes(c) { const R = c.reg, n = R.n, parts = ["office", "number", "slot", "outer", "place", "issued", "cause", "status", "ended", "stamp"].map((k) => new Uint8Array(R[k].buffer, 0, n * R[k].BYTES_PER_ELEMENT)); const t = parts.reduce((s, p) => s + p.length, 0), out = new Uint8Array(t); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; }
export function registryRows(c, from = 0, count = 50) {
  const R = c.reg, rows = [];
  for (let g = from; g < Math.min(R.n, from + count); g++) rows.push({ sin: sinText(c, g), office: OFFICE_NAMES[R.office[g]], cause: CAUSES[R.cause[g]], issued: R.issued[g], status: SIN_STATUS[R.status[g]], slot: R.slot[g], ended: R.ended[g] || null });
  return rows;
}
