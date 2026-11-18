// SPDX-License-Identifier: GPL-3.0-only
// Write web/city-templates.json: the RUSSL program sealed into every Port Alder epoch R file,
// lowered by src/russl.js. The MSSL modules are the corpus modules the plume R files bind.
// usage: node tools/make_city_templates.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { lowerRussl, canonicalJson, canonicalSource, sha256 } from '../src/russl.js';
const dir = new URL('../web/mssl/', import.meta.url);
const mssl = Object.fromEntries(['master_coupled_mechanics', 'final_admission'].map((m) => [m, readFileSync(new URL(`${m}.mssl`, dir))]));
const dig = Object.fromEntries(await Promise.all(Object.entries(mssl).map(async ([m, b]) => [m, await sha256(b)])));
const H = 'ID│LANE│OP│OUT│CTRL│IN│ARG│META';
const program = (uid, title, comments) => canonicalSource([
  'RUSSL/1.0', `# ${title}`, ...comments.map((c) => '# ' + c),
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
const STAGES = [
  ['port.alder.epoch', 'Port Alder epoch. Produced by port.alder.streetlife (Z/2^20) on the ByteFoundry XPU.', 'port.alder.streetlife', [
    'Field: 8 street-life lanes (home life, shopping, dining, work, nightlife, parks and play, transit crowds, disorder),',
    'one per Byte20 lane (c6) x 128 rows (c7) x 128 columns (c8), u32 words holding 20 bits.',
    'Bit 0: the lane is alive in the cell. Bits 1-4: live neighbours a generation ago. Bits 5-19: the three generations before.',
    'The provenance holds the epoch digest, the books audit and the day the city lived.']],
  ['port.alder.map', 'Port Alder map: the city on its 128 x 128 grid of 20 m cells.', 'port.alder.world/1', [
    'Lanes (c6): 0 height in millimetres + 2^19, 1 land use, 2 road kind, 3 building kind + 1, 4 floors, 5 land value in dollars per square metre,',
    '6 neighbourhood, 7 road condition (0-1000).']],
];
const out = { mssl: Object.fromEntries(Object.entries(mssl).map(([m, b]) => [m, b.toString('utf8')])), stages: [] };
for (const [uid, title, producer, comments] of STAGES) {
  const source = program(uid, title, comments), ir = await lowerRussl(source);
  out.stages.push({ unit: uid, title, producer, source, ir: canonicalJson(ir), ir_id: ir.ir_id });
  console.log(uid, ir.ir_id, ir.program.length, 'rows');
}
writeFileSync(new URL('../web/city-templates.json', import.meta.url), JSON.stringify(out));
