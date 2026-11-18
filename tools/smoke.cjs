// Build smoke test: load web/index.html in headless Chromium (software WebGPU enabled) and require
// the start-up pipeline to finish with no page errors. Exits non-zero on failure.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--disable-vulkan-surface'] });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/fonts\.g|ERR_TUNNEL|ERR_CONNECTION|ERR_NAME/.test(m.text()) && errs.push(m.text()));
  await p.goto('file://' + path.resolve(__dirname, '../web/index.html'));
  try { await p.waitForFunction(() => /done|stopped|failed/.test(document.getElementById('run-msg').textContent), null, { timeout: 90000 }); }
  catch { errs.push('pipeline did not finish within 90 s'); }
  const msg = await p.textContent('#run-msg'), engines = await p.textContent('#engines');
  await b.close();
  const ok = /^done/.test(msg) && !errs.length;
  console.log(`${ok ? 'SMOKE OK' : 'SMOKE FAILED'}: ${msg} | engines: ${engines}${errs.length ? ' | errors: ' + errs.join('; ') : ''}`);
  process.exit(ok ? 0 : 1);
})();
