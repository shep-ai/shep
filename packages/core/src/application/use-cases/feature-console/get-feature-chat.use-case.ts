/**
 * Get Feature Chat Use Case (spec 147)
 *
 * A feature's agent chat — the conversation the web UI's Chat tab shows —
 * ready to render on any surface: transcript entries with display text, the
 * agent's in-progress text, whether it is working, and its open question.
 * Never throws: an unknown feature or a turned-off agent comes back as
 * `available: false` with a reason.
 */

import { inject, injectable } from 'tsyringe';
import {
  ChatTurnStatus,
  FeatureChatEntryKind,
  InteractiveMessageRole,
  InteractiveSessionStatus,
  type InteractiveMessage,
} from '../../../domain/generated/output.js';
import { chatMessageDisplayText, isChatBlockMessage } from '../../../domain/shared/chat-block.js';
import { parseToolEventMessage } from '../../../domain/shared/chat-tool-event.js';
import { parseInteractionAnswerMessage } from '../../../domain/shared/interaction-answer.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import type { IFileSystemService } from '../../ports/output/services/file-system-service.interface.js';
import type { ISettingsProvider } from '../../ports/output/services/settings-provider.interface.js';
import type { IWorktreePathProvider } from '../../ports/output/services/worktree-path-provider.interface.js';
import type { ChatState } from '../../ports/output/services/interactive-session-service.interface.js';
import { GetInteractiveChatStateUseCase } from '../interactive/get-interactive-chat-state.use-case.js';
import type { FeatureChat, FeatureChatEntry, FeatureChatQuestion } from './feature-chat.types.js';
import { resolveFeatureDirectory } from './feature-directory.js';
import { findFeatureByIdOrPrefix } from './find-feature.js';
import { interactiveAgentDisabledReason } from './feature-chat-availability.js';

export interface GetFeatureChatInput {
  /** Feature id or id prefix. */
  featureId: string;
  /** How many of the newest entries to return. */
  maxEntries: number;
}

const ANSWER_ARROW = ' → ';
const ANSWER_SEPARATOR = '; ';

@injectable()
export class GetFeatureChatUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject('IWorktreePathProvider')
    private readonly worktreePaths: IWorktreePathProvider,
    @inject('IFileSystemService')
    private readonly fileSystem: IFileSystemService,
    @inject('ISettingsProvider')
    private readonly settings: ISettingsProvider,
    @inject(GetInteractiveChatStateUseCase)
    private readonly chatState: GetInteractiveChatStateUseCase
  ) {}

  async execute(input: GetFeatureChatInput): Promise<FeatureChat> {
    const unavailable = (reason: string, base: Partial<FeatureChat> = {}): FeatureChat => ({
      featureId: input.featureId,
      name: '',
      directory: '',
      busy: false,
      entries: [],
      questions: [],
      ...base,
      available: false,
      unavailableReason: reason,
    });
    try {
      const feature = await findFeatureByIdOrPrefix(this.featureRepo, input.featureId);
      if (!feature) return unavailable(`Feature not found: ${input.featureId}`);
      const base = {
        featureId: feature.id,
        name: feature.name,
        directory: resolveFeatureDirectory(feature, this.worktreePaths, this.fileSystem),
      };
      const disabled = interactiveAgentDisabledReason(this.settings);
      if (disabled) return unavailable(disabled, base);

      const state = await this.chatState.execute({ featureId: feature.id });
      return {
        ...base,
        available: true,
        ...(state.sessionStatus && { sessionStatus: state.sessionStatus }),
        busy:
          state.turnStatus === ChatTurnStatus.Processing ||
          state.sessionStatus === InteractiveSessionStatus.booting,
        ...(state.streamingText && { streamingText: state.streamingText }),
        entries: toEntries(state.messages).slice(-input.maxEntries),
        questions: questionsOf(state),
      };
    } catch (error) {
      return unavailable(error instanceof Error ? error.message : String(error));
    }
  }
}

function toEntries(messages: readonly InteractiveMessage[]): FeatureChatEntry[] {
  return messages.map((m) => ({
    id: m.id,
    createdAt: new Date(m.createdAt as Date),
    ...classify(m, messages),
  }));
}

function classify(
  m: InteractiveMessage,
  messages: readonly InteractiveMessage[]
): Pick<FeatureChatEntry, 'kind' | 'text'> {
  if (m.role === InteractiveMessageRole.user) {
    const answer = parseInteractionAnswerMessage(m.content);
    if (answer) {
      const text = Object.entries(answer.answers)
        .map(([question, value]) => `${question}${ANSWER_ARROW}${value}`)
        .join(ANSWER_SEPARATOR);
      return { kind: FeatureChatEntryKind.Answer, text };
    }
    return { kind: FeatureChatEntryKind.User, text: chatMessageDisplayText(m.content, messages) };
  }
  if (isChatBlockMessage(m.content)) {
    return { kind: FeatureChatEntryKind.Block, text: chatMessageDisplayText(m.content, messages) };
  }
  const tool = parseToolEventMessage(m.content);
  if (tool) {
    const detail = tool.detail?.split('\n')[0];
    return {
      kind: FeatureChatEntryKind.Tool,
      text: detail ? `${tool.label} ${detail}` : tool.label,
    };
  }
  return { kind: FeatureChatEntryKind.Assistant, text: m.content };
}

function questionsOf(state: ChatState): FeatureChatQuestion[] {
  return (state.pendingInteraction?.questions ?? []).map((q) => ({
    header: q.header,
    question: q.question,
    options: q.options.map((o) => ({
      label: o.label,
      ...(o.description && { description: o.description }),
    })),
    multiSelect: q.multiSelect,
  }));
}
