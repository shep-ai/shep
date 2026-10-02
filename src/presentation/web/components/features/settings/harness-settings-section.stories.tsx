import type { Meta, StoryObj } from '@storybook/react';
import { AgentType, DecisionProviderKind, HarnessMode } from '@shepai/core/domain/generated/output';
import { HarnessSettingsSection } from './harness-settings-section';

const meta: Meta<typeof HarnessSettingsSection> = {
  title: 'Settings/HarnessSettingsSection',
  component: HarnessSettingsSection,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HarnessSettingsSection>;

/** Defaults: query-aware mode on OpenRouter, deterministic context scoring. */
export const Default: Story = { args: { harness: undefined } };

/** Fully open-source: a local Ollama backend and an OpenAI-compatible scorer. */
export const OpenSourceStack: Story = {
  args: {
    harness: {
      backendAgentType: AgentType.Ollama,
      backendModel: 'qwen2.5-coder:14b',
      decisions: {
        providers: [
          {
            id: 'context',
            kind: DecisionProviderKind.OpenAiCompatible,
            endpoint: 'http://localhost:11434/v1',
            model: 'qwen2.5:3b',
          },
        ],
        routes: { chunkVisibility: 'context' },
        defaultProviderId: 'deterministic',
        fallbackProviderIds: [],
      },
    },
  },
};

/** Jev scores context relevance; the key comes from an environment variable. */
export const JevProvider: Story = {
  args: {
    harness: {
      decisions: {
        providers: [
          {
            id: 'context',
            kind: DecisionProviderKind.Jev,
            endpoint: 'https://api.jev.example',
            apiKeyEnv: 'JEV_API_KEY',
          },
        ],
        routes: { chunkVisibility: 'context' },
        defaultProviderId: 'deterministic',
        fallbackProviderIds: [],
      },
    },
  },
};

/** Shadow context routing: runs as baseline, records query-aware plans. */
export const ShadowMode: Story = {
  args: {
    harness: {
      mode: HarnessMode.Baseline,
      shadow: { contextRouter: true, permissions: true, toolRouter: false },
    },
  },
};
