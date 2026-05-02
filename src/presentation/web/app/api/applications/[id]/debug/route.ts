/**
 * Application Debug Snapshot
 *
 * GET /api/applications/:id/debug
 *
 * One-stop diagnostic dump for a stuck application creation. Returns
 * the full persisted state for the application (row, interactive
 * session, every workflow step, recent message timing, recent
 * operation_log_entries) plus computed staleness indicators so the
 * caller can tell at a glance which layer is wedged:
 *
 *  - The "Building the pieces" step has been `running` for X seconds
 *    but no agent message has landed in N seconds → workflow lost
 *    its in-process turn-done event (very likely dev-server HMR or
 *    daemon restart while a Promise was awaiting).
 *  - The interactive session is `ready` / `idle` but the workflow
 *    step is still `running` → the orchestrator's awaiting Promise
 *    is orphaned. Use the existing `force-stop` UI control to
 *    flip the step to `interrupted` and retry.
 *  - The application row's `setup_complete` is `0` and `agent_session_id`
 *    is `null` despite the chat showing tool messages → the workflow
 *    never reached its terminal `update setupComplete=true` write.
 *
 * This route is intentionally thin (presentation pulls everything via
 * existing repository ports through DI — no business logic) and
 * read-only. No state mutation. Safe to hit any time.
 *
 * Surfaced from the application page header in dev mode via the
 * "Debug" link rendered by `application-page.tsx`. Works in production
 * too — there's nothing dev-specific about the data, just the link.
 */

import 'reflect-metadata';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { IApplicationRepository } from '@shepai/core/application/ports/output/repositories/application-repository.interface';
import type { IInteractiveSessionRepository } from '@shepai/core/application/ports/output/repositories/interactive-session-repository.interface';
import type { IInteractiveMessageRepository } from '@shepai/core/application/ports/output/repositories/interactive-message-repository.interface';
import type { IWorkflowStepRepository } from '@shepai/core/application/ports/output/repositories/workflow-step-repository.interface';
import type { IOperationLogRepository } from '@shepai/core/application/ports/output/repositories/operation-log.repository.interface';
import { OperationLogKind } from '@shepai/core/domain/generated/output';
import type { InteractiveSessionFull } from '@shepai/core/infrastructure/persistence/sqlite/mappers/interactive-session.mapper';
import { featureIdForApplication } from '@shepai/core/domain/shared/feature-id';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const STUCK_STEP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const STALE_AGENT_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const featureId = featureIdForApplication(id);
    const now = Date.now();

    const appRepo = resolve<IApplicationRepository>('IApplicationRepository');
    const sessionRepo = resolve<IInteractiveSessionRepository>('IInteractiveSessionRepository');
    const messageRepo = resolve<IInteractiveMessageRepository>('IInteractiveMessageRepository');
    const stepRepo = resolve<IWorkflowStepRepository>('IWorkflowStepRepository');
    const operationLogRepo = resolve<IOperationLogRepository>('IOperationLogRepository');

    const [application, sessionRaw, steps, allMessages, scaffoldLogs] = await Promise.all([
      appRepo.findById(id),
      sessionRepo.findByFeatureId(featureId),
      stepRepo.listByFeature(featureId),
      messageRepo.findByFeatureId(featureId, 500),
      operationLogRepo.listByScope(OperationLogKind.ApplicationSetup, id),
    ]);
    // The mapper returns InteractiveSessionFull (with turnStatus, agentSessionId, totals)
    // even though the TypeSpec type doesn't yet include those fields.
    const session = sessionRaw as InteractiveSessionFull | null;

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const lastMessage = allMessages.at(-1) ?? null;
    const lastAssistantMessage = [...allMessages].reverse().find((m) => m.role !== 'user') ?? null;

    const indicators: { kind: 'info' | 'warn' | 'error'; message: string }[] = [];

    const runningStep = steps.find((s) => s.status === 'running') ?? null;
    if (runningStep) {
      const startedAt = runningStep.startedAt ? new Date(runningStep.startedAt).getTime() : null;
      const stepRunningMs = startedAt !== null ? now - startedAt : null;
      if (stepRunningMs !== null && stepRunningMs > STUCK_STEP_THRESHOLD_MS) {
        indicators.push({
          kind: 'warn',
          message: `Step "${runningStep.title}" has been running for ${formatMs(stepRunningMs)} — likely stuck.`,
        });
      }
    }

    if (lastAssistantMessage) {
      const sinceLastAgentMs = now - new Date(lastAssistantMessage.createdAt).getTime();
      if (
        runningStep &&
        sinceLastAgentMs > STALE_AGENT_THRESHOLD_MS &&
        session?.turnStatus === 'idle'
      ) {
        indicators.push({
          kind: 'warn',
          message: `No agent activity for ${formatMs(sinceLastAgentMs)} but step still "running" with session turn_status=idle. Orchestrator likely lost its turn-done event — use the X (force-stop) on the step card to recover.`,
        });
      }
    }

    if (steps.length === 0 && lastMessage !== null) {
      indicators.push({
        kind: 'warn',
        message: 'Messages exist but no workflow_steps rows — workflow ensureSteps never ran.',
      });
    }

    if (application.setupComplete === false && steps.every((s) => s.status === 'done')) {
      indicators.push({
        kind: 'error',
        message:
          'All workflow steps are `done` but application.setup_complete is still `false` — the terminal update flag write was skipped.',
      });
    }

    const messagesByStep = new Map<string | null, number>();
    for (const m of allMessages) {
      const key = m.stepId ?? null;
      messagesByStep.set(key, (messagesByStep.get(key) ?? 0) + 1);
    }

    return NextResponse.json({
      now: new Date(now).toISOString(),
      application: {
        id: application.id,
        name: application.name,
        slug: application.slug,
        status: application.status,
        setupComplete: application.setupComplete,
        agentType: application.agentType,
        modelOverride: application.modelOverride,
        agentSessionId: application.agentSessionId,
        repositoryPath: application.repositoryPath,
        createdAt: toIso(application.createdAt),
        updatedAt: toIso(application.updatedAt),
        ageMs: now - new Date(application.createdAt).getTime(),
      },
      session: session
        ? {
            id: session.id,
            status: session.status,
            turnStatus: session.turnStatus,
            agentSessionId: session.agentSessionId,
            startedAt: toIso(session.startedAt),
            stoppedAt: session.stoppedAt ? toIso(session.stoppedAt) : null,
            lastActivityAt: toIso(session.lastActivityAt),
            updatedAt: toIso(session.updatedAt),
            sinceLastActivityMs: now - new Date(session.lastActivityAt).getTime(),
            sinceUpdateMs: now - new Date(session.updatedAt).getTime(),
            totalCostUsd: session.totalCostUsd,
            totalInputTokens: session.totalInputTokens,
            totalOutputTokens: session.totalOutputTokens,
            totalTurns: session.totalTurns,
          }
        : null,
      workflow: {
        runningStepId: runningStep?.id ?? null,
        steps: steps.map((s) => ({
          id: s.id,
          stepKey: s.stepKey,
          stepIndex: s.stepIndex,
          title: s.title,
          status: s.status,
          startedAt: s.startedAt ? toIso(s.startedAt) : null,
          finishedAt: s.finishedAt ? toIso(s.finishedAt) : null,
          durationMs:
            s.startedAt && s.finishedAt
              ? new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()
              : s.startedAt && s.status === 'running'
                ? now - new Date(s.startedAt).getTime()
                : null,
          messagesTagged: messagesByStep.get(s.id) ?? 0,
          metadata: s.metadata,
        })),
      },
      messages: {
        total: allMessages.length,
        untaggedToStep: messagesByStep.get(null) ?? 0,
        firstAt: allMessages[0] ? toIso(allMessages[0].createdAt) : null,
        lastAt: lastMessage ? toIso(lastMessage.createdAt) : null,
        lastAgentAt: lastAssistantMessage ? toIso(lastAssistantMessage.createdAt) : null,
        sinceLastMs: lastMessage ? now - new Date(lastMessage.createdAt).getTime() : null,
        sinceLastAgentMs: lastAssistantMessage
          ? now - new Date(lastAssistantMessage.createdAt).getTime()
          : null,
        recentTail: allMessages.slice(-5).map((m) => ({
          id: m.id,
          role: m.role,
          stepId: m.stepId ?? null,
          createdAt: toIso(m.createdAt),
          preview: (m.content ?? '').slice(0, 160),
        })),
      },
      operationLog: {
        total: scaffoldLogs.length,
        firstAt: scaffoldLogs[0] ? toIso(scaffoldLogs[0].createdAt) : null,
        lastAt: scaffoldLogs.at(-1) ? toIso(scaffoldLogs.at(-1)!.createdAt) : null,
        recentTail: scaffoldLogs.slice(-10).map((entry) => ({
          level: entry.level,
          message: entry.message,
          detail: entry.detail ?? null,
          createdAt: toIso(entry.createdAt),
        })),
      },
      indicators,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

function toIso(value: Date | string | number): string {
  return new Date(value).toISOString();
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return remSec === 0 ? `${min}m` : `${min}m ${remSec}s`;
}
