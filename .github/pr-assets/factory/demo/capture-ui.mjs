/* global process, console, document, setTimeout, getComputedStyle */
// Walks the running `shep ui` (after scenes 01–06) through every page this
// work adds, clicking real buttons. Saves a screenshot per step and a video
// of the whole walk.
//
//   OUT        folder for screenshots and the video (default ./ui-evidence)
//   UI         the running shep ui (default http://localhost:4050)
//   DEMO_DIR   where the scenes kept their state (default /tmp/shep-demo)
//   CHROMIUM   a Chromium binary when Playwright's own is not installed
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const UI = process.env.UI ?? 'http://localhost:4050';
const OUT = process.env.OUT ?? 'ui-evidence';
const VIEWPORT = { width: 1440, height: 900 };
const state = Object.fromEntries(
  readFileSync(join(process.env.DEMO_DIR ?? '/tmp/shep-demo', 'state.env'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('='))
);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
);
// The walk, recorded. Full-page shots come from a second, unrecorded window
// that grows to the page's height (the app scrolls inside a panel, which a
// plain full-page screenshot would cut off).
const walk = await browser.newContext({
  viewport: VIEWPORT,
  recordVideo: { dir: OUT, size: VIEWPORT },
});
const tall = await browser.newContext({ viewport: VIEWPORT });
const page = await walk.newPage();
const still = await tall.newPage();
const pause = (ms = 1200) => page.waitForTimeout(ms);
let step = 0;

function file(name) {
  step += 1;
  const path = join(OUT, `${String(step).padStart(2, '0')}-${name}.png`);
  console.log(path);
  return path;
}

async function open(path) {
  await page.goto(`${UI}${path}`, { waitUntil: 'load', timeout: 120_000 });
  await pause(2500);
}

async function shot(name, testId) {
  const path = file(name);
  if (testId) await page.getByTestId(testId).first().screenshot({ path });
  else await page.screenshot({ path });
}

async function fullShot(name, path) {
  await still.setViewportSize(VIEWPORT);
  await still.goto(`${UI}${path}`, { waitUntil: 'load', timeout: 120_000 });
  await still.waitForTimeout(2500);
  const height = await still.evaluate(() =>
    Math.max(
      document.documentElement.scrollHeight,
      ...[...document.querySelectorAll('div')]
        .filter((el) => getComputedStyle(el).overflowY === 'auto')
        .map((el) => el.scrollHeight + el.getBoundingClientRect().top)
    )
  );
  await still.setViewportSize({
    width: VIEWPORT.width,
    height: Math.min(Math.ceil(height) + 40, 6000),
  });
  await still.waitForTimeout(800);
  await still.screenshot({ path: file(name) });
}

async function scrollPanel(pixels) {
  await page.evaluate(async (distance) => {
    const panel = [...document.querySelectorAll('div')].find(
      (el) => getComputedStyle(el).overflowY === 'auto' && el.scrollHeight > el.clientHeight + 50
    );
    if (!panel) return;
    for (let moved = 0; moved < distance; moved += 30) {
      panel.scrollTop += 30;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }, pixels);
  await pause(600);
}

// 1. Factory status
await open('/factory?space=acme');
await shot('factory-status');

// 2. Opportunities: line, outcomes, discovery, themes, signals, keys, weights
await open('/opportunities?space=acme');
await shot('opportunities-board');
await fullShot('opportunities-full-page', '/opportunities?space=acme');
await shot('outcomes-panel', 'outcomes-panel');
await shot('discovery-panel', 'discovery-panel');

// 3. Mark the checkout customers told, from the outcome row
const tell = page.getByTestId(/^outcome-tell-/).first();
if (await tell.count()) {
  await tell.scrollIntoViewIfNeeded();
  await pause();
  await tell.click();
  await pause(2500);
  await shot('outcome-customers-told', 'outcomes-panel');
}

// 4. Record a new signal from the page, then look at the inbox and keys
await page.getByTestId('add-signal-title').scrollIntoViewIfNeeded();
await page.getByTestId('add-signal-title').fill('Refund e-mails arrive twice');
await page.getByTestId('add-signal-customer').fill('Globex');
await page.getByTestId('add-signal-submit').click();
await pause(2500);
await scrollPanel(1400);
await shot('signals-keys-weights');

// 5. Incidents: the resolved checkout incident and its postmortem
await open(`/incidents?space=acme&incident=${state.INC_CHECKOUT}`);
await shot('incident-resolved');
await fullShot(
  'incident-postmortem-full-page',
  `/incidents?space=acme&incident=${state.INC_CHECKOUT}`
);

// 6. The open search incident: triage, approve the proposed action, resolve
await open(`/incidents?space=acme&incident=${state.INC_SEARCH}`);
await shot('incident-open');
await page.getByTestId('incident-triage').click();
await page
  .getByTestId(/^approve-/)
  .first()
  .waitFor({ timeout: 90_000 });
await pause(1500);
await shot('incident-triaged-action-waiting');
await page
  .getByTestId(/^approve-/)
  .first()
  .click();
await pause(4000);
await fullShot('incident-action-recovered', `/incidents?space=acme&incident=${state.INC_SEARCH}`);
await page
  .getByTestId('incident-note-text')
  .fill('Search index rebuilt; latency back under 300 ms');
await page.getByTestId('incident-note-submit').click();
await pause(2000);
await page.getByTestId('incident-resolve').scrollIntoViewIfNeeded();
await page.getByTestId('incident-resolve').click();
await pause(3000);
await fullShot('incident-resolved-from-ui', `/incidents?space=acme&incident=${state.INC_SEARCH}`);

// 7. Open an incident from the form
await page.getByTestId('open-incident-title').fill('Webhooks delayed');
await page.getByTestId('open-incident-severity').selectOption('Major');
await page.getByTestId('open-incident-workload').fill('webhooks');
await page.getByTestId('open-incident-namespace').fill('shop');
await page.getByTestId('open-incident-submit').click();
await pause(3000);
await shot('incident-opened-from-form');

// 8. Spaces: Acme's agent settings — PR comments, runtime actions, docs first
await open('/spaces');
await shot('spaces');
await page.getByTestId('space-card-acme').getByTestId('space-agent-settings-toggle').click();
await pause(1500);
await page.getByTestId('agent-settings-submit').scrollIntoViewIfNeeded();
await pause();
// The settings, whole, from the tall window
await still.setViewportSize({ width: VIEWPORT.width, height: 2400 });
await still.goto(`${UI}/spaces`, { waitUntil: 'load', timeout: 120_000 });
await still.waitForTimeout(2500);
await still.getByTestId('space-card-acme').getByTestId('space-agent-settings-toggle').click();
await still.waitForTimeout(1500);
await still.getByTestId('space-card-acme').screenshot({ path: file('space-agent-settings') });

// 9. Work item PAY-1: the investigation autopilot ran, and the fix it started
await open('/projects/payments/items/PAY-1');
await shot('work-item-investigation');

// 10. Control Center: the fix feature, waiting at the merge gate
await open('/');
await page
  .getByRole('button', { name: /close|dismiss/i })
  .first()
  .click({ timeout: 5000 })
  .catch(() => undefined);
await pause(2500);
await shot('control-center-fix-feature');

// 11. Factory again: run a pass now from the page
await open('/factory?space=acme');
await page.getByTestId('autopilot-run').click();
await pause(6000);
await shot('factory-after-run-now');

// 12. The sidebar, expanded, with the new pages
await page
  .getByRole('button', { name: /toggle sidebar/i })
  .first()
  .click({ timeout: 5000 })
  .catch(() => undefined);
await pause();
await shot('sidebar-expanded');

// 13. Connections: trackers and Notion knowledge sources
await open('/connections');
await shot('connections');
await page.getByTestId('add-connection-provider').selectOption({ label: 'Notion' });
await pause();
await page.getByTestId('add-connection-name').fill('Acme handbook');
await page.getByTestId('add-connection-space').selectOption({ label: 'Acme' });
await pause();
await shot('connections-add-notion');

await walk.close();
await tall.close();
await browser.close();
