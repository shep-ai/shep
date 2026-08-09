import { Annotation } from '@langchain/langgraph';
import type { DevServerRunPlan, DeploymentTargetType } from '@/domain/generated/output.js';

/**
 * State annotation for the dev-server agent graph.
 *
 * Channel semantics:
 * - `targetId` / `targetType` / `targetPath` — required inputs supplied at
 *   invoke time (bare channels, set once).
 * - `capturedLogs` — accumulator: every node update is APPENDED so the full
 *   log trail survives the whole run (and checkpoint restores).
 * - Every other channel is last-write-wins: a node's defined update replaces
 *   the previous value; `undefined` (channel omitted from the node's partial
 *   result) keeps the previous value.
 */
export const DevServerAgentAnnotation = Annotation.Root({
  /** Deployment target id (application/feature/repository id). */
  targetId: Annotation<string>,
  /** Deployment target type (Application | Feature | Repository). */
  targetType: Annotation<DeploymentTargetType>,
  /** Absolute path of the repository/worktree to start the server in. */
  targetPath: Annotation<string>,
  /** Resolved run plan (cache hit, deterministic detection, or agent analysis). */
  runPlan: Annotation<DevServerRunPlan | null>({
    reducer: (prev, next) => (next !== undefined ? next : prev),
    default: () => null,
  }),
  /** True once required binaries (runtime, package manager) are confirmed present. */
  infraReady: Annotation<boolean>({
    reducer: (prev, next) => next ?? prev,
    default: () => false,
  }),
  /** True once dependencies are installed (or confirmed fresh). */
  depsInstalled: Annotation<boolean>({
    reducer: (prev, next) => next ?? prev,
    default: () => false,
  }),
  /** URL the verified dev server is reachable at (terminal success signal). */
  resultUrl: Annotation<string | null>({
    reducer: (prev, next) => (next !== undefined ? next : prev),
    default: () => null,
  }),
  /** Human-readable failure reason (terminal failure signal; cleared by remediate). */
  failureReason: Annotation<string | null>({
    reducer: (prev, next) => (next !== undefined ? next : prev),
    default: () => null,
  }),
  /** Remediation attempts consumed so far (remediate node writes the incremented value). */
  remediationAttempts: Annotation<number>({
    reducer: (prev, next) => next ?? prev,
    default: () => 0,
  }),
  /** Tail of the most recent failed command's output (replaced per failure). */
  lastErrorTail: Annotation<string[]>({
    reducer: (prev, next) => next ?? prev,
    default: () => [],
  }),
  /** Full log trail across all nodes (append-only accumulator). */
  capturedLogs: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  /** True when no agent executor is available (deterministic-only degradation). */
  degraded: Annotation<boolean>({
    reducer: (prev, next) => next ?? prev,
    default: () => false,
  }),
});

export type DevServerAgentState = typeof DevServerAgentAnnotation.State;
