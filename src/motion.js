// The physics of the 3D city (laws of laws.js): cars accelerate and brake by Newton's second law (21.2), integrated by
// velocity Verlet (44.16); the sun's position from the Julian date and hour angle (40.10, 40.6) and its colour as a
// blackbody (39.17); street lamps as 3000 K blackbodies; and the tide in Port Gardner from its main constituents (48.42).
// These drive pictures only; nothing here enters the simulation's state.
// SPDX-License-Identifier: GPL-3.0-only
import { accel, verlet, blackbody, julian, sun, tide, DEG } from "./laws.js";

// a trip's distance along its path as a fraction of the path, at a fraction of its duration: the car pulls away at the
// engine's force on its mass, cruises, and brakes to a stop (one profile, integrated once and kept as a table)
const PROFILE = (() => {
  const m = 1500, Fdrive = 3000, Fbrake = -4500, vmax = 13.9, L = 1200, dt = 0.25, s = [0], t = [0];
  let x = 0, v = 0, time = 0, a = accel(Fdrive, m);
  while (x < L && time < 600) {
    const brakeAt = L - (v * v) / (2 * (-Fbrake / m)), aNext = x >= brakeAt ? accel(Fbrake, m) : v >= vmax ? 0 : accel(Fdrive, m);
    const st = verlet(x, v, a, aNext, dt); x = Math.min(L, st.x); v = Math.max(0.3, Math.min(vmax, st.v)); a = aNext; time += dt; s.push(x / L); t.push(time);
  }
  const T = time; return { s, t: t.map((x) => x / T) };
})();
export function along(f) {
  const { s, t } = PROFILE; if (f <= 0) return 0; if (f >= 1) return 1;
  let lo = 0, hi = t.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t[mid] <= f) lo = mid; else hi = mid; }
  const u = (f - t[lo]) / Math.max(1e-9, t[hi] - t[lo]); return s[lo] + (s[hi] - s[lo]) * u;
}
// the sun as seen from Port Alder: direction (x east, y up, z south) and colour, for a day of the year and local minutes
export function sunAt(y, m, d, minutes, dst) {
  const ut = (minutes - (dst ? -7 : -8) * 60) / 60, jd = julian(y, m, d), s = sun(jd + Math.floor(ut / 24), ((ut % 24) + 24) % 24, 47.979, -122.202);
  const el = s.elev * 2 * Math.PI, lat = 47.979 * Math.PI / 180, dec = s.dec * 2 * Math.PI, ha = s.ha * 2 * Math.PI;
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) + Math.PI;
  const T = 1900 + 3900 * Math.max(0, Math.min(1, Math.sin(Math.max(0, el)) * 2.2)), bb = blackbody(T);
  return { dir: [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)], rgb: bb.rgb, lum: Math.min(1.2, bb.lum), daylight: s.daylight };
}
export const LAMP = blackbody(3000).rgb;
// Port Gardner's tide (metres about mean sea level): the principal lunar and solar semidiurnal and the diurnal
// constituents, with amplitudes like Puget Sound's (illustrative phases)
export const TIDE = [[1.07, 12.4206, 0.1], [0.26, 12.0, 0.35], [0.21, 12.6583, 0.05], [0.83, 23.9345, 0.6], [0.46, 25.8193, 0.45]];
export const tideAt = (hours) => tide(TIDE, hours);
