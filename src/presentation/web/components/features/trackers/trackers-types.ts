/** What every Connections server action resolves to. */
export interface TrackerActionOutcome {
  ok: boolean;
  error?: string;
}

/**
 * Runs one server action for a Connections component: shows its error, or
 * refreshes the page so the overview is re-read. Resolves true on success.
 */
export type RunTrackerAction = (action: () => Promise<TrackerActionOutcome>) => Promise<boolean>;
