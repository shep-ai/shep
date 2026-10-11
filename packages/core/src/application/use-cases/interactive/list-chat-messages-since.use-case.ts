/**
 * List Chat Messages Since Use Case (spec 137)
 *
 * Messages of one conversation written after a point in time. An open chat
 * stream calls it to pick up rows another process wrote — an agent's
 * `shep chat block` call or an MCP server — which the in-process session
 * subscribers never see.
 */

import { injectable, inject } from 'tsyringe';
import type { IInteractiveMessageRepository } from '../../ports/output/repositories/interactive-message-repository.interface.js';
import type { InteractiveMessage } from '../../../domain/generated/output.js';

export interface ListChatMessagesSinceInput {
  scope: string;
  since: Date;
}

@injectable()
export class ListChatMessagesSinceUseCase {
  constructor(
    @inject('IInteractiveMessageRepository')
    private readonly messages: IInteractiveMessageRepository
  ) {}

  execute(input: ListChatMessagesSinceInput): Promise<InteractiveMessage[]> {
    return this.messages.findByFeatureIdSince(input.scope, input.since);
  }
}
