/**
 * Control center windows (spec 146): which active features still need a
 * window, what each window is called, and which names changed.
 *
 * Windows are opened by OpenControlCenterUseCase and renamed by
 * UpdateMultiplexerStatusUseCase; this remembers what the console opened and
 * decides when to ask.
 */

import type { TFunction } from 'i18next';
import { FeaturePaneOutcome } from '@/domain/generated/output.js';
import { isActiveFeatureState } from '@/domain/shared/feature-state.js';
import type {
  FeatureConsoleActionResult,
  FeatureConsoleRow,
  FeatureConsoleSnapshot,
} from '@/application/use-cases/feature-console/feature-console.types.js';
import type { OpenControlCenterResult } from '@/application/use-cases/feature-console/open-control-center.use-case.js';
import type {
  UpdateMultiplexerStatusInput,
  UpdateMultiplexerStatusResult,
} from '@/application/use-cases/feature-console/update-multiplexer-status.use-case.js';
import { ELLIPSIS } from './console-format.js';
import { styleOf } from './console-labels.js';
import { tmuxStatusOptions } from './status-segment.js';

/** Window names stay short enough for a tmux status bar's window list. */
const MAX_NAME_LENGTH = 30;

export function featureWindowTitle(row: FeatureConsoleRow): string {
  const name =
    row.name.length > MAX_NAME_LENGTH
      ? `${row.name.slice(0, MAX_NAME_LENGTH - 1)}${ELLIPSIS}`
      : row.name;
  return `${styleOf(row).symbol} ${name}`;
}

interface TrackedWindow {
  /** Absent where the multiplexer prints no id (Zellij): never renamed. */
  windowId?: string;
  title: string;
}

export class ControlCenterWindows {
  private readonly byFeature = new Map<string, TrackedWindow>();

  get size(): number {
    return this.byFeature.size;
  }

  /** Active features with a run and no window yet, with the name each window gets. */
  candidates(rows: readonly FeatureConsoleRow[]): { featureId: string; title: string }[] {
    return rows
      .filter((r) => isActiveFeatureState(r.state) && r.runId && !this.byFeature.has(r.featureId))
      .map((r) => ({ featureId: r.featureId, title: featureWindowTitle(r) }));
  }

  track(
    windows: readonly { featureId: string; windowId?: string }[],
    rows: readonly FeatureConsoleRow[]
  ): void {
    for (const { featureId, windowId } of windows) {
      const row = rows.find((r) => r.featureId === featureId);
      this.byFeature.set(featureId, {
        ...(windowId && { windowId }),
        title: row ? featureWindowTitle(row) : '',
      });
    }
  }

  /** Windows whose feature changed state since the last call, with their new names. */
  renames(rows: readonly FeatureConsoleRow[]): { windowId: string; title: string }[] {
    const changed: { windowId: string; title: string }[] = [];
    for (const row of rows) {
      const tracked = this.byFeature.get(row.featureId);
      if (!tracked?.windowId) continue;
      const title = featureWindowTitle(row);
      if (title === tracked.title) continue;
      tracked.title = title;
      changed.push({ windowId: tracked.windowId, title });
    }
    return changed;
  }

  /** Stop tracking windows the multiplexer no longer has. */
  forget(windowIds: readonly string[]): void {
    for (const [featureId, tracked] of this.byFeature) {
      if (tracked.windowId && windowIds.includes(tracked.windowId))
        this.byFeature.delete(featureId);
    }
  }
}

export interface ControlCenterDeps {
  t: TFunction;
  openControlCenter: (
    features: { featureId: string; title: string }[]
  ) => Promise<OpenControlCenterResult>;
  updateMultiplexer: (
    input: UpdateMultiplexerStatusInput
  ) => Promise<UpdateMultiplexerStatusResult>;
}

/**
 * Drives the multiplexer from the console: opens windows on request, and on
 * every snapshot renames windows whose feature changed and republishes the
 * status segment when it changed.
 */
export class ControlCenter {
  private readonly windows = new ControlCenterWindows();
  private publishedStatus: string | undefined;

  constructor(private readonly deps: ControlCenterDeps) {}

  async open(rows: readonly FeatureConsoleRow[]): Promise<FeatureConsoleActionResult> {
    const candidates = this.windows.candidates(rows);
    if (candidates.length === 0) {
      return { ok: false, message: this.deps.t('tui:console.controlCenter.none') };
    }
    const result = await this.deps.openControlCenter(candidates);
    this.windows.track(result.windows, rows);
    return { ok: result.outcome === FeaturePaneOutcome.Opened, message: result.message };
  }

  async sync(snapshot: FeatureConsoleSnapshot): Promise<void> {
    const renames = this.windows.renames(snapshot.rows);
    const options = tmuxStatusOptions(snapshot.summary, this.deps.t);
    const status = JSON.stringify(options);
    const statusChanged = status !== this.publishedStatus;
    if (renames.length === 0 && !statusChanged) return;
    this.publishedStatus = status;
    const { goneWindowIds } = await this.deps.updateMultiplexer({
      renames,
      ...(statusChanged && { status: options }),
    });
    this.windows.forget(goneWindowIds);
  }
}
