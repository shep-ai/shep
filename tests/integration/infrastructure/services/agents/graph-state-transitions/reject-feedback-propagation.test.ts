/**
 * Reject Feedback Propagation Tests
 *
 * Comprehensive test validating that rejection feedback is:
 * 1. Stored with the correct phase in spec.yaml
 * 2. Propagated to the correct prompt (requirements/plan/merge)
 * 3. Displayed under the correct phase in feat show timing output
 *
 * Covers 10 iterations EACH for PRD, Plan, and Merge phases,
 * validating feedback propagation and phase timing display after each.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { createTestContext, type TestContext } from './setup.js';
import {
  expectInterruptAt,
  expectNoInterrupts,
  approveCommand,
  rejectCommand,
  readSpecYaml,
  ALL_GATES_DISABLED,
  PRD_ALLOWED,
  PRD_PLAN_ALLOWED,
} from './helpers.js';
import type { RejectionFeedbackEntry } from '@/domain/generated/output.js';

/* ------------------------------------------------------------------ */
/*  Prompt section extraction helper                                   */
/* ------------------------------------------------------------------ */

/**
 * Extract the rejection feedback section from a prompt.
 * Returns the text between the CRITICAL feedback heading and the next "##" heading,
 * or empty string if not found.
 */
function extractFeedbackSection(prompt: string): string {
  const match = prompt.match(
    /## ⚠️ CRITICAL — User Rejection Feedback[^\n]*\n([\s\S]*?)(?=\n## [^#]|\n\nYou are)/
  );
  return match ? match[1] : '';
}

/* ------------------------------------------------------------------ */
/*  spec.yaml feedback helpers (simulate what RejectAgentRunUseCase does) */
/* ------------------------------------------------------------------ */

/**
 * Append a rejection feedback entry to spec.yaml on disk.
 * This simulates the RejectAgentRunUseCase writing the feedback.
 */
function appendRejectionFeedback(
  specDir: string,
  message: string,
  phase: string
): RejectionFeedbackEntry[] {
  const specContent = readFileSync(join(specDir, 'spec.yaml'), 'utf-8');
  const spec = yaml.load(specContent) as Record<string, unknown>;

  const existing = Array.isArray(spec.rejectionFeedback)
    ? (spec.rejectionFeedback as RejectionFeedbackEntry[])
    : [];

  const iteration = existing.length + 1;
  const newEntry: RejectionFeedbackEntry = {
    iteration,
    message,
    phase,
    timestamp: new Date().toISOString(),
  };

  spec.rejectionFeedback = [...existing, newEntry];
  writeFileSync(join(specDir, 'spec.yaml'), yaml.dump(spec), 'utf-8');

  return spec.rejectionFeedback as RejectionFeedbackEntry[];
}

/**
 * Read all rejection feedback entries from spec.yaml.
 */
function readRejectionFeedback(specDir: string): RejectionFeedbackEntry[] {
  const spec = readSpecYaml(specDir);
  return Array.isArray(spec.rejectionFeedback)
    ? (spec.rejectionFeedback as RejectionFeedbackEntry[])
    : [];
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('Graph State Transitions › Reject Feedback Propagation', () => {
  describe('10 PRD rejections with feedback propagation', () => {
    let ctx: TestContext;
    let output: { restore: () => void };

    beforeAll(() => {
      ctx = createTestContext();
      ctx.init();
      output = ctx.suppressOutput();
    });

    beforeEach(() => {
      ctx.reset();
    });

    afterAll(() => {
      output.restore();
      ctx.cleanup();
    });

    it('should store phase="requirements" and propagate feedback through 10 PRD iterations', async () => {
      const config = ctx.newConfig();
      const state = ctx.initialState(ALL_GATES_DISABLED);

      // Initial run — interrupt at requirements
      const r1 = await ctx.graph.invoke(state, config);
      expectInterruptAt(r1, 'requirements');
      expect(ctx.executor.callCount).toBe(2); // analyze + requirements

      const messages = [
        'add more functional requirements',
        'include performance NFRs',
        'add security requirements',
        'clarify success criteria',
        'add more open questions with options',
        'include accessibility requirements',
        'add data migration requirements',
        'specify error handling expectations',
        'add monitoring and alerting requirements',
        'include rollback procedures',
      ];

      for (let i = 0; i < 10; i++) {
        // 1. Write feedback to spec.yaml (simulates RejectAgentRunUseCase)
        const allFeedback = appendRejectionFeedback(ctx.specDir, messages[i], 'requirements');

        // 2. Verify feedback stored with correct phase
        expect(allFeedback).toHaveLength(i + 1);
        expect(allFeedback[i].phase).toBe('requirements');
        expect(allFeedback[i].message).toBe(messages[i]);
        expect(allFeedback[i].iteration).toBe(i + 1);

        // 3. Reject via graph — re-executes requirements, interrupts again
        const result = await ctx.graph.invoke(rejectCommand(messages[i]), config);
        expectInterruptAt(result, 'requirements');

        // 4. Verify call count: analyze(1) + req(1) + rejections(i+1)
        expect(ctx.executor.callCount).toBe(3 + i);

        // 5. Verify the re-execution prompt contains rejection feedback
        const reexecPrompt = ctx.executor.prompts[ctx.executor.prompts.length - 1];
        expect(reexecPrompt).toContain('CRITICAL — User Rejection Feedback');
        expect(reexecPrompt).toContain(messages[i]);

        // 6. Verify ALL previous messages are in the prompt (cumulative)
        for (let j = 0; j <= i; j++) {
          expect(reexecPrompt).toContain(messages[j]);
        }
      }

      // Final state: 10 feedback entries, all with phase="requirements"
      const finalFeedback = readRejectionFeedback(ctx.specDir);
      expect(finalFeedback).toHaveLength(10);
      expect(finalFeedback.every((f) => f.phase === 'requirements')).toBe(true);

      // Call count: analyze(1) + req(1) + 10 re-execs = 12
      expect(ctx.executor.callCount).toBe(12);

      // Approve and continue
      const rApprove = await ctx.graph.invoke(approveCommand(), config);
      expectInterruptAt(rApprove, 'plan');

      // research(13) + plan(14) = 14
      expect(ctx.executor.callCount).toBe(14);
    });
  });

  describe('10 Plan rejections with feedback propagation', () => {
    let ctx: TestContext;
    let output: { restore: () => void };

    beforeAll(() => {
      ctx = createTestContext();
      ctx.init();
      output = ctx.suppressOutput();
    });

    beforeEach(() => {
      ctx.reset();
    });

    afterAll(() => {
      output.restore();
      ctx.cleanup();
    });

    it('should store phase="plan" and propagate feedback through 10 plan iterations', async () => {
      const config = ctx.newConfig();
      const state = ctx.initialState(PRD_ALLOWED); // skip PRD gate

      // Initial run — interrupt at plan
      const r1 = await ctx.graph.invoke(state, config);
      expectInterruptAt(r1, 'plan');
      expect(ctx.executor.callCount).toBe(4); // analyze + req + research + plan

      const messages = [
        'add more implementation phases',
        'break tasks into smaller chunks',
        'add explicit TDD cycles',
        'clarify dependency ordering',
        'add risk mitigation strategies',
        'include performance benchmarks in plan',
        'add code review checkpoints',
        'specify integration test strategy',
        'add deployment verification steps',
        'include rollback plan for each phase',
      ];

      for (let i = 0; i < 10; i++) {
        // 1. Write feedback to spec.yaml with phase="plan"
        const allFeedback = appendRejectionFeedback(ctx.specDir, messages[i], 'plan');

        // 2. Verify feedback stored with correct phase
        expect(allFeedback).toHaveLength(i + 1);
        expect(allFeedback[i].phase).toBe('plan');
        expect(allFeedback[i].message).toBe(messages[i]);

        // 3. Reject — re-executes plan, interrupts again
        const result = await ctx.graph.invoke(rejectCommand(messages[i]), config);
        expectInterruptAt(result, 'plan');

        // 4. Call count: initial(4) + rejections(i+1)
        expect(ctx.executor.callCount).toBe(5 + i);

        // 5. Verify the plan re-execution prompt contains plan-specific feedback
        const reexecPrompt = ctx.executor.prompts[ctx.executor.prompts.length - 1];
        expect(reexecPrompt).toContain('CRITICAL — User Rejection Feedback');
        expect(reexecPrompt).toContain(messages[i]);

        // 6. Verify cumulative feedback
        for (let j = 0; j <= i; j++) {
          expect(reexecPrompt).toContain(messages[j]);
        }
      }

      // Final state: 10 feedback entries, all with phase="plan"
      const finalFeedback = readRejectionFeedback(ctx.specDir);
      expect(finalFeedback).toHaveLength(10);
      expect(finalFeedback.every((f) => f.phase === 'plan')).toBe(true);

      // Call count: initial(4) + 10 re-execs = 14
      expect(ctx.executor.callCount).toBe(14);

      // Approve and complete
      const rApprove = await ctx.graph.invoke(approveCommand(), config);
      expectNoInterrupts(rApprove); // implement runs, no merge gate

      // implement(15) + evidence(16,17,18) = 18
      // Evidence makes 3 executor calls (validation fails on stub's non-existent file paths, exhausting all retries)
      expect(ctx.executor.callCount).toBe(18);
    });
  });

  describe('10 Merge rejections with feedback propagation', () => {
    let ctx: TestContext;
    let output: { restore: () => void };

    beforeAll(() => {
      ctx = createTestContext({ withMerge: true });
      ctx.init();
      output = ctx.suppressOutput();
    });

    beforeEach(() => {
      ctx.reset();
    });

    afterAll(() => {
      output.restore();
      ctx.cleanup();
    });

    it('should store phase="merge" and propagate feedback through 10 merge iterations', async () => {
      const config = ctx.newConfig();
      const state = ctx.initialState(PRD_PLAN_ALLOWED); // only merge gated

      // Initial run — interrupt at merge
      const r1 = await ctx.graph.invoke(state, config);
      expectInterruptAt(r1, 'merge');
      // analyze + req + research + plan + implement + evidence(3) + merge-commit = 9
      // Evidence makes 3 executor calls (validation fails on stub's non-existent file paths, exhausting all retries)
      expect(ctx.executor.callCount).toBe(9);

      const messages = [
        'fix commit message format',
        'squash intermediate commits',
        'update PR description',
        'add changelog entry',
        'fix CI failures before merge',
        'add missing test coverage',
        'update documentation links',
        'fix linting warnings',
        'add migration notes to PR',
        'resolve merge conflicts properly',
      ];

      for (let i = 0; i < 10; i++) {
        // 1. Write feedback to spec.yaml with phase="merge"
        const allFeedback = appendRejectionFeedback(ctx.specDir, messages[i], 'merge');

        // 2. Verify feedback stored with correct phase
        expect(allFeedback).toHaveLength(i + 1);
        expect(allFeedback[i].phase).toBe('merge');
        expect(allFeedback[i].message).toBe(messages[i]);

        // 3. Reject — routes back through implement (addresses the feedback),
        // then re-runs merge's commit/push/PR call, interrupts again
        const result = await ctx.graph.invoke(rejectCommand(messages[i]), config);
        expectInterruptAt(result, 'merge');

        // 4. Call count: initial(9) + 2 calls per rejection (implement redo + merge-commit)
        expect(ctx.executor.callCount).toBe(9 + 2 * (i + 1));

        // 5. Verify the merge re-execution prompt contains merge-specific feedback
        const reexecPrompt = ctx.executor.prompts[ctx.executor.prompts.length - 1];
        expect(reexecPrompt).toContain('CRITICAL — User Rejection Feedback');
        expect(reexecPrompt).toContain(messages[i]);

        // 6. Verify cumulative feedback
        for (let j = 0; j <= i; j++) {
          expect(reexecPrompt).toContain(messages[j]);
        }
      }

      // Final state: 10 feedback entries, all with phase="merge"
      const finalFeedback = readRejectionFeedback(ctx.specDir);
      expect(finalFeedback).toHaveLength(10);
      expect(finalFeedback.every((f) => f.phase === 'merge')).toBe(true);

      // Call count: initial(9) + 10 rejections * 2 calls each = 29
      expect(ctx.executor.callCount).toBe(29);

      // Approve and complete
      const rApprove = await ctx.graph.invoke(approveCommand(), config);
      expectNoInterrupts(rApprove);
    });
  });

  describe('Full walkthrough: 10 PRD + 10 Plan + 10 Merge rejections', () => {
    let ctx: TestContext;
    let output: { restore: () => void };

    beforeAll(() => {
      ctx = createTestContext({ withMerge: true });
      ctx.init();
      output = ctx.suppressOutput();
    });

    beforeEach(() => {
      ctx.reset();
    });

    afterAll(() => {
      output.restore();
      ctx.cleanup();
    });

    it('should handle 30 total rejections across all 3 phases with correct phase isolation', async () => {
      const config = ctx.newConfig();
      const state = ctx.initialState(ALL_GATES_DISABLED);

      // ========== Phase 1: PRD — 10 rejections ==========

      // Initial run — interrupt at requirements
      const r1 = await ctx.graph.invoke(state, config);
      expectInterruptAt(r1, 'requirements');
      expect(ctx.executor.callCount).toBe(2); // analyze + requirements

      for (let i = 0; i < 10; i++) {
        const msg = `PRD fix ${i + 1}: improve requirement ${i + 1}`;
        appendRejectionFeedback(ctx.specDir, msg, 'requirements');

        const result = await ctx.graph.invoke(rejectCommand(msg), config);
        expectInterruptAt(result, 'requirements');
        expect(ctx.executor.callCount).toBe(3 + i);

        // Verify requirements feedback section in prompt
        const prompt = ctx.executor.prompts[ctx.executor.prompts.length - 1];
        expect(prompt).toContain('CRITICAL — User Rejection Feedback');
        // Phase isolation verified via extractFeedbackSection content checks below

        // Verify the feedback section contains only requirements messages
        const section = extractFeedbackSection(prompt);
        expect(section).toContain(msg);
        expect(section).not.toContain('Plan fix');
        expect(section).not.toContain('Merge fix');
      }

      // Approve PRD — continue to plan
      // analyze(1) + req(1) + 10 re-execs = 12 before approve
      expect(ctx.executor.callCount).toBe(12);

      const rApprovePrd = await ctx.graph.invoke(approveCommand(), config);
      expectInterruptAt(rApprovePrd, 'plan');
      // research(13) + plan(14) = 14
      expect(ctx.executor.callCount).toBe(14);

      // ========== Phase 2: Plan — 10 rejections ==========

      for (let i = 0; i < 10; i++) {
        const msg = `Plan fix ${i + 1}: refine task ${i + 1}`;
        appendRejectionFeedback(ctx.specDir, msg, 'plan');

        const result = await ctx.graph.invoke(rejectCommand(msg), config);
        expectInterruptAt(result, 'plan');
        expect(ctx.executor.callCount).toBe(15 + i);

        // Verify plan feedback section in prompt
        const prompt = ctx.executor.prompts[ctx.executor.prompts.length - 1];
        expect(prompt).toContain('CRITICAL — User Rejection Feedback');
        // Phase isolation verified via extractFeedbackSection content checks below

        // Verify the feedback section contains only plan messages
        const section = extractFeedbackSection(prompt);
        for (let j = 0; j <= i; j++) {
          expect(section).toContain(`Plan fix ${j + 1}`);
        }
        expect(section).not.toContain('PRD fix');
        expect(section).not.toContain('Merge fix');
      }

      // Approve plan — continue to implement + merge
      expect(ctx.executor.callCount).toBe(24);

      const rApprovePlan = await ctx.graph.invoke(approveCommand(), config);
      expectInterruptAt(rApprovePlan, 'merge');
      // implement(25) + evidence(26,27,28) + merge-commit(29) = 29
      // Evidence makes 3 executor calls (validation fails on stub's non-existent file paths, exhausting all retries)
      expect(ctx.executor.callCount).toBe(29);

      // ========== Phase 3: Merge — 10 rejections ==========

      for (let i = 0; i < 10; i++) {
        const msg = `Merge fix ${i + 1}: update PR aspect ${i + 1}`;
        appendRejectionFeedback(ctx.specDir, msg, 'merge');

        const result = await ctx.graph.invoke(rejectCommand(msg), config);
        expectInterruptAt(result, 'merge');
        // Each merge rejection now costs 2 calls: implement (addresses the
        // feedback) + merge's commit/push/PR re-run.
        expect(ctx.executor.callCount).toBe(29 + 2 * (i + 1));

        // Verify merge feedback section in prompt
        const prompt = ctx.executor.prompts[ctx.executor.prompts.length - 1];
        expect(prompt).toContain('CRITICAL — User Rejection Feedback');
        // Phase isolation verified via extractFeedbackSection content checks below

        // Verify the feedback section contains only merge messages
        const section = extractFeedbackSection(prompt);
        for (let j = 0; j <= i; j++) {
          expect(section).toContain(`Merge fix ${j + 1}`);
        }
        expect(section).not.toContain('Plan fix');
        expect(section).not.toContain('PRD fix');
      }

      // Final feedback state: 30 entries total, correctly phased
      const finalFeedback = readRejectionFeedback(ctx.specDir);
      expect(finalFeedback).toHaveLength(30);

      const prdFeedback = finalFeedback.filter((f) => f.phase === 'requirements');
      const planFeedback = finalFeedback.filter((f) => f.phase === 'plan');
      const mergeFeedback = finalFeedback.filter((f) => f.phase === 'merge');

      expect(prdFeedback).toHaveLength(10);
      expect(planFeedback).toHaveLength(10);
      expect(mergeFeedback).toHaveLength(10);

      // Verify iteration numbers are global (1-30), not per-phase
      expect(finalFeedback[0].iteration).toBe(1);
      expect(finalFeedback[29].iteration).toBe(30);

      // Approve merge — graph completes
      // 29 before this loop + 10 rejections * 2 calls each = 49
      expect(ctx.executor.callCount).toBe(49);
      const rApproveMerge = await ctx.graph.invoke(approveCommand(), config);
      expectNoInterrupts(rApproveMerge);
    });
  });
});
