import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the settings service module so the use case reads our fake agent type.
vi.mock('@/infrastructure/services/settings.service.js', () => ({
  getSettings: vi.fn(),
}));

import { CheckAgentAuthUseCase } from '@/application/use-cases/agents/check-agent-auth.use-case.js';
import type { ListToolsUseCase } from '@/application/use-cases/tools/list-tools.use-case.js';
import { getSettings } from '@/infrastructure/services/settings.service.js';
import type { IAgentAuthDetectorService } from '@/application/ports/output/services/agent-auth-detector.interface.js';
import { AgentType } from '@/domain/generated/output.js';

const mockGetSettings = vi.mocked(getSettings);

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

function makeSettings(agentType: string) {
  return { agent: { type: agentType } } as unknown as ReturnType<typeof getSettings>;
}

describe('CheckAgentAuthUseCase', () => {
  let useCase: CheckAgentAuthUseCase;
  let listTools: ListToolsUseCase;
  let detector: IAgentAuthDetectorService;

  beforeEach(() => {
    listTools = makeListTools({ id: 'claude-code', available: true });
    detector = makeAuthDetector(true);
    useCase = new CheckAgentAuthUseCase(listTools, detector);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ready when claude-code is installed and authenticated', async () => {
    mockGetSettings.mockReturnValue(makeSettings(AgentType.ClaudeCode));

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
    mockGetSettings.mockReturnValue(makeSettings(AgentType.ClaudeCode));
    listTools = makeListTools({
      id: 'claude-code',
      available: false,
      installCommand: 'npm i -g claude',
    });
    useCase = new CheckAgentAuthUseCase(listTools, detector);

    const result = await useCase.execute();

    expect(result.installed).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(result.installCommand).toBe('npm i -g claude');
    expect(result.authCommand).toBe('Install Claude Code first');
    // Detector should NOT be called when the tool isn't installed.
    expect(detector.isAuthenticated).not.toHaveBeenCalled();
  });

  it('returns needs-auth when installed but credentials are missing', async () => {
    mockGetSettings.mockReturnValue(makeSettings(AgentType.ClaudeCode));
    detector = makeAuthDetector(false);
    useCase = new CheckAgentAuthUseCase(listTools, detector);

    const result = await useCase.execute();

    expect(result.installed).toBe(true);
    expect(result.authenticated).toBe(false);
    expect(result.authCommand).toBe('claude');
  });

  it('marks no-tool agents (dev/demo) as ready without calling list-tools', async () => {
    mockGetSettings.mockReturnValue(makeSettings(AgentType.Dev));

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
    mockGetSettings.mockImplementation(() => {
      throw new Error('settings not initialized');
    });

    const result = await useCase.execute();

    expect(result.agentType).toBe('unknown');
    expect(result.label).toBe('Unknown');
    expect(result.installed).toBe(false);
    expect(result.authenticated).toBe(false);
  });

  it('returns unknown agentType for an unrecognised agent', async () => {
    mockGetSettings.mockReturnValue(makeSettings('made-up-agent'));

    const result = await useCase.execute();

    expect(result.agentType).toBe('made-up-agent');
    expect(result.label).toBe('Unknown');
    expect(result.installed).toBe(false);
  });

  it('treats list-tools failures as not-installed', async () => {
    mockGetSettings.mockReturnValue(makeSettings(AgentType.ClaudeCode));
    listTools = {
      execute: vi.fn().mockRejectedValue(new Error('catalogue down')),
    } as unknown as ListToolsUseCase;
    useCase = new CheckAgentAuthUseCase(listTools, detector);

    const result = await useCase.execute();

    expect(result.installed).toBe(false);
    expect(result.authenticated).toBe(false);
    expect(detector.isAuthenticated).not.toHaveBeenCalled();
  });
});
