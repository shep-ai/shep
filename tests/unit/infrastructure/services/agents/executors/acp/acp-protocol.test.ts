/**
 * Pure ACP protocol decisions — the branches the session tests do not reach.
 */

import { describe, it, expect } from 'vitest';
import { RequestError } from '@agentclientprotocol/sdk';
import {
  approveOnce,
  chooseModel,
  describeRequestError,
} from '@/infrastructure/services/agents/common/executors/acp/acp-protocol.js';

describe('chooseModel', () => {
  it('finds the wanted model inside grouped options', () => {
    expect(
      chooseModel(
        [
          {
            id: 'model',
            name: 'Model',
            type: 'select',
            currentValue: 'auto',
            options: [
              { group: 'fast', name: 'Fast', options: [{ value: 'auto', name: 'Auto' }] },
              { group: 'smart', name: 'Smart', options: [{ value: 'opus', name: 'Opus' }] },
            ],
          },
        ],
        'opus',
        'Agent'
      )
    ).toEqual({ kind: 'set', configId: 'model', value: 'opus' });
  });

  it('keeps a model that is already selected', () => {
    expect(
      chooseModel(
        [{ id: 'model', name: 'Model', type: 'select', currentValue: 'opus', options: [] }],
        'opus',
        'Agent'
      )
    ).toEqual({ kind: 'keep' });
  });
});

describe('approveOnce', () => {
  it('cancels a permission request that offers no option', () => {
    expect(approveOnce({ sessionId: 's', toolCall: { toolCallId: 't' }, options: [] })).toEqual({
      outcome: { outcome: 'cancelled' },
    });
  });
});

describe('describeRequestError', () => {
  it('appends the detail the agent put in the error data', () => {
    expect(
      describeRequestError(RequestError.internalError({ message: 'backend unreachable' }))
    ).toBe('Internal error: backend unreachable');
  });

  it('describes a non-Error rejection', () => {
    expect(describeRequestError('boom')).toBe('boom');
  });
});
