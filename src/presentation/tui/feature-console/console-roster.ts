/**
 * Feature console roster (specs 142, 143): the rows the filter lets through,
 * which one is selected, and which slice of them is on screen.
 *
 * Selection follows the feature, not the position, so a refresh that reorders
 * rows keeps the same feature selected.
 */

import type { TFunction } from 'i18next';
import { filterConsoleRows } from '@/application/use-cases/feature-console/filter-console-rows.js';
import type { FeatureConsoleRow } from '@/application/use-cases/feature-console/feature-console.types.js';
import { paint } from './console-format.js';
import { NS } from './console-labels.js';
import { padTo } from './console-layout.js';
import { renderRosterHeader, renderRosterRow, rosterLayout } from './console-render.js';

export class ConsoleRoster {
  private all: readonly FeatureConsoleRow[] = [];
  private visible: readonly FeatureConsoleRow[] = [];
  private selectedId: string | undefined;
  private scrollOffset = 0;
  private filter = '';

  /** Every row of the last snapshot, filter or not (the strip shows them all). */
  get allRows(): readonly FeatureConsoleRow[] {
    return this.all;
  }

  /** The rows the filter lets through. */
  get rows(): readonly FeatureConsoleRow[] {
    return this.visible;
  }

  get query(): string {
    return this.filter;
  }

  get selected(): FeatureConsoleRow | undefined {
    return this.visible.find((r) => r.featureId === this.selectedId);
  }

  setRows(rows: readonly FeatureConsoleRow[]): void {
    this.all = rows;
    this.applyFilter();
  }

  setQuery(query: string): void {
    this.filter = query;
    this.applyFilter();
  }

  /** Move the selection; true when a different feature is now selected. */
  move(delta: number): boolean {
    if (this.visible.length === 0) return false;
    const current = Math.max(0, this.indexOfSelected());
    const next = Math.min(this.visible.length - 1, Math.max(0, current + delta));
    if (this.visible[next].featureId === this.selectedId) return false;
    this.selectedId = this.visible[next].featureId;
    return true;
  }

  render(width: number, height: number, t: TFunction): string[] {
    const layout = rosterLayout(width);
    const header = renderRosterHeader(layout, t);
    if (this.visible.length === 0) {
      return padTo(
        [header, paint.muted(` ${t(`${NS}.filter.noMatch`, { query: this.filter.trim() })}`)],
        height
      );
    }
    const capacity = Math.max(1, height - 1);
    const index = Math.max(0, this.indexOfSelected());
    if (index < this.scrollOffset) this.scrollOffset = index;
    if (index >= this.scrollOffset + capacity) this.scrollOffset = index - capacity + 1;
    this.scrollOffset = Math.min(this.scrollOffset, Math.max(0, this.visible.length - capacity));

    const shown = this.visible.slice(this.scrollOffset, this.scrollOffset + capacity);
    return padTo(
      [header, ...shown.map((r) => renderRosterRow(r, layout, t, r.featureId === this.selectedId))],
      height
    );
  }

  private applyFilter(): void {
    this.visible = filterConsoleRows(this.all, this.filter);
    if (!this.visible.some((r) => r.featureId === this.selectedId)) {
      this.selectedId = this.visible[0]?.featureId;
    }
  }

  private indexOfSelected(): number {
    return this.visible.findIndex((r) => r.featureId === this.selectedId);
  }
}
