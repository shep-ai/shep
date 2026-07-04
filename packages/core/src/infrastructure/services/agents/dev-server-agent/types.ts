import type { DevServerAgentState } from './state.js';

/**
 * A node's result: a partial state update merged into the graph state via
 * each channel's reducer (`capturedLogs` appends, everything else
 * last-write-wins — see {@link DevServerAgentAnnotation}).
 */
export type DevServerAgentNodeResult = Partial<DevServerAgentState>;

/**
 * A dev-server agent graph node: consumes the current state and returns a
 * partial state update. The real node factories (analyze, ensure-infra,
 * install-deps, start-server, verify, remediate) each produce one of these.
 */
export type DevServerAgentNodeFn = (
  state: DevServerAgentState
) => Promise<DevServerAgentNodeResult>;

/**
 * The six nodes wired into the dev-server agent graph, keyed by role.
 * Built by the node factories and composed by the service layer — the graph
 * itself stays agnostic of node internals so it can be tested with stubs.
 */
export interface DevServerAgentGraphNodes {
  /** Resolve a run plan: cache → deterministic detection → structured agent. */
  analyze: DevServerAgentNodeFn;
  /** Probe required binaries; attempt user-space remediation on miss. */
  ensureInfra: DevServerAgentNodeFn;
  /** Staleness-aware, log-streamed dependency installation. */
  installDeps: DevServerAgentNodeFn;
  /** Spawn the dev server via DeploymentService with the run-plan override. */
  startServer: DevServerAgentNodeFn;
  /** Wait bounded for Ready; write resultUrl on success, failureReason on timeout. */
  verify: DevServerAgentNodeFn;
  /** Agent-driven fix of the last failure; clears failureReason, increments attempts. */
  remediate: DevServerAgentNodeFn;
}

/** Dependencies required to build the dev-server agent graph. */
export interface DevServerAgentGraphDeps {
  nodes: DevServerAgentGraphNodes;
}
