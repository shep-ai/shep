/**
 * What a surface needs to show and steer a feature's agent chat (spec 147).
 * Produced by GetFeatureChatUseCase; presentation only formats it.
 */

import type { FeatureChatEntryKind } from '../../../domain/generated/output.js';

export interface FeatureChatEntry {
  id: string;
  kind: FeatureChatEntryKind;
  /** Display text: tool rows as "Label detail", blocks by title, answers as "question → answer". */
  text: string;
  createdAt: Date;
}

export interface FeatureChatQuestion {
  header: string;
  question: string;
  options: { label: string; description?: string }[];
  multiSelect: boolean;
}

export interface FeatureChat {
  featureId: string;
  name: string;
  /** Where the chat agent runs: the worktree, or the repository before one exists. */
  directory: string;
  /** False when nothing can be sent; `unavailableReason` says why. */
  available: boolean;
  unavailableReason?: string;
  /** The session's status (booting, ready, stopped, error), if a session exists. */
  sessionStatus?: string;
  /** The agent is booting or working on a turn. */
  busy: boolean;
  /** Text the agent is writing right now (only for sessions this process runs). */
  streamingText?: string;
  /** Oldest first, newest last; at most the number asked for. */
  entries: FeatureChatEntry[];
  /** The agent's open question(s), empty when it is not waiting on one. */
  questions: FeatureChatQuestion[];
}

/** Outcome of sending or answering, ready for a status line. */
export interface FeatureChatResult {
  ok: boolean;
  message: string;
}
