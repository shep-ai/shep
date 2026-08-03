/**
 * ResumeAgentSessionUseCase Unit Tests
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ResumeAgentSessionUseCase,
  AgentResumeUnsupportedError,
} from '@/application/use-cases/agents/resume-agent-session.use-case.js';
import type { CreateTerminalSessionUseCase } from '@/application/use-cases/terminal/create-terminal-session.use-case.js';
import type { ITerminalSessionService } from '@/application/ports/output/services/terminal-session-service.interface.js';
import { AgentType } from '@/domain/generated/output.js';

const CWD = '/Users/dev/project';
const SESSION_ID = '3f1a9c40-1d2b-4e77-9c11-2a5b6d8e0f34';

describe('ResumeAgentSessionUseCase', () => {
  let createTerminal: CreateTerminalSessionUseCase;
  let terminals: ITerminalSessionService;
  let useCase: ResumeAgentSessionUseCase;

  beforeEach(() => {
    createTerminal = {
      execute: vi.fn().mockResolvedValue({ id: 'term-1', shell: '/bin/zsh', cwd: CWD }),
    } as unknown as CreateTerminalSessionUseCase;

    terminals = {
      create: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      subscribe: vi.fn(),
      exists: vi.fn(),
      close: vi.fn(),
    };

    useCase = new ResumeAgentSessionUseCase(createTerminal, terminals);
  });

  it('spawns the terminal at the session cwd', async () => {
    await useCase.execute({ sessionId: SESSION_ID, agentType: AgentType.ClaudeCode, cwd: CWD });

    expect(createTerminal.execute).toHaveBeenCalledWith(expect.objectContaining({ cwd: CWD }));
  });

  it('writes the resume command into the shell', async () => {
    await useCase.execute({ sessionId: SESSION_ID, agentType: AgentType.ClaudeCode, cwd: CWD });

    expect(terminals.write).toHaveBeenCalledWith('term-1', `claude --resume ${SESSION_ID}\n`);
  });

  it('uses the cursor-agent binary for a Cursor session', async () => {
    await useCase.execute({ sessionId: SESSION_ID, agentType: AgentType.Cursor, cwd: CWD });

    expect(terminals.write).toHaveBeenCalledWith('term-1', `cursor-agent --resume ${SESSION_ID}\n`);
  });

  it('never writes a --project flag', async () => {
    await useCase.execute({ sessionId: SESSION_ID, agentType: AgentType.ClaudeCode, cwd: CWD });

    const written = vi.mocked(terminals.write).mock.calls[0][1];
    expect(written).not.toContain('--project');
  });

  it('returns the descriptor so presentation never rebuilds the command', async () => {
    const result = await useCase.execute({
      sessionId: SESSION_ID,
      agentType: AgentType.ClaudeCode,
      cwd: CWD,
    });

    expect(result.descriptor.binary).toBe('claude');
    expect(result.descriptor.args).toEqual(['--resume', SESSION_ID]);
    expect(result.terminal.id).toBe('term-1');
  });

  it('forwards terminal dimensions when provided', async () => {
    await useCase.execute({
      sessionId: SESSION_ID,
      agentType: AgentType.ClaudeCode,
      cwd: CWD,
      cols: 120,
      rows: 40,
    });

    expect(createTerminal.execute).toHaveBeenCalledWith(
      expect.objectContaining({ cols: 120, rows: 40 })
    );
  });

  it('fails without spawning anything for an unsupported provider', async () => {
    await expect(
      useCase.execute({ sessionId: SESSION_ID, agentType: AgentType.Aider, cwd: CWD })
    ).rejects.toThrow(AgentResumeUnsupportedError);

    expect(createTerminal.execute).not.toHaveBeenCalled();
    expect(terminals.write).not.toHaveBeenCalled();
  });

  it('fails without spawning anything for a shell-unsafe session id', async () => {
    await expect(
      useCase.execute({
        sessionId: 'id; rm -rf /',
        agentType: AgentType.ClaudeCode,
        cwd: CWD,
      })
    ).rejects.toThrow(AgentResumeUnsupportedError);

    expect(createTerminal.execute).not.toHaveBeenCalled();
  });

  it('describe() returns the descriptor without starting a terminal', () => {
    const descriptor = useCase.describe({
      sessionId: SESSION_ID,
      agentType: AgentType.ClaudeCode,
      cwd: CWD,
    });

    expect(descriptor.displayCommand).toBe(`claude --resume ${SESSION_ID}`);
    expect(createTerminal.execute).not.toHaveBeenCalled();
  });

  it('describe() throws for an unsupported provider', () => {
    expect(() =>
      useCase.describe({ sessionId: SESSION_ID, agentType: AgentType.Ollama, cwd: CWD })
    ).toThrow(AgentResumeUnsupportedError);
  });
});
