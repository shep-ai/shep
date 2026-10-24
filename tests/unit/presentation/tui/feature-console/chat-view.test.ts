/**
 * ChatView Unit Tests (spec 147)
 *
 * The attach view: a feature's agent chat as a transcript, the agent's text
 * as it streams, its open question with numbered options, and a message line.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { TFunction } from 'i18next';
import { visibleWidth } from '@mariozechner/pi-tui';
import { initI18n } from '@/presentation/tui/i18n.js';
import { ChatView, type ChatViewIntents } from '@/presentation/tui/feature-console/chat-view.js';
import { FeatureChatEntryKind } from '@/domain/generated/output.js';
import type { FeatureChat } from '@/application/use-cases/feature-console/feature-chat.types.js';

const ESC = '\x1b';
const ENTER = '\r';
// eslint-disable-next-line no-control-regex
const plain = (lines: string[]) => lines.map((l) => l.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''));

function chat(overrides: Partial<FeatureChat> = {}): FeatureChat {
  return {
    featureId: 'feat-1',
    name: 'Login page',
    directory: '/wt/login',
    available: true,
    busy: false,
    entries: [
      {
        id: '1',
        kind: FeatureChatEntryKind.User,
        text: 'Why is the test flaky?',
        createdAt: new Date(),
      },
      {
        id: '2',
        kind: FeatureChatEntryKind.Tool,
        text: 'Read src/login.test.ts',
        createdAt: new Date(),
      },
      {
        id: '3',
        kind: FeatureChatEntryKind.Assistant,
        text: 'It waits on a fixed timeout.',
        createdAt: new Date(),
      },
    ],
    questions: [],
    ...overrides,
  };
}

const question = {
  header: 'Scope',
  question: 'Fix the test or the code?',
  options: [{ label: 'The test', description: 'Use a fake clock' }, { label: 'The code' }],
  multiSelect: false,
};

describe('ChatView', () => {
  let t: TFunction;
  let intents: { [K in keyof ChatViewIntents]: ReturnType<typeof vi.fn> };
  let view: ChatView;

  beforeAll(async () => {
    t = (await initI18n('en')).t;
  });

  beforeEach(() => {
    intents = { send: vi.fn(), answer: vi.fn(), close: vi.fn(), quit: vi.fn() };
    view = new ChatView(t, intents as unknown as ChatViewIntents);
    view.open('Login page');
  });

  const press = (...keys: string[]) => keys.forEach((k) => view.handleInput(k));
  const typeText = (text: string) => [...text].forEach((ch) => view.handleInput(ch));
  const screen = (width = 80, height = 20) => plain(view.render(width, height));

  it('renders the transcript with who said what, in exactly the given height', () => {
    view.setChat(chat());
    const lines = view.render(60, 12);
    expect(lines).toHaveLength(12);
    for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(60);
    const text = screen().join('\n');
    expect(text).toContain('Chat · Login page');
    expect(text).toContain('you › Why is the test flaky?');
    expect(text).toContain('· Read src/login.test.ts');
    expect(text).toContain('It waits on a fixed timeout.');
  });

  it('shows the newest lines when the transcript is long', () => {
    view.setChat(
      chat({
        entries: Array.from({ length: 40 }, (_, i) => ({
          id: String(i),
          kind: FeatureChatEntryKind.Assistant,
          text: `line ${i}`,
          createdAt: new Date(),
        })),
      })
    );
    const text = screen(80, 10).join('\n');
    expect(text).toContain('line 39');
    expect(text).not.toContain('line 0\n');
  });

  it('shows streaming text and that the agent is working', () => {
    view.setChat(chat({ busy: true, streamingText: 'Looking at the' }));
    const text = screen().join('\n');
    expect(text).toContain('Looking at the');
    expect(text).toContain('working');
  });

  it('explains an empty chat, and an unavailable one', () => {
    view.setChat(chat({ entries: [] }));
    expect(screen().join('\n')).toContain('/wt/login');
    view.setChat(
      chat({
        available: false,
        unavailableReason: 'The interactive agent is turned off in settings.',
      })
    );
    expect(screen().join('\n')).toContain('turned off in settings');
  });

  it('strips escape sequences the agent wrote', () => {
    view.setChat(
      chat({
        entries: [
          {
            id: '1',
            kind: FeatureChatEntryKind.Assistant,
            text: 'ok\x1b[2J\x1b]0;pwned\x07',
            createdAt: new Date(),
          },
        ],
      })
    );
    expect(view.render(80, 10).join('')).not.toContain('\x1b[2J');
  });

  it('sends the typed message on enter and clears the line; letters never act as keys', () => {
    view.setChat(chat());
    typeText('q a Use a fake clock');
    press(ENTER);
    expect(intents.send).toHaveBeenCalledWith('q a Use a fake clock');
    expect(intents.quit).not.toHaveBeenCalled();
    press(ENTER);
    expect(intents.send).toHaveBeenCalledTimes(1);
  });

  it('does not send while unavailable', () => {
    view.setChat(chat({ available: false, unavailableReason: 'off' }));
    typeText('hi');
    press(ENTER);
    expect(intents.send).not.toHaveBeenCalled();
  });

  it('lists a question with numbered options and answers it with a digit', () => {
    view.setChat(chat({ questions: [question] }));
    const text = screen().join('\n');
    expect(text).toContain('Scope: Fix the test or the code?');
    expect(text).toContain('1. The test — Use a fake clock');
    expect(text).toContain('2. The code');
    press('2');
    expect(intents.answer).toHaveBeenCalledWith({ 'Fix the test or the code?': 'The code' });
    expect(intents.send).not.toHaveBeenCalled();
  });

  it('answers in the user’s own words, and asks several questions one at a time', () => {
    const second = { ...question, header: 'Tests', question: 'Add a regression test?' };
    view.setChat(chat({ questions: [question, second] }));
    typeText('Both, test first');
    press(ENTER);
    expect(intents.answer).not.toHaveBeenCalled();
    expect(screen().join('\n')).toContain('Tests: Add a regression test?');
    press('1');
    expect(intents.answer).toHaveBeenCalledWith({
      'Fix the test or the code?': 'Both, test first',
      'Add a regression test?': 'The test',
    });
  });

  it('closes on esc and quits on ctrl+c', () => {
    press(ESC);
    expect(intents.close).toHaveBeenCalled();
    press('\x03');
    expect(intents.quit).toHaveBeenCalled();
  });

  it('shows the result of the last send', () => {
    view.setChat(chat());
    view.setNotice({ ok: false, message: 'Agent "gemini-cli" has no interactive mode' });
    expect(screen().join('\n')).toContain('Agent "gemini-cli" has no interactive mode');
  });
});
