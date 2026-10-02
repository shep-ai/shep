/**
 * Skip link (WCAG 2.4.1 Bypass Blocks).
 *
 * The shell had no skip link anywhere, so a keyboard or screen-reader user
 * tabbed through the whole sidebar nav on every page before reaching the
 * content. The `<main>` target already existed — only the link was missing.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/control-center',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/hooks/use-turn-statuses', () => ({
  useTurnStatus: () => 'idle',
  useTurnStatusSync: vi.fn(),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

import { AppShell } from '@/components/layouts/app-shell';
import { FeatureFlagsProvider } from '@/hooks/feature-flags-context';

const defaultFlags = {
  envDeploy: false,
  debug: false,
  reactFileManager: false,
  projects: false,
  codeReview: false,
  collaboration: false,
  bedrockIntegration: false,
  whatsappDispatch: false,
  aspm: false,
  clusters: false,
  scheduledWorkflows: false,
  githubImport: true,
  queryAwareHarness: false,
};

function renderShell() {
  return render(
    <FeatureFlagsProvider flags={defaultFlags}>
      <AppShell>
        <div>Test content</div>
      </AppShell>
    </FeatureFlagsProvider>
  );
}

describe('AppShell skip link', () => {
  it('exposes exactly one main landmark as the skip-link target', () => {
    renderShell();

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('is the first tabbable element in the shell', async () => {
    renderShell();

    await userEvent.tab();

    const skipLink = screen.getByTestId('skip-to-main');
    expect(document.activeElement).toBe(skipLink);
  });

  it('points at the <main> element, which can receive focus', () => {
    const { container } = renderShell();

    const skipLink = screen.getByTestId('skip-to-main');
    const href = skipLink.getAttribute('href');
    expect(href).toBe('#main-content');

    // NB: `SidebarInset` (components/ui/sidebar.tsx) is itself a <main>, so
    // query the target by id rather than by tag.
    const main = container.querySelector('#main-content');
    expect(main).not.toBeNull();
    expect(main?.tagName).toBe('MAIN');
    // Without a negative tabindex the browser moves the scroll position but
    // leaves focus where it was, so the next Tab returns to the sidebar.
    expect(main?.getAttribute('tabindex')).toBe('-1');
  });

  it('is hidden until it is focused', () => {
    renderShell();

    const skipLink = screen.getByTestId('skip-to-main');
    expect(skipLink.className).toContain('sr-only');
    expect(skipLink.className).toContain('focus:not-sr-only');
  });
});
