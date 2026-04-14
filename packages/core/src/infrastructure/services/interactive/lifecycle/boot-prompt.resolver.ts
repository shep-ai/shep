/**
 * BootPromptResolver
 *
 * Pure collaborator that resolves the text to send as the agent's first turn.
 * Encapsulates the three-case branch previously inlined in `completeBootAsync`:
 *
 * 1. `pendingUserContent` defined  → that content IS the boot prompt
 *    (user-initiated boot: Application chat, or any scope that calls
 *    `sendUserMessage` cold). The context is the system prompt override
 *    if set, otherwise the built feature context.
 *
 * 2. No pending content AND no `systemPromptOverride` → feature-chat path:
 *    the feature context doubles as the boot prompt so the agent greets the
 *    user based on the current feature state.
 *
 * 3. No pending content AND `systemPromptOverride` set → silent boot:
 *    the scope (Application, Repository, Global) is self-describing; there
 *    is no need for a chatty greeting. `bootPrompt` is an empty string.
 *
 * Extracted from `interactive-session.service.ts` in phase 5 of the
 * strangler refactor documented at
 * `docs/plans/2026-04-14-interactive-session-service-refactor.md`.
 */

import type { IFeatureRepository } from '../../../../application/ports/output/repositories/feature-repository.interface.js';
import type { FeatureContextBuilder } from '../feature-context.builder.js';

export interface BootPromptResult {
  /** System prompt / context string to pass to the agent SDK. */
  context: string;
  /** The first turn to send to the agent (may be empty for silent boot). */
  bootPrompt: string;
}

export class BootPromptResolver {
  constructor(
    private readonly featureRepo: IFeatureRepository,
    private readonly contextBuilder: FeatureContextBuilder
  ) {}

  /**
   * Resolve the boot context and first-turn prompt for a new session.
   *
   * @param featureId           Polymorphic scope key (feature UUID, repo id, "global", etc.)
   * @param worktreePath        Absolute path to the checked-out worktree.
   * @param pendingUserContent  User message that triggered the boot, if any.
   * @param systemPromptOverride Caller-supplied system prompt; overrides feature-context build.
   */
  async resolve(
    featureId: string,
    worktreePath: string,
    pendingUserContent: string | undefined,
    systemPromptOverride: string | undefined
  ): Promise<BootPromptResult> {
    // Resolve the context string (= system prompt passed to the SDK session).
    // When the caller supplied one, use it verbatim — no feature lookup needed.
    let context: string;
    if (systemPromptOverride !== undefined) {
      context = systemPromptOverride;
    } else {
      const feature = await this.featureRepo.findById(featureId);
      const openPRs: string[] = feature?.pr?.url ? [feature.pr.url] : [];
      context = this.contextBuilder.buildContext(
        feature ??
          ({ id: featureId, name: featureId } as Parameters<
            FeatureContextBuilder['buildContext']
          >[0]),
        worktreePath,
        openPRs
      );
    }

    // Decide what to send as the first turn (three cases — see file header).
    let bootPrompt: string;
    if (pendingUserContent !== undefined) {
      // Case 1: user-initiated boot — send their message as the first turn.
      bootPrompt = pendingUserContent;
    } else if (systemPromptOverride === undefined) {
      // Case 2: classic feature-chat — context IS the greeting prompt.
      bootPrompt = context;
    } else {
      // Case 3: self-describing scope — stay silent.
      bootPrompt = '';
    }

    return { context, bootPrompt };
  }
}
