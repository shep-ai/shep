/**
 * The console's overlays (specs 147, 150), built once with the intents each
 * one turns its keys into. The view opens one at a time and gets the screen
 * back through `closed`.
 */

import type { FeatureConsoleRow } from '@/application/use-cases/feature-console/feature-console.types.js';
import { ChatView } from './chat-view.js';
import type { FeatureConsoleViewDeps } from './console-intents.js';
import { HarnessDecisionsView } from './harness-decisions-view.js';
import { NewFeatureView } from './new-feature-view.js';

export interface ConsoleOverlays {
  chat: ChatView;
  harness: HarnessDecisionsView;
  create: NewFeatureView;
}

export interface OverlayHost {
  /** The feature the chat is attached to. */
  chatRow(): FeatureConsoleRow | undefined;
  /** An action is running; answers wait for it. */
  busy(): boolean;
  /** The overlay closed; the console returns to browsing. */
  closed(): void;
}

export function createOverlays(deps: FeatureConsoleViewDeps, host: OverlayHost): ConsoleOverlays {
  const { t, intents } = deps;
  const quit = () => intents.quit();
  const answer: typeof intents.answerHarnessDecision = (item, verdict) => {
    if (!host.busy()) intents.answerHarnessDecision(item, verdict);
  };
  return {
    chat: new ChatView(t, {
      send: (text) => {
        const row = host.chatRow();
        if (row) intents.sendChat(row, text);
      },
      answer: (answers) => {
        const row = host.chatRow();
        if (row) intents.answerChat(row, answers);
      },
      close: () => {
        host.closed();
        intents.closeChat();
      },
      quit,
    }),
    harness: new HarnessDecisionsView(t, {
      adopt: (item) => answer(item, { adopt: true }),
      reject: (item, feedback) => answer(item, { adopt: false, ...(feedback ? { feedback } : {}) }),
      close: () => host.closed(),
      quit,
    }),
    create: new NewFeatureView(
      t,
      {
        create: (input) => {
          host.closed();
          intents.createFeature(input);
        },
        close: () => host.closed(),
        quit,
      },
      deps.explore
    ),
  };
}
