// Write docs/LAWS.md (the law book: each law, its class and continuum image, the modules that use it) and
// docs/VARIABLES.md (the umbrella: every table's fields, who decides them and by which laws) from the sources.
// usage: node tools/make_docs.mjs
// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { LAW_ROWS, CORPUS, PART0 } from "../src/laws.js";
import { VARIABLES } from "../src/variables.js";

const src = new URL("../src/", import.meta.url), uses = new Map();
for (const f of readdirSync(src).filter((x) => x.endsWith(".js")).sort()) {
  const s = readFileSync(new URL(f, src), "utf8");
  for (const m of s.matchAll(/(?:\buse|lawUse)\("(\d+\.\d+)"\)/g)) { const k = m[1]; if (!uses.has(k)) uses.set(k, new Set()); uses.get(k).add(f.replace(".js", "")); }
}
const users = new Map(); for (const [id, set] of uses) users.set(id, [...set].filter((m) => m !== "laws"));
// a law used only inside laws.js is used through the function that wraps it: list the modules that call that function
const lawsSrc = readFileSync(new URL("laws.js", src), "utf8"), wrappers = new Map();
{ const heads = [...lawsSrc.matchAll(/^export (?:function|const|class) ([A-Za-z_$][\w$]*)/gm)];
  heads.forEach((h, k) => { const body = lawsSrc.slice(h.index, k + 1 < heads.length ? heads[k + 1].index : lawsSrc.length);
    for (const m of body.matchAll(/\buse\("(\d+\.\d+)"\)/g)) { if (!wrappers.has(m[1])) wrappers.set(m[1], []); if (!wrappers.get(m[1]).includes(h[1])) wrappers.get(m[1]).push(h[1]); } }); }
for (const [id, fns] of wrappers) {
  const mods = new Set(users.get(id) || []);
  for (const f of readdirSync(src).filter((x) => x.endsWith(".js") && x !== "laws.js")) { const s = readFileSync(new URL(f, src), "utf8"); if (fns.some((fn) => new RegExp(`\\b${fn}\\(`).test(s))) mods.add(f.replace(".js", "")); }
  users.set(id, [...mods].sort());
}
const esc = (s) => String(s).replace(/\|/g, "\\|");
let laws = `# The law book\n\nPort Alder's laws come from the continuum images of *${CORPUS.title}* (${CORPUS.author}, ${CORPUS.year}${CORPUS.edition ? ", " + CORPUS.edition : ""}).\n` +
  `Of its ${CORPUS.entries.toLocaleString("en-US")} entries, ${CORPUS.faithful.toLocaleString("en-US")} have a continuum image with a faithful linear form ("Exact linear", with any qualifier). ` +
  `The city implements ${LAW_ROWS.length} of them, at least one from each of the corpus's 80 stations, from their equations alone. Each is cited by station and entry; no text of the corpus is reproduced.\n\n` +
  `Part 0's classes ${PART0.classes.join(", ")} are the families the images belong to. Obstructions (${Array.isArray(PART0.excluded) ? PART0.excluded.join(", ") : Object.keys(PART0.excluded).join(", ")}), structural analogues and analogies, and linearised images are not used.\n\n` +
  `| Entry | Law | Class | Continuum image | Used by |\n|---|---|---|---|---|\n` +
  LAW_ROWS.map((r) => `| ${r[0]} | ${esc(r[1])} | ${r[2]} | ${esc(r[3])} | ${(users.get(r[0]) || []).join(", ") || "—"} |`).join("\n") + "\n";
writeFileSync(new URL("../docs/LAWS.md", import.meta.url), laws);
const labels = { people: "People", households: "Households", firms: "Firms", loans: "Loans", outerHouseholds: "Households of the outer layers", outerFirms: "Employers of the outer layers", places: "Places of the outer layers", buildings: "Buildings", dwellings: "Homes", spaces: "Commercial spaces" };
let vars = `# The umbrella of sentient computing\n\nNo variable in Port Alder is procedural. Every field of every table is decided by agents, or is an aggregate or a law of their states. ` +
  `Real-world data and law enter only as history (the founding census, which closes when genesis ends) and as the statutes that bind what agents may decide. ` +
  `\`test/umbrella.test.mjs\` checks that every field below is named once, that every law cited is in the law book (docs/LAWS.md), that nothing draws a random number or reads a clock into the state, and that the census refuses to answer after genesis.\n`;
let n = 0;
for (const [g, rows] of Object.entries(VARIABLES)) {
  vars += `\n## ${labels[g] || g}\n\n| Fields | Decided by | Laws |\n|---|---|---|\n`;
  for (const [f, who, l] of rows) { n += f.split(/\s+/).filter(Boolean).length; vars += `| ${f.split(/\s+/).filter(Boolean).map((x) => "`" + x + "`").join(" ")} | ${esc(who)} | ${l.join(", ")} |\n`; }
}
vars += `\n${n} fields in all.\n`;
writeFileSync(new URL("../docs/VARIABLES.md", import.meta.url), vars);
console.log(`wrote docs/LAWS.md (${LAW_ROWS.length} laws) and docs/VARIABLES.md (${n} fields)`);
