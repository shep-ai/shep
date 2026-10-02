import type { Meta, StoryObj } from '@storybook/react';
import { DecisionProviderKind } from '@shepai/core/domain/generated/output';
import { HarnessDecisionProviderFields } from './harness-decision-provider-fields';

const meta: Meta<typeof HarnessDecisionProviderFields> = {
  title: 'Settings/HarnessDecisionProviderFields',
  component: HarnessDecisionProviderFields,
  tags: ['autodocs'],
  args: { onChange: () => undefined },
};

export default meta;
type Story = StoryObj<typeof HarnessDecisionProviderFields>;

/** Deterministic: no network, nothing to configure. */
export const Deterministic: Story = {
  args: { provider: { id: 'context', kind: DecisionProviderKind.Deterministic } },
};

/** A local OpenAI-compatible server (Ollama, vLLM, llama.cpp, LM Studio). */
export const OpenAiCompatible: Story = {
  args: {
    provider: {
      id: 'context',
      kind: DecisionProviderKind.OpenAiCompatible,
      endpoint: 'http://localhost:11434/v1',
      model: 'qwen2.5:3b',
    },
  },
};

/** Jev with its key in an environment variable. */
export const Jev: Story = {
  args: {
    provider: {
      id: 'context',
      kind: DecisionProviderKind.Jev,
      endpoint: 'https://api.jev.example',
      apiKeyEnv: 'JEV_API_KEY',
    },
  },
};
