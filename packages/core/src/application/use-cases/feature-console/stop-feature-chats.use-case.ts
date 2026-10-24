/**
 * Stop Feature Chats Use Case (spec 147)
 *
 * Interactive chat sessions run inside the process that booted them. A
 * surface that booted some (the terminal console) stops them before it exits,
 * so their agent processes do not outlive it. Never throws.
 */

import { inject, injectable } from 'tsyringe';
import { StopInteractiveSessionUseCase } from '../interactive/stop-interactive-session.use-case.js';

@injectable()
export class StopFeatureChatsUseCase {
  constructor(
    @inject(StopInteractiveSessionUseCase)
    private readonly stop: StopInteractiveSessionUseCase
  ) {}

  async execute(featureIds: readonly string[]): Promise<void> {
    await Promise.all(
      featureIds.map((featureId) => this.stop.execute({ featureId }).catch(() => undefined))
    );
  }
}
