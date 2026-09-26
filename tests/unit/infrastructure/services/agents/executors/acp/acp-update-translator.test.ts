/**
 * AcpUpdateTranslator — ACP `session/update` payloads → InteractiveAgentEvent.
 *
 * TDD Phase: RED-GREEN
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { SessionUpdate } from '@agentclientprotocol/sdk';
import { AcpUpdateTranslator } from '@/infrastructure/services/agents/common/executors/acp/acp-update-translator.js';

const text = (value: string) => ({ type: 'text' as const, text: value });

describe('AcpUpdateTranslator', () => {
  let translator: AcpUpdateTranslator;

  beforeEach(() => {
    translator = new AcpUpdateTranslator();
  });

  it('streams agent message chunks as deltas', () => {
    expect(
      translator.translate({ sessionUpdate: 'agent_message_chunk', content: text('Hel') })
    ).toEqual([{ type: 'delta', content: 'Hel' }]);
    expect(
      translator.translate({ sessionUpdate: 'agent_message_chunk', content: text('lo') })
    ).toEqual([{ type: 'delta', content: 'lo' }]);
  });

  it('ignores non-text message content and the echoed user message', () => {
    expect(
      translator.translate({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'image', data: 'AAAA', mimeType: 'image/png' },
      })
    ).toEqual([]);
    expect(
      translator.translate({ sessionUpdate: 'user_message_chunk', content: text('hi') })
    ).toEqual([]);
  });

  it('coalesces consecutive thought chunks into one thinking event', () => {
    // One persisted "Thinking" row per chunk would flood the chat log.
    expect(
      translator.translate({ sessionUpdate: 'agent_thought_chunk', content: text('Let me ') })
    ).toEqual([]);
    expect(
      translator.translate({ sessionUpdate: 'agent_thought_chunk', content: text('check.') })
    ).toEqual([]);
    expect(
      translator.translate({ sessionUpdate: 'agent_message_chunk', content: text('Done') })
    ).toEqual([
      { type: 'thinking', content: 'Let me check.' },
      { type: 'delta', content: 'Done' },
    ]);
  });

  it('flushes a trailing thought at the end of the turn, once', () => {
    translator.translate({ sessionUpdate: 'agent_thought_chunk', content: text('hmm') });
    expect(translator.flush()).toEqual([{ type: 'thinking', content: 'hmm' }]);
    expect(translator.flush()).toEqual([]);
  });

  it('maps a tool call to tool_use labelled with its title and raw input', () => {
    expect(
      translator.translate({
        sessionUpdate: 'tool_call',
        toolCallId: 't1',
        title: 'Read src/index.ts',
        kind: 'read',
        status: 'pending',
        rawInput: { path: 'src/index.ts' },
      })
    ).toEqual([
      { type: 'tool_use', label: 'Read src/index.ts', detail: '{"path":"src/index.ts"}' },
    ]);
  });

  it('maps a completed tool call update to an Output tool_result with its text content', () => {
    const update: SessionUpdate = {
      sessionUpdate: 'tool_call_update',
      toolCallId: 't1',
      status: 'completed',
      content: [
        { type: 'content', content: text('line 1') },
        { type: 'content', content: text('line 2') },
      ],
    };
    expect(translator.translate(update)).toEqual([
      { type: 'tool_result', label: 'Output', detail: 'line 1\nline 2' },
    ]);
  });

  it('falls back to raw output and summarises diffs', () => {
    expect(
      translator.translate({
        sessionUpdate: 'tool_call_update',
        toolCallId: 't2',
        status: 'completed',
        rawOutput: { exitCode: 0, stdout: 'ok' },
      })
    ).toEqual([{ type: 'tool_result', label: 'Output', detail: '{"exitCode":0,"stdout":"ok"}' }]);

    expect(
      translator.translate({
        sessionUpdate: 'tool_call_update',
        toolCallId: 't3',
        status: 'completed',
        content: [{ type: 'diff', path: '/repo/a.ts', oldText: 'a', newText: 'b' }],
      })
    ).toEqual([{ type: 'tool_result', label: 'Output', detail: 'Edited /repo/a.ts' }]);
  });

  it('marks a failed tool call in its result', () => {
    expect(
      translator.translate({
        sessionUpdate: 'tool_call_update',
        toolCallId: 't4',
        status: 'failed',
        content: [{ type: 'content', content: text('permission denied') }],
      })
    ).toEqual([{ type: 'tool_result', label: 'Output', detail: 'Failed: permission denied' }]);
  });

  it('emits nothing for an in-progress update or a finished call with no output', () => {
    expect(
      translator.translate({
        sessionUpdate: 'tool_call_update',
        toolCallId: 't5',
        status: 'in_progress',
      })
    ).toEqual([]);
    expect(
      translator.translate({
        sessionUpdate: 'tool_call_update',
        toolCallId: 't5',
        status: 'completed',
      })
    ).toEqual([]);
  });

  it('reports a tool call that arrives already finished as use + result', () => {
    expect(
      translator.translate({
        sessionUpdate: 'tool_call',
        toolCallId: 't6',
        title: 'Search',
        status: 'completed',
        content: [{ type: 'content', content: text('3 matches') }],
      })
    ).toEqual([
      { type: 'tool_use', label: 'Search', detail: '{}' },
      { type: 'tool_result', label: 'Output', detail: '3 matches' },
    ]);
  });

  it('surfaces warnings, errors and compaction as status lines', () => {
    expect(
      translator.translate({
        sessionUpdate: 'notice',
        severity: 'warning',
        title: 'Rate limited',
        description: 'retrying in 5s',
      })
    ).toEqual([{ type: 'status', content: 'Rate limited: retrying in 5s' }]);
    expect(
      translator.translate({
        sessionUpdate: 'compaction_update',
        compactionId: 'c1',
        status: 'in_progress',
      })
    ).toEqual([
      { type: 'status', content: 'Compacting context — older conversation will be summarized' },
    ]);
  });

  it('produces no chat output for session bookkeeping updates', () => {
    const bookkeeping: SessionUpdate[] = [
      { sessionUpdate: 'plan', entries: [] },
      { sessionUpdate: 'available_commands_update', availableCommands: [] },
      { sessionUpdate: 'current_mode_update', currentModeId: 'agent' },
      { sessionUpdate: 'usage_update', used: 10, size: 100 },
    ];
    for (const update of bookkeeping) expect(translator.translate(update)).toEqual([]);
  });
});
