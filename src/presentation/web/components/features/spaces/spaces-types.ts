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
