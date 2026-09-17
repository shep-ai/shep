import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useWorkspaces,
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_NAME,
} from '@/hooks/use-workspaces';

const STORAGE_KEY = 'shep:workspaces:v1';

/**
 * The global localStorage mock (tests/unit/presentation/web/setup.ts) stubs
 * getItem/setItem as bare vi.fn() with no backing store, so nothing actually
 * round-trips by default. Back it with a real object here so these tests can
 * simulate an actual browser reopen (new renderHook instance reading back
 * whatever a previous instance wrote).
 */
function useRealLocalStorageBackingStore() {
  const store = new Map<string, string>();
  vi.mocked(localStorage.getItem).mockImplementation((key) => store.get(key) ?? null);
  vi.mocked(localStorage.setItem).mockImplementation((key, value) => {
    store.set(key, value);
  });
  vi.mocked(localStorage.removeItem).mockImplementation((key) => {
    store.delete(key);
  });
  vi.mocked(localStorage.clear).mockImplementation(() => store.clear());
  return store;
}

describe('useWorkspaces', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = useRealLocalStorageBackingStore();
  });

  describe('initialization', () => {
    it('starts with only the default workspace when localStorage is empty', () => {
      const { result } = renderHook(() => useWorkspaces());

      expect(result.current.workspaces).toHaveLength(1);
      expect(result.current.workspaces[0]).toMatchObject({
        id: DEFAULT_WORKSPACE_ID,
        name: DEFAULT_WORKSPACE_NAME,
      });
      expect(result.current.isDefaultActive).toBe(true);
    });

    it('handles corrupted localStorage data gracefully', () => {
      store.set(STORAGE_KEY, 'not valid json{{{');

      const { result } = renderHook(() => useWorkspaces());

      expect(result.current.workspaces).toHaveLength(1);
      expect(result.current.activeWorkspaceId).toBe(DEFAULT_WORKSPACE_ID);
    });

    it('ensures the default workspace always exists even if missing from storage', () => {
      store.set(
        STORAGE_KEY,
        JSON.stringify({
          workspaces: [{ id: 'ws-1', name: 'Custom', repoIds: [], featureIds: [] }],
          activeWorkspaceId: 'ws-1',
        })
      );

      const { result } = renderHook(() => useWorkspaces());

      expect(result.current.workspaces.some((w) => w.id === DEFAULT_WORKSPACE_ID)).toBe(true);
      expect(result.current.workspaces.some((w) => w.id === 'ws-1')).toBe(true);
    });
  });

  describe('mutations', () => {
    it('creates a new workspace with a unique id', () => {
      const { result } = renderHook(() => useWorkspaces());

      let ws1Id = '';
      let ws2Id = '';
      act(() => {
        ws1Id = result.current.createWorkspace('Workspace 1').id;
      });
      act(() => {
        ws2Id = result.current.createWorkspace('Workspace 2').id;
      });

      expect(result.current.workspaces).toHaveLength(3);
      expect(ws1Id).not.toEqual(ws2Id);
    });

    it('renames a workspace but never the default', () => {
      const { result } = renderHook(() => useWorkspaces());

      let workspaceId = '';
      act(() => {
        workspaceId = result.current.createWorkspace('Original').id;
      });
      act(() => {
        result.current.renameWorkspace(workspaceId, 'Renamed');
        result.current.renameWorkspace(DEFAULT_WORKSPACE_ID, 'Should not stick');
      });

      expect(result.current.workspaces.find((w) => w.id === workspaceId)?.name).toBe('Renamed');
      expect(result.current.workspaces.find((w) => w.id === DEFAULT_WORKSPACE_ID)?.name).toBe(
        DEFAULT_WORKSPACE_NAME
      );
    });

    it('deletes a workspace but never the default', () => {
      const { result } = renderHook(() => useWorkspaces());

      let workspaceId = '';
      act(() => {
        workspaceId = result.current.createWorkspace('To delete').id;
      });
      expect(result.current.workspaces).toHaveLength(2);

      act(() => {
        result.current.deleteWorkspace(DEFAULT_WORKSPACE_ID);
      });
      expect(result.current.workspaces).toHaveLength(2);

      act(() => {
        result.current.deleteWorkspace(workspaceId);
      });
      expect(result.current.workspaces).toHaveLength(1);
    });
  });

  describe('persistence across a simulated browser close/reopen (regression)', () => {
    it('persists a newly created workspace to localStorage', () => {
      const { result } = renderHook(() => useWorkspaces());

      act(() => {
        result.current.createWorkspace('Alpha');
      });

      const raw = store.get(STORAGE_KEY);
      expect(raw).toBeDefined();
      const parsed = JSON.parse(raw!);
      expect(parsed.workspaces.some((w: { name: string }) => w.name === 'Alpha')).toBe(true);
    });

    it('never writes fewer workspaces than were already persisted when the hook (re)mounts', () => {
      // Simulate data already saved from a previous browser session.
      store.set(
        STORAGE_KEY,
        JSON.stringify({
          workspaces: [
            {
              id: DEFAULT_WORKSPACE_ID,
              name: DEFAULT_WORKSPACE_NAME,
              repoIds: [],
              featureIds: [],
            },
            { id: 'ws-existing', name: 'Existing', repoIds: [], featureIds: [] },
          ],
          activeWorkspaceId: 'ws-existing',
        })
      );

      renderHook(() => useWorkspaces());

      // Every write made during/after mount must still contain the
      // previously-saved workspace — none may regress to just the default.
      const calls = vi.mocked(localStorage.setItem).mock.calls;
      for (const [, value] of calls) {
        const written = JSON.parse(value as string);
        expect(written.workspaces.some((w: { id: string }) => w.id === 'ws-existing')).toBe(true);
      }
    });

    it('workspaces created before a simulated reopen are still present after remounting the hook', () => {
      const first = renderHook(() => useWorkspaces());

      let createdId = '';
      act(() => {
        createdId = first.result.current.createWorkspace('Survives Reopen').id;
      });
      act(() => {
        first.result.current.setActiveWorkspace(createdId);
      });

      // Simulate closing the browser: unmount the hook entirely.
      first.unmount();

      // Simulate reopening the browser: a brand new hook instance reading
      // from the same underlying localStorage.
      const second = renderHook(() => useWorkspaces());

      expect(second.result.current.workspaces).toHaveLength(2);
      expect(second.result.current.workspaces.some((w) => w.id === createdId)).toBe(true);
      expect(second.result.current.activeWorkspaceId).toBe(createdId);
    });

    it('multiple workspaces and a rename all survive a simulated reopen', () => {
      const first = renderHook(() => useWorkspaces());

      let idOne = '';
      let idTwo = '';
      act(() => {
        idOne = first.result.current.createWorkspace('One').id;
      });
      act(() => {
        idTwo = first.result.current.createWorkspace('Two').id;
      });
      act(() => {
        first.result.current.renameWorkspace(idOne, 'One Renamed');
      });

      first.unmount();

      const second = renderHook(() => useWorkspaces());

      expect(second.result.current.workspaces).toHaveLength(3);
      expect(second.result.current.workspaces.find((w) => w.id === idOne)?.name).toBe(
        'One Renamed'
      );
      expect(second.result.current.workspaces.some((w) => w.id === idTwo)).toBe(true);
    });
  });
});
