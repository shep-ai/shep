import { injectable, inject } from 'tsyringe';
import type { IIntakeItemRepository } from '../../ports/output/repositories/intake-item-repository.interface.js';
import type { IAgentExecutorProvider } from '../../ports/output/agents/agent-executor-provider.interface.js';

export interface AutoTriageIntakeItemInput {
  intakeItemId: string;
}

export interface TriageSuggestions {
  suggestedPriority?: string;
  suggestedLabels?: string[];
  triageNotes?: string;
  suggestedStateId?: string;
  suggestedAssigneeId?: string;
}

export type AutoTriageIntakeItemResult =
  | { ok: true; suggestions: TriageSuggestions }
  | { ok: false; error: string };

@injectable()
export class AutoTriageIntakeItemUseCase {
  constructor(
    @inject('IIntakeItemRepository') private readonly intakeRepo: IIntakeItemRepository,
    @inject('IAgentExecutorProvider') private readonly agentProvider: IAgentExecutorProvider
  ) {}

  async execute(input: AutoTriageIntakeItemInput): Promise<AutoTriageIntakeItemResult> {
    const item = await this.intakeRepo.findById(input.intakeItemId);
    if (!item) {
      return { ok: false, error: `Intake item not found: "${input.intakeItemId}"` };
    }

    try {
      const executor = await this.agentProvider.getExecutor();

      const prompt = [
        'Analyze the following intake item and suggest triage classification.',
        'Return a JSON object with these fields:',
        '- suggestedPriority: one of "Urgent", "High", "Medium", "Low", "None"',
        '- suggestedLabels: array of label strings',
        '- triageNotes: brief analysis of the item',
        '',
        `Title: ${item.title}`,
        item.description ? `Description: ${item.description}` : '',
        `Source: ${item.source}`,
      ]
        .filter(Boolean)
        .join('\n');

      const result = await executor.execute(prompt, {
        outputSchema: {
          type: 'object',
          properties: {
            suggestedPriority: { type: 'string' },
            suggestedLabels: { type: 'array', items: { type: 'string' } },
            triageNotes: { type: 'string' },
          },
        },
      });

      const suggestions: TriageSuggestions = JSON.parse(result.result);

      await this.intakeRepo.update(item.id, {
        suggestedPriority: suggestions.suggestedPriority,
        suggestedLabels: suggestions.suggestedLabels
          ? JSON.stringify(suggestions.suggestedLabels)
          : undefined,
        triageNotes: suggestions.triageNotes,
        suggestedStateId: suggestions.suggestedStateId,
        suggestedAssigneeId: suggestions.suggestedAssigneeId,
      });

      return { ok: true, suggestions };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `AI triage failed: ${message}` };
    }
  }
}
