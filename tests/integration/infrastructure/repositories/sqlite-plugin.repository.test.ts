import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import {
  createInMemoryDatabase,
  tableExists,
  getTableIndexes,
} from '../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLitePluginRepository } from '@/infrastructure/repositories/sqlite-plugin.repository.js';
import {
  PluginType,
  PluginTransport,
  PluginHealthStatus,
  type Plugin,
  type ToolGroup,
} from '@/domain/generated/output.js';

describe('SQLitePluginRepository', () => {
  let db: Database.Database;
  let repository: SQLitePluginRepository;

  const NOW = new Date('2026-04-14T10:00:00Z');

  function createTestPlugin(overrides: Partial<Plugin> = {}): Plugin {
    return {
      id: 'plugin-001',
      name: 'mempalace',
      displayName: 'MemPalace',
      type: PluginType.Mcp,
      enabled: true,
      healthStatus: PluginHealthStatus.Unknown,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    expect(tableExists(db, 'plugins')).toBe(true);
    repository = new SQLitePluginRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('migration', () => {
    it('creates the plugins table with correct columns', () => {
      const columns = db.pragma('table_info(plugins)') as {
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }[];
      const columnMap = new Map(columns.map((c) => [c.name, c]));

      // Required columns
      expect(columnMap.get('id')?.pk).toBe(1);
      expect(columnMap.get('name')?.notnull).toBe(1);
      expect(columnMap.get('display_name')?.notnull).toBe(1);
      expect(columnMap.get('type')?.notnull).toBe(1);
      expect(columnMap.get('enabled')?.notnull).toBe(1);
      expect(columnMap.get('enabled')?.dflt_value).toBe('1');
      expect(columnMap.get('health_status')?.notnull).toBe(1);
      expect(columnMap.get('health_status')?.dflt_value).toBe("'Unknown'");
      expect(columnMap.get('created_at')?.notnull).toBe(1);
      expect(columnMap.get('updated_at')?.notnull).toBe(1);

      // Optional columns (nullable)
      expect(columnMap.get('version')?.notnull).toBe(0);
      expect(columnMap.get('install_source')?.notnull).toBe(0);
      expect(columnMap.get('transport')?.notnull).toBe(0);
      expect(columnMap.get('server_command')?.notnull).toBe(0);
      expect(columnMap.get('server_args')?.notnull).toBe(0);
      expect(columnMap.get('required_env_vars')?.notnull).toBe(0);
      expect(columnMap.get('tool_groups')?.notnull).toBe(0);
      expect(columnMap.get('active_tool_groups')?.notnull).toBe(0);
      expect(columnMap.get('health_message')?.notnull).toBe(0);
      expect(columnMap.get('hook_type')?.notnull).toBe(0);
      expect(columnMap.get('script_path')?.notnull).toBe(0);
      expect(columnMap.get('binary_command')?.notnull).toBe(0);
      expect(columnMap.get('runtime_type')?.notnull).toBe(0);
      expect(columnMap.get('runtime_min_version')?.notnull).toBe(0);
      expect(columnMap.get('homepage_url')?.notnull).toBe(0);
      expect(columnMap.get('description')?.notnull).toBe(0);
    });

    it('creates unique index on name column', () => {
      const indexes = getTableIndexes(db, 'plugins');
      expect(indexes).toContain('idx_plugins_name');
    });

    it('adds active_plugins column to features table', () => {
      const columns = db.pragma('table_info(features)') as { name: string }[];
      const names = columns.map((c) => c.name);
      expect(names).toContain('active_plugins');
    });
  });

  describe('create() and findById()', () => {
    it('creates and retrieves a plugin by id', async () => {
      const plugin = createTestPlugin();
      await repository.create(plugin);

      const found = await repository.findById('plugin-001');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('plugin-001');
      expect(found!.name).toBe('mempalace');
      expect(found!.displayName).toBe('MemPalace');
      expect(found!.type).toBe(PluginType.Mcp);
      expect(found!.enabled).toBe(true);
      expect(found!.healthStatus).toBe(PluginHealthStatus.Unknown);
    });

    it('returns null for nonexistent id', async () => {
      const result = await repository.findById('nonexistent');
      expect(result).toBeNull();
    });

    it('persists MCP-specific fields correctly', async () => {
      const plugin = createTestPlugin({
        transport: PluginTransport.Stdio,
        serverCommand: 'python3',
        serverArgs: ['-m', 'mempalace.mcp_server'],
        requiredEnvVars: ['ANTHROPIC_API_KEY'],
        version: '1.0.0',
        installSource: 'catalog',
        runtimeType: 'python',
        runtimeMinVersion: '3.9',
        homepageUrl: 'https://github.com/MemPalace/mempalace',
        description: 'Local AI memory system',
      });
      await repository.create(plugin);

      const found = await repository.findById('plugin-001');
      expect(found!.transport).toBe(PluginTransport.Stdio);
      expect(found!.serverCommand).toBe('python3');
      expect(found!.serverArgs).toEqual(['-m', 'mempalace.mcp_server']);
      expect(found!.requiredEnvVars).toEqual(['ANTHROPIC_API_KEY']);
      expect(found!.version).toBe('1.0.0');
      expect(found!.installSource).toBe('catalog');
      expect(found!.runtimeType).toBe('python');
      expect(found!.runtimeMinVersion).toBe('3.9');
      expect(found!.homepageUrl).toBe('https://github.com/MemPalace/mempalace');
      expect(found!.description).toBe('Local AI memory system');
    });

    it('persists toolGroups and activeToolGroups correctly', async () => {
      const groups: ToolGroup[] = [
        { name: 'implement', description: 'Implementation tools', tools: ['write', 'edit'] },
        { name: 'test', description: 'Testing tools' },
      ];
      const plugin = createTestPlugin({
        toolGroups: groups,
        activeToolGroups: ['implement'],
      });
      await repository.create(plugin);

      const found = await repository.findById('plugin-001');
      expect(found!.toolGroups).toEqual(groups);
      expect(found!.activeToolGroups).toEqual(['implement']);
    });

    it('persists Hook plugin fields correctly', async () => {
      const plugin = createTestPlugin({
        id: 'plugin-hook',
        name: 'token-optimizer',
        displayName: 'Token Optimizer',
        type: PluginType.Hook,
        hookType: 'PreToolUse',
        scriptPath: '/home/user/.claude/hooks/token-optimizer.py',
      });
      await repository.create(plugin);

      const found = await repository.findById('plugin-hook');
      expect(found!.type).toBe(PluginType.Hook);
      expect(found!.hookType).toBe('PreToolUse');
      expect(found!.scriptPath).toBe('/home/user/.claude/hooks/token-optimizer.py');
    });

    it('persists CLI plugin fields correctly', async () => {
      const plugin = createTestPlugin({
        id: 'plugin-cli',
        name: 'my-tool',
        displayName: 'My Tool',
        type: PluginType.Cli,
        binaryCommand: 'my-tool-bin',
      });
      await repository.create(plugin);

      const found = await repository.findById('plugin-cli');
      expect(found!.type).toBe(PluginType.Cli);
      expect(found!.binaryCommand).toBe('my-tool-bin');
    });
  });

  describe('findByName()', () => {
    it('finds a plugin by name', async () => {
      await repository.create(createTestPlugin());

      const found = await repository.findByName('mempalace');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('plugin-001');
      expect(found!.name).toBe('mempalace');
    });

    it('returns null for nonexistent name', async () => {
      const result = await repository.findByName('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('list()', () => {
    it('returns empty array when no plugins exist', async () => {
      const result = await repository.list();
      expect(result).toHaveLength(0);
    });

    it('returns all plugins ordered by name ascending', async () => {
      await repository.create(createTestPlugin({ id: 'p-2', name: 'ruflo', displayName: 'Ruflo' }));
      await repository.create(
        createTestPlugin({ id: 'p-1', name: 'mempalace', displayName: 'MemPalace' })
      );
      await repository.create(
        createTestPlugin({ id: 'p-3', name: 'token-optimizer', displayName: 'Token Optimizer' })
      );

      const result = await repository.list();
      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('mempalace');
      expect(result[1].name).toBe('ruflo');
      expect(result[2].name).toBe('token-optimizer');
    });
  });

  describe('update()', () => {
    it('updates all mutable fields', async () => {
      await repository.create(createTestPlugin());

      const updated = createTestPlugin({
        displayName: 'MemPalace v2',
        enabled: false,
        healthStatus: PluginHealthStatus.Healthy,
        healthMessage: 'All checks passed',
        version: '2.0.0',
        activeToolGroups: ['memory'],
        updatedAt: new Date('2026-04-15T10:00:00Z'),
      });
      await repository.update(updated);

      const found = await repository.findById('plugin-001');
      expect(found!.displayName).toBe('MemPalace v2');
      expect(found!.enabled).toBe(false);
      expect(found!.healthStatus).toBe(PluginHealthStatus.Healthy);
      expect(found!.healthMessage).toBe('All checks passed');
      expect(found!.version).toBe('2.0.0');
      expect(found!.activeToolGroups).toEqual(['memory']);
    });

    it('updates health status correctly', async () => {
      await repository.create(createTestPlugin());

      const updated = createTestPlugin({
        healthStatus: PluginHealthStatus.Degraded,
        healthMessage: 'Missing env var: ANTHROPIC_API_KEY',
        updatedAt: new Date('2026-04-15T10:00:00Z'),
      });
      await repository.update(updated);

      const found = await repository.findById('plugin-001');
      expect(found!.healthStatus).toBe(PluginHealthStatus.Degraded);
      expect(found!.healthMessage).toBe('Missing env var: ANTHROPIC_API_KEY');
    });
  });

  describe('delete()', () => {
    it('removes a plugin by id', async () => {
      await repository.create(createTestPlugin());
      expect(await repository.findById('plugin-001')).not.toBeNull();

      await repository.delete('plugin-001');
      expect(await repository.findById('plugin-001')).toBeNull();
    });

    it('does not error when deleting nonexistent id', async () => {
      await expect(repository.delete('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('unique name constraint', () => {
    it('rejects duplicate plugin names', async () => {
      await repository.create(createTestPlugin());

      await expect(repository.create(createTestPlugin({ id: 'plugin-002' }))).rejects.toThrow();
    });
  });
});
