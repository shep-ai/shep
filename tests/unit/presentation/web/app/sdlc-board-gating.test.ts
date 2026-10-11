/**
 * The SDLC board's web surfaces follow the `sdlcBoard` feature flag (spec 140):
 * while it is off the page 404s, the event stream 404s and the board actions
 * refuse without touching their use cases; while it is on they work as before.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskState } from '@shepai/core/domain/generated/output';

const { flags, resolveMock, executeMock, notFoundMock } = vi.hoisted(() => ({
  flags: { value: { sdlcBoard: false } },
  resolveMock: vi.fn(),
  executeMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound: notFoundMock }));
vi.mock('@/lib/feature-flags', () => ({ getFeatureFlags: () => flags.value }));
vi.mock('@/lib/server-container', () => ({ resolve: resolveMock }));

import SdlcPage from '@/app/sdlc/page';
import { GET } from '@/app/api/sdlc-events/route';
import { listSdlcBoard } from '@/app/actions/list-sdlc-board';
import { reorderSdlcTask } from '@/app/actions/reorder-sdlc-task';
import { updateSdlcTaskStatus } from '@/app/actions/update-sdlc-task-status';
import { updateSdlcSubTaskStatus } from '@/app/actions/update-sdlc-subtask-status';
import { FEATURE_OFF_ERROR } from '@/lib/feature-gate';

const ACTIONS = [
  ['listSdlcBoard', () => listSdlcBoard()],
  ['reorderSdlcTask', () => reorderSdlcTask('task-1', 2)],
  ['updateSdlcTaskStatus', () => updateSdlcTaskStatus('task-1', TaskState.Done)],
  ['updateSdlcSubTaskStatus', () => updateSdlcSubTaskStatus('sub-1', TaskState.Done)],
] as const;

describe('SDLC board gating (spec 140)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeMock.mockResolvedValue({ epics: [] });
    resolveMock.mockReturnValue({ execute: executeMock });
  });

  describe('while sdlcBoard is off', () => {
    beforeEach(() => {
      flags.value = { sdlcBoard: false };
    });

    it('404s the /sdlc page before loading the board', async () => {
      await expect(SdlcPage()).rejects.toThrow('NEXT_NOT_FOUND');
      expect(resolveMock).not.toHaveBeenCalled();
    });

    it('404s the event stream', async () => {
      const response = await GET(new Request('http://localhost/api/sdlc-events'));
      expect(response.status).toBe(404);
      expect(resolveMock).not.toHaveBeenCalled();
    });

    it.each(ACTIONS)('%s refuses without resolving its use case', async (_name, call) => {
      await expect(call()).resolves.toEqual({ error: FEATURE_OFF_ERROR });
      expect(resolveMock).not.toHaveBeenCalled();
    });
  });

  describe('while sdlcBoard is on', () => {
    beforeEach(() => {
      flags.value = { sdlcBoard: true };
    });

    it('renders the /sdlc page from the board use case', async () => {
      await expect(SdlcPage()).resolves.toBeTruthy();
      expect(resolveMock).toHaveBeenCalledWith('ListSdlcBoardUseCase');
    });

    it.each(ACTIONS)('%s runs its use case', async (_name, call) => {
      const result = await call();
      expect(result).not.toHaveProperty('error');
      expect(executeMock).toHaveBeenCalledOnce();
    });
  });
});
