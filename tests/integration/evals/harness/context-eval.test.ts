/**
 * Context relevance eval (spec 119, task 32): ≥20 queries, each with needed
 * chunks and distractors, through the real candidate retriever, context
 * engine and deterministic scorer. Scores required-evidence recall (needed
 * chunks visible at ≥ short) and distractor suppression (no distractor shown
 * in full). Bars: recall ≥ 0.9, suppression ≥ 0.8.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type ChunkKind, ChunkVisibility, HarnessTaskStatus } from '@/domain/generated/output.js';
import { resolveHarnessConfig } from '@/domain/harness/harness-config.js';
import { ChunkWriter } from '@/application/services/harness/chunk-writer.js';
import { CandidateRetriever } from '@/application/services/harness/candidate-retriever.js';
import { ContextEngine } from '@/application/services/harness/context-engine.js';
import { DecisionService } from '@/application/services/harness/decision-service.js';
import { DecisionProviderFactory } from '@/infrastructure/services/harness/decisions/decision-provider-factory.js';
import { createHarnessTestStore } from '../../../helpers/harness/harness-test-store.js';
import { makeSession, makeTask } from '../../../helpers/harness/factories.js';
import { report, type EvalCaseOutcome } from './eval-report.js';

const RECALL_BAR = 0.9;
const SUPPRESSION_BAR = 0.8;

interface ContextCase {
  id: string;
  query: string;
  chunks: { label: string; kind: ChunkKind; path?: string; content: string; needed: boolean }[];
}

const suite = JSON.parse(readFileSync(join(import.meta.dirname, 'context-cases.json'), 'utf8')) as {
  cases: ContextCase[];
};

describe('context relevance eval', () => {
  it(`keeps required evidence visible across ${suite.cases.length} queries`, async () => {
    expect(suite.cases.length).toBeGreaterThanOrEqual(20);
    const config = resolveHarnessConfig(undefined);
    const recall: EvalCaseOutcome[] = [];
    const suppression: EvalCaseOutcome[] = [];
    for (const c of suite.cases) {
      const store = await createHarnessTestStore();
      const session = makeSession();
      await store.sessions.createSession(session);
      const task = makeTask(session.id, { status: HarnessTaskStatus.Running, goal: c.query });
      await store.sessions.createTask(task);
      const writer = new ChunkWriter(store.context, store.blobs);
      const ids = new Map<string, { needed: boolean; label: string }>();
      for (const ch of c.chunks) {
        const chunk = await writer.write({
          sessionId: session.id,
          kind: ch.kind,
          label: ch.label,
          source: 'eval',
          content: ch.content,
          ...(ch.path && { path: ch.path }),
        });
        ids.set(chunk.id, { needed: ch.needed, label: ch.label });
      }
      const engine = new ContextEngine(
        new CandidateRetriever(store.context),
        store.context,
        store.blobs,
        new DecisionService(
          config.decisions,
          new DecisionProviderFactory(),
          store.execution,
          store.blobs
        ),
        store.events
      );
      const { plan } = await engine.build({
        sessionId: session.id,
        task,
        turn: 1,
        query: c.query,
        config: config.context,
        fixedTokens: 0,
        promptSectionChunkIds: [],
        escalations: new Map(),
        userIncludes: new Set(),
        instructionIds: [],
        capabilityIds: [],
        loadedSchemaIds: [],
        shadow: false,
      });
      const vis = new Map(plan.chunks.map((p) => [p.chunkId, p.visibility]));
      for (const [id, { needed, label }] of ids) {
        const v = vis.get(id) ?? ChunkVisibility.Hidden;
        if (needed)
          recall.push({
            id: `${c.id}:${id}`,
            pass: v !== ChunkVisibility.Hidden,
            expected: '≥ short',
            actual: v,
            note: `${c.query} — ${label}`,
          });
        else
          suppression.push({
            id: `${c.id}:${id}`,
            pass: v !== ChunkVisibility.Full,
            expected: '< full',
            actual: v,
            note: `${c.query} — ${label}`,
          });
      }
      store.close();
    }
    const r = report('context-recall', recall);
    const s = report('context-suppression', suppression);
    expect(r.score, JSON.stringify(r.failures, null, 2)).toBeGreaterThanOrEqual(RECALL_BAR);
    expect(s.score, JSON.stringify(s.failures, null, 2)).toBeGreaterThanOrEqual(SUPPRESSION_BAR);
  });
});
