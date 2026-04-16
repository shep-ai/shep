import { Annotation } from '@langchain/langgraph';

/**
 * State annotation for the cluster-agent graph.
 *
 * Uses LangGraph's Annotation API to define state channels.
 * The `completedPhases` and `messages` channels use accumulator reducers
 * that append new items on each node execution.
 *
 * Follows the FeatureAgentAnnotation pattern from feature-agent/state.ts.
 */
export const ClusterAgentAnnotation = Annotation.Root({
  /** The cluster entity ID being provisioned. */
  clusterId: Annotation<string>,

  /** The k3d cluster name (derived from cluster slug). */
  clusterName: Annotation<string>,

  /** Current provisioning status label (for logging/tracking). */
  status: Annotation<string>,

  /** Path to the extracted kubeconfig file, set by configure-kubectl node. */
  kubeconfigPath: Annotation<string | null>({
    reducer: (_prev, next) => (next !== undefined ? next : _prev),
    default: () => null,
  }),

  /** Whether ArgoCD should be installed during provisioning. */
  argoCdEnabled: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),

  /** Kubernetes namespace for ArgoCD installation. */
  argoCdNamespace: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => 'argocd',
  }),

  /** Name of the currently executing graph node. */
  currentNode: Annotation<string>,

  /** Error message if the current or any previous node failed. */
  error: Annotation<string | null>({
    reducer: (prev, next) => (next !== undefined ? next : prev),
    default: () => null,
  }),

  /** Accumulator of completed phase names — append only, never replace. */
  completedPhases: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  /** Accumulator of log messages from all nodes. */
  messages: Annotation<string[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
});

export type ClusterAgentState = typeof ClusterAgentAnnotation.State;
