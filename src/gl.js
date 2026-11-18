// Small WebGL2 toolkit for the Deer Valley renderer: shaders, buffers, render targets, matrices.
// SPDX-License-Identifier: GPL-3.0-only

// The WebGL context went away (the browser restarted its GPU process, or the driver reset). Every object made
// on it is gone; a new context, on a new canvas, is the way back.
export class ContextLost extends Error {
  constructor(while_) { super(`the graphics driver was reset while ${while_} (the WebGL context was lost)`); this.name = "ContextLost"; this.lost = true; }
}
// why a page has no WebGL 2, in words a user can act on
export function noWebGL2Reason() {
  let gl1 = null; try { gl1 = document.createElement("canvas").getContext("webgl"); } catch { /* no WebGL at all */ }
  return gl1 ? "this browser offers WebGL 1 but not WebGL 2; open the page in a current Edge, Chrome or Firefox"
    : "this browser window has no WebGL: GPU acceleration is off or blocked here (some kiosk shells and remote-desktop sessions turn it off, and a browser turns it off for a while after its GPU process has crashed repeatedly). Open the page in Edge, Chrome or Firefox with hardware acceleration on";
}
// the GPU behind a context, as the browser names it (with ANGLE: the backend too, e.g. "Direct3D11")
export function gpuName(gl) {
  try { const d = gl.getExtension("WEBGL_debug_renderer_info"); return d ? `${gl.getParameter(d.UNMASKED_RENDERER_WEBGL)} (${gl.getParameter(d.UNMASKED_VENDOR_WEBGL)})` : String(gl.getParameter(gl.RENDERER)); } catch { return "unknown"; }
}
// a shader's source with preprocessor lines after its #version line (PLUME_SAFE and the like)
export function withDefines(src, defines = "") { return defines ? src.replace(/^(#version[^\n]*\n)/, `$1${defines}`) : src; }
function shaderError(gl, s, type, src, label) {
  const log = gl.getShaderInfoLog(s) || "", lines = src.split("\n").map((l, i) => `${String(i + 1).padStart(4)} ${l}`);
  const m = /ERROR: \d+:(\d+)/.exec(log), at = m ? Number(m[1]) : 0;
  return new Error(`${label} ${type === gl.VERTEX_SHADER ? "vertex" : "fragment"} shader: ${log || "no log"}\n${lines.slice(Math.max(0, at - 4), at + 2).join("\n")}`);
}
// queue one program: compile both shaders and link, without asking how it went (that would wait for the driver)
function submit(gl, vs, fs, label, defines) {
  const job = { label, vsrc: withDefines(vs, defines), fsrc: withDefines(fs, defines), t0: performance.now(), ms: 0 };
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  job.vs = mk(gl.VERTEX_SHADER, job.vsrc); job.fs = mk(gl.FRAGMENT_SHADER, job.fsrc);
  job.p = gl.createProgram(); gl.attachShader(job.p, job.vs); gl.attachShader(job.p, job.fs); gl.linkProgram(job.p);
  return job;
}
// a finished job: its status, then its uniforms
function collect(gl, job) {
  if (gl.isContextLost()) throw new ContextLost(`preparing the ${job.label} shaders`);
  if (!gl.getProgramParameter(job.p, gl.LINK_STATUS)) {
    if (gl.isContextLost()) throw new ContextLost(`linking the ${job.label} shaders`);
    if (!gl.getShaderParameter(job.vs, gl.COMPILE_STATUS)) throw shaderError(gl, job.vs, gl.VERTEX_SHADER, job.vsrc, job.label);
    if (!gl.getShaderParameter(job.fs, gl.COMPILE_STATUS)) throw shaderError(gl, job.fs, gl.FRAGMENT_SHADER, job.fsrc, job.label);
    throw new Error(`${job.label} link: ${gl.getProgramInfoLog(job.p) || "the driver gave no reason"}`);
  }
  const uniforms = {}, n = gl.getProgramParameter(job.p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(job.p, i); uniforms[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(job.p, info.name); }
  gl.detachShader(job.p, job.vs); gl.detachShader(job.p, job.fs); gl.deleteShader(job.vs); gl.deleteShader(job.fs);
  return { p: job.p, u: uniforms, label: job.label, ms: job.ms };
}
// one program, at once (blocks until the driver has compiled it: fine for small programs and tests)
export function compileProgram(gl, vs, fs, label = "program", defines = "") {
  const job = submit(gl, vs, fs, label, defines); const r = collect(gl, job); r.ms = performance.now() - job.t0; return r;
}
// Many programs without stalling the browser's GPU process. Every compile and link is queued first; with
// KHR_parallel_shader_compile the driver works on them on its own threads while this polls COMPLETION_STATUS_KHR
// between frames, and only then reads the results. Asking for LINK_STATUS straight away makes the GPU process
// wait on each compile in turn, and a slow one (Direct3D's FXC on Windows) can outlast its watchdog: the GPU
// process restarts and every WebGL and WebGPU context on the page is lost. specs: { key: [vs, fs, label] }.
// onProgress(done, total, label) after each program finishes; timeoutMs bounds the whole batch.
export async function compilePrograms(gl, specs, { defines = "", onProgress = null, timeoutMs = 180000, one = false } = {}) {
  const par = gl.getExtension("KHR_parallel_shader_compile"), keys = Object.keys(specs), out = {}, t0 = performance.now();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const run = async (list) => {
    const jobs = list.map((k) => [k, submit(gl, ...specs[k], defines)]);
    let left = jobs.length;
    while (left) {
      if (gl.isContextLost()) {
        const pending = jobs.filter(([k]) => !(k in out)).map(([, j]) => j.label);
        throw new ContextLost(pending.length === 1 ? `compiling the ${pending[0]} shaders` : `compiling the shaders (${pending.length} programs were still compiling: ${pending.slice(0, 6).join(", ")}${pending.length > 6 ? ", …" : ""})`);
      }
      left = 0;
      for (const [k, job] of jobs) {
        if (k in out || job.done) continue;
        job.done = par ? gl.getProgramParameter(job.p, par.COMPLETION_STATUS_KHR) === true : true;
        if (!job.done) { left++; continue; }
        job.ms = performance.now() - job.t0; out[k] = collect(gl, job); onProgress?.(Object.keys(out).length, keys.length, job.label, job.ms);
      }
      if (left) {
        if (performance.now() - t0 > timeoutMs) throw new Error(`compiling the ${jobs.filter(([k]) => !(k in out)).map(([, j]) => j.label).join(", ")} shaders took longer than ${Math.round(timeoutMs / 1000)} s`);
        await wait(par ? 12 : 0);
      }
    }
  };
  if (one) for (const k of keys) await run([k]);       // one at a time: slower, but says which program a driver stalls on
  else await run(keys);
  return out;
}
export function buffer(gl, data, target = gl.ARRAY_BUFFER, usage = gl.STATIC_DRAW) {
  const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, usage); return b;
}
// attribs: [[location, buffer, size, type, normalized, stride, offset, divisor]]
export function vao(gl, attribs, index = null) {
  const v = gl.createVertexArray(); gl.bindVertexArray(v);
  for (const [loc, buf, size, type = gl.FLOAT, norm = false, stride = 0, off = 0, div = 0] of attribs) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc);
    if (type === gl.FLOAT || norm) gl.vertexAttribPointer(loc, size, type, norm, stride, off); else gl.vertexAttribIPointer(loc, size, type, stride, off);
    if (div) gl.vertexAttribDivisor(loc, div);
  }
  if (index) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
  gl.bindVertexArray(null); return v;
}
export function texture(gl, w, h, { internal = gl.RGBA8, format = gl.RGBA, type = gl.UNSIGNED_BYTE, filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE, data = null, mips = false } = {}) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  return t;
}
export function target(gl, w, h, { color = [{ internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT }], depth = true, depthTexture = false } = {}) {
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const tex = color.map((c, i) => { const t = texture(gl, w, h, c); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0); return t; });
  if (color.length > 1) gl.drawBuffers(color.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  let depthTex = null, rb = null;
  if (depthTexture) {
    depthTex = texture(gl, w, h, { internal: gl.DEPTH_COMPONENT32F, format: gl.DEPTH_COMPONENT, type: gl.FLOAT, filter: gl.NEAREST });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
  } else if (depth) {
    rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
  }
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error("framebuffer incomplete: 0x" + status.toString(16));
  return { fb, tex, depthTex, rb, w, h };
}
export function freeTarget(gl, t) { if (!t) return; gl.deleteFramebuffer(t.fb); t.tex.forEach((x) => gl.deleteTexture(x)); if (t.depthTex) gl.deleteTexture(t.depthTex); if (t.rb) gl.deleteRenderbuffer(t.rb); }

/* ------------------------------------------------------------------ math (column-major mat4) */
export const M4 = {
  ident: () => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  mul(a, b, o = new Float32Array(16)) {
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  },
  persp(fovy, aspect, near, far) { const f = 1 / Math.tan(fovy / 2), m = new Float32Array(16); m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far); m[11] = -1; m[14] = (2 * far * near) / (near - far); return m; },
  // reversed depth with an infinite far plane (for clip control ZERO_TO_ONE): depth = near / distance
  perspRevInf(fovy, aspect, near) { const f = 1 / Math.tan(fovy / 2), m = new Float32Array(16); m[0] = f / aspect; m[5] = f; m[11] = -1; m[14] = near; return m; },
  ortho(l, r, b, t, n, f) { const m = new Float32Array(16); m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n); m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); m[15] = 1; return m; },
  lookAt(eye, at, up = [0, 1, 0]) {
    let zx = eye[0] - at[0], zy = eye[1] - at[1], zz = eye[2] - at[2]; let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx; l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1]);
  },
  invert(m, o = new Float32Array(16)) {
    const a = m, b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
    const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
    let d = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!d) return M4.ident(); d = 1 / d;
    o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * d; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * d; o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * d; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * d;
    o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * d; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * d; o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * d; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * d;
    o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * d; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * d; o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * d; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * d;
    o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * d; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * d; o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * d; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * d;
    return o;
  },
  // rigid transform from a quaternion [x, y, z, w] and a translation
  fromQT(q, t, o = new Float32Array(16)) {
    const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    o[0] = 1 - yy - zz; o[1] = xy + wz; o[2] = xz - wy; o[3] = 0; o[4] = xy - wz; o[5] = 1 - xx - zz; o[6] = yz + wx; o[7] = 0;
    o[8] = xz + wy; o[9] = yz - wx; o[10] = 1 - xx - yy; o[11] = 0; o[12] = t[0]; o[13] = t[1]; o[14] = t[2]; o[15] = 1; return o;
  },
  apply(m, v) { return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]]; },
  dir(m, v) { return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]]; },
};
export const Q = {
  axis(ax, ang) { const s = Math.sin(ang / 2), l = Math.hypot(...ax) || 1; return [ax[0] / l * s, ax[1] / l * s, ax[2] / l * s, Math.cos(ang / 2)]; },
  mul(a, b) { return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]]; },
  // rotation taking unit vector a to unit vector b
  between(a, b) {
    const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    if (d < -0.999999) { const ax = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; const c = [a[1] * ax[2] - a[2] * ax[1], a[2] * ax[0] - a[0] * ax[2], a[0] * ax[1] - a[1] * ax[0]]; return Q.axis(c, Math.PI); }
    const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], q = [c[0], c[1], c[2], 1 + d], l = Math.hypot(...q);
    return q.map((x) => x / l);
  },
};
export const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]), norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
