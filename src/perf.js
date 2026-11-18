// Frame timing for the Port Alder renderer (from the Deer Valley renderer): GPU time per pass, and a governor that holds 60 frames a second.
// SPDX-License-Identifier: GPL-3.0-only
//
// With EXT_disjoint_timer_query_webgl2 each pass is timed on the GPU (one query at a time, read back a few
// frames later, discarded if the GPU reports a disjoint interval). Without it only the CPU's frame-to-frame
// time is known. The governor aims at 16.7 ms: above about 18 ms it steps down - first the render scale
// (1.0, 0.85, 0.72), then the quality level - and when frames stay well under (about 11 ms) for a few
// seconds it steps back up. Steps are spaced so it never oscillates.
export const TARGET_MS = 1000 / 60;
const SCALES = [1.0, 0.85, 0.72], LEVELS = ["low", "medium", "high", "ultra"];

export class Perf {
  constructor(gl) {
    this.gl = gl; this.ext = gl.getExtension("EXT_disjoint_timer_query_webgl2"); this.pending = []; this.pool = [];
    this.ms = {}; this.gpuTotal = 0; this.cpu = 0; this.frame = 0; this.cur = null; this.frameT0 = 0; this.over = 0; this.under = 0; this.cool = 0; this.scaleIx = 0;
  }
  query() { return this.pool.pop() ?? this.gl.createQuery(); }
  begin(name) {
    if (!this.ext || this.cur) return;
    const q = this.query(); this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q); this.cur = { name, q, frame: this.frame };
  }
  end() { if (!this.cur) return; this.gl.endQuery(this.ext.TIME_ELAPSED_EXT); this.pending.push(this.cur); this.cur = null; }
  frameStart() { this.frameT0 = performance.now(); }
  // after the frame: read finished queries, fold them into per-pass and total GPU times
  frameEnd() {
    const gl = this.gl; this.cpu += (performance.now() - this.frameT0 - this.cpu) * 0.1; this.frame++;
    if (!this.ext) return;
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT), sums = {}, frames = new Set();
    while (this.pending.length) {
      const p = this.pending[0];
      if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(p.q, gl.QUERY_RESULT); this.pending.shift(); this.pool.push(p.q);
      if (disjoint) continue;
      sums[p.name] = (sums[p.name] ?? 0) + ns / 1e6; frames.add(p.frame);
    }
    if (!frames.size) return;
    const n = frames.size; let tot = 0;
    for (const [k, v] of Object.entries(sums)) { const ms = v / n; this.ms[k] = this.ms[k] == null ? ms : this.ms[k] + (ms - this.ms[k]) * 0.15; }
    for (const v of Object.values(this.ms)) tot += v;
    this.gpuTotal = tot;
  }
  // the governor: returns { scale } or { level } when a step is due, else null
  govern(intervalMs, level) {
    const t = this.ext && this.gpuTotal > 0 ? Math.max(this.gpuTotal, this.cpu) : intervalMs;
    if (this.cool > 0) { this.cool--; return null; }
    if (t > TARGET_MS * 1.08) { this.over++; this.under = 0; } else if (t < TARGET_MS * 0.66) { this.under++; this.over = 0; } else { this.over = Math.max(0, this.over - 1); this.under = Math.max(0, this.under - 1); }
    if (this.over > 30) {
      this.over = 0; this.cool = 90;
      if (this.scaleIx < SCALES.length - 1) return { scale: SCALES[++this.scaleIx] };
      const k = LEVELS.indexOf(level); if (k > 0) { this.scaleIx = 0; return { level: LEVELS[k - 1], scale: SCALES[0] }; }
    }
    if (this.under > 240) {
      this.under = 0; this.cool = 180;
      if (this.scaleIx > 0) return { scale: SCALES[--this.scaleIx] };
      const k = LEVELS.indexOf(level); if (k >= 0 && k < LEVELS.length - 1) return { level: LEVELS[k + 1], scale: SCALES[0] };
    }
    return null;
  }
  text(extra = "") {
    const f = (x) => x.toFixed(1), parts = Object.entries(this.ms).map(([k, v]) => `${k} ${f(v)}`);
    return this.ext ? `GPU ${f(this.gpuTotal)} ms (${parts.join(" · ")}) · CPU ${f(this.cpu)} ms${extra}` : `CPU ${f(this.cpu)} ms (no GPU timer)${extra}`;
  }
}
