import { chromium } from 'playwright';

const EVIDENCE_DIR = 'specs/063-optional-cascade-delete/evidence';
const BASE_URL = 'http://localhost:6006/iframe.html';

const stories = [
  { id: 'composed-deletefeaturedialog--default', filename: 'dialog-default-no-children-v6.png' },
  { id: 'composed-deletefeaturedialog--with-children', filename: 'dialog-with-children-v6.png' },
  { id: 'composed-deletefeaturedialog--deleting', filename: 'dialog-deleting-v6.png' },
  {
    id: 'composed-deletefeaturedialog--deleting-with-children',
    filename: 'dialog-deleting-with-children-v6.png',
  },
];

const browser = await chromium.launch();

for (const story of stories) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const url = `${BASE_URL}?id=${story.id}&viewMode=story`;
  await page.goto(url);
  // Wait for the dialog to render - it uses Radix portal so look for role="alertdialog" or role="dialog"
  try {
    await page.waitForSelector('[role="alertdialog"], [role="dialog"], [data-radix-portal]', {
      timeout: 10000,
    });
  } catch {
    console.log(
      `Warning: dialog selector not found for ${story.id}, waiting for network idle instead`
    );
    await page.waitForLoadState('networkidle');
  }
  // Extra wait for animations
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${EVIDENCE_DIR}/${story.filename}` });
  console.log(`Captured: ${story.filename}`);
  await page.close();
}

await browser.close();
console.log('All screenshots captured');
