/*
 * xpu.c - ByteFoundry virtual XPU: the LCUF-A/0.3 array engine.
 *
 * LCUF-A programs are compiled (in JS) to a flat instruction list and run here.
 * Each instruction is a whole-array kernel over a 8 x 128 x 128 frame of u32
 * words in the ring Z/p^n (NumPy-style: one native loop per operation).
 *
 * Threading: the same module runs in N workers over one shared memory. Worker t
 * owns rows [t*H/N, (t+1)*H/N) and every instruction ends at a barrier, so
 * neighbour reads (nsum, life) always see a complete previous array.
 * Built twice: plain (single thread) and threaded (shared memory + atomics).
 *
 * Bit-exact with the WGSL backend: all arithmetic is u32 with explicit
 * reductions; mulmod uses 10-bit chunks so no product exceeds 2^32.
 */
typedef unsigned int u32;
typedef unsigned long long u64;
#define EXPORT(name) __attribute__((export_name(#name)))

#define L 8
#define H 128
#define W 128
#define CELLS (H * W)
#define WORDS (CELLS * L)
#define NSLOT 16
#define MAXI 256

/* slot layout is chunky like the TIFF frame: index = (y*W + x)*L + lane */
static u32 slot[NSLOT][WORDS] __attribute__((aligned(16)));
static u32 prog[MAXI * 5];               /* op, out, a, b, c */
static u32 ninit, nstep, nfinal;         /* instruction counts per phase */
static u32 g_p = 2, g_n = 20, g_M = 1u << 20, g_birth = 1u << 3, g_survive = 12u;
static volatile u32 bar_count, bar_gen;
static volatile u32 done_count;
static volatile u32 g_progress;          /* rows completed by worker 0; read by the host watchdog */



enum {
  OP_COPY = 1, OP_LIFE, OP_ROT, OP_NSUM, OP_SQ, OP_MUL, OP_MULC, OP_ADD, OP_ADDC,
  OP_ORC, OP_DADD, OP_SHIFT, OP_FROM2, OP_TO2, OP_MODJ
};

static inline u32 modM(u32 x) { return g_p == 2 ? (x & (g_M - 1u)) : (x % g_M); }

/* (a*b) mod M for a,b < M <= 2^21, using 10-bit chunks of b. */
static inline u32 mulmod(u32 a, u32 b) {
  if (g_p == 2) return (a * b) & (g_M - 1u);
  u32 hi = b >> 10, lo = b & 1023u;
  u32 r = (a * hi) % g_M;          /* < 2^31 */
  r = (r << 10) % g_M;             /* r < 2^21 -> r<<10 < 2^31 */
  return (r + (a * lo) % g_M) % g_M;
}
static inline u32 mulmod_odd(u32 a, u32 b, u32 M) {
  u32 r = (a * (b >> 10)) % M; r = (r << 10) % M; return (r + (a * (b & 1023u)) % M) % M;
}
/* Digit-wise addition mod p. When p^4 <= 4096 (p = 3, 5, 7) two digits are added at once through a
   p^2 x p^2 table built by configure(), halving the divisions; otherwise one digit at a time. */
static unsigned short dtab[4096]; static u32 dtab_q = 0;     /* q = p^2 when the table is live */
static void build_dtab(u32 p) {
  dtab_q = 0; u32 q = p * p; if (p == 2 || q * q > 4096) return;
  for (u32 x = 0; x < q; x++) for (u32 y = 0; y < q; y++) {
    u32 lo = (x % p + y % p) % p, hi = (x / p + y / p) % p; dtab[x * q + y] = (unsigned short)(lo + p * hi);
  }
  dtab_q = q;
}
static inline u32 dadd_odd(u32 a, u32 b, u32 p, u32 n) {
  u32 r = 0, pw = 1, i = 0;
  if (dtab_q) { const u32 q = dtab_q; for (; i + 1 < n; i += 2) { r += dtab[(a % q) * q + (b % q)] * pw; pw *= q; a /= q; b /= q; } }
  for (; i < n; i++) { u32 d = a % p + b % p; if (d >= p) d -= p; r += d * pw; pw *= p; a /= p; b /= p; }
  return r;
}
static inline u32 dadd(u32 a, u32 b) {
  if (g_p == 2) return a ^ b;
  u32 r = 0, pw = 1;
  for (u32 i = 0; i < g_n; i++) {
    u32 d = (a % g_p + b % g_p) % g_p;
    r += d * pw; pw *= g_p; a /= g_p; b /= g_p;
  }
  return r;
}

/* Returns 1 when the ring is usable: p prime, n >= 1, p^n <= 2^21 (2^20 exactly when p = 2). */
EXPORT(configure) u32 configure(u32 p, u32 n, u32 birth, u32 survive) {
  if (p < 2 || n < 1 || n > 21) return 0;
  for (u32 d = 2; d * d <= p; d++) if (p % d == 0) return 0;
  u64 m = 1; for (u32 i = 0; i < n; i++) { m *= p; if (m > (1u << 21)) return 0; }
  if (p == 2 && n != 20) return 0;
  g_p = p; g_n = n; g_M = (u32)m; build_dtab(p);
  g_birth = birth & 0x1FF; g_survive = survive & 0x1FF;
  return 1;
}
EXPORT(modulus) u32 modulus(void) { return g_M; }
/* Returns 1 when every instruction is in range (op, slots, args); 0 leaves the program empty. */
EXPORT(load_program) u32 load_program(u32 ni, u32 ns, u32 nf) {
  ninit = nstep = nfinal = 0;
  if (ni > MAXI || ns > MAXI || nf > MAXI || ni + ns + nf > MAXI) return 0;   /* no u32 wrap */
  for (u32 i = 0; i < ni + ns + nf; i++) {
    const u32 *q = prog + i * 5;
    if (q[0] < OP_COPY || q[0] > OP_MODJ || q[1] >= NSLOT || q[2] >= NSLOT || q[3] >= NSLOT) return 0;
    if (q[1] == q[2] || (q[1] == q[3] && (q[0] == OP_ADD || q[0] == OP_MUL || q[0] == OP_DADD))) return 0;
    if (q[0] == OP_ROT && q[4] > 7) return 0;
    if (q[0] == OP_MODJ && (q[4] < 1 || q[4] > g_n)) return 0;
  }
  ninit = ni; nstep = ns; nfinal = nf;
  return 1;
}
EXPORT(prog_ptr) u32 prog_ptr(void) { return (u32)(unsigned long)prog; }
EXPORT(slot_ptr) u32 slot_ptr(u32 s) { return (u32)(unsigned long)slot[s]; }
EXPORT(words) u32 words(void) { return WORDS; }

/* Execute one instruction over cells [c0, c1). Neighbour ops (nsum, life) need whole rows.
   Ring parameters are copied into locals first: globals live in linear memory, so reading them in a
   loop that stores to o[] forces a reload per element and blocks SIMD vectorisation. The 2-adic ring
   gets its own mask-based loops (modM and mulmod become & mask; dadd becomes XOR). */
static void exec(const u32 *ins, u32 c0, u32 c1) {
  const u32 op = ins[0], c = ins[4], p = g_p, n = g_n, M = g_M, mask = M - 1u, birth = g_birth, survive = g_survive;
  const int two = (p == 2);
  u32 *restrict o = slot[ins[1]];
  const u32 *restrict a = slot[ins[2]];
  const u32 *restrict b = slot[ins[3]];
  const u32 i0 = c0 * L, i1 = c1 * L, y0 = c0 / W, y1 = c1 / W;
  u32 bv[9], sv[9]; for (u32 q = 0; q < 9; q++) { bv[q] = (birth >> q) & 1u; sv[q] = (survive >> q) & 1u; }
#define MOD(x) (two ? ((x) & mask) : ((x) % M))
#define MULMOD(x, y) (two ? (((x) * (y)) & mask) : mulmod_odd((x), (y), M))
  switch (op) {
  case OP_COPY: for (u32 i = i0; i < i1; i++) o[i] = a[i]; break;
  case OP_ADD:  if (two) for (u32 i = i0; i < i1; i++) o[i] = (a[i] + b[i]) & mask; else for (u32 i = i0; i < i1; i++) o[i] = (a[i] + b[i]) % M; break;
  case OP_ADDC: { const u32 cm = c % M; if (two) for (u32 i = i0; i < i1; i++) o[i] = (a[i] + cm) & mask; else for (u32 i = i0; i < i1; i++) o[i] = (a[i] + cm) % M; break; }
  case OP_ORC:  { const u32 cm = c % M; for (u32 i = i0; i < i1; i++) o[i] = MOD(a[i] | cm); break; }
  case OP_SQ:   if (two) for (u32 i = i0; i < i1; i++) o[i] = (a[i] * a[i]) & mask; else for (u32 i = i0; i < i1; i++) o[i] = mulmod_odd(a[i], a[i], M); break;
  case OP_MUL:  if (two) for (u32 i = i0; i < i1; i++) o[i] = (a[i] * b[i]) & mask; else for (u32 i = i0; i < i1; i++) o[i] = mulmod_odd(a[i], b[i], M); break;
  case OP_MULC: { const u32 cm = c % M; if (two) for (u32 i = i0; i < i1; i++) o[i] = (a[i] * cm) & mask; else for (u32 i = i0; i < i1; i++) o[i] = mulmod_odd(a[i], cm, M); break; }
  case OP_SHIFT: if (two) for (u32 i = i0; i < i1; i++) o[i] = (a[i] << 1) & mask; else for (u32 i = i0; i < i1; i++) o[i] = mulmod_odd(a[i], p % M, M); break;
  case OP_DADD: if (two) for (u32 i = i0; i < i1; i++) o[i] = a[i] ^ b[i]; else for (u32 i = i0; i < i1; i++) o[i] = dadd_odd(a[i], b[i], p, n); break;
  case OP_MODJ: { u32 m = 1; for (u32 k = 0; k < c && k < n; k++) m *= p; for (u32 i = i0; i < i1; i++) o[i] = a[i] % m; break; }
  case OP_FROM2: { const u32 m1 = M / p; if (two) for (u32 i = i0; i < i1; i++) o[i] = a[i] & mask; else for (u32 i = i0; i < i1; i++) o[i] = (a[i] & 1u) + p * ((a[i] >> 1) % m1); break; }
  case OP_TO2:  if (two) for (u32 i = i0; i < i1; i++) o[i] = a[i]; else for (u32 i = i0; i < i1; i++) o[i] = ((a[i] % p) & 1u) | (((a[i] / p) << 1) & 0xFFFFFu); break;
  case OP_ROT:
    for (u32 cell = c0; cell < c1; cell++)
      for (u32 k = 0; k < L; k++) o[cell * L + k] = a[cell * L + ((k + c) & 7u)];
    break;
  case OP_NSUM: case OP_LIFE:
    for (u32 y = y0; y < y1; y++) {
      const u32 *rm = a + ((y + H - 1) % H) * W * L, *r0 = a + y * W * L, *rp = a + ((y + 1) % H) * W * L;
      u32 *orow = o + y * W * L;
      for (u32 x = 0; x < W; x++) {
        const u32 xm = ((x + W - 1) % W) * L, x0 = x * L, xp = ((x + 1) % W) * L;
        if (op == OP_NSUM) {
          for (u32 k = 0; k < L; k++) {
            u32 s = rm[xm + k] + rm[x0 + k] + rm[xp + k] + r0[xm + k] + r0[xp + k] + rp[xm + k] + rp[x0 + k] + rp[xp + k];
            orow[x0 + k] = MOD(s);
          }
        } else if (two) {
          /* rule lookup as compare-and-select over the 9 possible counts: a per-lane variable shift
             would force scalar code, while equality tests vectorise. Same result for any B/S rule. */
          for (u32 k = 0; k < L; k++) {
            u32 live = (rm[xm + k] & 1u) + (rm[x0 + k] & 1u) + (rm[xp + k] & 1u) + (r0[xm + k] & 1u) + (r0[xp + k] & 1u) + (rp[xm + k] & 1u) + (rp[x0 + k] & 1u) + (rp[xp + k] & 1u);
            u32 alive = r0[x0 + k] & 1u, res = 0;
            for (u32 q = 0; q < 9; q++) res |= (live == q) & (alive ? sv[q] : bv[q]);
            orow[x0 + k] = res;
          }
        } else {
          for (u32 k = 0; k < L; k++) {
            u32 live = (rm[xm + k] % p != 0) + (rm[x0 + k] % p != 0) + (rm[xp + k] % p != 0) + (r0[xm + k] % p != 0) + (r0[xp + k] % p != 0) + (rp[xm + k] % p != 0) + (rp[x0 + k] % p != 0) + (rp[xp + k] % p != 0);
            u32 alive = r0[x0 + k] % p != 0, res = 0;
            for (u32 q = 0; q < 9; q++) res |= (live == q) & (bv[q] ^ ((bv[q] ^ sv[q]) & (0u - alive)));
            orow[x0 + k] = res;
          }
        }
      }
    }
    break;
  }
#undef MOD
#undef MULMOD
}

static void barrier(u32 nt) {
  if (nt <= 1) return;
#ifdef XPU_THREADS
  u32 gen = __atomic_load_n(&bar_gen, __ATOMIC_SEQ_CST);
  if (__atomic_add_fetch(&bar_count, 1, __ATOMIC_SEQ_CST) == nt) {
    __atomic_store_n(&bar_count, 0, __ATOMIC_SEQ_CST);
    __atomic_add_fetch(&bar_gen, 1, __ATOMIC_SEQ_CST);
    __builtin_wasm_memory_atomic_notify((int *)&bar_gen, 0xFFFFFFFFu);
  } else {
    while (__atomic_load_n(&bar_gen, __ATOMIC_SEQ_CST) == gen)
      __builtin_wasm_memory_atomic_wait32((int *)&bar_gen, (int)gen, -1);
  }
#endif
}

/* Row fusion (1.3.0): a run of consecutive point-wise rows is executed block by block, all rows on
   one block of BLK cells before the next block, so the working set stays in cache; one barrier ends
   the run. Neighbour rows (nsum, life) read other cells, so they run alone, followed by a barrier.
   Every cell's rows still run in program order, so results are identical to row-at-a-time. */
#define BLK 64
static inline int is_neighbour(u32 op) { return op == OP_NSUM || op == OP_LIFE; }
static void run_range(u32 first, u32 count, u32 y0, u32 y1, u32 nt, u32 tid) {
  u32 c0 = y0 * W, c1 = y1 * W;
  for (u32 i = 0; i < count;) {
    const u32 *ins = prog + (first + i) * 5;
    if (is_neighbour(ins[0])) { exec(ins, c0, c1); i++; }
    else {
      u32 j = i; while (j < count && !is_neighbour(prog[(first + j) * 5])) j++;
      for (u32 b0 = c0; b0 < c1; b0 += BLK) {
        u32 b1 = b0 + BLK < c1 ? b0 + BLK : c1;
        for (u32 k = i; k < j; k++) exec(prog + (first + k) * 5, b0, b1);
      }
      i = j;
    }
    barrier(nt);
    if (tid == 0) __atomic_add_fetch(&g_progress, 1, __ATOMIC_RELAXED);
  }
}

EXPORT(progress_ptr) u32 progress_ptr(void) { return (u32)(unsigned long)&g_progress; }

/* Run the program: init once, step n times, final once. Worker tid of nt (1 <= nt <= H, tid < nt).
   Returns 0 when the request is refused. */
EXPORT(run) u32 run(u32 steps, u32 tid, u32 nt) {
  if (nt == 0 || nt > H || tid >= nt) return 0;
  u32 y0 = tid * H / nt, y1 = (tid + 1) * H / nt;
  run_range(0, ninit, y0, y1, nt, tid);
  for (u32 s = 0; s < steps; s++) run_range(ninit, nstep, y0, y1, nt, tid);
  run_range(ninit + nstep, nfinal, y0, y1, nt, tid);
  return 1;
}

/* per-worker stacks for the threaded build (each worker sets __stack_pointer) */
static unsigned char stacks[64][32768] __attribute__((aligned(16)));
EXPORT(stack_top) u32 stack_top(u32 t) { return (u32)(unsigned long)(stacks[t & 63] + 32768); }

EXPORT(reset_sync) void reset_sync(void) { bar_count = 0; bar_gen = 0; done_count = 0; g_progress = 0; }
