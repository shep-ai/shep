/**
 * Plugin CLI Command Tests
 *
 * Tests for the plugin command group and all subcommands.
 * Mocks the DI container and use cases to verify that each
 * CLI command resolves the correct use case and calls execute().
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { PluginType, PluginTransport, PluginHealthStatus } from '@/domain/generated/output.js';
import type { Plugin } from '@/domain/generated/output.js';

// ---------------------------------------------------------------------------
// Hoist mocks so factory closures can reference them
// ---------------------------------------------------------------------------
const { mockExecute, mockMessages, mockColors, mockRenderListView, mockRenderDetailView } =
  vi.hoisted(() => {
    const mockExecute = vi.fn();
    const mockMessages = {
      info: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
      newline: vi.fn(),
      log: vi.fn(),
      debug: vi.fn(),
    };
    const mockColors = {
      muted: (s: string) => s,
      success: (s: string) => s,
      error: (s: string) => s,
      warning: (s: string) => s,
      info: (s: string) => s,
      brand: (s: string) => s,
      accent: (s: string) => s,
    };
    const mockRenderListView = vi.fn();
    const mockRenderDetailView = vi.fn();
    return { mockExecute, mockMessages, mockColors, mockRenderListView, mockRenderDetailView };
  });

// ---------------------------------------------------------------------------
// Mock DI container
// ---------------------------------------------------------------------------
vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn().mockImplementation(() => ({
      execute: mockExecute,
    })),
  },
}));

// ---------------------------------------------------------------------------
// Mock use case modules to prevent tsyringe from loading
// ---------------------------------------------------------------------------
vi.mock('@/application/use-cases/plugins/add-plugin.use-case.js', () => ({
  AddPluginUseCase: vi.fn(),
}));
vi.mock('@/application/use-cases/plugins/remove-plugin.use-case.js', () => ({
  RemovePluginUseCase: vi.fn(),
}));
vi.mock('@/application/use-cases/plugins/list-plugins.use-case.js', () => ({
  ListPluginsUseCase: vi.fn(),
}));
vi.mock('@/application/use-cases/plugins/enable-plugin.use-case.js', () => ({
  EnablePluginUseCase: vi.fn(),
}));
vi.mock('@/application/use-cases/plugins/disable-plugin.use-case.js', () => ({
  DisablePluginUseCase: vi.fn(),
}));
vi.mock('@/application/use-cases/plugins/configure-plugin.use-case.js', () => ({
  ConfigurePluginUseCase: vi.fn(),
}));
vi.mock('@/application/use-cases/plugins/check-plugin-health.use-case.js', () => ({
  CheckPluginHealthUseCase: vi.fn(),
}));
vi.mock('@/application/use-cases/plugins/get-plugin-catalog.use-case.js', () => ({
  GetPluginCatalogUseCase: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock CLI UI helpers
// ---------------------------------------------------------------------------
vi.mock('../../../../src/presentation/cli/ui/index.js', () => ({
  messages: mockMessages,
  colors: mockColors,
  renderListView: mockRenderListView,
  renderDetailView: mockRenderDetailView,
  spinner: vi.fn(),
  fmt: { heading: (s: string) => s },
}));

import { container } from '@/infrastructure/di/container.js';

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------
import { createPluginCommand } from '../../../../src/presentation/cli/commands/plugin/index.js';
import { createAddCommand } from '../../../../src/presentation/cli/commands/plugin/add.command.js';
import { createRemoveCommand } from '../../../../src/presentation/cli/commands/plugin/remove.command.js';
import { createListCommand } from '../../../../src/presentation/cli/commands/plugin/list.command.js';
import { createEnableCommand } from '../../../../src/presentation/cli/commands/plugin/enable.command.js';
import { createDisableCommand } from '../../../../src/presentation/cli/commands/plugin/disable.command.js';
import { createConfigureCommand } from '../../../../src/presentation/cli/commands/plugin/configure.command.js';
import { createStatusCommand } from '../../../../src/presentation/cli/commands/plugin/status.command.js';
import { createCatalogCommand } from '../../../../src/presentation/cli/commands/plugin/catalog.command.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makePlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    id: 'test-id',
    name: 'test-plugin',
    displayName: 'Test Plugin',
    type: PluginType.Mcp,
    enabled: true,
    healthStatus: PluginHealthStatus.Unknown,
    installSource: 'catalog',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('plugin command group', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPluginCommand()', () => {
    it('returns a Commander Command instance', () => {
      const cmd = createPluginCommand();
      expect(cmd).toBeInstanceOf(Command);
    });

    it('has name "plugin"', () => {
      const cmd = createPluginCommand();
      expect(cmd.name()).toBe('plugin');
    });

    it('registers all 8 subcommands', () => {
      const cmd = createPluginCommand();
      const names = cmd.commands.map((c) => c.name());
      expect(names).toContain('add');
      expect(names).toContain('remove');
      expect(names).toContain('list');
      expect(names).toContain('enable');
      expect(names).toContain('disable');
      expect(names).toContain('configure');
      expect(names).toContain('status');
      expect(names).toContain('catalog');
      expect(names).toHaveLength(8);
    });
  });

  // -------------------------------------------------------------------------
  // add subcommand
  // -------------------------------------------------------------------------
  describe('add subcommand', () => {
    it('returns a Command with name "add"', () => {
      const cmd = createAddCommand();
      expect(cmd.name()).toBe('add');
    });

    it('calls AddPluginUseCase with catalog name', async () => {
      const plugin = makePlugin({ name: 'mempalace' });
      mockExecute.mockResolvedValueOnce(plugin);

      const cmd = createAddCommand();
      await cmd.parseAsync(['mempalace'], { from: 'user' });

      expect(container.resolve).toHaveBeenCalled();
      expect(mockExecute).toHaveBeenCalledWith('mempalace');
      expect(mockMessages.success).toHaveBeenCalled();
    });

    it('calls AddPluginUseCase with custom input', async () => {
      const plugin = makePlugin({ name: 'my-tool' });
      mockExecute.mockResolvedValueOnce(plugin);

      const cmd = createAddCommand();
      await cmd.parseAsync(
        ['--name', 'my-tool', '--type', 'mcp', '--command', 'npx my-mcp', '--transport', 'stdio'],
        { from: 'user' }
      );

      expect(mockExecute).toHaveBeenCalledWith({
        name: 'my-tool',
        type: PluginType.Mcp,
        serverCommand: 'npx my-mcp',
        transport: PluginTransport.Stdio,
      });
    });

    it('shows error for custom install without --name', async () => {
      const cmd = createAddCommand();
      await cmd.parseAsync(['--type', 'mcp'], { from: 'user' });

      expect(mockMessages.error).toHaveBeenCalled();
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('shows error for custom install without --type', async () => {
      const cmd = createAddCommand();
      await cmd.parseAsync(['--name', 'test'], { from: 'user' });

      expect(mockMessages.error).toHaveBeenCalled();
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('shows error for invalid --type value', async () => {
      const cmd = createAddCommand();
      await cmd.parseAsync(['--name', 'test', '--type', 'invalid'], { from: 'user' });

      expect(mockMessages.error).toHaveBeenCalled();
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('handles use case errors gracefully', async () => {
      mockExecute.mockRejectedValueOnce(new Error('Already installed'));

      const cmd = createAddCommand();
      await cmd.parseAsync(['mempalace'], { from: 'user' });

      expect(mockMessages.error).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // remove subcommand
  // -------------------------------------------------------------------------
  describe('remove subcommand', () => {
    it('returns a Command with name "remove"', () => {
      const cmd = createRemoveCommand();
      expect(cmd.name()).toBe('remove');
    });

    it('calls RemovePluginUseCase with plugin name', async () => {
      const plugin = makePlugin({ name: 'mempalace' });
      mockExecute.mockResolvedValueOnce(plugin);

      const cmd = createRemoveCommand();
      await cmd.parseAsync(['mempalace'], { from: 'user' });

      expect(mockExecute).toHaveBeenCalledWith('mempalace');
      expect(mockMessages.success).toHaveBeenCalled();
    });

    it('handles errors gracefully', async () => {
      mockExecute.mockRejectedValueOnce(new Error('Not found'));

      const cmd = createRemoveCommand();
      await cmd.parseAsync(['nonexistent'], { from: 'user' });

      expect(mockMessages.error).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // list subcommand
  // -------------------------------------------------------------------------
  describe('list subcommand', () => {
    it('returns a Command with name "list"', () => {
      const cmd = createListCommand();
      expect(cmd.name()).toBe('list');
    });

    it('calls ListPluginsUseCase and renders a list view', async () => {
      const plugins = [
        makePlugin({ name: 'mempalace', type: PluginType.Mcp }),
        makePlugin({ name: 'ruflo', type: PluginType.Mcp, enabled: false }),
      ];
      mockExecute.mockResolvedValueOnce(plugins);

      const cmd = createListCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(mockExecute).toHaveBeenCalled();
      expect(mockRenderListView).toHaveBeenCalledWith(
        expect.objectContaining({
          rows: expect.arrayContaining([expect.arrayContaining(['mempalace'])]),
        })
      );
    });

    it('shows empty message when no plugins installed', async () => {
      mockExecute.mockResolvedValueOnce([]);

      const cmd = createListCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(mockRenderListView).toHaveBeenCalledWith(expect.objectContaining({ rows: [] }));
    });
  });

  // -------------------------------------------------------------------------
  // enable subcommand
  // -------------------------------------------------------------------------
  describe('enable subcommand', () => {
    it('returns a Command with name "enable"', () => {
      const cmd = createEnableCommand();
      expect(cmd.name()).toBe('enable');
    });

    it('calls EnablePluginUseCase with plugin name', async () => {
      const plugin = makePlugin({ name: 'mempalace', enabled: true });
      mockExecute.mockResolvedValueOnce(plugin);

      const cmd = createEnableCommand();
      await cmd.parseAsync(['mempalace'], { from: 'user' });

      expect(mockExecute).toHaveBeenCalledWith('mempalace');
      expect(mockMessages.success).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // disable subcommand
  // -------------------------------------------------------------------------
  describe('disable subcommand', () => {
    it('returns a Command with name "disable"', () => {
      const cmd = createDisableCommand();
      expect(cmd.name()).toBe('disable');
    });

    it('calls DisablePluginUseCase with plugin name', async () => {
      const plugin = makePlugin({ name: 'mempalace', enabled: false });
      mockExecute.mockResolvedValueOnce(plugin);

      const cmd = createDisableCommand();
      await cmd.parseAsync(['mempalace'], { from: 'user' });

      expect(mockExecute).toHaveBeenCalledWith('mempalace');
      expect(mockMessages.success).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // configure subcommand
  // -------------------------------------------------------------------------
  describe('configure subcommand', () => {
    it('returns a Command with name "configure"', () => {
      const cmd = createConfigureCommand();
      expect(cmd.name()).toBe('configure');
    });

    it('calls ConfigurePluginUseCase with tool groups', async () => {
      const plugin = makePlugin({ name: 'ruflo', activeToolGroups: ['implement', 'test'] });
      mockExecute.mockResolvedValueOnce(plugin);

      const cmd = createConfigureCommand();
      await cmd.parseAsync(['ruflo', '--tool-groups', 'implement,test'], { from: 'user' });

      expect(mockExecute).toHaveBeenCalledWith('ruflo', {
        activeToolGroups: ['implement', 'test'],
      });
      expect(mockMessages.success).toHaveBeenCalled();
    });

    it('shows info message when no options provided', async () => {
      const cmd = createConfigureCommand();
      await cmd.parseAsync(['ruflo'], { from: 'user' });

      expect(mockMessages.info).toHaveBeenCalled();
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // status subcommand
  // -------------------------------------------------------------------------
  describe('status subcommand', () => {
    it('returns a Command with name "status"', () => {
      const cmd = createStatusCommand();
      expect(cmd.name()).toBe('status');
    });

    it('calls CheckPluginHealthUseCase for specific plugin and renders detail view', async () => {
      const healthResults = [
        {
          pluginName: 'mempalace',
          status: PluginHealthStatus.Healthy,
          message: 'All checks passed',
        },
      ];
      // First call = health check, second call = list plugins
      mockExecute.mockResolvedValueOnce(healthResults);
      mockExecute.mockResolvedValueOnce([makePlugin({ name: 'mempalace' })]);

      const cmd = createStatusCommand();
      await cmd.parseAsync(['mempalace'], { from: 'user' });

      expect(mockExecute).toHaveBeenCalledWith('mempalace');
      expect(mockRenderDetailView).toHaveBeenCalled();
    });

    it('calls CheckPluginHealthUseCase for all plugins and renders list view', async () => {
      const healthResults = [
        { pluginName: 'mempalace', status: PluginHealthStatus.Healthy, message: 'OK' },
        { pluginName: 'ruflo', status: PluginHealthStatus.Degraded, message: 'Missing env' },
      ];
      mockExecute.mockResolvedValueOnce(healthResults);

      const cmd = createStatusCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(mockExecute).toHaveBeenCalledWith(undefined);
      expect(mockRenderListView).toHaveBeenCalled();
    });

    it('shows info message when no plugins exist and status checked for all', async () => {
      mockExecute.mockResolvedValueOnce([]);

      const cmd = createStatusCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(mockMessages.info).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // catalog subcommand
  // -------------------------------------------------------------------------
  describe('catalog subcommand', () => {
    it('returns a Command with name "catalog"', () => {
      const cmd = createCatalogCommand();
      expect(cmd.name()).toBe('catalog');
    });

    it('calls GetPluginCatalogUseCase and renders list view', async () => {
      const entries = [
        {
          name: 'mempalace',
          displayName: 'MemPalace',
          type: PluginType.Mcp,
          description: 'Memory system',
          isInstalled: false,
        },
        {
          name: 'ruflo',
          displayName: 'Ruflo',
          type: PluginType.Mcp,
          description: 'Agent framework',
          isInstalled: true,
        },
      ];
      mockExecute.mockResolvedValueOnce(entries);

      const cmd = createCatalogCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(mockExecute).toHaveBeenCalled();
      expect(mockRenderListView).toHaveBeenCalledWith(
        expect.objectContaining({
          rows: expect.arrayContaining([expect.arrayContaining(['mempalace'])]),
        })
      );
    });
  });
});
