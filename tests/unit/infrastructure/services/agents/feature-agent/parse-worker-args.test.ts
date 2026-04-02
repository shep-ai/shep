/**
 * parseWorkerArgs Unit Tests - Resume Payload
 */

import { describe, it, expect } from 'vitest';
import { parseWorkerArgs } from '@/infrastructure/services/agents/feature-agent/feature-agent-worker.js';
import { AgentType, FeatureMode } from '@/domain/generated/output.js';

describe('parseWorkerArgs - agentType', () => {
  const baseArgs = [
    '--feature-id',
    'feat-001',
    '--run-id',
    'run-001',
    '--repo',
    '/tmp/repo',
    '--spec-dir',
    '/tmp/spec',
  ];

  it('should parse --agent-type when present', () => {
    const args = parseWorkerArgs([...baseArgs, '--agent-type', 'claude-code']);
    expect(args.agentType).toBe(AgentType.ClaudeCode);
  });

  it('should set agentType to undefined when --agent-type is not present', () => {
    const args = parseWorkerArgs(baseArgs);
    expect(args.agentType).toBeUndefined();
  });

  it('should coexist with other flags including --resume and --resume-payload', () => {
    const payload = JSON.stringify({ approved: true });
    const args = parseWorkerArgs([
      ...baseArgs,
      '--agent-type',
      'dev',
      '--resume',
      '--resume-from-interrupt',
      '--resume-payload',
      payload,
      '--thread-id',
      'thread-001',
    ]);
    expect(args.agentType).toBe(AgentType.Dev);
    expect(args.resume).toBe(true);
    expect(args.resumeFromInterrupt).toBe(true);
    expect(args.resumePayload).toBe(payload);
    expect(args.threadId).toBe('thread-001');
  });
});

describe('parseWorkerArgs - mode', () => {
  const baseArgs = [
    '--feature-id',
    'feat-001',
    '--run-id',
    'run-001',
    '--repo',
    '/tmp/repo',
    '--spec-dir',
    '/tmp/spec',
  ];

  it('should parse --mode when present', () => {
    const args = parseWorkerArgs([...baseArgs, '--mode', 'Fast']);
    expect(args.mode).toBe(FeatureMode.Fast);
  });

  it('should default mode to Regular when --mode is not present', () => {
    const args = parseWorkerArgs(baseArgs);
    expect(args.mode).toBe(FeatureMode.Regular);
  });

  it('should coexist with other flags', () => {
    const args = parseWorkerArgs([
      ...baseArgs,
      '--mode',
      'Fast',
      '--push',
      '--open-pr',
      '--thread-id',
      'thread-001',
    ]);
    expect(args.mode).toBe(FeatureMode.Fast);
    expect(args.push).toBe(true);
    expect(args.openPr).toBe(true);
    expect(args.threadId).toBe('thread-001');
  });
});

describe('parseWorkerArgs - model', () => {
  const baseArgs = [
    '--feature-id',
    'feat-001',
    '--run-id',
    'run-001',
    '--repo',
    '/tmp/repo',
    '--spec-dir',
    '/tmp/spec',
  ];

  it('should parse --model when present', () => {
    const args = parseWorkerArgs([...baseArgs, '--model', 'claude-haiku-4-5']);
    expect(args.model).toBe('claude-haiku-4-5');
  });

  it('should set model to undefined when --model is not present', () => {
    const args = parseWorkerArgs(baseArgs);
    expect(args.model).toBeUndefined();
  });

  it('should coexist with --agent-type and other flags', () => {
    const args = parseWorkerArgs([
      ...baseArgs,
      '--model',
      'claude-opus-4-6',
      '--agent-type',
      'claude-code',
      '--mode',
      'Fast',
      '--push',
    ]);
    expect(args.model).toBe('claude-opus-4-6');
    expect(args.agentType).toBe(AgentType.ClaudeCode);
    expect(args.mode).toBe(FeatureMode.Fast);
    expect(args.push).toBe(true);
  });
});

describe('parseWorkerArgs - resumeReason', () => {
  const baseArgs = [
    '--feature-id',
    'feat-001',
    '--run-id',
    'run-001',
    '--repo',
    '/tmp/repo',
    '--spec-dir',
    '/tmp/spec',
  ];

  it('should parse --resume-reason when present', () => {
    const args = parseWorkerArgs([...baseArgs, '--resume-reason', 'interrupted']);
    expect(args.resumeReason).toBe('interrupted');
  });

  it('should set resumeReason to undefined when not present', () => {
    const args = parseWorkerArgs(baseArgs);
    expect(args.resumeReason).toBeUndefined();
  });

  it('should parse failed reason', () => {
    const args = parseWorkerArgs([...baseArgs, '--resume-reason', 'failed']);
    expect(args.resumeReason).toBe('failed');
  });

  it('should coexist with --resume and other flags', () => {
    const args = parseWorkerArgs([
      ...baseArgs,
      '--resume',
      '--resume-reason',
      'interrupted',
      '--thread-id',
      'thread-001',
    ]);
    expect(args.resumeReason).toBe('interrupted');
    expect(args.resume).toBe(true);
    expect(args.threadId).toBe('thread-001');
  });
});

describe('parseWorkerArgs - resumePayload', () => {
  const baseArgs = [
    '--feature-id',
    'feat-001',
    '--run-id',
    'run-001',
    '--repo',
    '/tmp/repo',
    '--spec-dir',
    '/tmp/spec',
  ];

  it('should parse --resume-payload when present', () => {
    const payload = JSON.stringify({
      approved: true,
      changedSelections: [{ questionId: 'q1', selectedOption: 'A' }],
    });
    const args = parseWorkerArgs([...baseArgs, '--resume-payload', payload]);
    expect(args.resumePayload).toBe(payload);
  });

  it('should set resumePayload to undefined when not present', () => {
    const args = parseWorkerArgs(baseArgs);
    expect(args.resumePayload).toBeUndefined();
  });

  it('should parse rejection payload', () => {
    const payload = JSON.stringify({ rejected: true, feedback: 'fix X', iteration: 2 });
    const args = parseWorkerArgs([...baseArgs, '--resume-payload', payload]);
    expect(args.resumePayload).toBe(payload);
  });

  it('should coexist with other flags', () => {
    const payload = JSON.stringify({ approved: true });
    const args = parseWorkerArgs([
      ...baseArgs,
      '--resume',
      '--resume-from-interrupt',
      '--resume-payload',
      payload,
      '--thread-id',
      'thread-001',
    ]);
    expect(args.resumePayload).toBe(payload);
    expect(args.resume).toBe(true);
    expect(args.resumeFromInterrupt).toBe(true);
    expect(args.threadId).toBe('thread-001');
  });
});
