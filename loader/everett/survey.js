// Export the site survey for the cartridge: node survey.js <seed> <out.json>
const path = require('path');
const fs = require('fs');
const { generateWorld } = require(path.resolve(__dirname, 'worldgen.js'));
const seed = +(process.argv[2] || 1893);
const W = generateWorld({ seed });
const sites = W.sites.map((s) => [s.zone, s.ring, s.area, s.minEra, s.y < 0.75 ? 1 : 0]);
const zones = {};
W.sites.forEach((s, i) => { (zones[s.zone] = zones[s.zone] || []).push(i); });
const coastKm = Math.round(W.coastLines.reduce((a, l) => a + W.util.polyLength(l), 0) * 0.12);
const roadKm = Math.round(W.roads.filter((r) => r.style !== 4 && r.style !== 5).reduce((a, r) => a + r.len, 0) * 0.12);
fs.writeFileSync(process.argv[3], JSON.stringify({ seed, sites, zones, size: W.N, coastKm, roadKm, trees: W.trees.length }));
console.log(JSON.stringify({ seed, sites: sites.length, zones: Object.fromEntries(Object.entries(zones).map(([k, v]) => [k, v.length])), coastKm, roadKm }));
