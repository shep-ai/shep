/**
 * Runtime controller (output port) — spec 129: reads and acts on the
 * workload an incident concerns. The kubectl adapter handles Kubernetes
 * deployments; other runtimes plug in as further adapters.
 */

export interface RuntimeTarget {
  /** Kubernetes context; the current context when unset. */
  context?: string;
  namespace: string;
  /** Deployment name. */
  workload: string;
}

/** What the workload shows; each part holds its error text when it could not be read. */
export interface RuntimeEvidence {
  status: string;
  events: string;
  logs: string;
}

export interface RecoveryCheck {
  recovered: boolean;
  detail: string;
}

export interface IRuntimeController {
  evidence(target: RuntimeTarget): Promise<RuntimeEvidence>;
  /** Each action resolves to the command's output and rejects with its error. */
  restart(target: RuntimeTarget): Promise<string>;
  rollback(target: RuntimeTarget): Promise<string>;
  scale(target: RuntimeTarget, replicas: number): Promise<string>;
  /** Waits up to `timeoutSeconds` for the rollout to be ready. */
  verify(target: RuntimeTarget, timeoutSeconds: number): Promise<RecoveryCheck>;
}
