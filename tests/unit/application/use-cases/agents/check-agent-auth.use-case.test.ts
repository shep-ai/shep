import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { CheckAgentAuthUseCase } from '@/application/use-cases/agents/check-agent-auth.use-case.js';
import type { ListToolsUseCase } from '@/application/use-cases/tools/list-tools.use-case.js';
import type { IAgentAuthDetectorService } from '@/application/ports/output/services/agent-auth-detector.interface.js';
import type { ISettingsRepository } from '@/application/ports/output/repositories/settings.repository.interface.js';
import type { Settings } from '@/domain/generated/output.js';
import { AgentType } from '@/domain/generated/output.js';

function makeListTools(tool: { id: string; available: boolean; installCommand?: string }) {
  return {
    execute: vi.fn().mockResolvedValue([
      {
        id: tool.id,
        installCommand: tool.installCommand,
        status: tool.available
          ? { status: 'available', toolName: tool.id }
          : { status: 'missing', toolName: tool.id },
      },
    ]),
  } as unknown as ListToolsUseCase;
}

function makeAuthDetector(authenticated: boolean): IAgentAuthDetectorService {
  return { isAuthenticated: vi.fn().mockResolvedValue(authenticated) };
}

function makeSettings(agentType: string): Settings {
  return { agent: { type: agentType } } as unknown as Settings;
}

function makeSettingsRepo(
  load: ISettingsRepository['load'] = vi.fn().mockResolvedValue(null)
): ISettingsRepository {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    load,
    update: vi.fn().mockResolvedValue(undefined),
  };
}

describe('CheckAgentAuthUseCase', () => {
  let useCase: CheckAgentAuthUseCase;
  let listTools: ListToolsUseCase;
  let detector: IAgentAuthDetectorService;
  let settingsRepo: ISettingsRepository;

  beforeEach(() => {
    listTools = makeListTools({ id: 'claude-code', available: true });
    detector = makeAuthDetector(true);
    settingsRepo = makeSettingsRepo(vi.fn().mockResolvedValue(makeSettings(AgentType.ClaudeCode)));
    useCase = new CheckAgentAuthUseCase(listTools, detector, settingsRepo);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ready when claude-code is installed and authenticated', async () => {
    const result = await useCase.execute();

    expect(result).toEqual({
      agentType: AgentType.ClaudeCode,
      installed: true,
      authenticated: true,
      label: 'Claude Code',
      binaryName: 'claude',
      installCommand: null,
      authCommand: null,
    });
    expect(detector.isAuthenticated).toHaveBeenCalledWith(AgentType.ClaudeCode, 'claude');
  });

  it('returns not-installed when the tool is missing', async () => {
    listTools = makeListTools({
      id: 'claude-code',
      available: false,
      installCommand: 'npm i -g claude',
    });
    useCase = new CheckAgentAuthUseCase(listTools, detector, settingsRepo);

    const result = await useCase.execute();

    expect(result.installed).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(result.installCommand).toBe('npm i -g claude');
    expect(result.authCommand).toBe('Install Claude Code first');
    // Detector should NOT be called when the tool isn't installed.
    expect(detector.isAuthenticated).not.toHaveBeenCalled();
  });

  it('returns needs-auth when installed but credentials are missing', async () => {
    detector = makeAuthDetector(false);
    useCase = new CheckAgentAuthUseCase(listTools, detector, settingsRepo);

    const result = await useCase.execute();

    expect(result.installed).toBe(true);
    expect(result.authenticated).toBe(false);
    expect(result.authCommand).toBe('claude');
  });

  it('marks no-tool agents (dev/demo) as ready without calling list-tools', async () => {
    settingsRepo = makeSettingsRepo(vi.fn().mockResolvedValue(makeSettings(AgentType.Dev)));
    useCase = new CheckAgentAuthUseCase(listTools, detector, settingsRepo);

    const result = await useCase.execute();

    expect(result).toEqual({
      agentType: AgentType.Dev,
      installed: true,
      authenticated: true,
      label: 'Demo',
      binaryName: null,
      installCommand: null,
      authCommand: null,
    });
    expect(listTools.execute).not.toHaveBeenCalled();
    expect(detector.isAuthenticated).not.toHaveBeenCalled();
  });

  it('returns unknown when settings cannot be read', async () => {
    settingsRepo = makeSettingsRepo(
      vi.fn().mockRejectedValue(new Error('settings not initialized'))
    );
    useCase = new CheckAgentAuthUseCase(listTools, detector, settingsRepo);

    const result = await useCase.execute();

    expect(result.agentType).toBe('unknown');
    expect(result.label).toBe('Unknown');
    expect(result.installed).toBe(false);
    expect(result.authenticated).toBe(false);
  });

  it('returns unknown when settings repository returns null', async () => {
    settingsRepo = makeSettingsRepo(vi.fn().mockResolvedValue(null));
    useCase = new CheckAgentAuthUseCase(listTools, detector, settingsRepo);

    const result = await useCase.execute();

    expect(result.agentType).toBe('unknown');
    expect(result.label).toBe('Unknown');
  });

  it('returns unknown agentType for an unrecognised agent', async () => {
    settingsRepo = makeSettingsRepo(vi.fn().mockResolvedValue(makeSettings('made-up-agent')));
    useCase = new CheckAgentAuthUseCase(listTools, detector, settingsRepo);

    const result = await useCase.execute();

    expect(result.agentType).toBe('made-up-agent');
    expect(result.label).toBe('Unknown');
    expect(result.installed).toBe(false);
  });

  it('treats list-tools failures as not-installed', async () => {
    listTools = {
      execute: vi.fn().mockRejectedValue(new Error('catalogue down')),
    } as unknown as ListToolsUseCase;
    useCase = new CheckAgentAuthUseCase(listTools, detector, settingsRepo);

    const result = await useCase.execute();

    expect(result.installed).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(detector.isAuthenticated).not.toHaveBeenCalled();
  });

  it('marks OpenRouter as ready without calling list-tools (null toolId)', async () => {
    settingsRepo = makeSettingsRepo(vi.fn().mockResolvedValue(makeSettings(AgentType.OpenRouter)));
    useCase = new CheckAgentAuthUseCase(listTools, detector, settingsRepo);

    const result = await useCase.execute();

    expect(result).toEqual({
      agentType: AgentType.OpenRouter,
      installed: true,
      authenticated: true,
      label: 'OpenRouter',
      binaryName: null,
      installCommand: null,
      authCommand: null,
    });
    expect(listTools.execute).not.toHaveBeenCalled();
    expect(detector.isAuthenticated).not.toHaveBeenCalled();
  });

  it('marks Together AI as ready without calling list-tools (null toolId)', async () => {
    settingsRepo = makeSettingsRepo(vi.fn().mockResolvedValue(makeSettings(AgentType.TogetherAi)));
    useCase = new CheckAgentAuthUseCase(listTools, detector, settingsRepo);

    const result = await useCase.execute();

    expect(result).toEqual({
      agentType: AgentType.TogetherAi,
      installed: true,
      authenticated: true,
      label: 'Together AI',
      binaryName: null,
      installCommand: null,
      authCommand: null,
    });
    expect(listTools.execute).not.toHaveBeenCalled();
    expect(detector.isAuthenticated).not.toHaveBeenCalled();
  });

  it('marks Ollama as ready without calling list-tools (null toolId)', async () => {
    settingsRepo = makeSettingsRepo(vi.fn().mockResolvedValue(makeSettings(AgentType.Ollama)));
    useCase = new CheckAgentAuthUseCase(listTools, detector, settingsRepo);

    const result = await useCase.execute();

    expect(result).toEqual({
      agentType: AgentType.Ollama,
      installed: true,
      authenticated: true,
      label: 'Ollama',
      binaryName: null,
      installCommand: null,
      authCommand: null,
    });
    expect(listTools.execute).not.toHaveBeenCalled();
    expect(detector.isAuthenticated).not.toHaveBeenCalled();
  });
});
