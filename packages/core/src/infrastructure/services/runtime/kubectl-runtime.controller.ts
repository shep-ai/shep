/**
 * Kubectl runtime controller (spec 129): incident evidence and actions on a
 * Kubernetes deployment through the kubectl CLI, in the user's kubeconfig and
 * the target's context and namespace.
 *
 * - evidence: `get deployment -o wide`, recent namespace events, logs tail
 * - restart: `rollout restart`; rollback: `rollout undo`; scale: `scale --replicas`
 * - verify: `rollout status --timeout`
 */

import type {
  IRuntimeController,
  RecoveryCheck,
  RuntimeEvidence,
  RuntimeTarget,
} from '../../../application/ports/output/services/runtime-controller.interface.js';
import type { ExecFunction } from '../git/worktree.service.js';
import { NODE_CLI_TIMEOUT_MS } from '../cli-exec.constants.js';

/** Characters kept from each part of the evidence. */
export const MAX_EVIDENCE_CHARS = 6_000;
const LOG_TAIL_LINES = 80;
const EVENT_LINES = 30;
const KUBECTL = 'kubectl';
const TRUNCATED = '\n…(truncated)';
const MS_PER_SECOND = 1_000;

function scope(target: RuntimeTarget): string[] {
  return [
    ...(target.context ? ['--context', target.context] : []),
    '--namespace',
    target.namespace,
  ];
}

function deployment(target: RuntimeTarget): string {
  return `deployment/${target.workload}`;
}

function bounded(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_EVIDENCE_CHARS
    ? `${trimmed.slice(-MAX_EVIDENCE_CHARS)}${TRUNCATED}`
    : trimmed;
}

function failureText(error: unknown): string {
  const stderr = (error as { stderr?: unknown } | null)?.stderr;
  if (typeof stderr === 'string' && stderr.trim()) return stderr.trim();
  return error instanceof Error ? error.message : String(error);
}

function lastLines(text: string, count: number): string {
  return text.trim().split('\n').slice(-count).join('\n');
}

export class KubectlRuntimeController implements IRuntimeController {
  constructor(private readonly execFile: ExecFunction) {}

  async evidence(target: RuntimeTarget): Promise<RuntimeEvidence> {
    const [status, events, logs] = await Promise.all([
      this.read(target, ['get', deployment(target), '-o', 'wide']),
      this.read(target, ['get', 'events', '--sort-by=.lastTimestamp']).then((text) =>
        lastLines(text, EVENT_LINES)
      ),
      this.read(target, [
        'logs',
        deployment(target),
        `--tail=${LOG_TAIL_LINES}`,
        '--all-containers=true',
      ]),
    ]);
    return { status: bounded(status), events: bounded(events), logs: bounded(logs) };
  }

  restart(target: RuntimeTarget): Promise<string> {
    return this.act(target, ['rollout', 'restart', deployment(target)]);
  }

  rollback(target: RuntimeTarget): Promise<string> {
    return this.act(target, ['rollout', 'undo', deployment(target)]);
  }

  scale(target: RuntimeTarget, replicas: number): Promise<string> {
    return this.act(target, ['scale', deployment(target), `--replicas=${replicas}`]);
  }

  async verify(target: RuntimeTarget, timeoutSeconds: number): Promise<RecoveryCheck> {
    try {
      const { stdout } = await this.execFile(
        KUBECTL,
        [...scope(target), 'rollout', 'status', deployment(target), `--timeout=${timeoutSeconds}s`],
        { timeout: (timeoutSeconds + 10) * MS_PER_SECOND }
      );
      return { recovered: true, detail: stdout.trim() };
    } catch (error: unknown) {
      return { recovered: false, detail: failureText(error) };
    }
  }

  private async act(target: RuntimeTarget, args: string[]): Promise<string> {
    try {
      const { stdout } = await this.execFile(KUBECTL, [...scope(target), ...args], {
        timeout: NODE_CLI_TIMEOUT_MS,
      });
      return stdout.trim();
    } catch (error: unknown) {
      throw new Error(failureText(error));
    }
  }

  /** Output of a read, or its error text: evidence is gathered even when part of it fails. */
  private async read(target: RuntimeTarget, args: string[]): Promise<string> {
    try {
      const { stdout } = await this.execFile(KUBECTL, [...scope(target), ...args], {
        timeout: NODE_CLI_TIMEOUT_MS,
      });
      return stdout;
    } catch (error: unknown) {
      return `(could not read: ${failureText(error)})`;
    }
  }
}
