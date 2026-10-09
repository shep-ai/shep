import { expect, test } from '@playwright/test';
import { expectAccessible } from './helpers/ui-accessibility';
import { enableFeatureFlag } from './helpers/feature-flag-toggle';
import { seedUiExperience } from './helpers/ui-experience-data';

test.describe('populated page accessibility', () => {
  let fixtures: ReturnType<typeof seedUiExperience>;
  test.beforeAll(() => {
    fixtures = seedUiExperience();
  });
  test.afterAll(() => fixtures?.cleanup());

  test('work-item creation names its fields and supports cancel', async ({ page }) => {
    await page.goto(`/projects/${fixtures.ids.project}`);
    await page.getByTestId('create-work-item-btn').click();
    const dialog = page.getByRole('dialog', { name: 'Create Work Item' });
    await expect(dialog.getByRole('combobox', { name: 'State', exact: true })).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: 'Priority', exact: true })).toBeVisible();
    await expectAccessible(page);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('application overflow exposes keyboard menu actions', async ({ page }) => {
    await page.goto(`/application/${fixtures.ids.application}`);
    // The model action enables the picker asynchronously; scan after its loading fade.
    await expect(page.getByRole('combobox', { name: 'Agent and model' })).toBeEnabled();
    await page.getByRole('button', { name: 'More options', exact: true }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expectAccessible(page);
    const copy = menu.getByRole('menuitem', { name: 'Copy full generated prompt (debug)' });
    await copy.focus();
    await page.keyboard.press('End');
    await expect(menu.getByRole('menuitem', { name: 'Delete app…' })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(menu.getByTestId('open-in-control-center-sdd-menu-item')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).not.toBeVisible();
  });

  test('application panes use the full phone width and switch without losing state', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/application/${fixtures.ids.application}`);
    const conversation = page.getByRole('region', {
      name: 'Application conversation',
      exact: true,
    });
    const workspace = page.getByRole('region', { name: 'Application workspace', exact: true });
    await expect(conversation).toBeVisible();
    expect((await conversation.boundingBox())!.width).toBeGreaterThan(350);
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await expect(workspace).toBeVisible();
    await expect(conversation).not.toBeVisible();
    expect((await workspace.boundingBox())!.width).toBeGreaterThan(350);
    await page.getByRole('button', { name: 'Conversation', exact: true }).click();
    await expect(conversation).toBeVisible();
    await page.getByRole('tab', { name: 'IDE', exact: true }).click();
    await expect(workspace).toBeVisible();
  });

  for (const modifier of ['Meta', 'Control']) {
    test(`Control Center keeps ${modifier} search and chat shortcuts separate`, async ({
      page,
    }) => {
      await page.goto('/control-center');
      await expect(page.getByRole('button', { name: /shep chat/i })).toBeVisible();
      const chat = page.getByRole('dialog', { name: /shep chat/i });
      const search = page.getByTestId('global-search-dialog');

      await page.keyboard.press(`${modifier}+Shift+k`);
      await expect(chat).toBeVisible();
      await expect(search).not.toBeVisible();
      await page.keyboard.press('Escape');
      await expect(chat).not.toBeVisible();

      // Some platform/layout combinations report a lowercase key with Shift held.
      // Both global listeners must still agree on which shortcut owns the event.
      await page.evaluate((primary) => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'k',
            code: 'KeyK',
            shiftKey: true,
            metaKey: primary === 'Meta',
            ctrlKey: primary === 'Control',
            bubbles: true,
            cancelable: true,
          })
        );
      }, modifier);
      await expect(chat).toBeVisible();
      await expect(search).not.toBeVisible();
      await page.keyboard.press('Escape');
      await expect(chat).not.toBeVisible();

      await page.keyboard.press(`${modifier}+k`);
      await expect(search).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(search).not.toBeVisible();
      await expect(chat).not.toBeVisible();
    });
  }

  test('all project view controls fit a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/projects/${fixtures.ids.project}`);
    for (const label of [
      'List',
      'Board',
      'Table',
      'Calendar',
      'Timeline',
      'Analytics',
      'New Item',
    ]) {
      const control = page.getByRole('button', { name: label, exact: true });
      await expect(control).toBeInViewport();
      const bounds = (await control.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    }
  });

  for (const theme of ['light', 'dark']) {
    for (const surface of [
      'application',
      'repository',
      'feature',
      'project',
      'pages',
      'project-settings',
      'work-item',
      'agent-editor',
      'security-inventory',
      'control-center',
    ]) {
      test(`${surface} exposes usable controls in ${theme}`, async ({ page }) => {
        const { ids } = fixtures;
        const routes: Record<string, string> = {
          application: `/application/${ids.application}`,
          repository: `/repository/${ids.repository}`,
          feature: `/feature/${ids.feature}`,
          project: `/projects/${ids.project}`,
          pages: `/projects/${ids.project}/pages`,
          'project-settings': `/projects/${ids.project}/settings`,
          'work-item': `/projects/${ids.project}/items/${ids.item}`,
          'agent-editor': '/agents/feature-agent',
          'security-inventory': '/aspm/inventory',
          'control-center': '/control-center',
        };
        await page.addInitScript((value) => {
          localStorage.setItem('shep-theme', value);
          localStorage.setItem('shep:collaboration-onboarding-dismissed', 'true');
        }, theme);
        // ASPM is off by default (spec 133); turn it on for its surface.
        const restoreFlag =
          surface === 'security-inventory' ? await enableFeatureFlag(page, 'aspm') : null;
        try {
          await page.goto(routes[surface]);
          await expect(page.getByRole('main')).toBeVisible();
          await expect(page.getByRole('main')).not.toHaveText('');
          if (surface === 'repository')
            await expect(page.getByTestId('repository-drawer')).toBeVisible();
          if (surface === 'feature')
            await expect(page.getByTestId('feature-drawer-actions')).toBeVisible();
          if (surface === 'application') {
            await expect(page.getByText('No file open', { exact: true })).toBeVisible();
            await expect(page.getByRole('combobox', { name: 'Agent and model' })).toBeEnabled();
          }
          if (surface === 'agent-editor')
            await expect(page.getByTestId('prompt-textarea-implement.system')).toBeVisible();
          if (surface === 'security-inventory')
            await expect(page.getByText('Never', { exact: true }).first()).toBeVisible();
          if (surface === 'control-center') {
            await expect(page.getByTestId('feature-node-title').first()).toBeVisible();
            const repository = page.getByTestId('repository-node-card').filter({
              has: page
                .getByTestId('repository-node-name')
                .filter({ hasText: 'UI review standalone repository' }),
            });
            await expect(repository).toBeVisible();
            for (const name of ['Chat with agent', 'View sessions', 'New feature']) {
              const control = repository.getByRole('button', { name, exact: true });
              await expect(control).toBeVisible();
              const bounds = (await control.boundingBox())!;
              expect(
                bounds.width,
                `${name} target width after canvas scaling`
              ).toBeGreaterThanOrEqual(24);
              expect(
                bounds.height,
                `${name} target height after canvas scaling`
              ).toBeGreaterThanOrEqual(24);
            }
          }
          await expectAccessible(page);
        } finally {
          await restoreFlag?.();
        }
      });
    }
  }
});
