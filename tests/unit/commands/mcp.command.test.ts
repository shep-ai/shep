/**
 * mcp command unit tests
 *
 * Tests for the `shep mcp` CLI command.
 * Verifies command structure, option parsing, MCP server lifecycle,
 * graceful shutdown, and help text content.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';

const { mockMcpServerService, mockFactory } = vi.hoisted(() => {
  const mockMcpServerService = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };
  const mockFactory = vi.fn().mockResolvedValue(mockMcpServerService);
  return { mockMcpServerService, mockFactory };
});

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: vi.fn().mockReturnValue(mockFactory),
  },
}));

// Mock the messages UI module to suppress output
vi.mock('../../../src/presentation/cli/ui/index.js', () => ({
  messages: {
    error: vi.fn(),
    info: vi.fn(),
    newline: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
  colors: {
    muted: vi.fn((s: string) => s),
  },
  fmt: {
    heading: vi.fn((s: string) => s),
    code: vi.fn((s: string) => s),
  },
}));

import { createMcpCommand } from '../../../src/presentation/cli/commands/mcp.command.js';
import { container } from '@/infrastructure/di/container.js';

describe('mcp command', () => {
  let originalProcessOn: typeof process.on;
  let signalHandlers: Map<string, (...args: unknown[]) => void>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Capture signal handler registrations
    signalHandlers = new Map();
    originalProcessOn = process.on;
    vi.spyOn(process, 'on').mockImplementation(
      (event: string | symbol, handler: (...args: unknown[]) => void) => {
        signalHandlers.set(String(event), handler);
        return process;
      }
    );
  });

  afterEach(() => {
    process.on = originalProcessOn;
  });

  describe('command structure', () => {
    it('returns a Commander Command instance', () => {
      const cmd = createMcpCommand();
      expect(cmd).toBeInstanceOf(Command);
    });

    it('has name "mcp"', () => {
      const cmd = createMcpCommand();
      expect(cmd.name()).toBe('mcp');
    });

    it('has a description about MCP server', () => {
      const cmd = createMcpCommand();
      expect(cmd.description()).toMatch(/mcp/i);
    });

    it('has a --log-level option', () => {
      const cmd = createMcpCommand();
      const logLevelOption = cmd.options.find((o) => o.long === '--log-level');
      expect(logLevelOption).toBeDefined();
    });

    it('--log-level defaults to warn', () => {
      const cmd = createMcpCommand();
      const logLevelOption = cmd.options.find((o) => o.long === '--log-level');
      expect(logLevelOption?.defaultValue).toBe('warn');
    });
  });

  describe('help text', () => {
    it('includes claude_desktop_config.json example', () => {
      const cmd = createMcpCommand();
      // addHelpText('after') content is stored in _afterHelpList
      // We capture it by calling help() with a write override
      let helpOutput = '';
      cmd.configureOutput({ writeOut: (str) => (helpOutput += str) });
      cmd.outputHelp();
      expect(helpOutput).toContain('claude_desktop_config.json');
    });

    it('includes mcpServers config with shep command', () => {
      const cmd = createMcpCommand();
      let helpOutput = '';
      cmd.configureOutput({ writeOut: (str) => (helpOutput += str) });
      cmd.outputHelp();
      expect(helpOutput).toContain('"mcpServers"');
      expect(helpOutput).toContain('"command": "shep"');
    });
  });

  describe('command execution', () => {
    it('resolves McpServerFactory from container', async () => {
      const cmd = createMcpCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(container.resolve).toHaveBeenCalledWith('McpServerFactory');
    });

    it('calls the factory to create the MCP server service', async () => {
      const cmd = createMcpCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(mockFactory).toHaveBeenCalledTimes(1);
    });

    it('calls start() on the MCP server service', async () => {
      const cmd = createMcpCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(mockMcpServerService.start).toHaveBeenCalledTimes(1);
    });

    it('registers SIGINT handler', async () => {
      const cmd = createMcpCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(signalHandlers.has('SIGINT')).toBe(true);
    });

    it('registers SIGTERM handler', async () => {
      const cmd = createMcpCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(signalHandlers.has('SIGTERM')).toBe(true);
    });
  });

  describe('graceful shutdown', () => {
    it('SIGINT triggers server.stop()', async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      const cmd = createMcpCommand();
      await cmd.parseAsync([], { from: 'user' });

      const handler = signalHandlers.get('SIGINT');
      expect(handler).toBeDefined();
      await handler!();

      expect(mockMcpServerService.stop).toHaveBeenCalledTimes(1);
      mockExit.mockRestore();
    });

    it('SIGTERM triggers server.stop()', async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      const cmd = createMcpCommand();
      await cmd.parseAsync([], { from: 'user' });

      const handler = signalHandlers.get('SIGTERM');
      expect(handler).toBeDefined();
      await handler!();

      expect(mockMcpServerService.stop).toHaveBeenCalledTimes(1);
      mockExit.mockRestore();
    });

    it('shutdown handler exits the process', async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      const cmd = createMcpCommand();
      await cmd.parseAsync([], { from: 'user' });

      const handler = signalHandlers.get('SIGINT');
      await handler!();

      expect(mockExit).toHaveBeenCalledWith(0);
      mockExit.mockRestore();
    });

    it('prevents double shutdown', async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      const cmd = createMcpCommand();
      await cmd.parseAsync([], { from: 'user' });

      const handler = signalHandlers.get('SIGINT');
      await handler!();
      await handler!();

      // stop() should only be called once even though handler was invoked twice
      expect(mockMcpServerService.stop).toHaveBeenCalledTimes(1);
      mockExit.mockRestore();
    });
  });

  describe('stdio safety', () => {
    it('MCP server source files contain no console.log calls', () => {
      const mcpDir = join(__dirname, '../../../packages/core/src/infrastructure/services/mcp');
      const mcpCommandFile = join(
        __dirname,
        '../../../src/presentation/cli/commands/mcp.command.ts'
      );

      // Recursively find all .ts files in the MCP service directory
      function findTsFiles(dir: string): string[] {
        const files: string[] = [];
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            files.push(...findTsFiles(fullPath));
          } else if (entry.name.endsWith('.ts')) {
            files.push(fullPath);
          }
        }
        return files;
      }

      const allFiles = [...findTsFiles(mcpDir), mcpCommandFile];
      const violations: string[] = [];

      for (const file of allFiles) {
        const content = readFileSync(file, 'utf-8');
        // Match console.log but not console.error (which is fine for stderr)
        if (/console\.log\s*\(/.test(content)) {
          violations.push(file);
        }
      }

      expect(violations).toEqual([]);
    });

    it('MCP server command does not write to stdout during startup', async () => {
      const stdoutWriteSpy = vi.spyOn(process.stdout, 'write');

      const cmd = createMcpCommand();
      await cmd.parseAsync([], { from: 'user' });

      // Filter out any calls that are from the MCP protocol itself (which is expected)
      // We're checking that no diagnostic/log output goes to stdout
      const nonProtocolWrites = stdoutWriteSpy.mock.calls.filter(([data]) => {
        const str = typeof data === 'string' ? data : data.toString();
        // MCP protocol messages are JSON-RPC — allow those
        try {
          const parsed = JSON.parse(str);
          if (parsed.jsonrpc === '2.0') return false;
        } catch {
          // Not JSON — this would be a violation
        }
        return true;
      });

      expect(nonProtocolWrites).toHaveLength(0);
      stdoutWriteSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('sets process.exitCode = 1 on factory error', async () => {
      mockFactory.mockRejectedValueOnce(new Error('factory failed'));

      const cmd = createMcpCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(process.exitCode).toBe(1);
      // Reset
      process.exitCode = undefined;
    });

    it('sets process.exitCode = 1 on start error', async () => {
      mockMcpServerService.start.mockRejectedValueOnce(new Error('start failed'));

      const cmd = createMcpCommand();
      await cmd.parseAsync([], { from: 'user' });

      expect(process.exitCode).toBe(1);
      // Reset
      process.exitCode = undefined;
    });
  });
});
