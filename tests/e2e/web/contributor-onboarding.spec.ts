/**
 * E2E: Contributor onboarding view smoke test (spec 097, task-48).
 *
 * Verifies that GET /onboarding renders the contributor view when the
 * `collaboration` feature flag is on (flipped by global-setup):
 *  - the four primary surfaces are present (lane chooser, leaderboard,
 *    doctor summary, pick-issue prompt)
 *  - selecting a lane swaps the prompt for the curated-issues list
 *  - the leaderboard renders something (rows when seeded, empty state
 *    when not — both are valid structural surfaces)
 *
 * The page is gated behind the `collaboration` feature flag; if the flag
 * isn't on (cold CI without the global-setup flip) the test skips.
 */

import { test, expect } from '@playwright/test';

test.describe('Contributor onboarding view (spec 097)', () => {
  test('renders contributor view, lane selection updates curated issues', async ({ page }) => {
    await page.goto('/onboarding');

    const isNotFound = await page
      .getByRole('heading', { name: 'Not Found' })
      .isVisible()
      .catch(() => false);
    test.skip(
      isNotFound,
      'Collaboration flag is OFF in the running dev server. Restart the dev server to pick up the global-setup flip.'
    );

    // Structural surfaces must all render.
    await expect(page.getByTestId('contributor-onboarding-view')).toBeVisible();
    await expect(page.getByTestId('lane-chooser')).toBeVisible();
    await expect(page.getByTestId('contributor-leaderboard')).toBeVisible();
    await expect(page.getByTestId('doctor-summary')).toBeVisible();

    // Before a lane is picked, the prompt is visible and the curated list is not.
    await expect(page.getByTestId('contributor-pick-issue-prompt')).toBeVisible();

    // Pick a lane → the prompt goes away and the curated-issues surface
    // takes its place (either the list, an empty state, or an error block).
    await page.getByTestId('lane-chooser-select').selectOption('docs');

    await expect(page.getByTestId('contributor-pick-issue-prompt')).toHaveCount(0);
    await expect(page.getByTestId('curated-issues-list')).toBeVisible();
  });
});
