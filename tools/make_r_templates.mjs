// Write web/r-templates.json: the R0/R1/R2 .russl programs and their IR, lowered by src/russl.js.
// usage: node tools/make_r_templates.mjs <dir holding master_coupled_mechanics.mssl and final_admission.mssl>
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lowerRussl, canonicalJson, canonicalSource, sha256 } from '../src/russl.js';
const dir = process.argv[2] || fileURLToPath(new URL('../web/mssl', import.meta.url));
const mssl = Object.fromEntries(['master_coupled_mechanics', 'final_admission'].map((m) => [m, readFileSync(`${dir}/${m}.mssl`)]));
const dig = Object.fromEntries(await Promise.all(Object.entries(mssl).map(async ([m, b]) => [m, await sha256(b)])));
const STAGES = [['plume.r0', 'Seeded input frame', null], ['plume.r1', 'Output of ByteFoundry 1 (2-adic XPU, Z/2^20)', 'bytefoundry.bf1.plume2'], ['plume.r2', 'Output of ByteFoundry 2 (5-adic XPU, Z/5^8)', 'bytefoundry.bf2.plume5']];
const H = 'ID│LANE│OP│OUT│CTRL│IN│ARG│META';
const source = (uid, title, producer) => canonicalSource([
  'RUSSL/1.0', `# ${title}.` + (producer ? ` Produced by ${producer}.` : ''),
  '# Field: 8 Byte20 lanes (c6) x 128 rows (c7) x 128 columns (c8), u32 words holding 20 bits.',
  '# Layers: a 20-level 2-adic pyramid; level j is the field reduced mod 2^j.',
  `@unit id=${uid} version=1.0.0 profile=russl.core target=russ fail=closed`,
  '@defaults mode=deterministic regime=exact effect=read scope=self',
  `@mssl alias=master module=master_coupled_mechanics source_version=0.1 digest=sha256:${dig.master_coupled_mechanics}`,
  `@mssl alias=admission module=final_admission source_version=0.1 digest=sha256:${dig.final_admission}`,
  `@frame id=F0000 parent=ROOT module=${uid} phase=construct-evaluate`, H,
  'F001│field│FD│field.frame│_│_│shape=1,1,8,128,128;sample=u32;axes=c4,c5,c6,c7,c8│_',
  'P001│field│FP│field.frame.candidate│F001│field.frame›source.state│mapping=identity5│eff=derive',
  'Y001│field│PY│field.pyramid│P001│field.frame.candidate│levels=20;downsample=mod2pow;spatial_axes=none│eff=derive', '@end',
  `@frame id=F0001 parent=F0000 module=${uid}.pyramid phase=pyramid`, H,
  ...Array.from({ length: 20 }, (_, i) => `L${String(i + 1).padStart(3, '0')}│field│FS│field.level${String(i + 1).padStart(2, '0')}│Y001│field.pyramid│selector=mod2pow:${i + 1}│eff=derive`), '@end',
  `@frame id=F0002 parent=F0001 module=${uid}.evaluate phase=evaluate-admit`, H,
  'C001│mechanics│CD│coupling.moore│Y001│field.pyramid│neighborhood=moore2;radius=1;representation=lane-rotated│eff=derive',
  'M001│mechanics│ME│mechanics.result│C001│master›field.pyramid│mode=deterministic;coupling=coupling.moore│eff=derive',
  'A001│admission│AE│admission.result│M001│admission›mechanics.result│policy=baseline│eff=derive',
  'E001│evidence│ER│receipt│A001│admission.result│content_bound=true│eff=write:evidence', '@end'].join('\n'));
const out = { mssl: Object.fromEntries(Object.entries(mssl).map(([m, b]) => [m, b.toString('utf8')])), stages: [] };
for (const [uid, title, producer] of STAGES) {
  const src = source(uid, title, producer), ir = await lowerRussl(src);
  out.stages.push({ unit: uid, title, producer, source: src, ir: canonicalJson(ir), ir_id: ir.ir_id });
  console.log(uid, ir.ir_id, ir.program.length, 'rows');
}
writeFileSync(new URL('../web/r-templates.json', import.meta.url), JSON.stringify(out));
