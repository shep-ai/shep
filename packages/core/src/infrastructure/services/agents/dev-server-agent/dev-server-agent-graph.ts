/**
 * Dev-server agent LangGraph workflow.
 *
 * Wires the six dev-server nodes into a bounded-remediation flow:
 *
 *   START → analyze → ensure_infra → install_deps → start_server → verify → END
 *                          ▲                │                         │
 *                          └── remediate ◄──┴─────────────────────────┘
 *
 * - `analyze` / `ensure_infra` failures are terminal (routed straight to
 *   END with `failureReason` set).
 * - `install_deps` and `verify` failures route to `remediate` while
 *   attempts remain ({@link MAX_REMEDIATION_ATTEMPTS}); `remediate` clears
 *   `failureReason`, increments `remediationAttempts`, and loops back to
 *   `ensure_infra`. Exhaustion terminates with the last `failureReason`.
 *
 * The nodes themselves are injected via {@link DevServerAgentGraphDeps} —
 * the graph stays testable with stubs and agnostic of node internals.
 * All addNode/addEdge/addConditionalEdges calls stay in ONE fluent chain
 * so LangGraph's node-name typing holds (see LESSONS.md).
 */

import { StateGraph, START, END, type BaseCheckpointSaver } from '@langchain/langgraph';
import { DevServerAgentAnnotation, type DevServerAgentState } from './state.js';
import type { DevServerAgentGraphDeps } from './types.js';

/** Maximum remediation attempts before the run terminates with a failure. */
export const MAX_REMEDIATION_ATTEMPTS = 2;

/** Canonical node names — the only place the routing strings are defined. */
export const DevServerAgentNodeName = {
  Analyze: 'analyze',
  EnsureInfra: 'ensure_infra',
  InstallDeps: 'install_deps',
  StartServer: 'start_server',
  Verify: 'verify',
  Remediate: 'remediate',
} as const;

export type DevServerAgentNodeName =
  (typeof DevServerAgentNodeName)[keyof typeof DevServerAgentNodeName];

/** True while bounded remediation still has attempts left. */
function hasRemediationBudget(state: DevServerAgentState): boolean {
  return state.remediationAttempts < MAX_REMEDIATION_ATTEMPTS;
}

/** analyze → ensure_infra on success; terminal END when analysis failed. */
export function routeAfterAnalyze(
  state: DevServerAgentState
): typeof DevServerAgentNodeName.EnsureInfra | typeof END {
  return state.failureReason !== null ? END : DevServerAgentNodeName.EnsureInfra;
}

/** ensure_infra → install_deps on success; terminal END when infra failed. */
export function routeAfterEnsureInfra(
  state: DevServerAgentState
): typeof DevServerAgentNodeName.InstallDeps | typeof END {
  return state.failureReason !== null ? END : DevServerAgentNodeName.InstallDeps;
}

/**
 * install_deps → start_server on success; on failure → remediate while
 * attempts remain, otherwise terminal END.
 */
export function routeAfterInstallDeps(
  state: DevServerAgentState
):
  | typeof DevServerAgentNodeName.StartServer
  | typeof DevServerAgentNodeName.Remediate
  | typeof END {
  if (state.failureReason === null) {
    return DevServerAgentNodeName.StartServer;
  }
  return hasRemediationBudget(state) ? DevServerAgentNodeName.Remediate : END;
}

/**
 * verify → END on success (resultUrl set); on failure → remediate while
 * attempts remain, otherwise terminal END (verify sets failureReason).
 */
export function routeAfterVerify(
  state: DevServerAgentState
): typeof DevServerAgentNodeName.Remediate | typeof END {
  if (state.resultUrl !== null) {
    return END;
  }
  return hasRemediationBudget(state) ? DevServerAgentNodeName.Remediate : END;
}

/**
 * Compile the dev-server agent graph from injected nodes, with an optional
 * checkpointer for resume-across-restarts (invoke with a `thread_id` when
 * a checkpointer is supplied).
 */
export function createDevServerAgentGraph(
  deps: DevServerAgentGraphDeps,
  checkpointer?: BaseCheckpointSaver
) {
  return new StateGraph(DevServerAgentAnnotation)
    .addNode(DevServerAgentNodeName.Analyze, deps.nodes.analyze)
    .addNode(DevServerAgentNodeName.EnsureInfra, deps.nodes.ensureInfra)
    .addNode(DevServerAgentNodeName.InstallDeps, deps.nodes.installDeps)
    .addNode(DevServerAgentNodeName.StartServer, deps.nodes.startServer)
    .addNode(DevServerAgentNodeName.Verify, deps.nodes.verify)
    .addNode(DevServerAgentNodeName.Remediate, deps.nodes.remediate)
    .addEdge(START, DevServerAgentNodeName.Analyze)
    .addConditionalEdges(DevServerAgentNodeName.Analyze, routeAfterAnalyze, [
      DevServerAgentNodeName.EnsureInfra,
      END,
    ])
    .addConditionalEdges(DevServerAgentNodeName.EnsureInfra, routeAfterEnsureInfra, [
      DevServerAgentNodeName.InstallDeps,
      END,
    ])
    .addConditionalEdges(DevServerAgentNodeName.InstallDeps, routeAfterInstallDeps, [
      DevServerAgentNodeName.StartServer,
      DevServerAgentNodeName.Remediate,
      END,
    ])
    .addEdge(DevServerAgentNodeName.StartServer, DevServerAgentNodeName.Verify)
    .addConditionalEdges(DevServerAgentNodeName.Verify, routeAfterVerify, [
      DevServerAgentNodeName.Remediate,
      END,
    ])
    .addEdge(DevServerAgentNodeName.Remediate, DevServerAgentNodeName.EnsureInfra)
    .compile({ checkpointer });
}
