/**
 * Set Default Effort Use Case
 *
 * Sets or clears `settings.models.effort`, the reasoning effort new feature
 * runs are pinned with. Every presentation layer (CLI, web) goes through here,
 * so validation and the set/clear rule live in one place.
 *
 * Business Rules:
 * - A known level (case/whitespace-insensitive) is stored as-is
 * - null, undefined or '' clears the setting: runs use the agent's own default
 * - Any other value is rejected and nothing is persisted
 */

import { injectable, inject } from 'tsyringe';
import type { Settings } from '../../../domain/generated/output.js';
import { AGENT_EFFORT_LEVELS, parseAgentEffort } from '../../../domain/shared/agent-effort.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';

export interface SetDefaultEffortInput {
  /** Effort level, or null/undefined/'' for "agent default". */
  effort: string | null | undefined;
}

@injectable()
export class SetDefaultEffortUseCase {
  constructor(
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository
  ) {}

  async execute(input: SetDefaultEffortInput): Promise<Settings> {
    const raw = input.effort?.trim() ?? '';
    const effort = parseAgentEffort(raw);
    if (raw && !effort) {
      throw new Error(
        `Unknown effort "${input.effort}". Valid levels: ${AGENT_EFFORT_LEVELS.join(', ')}`
      );
    }

    const settings = await this.settingsRepository.load();
    if (!settings) {
      throw new Error('Settings not initialized');
    }

    const { effort: _previous, ...models } = settings.models;
    const next: Settings = {
      ...settings,
      models: effort ? { ...models, effort } : models,
      updatedAt: new Date(),
    };

    await this.settingsRepository.update(next);
    return next;
  }
}
