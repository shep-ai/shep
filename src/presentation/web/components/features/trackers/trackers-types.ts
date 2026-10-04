/**
 * What a Connections server action resolves to, and how a Connections
 * component runs one: shared with every page built on `useRunAction`.
 */
export type {
  ActionResult as TrackerActionOutcome,
  RunAction as RunTrackerAction,
} from '@/hooks/use-run-action';
