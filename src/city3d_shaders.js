// Shaders for the live 3D Port Alder: ground and streets, water, buildings with lit windows, trees, traffic,
// people, the sky and the final image. GLSL ES 3.00.
// SPDX-License-Identifier: GPL-3.0-only
//
// Written for every WebGL 2 backend, including ANGLE's Direct3D path with FXC (the lessons of Deer Valley
// 1.4.1): loops sample with textureLod or texelFetch, loop bounds carry u_keepLoops so FXC cannot unroll
// them, local arrays are never indexed with a variable, there is no integer division in hot paths, and
// discard comes last in main. PLUME_SAFE (the safe graphics mode) drops the material library and the shadow
// filtering, leaving flat colours and a single shadow tap.
import { SKY_LOOKUP } from "./atmos.js";

const HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D; precision highp sampler2DArray; precision highp sampler2DShadow;
`;
// what every lit surface shares: the camera, the sun, the sky, fog, shadows and the material library
const COMMON = `
uniform mat4 u_VP; uniform vec3 u_eye; uniform vec3 u_sun; uniform vec3 u_sunCol; uniform vec3 u_amb; uniform float u_night; uniform float u_time;
uniform vec3 u_fogCol; uniform float u_fogK; uniform int u_keepLoops; uniform vec3 u_lamp;   // u_lamp: a 3000 K lamp by Planck's law (motion.js)
uniform mat4 u_shadowVP; uniform sampler2DShadow u_shadow; uniform float u_shadowTexel;
uniform sampler2DArray u_matA; uniform sampler2DArray u_matN; uniform vec4 u_matTile[24]; uniform vec3 u_matCol[24]; uniform float u_matReady;
${SKY_LOOKUP}
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hash11(float x) { return fract(sin(x * 91.3458) * 47453.5453); }
float shadowAt(vec3 wp, vec3 n) {
  vec4 s = u_shadowVP * vec4(wp + n * 0.25, 1.0); vec3 q = s.xyz / s.w * 0.5 + 0.5;
  if (q.x <= 0.0 || q.y <= 0.0 || q.x >= 1.0 || q.y >= 1.0 || q.z >= 1.0) return 1.0;
#ifdef PLUME_SAFE
  return textureLod(u_shadow, vec3(q.xy, q.z - 0.0015), 0.0);
#else
  // four taps written out (no loop), each with an explicit level: Direct3D's compiler rejects implicit-derivative lookups
  // inside loops under ANGLE, and the shadow map has no mipmaps, so the result is the same
  vec2 d = vec2(u_shadowTexel * 0.75);
  float sum = textureLod(u_shadow, vec3(q.xy + vec2(-d.x, -d.y), q.z - 0.0015), 0.0) + textureLod(u_shadow, vec3(q.xy + vec2(d.x, -d.y), q.z - 0.0015), 0.0)
            + textureLod(u_shadow, vec3(q.xy + vec2(-d.x, d.y), q.z - 0.0015), 0.0) + textureLod(u_shadow, vec3(q.xy + vec2(d.x, d.y), q.z - 0.0015), 0.0);
  return sum * 0.25;
#endif
}
// a material: its albedo (and height), its normal and roughness, sampled on a plane at the material's tile size
vec4 matAlbedo(int m, vec2 uv) {
#ifdef PLUME_SAFE
  return vec4(u_matCol[m], 0.5);
#else
  if (u_matReady < 0.5) return vec4(u_matCol[m], 0.5);
  vec4 a = texture(u_matA, vec3(uv / u_matTile[m].x, float(m)));
  return vec4(a.rgb * a.rgb, a.a);
#endif
}
vec4 matNormal(int m, vec2 uv) {
#ifdef PLUME_SAFE
  return vec4(0.0, 0.0, 1.0, 0.7);
#else
  if (u_matReady < 0.5) return vec4(0.0, 0.0, 1.0, 0.7);
  vec4 nr = texture(u_matN, vec3(uv / u_matTile[m].x, float(m)));
  return vec4(normalize(nr.xyz * 2.0 - 1.0), nr.a);
#endif
}
vec3 light(vec3 alb, vec3 n, vec3 wp, float rough, float spec, float sh) {
  vec3 v = normalize(u_eye - wp), h = normalize(v + u_sun);
  float nl = max(dot(n, u_sun), 0.0), nh = max(dot(n, h), 0.0), p = mix(80.0, 6.0, rough);
  vec3 sky = skyRadiance(reflect(-v, n), 4.0);
  vec3 amb = u_amb * (0.6 + 0.4 * n.y) + skyRadiance(vec3(0.0, 1.0, 0.0), 6.0) * 0.25 * (0.5 + 0.5 * n.y);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 5.0);
  return alb * (u_sunCol * nl * sh + amb) + u_sunCol * spec * pow(nh, p) * sh * nl + sky * spec * fres * (1.0 - rough);
}
vec3 fog(vec3 col, vec3 wp) {
  float d = length(wp - u_eye), f = 1.0 - exp(-d * u_fogK);
  vec3 fc = mix(u_fogCol, skyRadiance(normalize(wp - u_eye) * vec3(1.0, 0.0, 1.0) + vec3(0.0, 0.08, 0.0), 2.0), 0.6);
  return mix(col, fc, f);
}
`;

/* ------------------------------------------------------------------ ground and streets */
export const GROUND_VS = HEAD + `
in vec3 a_pos; in vec3 a_nrm;
uniform mat4 u_VP;
out vec3 v_wp; out vec3 v_n;
void main() { v_wp = a_pos; v_n = a_nrm; gl_Position = u_VP * vec4(a_pos, 1.0); }`;
export const GROUND_FS = HEAD + COMMON + `
in vec3 v_wp; in vec3 v_n; out vec4 o;
uniform sampler2D u_land;     // per cell: land use, road kind, road condition, trees and neighbours
uniform float u_cell;
const int L_WATER = 0, L_ROAD = 1, L_PARK = 2, L_BEACH = 9, L_YARD = 12;
void main() {
  vec2 c = v_wp.xz / u_cell; ivec2 ci = ivec2(floor(c)); vec2 f = fract(c);
  vec4 t = texelFetch(u_land, clamp(ci, ivec2(0), ivec2(127)), 0) * 255.0;
  int land = int(t.r + 0.5), road = int(t.g + 0.5); float cond = t.b / 255.0;
  int nb = int(t.a + 0.5);                    // bits: road to the east, west, south, north
  int m = 10; vec3 tint = vec3(1.0); float spec = 0.04;
  bool walk = false;
  if (road > 0) {
    // a street cell: asphalt, sidewalks along the sides with no road, lane lines and crosswalks
    bool e = (nb & 1) != 0, w = (nb & 2) != 0, s = (nb & 4) != 0, n = (nb & 8) != 0;
    float side = 0.16;
    walk = (!w && f.x < side) || (!e && f.x > 1.0 - side) || (!n && f.y < side) || (!s && f.y > 1.0 - side);
    m = walk ? 1 : 0;
    if (!walk) {
      bool ew = e || w, ns = n || s;
      float line = 0.0;
      if (ew && !ns) line = step(abs(f.y - 0.5), 0.012) * step(0.5, fract(v_wp.x / 6.0));
      if (ns && !ew) line = step(abs(f.x - 0.5), 0.012) * step(0.5, fract(v_wp.z / 6.0));
      if (ew && ns) { float zebra = step(0.5, fract((f.x + f.y) * 8.0)); line = (f.x < 0.18 || f.x > 0.82 || f.y < 0.18 || f.y > 0.82) ? zebra * 0.8 : 0.0; }
      tint = mix(vec3(0.75 + 0.25 * cond), vec3(0.95, 0.92, 0.80) * 3.0, line);
      spec = 0.06;
    }
  } else if (land == L_PARK || land == L_YARD) { m = 4; tint = land == L_YARD ? vec3(0.92, 1.0, 0.86) : vec3(1.0); }
  else if (land == L_BEACH) m = 6;
  else if (land == L_WATER) m = 5;
  else m = (land == 5 || land == 4 || land == 11) ? 2 : 1;
  vec4 a = matAlbedo(m, v_wp.xz); vec4 nr = matNormal(m, v_wp.xz);
  vec3 n = normalize(v_n + vec3(nr.x, 0.0, nr.y) * 0.35);
  float sh = shadowAt(v_wp, n);
  vec3 col = light(a.rgb * tint, n, v_wp, nr.w, spec, sh);
  // street lights at night: a warm pool along the streets
  if (road > 0) { vec2 lp = fract(v_wp.xz / 30.0) - 0.5; col += u_lamp * 0.55 * u_night * exp(-dot(lp, lp) * 9.0); }
  o = vec4(fog(col, v_wp), 1.0);
}`;

/* ------------------------------------------------------------------ water */
export const WATER_VS = HEAD + `
in vec3 a_pos; uniform mat4 u_VP; uniform float u_tide; out vec3 v_wp;
// the bay rises and falls with the tide (five constituents, law 48.42), in metres about mean water
void main() { v_wp = a_pos + vec3(0.0, u_tide * 0.5, 0.0); gl_Position = u_VP * vec4(v_wp, 1.0); }`;
export const WATER_FS = HEAD + COMMON + `
in vec3 v_wp; out vec4 o;
void main() {
  vec2 p = v_wp.xz; vec3 n = vec3(0.0, 1.0, 0.0);
  for (int i = 0; i < 4 + u_keepLoops; i++) {
    float k = float(i), a = 0.8 + k * 1.7, fr = 0.05 + k * 0.045;
    vec2 d = vec2(cos(a), sin(a));
    float ph = dot(p, d) * fr + u_time * (0.6 + k * 0.35);
    n.xz += d * cos(ph) * 0.09 / (1.0 + k);
  }
  n = normalize(n);
  vec3 v = normalize(u_eye - v_wp), r = reflect(-v, n);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 deep = vec3(0.010, 0.035, 0.045), sky = skyRadiance(r * vec3(1.0, 1.0, 1.0) + vec3(0.0, 0.02, 0.0), 0.0);
  float sh = shadowAt(v_wp, n);
  vec3 col = mix(deep * (u_amb + u_sunCol * 0.3), sky, fres) + u_sunCol * pow(max(dot(r, u_sun), 0.0), 400.0) * 3.0 * sh;
  col += u_lamp * u_night * 0.05 * (0.5 + 0.5 * sin(p.x * 0.7 + u_time));   // the city's lights on the bay
  o = vec4(fog(col, v_wp), 1.0);
}`;

/* ------------------------------------------------------------------ buildings */
// one unit box (and a gable roof) per building; a_part 0 wall, 1 flat roof, 2 pitched roof
export const BUILDING_VS = HEAD + `
in vec3 a_pos; in vec3 a_nrm; in float a_part;
in vec4 i_box;     // x, z of the corner; width, depth (metres)
in vec4 i_dims;    // base height, wall height, roof rise, floors
in vec4 i_mat;     // facade material, roof material, kind, index
in vec4 i_look;    // tint, seed, sign colour index, construction
uniform mat4 u_VP;
out vec3 v_wp; out vec3 v_n; out vec3 v_local; flat out vec4 v_mat; flat out vec4 v_dims; flat out vec4 v_look; out float v_part;
void main() {
  vec3 p = a_pos;
  float wall = i_dims.y;
  vec3 wp = vec3(i_box.x + p.x * i_box.z, i_dims.x + (a_part < 1.5 ? p.y * wall : wall + p.y * i_dims.z), i_box.y + p.z * i_box.w);
  v_wp = wp; v_n = normalize(a_nrm / vec3(i_box.z, a_part < 1.5 ? wall : max(i_dims.z, 0.01), i_box.w));
  v_local = vec3(p.x * i_box.z, wp.y - i_dims.x, p.z * i_box.w);
  v_mat = i_mat; v_dims = i_dims; v_look = i_look; v_part = a_part;
#ifdef SHADOW_PASS
  gl_Position = u_VP * vec4(wp, 1.0);
#else
  gl_Position = u_VP * vec4(wp, 1.0);
#endif
}`;
export const BUILDING_FS = HEAD + COMMON + `
in vec3 v_wp; in vec3 v_n; in vec3 v_local; flat in vec4 v_mat; flat in vec4 v_dims; flat in vec4 v_look; in float v_part; out vec4 o;
uniform sampler2D u_lights;     // per building: homes lit, open for business, vacant, sign
uniform vec3 u_signs[22];
void main() {
  int facade = int(v_mat.x + 0.5), roof = int(v_mat.y + 0.5), kind = int(v_mat.z + 0.5), idx = int(v_mat.w + 0.5);
  vec4 L = texelFetch(u_lights, ivec2(idx & 127, idx >> 7), 0);
  vec3 n = normalize(v_n); float floors = max(v_dims.w, 1.0), wall = v_dims.y;
  float seed = v_look.y; vec3 tint = mix(vec3(0.86), vec3(1.1, 1.04, 0.96), fract(v_look.x * 7.31));
  vec3 col; float sh = shadowAt(v_wp, n);
  if (v_part > 0.5) {
    vec2 uv = v_wp.xz + (v_part > 1.5 ? vec2(0.0, v_local.y * 1.4) : vec2(0.0));
    vec4 a = matAlbedo(roof, uv); vec4 nr = matNormal(roof, uv);
    col = light(a.rgb * mix(vec3(1.0), tint, 0.3), normalize(n + vec3(nr.x, 0.0, nr.y) * 0.2), v_wp, nr.w, 0.08, sh);
  } else {
    // the facade: floors and bays, windows inset, a shopfront on the ground floor of shops and mixed buildings
    bool sideX = abs(n.x) > abs(n.z);
    float u = sideX ? v_local.z : v_local.x, h = v_local.y;
    float ground = (kind == 3 || kind == 4) ? 4.5 : 0.0;
    float fh = (wall - ground) / floors, bay = (kind == 5 || kind == 7 || kind == 10) ? 3.0 : kind == 6 ? 6.0 : 2.8;
    float fy = (h - ground) / fh, fx = u / bay;
    vec2 cellp = fract(vec2(fx, fy)); vec2 cid = floor(vec2(fx, fy));
    bool glassWall = facade == 11;
    float win = (h > ground && cellp.x > 0.18 && cellp.x < 0.82 && cellp.y > 0.28 && cellp.y < 0.86) ? 1.0 : 0.0;
    if (kind == 6) win *= step(0.6, cellp.y);                            // works: a high band of windows
    if (kind == 0 || kind == 1) win *= step(0.25, hash21(cid + seed));    // houses: some walls without windows
    bool shopfront = ground > 0.0 && h < ground && h > 0.3 && cellp.x > 0.06 && cellp.x < 0.94;
    vec4 a = matAlbedo(facade, vec2(u, h)); vec4 nr = matNormal(facade, vec2(u, h));
    vec3 base = a.rgb * tint;
    vec3 wn = normalize(n + (sideX ? vec3(0.0, nr.y, nr.x) : vec3(nr.x, nr.y, 0.0)) * 0.25);
    col = light(base, wn, v_wp, nr.w, 0.05, sh);
    float glass = glassWall ? 1.0 : max(win, shopfront ? 1.0 : 0.0);
    if (glass > 0.0) {
      vec3 v = normalize(u_eye - v_wp), r = reflect(-v, n);
      float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
      vec3 refl = skyRadiance(r, 1.0) * (0.35 + 0.65 * fres);
      vec3 gcol = refl + u_sunCol * pow(max(dot(r, u_sun), 0.0), 300.0) * sh * 2.0;
      // lights: homes by occupancy, offices and shops while open, a hash per window decides which
      float hw = hash21(cid + seed * 3.7 + (sideX ? 17.0 : 0.0));
      float lit = (kind <= 3) ? step(hw, L.r) : step(hw, L.g * 0.9);
      if (shopfront) lit = L.g;
      vec3 warm = mix(u_lamp, vec3(0.85, 0.92, 1.0), step(4.5, float(kind)) * step(float(kind), 10.5));
      gcol += warm * lit * (0.6 + 1.6 * u_night) * (shopfront ? 1.4 : 1.0);
      if (glassWall && win < 0.5 && !shopfront) gcol = mix(gcol, base * 0.5, 0.35);
      col = mix(col, gcol, glass * 0.92);
    }
    // the shop sign band, lit in the evening
    if (ground > 0.0 && h > ground - 0.9 && h < ground - 0.2 && L.a > 0.0) {
      vec3 sc = u_signs[int(L.a * 255.0 + 0.5) % 22];
      col = mix(col, sc * (0.5 + 2.5 * u_night * L.g), 0.85);
    }
    // vacant buildings look dark and plain; scaffolding while a floor goes up
    col *= mix(1.0, 0.75, L.b);
    if (v_look.w > 0.5 && h > wall - 3.6) col = mix(col, vec3(0.55, 0.5, 0.3) * (u_sunCol * 0.5 + u_amb), step(0.5, fract(u * 0.8 + h * 0.8)) * 0.7);
  }
  o = vec4(fog(col, v_wp), 1.0);
}`;

/* ------------------------------------------------------------------ trees, vehicles and people */
export const TREE_VS = HEAD + `
in vec3 a_pos; in vec3 a_nrm; in float a_part;
in vec4 i_tree;    // x, z, height, kind
uniform mat4 u_VP; uniform float u_time;
out vec3 v_wp; out vec3 v_n; out float v_part; flat out float v_kind;
void main() {
  float s = i_tree.z; vec3 p = a_pos * vec3(s * (a_part > 0.5 ? 0.55 : 0.08), s, s * (a_part > 0.5 ? 0.55 : 0.08));
  float sway = a_part > 0.5 ? sin(u_time * 1.3 + i_tree.x * 0.3) * 0.04 * a_pos.y * s : 0.0;
  vec3 wp = vec3(i_tree.x + p.x + sway, p.y, i_tree.y + p.z) + vec3(0.0, i_tree.w > 3.5 ? 0.0 : 0.0, 0.0);
  v_wp = wp; v_n = a_nrm; v_part = a_part; v_kind = i_tree.w;
  gl_Position = u_VP * vec4(wp, 1.0);
}`;
export const TREE_FS = HEAD + COMMON + `
in vec3 v_wp; in vec3 v_n; in float v_part; flat in float v_kind; out vec4 o;
uniform float u_season;      // 0 winter .. 1 summer, the leaves' colour
void main() {
  vec3 n = normalize(v_n); float sh = shadowAt(v_wp, n);
  vec3 leaf = mix(vec3(0.20, 0.30, 0.10), vec3(0.12, 0.36, 0.10), u_season);
  if (v_kind > 1.5) leaf = mix(vec3(0.08, 0.20, 0.10), vec3(0.06, 0.24, 0.10), u_season);     // conifers
  vec3 alb = v_part > 0.5 ? leaf * (0.8 + 0.4 * hash21(floor(v_wp.xz * 2.0))) : vec3(0.18, 0.12, 0.08);
  o = vec4(fog(light(alb, n, v_wp, 0.9, 0.02, sh), v_wp), 1.0);
}`;
export const VEHICLE_VS = HEAD + `
in vec3 a_pos; in vec3 a_nrm; in float a_part;
in vec4 i_car;     // x, z, heading, kind
in vec4 i_col;     // colour, braking
uniform mat4 u_VP; uniform sampler2D u_height; uniform float u_cell;
out vec3 v_wp; out vec3 v_n; out float v_part; flat out vec4 v_col;
void main() {
  int kind = int(i_car.w + 0.5);
  vec3 scale = kind == 1 ? vec3(2.55, 3.1, 12.0) : kind == 2 ? vec3(2.4, 3.2, 7.5) : kind == 3 ? vec3(1.9, 1.75, 4.8) : vec3(1.8, 1.45, 4.5);
  vec3 p = a_pos * scale;
  float c = cos(i_car.z), s = sin(i_car.z);
  vec3 r = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  vec3 n = vec3(c * a_nrm.x + s * a_nrm.z, a_nrm.y, -s * a_nrm.x + c * a_nrm.z);
  vec2 ci = vec2(i_car.x, i_car.y) / u_cell; float y = textureLod(u_height, ci / 128.0, 0.0).r;
  v_wp = vec3(i_car.x, y, i_car.y) + r; v_n = n; v_part = a_part; v_col = i_col;
  gl_Position = u_VP * vec4(v_wp, 1.0);
}`;
export const VEHICLE_FS = HEAD + COMMON + `
in vec3 v_wp; in vec3 v_n; in float v_part; flat in vec4 v_col; out vec4 o;
void main() {
  vec3 n = normalize(v_n); float sh = shadowAt(v_wp, n);
  vec3 body = v_col.rgb;
  vec3 col;
  if (v_part > 1.5) {            // lights: white ahead, red behind
    vec3 lc = v_part > 2.5 ? vec3(1.0, 0.05, 0.03) * (1.0 + v_col.a * 3.0) : vec3(1.0, 0.95, 0.8);
    col = lc * (0.3 + 2.5 * u_night);
  } else if (v_part > 0.5) {     // glass
    vec3 v = normalize(u_eye - v_wp); col = skyRadiance(reflect(-v, n), 1.0) * 0.6;
  } else col = light(body, n, v_wp, 0.35, 0.5, sh);
  o = vec4(fog(col, v_wp), 1.0);
}`;
export const PERSON_VS = HEAD + `
in vec3 a_pos; in vec3 a_nrm; in float a_part;
in vec4 i_p;      // x, z, heading, walk phase
in vec4 i_c;      // clothing hue, skin, height, speed
uniform mat4 u_VP; uniform sampler2D u_height; uniform float u_cell; uniform float u_time;
out vec3 v_wp; out vec3 v_n; out float v_part; out float v_h; flat out vec4 v_c;
void main() {
  // the limbs swing about the hips and shoulders: a_part 0 torso and head, 1 and 2 legs, 3 and 4 arms
  vec3 p = a_pos; float ph = i_p.w + u_time * 6.0 * i_c.w, sw = sin(ph) * 0.55 * min(i_c.w * 2.0, 1.0);
  float side = (a_part == 1.0 || a_part == 3.0) ? 1.0 : -1.0;
  if (a_part > 0.5 && a_part < 2.5) { float py = 0.92, ang = sw * side; vec2 q = vec2(p.z, p.y - py); p.z = q.x * cos(ang) - q.y * sin(ang); p.y = py + q.x * sin(ang) + q.y * cos(ang); }
  if (a_part > 2.5) { float py = 1.42, ang = -sw * side * 0.8; vec2 q = vec2(p.z, p.y - py); p.z = q.x * cos(ang) - q.y * sin(ang); p.y = py + q.x * sin(ang) + q.y * cos(ang); }
  v_h = a_pos.y; p *= i_c.z;
  float c = cos(i_p.z), s = sin(i_p.z);
  vec3 r = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  vec2 ci = vec2(i_p.x, i_p.y) / u_cell; float y = textureLod(u_height, ci / 128.0, 0.0).r;
  v_wp = vec3(i_p.x, y + 0.02, i_p.y) + r; v_n = vec3(c * a_nrm.x + s * a_nrm.z, a_nrm.y, -s * a_nrm.x + c * a_nrm.z); v_part = a_part; v_c = i_c;
  gl_Position = u_VP * vec4(v_wp, 1.0);
}`;
export const PERSON_FS = HEAD + COMMON + `
in vec3 v_wp; in vec3 v_n; in float v_part; in float v_h; flat in vec4 v_c; out vec4 o;
void main() {
  vec3 n = normalize(v_n); float sh = shadowAt(v_wp, n);
  vec3 cloth = 0.42 + 0.4 * cos(6.2831 * (v_c.x + vec3(0.0, 0.33, 0.67))), skin = mix(vec3(0.95, 0.74, 0.60), vec3(0.36, 0.22, 0.14), v_c.y);
  vec3 alb = v_part < 0.5 ? (v_h > 1.5 ? skin : cloth) : v_part < 2.5 ? cloth * vec3(0.35, 0.38, 0.5) : (v_h < 1.0 ? skin : cloth * 0.9);
  o = vec4(fog(light(alb, n, v_wp, 0.8, 0.03, sh), v_wp), 1.0);
}`;

/* ------------------------------------------------------------------ depth for the shadow map */
export const DEPTH_FS = HEAD + `out vec4 o; void main() { o = vec4(1.0); }`;

/* ------------------------------------------------------------------ the sky and the final image */
export const FULL_VS = HEAD + `
out vec2 v_uv; void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); v_uv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
export const SKY_FS = HEAD + `
in vec2 v_uv; out vec4 o; uniform mat4 u_invVP; uniform vec3 u_sun; uniform vec3 u_sunCol; uniform float u_night;
${SKY_LOOKUP}
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec4 a = u_invVP * vec4(v_uv * 2.0 - 1.0, 1.0, 1.0); vec3 d = normalize(a.xyz / a.w);
  vec3 col = skyRadiance(d, 0.0);
  float sd = dot(d, u_sun); col += u_sunCol * smoothstep(0.99996, 0.99999, sd) * 40.0;
  // stars on clear nights
  vec2 sp = vec2(atan(d.z, d.x) * 120.0, d.y * 220.0); float st = step(0.997, hash21(floor(sp))) * smoothstep(0.05, 0.3, d.y) * u_night;
  col += vec3(st) * 0.6;
  o = vec4(col, 1.0);
}`;
export const FINAL_FS = HEAD + `
in vec2 v_uv; out vec4 o; uniform sampler2D u_hdr; uniform float u_exposure; uniform float u_bloom; uniform int u_keepLoops;
vec3 aces(vec3 x) { const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0); }
void main() {
  vec3 c = textureLod(u_hdr, v_uv, 0.0).rgb, bl = vec3(0.0);
  for (int i = 0; i < 4 + u_keepLoops; i++) { float lod = 2.0 + float(i); bl += max(textureLod(u_hdr, v_uv, lod).rgb - 1.0, 0.0) / (1.0 + float(i)); }
  c += bl * u_bloom;
  vec2 q = v_uv - 0.5; c *= 1.0 - dot(q, q) * 0.35;
  o = vec4(pow(aces(c * u_exposure), vec3(1.0 / 2.2)), 1.0);
}`;
export const CITY_PROGRAMS = {
  ground: [GROUND_VS, GROUND_FS, "ground"], water: [WATER_VS, WATER_FS, "water"], building: [BUILDING_VS, BUILDING_FS, "buildings"],
  tree: [TREE_VS, TREE_FS, "trees"], vehicle: [VEHICLE_VS, VEHICLE_FS, "traffic"], person: [PERSON_VS, PERSON_FS, "people"],
  sky: [FULL_VS, SKY_FS, "sky"], final: [FULL_VS, FINAL_FS, "final image"],
  shadowBuilding: [BUILDING_VS, DEPTH_FS, "building shadows"], shadowTree: [TREE_VS, DEPTH_FS, "tree shadows"], shadowVehicle: [VEHICLE_VS, DEPTH_FS, "traffic shadows"],
};
