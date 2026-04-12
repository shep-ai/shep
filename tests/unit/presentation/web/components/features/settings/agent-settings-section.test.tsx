import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentSettingsSection } from '@/components/features/settings/agent-settings-section';
import { AgentType, AgentAuthMethod } from '@shepai/core/domain/generated/output';

const mockUpdateSettingsAction = vi.fn();

vi.mock('@/app/actions/update-settings', () => ({
  updateSettingsAction: (...args: unknown[]) => mockUpdateSettingsAction(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('AgentSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSettingsAction.mockResolvedValue({ success: true });
  });

  it('renders agent type select with current value', () => {
    render(
      <AgentSettingsSection
        agent={{ type: AgentType.ClaudeCode, authMethod: AgentAuthMethod.Session }}
      />
    );
    expect(screen.getByTestId('agent-type-select')).toBeDefined();
    expect(screen.getByText('Preferred Agent')).toBeDefined();
  });

  it('renders auth method select', () => {
    render(
      <AgentSettingsSection
        agent={{ type: AgentType.ClaudeCode, authMethod: AgentAuthMethod.Session }}
      />
    );
    expect(screen.getByTestId('auth-method-select')).toBeDefined();
  });

  it('does not render token input when authMethod is session', () => {
    render(
      <AgentSettingsSection
        agent={{ type: AgentType.ClaudeCode, authMethod: AgentAuthMethod.Session }}
      />
    );
    expect(screen.queryByTestId('agent-token-input')).toBeNull();
  });

  it('renders token input when authMethod is token', () => {
    render(
      <AgentSettingsSection
        agent={{ type: AgentType.GeminiCli, authMethod: AgentAuthMethod.Token, token: 'sk-123' }}
      />
    );
    expect(screen.getByTestId('agent-token-input')).toBeDefined();
  });

  it('does not render a save button (auto-saves on change)', () => {
    render(
      <AgentSettingsSection
        agent={{ type: AgentType.ClaudeCode, authMethod: AgentAuthMethod.Session }}
      />
    );
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });

  it('renders toggle for token visibility', () => {
    render(
      <AgentSettingsSection
        agent={{ type: AgentType.ClaudeCode, authMethod: AgentAuthMethod.Token, token: 'test' }}
      />
    );
    expect(screen.getByTestId('toggle-token-visibility')).toBeDefined();
  });

  it('renders section description', () => {
    render(
      <AgentSettingsSection
        agent={{ type: AgentType.ClaudeCode, authMethod: AgentAuthMethod.Session }}
      />
    );
    expect(screen.getByText('Choose your AI coding agent and authentication method')).toBeDefined();
  });

  it('renders token input when OpenRouter is selected with token auth', () => {
    render(
      <AgentSettingsSection
        agent={{ type: AgentType.OpenRouter, authMethod: AgentAuthMethod.Token, token: 'or-key' }}
      />
    );
    expect(screen.getByTestId('agent-token-input')).toBeDefined();
  });

  it('renders token input when Together AI is selected with token auth', () => {
    render(
      <AgentSettingsSection
        agent={{ type: AgentType.TogetherAi, authMethod: AgentAuthMethod.Token, token: 'tai-key' }}
      />
    );
    expect(screen.getByTestId('agent-token-input')).toBeDefined();
  });

  it('renders helper text for SDK agents requiring API key', () => {
    render(
      <AgentSettingsSection
        agent={{ type: AgentType.OpenRouter, authMethod: AgentAuthMethod.Token }}
      />
    );
    expect(screen.getByText(/requires an API key/i)).toBeDefined();
  });

  it('renders Ollama with session auth (no token required)', () => {
    render(
      <AgentSettingsSection
        agent={{ type: AgentType.Ollama, authMethod: AgentAuthMethod.Session }}
      />
    );
    expect(screen.getByTestId('agent-type-select')).toBeDefined();
    expect(screen.queryByTestId('agent-token-input')).toBeNull();
  });
});
