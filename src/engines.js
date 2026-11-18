// ByteFoundry virtual XPU engines: one interface, three backends.
//   wasm-1t : xpu.wasm on the calling thread
//   wasm-mt : xpu-mt.wasm in N workers over one SharedArrayBuffer (needs cross-origin isolation)
//   webgpu  : the LCUF-A WGSL kernel, one compute dispatch per row
// Every engine exposes: name, label, threads, run(compiled, input, steps, rule) -> { out, ms }
import { WORDS, WGSL, MAX_STEPS } from "./lcufa.js";

const now = () => (globalThis.performance ? performance.now() : Date.now());
const DEFAULT_RULE = { birth: 1 << 3, survive: 12 };

// Checks shared by every backend, so no engine runs a request another would refuse.
function checkRequest(compiled, input, steps) {
  if (!compiled || !(compiled.code instanceof Uint32Array)) throw new Error("not a compiled LCUF-A program");
  if (!(input instanceof Uint32Array) || input.length !== WORDS) throw new Error(`input must be ${WORDS} u32 words`);
  if (!Number.isInteger(steps) || steps < 1 || steps > MAX_STEPS) throw new Error(`steps must be a whole number from 1 to ${MAX_STEPS}`);
  // Byte20 frames only: every backend then agrees (C/WGSL wrap at 2^32, the reference does not).
  for (let i = 0; i < WORDS; i++) if (input[i] > 0xfffff) throw new Error(`input word ${i} has bits above bit 19; frames carry 20-bit words`);
}
// Run requests one at a time per engine (a second call waits for the first).
function serial() { let tail = Promise.resolve(); return (fn) => { const r = tail.then(fn, fn); tail = r.catch(() => {}); return r; }; }
function load(ex, mem, compiled, input, rule) {
  if (!ex.configure(compiled.p, compiled.n, rule.birth, rule.survive)) throw new Error(`the XPU refused ring Z/${compiled.p}^${compiled.n}`);
  new Uint32Array(mem.buffer, ex.prog_ptr(), compiled.code.length).set(compiled.code);
  if (!ex.load_program(compiled.ninit, compiled.nstep, compiled.nfinal)) throw new Error("the XPU refused the program (instruction out of range)");
  new Uint32Array(mem.buffer, ex.slot_ptr(0), WORDS).set(input);
}
const readOut = (ex, mem, compiled) => new Uint32Array(mem.buffer, ex.slot_ptr(compiled.outSlot), WORDS).slice();

export async function createWasm1T(bytes) {
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const ex = instance.exports; const queue = serial();
  return {
    name: "wasm-1t", label: "Wasm · 1 thread", threads: 1,
    run(compiled, input, steps, rule = DEFAULT_RULE) {
      return queue(async () => {
        checkRequest(compiled, input, steps);
        load(ex, ex.memory, compiled, input, rule);
        const t0 = now(); if (!ex.run(steps, 0, 1)) throw new Error("the XPU refused the run"); const ms = now() - t0;
        return { out: readOut(ex, ex.memory, compiled), ms };
      });
    },
  };
}

// Single-thread engine in its own worker, so long runs never block the page. cancel() ends the
// run at once by replacing the worker. Messages carry plain data only.
export const WORKER1_SRC = `
const port = (typeof self !== 'undefined' && typeof self.postMessage === 'function') ? self : require('worker_threads').parentPort;
let ex = null;
const on = (fn) => port.addEventListener ? port.addEventListener('message', (e) => fn(e.data)) : port.on('message', fn);
on(async (m) => {
  try {
    if (m.type === 'init') { const inst = await WebAssembly.instantiate(m.module, {}); ex = (inst.instance || inst).exports; port.postMessage({ type: 'ready' }); return; }
    const c = m.compiled, mem = () => ex.memory.buffer;
    if (!ex.configure(c.p, c.n, m.rule.birth, m.rule.survive)) throw new Error('the XPU refused ring Z/' + c.p + '^' + c.n);
    new Uint32Array(mem(), ex.prog_ptr(), c.code.length).set(c.code);
    if (!ex.load_program(c.ninit, c.nstep, c.nfinal)) throw new Error('the XPU refused the program (instruction out of range)');
    new Uint32Array(mem(), ex.slot_ptr(0), m.input.length).set(m.input);
    const t0 = performance.now(); if (!ex.run(m.steps, 0, 1)) throw new Error('the XPU refused the run'); const ms = performance.now() - t0;
    const out = new Uint32Array(mem(), ex.slot_ptr(c.outSlot), m.input.length).slice();
    port.postMessage({ type: 'done', out, ms }, [out.buffer]);
  } catch (e) { port.postMessage({ type: 'error', message: String(e && e.message || e) }); }
});`;

export async function createWasm1TWorker(bytes, spawn) {
  const module = await WebAssembly.compile(bytes); const queue = serial();
  let w = null, pending = null;
  const start = () => new Promise((resolve, reject) => {
    const mine = spawn(WORKER1_SRC); w = mine;
    mine.onMessage((m) => {
      if (w !== mine) return;                       // a replaced worker's late messages (e.g. its exit) are ignored
      if (m.type === "ready") resolve();
      else if (pending) { const p = pending; pending = null; m.type === "done" ? p.resolve({ out: m.out, ms: m.ms }) : p.reject(new Error(m.message)); }
      else if (m.type === "error") reject(new Error(m.message));
    });
    mine.post({ type: "init", module });
  });
  await start();
  return {
    name: "wasm-1t", label: "Wasm · 1 thread", threads: 1, broken: null,
    run(compiled, input, steps, rule = DEFAULT_RULE) {
      return queue(() => new Promise((resolve, reject) => {
        checkRequest(compiled, input, steps);
        pending = { resolve, reject };
        const c = { p: compiled.p, n: compiled.n, code: compiled.code, ninit: compiled.ninit, nstep: compiled.nstep, nfinal: compiled.nfinal, outSlot: compiled.outSlot };
        w.post({ type: "run", compiled: c, input, steps, rule });
      }));
    },
    async cancel() { if (!pending) return; const p = pending; pending = null; w.terminate(); p.reject(new Error("stopped")); await start(); },
  };
}

// Worker body. Works as a browser Worker (blob URL) and as a Node worker_threads eval worker.
export const WORKER_SRC = `
const port = (typeof self !== 'undefined' && typeof self.postMessage === 'function') ? self : require('worker_threads').parentPort;
let ex = null, tid = 0;
const on = (fn) => port.addEventListener ? port.addEventListener('message', (e) => fn(e.data)) : port.on('message', fn);
on(async (m) => {
  try {
    if (m.type === 'init') {
      const inst = await WebAssembly.instantiate(m.module, { env: { memory: m.memory } });
      ex = (inst.instance || inst).exports; tid = m.tid;
      ex.__stack_pointer.value = ex.stack_top(tid);
      port.postMessage({ type: 'ready', tid });
    } else if (m.type === 'run') {
      if (!ex.run(m.steps, tid, m.nt)) throw new Error('the XPU refused the run');
      port.postMessage({ type: 'done', tid });
    }
  } catch (e) { port.postMessage({ type: 'error', tid, message: String(e && e.message || e) }); }
});`;

// spawn(src) returns { post(msg), onMessage(fn), offMessage(fn), terminate() }. A worker that dies,
// exits or cannot read a message must deliver { type: "error", message } to its handlers.
// A watchdog reads worker 0's progress counter in shared memory: a run stops only when no row has
// completed for STALL_MS, so long legitimate runs are never cut off and a stuck one never hangs.
const STALL_MS = 30000;
export async function createWasmMT(bytes, nthreads, spawn, stallMs = STALL_MS) {
  if (!Number.isInteger(nthreads) || nthreads < 1 || nthreads > 64) throw new Error("threads must be 1..64");
  const memory = new WebAssembly.Memory({ initial: 320, maximum: 320, shared: true });
  const module = await WebAssembly.compile(bytes);
  const main = await WebAssembly.instantiate(module, { env: { memory } });
  const ex = main.exports; const queue = serial();
  let workers = [], broken = null, abortWait = null;
  const stopWorkers = () => { workers.forEach((w) => w.terminate()); workers = []; };
  const kill = (why) => { broken = why; stopWorkers(); if (abortWait) abortWait(new Error(why)); };
  // Resolves when every worker reports `type`; rejects on a worker error, on abort, or after `ms`.
  const wait = (type, ms) => new Promise((resolve, reject) => {
    let left = workers.length; const hs = [], ws = workers.slice();
    const finish = (err) => { ws.forEach((w, i) => w.offMessage(hs[i])); clearTimeout(timer); abortWait = null; err ? reject(err) : resolve(); };
    abortWait = finish;
    const timer = ms ? setTimeout(() => kill(`no ${type} from the workers within ${ms} ms`), ms) : null;
    ws.forEach((w, i) => { hs[i] = (m) => {
      if (m.type === "error") kill(`worker ${m.tid ?? i} failed: ${m.message}`);
      else if (m.type === type && --left === 0) finish();
    }; w.onMessage(hs[i]); });
  });
  const start = async () => {
    broken = null;
    for (let t = 0; t < nthreads; t++) workers.push(spawn(WORKER_SRC));
    const ready = wait("ready", 20000);
    workers.forEach((w, t) => w.post({ type: "init", module, memory, tid: t }));
    await ready;
  };
  await start();
  return {
    name: "wasm-mt", label: `Wasm · ${nthreads} threads`, threads: nthreads,
    get broken() { return broken; },
    run(compiled, input, steps, rule = DEFAULT_RULE) {
      return queue(async () => {
        if (broken) throw new Error("threaded engine stopped: " + broken);
        checkRequest(compiled, input, steps);
        load(ex, memory, compiled, input, rule);
        ex.reset_sync();
        const progress = new Int32Array(memory.buffer, ex.progress_ptr(), 1);
        const t0 = now();
        const done = wait("done", 0);
        let last = -1, lastChange = now();
        const dog = setInterval(() => {
          const v = Atomics.load(progress, 0);
          if (v !== last) { last = v; lastChange = now(); }
          else if (now() - lastChange > stallMs) kill(`no progress for ${Math.round(stallMs / 1000)} s`);
        }, Math.min(500, stallMs / 4));
        workers.forEach((w) => w.post({ type: "run", steps, nt: nthreads }));
        try { await done; } finally { clearInterval(dog); }
        const ms = now() - t0;
        return { out: readOut(ex, memory, compiled), ms };
      });
    },
    // Stop the current run and bring up fresh workers (the engine stays usable).
    async cancel() { if (!abortWait) return; kill("stopped"); await start(); },
    terminate() { kill("terminated"); },
  };
}

export async function createWebGPU(gpu) {
  const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("no WebGPU adapter");
  const device = await adapter.requestDevice();
  let lost = null; device.lost.then((info) => { lost = info.message || "device lost"; });
  const shader = device.createShaderModule({ code: WGSL });
  const info = await (shader.getCompilationInfo ? shader.getCompilationInfo() : Promise.resolve({ messages: [] }));
  const errs = info.messages.filter((m) => m.type === "error");
  if (errs.length) throw new Error("WGSL: " + errs.map((m) => `${m.lineNum}:${m.linePos} ${m.message}`).join("; "));
  const pipeline = device.createComputePipeline({ layout: "auto", compute: { module: shader, entryPoint: "main" } });
  const BYTES = WORDS * 4, UNI = 256;
  let slots = []; const queue = serial();
  const adapterName = adapter.info ? [adapter.info.vendor, adapter.info.architecture, adapter.info.description].filter(Boolean).join(" ") : "";
  return {
    name: "webgpu", label: `WebGPU${adapterName ? " · " + adapterName : ""}`, threads: null,
    get broken() { return lost; },
    run(compiled, input, steps, rule = DEFAULT_RULE) { return queue(() => runGpu(compiled, input, steps, rule)); },
  };
  async function runGpu(compiled, input, steps, rule) {
    {
      if (lost) throw new Error("WebGPU device lost: " + lost);
      checkRequest(compiled, input, steps);
      device.pushErrorScope("validation"); device.pushErrorScope("out-of-memory");
      const nslot = Object.keys(compiled.slot).length;
      while (slots.length < nslot) slots.push(device.createBuffer({ size: BYTES, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }));
      device.queue.writeBuffer(slots[0], 0, input);
      const rows = compiled.code.length / 5;
      const uni = device.createBuffer({ size: rows * UNI, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      const u = new Uint32Array(rows * UNI / 4);
      const groups = [];
      for (let r = 0; r < rows; r++) {
        const [op, o, a, b, c] = compiled.code.subarray(r * 5, r * 5 + 5);
        u.set([op, c, compiled.p, compiled.n, compiled.M, rule.birth, rule.survive, 0], r * UNI / 4);
        groups.push(device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
          { binding: 0, resource: { buffer: uni, offset: r * UNI, size: 32 } },
          { binding: 1, resource: { buffer: slots[a] } },
          { binding: 2, resource: { buffer: slots[b === o ? a : b] } },
          { binding: 3, resource: { buffer: slots[o] } },
        ] }));
      }
      device.queue.writeBuffer(uni, 0, u);
      const read = device.createBuffer({ size: BYTES, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const t0 = now();
      const BATCH = 64; // steps per command buffer
      const encodeRows = (enc, from, count) => {
        for (let r = from; r < from + count; r++) {
          const pass = enc.beginComputePass(); pass.setPipeline(pipeline); pass.setBindGroup(0, groups[r]);
          pass.dispatchWorkgroups(Math.ceil(16384 / 64)); pass.end();
        }
      };
      let enc = device.createCommandEncoder();
      encodeRows(enc, 0, compiled.ninit);
      for (let s = 0; s < steps; s++) {
        encodeRows(enc, compiled.ninit, compiled.nstep);
        if ((s + 1) % BATCH === 0) { device.queue.submit([enc.finish()]); enc = device.createCommandEncoder(); }
      }
      encodeRows(enc, compiled.ninit + compiled.nstep, compiled.nfinal);
      enc.copyBufferToBuffer(slots[compiled.outSlot], 0, read, 0, BYTES);
      device.queue.submit([enc.finish()]);
      const oom = await device.popErrorScope(), invalid = await device.popErrorScope();
      if (oom || invalid) { read.destroy(); uni.destroy(); throw new Error("WebGPU: " + (oom || invalid).message); }
      // a GPU queue cannot be observed mid-run, so read-back has a generous limit; past it the device is treated as lost
      const limit = 120000 + steps * (compiled.code.length / 5) * 5;
      let timer; const late = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`no result within ${Math.round(limit / 1000)} s`)), limit); });
      try { await Promise.race([read.mapAsync(GPUMapMode.READ), late]); }
      catch (e) { if (/no result/.test(e.message)) lost = e.message; read.destroy(); uni.destroy(); throw new Error("WebGPU read-back failed: " + e.message); }
      finally { clearTimeout(timer); }
      const ms = now() - t0;
      const out = new Uint32Array(read.getMappedRange()).slice();
      read.unmap(); read.destroy(); uni.destroy();
      return { out, ms };
    }
  }
}
