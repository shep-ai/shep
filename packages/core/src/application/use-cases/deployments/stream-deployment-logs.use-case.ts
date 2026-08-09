/**
 * Stream Deployment Logs Use Case
 *
 * One seam for "show me what this dev server is saying", covering both the
 * lines already captured and the ones still to come.
 *
 * It exists because the only log surface before now was the web SSE route
 * (`app/api/deployment-logs`), which is a web presentation adapter. A CLI that
 * consumed it would make the web daemon a hard dependency of the CLI — the
 * inverse of the presentation-agnostic rule (FR-23). So the subscription lives
 * here, in the application layer, where the CLI and the route can both reach it.
 *
 * Two small pieces of logic are deliberately core rather than presentation:
 * filtering the process-wide 'log' event down to one target, and reporting
 * whether the target is tracked at all — an untracked target is an expected
 * condition (`shep dev logs` before a start), not an error.
 */

import { inject, injectable } from 'tsyringe';

import type {
  IDeploymentService,
  LogEntry,
} from '../../ports/output/services/deployment-service.interface.js';

/** An open view onto one deployment's output. */
export interface DeploymentLogStream {
  /**
   * False when the target has neither a live deployment nor a retained
   * post-mortem trail — nothing has ever run for it.
   */
  tracked: boolean;
  /** Lines captured before the stream opened, in chronological order. */
  history: LogEntry[];
  /** Detach the live subscription. Safe to call more than once. */
  close(): void;
}

export interface StreamDeploymentLogsInput {
  targetId: string;
  /**
   * Called for each line produced after the stream opens. Omit it to read
   * history only — no subscription is registered in that case.
   */
  onLine?: (entry: LogEntry) => void;
}

@injectable()
export class StreamDeploymentLogsUseCase {
  constructor(
    @inject('IDeploymentService') private readonly deploymentService: IDeploymentService
  ) {}

  execute(input: StreamDeploymentLogsInput): DeploymentLogStream {
    const targetId = input.targetId?.trim();
    if (!targetId) {
      throw new Error('targetId is required');
    }

    // Read history and subscribe in the same synchronous block so a line
    // emitted between the two cannot be lost or delivered twice.
    const history = this.deploymentService.getLogs(targetId);
    const { onLine } = input;

    if (!onLine) {
      // Nothing was attached, so there is nothing to detach.
      const noop = (): void => undefined;
      return { tracked: history !== null, history: history ?? [], close: noop };
    }

    const handler = (entry: LogEntry): void => {
      if (entry.targetId !== targetId) return;
      onLine(entry);
    };
    this.deploymentService.on('log', handler);

    let closed = false;
    return {
      tracked: history !== null,
      history: history ?? [],
      close: () => {
        if (closed) return;
        closed = true;
        this.deploymentService.off('log', handler);
      },
    };
  }
}
