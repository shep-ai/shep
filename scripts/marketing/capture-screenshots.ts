/**
 * Marketing Screenshot Factory
 *
 * Playwright-driven screenshot factory that captures the full marketing
 * screenshot set against a seeded demo instance. Captures both dark and
 * light color schemes at 2x DPR with consistent framing.
 *
 * Prerequisites:
 *   1. pnpm demo:seed   — provisions the demo Shep instance
 *   2. pnpm dev:web     — web dashboard must be running (port 4050)
 *
 * Usage:
 *   pnpm demo:capture
 *
 * Output:
 *   scripts/marketing/output/screenshots/{surface}-{scheme}.png
 *   /home/user/website/public/screenshots/next/{surface}-{scheme}.png (staging)
 *   /home/user/website/specs/012-website-redesign/evidence/after/task-1.2/contact-sheet.png
 */

import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// ─── Configuration ───────────────────────────────────────────────────────────

// dev:web runs on 3000 by default; production shep ui runs on 4050.
// Override via SHEP_WEB_PORT env var if needed.
const WEB_PORT = process.env.SHEP_WEB_PORT ?? '3000';
const BASE_URL = `http://localhost:${WEB_PORT}`;
const VIEWPORT = { width: 1440, height: 900 };
const DEVICE_SCALE_FACTOR = 2;
const OUTPUT_DIR = join(import.meta.dirname, 'output', 'screenshots');
const WEBSITE_NEXT_DIR = '/home/user/website/public/screenshots/next';
const EVIDENCE_DIR = '/home/user/website/specs/012-website-redesign/evidence/after/task-1.2';
const PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';

/** Seeded feature IDs from seed-demo.ts */
const FEATURE_IDS = {
  implementing: 'demo-feat-implementing-0001',
  awaitingReview: 'demo-feat-awaiting-review-0001',
  prOpen: 'demo-feat-pr-open-0001',
  blocked: 'demo-feat-blocked-0001',
};

/** Color scheme -> localStorage value and CSS class */
const SCHEMES = [
  { name: 'dark', theme: 'dark', cssClass: 'dark' },
  { name: 'light', theme: 'light', cssClass: '' },
] as const;

type SchemeName = (typeof SCHEMES)[number]['name'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ensureDirs(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(WEBSITE_NEXT_DIR, { recursive: true });
  mkdirSync(EVIDENCE_DIR, { recursive: true });
}

async function setTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.evaluate((t: string) => {
    localStorage.setItem('shep-theme', t);
  }, theme);
  // Apply/remove dark class immediately
  if (theme === 'dark') {
    await page.evaluate(() => document.documentElement.classList.add('dark'));
  } else {
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
  }
}

async function waitForNetworkAndSettle(page: Page, extraMs = 1500): Promise<void> {
  // Use 'load' (not 'networkidle') — the SSE connection keeps the network
  // perpetually busy, so networkidle never fires on this app.
  await page.waitForLoadState('load');
  // Extra settle time for React hydration, animations, and data fetching
  await page.waitForTimeout(extraMs);
}

/**
 * Removes the Next.js dev overlay badge/button if present.
 * This prevents the dev error badge from appearing in screenshots.
 */
async function removeDevOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Remove Next.js dev toolbar
    const selectors = [
      'nextjs-portal',
      '[data-nextjs-dialog-overlay]',
      '[data-nextjs-toast]',
      '[data-nextjs-terminal]',
      '#__next-build-watcher',
      'next-route-announcer',
    ];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => el.remove());
    }
  });
}

async function navigateAndReady(
  page: Page,
  url: string,
  scheme: 'dark' | 'light',
  settleMs = 2000
): Promise<void> {
  // Set theme BEFORE navigation so the page boots in the right scheme
  // (the init script reads localStorage synchronously)
  await page.evaluate((t: string) => localStorage.setItem('shep-theme', t), scheme);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForNetworkAndSettle(page, settleMs);
  await removeDevOverlays(page);
  // Ensure dark class is set correctly after navigation
  if (scheme === 'dark') {
    await page.evaluate(() => document.documentElement.classList.add('dark'));
  } else {
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
  }
}

async function capture(page: Page, name: string, scheme: SchemeName): Promise<string> {
  const filename = `${name}-${scheme}.png`;
  const outputPath = join(OUTPUT_DIR, filename);
  await page.screenshot({ path: outputPath, fullPage: false });
  console.log(`  [ok] ${filename}`);
  return outputPath;
}

/**
 * Dismiss all Sonner toasts by pressing Escape or removing them from the DOM.
 * Waits briefly for toasts that appear asynchronously after page load.
 */
async function dismissToasts(page: Page): Promise<void> {
  // Wait a moment for async toasts to appear, then remove them all via DOM
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    // Remove all Sonner toast elements from DOM so they don't appear in screenshots
    document.querySelectorAll('[data-sonner-toast], [data-sonner-toaster]').forEach((el) => {
      el.remove();
    });
  });
}

// ─── Surface capture functions ────────────────────────────────────────────────

/**
 * Surface 1: Visual canvas / control center with the 4 seeded features (money shot).
 * URL: /control-center
 */
async function captureControlCenter(page: Page, scheme: SchemeName): Promise<void> {
  console.log(`\n[surface 1] Visual canvas / control center (${scheme})`);
  await navigateAndReady(page, `${BASE_URL}/control-center`, scheme, 3000);
  await dismissToasts(page);
  // Wait for the React Flow canvas nodes to render
  await page.waitForSelector('.react-flow__node', { timeout: 10000 }).catch(() => null);
  await page.waitForTimeout(1000);
  await capture(page, 'control-center', scheme);
}

/**
 * Surface 2: Parallel features list — Inventory view with all 4 features expanded.
 * URL: /features (shows all features grouped by repository)
 */
async function captureSdlcBoard(page: Page, scheme: SchemeName): Promise<void> {
  console.log(`\n[surface 2] Parallel features / Inventory list (${scheme})`);
  await navigateAndReady(page, `${BASE_URL}/features`, scheme, 2500);
  await dismissToasts(page);

  // Expand Tabulator data-tree group rows.
  // Tabulator renders a `.tabulator-data-tree-control` div (not a <button>) as the
  // expand/collapse toggle — clicking it expands the group to reveal child features.
  // We must NOT click any <button> in the row (those are repo action menus).
  await page.evaluate(() => {
    document
      .querySelectorAll<HTMLElement>('.tabulator-data-tree-control')
      .forEach((ctrl) => ctrl.click());
  });
  await page.waitForTimeout(800);

  await capture(page, 'parallel-features', scheme);
}

/**
 * Wait for the feature drawer to open (visible tab list or drawer header).
 */
async function waitForFeatureDrawer(page: Page): Promise<void> {
  await page
    .waitForSelector('[role="tablist"], [data-drawer="feature"]', { timeout: 8000 })
    .catch(() => null);
  await page.waitForTimeout(1200);
}

/**
 * Surface 3: Feature workspace detail — "Add pagination" (implementing feature).
 * URL: /feature/{featureId}  (dashboard parallel route renders drawer on top of canvas)
 */
async function captureFeatureWorkspace(page: Page, scheme: SchemeName): Promise<void> {
  console.log(`\n[surface 3] Feature workspace detail — Add pagination (${scheme})`);
  const featureId = FEATURE_IDS.implementing;
  await navigateAndReady(page, `${BASE_URL}/feature/${featureId}`, scheme, 3000);
  await dismissToasts(page);
  await waitForFeatureDrawer(page);
  await capture(page, 'feature-workspace', scheme);
}

/**
 * Surface 4: Awaiting review feature — a second detailed view.
 * Shows the "Add Bearer token auth middleware" feature (lifecycle: Review / Done state).
 * Captures a distinct angle: the full overview with branch/agent/settings.
 */
async function captureFeatureActivity(page: Page, scheme: SchemeName): Promise<void> {
  console.log(`\n[surface 4] Awaiting review feature detail (${scheme})`);
  const featureId = FEATURE_IDS.awaitingReview;
  await navigateAndReady(page, `${BASE_URL}/feature/${featureId}`, scheme, 3000);
  await dismissToasts(page);
  await waitForFeatureDrawer(page);
  // Capture the Overview tab showing the completed feature with Done badge
  await capture(page, 'feature-review-detail', scheme);
}

/**
 * Surface 5: Awaiting review feature overview — shows the completed state with branch info.
 * The Merge Review tab is only visible when state=action-required with merge data loaded
 * from the actual git branch. We capture the overview which shows all key details.
 */
async function captureMergeReview(page: Page, scheme: SchemeName): Promise<void> {
  console.log(`\n[surface 5] Awaiting review feature — overview + merge tab attempt (${scheme})`);
  const featureId = FEATURE_IDS.awaitingReview;
  await navigateAndReady(page, `${BASE_URL}/feature/${featureId}`, scheme, 3000);
  await dismissToasts(page);
  await waitForFeatureDrawer(page);

  // Try "Merge Review" tab first (exact label match)
  const mergeReviewTab = page.locator('[role="tab"]').filter({ hasText: 'Merge Review' });
  const mergeVisible = await mergeReviewTab
    .first()
    .isVisible({ timeout: 2000 })
    .catch(() => false);

  if (mergeVisible) {
    await mergeReviewTab.first().click();
    await page.waitForTimeout(2000); // longer wait — git diff may need to load
    console.log('  → Merge Review tab found and clicked');
  } else {
    // Merge Review tab not available for this feature state — stay on Overview
    console.log('  → Merge Review tab not available; capturing Overview tab');
  }

  await capture(page, 'merge-review', scheme);
}

/**
 * Surface 6: Create-feature drawer with typed prompt.
 * URL: /create (parallel route renders the create drawer over the canvas)
 */
async function captureCreateDrawer(page: Page, scheme: SchemeName): Promise<void> {
  console.log(`\n[surface 6] Create-feature drawer with typed prompt (${scheme})`);
  await navigateAndReady(page, `${BASE_URL}/create`, scheme, 3000);
  await dismissToasts(page);

  // Find and type into the prompt textarea
  const textarea = page.locator('textarea').first();
  if (await textarea.isVisible({ timeout: 5000 }).catch(() => false)) {
    await textarea.click();
    // Clear then type the realistic prompt
    await textarea.fill('Add CSV export to the reports page');
    await page.waitForTimeout(600);
  }

  await capture(page, 'create-drawer', scheme);
}

/**
 * Surface 7: Feature with open PR / CI status — "Fix concurrent deletes" (AwaitingUpstream).
 */
async function captureFeatureWithPr(page: Page, scheme: SchemeName): Promise<void> {
  console.log(`\n[surface 7] Feature with open PR / CI status (${scheme})`);
  const featureId = FEATURE_IDS.prOpen;
  await navigateAndReady(page, `${BASE_URL}/feature/${featureId}`, scheme, 3000);
  await dismissToasts(page);
  await waitForFeatureDrawer(page);
  await capture(page, 'feature-pr-status', scheme);
}

/**
 * Surface 8: Blocked feature — shows the Blocked state with the open question.
 * The seeded feature has a question in its messages (stored on the feature entity).
 * We show the Overview tab which renders the description and blocked state badge.
 */
async function captureBlockedFeature(page: Page, scheme: SchemeName): Promise<void> {
  console.log(`\n[surface 8] Blocked feature with open question (${scheme})`);
  const featureId = FEATURE_IDS.blocked;
  await navigateAndReady(page, `${BASE_URL}/feature/${featureId}`, scheme, 3000);
  await dismissToasts(page);
  await waitForFeatureDrawer(page);

  // Stay on Overview tab which shows the blocked state and description
  // The overview shows the "Blocked" lifecycle badge + description with the question context
  await capture(page, 'blocked-feature', scheme);
}

/**
 * Surface 9: Settings / agent selection.
 */
async function captureSettings(page: Page, scheme: SchemeName): Promise<void> {
  console.log(`\n[surface 9] Settings / agent selection (${scheme})`);
  await navigateAndReady(page, `${BASE_URL}/settings`, scheme, 2000);
  await dismissToasts(page);
  await page.waitForTimeout(800);
  await capture(page, 'settings', scheme);
}

/**
 * Surface 10: Agents view — shows available agent types (agent-agnostic story).
 * Falls back to settings/agent section if the agents page is empty.
 */
async function captureFeaturesList(page: Page, scheme: SchemeName): Promise<void> {
  console.log(`\n[surface 10] Agents view (${scheme})`);
  await navigateAndReady(page, `${BASE_URL}/agents`, scheme, 2000);
  await dismissToasts(page);
  await page.waitForTimeout(800);
  await capture(page, 'agents-view', scheme);
}

// ─── Contact sheet generator ──────────────────────────────────────────────────

function generateContactSheet(pngFiles: string[]): void {
  const contactSheetPath = join(EVIDENCE_DIR, 'contact-sheet.png');
  console.log('\n[contact sheet] Generating with Pillow...');

  const script = `
import os, math
from PIL import Image

files = ${JSON.stringify(pngFiles)}
files = [f for f in files if os.path.exists(f)]
if not files:
    print("No PNG files found")
    exit(1)

# Load all images
imgs = [Image.open(f) for f in files]

# Scale down for contact sheet (each thumbnail at 1/4 size)
thumb_w = 720
thumbs = []
for img in imgs:
    ratio = thumb_w / img.width
    thumb_h = int(img.height * ratio)
    thumbs.append(img.resize((thumb_w, thumb_h), Image.LANCZOS))

# Layout: 2 columns
cols = 2
rows = math.ceil(len(thumbs) / cols)
pad = 20
sheet_w = cols * thumb_w + (cols + 1) * pad
row_h = max(t.height for t in thumbs)
sheet_h = rows * row_h + (rows + 1) * pad

sheet = Image.new('RGB', (sheet_w, sheet_h), (20, 20, 20))

for idx, thumb in enumerate(thumbs):
    row = idx // cols
    col = idx % cols
    x = pad + col * (thumb_w + pad)
    y = pad + row * (row_h + pad)
    sheet.paste(thumb, (x, y))

sheet.save(${JSON.stringify(contactSheetPath)})
print(f"Contact sheet saved: {sheet_w}x{sheet_h} px, {len(thumbs)} captures")
`.trim();

  try {
    execFileSync('python3', ['-c', script], { stdio: ['ignore', 'inherit', 'inherit'] });
    console.log(`  → ${contactSheetPath}`);
  } catch (err) {
    console.error('  [warn] Contact sheet generation failed:', err);
  }
}

// ─── Copy to staging dir ──────────────────────────────────────────────────────

function copyToStaging(): string[] {
  console.log('\n[staging] Copying captures to website/public/screenshots/next/');
  const staged: string[] = [];
  const files = readdirSync(OUTPUT_DIR).filter((f) => f.endsWith('.png'));
  for (const file of files) {
    const src = join(OUTPUT_DIR, file);
    const dst = join(WEBSITE_NEXT_DIR, file);
    copyFileSync(src, dst);
    staged.push(dst);
    console.log(`  → ${file}`);
  }
  return staged;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n=== Shep Marketing Screenshot Factory ===');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Output: ${OUTPUT_DIR}`);

  ensureDirs();

  // Verify the app is reachable before proceeding (try health endpoint, fall back to root)
  let appReachable = false;
  for (const checkUrl of [`${BASE_URL}/api/agent-events/health`, `${BASE_URL}/control-center`]) {
    try {
      const res = await fetch(checkUrl, { signal: AbortSignal.timeout(5000) });
      if (res.status < 500) {
        appReachable = true;
        break;
      }
    } catch {
      // try next URL
    }
  }
  if (!appReachable) {
    console.error(`\n[error] Cannot reach ${BASE_URL}. Run "pnpm dev:web" first, then retry.`);
    process.exit(1);
  }
  console.log('\n[ok] App is reachable at', BASE_URL);

  process.env.PLAYWRIGHT_BROWSERS_PATH = PLAYWRIGHT_BROWSERS_PATH;

  const browser: Browser = await chromium.launch({ headless: true });
  const capturedPaths: string[] = [];

  try {
    for (const scheme of SCHEMES) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`SCHEME: ${scheme.name.toUpperCase()}`);
      console.log('─'.repeat(60));

      const context: BrowserContext = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: DEVICE_SCALE_FACTOR,
        colorScheme: scheme.name as 'dark' | 'light',
      });

      // Pre-set the theme in storage so the init script reads it on first load
      await context.addInitScript((themeName: string) => {
        localStorage.setItem('shep-theme', themeName);
      }, scheme.theme);

      const page: Page = await context.newPage();

      // Warm up: navigate once to ensure DI container is ready
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await setTheme(page, scheme.theme as 'dark' | 'light');

      const surfaces = [
        () => captureControlCenter(page, scheme.name),
        () => captureSdlcBoard(page, scheme.name),
        () => captureFeatureWorkspace(page, scheme.name),
        () => captureFeatureActivity(page, scheme.name),
        () => captureMergeReview(page, scheme.name),
        () => captureCreateDrawer(page, scheme.name),
        () => captureFeatureWithPr(page, scheme.name),
        () => captureBlockedFeature(page, scheme.name),
        () => captureSettings(page, scheme.name),
        () => captureFeaturesList(page, scheme.name),
      ];

      for (const surface of surfaces) {
        await surface();
      }

      // Collect captured file paths
      const schemeFiles = readdirSync(OUTPUT_DIR)
        .filter((f) => f.endsWith(`-${scheme.name}.png`))
        .map((f) => join(OUTPUT_DIR, f));
      capturedPaths.push(...schemeFiles);

      await context.close();
    }
  } finally {
    await browser.close();
  }

  // Copy to staging dir
  copyToStaging();

  // Generate contact sheet
  const allPngs = readdirSync(OUTPUT_DIR)
    .filter((f) => f.endsWith('.png'))
    .map((f) => join(OUTPUT_DIR, f))
    .sort();
  generateContactSheet(allPngs);

  console.log(`\n[done] ${capturedPaths.length} screenshots captured`);
  console.log(`  Output: ${OUTPUT_DIR}`);
  console.log(`  Staging: ${WEBSITE_NEXT_DIR}`);
  console.log(`  Evidence: ${EVIDENCE_DIR}/contact-sheet.png`);
}

main().catch((err) => {
  console.error('Screenshot factory failed:', err);
  process.exit(1);
});
