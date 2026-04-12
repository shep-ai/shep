/**
 * Agent Select Prompt Config Unit Tests
 *
 * TDD Phase: RED -> GREEN
 */

import { describe, it, expect } from 'vitest';
import { createAgentSelectConfig } from '../../../../../src/presentation/tui/prompts/agent-select.prompt.js';
import { AgentType } from '../../../../../packages/core/src/domain/generated/output.js';

describe('createAgentSelectConfig', () => {
  it('includes a Dev (Mock) choice with value "dev"', () => {
    const config = createAgentSelectConfig();
    const devChoice = config.choices.find((c) => c.value === AgentType.Dev);
    expect(devChoice).toBeDefined();
    expect(devChoice?.name).toContain('Dev (Mock)');
  });

  it('Dev (Mock) choice is not disabled', () => {
    const config = createAgentSelectConfig();
    const devChoice = config.choices.find((c) => c.value === AgentType.Dev);
    expect(devChoice).toBeDefined();
    expect((devChoice as { disabled?: unknown }).disabled).toBeFalsy();
  });

  it('Dev (Mock) choice has the correct description', () => {
    const config = createAgentSelectConfig();
    const devChoice = config.choices.find((c) => c.value === AgentType.Dev);
    expect((devChoice as { description?: string }).description).toBe(
      'Local development mock — no agent binary required'
    );
  });

  it('Dev (Mock) choice appears before disabled (Coming Soon) entries', () => {
    const config = createAgentSelectConfig();
    const devIndex = config.choices.findIndex((c) => c.value === AgentType.Dev);
    const disabledIndices = config.choices
      .map((c, i) => ((c as { disabled?: unknown }).disabled ? i : -1))
      .filter((i) => i !== -1);
    expect(devIndex).toBeGreaterThanOrEqual(0);
    disabledIndices.forEach((disabledIndex) => {
      expect(devIndex).toBeLessThan(disabledIndex);
    });
  });

  it('includes an OpenRouter choice with correct value', () => {
    const config = createAgentSelectConfig();
    const choice = config.choices.find((c) => c.value === AgentType.OpenRouter);
    expect(choice).toBeDefined();
    expect(choice?.name).toBe('OpenRouter');
  });

  it('includes a Together AI choice with correct value', () => {
    const config = createAgentSelectConfig();
    const choice = config.choices.find((c) => c.value === AgentType.TogetherAi);
    expect(choice).toBeDefined();
    expect(choice?.name).toBe('Together AI');
  });

  it('OpenRouter and Together AI choices are not disabled', () => {
    const config = createAgentSelectConfig();
    const openRouter = config.choices.find((c) => c.value === AgentType.OpenRouter);
    const togetherAi = config.choices.find((c) => c.value === AgentType.TogetherAi);
    expect((openRouter as { disabled?: unknown }).disabled).toBeFalsy();
    expect((togetherAi as { disabled?: unknown }).disabled).toBeFalsy();
  });

  it('OpenRouter and Together AI appear before Coming Soon entries', () => {
    const config = createAgentSelectConfig();
    const openRouterIndex = config.choices.findIndex((c) => c.value === AgentType.OpenRouter);
    const togetherAiIndex = config.choices.findIndex((c) => c.value === AgentType.TogetherAi);
    const disabledIndices = config.choices
      .map((c, i) => ((c as { disabled?: unknown }).disabled ? i : -1))
      .filter((i) => i !== -1);
    expect(openRouterIndex).toBeGreaterThanOrEqual(0);
    expect(togetherAiIndex).toBeGreaterThanOrEqual(0);
    disabledIndices.forEach((disabledIndex) => {
      expect(openRouterIndex).toBeLessThan(disabledIndex);
      expect(togetherAiIndex).toBeLessThan(disabledIndex);
    });
  });

  it('includes an Ollama choice with correct value', () => {
    const config = createAgentSelectConfig();
    const choice = config.choices.find((c) => c.value === AgentType.Ollama);
    expect(choice).toBeDefined();
    expect(choice?.name).toBe('Ollama');
  });

  it('Ollama choice is not disabled', () => {
    const config = createAgentSelectConfig();
    const ollama = config.choices.find((c) => c.value === AgentType.Ollama);
    expect((ollama as { disabled?: unknown }).disabled).toBeFalsy();
  });

  it('Ollama appears before Coming Soon entries', () => {
    const config = createAgentSelectConfig();
    const ollamaIndex = config.choices.findIndex((c) => c.value === AgentType.Ollama);
    const disabledIndices = config.choices
      .map((c, i) => ((c as { disabled?: unknown }).disabled ? i : -1))
      .filter((i) => i !== -1);
    expect(ollamaIndex).toBeGreaterThanOrEqual(0);
    disabledIndices.forEach((disabledIndex) => {
      expect(ollamaIndex).toBeLessThan(disabledIndex);
    });
  });
});
