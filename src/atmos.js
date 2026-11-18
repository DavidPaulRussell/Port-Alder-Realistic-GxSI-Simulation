// A spectral sky for the Port Alder renderer (from the Deer Valley renderer): Rayleigh, Mie and ozone at eight wavelengths.
// SPDX-License-Identifier: GPL-3.0-only
//
// The atmosphere is a planet of radius 6360 km with a 100 km shell. Rayleigh scattering goes as
// lambda^-4 (13.558e-6 per metre at 550 nm, scale height 8 km), aerosols are a Mie layer (scale height
// 1.2 km, Cornette-Shanks phase) and ozone is an absorbing tent around 25 km with the Chappuis band's
// shape (the twilight's deep blue). Eight 40 nm bins from 395 to 715 nm carry the light; each bin is
// weighted by the CIE 1931 colour-matching functions and the solar spectrum when it becomes linear sRGB.
// Following the structure of Hillaire (2020): a transmittance LUT and a multiple-scattering LUT once,
// a sky-view LUT each frame, converted to an RGB panorama with mipmaps that every shader samples for its
// sky, its fog colour and its ambient light. The sun's colour in the city comes from the same numbers,
// integrated on the CPU.
import { compileProgram, texture, target } from "./gl.js";

export const LAMBDA = [415, 455, 495, 535, 575, 615, 655, 695];
// CIE 1931 2-degree colour-matching functions at 10 nm, 400 to 710 nm
const CMF = [
  [0.01431, 0.000396, 0.06785], [0.04351, 0.00121, 0.2074], [0.13438, 0.004, 0.6456], [0.2839, 0.0116, 1.3856],
  [0.34828, 0.023, 1.74706], [0.3362, 0.038, 1.77211], [0.2908, 0.06, 1.6692], [0.19536, 0.09098, 1.28764],
  [0.09564, 0.13902, 0.81295], [0.03201, 0.20802, 0.46518], [0.0049, 0.323, 0.272], [0.0093, 0.503, 0.1582],
  [0.06327, 0.71, 0.07825], [0.1655, 0.862, 0.04216], [0.2904, 0.954, 0.0203], [0.43345, 0.99495, 0.00875],
  [0.5945, 0.995, 0.0039], [0.7621, 0.952, 0.0021], [0.9163, 0.87, 0.00165], [1.0263, 0.757, 0.0011],
  [1.0622, 0.631, 0.0008], [1.0026, 0.503, 0.00034], [0.85445, 0.381, 0.00019], [0.6424, 0.265, 0.00005],
  [0.4479, 0.175, 0.00002], [0.2835, 0.107, 0.0], [0.1649, 0.061, 0.0], [0.0874, 0.032, 0.0],
  [0.04677, 0.017, 0.0], [0.0227, 0.00821, 0.0], [0.011359, 0.004102, 0.0], [0.00579, 0.002091, 0.0],
];
// solar spectral irradiance above the atmosphere, W m^-2 nm^-1, averaged over each bin
export const SOLAR = [1.72, 2.03, 1.95, 1.86, 1.82, 1.70, 1.55, 1.40];
// ozone's absorption cross-section, 1e-21 cm^2 (Chappuis band: maxima near 575 and 603 nm, 5.2e-21 at the peak)
const OZONE_XS = [0.03, 0.3, 1.1, 2.7, 4.85, 4.95, 2.7, 1.05];
export const RAYLEIGH = LAMBDA.map((l) => 13.558e-6 * Math.pow(550 / l, 4));
export const OZONE = OZONE_XS.map((s) => s * 0.57e-6);        // at the layer's peak density (about 5.7e18 per m^3)
export const MIE = { scatter: 3.996e-6, absorb: 0.444e-6, g: 0.8, H: 1200 };
export const PLANET = { Rg: 6360e3, Rt: 6460e3, HR: 8000, valleyAlt: 40 };

// per-bin weights to linear sRGB (D65), with the solar spectrum folded in and scaled so that the sun above
// the atmosphere has luminance SUN_Y in the renderer's units
const SUN_Y = 3.45;
export const BIN_RGB = (() => {
  const xyz = LAMBDA.map((_, k) => [0, 1, 2].map((c) => CMF.slice(4 * k, 4 * k + 4).reduce((s, v) => s + v[c] * 10, 0)));
  let Y = 0; for (let k = 0; k < 8; k++) Y += xyz[k][1] * SOLAR[k];
  const s = SUN_Y / Y;
  return xyz.map(([X, Yb, Z], k) => {
    const r = 3.2406 * X - 1.5372 * Yb - 0.4986 * Z, g = -0.9689 * X + 1.8758 * Yb + 0.0415 * Z, b = 0.0557 * X - 0.204 * Yb + 1.057 * Z;
    return [r * SOLAR[k] * s, g * SOLAR[k] * s, b * SOLAR[k] * s];
  });
})();
export const spectrumToRGB = (L) => { const o = [0, 0, 0]; for (let k = 0; k < 8; k++) for (let c = 0; c < 3; c++) o[c] += BIN_RGB[k][c] * L[k]; return o; };

// optical depth along a ray from altitude h (metres) with cosine of zenith angle mu, to the top (or Infinity into the ground)
function opticalDepth(h, mu, steps = 48) {
  const { Rg, Rt, HR } = PLANET, r = Rg + h;
  const disc = r * r * (mu * mu - 1) + Rg * Rg;
  if (mu < 0 && disc >= 0 && -r * mu - Math.sqrt(disc) > 0) return null;   // the ground is in the way
  const len = -r * mu + Math.sqrt(Math.max(0, r * r * (mu * mu - 1) + Rt * Rt)), dt = len / steps;
  let tR = 0, tM = 0, tO = 0;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) * dt, hh = Math.sqrt(r * r + t * t + 2 * r * t * mu) - Rg;
    tR += Math.exp(-hh / HR) * dt; tM += Math.exp(-hh / MIE.H) * dt; tO += Math.max(0, 1 - Math.abs(hh - 25000) / 15000) * dt;
  }
  return { tR, tM, tO };
}
// the sun's colour (linear sRGB, renderer units) seen from altitude h; the disc fades as it sets (its radius is 0.27 degrees)
export function sunColor(sunY, h = PLANET.valleyAlt, haze = 1) {
  const mu = Math.max(-1, Math.min(1, sunY)), od = opticalDepth(h, Math.max(mu, -0.02));
  if (!od) return [0, 0, 0];
  const T = LAMBDA.map((_, k) => Math.exp(-(RAYLEIGH[k] * od.tR + (MIE.scatter + MIE.absorb) * haze * od.tM + OZONE[k] * od.tO)));
  const c = spectrumToRGB(T), dip = -Math.acos(PLANET.Rg / (PLANET.Rg + h));     // the geometric horizon is below level
  const vis = Math.max(0, Math.min(1, (Math.asin(mu) - dip + 0.0047) / 0.0094));
  return c.map((x) => x * vis);
}
// the valley's haze: extinction per metre in linear sRGB's three primaries at altitude h (Rayleigh at 610, 540, 465 nm, plus aerosol)
export function hazeExtinction(h = PLANET.valleyAlt, visibilityKm = 40) {
  const mie = 3.912 / (visibilityKm * 1000), r = Math.exp(-h / PLANET.HR);
  return [610, 540, 465].map((l) => 13.558e-6 * Math.pow(550 / l, 4) * r + mie);
}

const HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
`;
// The loops below integrate along rays. Their bounds carry u_keepLoops (never set: 0), so that Direct3D's compiler
// (FXC, under ANGLE on Windows) keeps them loops rather than unrolling 1280 steps, and every lookup inside them
// is textureLod (the tables have no mipmaps): a gradient operation in a loop with a continue is an error for FXC,
// and ANGLE's retries after such an error are slow. See valley3d_detail.js for what that cost in 1.4.0.
const ATMOS = `
const float Rg = 6360e3, Rt = 6460e3, PI = 3.14159265;
uniform vec4 u_rayA, u_rayB, u_ozA, u_ozB; uniform vec3 u_mie;   // Mie scatter, absorb, g
uniform int u_keepLoops;
void ext(float h, out vec4 a, out vec4 b, out float mS) {
  float r = exp(-h / 8000.0), m = exp(-h / 1200.0), o = max(0.0, 1.0 - abs(h - 25000.0) / 15000.0);
  mS = u_mie.x * m; a = u_rayA * r + (u_mie.x + u_mie.y) * m + u_ozA * o; b = u_rayB * r + (u_mie.x + u_mie.y) * m + u_ozB * o;
}
// distance along a ray from radius r with zenith cosine mu to the sphere of radius R (-1 if none ahead)
float sphere(float r, float mu, float R) { float d = r * r * (mu * mu - 1.0) + R * R; if (d < 0.0) return -1.0; float s = sqrt(d), t0 = -r * mu - s, t1 = -r * mu + s; return t0 > 0.0 ? t0 : t1 > 0.0 ? t1 : -1.0; }
vec2 rMuToUV(float r, float mu) {
  float H = sqrt(Rt * Rt - Rg * Rg), rho = sqrt(max(r * r - Rg * Rg, 0.0));
  float d = max(0.0, -r * mu + sqrt(max(r * r * (mu * mu - 1.0) + Rt * Rt, 0.0))), dmin = Rt - r, dmax = rho + H;
  return vec2((d - dmin) / max(dmax - dmin, 1.0), rho / H);
}
float rayleighPhase(float c) { return 3.0 / (16.0 * PI) * (1.0 + c * c); }
float miePhase(float c, float g) { float g2 = g * g; return 3.0 / (8.0 * PI) * (1.0 - g2) * (1.0 + c * c) / ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5)); }
`;
const FULL_VS = HEAD + `out vec2 v_uv; void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); v_uv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
// transmittance from (r, mu) to the top of the atmosphere, eight wavelengths in two targets
const TRANS_FS = HEAD + ATMOS + `
in vec2 v_uv; layout(location=0) out vec4 oA; layout(location=1) out vec4 oB;
void main() {
  float H = sqrt(Rt * Rt - Rg * Rg), rho = H * v_uv.y, r = sqrt(rho * rho + Rg * Rg);
  float dmin = Rt - r, dmax = rho + H, d = dmin + v_uv.x * (dmax - dmin);
  float mu = d == 0.0 ? 1.0 : clamp((H * H - rho * rho - d * d) / (2.0 * r * d), -1.0, 1.0);
  vec4 tA = vec4(0.0), tB = vec4(0.0); float dt = d / 40.0;
  for (int i = 0; i < 40 + u_keepLoops; i++) { float t = (float(i) + 0.5) * dt, h = sqrt(r * r + t * t + 2.0 * r * t * mu) - Rg; vec4 a, b; float m; ext(h, a, b, m); tA += a * dt; tB += b * dt; }
  oA = exp(-tA); oB = exp(-tB);
}`;
// Hillaire's multiple scattering: the second-order light from a uniform sphere of directions, summed as a geometric series
const MS_FS = HEAD + ATMOS + `
in vec2 v_uv; layout(location=0) out vec4 oA; layout(location=1) out vec4 oB;
uniform sampler2D u_tA, u_tB;
void trans(float r, float mu, out vec4 a, out vec4 b) { vec2 uv = rMuToUV(r, mu); a = textureLod(u_tA, uv, 0.0); b = textureLod(u_tB, uv, 0.0); }
void main() {
  float muS = v_uv.x * 2.0 - 1.0, r = Rg + 1.0 + v_uv.y * (Rt - Rg - 2.0);
  vec4 LA = vec4(0.0), LB = vec4(0.0), fA = vec4(0.0), fB = vec4(0.0);
  const float ALB = 0.3;
  for (int j = 0; j < 8 + u_keepLoops; j++) for (int i = 0; i < 8 + u_keepLoops; i++) {
    float th = acos(1.0 - 2.0 * (float(j) + 0.5) / 8.0), ph = (float(i) + 0.5) / 8.0 * 2.0 * PI;
    vec3 dir = vec3(sin(th) * cos(ph), cos(th), sin(th) * sin(ph)); float mu = dir.y;
    vec3 sun = vec3(sqrt(1.0 - muS * muS), muS, 0.0);
    float tG = sphere(r, mu, Rg), tT = sphere(r, mu, Rt), len = tG > 0.0 ? tG : tT; if (len <= 0.0) continue;
    float dt = len / 20.0; vec4 TA = vec4(1.0), TB = vec4(1.0), sA = vec4(0.0), sB = vec4(0.0), mA = vec4(0.0), mB = vec4(0.0);
    for (int s = 0; s < 20 + u_keepLoops; s++) {
      float t = (float(s) + 0.5) * dt; vec3 p = vec3(0.0, r, 0.0) + dir * t; float rr = length(p), h = rr - Rg;
      vec4 eA, eB; float mS; ext(h, eA, eB, mS);
      float rS = exp(-h / 8000.0); vec4 scA = u_rayA * rS + mS, scB = u_rayB * rS + mS;
      vec4 stA, stB; float muSp = dot(p / rr, sun); trans(rr, muSp, stA, stB);
      float earth = sphere(rr, muSp, Rg) > 0.0 ? 0.0 : 1.0;
      vec4 dA = exp(-eA * dt), dB = exp(-eB * dt);
      vec4 iA = (scA * stA * earth / (4.0 * PI) - scA * stA * earth / (4.0 * PI) * dA) / max(eA, vec4(1e-12)), iB = (scB * stB * earth / (4.0 * PI) - scB * stB * earth / (4.0 * PI) * dB) / max(eB, vec4(1e-12));
      sA += TA * iA; sB += TB * iB;
      mA += TA * (scA - scA * dA) / max(eA, vec4(1e-12)); mB += TB * (scB - scB * dB) / max(eB, vec4(1e-12));
      TA *= dA; TB *= dB;
    }
    if (tG > 0.0) { vec3 p = vec3(0.0, r, 0.0) + dir * tG; vec3 n = normalize(p); vec4 stA, stB; trans(Rg, dot(n, sun), stA, stB); float c = max(dot(n, sun), 0.0) * ALB / PI; sA += TA * stA * c; sB += TB * stB * c; }
    LA += sA / 64.0; LB += sB / 64.0; fA += mA / 64.0; fB += mB / 64.0;
  }
  oA = LA / max(1.0 - fA, vec4(1e-3)); oB = LB / max(1.0 - fB, vec4(1e-3));
}`;
// the sky as seen from the valley: azimuth about the sun, and elevation squeezed towards the horizon
const VIEW_FS = HEAD + ATMOS + `
in vec2 v_uv; layout(location=0) out vec4 oA; layout(location=1) out vec4 oB;
uniform sampler2D u_tA, u_tB, u_mA, u_mB; uniform float u_alt; uniform float u_sunMu; uniform float u_horizon; uniform float u_haze;
void trans(float r, float mu, out vec4 a, out vec4 b) { vec2 uv = rMuToUV(r, mu); a = textureLod(u_tA, uv, 0.0); b = textureLod(u_tB, uv, 0.0); }
void main() {
  float v = v_uv.y, hz = u_horizon, lat = v >= 0.5 ? hz + (1.5708 - hz) * pow((v - 0.5) * 2.0, 2.0) : hz - (1.5708 + hz) * pow((0.5 - v) * 2.0, 2.0);
  float az = v_uv.x * 2.0 * PI;
  vec3 dir = vec3(cos(lat) * cos(az), sin(lat), cos(lat) * sin(az)), sun = vec3(sqrt(max(1.0 - u_sunMu * u_sunMu, 0.0)), u_sunMu, 0.0);
  float r = Rg + u_alt, mu = dir.y, tG = sphere(r, mu, Rg), tT = sphere(r, mu, Rt), len = tG > 0.0 ? tG : tT;
  float c = dot(dir, sun), pR = rayleighPhase(c), pM = miePhase(c, u_mie.z);
  vec4 TA = vec4(1.0), TB = vec4(1.0), LA = vec4(0.0), LB = vec4(0.0); float t0 = 0.0;
  for (int s = 0; s < 32 + u_keepLoops; s++) {
    float t1 = len * pow((float(s) + 1.0) / 32.0, 2.0), dt = t1 - t0, t = (t0 + t1) * 0.5; t0 = t1;
    vec3 p = vec3(0.0, r, 0.0) + dir * t; float rr = length(p), h = rr - Rg;
    vec4 eA, eB; float mS; ext(h, eA, eB, mS); mS *= u_haze; eA += (u_haze - 1.0) * (u_mie.x + u_mie.y) * exp(-h / 1200.0); eB += (u_haze - 1.0) * (u_mie.x + u_mie.y) * exp(-h / 1200.0);
    float rS = exp(-h / 8000.0); vec4 rsA = u_rayA * rS, rsB = u_rayB * rS;
    float muSp = dot(p / rr, sun); vec4 stA, stB; trans(rr, muSp, stA, stB); float earth = sphere(rr, muSp, Rg) > 0.0 ? 0.0 : 1.0;
    vec2 muv = vec2(muSp * 0.5 + 0.5, clamp(h / (Rt - Rg), 0.0, 1.0)); vec4 msA = textureLod(u_mA, muv, 0.0), msB = textureLod(u_mB, muv, 0.0);
    vec4 sA = (rsA * pR + mS * pM) * stA * earth + (rsA + mS) * msA, sB = (rsB * pR + mS * pM) * stB * earth + (rsB + mS) * msB;
    vec4 dA = exp(-eA * dt), dB = exp(-eB * dt);
    LA += TA * (sA - sA * dA) / max(eA, vec4(1e-12)); LB += TB * (sB - sB * dB) / max(eB, vec4(1e-12));
    TA *= dA; TB *= dB;
  }
  oA = LA; oB = LB;
}`;
// eight wavelengths to linear sRGB, plus the night's moonlit sky
const RGB_FS = HEAD + `
in vec2 v_uv; out vec4 o; uniform sampler2D u_vA, u_vB; uniform vec4 u_wR[2], u_wG[2], u_wB[2]; uniform vec3 u_nightZen, u_nightHor; uniform float u_night, u_horizon;
void main() {
  vec4 a = texture(u_vA, v_uv), b = texture(u_vB, v_uv);
  vec3 c = vec3(dot(a, u_wR[0]) + dot(b, u_wR[1]), dot(a, u_wG[0]) + dot(b, u_wG[1]), dot(a, u_wB[0]) + dot(b, u_wB[1]));
  float v = v_uv.y, up = clamp((v - 0.5) * 2.0, 0.0, 1.0);
  c += mix(u_nightHor, u_nightZen, sqrt(up)) * u_night * (v > 0.5 ? 1.0 : 0.5);
  o = vec4(max(c, vec3(0.0)), 1.0);
}`;
// GLSL for every scene shader: the panorama as the sky radiance in a direction
export const SKY_LOOKUP = `
uniform sampler2D u_skyPano; uniform vec2 u_skyAz;   // the sun's azimuth, the horizon's elevation (radians)
vec2 skyUV(vec3 d) {
  float lat = asin(clamp(d.y, -1.0, 1.0)), hz = u_skyAz.y;
  float v = lat >= hz ? 0.5 + 0.5 * sqrt((lat - hz) / (1.5708 - hz)) : 0.5 - 0.5 * sqrt(max(hz - lat, 0.0) / (1.5708 + hz));
  return vec2(fract((atan(d.z, d.x) - u_skyAz.x) / 6.2831853 + 1.0), clamp(v, 0.002, 0.998));
}
vec3 skyRadiance(vec3 d, float lod) { return textureLod(u_skyPano, skyUV(normalize(d)), lod).rgb; }
`;

// the sky's programs: [vertex shader, fragment shader, label]
export const ATMOS_PROGRAMS = { trans: [FULL_VS, TRANS_FS, "transmittance"], ms: [FULL_VS, MS_FS, "multiple scattering"], view: [FULL_VS, VIEW_FS, "sky view"], rgb: [FULL_VS, RGB_FS, "sky rgb"] };

export class Atmosphere {
  // programs: the ATMOS_PROGRAMS already compiled (Valley3D compiles them with its own, without blocking); without
  // them they are compiled here, at once. The tables are half float where this context can render to it, else
  // 8-bit (the sky then clips its brightest light, but it renders).
  constructor(gl, programs = null) {
    this.gl = gl; this.P = programs ?? {};
    if (!programs) for (const [k, [vs, fs, label]] of Object.entries(ATMOS_PROGRAMS)) this.P[k] = compileProgram(gl, vs, fs, label);
    this.halfFloat = !!(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
    const f16 = this.halfFloat ? { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT } : { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
    this.transT = target(gl, 256, 64, { color: [f16, f16], depth: false });
    this.msT = target(gl, 32, 32, { color: [f16, f16], depth: false });
    this.viewT = target(gl, 192, 108, { color: [f16, f16], depth: false });
    this.pano = texture(gl, 192, 108, { ...f16, mips: true, wrap: gl.CLAMP_TO_EDGE });
    gl.bindTexture(gl.TEXTURE_2D, this.pano); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    this.panoFb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.panoFb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.pano, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    for (const t of [...this.transT.tex, ...this.msT.tex, ...this.viewT.tex]) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); }
    for (const t of this.viewT.tex) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); }
    this.empty = gl.createVertexArray(); this.ready = false; this.sunAz = 0; this.horizon = -Math.acos(PLANET.Rg / (PLANET.Rg + PLANET.valleyAlt));
  }
  coeffs(p) {
    const gl = this.gl, u = p.u;
    gl.uniform4fv(u.u_rayA, RAYLEIGH.slice(0, 4)); gl.uniform4fv(u.u_rayB, RAYLEIGH.slice(4)); gl.uniform4fv(u.u_ozA, OZONE.slice(0, 4)); gl.uniform4fv(u.u_ozB, OZONE.slice(4));
    gl.uniform3f(u.u_mie, MIE.scatter, MIE.absorb, MIE.g);
  }
  pass(p, t, setup) { const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb ?? t); gl.viewport(0, 0, t.w ?? 192, t.h ?? 108); gl.useProgram(p.p); setup(p.u); gl.bindVertexArray(this.empty); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  bindTex(u, name, unit, tex) { const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(u[name], unit); }
  init() {
    const gl = this.gl; gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    this.pass(this.P.trans, this.transT, () => this.coeffs(this.P.trans));
    this.pass(this.P.ms, this.msT, (u) => { this.coeffs(this.P.ms); this.bindTex(u, "u_tA", 0, this.transT.tex[0]); this.bindTex(u, "u_tB", 1, this.transT.tex[1]); });
    this.ready = true;
  }
  // per frame: the sky-view LUT for this sun, then the panorama and its mipmaps
  update(env, alt = PLANET.valleyAlt, haze = 1) {
    const gl = this.gl; if (!this.ready) this.init();
    const s = env.trueSun ?? env.sun; this.sunAz = Math.atan2(s[2], s[0]); this.horizon = -Math.acos(PLANET.Rg / (PLANET.Rg + alt));
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    this.pass(this.P.view, this.viewT, (u) => {
      this.coeffs(this.P.view); this.bindTex(u, "u_tA", 0, this.transT.tex[0]); this.bindTex(u, "u_tB", 1, this.transT.tex[1]); this.bindTex(u, "u_mA", 2, this.msT.tex[0]); this.bindTex(u, "u_mB", 3, this.msT.tex[1]);
      gl.uniform1f(u.u_alt, alt); gl.uniform1f(u.u_sunMu, s[1]); gl.uniform1f(u.u_horizon, this.horizon); gl.uniform1f(u.u_haze, haze);
    });
    this.pass(this.P.rgb, { fb: this.panoFb, w: 192, h: 108 }, (u) => {
      this.bindTex(u, "u_vA", 0, this.viewT.tex[0]); this.bindTex(u, "u_vB", 1, this.viewT.tex[1]);
      const w = (c) => [BIN_RGB.slice(0, 4).map((x) => x[c] * Math.PI), BIN_RGB.slice(4).map((x) => x[c] * Math.PI)].flat();   // renderer units (see sunColor)
      gl.uniform4fv(u.u_wR, w(0)); gl.uniform4fv(u.u_wG, w(1)); gl.uniform4fv(u.u_wB, w(2));
      gl.uniform3fv(u.u_nightZen, [0.004, 0.007, 0.018]); gl.uniform3fv(u.u_nightHor, [0.012, 0.016, 0.03]); gl.uniform1f(u.u_night, env.night); gl.uniform1f(u.u_horizon, this.horizon);
    });
    gl.bindTexture(gl.TEXTURE_2D, this.pano); gl.generateMipmap(gl.TEXTURE_2D);
  }
  bind(p, unit = 10) {
    const gl = this.gl, u = p.u; if (u.u_skyPano === undefined) return;
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, this.pano); gl.uniform1i(u.u_skyPano, unit); gl.uniform2f(u.u_skyAz, this.sunAz, this.horizon);
  }
}
