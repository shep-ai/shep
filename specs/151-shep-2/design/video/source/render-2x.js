const { chromium } = require('playwright');
const fs = require('fs');
const [,, canvasPath, outDir, ...names] = process.argv;
const canvas = JSON.parse(fs.readFileSync(canvasPath, 'utf8'));
(async () => {
  const browser = await chromium.launch();
  for (const n of names) {
    const b = canvas.boards[n + '.dc.html'];
    const page = await browser.newPage({ viewport: { width: b.w, height: b.h }, deviceScaleFactor: 2 });
    await page.goto(`http://localhost:8765/${n}.dc.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${outDir}/${n}.png` });
    console.log(n, 'ok'); await page.close();
  }
  await browser.close();
})();
