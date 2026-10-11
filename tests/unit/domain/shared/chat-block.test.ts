/**
 * Chat blocks (spec 137) — the codec every writer (use cases) and reader (turn
 * grouping, both chat renderers) shares, plus the rules for answering a block.
 */

import { describe, it, expect } from 'vitest';
import {
  CHAT_BLOCK_ACTIONS,
  CHAT_BLOCK_LIMITS,
  chatBlockFromInput,
  chatBlockResponseFromInput,
  chatBlockResponseSentence,
  chatBlockResponseSummary,
  chatMessageDisplayText,
  findChatBlock,
  formatChatBlockMessage,
  formatChatBlockResponseMessage,
  isChatBlockMessage,
  isChatBlockResponseMessage,
  parseChatBlockMessage,
  parseChatBlockResponseMessage,
  resolveChatBlockResponses,
} from '@/domain/shared/chat-block.js';
import { InvalidChatBlockError } from '@/domain/errors/invalid-chat-block.error.js';
import { ChatBlockAction, ChatBlockType } from '@/domain/generated/output.js';

const spec = chatBlockFromInput('b1', {
  type: ChatBlockType.SpecReview,
  title: 'Login PRD',
  markdown: '# Login\n\nUsers sign in with email.',
});
const plan = chatBlockFromInput('b2', {
  type: ChatBlockType.PlanCard,
  title: 'Add dark mode',
  markdown: '1. Tokens\n2. Toggle',
});
const preview = chatBlockFromInput('b3', {
  type: ChatBlockType.HtmlPreview,
  title: 'Pricing card',
  html: '<div>Pro — $10</div>',
});

describe('chatBlockFromInput', () => {
  it('keeps the fields each type needs and trims the title', () => {
    expect(
      chatBlockFromInput('x', { type: ChatBlockType.PlanCard, title: '  Plan  ', markdown: 'm' })
    ).toEqual({ id: 'x', type: ChatBlockType.PlanCard, title: 'Plan', markdown: 'm' });
    expect(preview).toEqual({
      id: 'b3',
      type: ChatBlockType.HtmlPreview,
      title: 'Pricing card',
      html: '<div>Pro — $10</div>',
    });
  });

  it('drops a field the type does not use', () => {
    const block = chatBlockFromInput('x', {
      type: ChatBlockType.SpecReview,
      title: 'T',
      markdown: 'm',
      html: '<p>ignored</p>',
    });
    expect(block.html).toBeUndefined();
  });

  it.each([
    ['an empty title', { type: ChatBlockType.PlanCard, title: '   ', markdown: 'm' }],
    ['a spec review without Markdown', { type: ChatBlockType.SpecReview, title: 'T' }],
    [
      'a plan card with blank Markdown',
      { type: ChatBlockType.PlanCard, title: 'T', markdown: ' ' },
    ],
    ['an HTML preview without HTML', { type: ChatBlockType.HtmlPreview, title: 'T' }],
    ['an unknown type', { type: 'chart' as ChatBlockType, title: 'T', markdown: 'm' }],
    [
      'a title over the cap',
      {
        type: ChatBlockType.PlanCard,
        title: 'x'.repeat(CHAT_BLOCK_LIMITS.titleChars + 1),
        markdown: 'm',
      },
    ],
    [
      'Markdown over the cap',
      {
        type: ChatBlockType.PlanCard,
        title: 'T',
        markdown: 'x'.repeat(CHAT_BLOCK_LIMITS.markdownBytes + 1),
      },
    ],
    [
      'HTML over the cap',
      {
        type: ChatBlockType.HtmlPreview,
        title: 'T',
        html: 'x'.repeat(CHAT_BLOCK_LIMITS.htmlBytes + 1),
      },
    ],
  ])('rejects %s', (_label, input) => {
    expect(() => chatBlockFromInput('x', input)).toThrow(InvalidChatBlockError);
  });

  it('measures the caps in bytes, so multi-byte text cannot slip past them', () => {
    const emoji = '🚀'.repeat(CHAT_BLOCK_LIMITS.markdownBytes / 4 + 1);
    expect(() =>
      chatBlockFromInput('x', { type: ChatBlockType.PlanCard, title: 'T', markdown: emoji })
    ).toThrow(InvalidChatBlockError);
  });
});

describe('block messages', () => {
  it('round-trips each block type', () => {
    for (const block of [spec, plan, preview]) {
      const content = formatChatBlockMessage(block);
      expect(isChatBlockMessage(content)).toBe(true);
      expect(isChatBlockResponseMessage(content)).toBe(false);
      expect(parseChatBlockMessage(content)).toEqual(block);
    }
  });

  it.each([
    ['plain prose', 'hello'],
    ['broken JSON', '{{block}}{"id":'],
    ['a block without a title', '{{block}}{"id":"x","type":"plan_card","markdown":"m"}'],
    ['an unknown type', '{{block}}{"id":"x","type":"chart","title":"T"}'],
    ['undefined', undefined],
  ])('parses %s to null instead of throwing', (_label, content) => {
    expect(parseChatBlockMessage(content)).toBeNull();
  });
});

describe('answering a block', () => {
  it('allows approve / request changes on specs, implement / refine on plans, nothing on previews', () => {
    expect(CHAT_BLOCK_ACTIONS[ChatBlockType.SpecReview]).toEqual([
      ChatBlockAction.Approve,
      ChatBlockAction.RequestChanges,
    ]);
    expect(CHAT_BLOCK_ACTIONS[ChatBlockType.PlanCard]).toEqual([
      ChatBlockAction.Implement,
      ChatBlockAction.Refine,
    ]);
    expect(CHAT_BLOCK_ACTIONS[ChatBlockType.HtmlPreview]).toEqual([]);
  });

  it('builds a response and trims the note', () => {
    expect(chatBlockResponseFromInput(spec, ChatBlockAction.Approve, '  ')).toEqual({
      blockId: 'b1',
      action: ChatBlockAction.Approve,
    });
    expect(chatBlockResponseFromInput(plan, ChatBlockAction.Refine, ' Split step 2 ')).toEqual({
      blockId: 'b2',
      action: ChatBlockAction.Refine,
      note: 'Split step 2',
    });
  });

  it.each([
    ['an action the type does not take', spec, ChatBlockAction.Implement, undefined],
    ['any action on a preview', preview, ChatBlockAction.Approve, undefined],
    ['request changes without a note', spec, ChatBlockAction.RequestChanges, '  '],
    ['refine without a note', plan, ChatBlockAction.Refine, undefined],
    [
      'a note over the cap',
      plan,
      ChatBlockAction.Refine,
      'x'.repeat(CHAT_BLOCK_LIMITS.noteChars + 1),
    ],
  ])('rejects %s', (_label, block, action, note) => {
    expect(() => chatBlockResponseFromInput(block, action, note)).toThrow(InvalidChatBlockError);
  });

  it('round-trips a response message', () => {
    const response = { blockId: 'b2', action: ChatBlockAction.Refine, note: 'Split step 2' };
    const content = formatChatBlockResponseMessage(response);
    expect(isChatBlockResponseMessage(content)).toBe(true);
    expect(isChatBlockMessage(content)).toBe(false);
    expect(parseChatBlockResponseMessage(content)).toEqual(response);
    expect(
      parseChatBlockResponseMessage('{{block-response}}{"blockId":"b2","action":"x"}')
    ).toBeNull();
  });

  it('tells the agent what the user did in a plain sentence', () => {
    expect(
      chatBlockResponseSentence(spec, { blockId: 'b1', action: ChatBlockAction.Approve })
    ).toBe('The user approved the spec "Login PRD". Continue with it.');
    expect(
      chatBlockResponseSentence(spec, {
        blockId: 'b1',
        action: ChatBlockAction.RequestChanges,
        note: 'Add SSO',
      })
    ).toBe(
      'The user requested changes to the spec "Login PRD": Add SSO\nRevise the spec and post it again for review.'
    );
    expect(
      chatBlockResponseSentence(plan, { blockId: 'b2', action: ChatBlockAction.Implement })
    ).toBe('The user chose Implement for the plan "Add dark mode". Implement it now.');
    expect(
      chatBlockResponseSentence(plan, {
        blockId: 'b2',
        action: ChatBlockAction.Refine,
        note: 'Fewer steps',
      })
    ).toBe(
      'The user asked to refine the plan "Add dark mode": Fewer steps\nUpdate the plan and post it again.'
    );
  });
});

describe('reading a conversation', () => {
  const messages = [
    { content: formatChatBlockMessage(spec) },
    { content: 'plain reply' },
    { content: formatChatBlockMessage(plan) },
    {
      content: formatChatBlockResponseMessage({
        blockId: 'b1',
        action: ChatBlockAction.RequestChanges,
        note: 'Add SSO',
      }),
    },
    { content: formatChatBlockResponseMessage({ blockId: 'b1', action: ChatBlockAction.Approve }) },
  ];

  it('finds a block by id', () => {
    expect(findChatBlock(messages, 'b2')).toEqual(plan);
    expect(findChatBlock(messages, 'missing')).toBeNull();
  });

  it('maps each answered block to its latest response', () => {
    const responses = resolveChatBlockResponses(messages);
    expect(responses.get('b1')).toEqual({ blockId: 'b1', action: ChatBlockAction.Approve });
    expect(responses.has('b2')).toBe(false);
  });

  it('summarises an answer in a few words for titles and previews', () => {
    expect(chatBlockResponseSummary({ blockId: 'b1', action: ChatBlockAction.Approve }, spec)).toBe(
      'Approved "Login PRD"'
    );
    expect(
      chatBlockResponseSummary(
        { blockId: 'b2', action: ChatBlockAction.Refine, note: 'Fewer steps' },
        plan
      )
    ).toBe('Asked to refine "Add dark mode": Fewer steps');
    expect(
      chatBlockResponseSummary({ blockId: 'gone', action: ChatBlockAction.Implement }, null)
    ).toBe('Chose Implement');
  });

  it('gives the readable text of any chat message', () => {
    expect(chatMessageDisplayText(formatChatBlockMessage(spec), messages)).toBe(
      'Spec review: Login PRD'
    );
    expect(
      chatMessageDisplayText(
        formatChatBlockResponseMessage({ blockId: 'b2', action: ChatBlockAction.Implement }),
        messages
      )
    ).toBe('Chose Implement for "Add dark mode"');
    expect(chatMessageDisplayText('plain text', messages)).toBe('plain text');
  });
});
