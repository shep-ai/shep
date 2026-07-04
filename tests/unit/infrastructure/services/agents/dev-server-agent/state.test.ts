import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { DevServerAgentAnnotation } from '@/infrastructure/services/agents/dev-server-agent/state.js';

/** Shape LangGraph exposes on Annotation.spec channels at runtime. */
interface RuntimeChannel<TValue, TUpdate = TValue> {
  initialValueFactory: () => TValue;
  operator: (prev: TValue, next: TUpdate) => TValue;
}

function channel<TValue, TUpdate = TValue>(name: string): RuntimeChannel<TValue, TUpdate> {
  return DevServerAgentAnnotation.spec[
    name as keyof typeof DevServerAgentAnnotation.spec
  ] as unknown as RuntimeChannel<TValue, TUpdate>;
}

describe('DevServerAgentAnnotation', () => {
  it('is a valid LangGraph Annotation root', () => {
    expect(DevServerAgentAnnotation).toBeDefined();
    expect(DevServerAgentAnnotation.spec).toBeDefined();
  });

  it('has exactly the 12 documented channels', () => {
    const channelNames = Object.keys(DevServerAgentAnnotation.spec).sort();
    expect(channelNames).toEqual(
      [
        'targetId',
        'targetType',
        'targetPath',
        'runPlan',
        'infraReady',
        'depsInstalled',
        'resultUrl',
        'failureReason',
        'remediationAttempts',
        'lastErrorTail',
        'capturedLogs',
        'degraded',
      ].sort()
    );
  });

  describe('initial defaults', () => {
    it('runPlan defaults to null', () => {
      expect(channel<unknown>('runPlan').initialValueFactory()).toBeNull();
    });

    it('infraReady defaults to false', () => {
      expect(channel<boolean>('infraReady').initialValueFactory()).toBe(false);
    });

    it('depsInstalled defaults to false', () => {
      expect(channel<boolean>('depsInstalled').initialValueFactory()).toBe(false);
    });

    it('resultUrl defaults to null', () => {
      expect(channel<string | null>('resultUrl').initialValueFactory()).toBeNull();
    });

    it('failureReason defaults to null', () => {
      expect(channel<string | null>('failureReason').initialValueFactory()).toBeNull();
    });

    it('remediationAttempts defaults to 0', () => {
      expect(channel<number>('remediationAttempts').initialValueFactory()).toBe(0);
    });

    it('lastErrorTail defaults to an empty array', () => {
      expect(channel<string[]>('lastErrorTail').initialValueFactory()).toEqual([]);
    });

    it('capturedLogs defaults to an empty array', () => {
      expect(channel<string[]>('capturedLogs').initialValueFactory()).toEqual([]);
    });

    it('degraded defaults to false', () => {
      expect(channel<boolean>('degraded').initialValueFactory()).toBe(false);
    });
  });

  describe('capturedLogs reducer — append (accumulating)', () => {
    it('accumulates log lines across updates', () => {
      const op = channel<string[]>('capturedLogs').operator;
      const afterFirst = op([], ['analyze: cache hit']);
      const afterSecond = op(afterFirst, ['install: pnpm install ok']);
      expect(afterSecond).toEqual(['analyze: cache hit', 'install: pnpm install ok']);
    });

    it('produces [...prev, ...next] — not a replace', () => {
      const op = channel<string[]>('capturedLogs').operator;
      const prev = ['line 1'];
      const next = ['line 2', 'line 3'];
      expect(op(prev, next)).toEqual([...prev, ...next]);
    });
  });

  describe('scalar reducers — last-write-wins', () => {
    it('failureReason replaces on defined value and keeps prev on undefined', () => {
      const op = channel<string | null, string | null | undefined>('failureReason').operator;
      expect(op(null, 'install failed')).toBe('install failed');
      expect(op('install failed', null)).toBeNull();
      expect(op('install failed', undefined)).toBe('install failed');
    });

    it('resultUrl replaces on defined value and keeps prev on undefined', () => {
      const op = channel<string | null, string | null | undefined>('resultUrl').operator;
      expect(op(null, 'http://localhost:3000')).toBe('http://localhost:3000');
      expect(op('http://localhost:3000', undefined)).toBe('http://localhost:3000');
    });

    it('remediationAttempts keeps only the latest value — not a sum', () => {
      const op = channel<number, number | undefined>('remediationAttempts').operator;
      let state = op(0, 1);
      state = op(state, 2);
      expect(state).toBe(2);
      expect(op(2, undefined)).toBe(2);
    });

    it('infraReady / depsInstalled / degraded replace on each update', () => {
      for (const name of ['infraReady', 'depsInstalled', 'degraded']) {
        const op = channel<boolean, boolean | undefined>(name).operator;
        expect(op(false, true)).toBe(true);
        expect(op(true, false)).toBe(false);
        expect(op(true, undefined)).toBe(true);
      }
    });

    it('lastErrorTail replaces the previous tail — not an append', () => {
      const op = channel<string[], string[] | undefined>('lastErrorTail').operator;
      expect(op(['old error'], ['new error 1', 'new error 2'])).toEqual([
        'new error 1',
        'new error 2',
      ]);
      expect(op(['kept'], undefined)).toEqual(['kept']);
    });
  });
});
