/**
 * E2E Showcase: Realtime Feature Lifecycle (Real Agent)
 *
 * Produces a VIDEO + AUDIO recording demonstrating the full realtime
 * notification pipeline against a live dev server with a mock agent:
 *
 *   1. Create a feature on an existing repo with all approval gates manual
 *   2. Wait for each approval gate (PRD → Plan → Merge)
 *   3. Approve each gate via the review drawer
 *   4. Observe toast notifications + notification sounds at each step
 *   5. Wait for agent completion with celebration sound
 *
 * Requires: a running dev server (`shep ui` or `pnpm dev:web`) with repos
 * and a mock agent configured. Each step should complete within ~5s.
 *
 * To produce the showcase video:
 *   npx playwright test realtime-showcase --project showcase
 *
 * Override the server URL:  SHOWCASE_URL=http://localhost:3000
 * Override the target repo: SHOWCASE_REPO=agent-chaos
 *
 * Output: test-results/.../recording-with-audio.webm (video + audio merged)
 */

import { test, expect } from './fixtures/audio-recording';
import type { Page } from '@playwright/test';

// ── Per-test config ─────────────────────────────────────────────────────

test.use({
  // Point at the user's live dev server (which has real repos + mock agent)
  baseURL: process.env.SHOWCASE_URL ?? 'http://localhost:3000',
  // Allow audio autoplay without user gesture so sounds play in the video
  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  // Record video for this showcase suite
  video: 'on',
});

// ── Constants ───────────────────────────────────────────────────────────

const REPO_NAME = process.env.SHOWCASE_REPO ?? 'agent-chaos';
const FEATURE_NAME = `E2E Showcase ${Date.now()}`;

/** Max wait for each agent phase transition (mock agent should be < 5s). */
const GATE_TIMEOUT = 15_000;

// ── Helpers ─────────────────────────────────────────────────────────────

/** Remove all Sonner toast DOM nodes so the next gate's toast is unambiguous. */
async function dismissToasts(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-sonner-toast]').forEach((el) => el.remove());
  });
}

/**
 * Wait for a feature node badge with the given text to appear on the canvas,
 * then click the feature node card to open the corresponding review drawer.
 *
 * This is more reliable than clicking the toast "Review" button because:
 * - The badge text is rendered only after React re-renders with updated node state
 * - Clicking the node via handleNodeClick reads already-rendered (current) data
 * - Avoids the race where selectFeatureById reads stale nodesRef.current
 */
async function waitForBadgeAndClickNode(page: Page, badgeText: string, timeout = GATE_TIMEOUT) {
  const badge = page.getByTestId('feature-node-badge').filter({ hasText: badgeText });
  await expect(badge.first()).toBeVisible({ timeout });

  // Click the parent feature-node-card
  const card = page.getByTestId('feature-node-card').filter({
    has: page.getByTestId('feature-node-badge').filter({ hasText: badgeText }),
  });
  await card.first().click();
}

/**
 * Handle PRD questionnaire: select AI-recommended answers for each question,
 * then click the approve button. If no questions exist, approves immediately.
 */
async function approvePrd(page: Page) {
  const approveBtn = page.getByRole('button', { name: /approve/i }).first();
  await expect(approveBtn).toBeVisible({ timeout: 5_000 });

  // Click through recommended options until the approve button is enabled
  let attempts = 0;
  while ((await approveBtn.isDisabled()) && attempts < 20) {
    const recommended = page.getByText('AI Recommended').first();
    const isVisible = await recommended.isVisible().catch(() => false);
    if (isVisible) {
      // Click the option card containing the recommendation
      await recommended.locator('..').click();
      await page.waitForTimeout(600);
    } else {
      // No more recommended options — try Next/Skip or break
      const nextBtn = page.getByRole('button', { name: /next|skip/i }).first();
      const nextVisible = await nextBtn.isVisible().catch(() => false);
      if (nextVisible && (await nextBtn.isEnabled())) {
        await nextBtn.click();
        await page.waitForTimeout(400);
      } else {
        break;
      }
    }
    attempts++;
  }

  await approveBtn.click();
}

// ── Tests ───────────────────────────────────────────────────────────────

test.describe('Showcase: Real Feature Lifecycle with Audio', () => {
  test('create → approval gates → completion with notification sounds', async ({ page }) => {
    // ── 1. Navigate and wait for the control center canvas ──────────────

    await page.goto('/control-center');

    const controlCenter = page.getByTestId('control-center');
    await expect(controlCenter).toBeVisible({ timeout: 15_000 });

    // Enable sounds via localStorage
    await page.evaluate(() => localStorage.setItem('shep-sound-enabled', 'true'));

    // ── 2. Create a feature via the repo node's "Add feature" button ────
    //    This ensures repositoryPath is set (unlike the sidebar button).

    const repoCard = page.locator(
      `[data-testid="repository-node-card"][data-repo-name="${REPO_NAME}"]`
    );
    await expect(repoCard).toBeVisible({ timeout: 5_000 });

    const addFeatureBtn = repoCard.locator('[data-testid="repository-node-add-button"]');
    await addFeatureBtn.click();

    // Wait for the create-feature drawer
    await expect(page.getByRole('heading', { name: 'NEW FEATURE' })).toBeVisible({
      timeout: 5_000,
    });

    // Fill the feature description
    await page
      .getByPlaceholder('e.g. Add GitHub OAuth login with callback handling and token refresh...')
      .fill(FEATURE_NAME);

    // Ensure all auto-approve gates are unchecked (force manual approval)
    for (const id of ['allowPrd', 'allowPlan', 'allowMerge']) {
      const checkbox = page.locator(`#${id}`);
      if (await checkbox.isChecked()) {
        await checkbox.uncheck();
      }
    }

    // Submit
    const submitButton = page.getByRole('button', { name: '+ Create Feature' });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // Drawer should close
    await expect(page.getByRole('heading', { name: 'NEW FEATURE' })).not.toBeVisible({
      timeout: 5_000,
    });

    // ── 3. PRD approval gate ──────────────────────────────────────────────
    //    Agent analyzes requirements → pauses for PRD review → warning toast.
    //    We wait for the feature node badge (not the toast Review button) to
    //    avoid a race where selectFeatureById reads stale node data.

    await waitForBadgeAndClickNode(page, 'Review Product Requirements');
    await approvePrd(page);
    await dismissToasts(page);

    // ── 4. Plan approval gate ─────────────────────────────────────────────
    //    Agent generates plan → pauses for plan review → warning toast

    await waitForBadgeAndClickNode(page, 'Review Technical Planning');
    const approvePlanBtn = page.getByRole('button', { name: 'Approve Plan' });
    await expect(approvePlanBtn).toBeVisible({ timeout: 5_000 });
    await approvePlanBtn.click();
    await dismissToasts(page);

    // ── 5. Merge approval gate ────────────────────────────────────────────
    //    Agent implements + pushes → pauses for merge review → warning toast

    await waitForBadgeAndClickNode(page, 'Review Merge Request');
    const approveMergeBtn = page.getByRole('button', { name: 'Approve Merge' });
    await expect(approveMergeBtn).toBeVisible({ timeout: 5_000 });
    await approveMergeBtn.click();
    await dismissToasts(page);

    // ── 6. Wait for completion ────────────────────────────────────────────
    //    Agent completes → success toast + celebration sound

    const completionToast = page.locator('[data-sonner-toast]').filter({
      hasText: /completed|success/i,
    });
    await expect(completionToast.first()).toBeVisible({ timeout: GATE_TIMEOUT });

    // Hold final frame for video
    await page.waitForTimeout(3_000);
  });
});
