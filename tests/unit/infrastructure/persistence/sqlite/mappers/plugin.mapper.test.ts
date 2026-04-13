import { describe, it, expect } from 'vitest';
import {
  toDatabase,
  fromDatabase,
  type PluginRow,
} from '@/infrastructure/persistence/sqlite/mappers/plugin.mapper.js';
import {
  PluginType,
  PluginTransport,
  PluginHealthStatus,
  type Plugin,
  type ToolGroup,
} from '@/domain/generated/output.js';

function createTestPlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    id: 'plugin-001',
    name: 'mempalace',
    displayName: 'MemPalace',
    type: PluginType.Mcp,
    enabled: true,
    healthStatus: PluginHealthStatus.Unknown,
    createdAt: new Date('2026-04-14T10:00:00Z'),
    updatedAt: new Date('2026-04-14T12:00:00Z'),
    ...overrides,
  };
}

function createTestRow(overrides: Partial<PluginRow> = {}): PluginRow {
  return {
    id: 'plugin-001',
    name: 'mempalace',
    display_name: 'MemPalace',
    type: 'Mcp',
    version: null,
    install_source: null,
    transport: null,
    server_command: null,
    server_args: null,
    required_env_vars: null,
    tool_groups: null,
    active_tool_groups: null,
    enabled: 1,
    health_status: 'Unknown',
    health_message: null,
    hook_type: null,
    script_path: null,
    binary_command: null,
    runtime_type: null,
    runtime_min_version: null,
    homepage_url: null,
    description: null,
    created_at: new Date('2026-04-14T10:00:00Z').getTime(),
    updated_at: new Date('2026-04-14T12:00:00Z').getTime(),
    ...overrides,
  };
}

describe('Plugin Mapper', () => {
  describe('toDatabase', () => {
    it('should map required fields to snake_case columns', () => {
      const plugin = createTestPlugin();
      const row = toDatabase(plugin);

      expect(row.id).toBe('plugin-001');
      expect(row.name).toBe('mempalace');
      expect(row.display_name).toBe('MemPalace');
      expect(row.type).toBe('Mcp');
      expect(row.enabled).toBe(1);
      expect(row.health_status).toBe('Unknown');
    });

    it('should convert Date objects to unix milliseconds', () => {
      const date = new Date('2026-04-14T08:30:00Z');
      const plugin = createTestPlugin({ createdAt: date, updatedAt: date });
      const row = toDatabase(plugin);

      expect(row.created_at).toBe(date.getTime());
      expect(row.updated_at).toBe(date.getTime());
    });

    it('should map enabled=false to 0', () => {
      const plugin = createTestPlugin({ enabled: false });
      const row = toDatabase(plugin);

      expect(row.enabled).toBe(0);
    });

    it('should serialize serverArgs as JSON string', () => {
      const plugin = createTestPlugin({ serverArgs: ['-m', 'mempalace.mcp_server'] });
      const row = toDatabase(plugin);

      expect(row.server_args).toBe('["-m","mempalace.mcp_server"]');
    });

    it('should serialize requiredEnvVars as JSON string', () => {
      const plugin = createTestPlugin({ requiredEnvVars: ['ANTHROPIC_API_KEY', 'SOME_TOKEN'] });
      const row = toDatabase(plugin);

      expect(row.required_env_vars).toBe('["ANTHROPIC_API_KEY","SOME_TOKEN"]');
    });

    it('should serialize toolGroups as JSON string', () => {
      const groups: ToolGroup[] = [
        { name: 'implement', description: 'Implementation tools', tools: ['write', 'edit'] },
        { name: 'test', description: 'Testing tools' },
      ];
      const plugin = createTestPlugin({ toolGroups: groups });
      const row = toDatabase(plugin);

      expect(row.tool_groups).toBe(JSON.stringify(groups));
    });

    it('should serialize activeToolGroups as JSON string', () => {
      const plugin = createTestPlugin({ activeToolGroups: ['implement', 'test'] });
      const row = toDatabase(plugin);

      expect(row.active_tool_groups).toBe('["implement","test"]');
    });

    it('should map empty arrays to null', () => {
      const plugin = createTestPlugin({
        serverArgs: [],
        requiredEnvVars: [],
        toolGroups: [],
        activeToolGroups: [],
      });
      const row = toDatabase(plugin);

      expect(row.server_args).toBeNull();
      expect(row.required_env_vars).toBeNull();
      expect(row.tool_groups).toBeNull();
      expect(row.active_tool_groups).toBeNull();
    });

    it('should map undefined optional fields to null', () => {
      const plugin = createTestPlugin();
      const row = toDatabase(plugin);

      expect(row.version).toBeNull();
      expect(row.install_source).toBeNull();
      expect(row.transport).toBeNull();
      expect(row.server_command).toBeNull();
      expect(row.server_args).toBeNull();
      expect(row.health_message).toBeNull();
      expect(row.hook_type).toBeNull();
      expect(row.script_path).toBeNull();
      expect(row.binary_command).toBeNull();
      expect(row.runtime_type).toBeNull();
      expect(row.runtime_min_version).toBeNull();
      expect(row.homepage_url).toBeNull();
      expect(row.description).toBeNull();
    });

    it('should map MCP-specific fields when present', () => {
      const plugin = createTestPlugin({
        transport: PluginTransport.Stdio,
        serverCommand: 'python3',
        serverArgs: ['-m', 'mempalace.mcp_server'],
      });
      const row = toDatabase(plugin);

      expect(row.transport).toBe('Stdio');
      expect(row.server_command).toBe('python3');
      expect(row.server_args).toBe('["-m","mempalace.mcp_server"]');
    });

    it('should map Hook-specific fields when present', () => {
      const plugin = createTestPlugin({
        type: PluginType.Hook,
        hookType: 'PreToolUse',
        scriptPath: '/home/user/.claude/hooks/token-optimizer.py',
      });
      const row = toDatabase(plugin);

      expect(row.type).toBe('Hook');
      expect(row.hook_type).toBe('PreToolUse');
      expect(row.script_path).toBe('/home/user/.claude/hooks/token-optimizer.py');
    });

    it('should map CLI-specific fields when present', () => {
      const plugin = createTestPlugin({
        type: PluginType.Cli,
        binaryCommand: 'my-tool',
      });
      const row = toDatabase(plugin);

      expect(row.type).toBe('Cli');
      expect(row.binary_command).toBe('my-tool');
    });
  });

  describe('fromDatabase', () => {
    it('should map required columns to camelCase fields', () => {
      const row = createTestRow();
      const plugin = fromDatabase(row);

      expect(plugin.id).toBe('plugin-001');
      expect(plugin.name).toBe('mempalace');
      expect(plugin.displayName).toBe('MemPalace');
      expect(plugin.type).toBe(PluginType.Mcp);
      expect(plugin.enabled).toBe(true);
      expect(plugin.healthStatus).toBe(PluginHealthStatus.Unknown);
    });

    it('should convert unix milliseconds back to Date objects', () => {
      const date = new Date('2026-04-14T08:30:00Z');
      const row = createTestRow({ created_at: date.getTime(), updated_at: date.getTime() });
      const plugin = fromDatabase(row);

      expect(plugin.createdAt).toEqual(date);
      expect(plugin.updatedAt).toEqual(date);
    });

    it('should map enabled=0 to false', () => {
      const row = createTestRow({ enabled: 0 });
      const plugin = fromDatabase(row);

      expect(plugin.enabled).toBe(false);
    });

    it('should deserialize serverArgs from JSON', () => {
      const row = createTestRow({ server_args: '["-m","mempalace.mcp_server"]' });
      const plugin = fromDatabase(row);

      expect(plugin.serverArgs).toEqual(['-m', 'mempalace.mcp_server']);
    });

    it('should deserialize requiredEnvVars from JSON', () => {
      const row = createTestRow({ required_env_vars: '["ANTHROPIC_API_KEY","SOME_TOKEN"]' });
      const plugin = fromDatabase(row);

      expect(plugin.requiredEnvVars).toEqual(['ANTHROPIC_API_KEY', 'SOME_TOKEN']);
    });

    it('should deserialize toolGroups from JSON', () => {
      const groups: ToolGroup[] = [
        { name: 'implement', description: 'Implementation tools', tools: ['write', 'edit'] },
      ];
      const row = createTestRow({ tool_groups: JSON.stringify(groups) });
      const plugin = fromDatabase(row);

      expect(plugin.toolGroups).toEqual(groups);
    });

    it('should deserialize activeToolGroups from JSON', () => {
      const row = createTestRow({ active_tool_groups: '["implement","test"]' });
      const plugin = fromDatabase(row);

      expect(plugin.activeToolGroups).toEqual(['implement', 'test']);
    });

    it('should map null optional fields to undefined', () => {
      const row = createTestRow();
      const plugin = fromDatabase(row);

      expect(plugin.version).toBeUndefined();
      expect(plugin.installSource).toBeUndefined();
      expect(plugin.transport).toBeUndefined();
      expect(plugin.serverCommand).toBeUndefined();
      expect(plugin.serverArgs).toBeUndefined();
      expect(plugin.healthMessage).toBeUndefined();
      expect(plugin.hookType).toBeUndefined();
      expect(plugin.scriptPath).toBeUndefined();
      expect(plugin.binaryCommand).toBeUndefined();
      expect(plugin.runtimeType).toBeUndefined();
      expect(plugin.runtimeMinVersion).toBeUndefined();
      expect(plugin.homepageUrl).toBeUndefined();
      expect(plugin.description).toBeUndefined();
    });

    it('should map MCP-specific fields when present', () => {
      const row = createTestRow({
        transport: 'Stdio',
        server_command: 'python3',
        server_args: '["-m","mempalace.mcp_server"]',
      });
      const plugin = fromDatabase(row);

      expect(plugin.transport).toBe(PluginTransport.Stdio);
      expect(plugin.serverCommand).toBe('python3');
      expect(plugin.serverArgs).toEqual(['-m', 'mempalace.mcp_server']);
    });

    it('should map health status enum values correctly', () => {
      const statuses: [string, PluginHealthStatus][] = [
        ['Healthy', PluginHealthStatus.Healthy],
        ['Degraded', PluginHealthStatus.Degraded],
        ['Unavailable', PluginHealthStatus.Unavailable],
        ['Unknown', PluginHealthStatus.Unknown],
      ];
      for (const [dbValue, enumValue] of statuses) {
        const row = createTestRow({ health_status: dbValue });
        const plugin = fromDatabase(row);
        expect(plugin.healthStatus).toBe(enumValue);
      }
    });
  });

  describe('round-trip', () => {
    it('should preserve all fields through toDatabase -> fromDatabase', () => {
      const groups: ToolGroup[] = [
        { name: 'implement', description: 'Implementation tools', tools: ['write', 'edit'] },
      ];
      const original = createTestPlugin({
        version: '1.2.3',
        installSource: 'catalog',
        transport: PluginTransport.Stdio,
        serverCommand: 'python3',
        serverArgs: ['-m', 'mempalace.mcp_server'],
        requiredEnvVars: ['ANTHROPIC_API_KEY'],
        toolGroups: groups,
        activeToolGroups: ['implement'],
        healthStatus: PluginHealthStatus.Healthy,
        healthMessage: 'All checks passed',
        runtimeType: 'python',
        runtimeMinVersion: '3.9',
        homepageUrl: 'https://github.com/MemPalace/mempalace',
        description: 'Local AI memory system',
      });

      const row = toDatabase(original);
      const restored = fromDatabase(row);

      expect(restored.id).toBe(original.id);
      expect(restored.name).toBe(original.name);
      expect(restored.displayName).toBe(original.displayName);
      expect(restored.type).toBe(original.type);
      expect(restored.version).toBe(original.version);
      expect(restored.installSource).toBe(original.installSource);
      expect(restored.transport).toBe(original.transport);
      expect(restored.serverCommand).toBe(original.serverCommand);
      expect(restored.serverArgs).toEqual(original.serverArgs);
      expect(restored.requiredEnvVars).toEqual(original.requiredEnvVars);
      expect(restored.toolGroups).toEqual(original.toolGroups);
      expect(restored.activeToolGroups).toEqual(original.activeToolGroups);
      expect(restored.enabled).toBe(original.enabled);
      expect(restored.healthStatus).toBe(original.healthStatus);
      expect(restored.healthMessage).toBe(original.healthMessage);
      expect(restored.runtimeType).toBe(original.runtimeType);
      expect(restored.runtimeMinVersion).toBe(original.runtimeMinVersion);
      expect(restored.homepageUrl).toBe(original.homepageUrl);
      expect(restored.description).toBe(original.description);
    });

    it('should preserve minimal plugin through round-trip', () => {
      const original = createTestPlugin();
      const row = toDatabase(original);
      const restored = fromDatabase(row);

      expect(restored.id).toBe(original.id);
      expect(restored.name).toBe(original.name);
      expect(restored.displayName).toBe(original.displayName);
      expect(restored.type).toBe(original.type);
      expect(restored.enabled).toBe(original.enabled);
      expect(restored.healthStatus).toBe(original.healthStatus);
    });

    it('should preserve Hook plugin fields through round-trip', () => {
      const original = createTestPlugin({
        type: PluginType.Hook,
        hookType: 'PreToolUse',
        scriptPath: '/home/user/.claude/hooks/token-optimizer.py',
      });
      const row = toDatabase(original);
      const restored = fromDatabase(row);

      expect(restored.type).toBe(PluginType.Hook);
      expect(restored.hookType).toBe(original.hookType);
      expect(restored.scriptPath).toBe(original.scriptPath);
    });

    it('should preserve CLI plugin fields through round-trip', () => {
      const original = createTestPlugin({
        type: PluginType.Cli,
        binaryCommand: 'my-tool',
      });
      const row = toDatabase(original);
      const restored = fromDatabase(row);

      expect(restored.type).toBe(PluginType.Cli);
      expect(restored.binaryCommand).toBe(original.binaryCommand);
    });
  });
});
