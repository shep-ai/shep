/* global process, console */
// Walks the running `shep ui` through what spec 150 adds, clicking real
// buttons, after the CLI and TUI scenes (the TUI adopted the candidate).
// Saves a screenshot per step and a video of the whole walk.
//
//   OUT        folder for screenshots and the video (default ./ui-evidence)
//   UI         the running shep ui (default http://localhost:4050)
//   DEMO_DIR   where the scenes kept their state (default /tmp/shep-learn-demo)
//   SHEP_HOME  the demo's Shep home (to find the repository id)
//   CHROMIUM   a Chromium binary when Playwright's own is not installed
import { chromium } from '@playwright/test';
import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const UI = process.env.UI ?? 'http://localhost:4050';
const OUT = process.env.OUT ?? 'ui-evidence';
const DEMO_DIR = process.env.DEMO_DIR ?? '/tmp/shep-learn-demo';
const REPO = join(DEMO_DIR, 'shop');
const VIEWPORT = { width: 1440, height: 900 };
const state = Object.fromEntries(
  readFileSync(join(DEMO_DIR, 'state.env'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('='))
);
const db = new Database(join(process.env.SHEP_HOME, 'data'), { readonly: true });
const repositoryId = db.prepare('SELECT id FROM repositories WHERE path = ?').get(REPO)?.id;
db.close();
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
);
const context = await browser.newContext({
  viewport: VIEWPORT,
  recordVideo: { dir: OUT, size: VIEWPORT },
});
const page = await context.newPage();
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

const learning = (version) =>
  `/learning?repo=${encodeURIComponent(REPO)}${version ? `&version=${version}` : ''}`;
const versionRow = (id) => page.getByTestId(`harness-version-${id}`);

// 1. The sidebar has Learning while the selfLearning flag is on
await open(learning());
await shot('learning-page-candidate-adopted');

// 2. The regressed version it replaced: metrics, trend, why it changed
await versionRow(state.V1).click();
await pause(2500);
await shot('regressed-version-detail');

// 3. The candidate (adopted from the TUI): diff, runs-code warning, edit verdicts
await versionRow(state.CANDIDATE).click();
await pause(2500);
await shot('candidate-detail', 'harness-version-detail');

// 4. Roll back, with confirmation: the version it was built on is current again
await page.getByTestId('learning-rollback').click();
await pause(900);
await shot('rollback-confirm');
await page.getByTestId('learning-rollback-confirm').click();
await page.getByTestId('learning-current').getByText(state.V1).waitFor({ timeout: 30_000 });
await pause(1500);
await shot('rolled-back');

// 5. Adopt the candidate again from its row
await versionRow(state.CANDIDATE).click();
await pause(2000);
await page.getByTestId('harness-adopt').click();
await page.getByTestId('learning-current').getByText(state.CANDIDATE).waitFor({ timeout: 30_000 });
await pause(1500);
await shot('adopted-again');

// 6. Lessons
await page.getByTestId('harness-lessons').scrollIntoViewIfNeeded();
await pause(1200);
await shot('lessons', 'harness-lessons');

// 7. Settings → Self-learning: mode, Explore budget, adoption policy
await open('/settings');
await page.getByRole('button', { name: 'Self-learning' }).click();
await pause(1800);
await shot('settings-self-learning-section', 'self-learning-settings-section');
await page.getByTestId('learning-mode').click();
await pause(800);
await shot('settings-learning-modes');
await page.getByRole('option', { name: 'Reflect' }).click();
await pause(2000);
await shot('settings-mode-reflect-saved', 'self-learning-settings-section');

// 8. Create drawer: per-feature Explore with k and the cost
await open(`/create?repo=${encodeURIComponent(REPO)}`);
await page.getByTestId('explore-harness-row').scrollIntoViewIfNeeded();
await pause(800);
await page.getByTestId('explore-harness-switch').click();
await pause(1200);
await shot('create-drawer-explore-on');

// 9. The repository drawer links to its Learning page
if (repositoryId) {
  await open(`/repository/${repositoryId}`);
  await page.getByTestId('repository-learning-link').hover();
  await pause(1200);
  await shot('repository-drawer-learning-link');
  await page.getByTestId('repository-learning-link').click();
  await page.getByTestId('learning-page').waitFor({ timeout: 60_000 });
  await pause(2000);
}

const video = page.video();
await context.close();
await browser.close();
const webm = join(OUT, 'walkthrough.webm');
renameSync(await video.path(), webm);
const ffmpeg = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
ffmpeg([
  '-i',
  webm,
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  '-crf',
  '30',
  join(OUT, 'walkthrough.mp4'),
]);
ffmpeg([
  '-i',
  webm,
  '-vf',
  'fps=4,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle',
  join(OUT, 'walkthrough.gif'),
]);
rmSync(webm);
console.log(join(OUT, 'walkthrough.mp4'));
