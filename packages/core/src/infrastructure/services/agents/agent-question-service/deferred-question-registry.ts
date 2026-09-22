/**
 * DeferredQuestionRegistry
 *
 * In-process bridge between the SDK V2 `canUseTool` callback (which
 * expects a Promise) and the asynchronous, DB-backed answer that may
 * arrive from a different process (CLI, web). Each register() returns a
 * Promise that resolves on answer, rejects on cancel, or rejects with a
 * typed timeout error after a hard deadline.
 *
 * Implementation notes (spec 093, task 16):
 *  - One internal `Map<id, Entry>` keyed by question id; ids are unique.
 *  - register() throws synchronously on duplicate id so SDK callbacks
 *    can't accidentally overwrite an existing awaiter.
 *  - resolve/reject/timeout always run a single cleanup helper that
 *    clears the timer AND removes the map entry, so no timer leaks.
 *  - cancelAll matches by scope: appId is required (NFR-7), featureId
 *    and agentRunId narrow further. A scope with only appId rejects
 *    every awaiter under that app.
 *  - Settling a non-existent id is a no-op (e.g. an answer arrives for
 *    a question whose registration was never created in this process).
 *  - Cross-process answers: AnswerAgentQuestionUseCase can only resolve an
 *    awaiter living in ITS process. An answer from the CLI marks the DB
 *    row answered while the awaiter sits in the daemon, so each awaiter
 *    also polls its question row every QUESTION_ANSWER_POLL_INTERVAL_MS and
 *    settles on answered (resolve) or cancelled/expired (reject).
 */

import { inject, injectable } from 'tsyringe';

import {
  AgentQuestionCancelledError,
  AgentQuestionTimeoutError,
  DEFAULT_DEFERRED_QUESTION_TIMEOUT_MS,
  type DeferredQuestionScope,
  type IDeferredQuestionRegistry,
} from '@/application/ports/output/agents/agent-question-service.interface.js';
import type { IAgentQuestionRepository } from '@/application/ports/output/repositories/agent-question-repository.interface.js';
import { AgentQuestionStatus } from '@/domain/generated/output.js';

/** How often an awaiter re-reads its question row for an answer written by another process. */
export const QUESTION_ANSWER_POLL_INTERVAL_MS = 2_000;

/** Statuses that end a question without an answer. */
const ABANDONED_STATUSES: ReadonlySet<AgentQuestionStatus> = new Set([
  AgentQuestionStatus.cancelled,
  AgentQuestionStatus.expired,
]);

interface Entry {
  resolve: (answer: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  poller?: ReturnType<typeof setInterval>;
  scope: DeferredQuestionScope;
}

@injectable()
export class DeferredQuestionRegistry implements IDeferredQuestionRegistry {
  private readonly entries = new Map<string, Entry>();

  constructor(
    /**
     * Source of truth for answers written by other processes. Without it
     * (unit tests of in-process flows) only resolve()/reject() settle.
     */
    @inject('IAgentQuestionRepository')
    private readonly questionRepository?: IAgentQuestionRepository
  ) {}

  register(id: string, scope: DeferredQuestionScope, timeoutMs?: number): Promise<string> {
    if (this.entries.has(id)) {
      throw new Error(`DeferredQuestionRegistry: question id "${id}" is already registered`);
    }

    const effectiveTimeout = timeoutMs ?? DEFAULT_DEFERRED_QUESTION_TIMEOUT_MS;

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.cleanup(id);
        reject(new AgentQuestionTimeoutError(id, effectiveTimeout));
      }, effectiveTimeout);

      this.entries.set(id, {
        resolve: (answer) => {
          this.cleanup(id);
          resolve(answer);
        },
        reject: (err) => {
          this.cleanup(id);
          reject(err);
        },
        timer,
        poller: this.startPolling(id, scope),
        scope,
      });
    });
  }

  private startPolling(
    id: string,
    scope: DeferredQuestionScope
  ): ReturnType<typeof setInterval> | undefined {
    const repository = this.questionRepository;
    if (!repository) return undefined;
    let inFlight = false;
    const poller = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      repository
        .findById(scope.appId, id)
        .then((question) => {
          if (!question) return;
          if (question.status === AgentQuestionStatus.answered) {
            this.resolve(id, question.answer ?? '');
          } else if (ABANDONED_STATUSES.has(question.status)) {
            this.reject(id, `question ${question.status}`);
          }
        })
        .catch(() => {
          // Transient DB error — the next tick retries.
        })
        .finally(() => {
          inFlight = false;
        });
    }, QUESTION_ANSWER_POLL_INTERVAL_MS);
    poller.unref?.();
    return poller;
  }

  resolve(id: string, answer: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.resolve(answer);
  }

  reject(id: string, reason?: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.reject(new AgentQuestionCancelledError(id, reason));
  }

  cancelAll(scope: DeferredQuestionScope, reason?: string): number {
    let cancelled = 0;
    for (const [id, entry] of this.entries) {
      if (!matchesScope(entry.scope, scope)) continue;
      entry.reject(new AgentQuestionCancelledError(id, reason));
      cancelled++;
    }
    return cancelled;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  private cleanup(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    if (entry.poller) clearInterval(entry.poller);
    this.entries.delete(id);
  }
}

function matchesScope(entry: DeferredQuestionScope, target: DeferredQuestionScope): boolean {
  if (entry.appId !== target.appId) return false;
  if (target.featureId !== undefined && entry.featureId !== target.featureId) return false;
  if (target.agentRunId !== undefined && entry.agentRunId !== target.agentRunId) return false;
  return true;
}
