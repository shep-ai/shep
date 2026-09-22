import { describe, it, expect } from 'vitest';
import {
  AGENT_EVENTS_HEARTBEAT_EVENT,
  appendBounded,
  upsertById,
} from '../../../../../src/presentation/web/lib/agent-event-stream.js';

interface Row {
  id: string;
  status: string;
}

const byId = (r: Row) => r.id;

describe('agent-event-stream', () => {
  it('names the heartbeat as a dispatchable SSE event, not a comment', () => {
    expect(AGENT_EVENTS_HEARTBEAT_EVENT).toMatch(/^[a-z_]+$/);
  });

  describe('upsertById', () => {
    it('appends a row whose id is not present', () => {
      const prev = [{ id: 'a', status: 'pending' }];
      const next = upsertById(prev, { id: 'b', status: 'pending' }, byId);
      expect(next.map(byId)).toEqual(['a', 'b']);
    });

    it('does not duplicate a row delivered twice (reconnect replay)', () => {
      const row = { id: 'a', status: 'pending' };
      let list: Row[] = [];
      list = upsertById(list, row, byId);
      list = upsertById(list, { ...row }, byId);
      expect(list).toHaveLength(1);
    });

    it('replaces an existing row in place with the latest delivery', () => {
      const prev = [
        { id: 'a', status: 'pending' },
        { id: 'b', status: 'pending' },
      ];
      const next = upsertById(prev, { id: 'a', status: 'answered' }, byId);
      expect(next).toEqual([
        { id: 'a', status: 'answered' },
        { id: 'b', status: 'pending' },
      ]);
      expect(prev[0].status).toBe('pending');
    });

    it('prunes to the newest rows once the list outgrows its bound', () => {
      let list: Row[] = [];
      for (let i = 0; i < 6; i++) {
        list = upsertById(list, { id: String(i), status: 'x' }, byId, { max: 5, keep: 3 });
      }
      expect(list.map(byId)).toEqual(['3', '4', '5']);
    });
  });

  describe('appendBounded', () => {
    it('appends and prunes to the newest entries past the bound', () => {
      let list: number[] = [];
      for (let i = 0; i < 6; i++) list = appendBounded(list, i, { max: 5, keep: 3 });
      expect(list).toEqual([3, 4, 5]);
    });
  });
});
