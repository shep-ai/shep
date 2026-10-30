/**
 * What the feature console view asks of the app, and what it is built with
 * (specs 142, 143, 145, 146, 147, 150). Every intent is carried out through a use case.
 */

import type { TFunction } from 'i18next';
import type {
  FeatureConsoleAction,
  FeaturePaneContent,
  FeaturePanePlacement,
} from '@/domain/generated/output.js';
import type { FeatureConsoleRow } from '@/application/use-cases/feature-console/feature-console.types.js';
import type { ConsoleExplore, ConsoleNewFeature } from './console-create.js';
import type { HarnessAnswer, HarnessDecisionItem } from './harness-decisions.js';

/** What the view asks the app to do. */
export interface FeatureConsoleIntents {
  runAction(row: FeatureConsoleRow, action: FeatureConsoleAction, feedback?: string): void;
  /** Load (and keep refreshing) the log of this feature; undefined stops it. */
  showLog(row: FeatureConsoleRow | undefined): void;
  /** Release the paused admission queue (spec 148); only offered while paused. */
  releaseQueue(): void;
  /** Open a shell or the followed log of this feature in a terminal pane. */
  openPane(
    row: FeatureConsoleRow,
    content: FeaturePaneContent,
    placement: FeaturePanePlacement
  ): void;
  /** Put the feature's full id on the clipboard. */
  copyId(row: FeatureConsoleRow): void;
  /** Open a multiplexer window for every active feature that has none (spec 146). */
  openControlCenter(): void;
  /** Attach to this feature's agent chat and keep it fresh until closeChat (spec 147). */
  openChat(row: FeatureConsoleRow): void;
  closeChat(): void;
  sendChat(row: FeatureConsoleRow, text: string): void;
  /** Answers to the chat agent's question(s), keyed by question text. */
  answerChat(row: FeatureConsoleRow, answers: Record<string, string>): void;
  /** Adopt or reject a learned-harness change through the inbox (spec 150). */
  answerHarnessDecision(item: HarnessDecisionItem, answer: HarnessAnswer): void;
  /** Create a feature, with this feature's Explore choice (spec 150). */
  createFeature(input: ConsoleNewFeature): void;
  quit(): void;
  requestRender(): void;
}

export interface FeatureConsoleViewDeps {
  t: TFunction;
  /** Terminal height; the view always renders exactly this many lines. */
  rows: () => number;
  intents: FeatureConsoleIntents;
  /** The console can list and answer learned-harness changes (spec 150). */
  harnessDecisions?: boolean;
  /** The console can create features (spec 150). */
  newFeature?: boolean;
  /** Present only while the selfLearning flag is on: the create form offers Explore. */
  explore?: ConsoleExplore;
}
