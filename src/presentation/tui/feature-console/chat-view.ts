/**
 * Chat view (spec 147): attach to a feature and steer its agent.
 *
 * Shows the feature's agent chat (the conversation the web Chat tab shows)
 * as a transcript, the agent's text as it streams, and its open question with
 * numbered options. The console's status line holds the message being typed;
 * enter sends it, a digit on an empty line picks an option.
 */

import type { TFunction } from 'i18next';
import { Input, matchesKey, wrapTextWithAnsi } from '@mariozechner/pi-tui';
import { FeatureChatEntryKind } from '@/domain/generated/output.js';
import type {
  FeatureChat,
  FeatureChatQuestion,
  FeatureChatResult,
} from '@/application/use-cases/feature-console/feature-chat.types.js';
import { paint, sanitizeText } from './console-format.js';
import { NS, SEPARATOR } from './console-labels.js';
import { padTo } from './console-layout.js';

export interface ChatViewIntents {
  send(text: string): void;
  /** Answers to the agent's question(s), keyed by question text. */
  answer(answers: Record<string, string>): void;
  close(): void;
  quit(): void;
}

const MAX_OPTIONS = 9;
const STREAMING_CURSOR = ' ▍';
const OPTION_SEPARATOR = ' — ';

const ENTRY_PREFIX: Record<FeatureChatEntryKind, (t: TFunction) => string> = {
  [FeatureChatEntryKind.User]: (t) => paint.key(`${t(`${NS}.chat.you`)} › `),
  [FeatureChatEntryKind.Assistant]: () => '',
  [FeatureChatEntryKind.Tool]: () => paint.muted('  · '),
  [FeatureChatEntryKind.Block]: () => paint.attention('▣ '),
  [FeatureChatEntryKind.Answer]: () => paint.muted('↳ '),
};

const ENTRY_STYLE: Record<FeatureChatEntryKind, (text: string) => string> = {
  [FeatureChatEntryKind.User]: (text) => text,
  [FeatureChatEntryKind.Assistant]: (text) => text,
  [FeatureChatEntryKind.Tool]: paint.muted,
  [FeatureChatEntryKind.Block]: paint.attention,
  [FeatureChatEntryKind.Answer]: paint.muted,
};

export class ChatView {
  /** The message being typed; the console draws it on its status line. */
  readonly input = new Input();
  private name = '';
  private chat: FeatureChat | undefined;
  private notice: FeatureChatResult | undefined;
  private answers: Record<string, string> = {};

  constructor(
    private readonly t: TFunction,
    private readonly intents: ChatViewIntents
  ) {}

  open(name: string): void {
    this.name = name;
    this.chat = undefined;
    this.notice = undefined;
    this.answers = {};
    this.input.setValue('');
    this.input.focused = true;
  }

  setChat(chat: FeatureChat): void {
    this.chat = chat;
    // A question that went away (answered elsewhere) takes its partial answers with it.
    if (!this.currentQuestion) this.answers = {};
  }

  setNotice(notice: FeatureChatResult | undefined): void {
    this.notice = notice;
  }

  /** What the status line puts before the message being typed (the input draws its own `>`). */
  get promptLabel(): string {
    return this.currentQuestion ? this.t(`${NS}.chat.answerPrompt`) : '';
  }

  get hint(): string {
    return this.t(`${NS}.chat.${this.currentQuestion ? 'hintQuestion' : 'hint'}`);
  }

  handleInput(data: string): void {
    if (matchesKey(data, 'ctrl+c')) return this.intents.quit();
    if (matchesKey(data, 'escape')) {
      this.input.focused = false;
      return this.intents.close();
    }
    if (matchesKey(data, 'enter')) return this.submit();
    const question = this.currentQuestion;
    const pick = Number(data);
    if (question && this.input.getValue() === '' && Number.isInteger(pick) && pick >= 1) {
      const option = question.options[pick - 1];
      if (option) this.answerCurrent(question, option.label);
      return;
    }
    this.input.handleInput(data);
  }

  render(width: number, height: number): string[] {
    const header = this.renderHeader();
    const question = this.renderQuestion(width);
    const notice = this.notice
      ? [(this.notice.ok ? paint.ok : paint.error)(` ${sanitizeText(this.notice.message)}`)]
      : [];
    const transcriptHeight = Math.max(0, height - 2 - question.length - notice.length);
    const transcript = this.renderTranscript(width).slice(-transcriptHeight || undefined);
    return padTo(
      [
        header,
        '',
        ...padTo(transcriptHeight ? transcript : [], transcriptHeight),
        ...notice,
        ...question,
      ],
      height
    );
  }

  private get currentQuestion(): FeatureChatQuestion | undefined {
    return this.chat?.questions.find((q) => !(q.question in this.answers));
  }

  private submit(): void {
    const text = this.input.getValue().trim();
    if (!text) return;
    const question = this.currentQuestion;
    if (question) {
      this.input.setValue('');
      return this.answerCurrent(question, text);
    }
    if (!this.chat?.available) return;
    this.input.setValue('');
    this.intents.send(text);
  }

  private answerCurrent(question: FeatureChatQuestion, answer: string): void {
    this.answers = { ...this.answers, [question.question]: answer };
    if (this.currentQuestion) return;
    const answers = this.answers;
    this.answers = {};
    this.intents.answer(answers);
  }

  private renderHeader(): string {
    const { t } = this;
    const state = this.chat?.busy
      ? paint.attention(t(`${NS}.chat.working`))
      : this.chat?.sessionStatus
        ? paint.muted(this.chat.sessionStatus)
        : '';
    return `${paint.title(`${t(`${NS}.chat.title`)}${SEPARATOR}${sanitizeText(this.name)}`)}${
      state ? paint.muted(SEPARATOR) + state : ''
    }`;
  }

  private renderTranscript(width: number): string[] {
    const { t } = this;
    const chat = this.chat;
    if (!chat) return [paint.muted(t(`${NS}.chat.loading`))];
    if (!chat.available) {
      return [paint.error(sanitizeText(chat.unavailableReason ?? ''))];
    }
    if (chat.entries.length === 0 && !chat.streamingText) {
      return wrap(paint.muted(t(`${NS}.chat.empty`, { directory: chat.directory })), width);
    }
    const lines = chat.entries.flatMap((entry) =>
      wrap(ENTRY_PREFIX[entry.kind](t) + ENTRY_STYLE[entry.kind](sanitizeText(entry.text)), width)
    );
    if (chat.streamingText) {
      lines.push(...wrap(paint.muted(sanitizeText(chat.streamingText) + STREAMING_CURSOR), width));
    }
    return lines;
  }

  private renderQuestion(width: number): string[] {
    const question = this.currentQuestion;
    if (!question) return [];
    const options = question.options.slice(0, MAX_OPTIONS).map((option, i) => {
      const description = option.description
        ? paint.muted(OPTION_SEPARATOR + sanitizeText(option.description))
        : '';
      return `  ${paint.key(`${i + 1}.`)} ${sanitizeText(option.label)}${description}`;
    });
    return [
      '',
      ...wrap(
        paint.attention(`? ${sanitizeText(question.header)}: ${sanitizeText(question.question)}`),
        width
      ),
      ...options,
    ];
  }
}

function wrap(text: string, width: number): string[] {
  return wrapTextWithAnsi(text, Math.max(1, width));
}
