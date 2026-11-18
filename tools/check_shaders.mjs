// Static check of the Port Alder shaders for what breaks Direct3D's shader compiler (FXC, under ANGLE on Windows):
// a gradient operation (texture() with implicit derivatives, dFdx, dFdy, fwidth) inside a loop, directly or in a
// function the loop calls. ANGLE marks such loops [loop], FXC rejects them under divergent flow, and ANGLE's
// retries with other settings are slow enough, on big shaders, for the browser to restart its GPU process
// (1.4.0: "3D view unavailable: terrain link:"). Also reports loops of a known length over 16 steps that hold
// texture lookups and do not carry u_keepLoops (FXC unrolls those). Exit 1 on any finding.
// usage: node tools/check_shaders.mjs
// SPDX-License-Identifier: GPL-3.0-only
import * as SH from "../src/city3d_shaders.js";
import { ATMOS_PROGRAMS } from "../src/atmos.js";

const GRADIENT = /\b(texture|textureProj|textureOffset|textureProjOffset|dFdx|dFdy|fwidth)\s*\(/;
const LOOKUP = /\b(texture\w*|texelFetch\w*)\s*\(/;
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, "");

// the end of the brace block that opens at i (src[i] === "{")
function block(src, i) { let d = 0; for (let k = i; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) return k + 1; } return src.length; }
// the end of the parenthesised group that opens at i
function parens(src, i) { let d = 0; for (let k = i; k < src.length; k++) { if (src[k] === "(") d++; else if (src[k] === ")" && --d === 0) return k + 1; } return src.length; }
// one statement from i: a brace block, or up to the first ; outside parentheses
function statement(src, i) {
  while (/\s/.test(src[i])) i++;
  if (src[i] === "{") return block(src, i);
  let d = 0; for (let k = i; k < src.length; k++) { const c = src[k]; if (c === "(") d++; else if (c === ")") d--; else if (c === "{") k = block(src, k) - 1; else if (c === ";" && d === 0) return k + 1; }
  return src.length;
}
function functions(src) {
  const out = {}, re = /(^|[;}\n])\s*(?:highp\s+|mediump\s+|lowp\s+)?([A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s*\(([^()]*)\)\s*\{/g; let m;
  while ((m = re.exec(src))) {
    const name = m[3], open = src.indexOf("{", m.index + m[0].length - 1); if (["if", "for", "while", "switch", "return"].includes(m[2])) continue;
    const end = block(src, open); out[name] = (out[name] ?? "") + src.slice(open, end); re.lastIndex = end;
  }
  return out;
}
const calls = (text, names) => names.filter((n) => new RegExp(`\\b${n}\\s*\\(`).test(text));

function check(label, fs) {
  const src = strip(fs), F = functions(src), names = Object.keys(F), findings = [];
  const grad = new Set(names.filter((n) => GRADIENT.test(F[n])));
  for (let changed = true; changed;) { changed = false; for (const n of names) if (!grad.has(n) && calls(F[n], [...grad]).length) { grad.add(n); changed = true; } }
  for (const [fn, body] of Object.entries(F)) {
    const re = /\b(for|while)\s*\(/g; let m;
    while ((m = re.exec(body))) {
      const head = body.slice(m.index, parens(body, m.index + m[0].length - 1)), end = statement(body, m.index + head.length), loop = body.slice(m.index + head.length, end);
      const g = GRADIENT.exec(loop), via = calls(loop, [...grad]);
      if (g || via.length) findings.push(`${label}: ${fn}(): a gradient operation inside a loop (${g ? g[1] + "()" : "via " + via.join(", ")}): ${head.replace(/\s+/g, " ")}`);
      const n = /<\s*(\d+)\s*;/.exec(head), lookups = LOOKUP.test(loop) || calls(loop, names.filter((x) => LOOKUP.test(F[x]))).length;
      if (n && Number(n[1]) > 16 && lookups && !/u_keepLoops/.test(head)) findings.push(`${label}: ${fn}(): a loop of ${n[1]} steps with texture lookups that FXC would unroll (add u_keepLoops to its bound): ${head.replace(/\s+/g, " ")}`);
    }
  }
  return findings;
}

const programs = [];
for (const [k, v] of Object.entries(SH)) if (typeof v === "string" && /^#version/.test(v) && /_FS$/.test(k)) programs.push([k, v]);
for (const [k, [, fs]] of Object.entries(ATMOS_PROGRAMS)) programs.push(["atmos." + k, fs]);
const all = programs.flatMap(([k, fs]) => check(k, fs));
for (const f of all) console.log("FAIL " + f);
console.log(`${all.length ? "FAIL" : "ok  "} ${programs.length} fragment shaders: ${all.length ? all.length + " finding(s)" : "no gradient operation inside a loop, no long unrollable texture loop"}`);
process.exit(all.length ? 1 : 0);
