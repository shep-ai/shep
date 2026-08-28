import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useWorkspaces,
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_NAME,
} from '../../../../../src/presentation/web/hooks/use-workspaces.js';

const STORAGE_KEY = 'shep:workspaces:v1';

describe('useWorkspaces', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initialization', () => {
    it('should start with default workspace', () => {
      const { result } = renderHook(() => useWorkspaces());

      expect(result.current.workspaces).toHaveLength(1);
      expect(result.current.workspaces[0]).toMatchObject({
        id: DEFAULT_WORKSPACE_ID,
        name: DEFAULT_WORKSPACE_NAME,
      });
    });
  });

  describe('createWorkspace', () => {
    it('should create a new workspace', () => {
      const { result } = renderHook(() => useWorkspaces());

      act(() => {
        result.current.createWorkspace('Test Workspace');
      });

      expect(result.current.workspaces).toHaveLength(2);
      expect(result.current.workspaces[1]).toMatchObject({
        name: 'Test Workspace',
      });
    });

    it('workspace ID should be unique', () => {
      const { result } = renderHook(() => useWorkspaces());

      let ws1Id = '';
      let ws2Id = '';

      act(() => {
        ws1Id = result.current.createWorkspace('Workspace 1').id;
      });

      act(() => {
        ws2Id = result.current.createWorkspace('Workspace 2').id;
      });

      expect(ws1Id).not.toEqual(ws2Id);
    });
  });

  describe('renameWorkspace', () => {
    it('should rename a workspace', () => {
      const { result } = renderHook(() => useWorkspaces());

      let workspaceId = '';
      act(() => {
        const ws = result.current.createWorkspace('Original Name');
        workspaceId = ws.id;
      });

      act(() => {
        result.current.renameWorkspace(workspaceId, 'New Name');
      });

      const ws = result.current.workspaces.find((w) => w.id === workspaceId);
      expect(ws?.name).toBe('New Name');
    });

    it('should not rename default workspace', () => {
      const { result } = renderHook(() => useWorkspaces());

      act(() => {
        result.current.renameWorkspace(DEFAULT_WORKSPACE_ID, 'Renamed Default');
      });

      const defaultWs = result.current.workspaces.find((w) => w.id === DEFAULT_WORKSPACE_ID);
      expect(defaultWs?.name).toBe(DEFAULT_WORKSPACE_NAME);
    });
  });

  describe('deleteWorkspace', () => {
    it('should delete a workspace', () => {
      const { result } = renderHook(() => useWorkspaces());

      let workspaceId = '';
      act(() => {
        const ws = result.current.createWorkspace('To Delete');
        workspaceId = ws.id;
      });

      expect(result.current.workspaces).toHaveLength(2);

      act(() => {
        result.current.deleteWorkspace(workspaceId);
      });

      expect(result.current.workspaces).toHaveLength(1);
    });

    it('should not delete default workspace', () => {
      const { result } = renderHook(() => useWorkspaces());

      const initialCount = result.current.workspaces.length;

      act(() => {
        result.current.deleteWorkspace(DEFAULT_WORKSPACE_ID);
      });

      expect(result.current.workspaces).toHaveLength(initialCount);
    });
  });

  describe('setWorkspaceMembers', () => {
    it('should update workspace members', () => {
      const { result } = renderHook(() => useWorkspaces());

      let workspaceId = '';
      act(() => {
        const ws = result.current.createWorkspace('Test');
        workspaceId = ws.id;
      });

      act(() => {
        result.current.setWorkspaceMembers(workspaceId, {
          repoIds: ['repo-1'],
          featureIds: ['feat-1'],
        });
      });

      const ws = result.current.workspaces.find((w) => w.id === workspaceId);
      expect(ws?.repoIds).toEqual(['repo-1']);
      expect(ws?.featureIds).toEqual(['feat-1']);
    });
  });

  describe('activeWorkspace', () => {
    it('should have default workspace as active on mount', () => {
      const { result } = renderHook(() => useWorkspaces());

      expect(result.current.isDefaultActive).toBe(true);
      expect(result.current.activeWorkspaceId).toBe(DEFAULT_WORKSPACE_ID);
    });

    it('should switch active workspace', () => {
      const { result } = renderHook(() => useWorkspaces());

      let workspaceId = '';
      act(() => {
        const ws = result.current.createWorkspace('New Active');
        workspaceId = ws.id;
      });

      act(() => {
        result.current.setActiveWorkspace(workspaceId);
      });

      expect(result.current.activeWorkspaceId).toBe(workspaceId);
      expect(result.current.isDefaultActive).toBe(false);
    });
  });

  describe('toggleRepoInActive', () => {
    it('should toggle repo in active workspace', () => {
      const { result } = renderHook(() => useWorkspaces());

      act(() => {
        result.current.createWorkspace('Test');
      });

      const wsId = result.current.workspaces[1]?.id || '';
      act(() => {
        result.current.setActiveWorkspace(wsId);
      });

      expect(result.current.activeWorkspace.repoIds).not.toContain('repo-1');

      act(() => {
        result.current.toggleRepoInActive('repo-1');
      });

      expect(result.current.activeWorkspace.repoIds).toContain('repo-1');

      act(() => {
        result.current.toggleRepoInActive('repo-1');
      });

      expect(result.current.activeWorkspace.repoIds).not.toContain('repo-1');
    });
  });

  describe('error handling', () => {
    it('should handle corrupted localStorage data gracefully', () => {
      localStorage.setItem(STORAGE_KEY, 'invalid json');

      const { result } = renderHook(() => useWorkspaces());

      expect(result.current.workspaces).toHaveLength(1);
      expect(result.current.activeWorkspaceId).toBe(DEFAULT_WORKSPACE_ID);
    });

    it('should ensure default workspace always exists', () => {
      const persisted = {
        workspaces: [
          {
            id: 'ws-1',
            name: 'Custom Workspace',
            repoIds: [],
            featureIds: [],
          },
        ],
        activeWorkspaceId: 'ws-1',
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));

      const { result } = renderHook(() => useWorkspaces());

      const hasDefault = result.current.workspaces.some((w) => w.id === DEFAULT_WORKSPACE_ID);
      expect(hasDefault).toBe(true);
    });
  });
});
