/**
 * SessionRestorer (spec 119, docs/11 "Restart flow").
 *
 * When a session is picked up again (a resumed feature run, `shep harness
 * resume`), state comes from the store, never from a transcript:
 * - tasks left running or blocked are marked failed (interrupted);
 * - tool calls left running become `unknown`; repeating a non-read action
 *   with the same arguments is forced through `ask`;
 * - pending approvals of interrupted tasks are closed;
 * - repository drift since the last snapshot is detected, and chunks of
 *   changed files are marked stale.
 */
import {
  HarnessEventType,
  HarnessTaskOutcome,
  HarnessTaskStatus,
  HarnessToolCallStatus,
  PermissionEffect,
  PermissionRequestStatus,
  ToolReadWriteMode,
  type HarnessSession,
} from '../../../domain/generated/output.js';
import { isTerminalHarnessTaskStatus } from '../../../domain/harness/task-state-machine.js';
import type {
  IBlobStore,
  IHarnessContextRepository,
  IHarnessEventLog,
  IHarnessExecutionRepository,
  IHarnessPermissionRepository,
  IHarnessSessionRepository,
  IRepoSnapshotter,
} from '../../ports/output/harness/index.js';
import { markPathsStale } from './chunk-writer.js';
import type { CapabilityRegistry } from './capability-registry.js';

export const INTERRUPTED_REASON = 'Interrupted: the process stopped before the task finished';

export interface RestoreReport {
  interruptedTaskIds: string[];
  unknownSideEffects: { key: string; summary: string }[];
  driftedPaths: string[];
}

export class SessionRestorer {
  constructor(
    private readonly sessions: IHarnessSessionRepository,
    private readonly context: IHarnessContextRepository,
    private readonly execution: IHarnessExecutionRepository,
    private readonly permissions: IHarnessPermissionRepository,
    private readonly events: IHarnessEventLog,
    private readonly blobs: IBlobStore,
    private readonly snapshotter: IRepoSnapshotter
  ) {}

  async restore(
    session: HarnessSession,
    registry: CapabilityRegistry,
    repoRoot: string
  ): Promise<RestoreReport> {
    const report: RestoreReport = {
      interruptedTaskIds: [],
      unknownSideEffects: [],
      driftedPaths: [],
    };
    for (const task of await this.sessions.listTasks(session.id)) {
      if (isTerminalHarnessTaskStatus(task.status) || task.status === HarnessTaskStatus.Pending)
        continue;
      for (const call of await this.execution.listToolCalls(task.id)) {
        if (
          call.status !== HarnessToolCallStatus.Running &&
          call.status !== HarnessToolCallStatus.Pending
        )
          continue;
        await this.execution.putToolCall({
          ...call,
          status: HarnessToolCallStatus.Unknown,
          updatedAt: new Date(),
        });
        const impl = registry.executor(call.implementationId)?.implementation;
        if (
          call.status === HarnessToolCallStatus.Running &&
          impl &&
          impl.readWriteMode !== ToolReadWriteMode.Read
        ) {
          report.unknownSideEffects.push({
            key: `${call.implementationId}:${call.argumentsHash}`,
            summary: call.summary ?? call.capabilityId,
          });
        }
      }
      for (const pending of await this.permissions.listPending(session.id)) {
        if (pending.taskId !== task.id) continue;
        await this.permissions.resolvePending({
          ...pending,
          result: PermissionEffect.Deny,
          status: PermissionRequestStatus.Resolved,
          reasonCode: 'interrupted',
          resolvedBy: 'restore',
          updatedAt: new Date(),
        });
      }
      await this.sessions.updateTask({
        ...task,
        status: HarnessTaskStatus.Failed,
        failureReason: INTERRUPTED_REASON,
        result: {
          status: HarnessTaskOutcome.Failure,
          summary: INTERRUPTED_REASON,
          evidence: [],
          producedChunkIds: [],
        },
        updatedAt: new Date(),
      });
      await this.events.append({
        sessionId: session.id,
        taskId: task.id,
        type: HarnessEventType.TaskFailed,
        payload: { reason: INTERRUPTED_REASON },
      });
      report.interruptedTaskIds.push(task.id);
    }

    const last = await this.sessions.latestSnapshot(session.id);
    if (last?.fileHashesRef) {
      const previous = JSON.parse(await this.blobs.getText(last.fileHashesRef)) as Record<
        string,
        string
      >;
      const drift = await this.snapshotter.compare({ fileHashes: previous }, repoRoot);
      if (drift.drifted) {
        report.driftedPaths = drift.changedPaths;
        await markPathsStale(this.context, session.id, drift.changedPaths);
        await this.events.append({
          sessionId: session.id,
          type: HarnessEventType.RepoDriftDetected,
          payload: {
            changedPaths: drift.changedPaths.slice(0, 200),
            count: drift.changedPaths.length,
          },
        });
      }
    }
    if (report.interruptedTaskIds.length || report.driftedPaths.length) {
      await this.events.append({
        sessionId: session.id,
        type: HarnessEventType.SessionResumed,
        payload: { ...report, unknownSideEffects: report.unknownSideEffects.map((u) => u.summary) },
      });
    }
    return report;
  }
}
