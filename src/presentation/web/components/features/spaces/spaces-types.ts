/** What every Spaces server action resolves to (a SpaceResult, or a caught error). */
export interface SpaceActionOutcome {
  ok: boolean;
  error?: string;
}

/**
 * Runs one server action for a Spaces component: shows its error, or refreshes
 * the page so the overview re-reads the server. Resolves true on success.
 */
export type RunSpaceAction = (action: () => Promise<SpaceActionOutcome>) => Promise<boolean>;

/** Shared look for the native selects on the Spaces page. */
export const SPACE_SELECT_CLASS =
  'border-input bg-background h-8 rounded-md border px-2 text-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none';
