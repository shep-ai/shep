/**
 * The console's chat link (spec 147): keeps the attached feature's chat fresh
 * while the chat view is open, sends and answers through the use cases, and
 * remembers which chats this process started so it can stop them on quit —
 * their agents run inside this process.
 */

import type {
  FeatureChat,
  FeatureChatResult,
} from '@/application/use-cases/feature-console/feature-chat.types.js';

/** How often an attached chat is re-read: fast enough to feel live. */
export const DEFAULT_CHAT_REFRESH_INTERVAL_MS = 750;
/** Transcript entries fetched per read; the view shows the newest that fit. */
const CHAT_MAX_ENTRIES = 300;

export interface ConsoleChatDeps {
  loadChat: (featureId: string, maxEntries: number) => Promise<FeatureChat>;
  sendChatMessage: (featureId: string, content: string) => Promise<FeatureChatResult>;
  answerChatQuestion: (
    featureId: string,
    answers: Record<string, string>
  ) => Promise<FeatureChatResult>;
  /** Stop the chat sessions this process started. */
  stopChats: (featureIds: string[]) => Promise<void>;
  chatRefreshIntervalMs?: number;
}

export interface ConsoleChatListener {
  chat(chat: FeatureChat): void;
  notice(notice: FeatureChatResult | undefined): void;
  render(): void;
}

export class ConsoleChat {
  private featureId: string | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private loading = false;
  private readonly started = new Set<string>();

  constructor(
    private readonly deps: ConsoleChatDeps,
    private readonly listener: ConsoleChatListener
  ) {}

  attach(featureId: string): void {
    this.detach();
    this.featureId = featureId;
    this.listener.notice(undefined);
    void this.refresh();
    this.timer = setInterval(
      () => void this.refresh(),
      this.deps.chatRefreshIntervalMs ?? DEFAULT_CHAT_REFRESH_INTERVAL_MS
    );
  }

  detach(): void {
    this.featureId = undefined;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async send(featureId: string, content: string): Promise<void> {
    await this.settle(featureId, () => this.deps.sendChatMessage(featureId, content));
  }

  async answer(featureId: string, answers: Record<string, string>): Promise<void> {
    await this.settle(featureId, () => this.deps.answerChatQuestion(featureId, answers));
  }

  /** Stop polling, then stop every chat session this console started. */
  async stopAll(): Promise<void> {
    this.detach();
    if (this.started.size > 0) await this.deps.stopChats([...this.started]);
  }

  private async settle(featureId: string, run: () => Promise<FeatureChatResult>): Promise<void> {
    let result: FeatureChatResult;
    try {
      result = await run();
    } catch (error) {
      result = { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
    // Sending can boot a session in this process even when the agent then fails.
    this.started.add(featureId);
    this.listener.notice(result.ok ? undefined : result);
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    const featureId = this.featureId;
    if (!featureId || this.loading) return;
    this.loading = true;
    try {
      const chat = await this.deps.loadChat(featureId, CHAT_MAX_ENTRIES);
      // The user may have detached or moved on while the read was in flight.
      if (featureId === this.featureId) this.listener.chat(chat);
    } catch (error) {
      this.listener.notice({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.loading = false;
    }
    this.listener.render();
  }
}
