/**
 * Console render helpers: fleet banner, key bar and help (spec 148).
 *
 * The banner is the console's one line about the fleet itself: a parked
 * admission queue, or a tripped breaker whose queue is still draining. It is
 * pure formatting of a decided snapshot — no clock reads, no use cases.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { TFunction } from 'i18next';
import { visibleWidth } from '@mariozechner/pi-tui';

import { initI18n } from '@/presentation/tui/i18n.js';
import { renderBanner } from '@/presentation/tui/feature-console/console-render.js';
import { renderHelp, renderKeyBar } from '@/presentation/tui/feature-console/console-panes.js';
import { fit } from '@/presentation/tui/feature-console/console-format.js';
import { AgentActivityState, AgentType } from '@/domain/generated/output.js';
import { consoleRow, consoleSummary } from '@tests/helpers/feature-console-fixtures.js';
import type {
  FeatureConsoleFleet,
  FeatureConsoleRow,
  FeatureConsoleSnapshot,
} from '@/application/use-cases/feature-console/feature-console.types.js';

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b_[^\x07]*\x07|\x1b\][^\x07]*\x07/g;
const plain = (line: string | undefined) => (line ?? '').replace(ANSI, '');

const NOW = new Date('2026-10-24T12:00:00Z');

const healthy: FeatureConsoleFleet = { circuitBreakerTripped: false };

const paused: FeatureConsoleFleet = {
  queuePause: {
    pausedAt: new Date('2026-10-24T09:55:00Z'),
    reason: 'Consecutive failure threshold reached (4/4 runs failed in the last 15m)',
  },
  circuitBreakerTripped: true,
  circuitBreakerReason: 'Consecutive failure threshold reached (4/4)',
};

const trippedOnly: FeatureConsoleFleet = {
  circuitBreakerTripped: true,
  circuitBreakerReason: 'Failure rate threshold exceeded (40% > 25%)',
};

const row: FeatureConsoleRow = consoleRow({
  featureId: 'aaaa1111-0000-0000',
  shortId: 'aaaa1111',
  name: 'Feature aaaa1111',
  repositoryName: 'acme-web',
  repositoryPath: '/work/acme-web',
  branch: 'feat/aaaa1111',
  agentType: AgentType.ClaudeCode,
  elapsedMs: 60_000,
  updatedAt: NOW,
});

/** A one-row snapshot carrying the fleet verdict under test. */
function snapshotOf(fleet: FeatureConsoleFleet): FeatureConsoleSnapshot {
  return {
    generatedAt: NOW,
    rows: [row],
    summary: consoleSummary({
      total: 1,
      running: 1,
      activity: AgentActivityState.Working,
    }),
    fleet,
  };
}

describe('renderBanner', () => {
  let t: TFunction;

  beforeAll(async () => {
    t = (await initI18n('en')).t;
  });

  it('renders nothing when the queue is draining and the breaker is quiet', () => {
    expect(renderBanner(snapshotOf(healthy), t)).toBeUndefined();
  });

  it('names the pause, its age and its reason', () => {
    const banner = plain(renderBanner(snapshotOf(paused), t));

    expect(banner).toContain('queue paused');
    // 09:55 to 12:00 is 2h 05m, from the snapshot's clock.
    expect(banner).toContain('2h 05m');
    expect(banner).toContain('Consecutive failure threshold reached (4/4 runs failed');
  });

  it('reports a trip with no pause and says nothing about releasing', () => {
    const banner = plain(renderBanner(snapshotOf(trippedOnly), t));

    expect(banner).toContain('breaker tripped');
    expect(banner).toContain('Failure rate threshold exceeded');
    expect(banner).not.toContain('release');
  });

  it('keeps the banner to one sanitised line', () => {
    const banner = plain(
      renderBanner(
        snapshotOf({
          queuePause: {
            pausedAt: NOW,
            reason: 'multi\nline\x1b[2J reason\twith tabs',
          },
          circuitBreakerTripped: true,
        }),
        t
      )
    );

    expect(banner).not.toContain('\n');
    expect(banner).not.toContain('\x1b');
    expect(banner).not.toContain('\t');
  });

  it('fits the banner into the width like any other line', () => {
    const banner = renderBanner(snapshotOf(paused), t) as string;
    const fitted = fit(banner, 40);
    expect(visibleWidth(fitted)).toBeLessThanOrEqual(40);
  });
});

describe('renderKeyBar', () => {
  let t: TFunction;

  beforeAll(async () => {
    t = (await initI18n('en')).t;
  });

  it('offers the release key only while the queue is paused', () => {
    const running = plain(renderKeyBar(row, t));
    const pausedBar = plain(renderKeyBar(row, t, true));

    expect(running).not.toContain('release queue');
    expect(pausedBar).toContain('release queue');
  });

  it('keeps the row actions it already offered', () => {
    const bar = plain(renderKeyBar(row, t, true));
    expect(bar).toContain('stop');
  });
});

describe('renderHelp', () => {
  let t: TFunction;

  beforeAll(async () => {
    t = (await initI18n('en')).t;
  });

  it('lists the release key', () => {
    const help = plain(renderHelp(t).join('\n'));
    expect(help).toContain('u');
    expect(help).toContain('paused queue');
  });
});
