const { chromium } = require('playwright');
const times = process.argv.slice(3).map(Number), out = process.argv[2];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8766/film.html'); await p.waitForFunction(() => window.READY, null, { timeout: 60000 });
  console.log('total', await p.evaluate(() => window.TOTAL), 'anims', await p.evaluate(() => document.getAnimations().length));
  for (const t of times) { await p.evaluate(t => window.seek(t), t); await p.screenshot({ path: `${out}/s-${String(t).padStart(6, '0')}.jpg`, type: 'jpeg', quality: 80 }); }
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
