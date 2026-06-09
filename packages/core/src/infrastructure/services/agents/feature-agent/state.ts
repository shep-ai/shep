import { Annotation } from '@langchain/langgraph';
import type {
  ApprovalGates,
  CiFixRecord,
  Evidence,
  SecurityActionCategory,
  SecurityActionDisposition,
} from '@/domain/generated/output.js';
import { SecurityMode } from '@/domain/generated/output.js';

/**
 * State annotation for the feature-agent graph.
 *
 * Uses LangGraph's Annotation API to define state channels.
 * The `messages` channel uses a reducer to accumulate messages
 * from all nodes as the graph executes.
 */
export const FeatureAgentAnnotation = Annotation.Root({
  featureId: Annotation<string>,
  repositoryPath: Annotation<string>,
  specDir: Annotation<string>,
  worktreePath: Annotation<string>,
  currentNode: Annotation<string>,
  error: Annotation<string | null>({
    reducer: (prev, next) => (next !== undefined ? next : prev),
    default: () => null,
  }),
  approvalGates: Annotation<ApprovalGates | undefined>({
    reducer: (prev, next) => next ?? prev,
    default: () => undefined,
  }),
  model: Annotation<string | undefined>({
    reducer: (_prev, next) => next ?? _prev,
    default: () => undefined,
  }),
  messages: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  // --- Validation state channels (for validate/repair loops) ---
  validationRetries: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  lastValidationTarget: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  lastValidationErrors: Annotation<string[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  // --- Approval action channels (set by Command({update}) on resume) ---
  _approvalAction: Annotation<string | null>({
    reducer: (_prev, next) => (next !== undefined ? next : _prev),
    default: () => null,
  }),
  _rejectionFeedback: Annotation<string | null>({
    reducer: (_prev, next) => (next !== undefined ? next : _prev),
    default: () => null,
  }),
  _needsReexecution: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  // --- Merge and workflow state channels ---
  prUrl: Annotation<string | null>({
    reducer: (_prev, next) => (next !== undefined ? next : _prev),
    default: () => null,
  }),
  prNumber: Annotation<number | null>({
    reducer: (_prev, next) => (next !== undefined ? next : _prev),
    default: () => null,
  }),
  commitHash: Annotation<string | null>({
    reducer: (_prev, next) => (next !== undefined ? next : _prev),
    default: () => null,
  }),
  ciStatus: Annotation<string | null>({
    reducer: (_prev, next) => (next !== undefined ? next : _prev),
    default: () => null,
  }),
  push: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  openPr: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  forkAndPr: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  commitSpecs: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => true,
  }),
  ciWatchEnabled: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => true,
  }),
  enableEvidence: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  commitEvidence: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  // --- Evidence state ---
  evidence: Annotation<Evidence[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  evidenceRetries: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  // --- Resume context (set when resuming from error/crash/stop) ---
  resumeReason: Annotation<string | undefined>({
    reducer: (_prev, next) => next ?? _prev,
    default: () => undefined,
  }),
  // --- CI watch/fix loop state ---
  ciFixAttempts: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  ciFixHistory: Annotation<CiFixRecord[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  ciFixStatus: Annotation<'idle' | 'watching' | 'fixing' | 'success' | 'exhausted' | 'timeout'>({
    reducer: (_prev, next) => next,
    default: () => 'idle',
  }),
  // --- Security policy state (set once at spawn, read by nodes) ---
  securityMode: Annotation<SecurityMode>({
    reducer: (_prev, next) => next,
    default: () => SecurityMode.Disabled,
  }),
  securityActionDispositions: Annotation<
    Partial<Record<SecurityActionCategory, SecurityActionDisposition>>
  >({
    reducer: (_prev, next) => next,
    default: () => ({}),
  }),
});

export type FeatureAgentState = typeof FeatureAgentAnnotation.State;
