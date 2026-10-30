/**
 * What the console tells the world after each snapshot (specs 142, 149): an
 * alert for every feature that started needing the user, the window title's
 * count, and the overall activity for the terminal host.
 */

import type { TFunction } from 'i18next';
import { AgentActivityState } from '@/domain/generated/output.js';
import type { FeatureConsoleSnapshot } from '@/application/use-cases/feature-console/feature-console.types.js';

export interface ConsoleAttentionDeps {
  t: TFunction;
  setTitle: (title: string) => void;
  /** Alert the user (bell, terminal notification); undefined turns alerts off. */
  notify?: (message: string) => void;
  /** Tell the terminal host this console runs in what shep is doing (spec 149). */
  reportActivity?: (report: { state: AgentActivityState; message?: string }) => void;
}

export class ConsoleAttention {
  /** Features needing the user at the last snapshot; undefined before the first. */
  private needingUser: Set<string> | undefined;
  private title: string | undefined;

  constructor(private readonly deps: ConsoleAttentionDeps) {}

  /** `canRetitle` is false while an inline command owns the terminal. */
  observe(snapshot: FeatureConsoleSnapshot, canRetitle: boolean): void {
    this.noticeAttention(snapshot, canRetitle);
    this.reportActivity(snapshot);
  }

  /** Alert for features that started needing the user; keep the title's count current. */
  private noticeAttention(snapshot: FeatureConsoleSnapshot, canRetitle: boolean): void {
    const { t } = this.deps;
    const needing = snapshot.rows.filter((r) => r.needsAttention);
    const before = this.needingUser;
    const newly = needing.filter((r) => before && !before.has(r.featureId));
    this.needingUser = new Set(needing.map((r) => r.featureId));
    for (const row of newly) this.deps.notify?.(t('tui:console.notify.body', { name: row.name }));

    const next =
      needing.length > 0
        ? t('tui:console.windowTitle.attention', { count: needing.length })
        : t('tui:console.windowTitle.idle');
    if (next !== this.title && canRetitle) {
      this.title = next;
      this.deps.setTitle(next);
    }
  }

  /** The overall activity, and how many features wait on the user when any do. */
  private reportActivity(snapshot: FeatureConsoleSnapshot): void {
    const { activity: state, needsAttention } = snapshot.summary;
    try {
      this.deps.reportActivity?.(
        state === AgentActivityState.Blocked
          ? {
              state,
              message: this.deps.t('tui:console.hostStatus.blocked', { count: needsAttention }),
            }
          : { state }
      );
    } catch {
      // A host that cannot be told shows less; the console carries on.
    }
  }
}
