// What this browser and GPU offer the Port Alder renderer, and why it does or does not start.
// SPDX-License-Identifier: GPL-3.0-only
//
// glEnvironment() reports the WebGL 2 context (or why there is none), the GPU, the extensions and limits the
// renderer uses. checkRenderer() compiles every program on its own and without blocking (safe variants first,
// then full detail), audits the HLSL ANGLE makes of each shader where the browser shows it (gradient operations
// inside loops are what hung Direct3D's compiler in Deer Valley 1.4.0), builds the render targets, and starts
// the renderer on a small city as the city page does.
import { compilePrograms, target, freeTarget, gpuName, noWebGL2Reason } from "./gl.js";
import { ATMOS_PROGRAMS } from "./atmos.js";
import { CITY_PROGRAMS } from "./city3d_shaders.js";
import { City3D } from "./city3d.js";

export const GL_EXTENSIONS = ["EXT_color_buffer_float", "EXT_color_buffer_half_float", "OES_texture_float_linear", "EXT_texture_filter_anisotropic",
  "EXT_disjoint_timer_query_webgl2", "KHR_parallel_shader_compile", "WEBGL_debug_renderer_info", "WEBGL_debug_shaders"];
const LIMITS = ["MAX_TEXTURE_SIZE", "MAX_ARRAY_TEXTURE_LAYERS", "MAX_RENDERBUFFER_SIZE", "MAX_TEXTURE_IMAGE_UNITS", "MAX_VERTEX_TEXTURE_IMAGE_UNITS", "MAX_VERTEX_UNIFORM_VECTORS", "MAX_FRAGMENT_UNIFORM_VECTORS", "MAX_SAMPLES"];
export const ALL_PROGRAMS = () => ({ ...CITY_PROGRAMS, ...Object.fromEntries(Object.entries(ATMOS_PROGRAMS).map(([k, v]) => ["atmos." + k, v])) });

export function glEnvironment() {
  const lines = []; let gl = null;
  try { gl = document.createElement("canvas").getContext("webgl2", { antialias: false, alpha: false, depth: true, powerPreference: "high-performance" }); } catch (e) { lines.push("webgl2 threw: " + e.message); }
  if (!gl) { const reason = noWebGL2Reason(); lines.push("webgl2: unavailable: " + reason); return { ok: false, reason, lines }; }
  lines.push(`webgl2: ${gl.getParameter(gl.VERSION)} · ${gl.getParameter(gl.SHADING_LANGUAGE_VERSION)}`);
  const gpu = gpuName(gl); lines.push(`gpu: ${gpu}`);
  const have = new Set(gl.getSupportedExtensions() ?? []);
  lines.push("extensions: " + GL_EXTENSIONS.map((e) => `${e} ${have.has(e) ? "yes" : "NO"}`).join(" · "));
  lines.push("limits: " + LIMITS.map((k) => `${k} ${gl.getParameter(gl[k])}`).join(" · "));
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return { ok: true, lines, extensions: have, gpu, d3d: /Direct3D|D3D11|D3D9/i.test(gpu) };
}
// LOOP and FLATTEN in ANGLE's HLSL mark loops with gradient operations; the renderer has none
export function shaderAudit(gl, specs = ALL_PROGRAMS()) {
  const dbg = gl.getExtension("WEBGL_debug_shaders"); if (!dbg) return null;
  const out = [];
  for (const [vs, fs, label] of Object.values(specs)) for (const [type, src, kind] of [[gl.VERTEX_SHADER, vs, "vertex"], [gl.FRAGMENT_SHADER, fs, "fragment"]]) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    const h = dbg.getTranslatedShaderSource(s) || "", uses = h.split("\n").filter((l) => /\b(LOOP|FLATTEN)\b/.test(l) && !/#define/.test(l)).length;
    out.push({ label, kind, hlsl: /\bfloat4\b|\bSV_|register\(/.test(h), uses, bytes: h.length });
    gl.deleteShader(s);
  }
  return out;
}
export async function checkRenderer(canvas, say, { safe = false, city = null } = {}) {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return { ok: false, reason: noWebGL2Reason() };
  const specs = ALL_PROGRAMS();
  if (!gl.getExtension("KHR_parallel_shader_compile")) say("  (no KHR_parallel_shader_compile: each compile blocks the GPU process until it is done)");
  const steps = Object.keys(specs).map((k) => [k, "#define PLUME_SAFE 1\n", " (safe)"]);
  if (!safe) steps.push(...Object.keys(CITY_PROGRAMS).map((k) => [k, "", " (full detail)"]));
  let failed = null;
  for (const [k, defines, tag] of steps) {
    const t0 = performance.now();
    try { await compilePrograms(gl, { [k]: specs[k] }, { defines }); say(`  ${specs[k][2]}${tag}: ok, ${(performance.now() - t0).toFixed(0)} ms`); }
    catch (e) { failed = `${specs[k][2]}${tag}: ${e.message.split("\n")[0]}`; say("  FAILED " + failed); if (gl.isContextLost()) { say("  the context was lost: the driver reset"); break; } }
  }
  const audit = shaderAudit(gl);
  if (audit) { const bad = audit.filter((x) => x.uses); say(audit.some((x) => x.hlsl) ? `HLSL audit: ${bad.length ? bad.map((x) => `${x.label} ${x.kind}: ${x.uses}`).join(", ") : "no LOOP or FLATTEN in any shader"}` : "HLSL audit: this backend is not Direct3D"); }
  else say("HLSL audit: WEBGL_debug_shaders is not offered here");
  for (const [name, spec] of [["rgba16f", { color: [{ internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT }] }], ["rgba8", { color: [{ internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE }] }], ["depth32f shadow", { color: [], depthTexture: true }]]) {
    try { gl.getExtension("EXT_color_buffer_float"); const t = target(gl, 64, 64, spec); freeTarget(gl, t); say(`  render target ${name}: ok`); } catch (e) { say(`  render target ${name}: ${e.message}`); }
  }
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  if (failed) return { ok: false, reason: failed };
  if (!city) return { ok: true };
  say("starting the renderer on the city…");
  const view = new City3D(canvas, { gfx: safe ? "safe" : "full", quality: "low", onStatus: (t) => say("  " + t) });
  await view.whenReady; view.attach(city); view.setTime(17 * 60); view.start();
  await new Promise((r) => setTimeout(r, 2500));
  say(`  ${view.frames || 0} frames · ${view.hud()}`);
  return { ok: (view.frames || 0) > 0, view };
}
