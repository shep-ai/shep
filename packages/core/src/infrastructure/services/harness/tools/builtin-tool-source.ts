/**
 * Builtin tool source (spec 119): the seven V0 capabilities and their
 * implementations. MCP and plugin sources arrive in V1 behind the same port.
 */
import { RiskClass, type Capability } from '../../../../domain/generated/output.js';
import type {
  IToolSource,
  ToolCatalog,
} from '../../../../application/ports/output/harness/index.js';
import { createBuiltinTools } from './builtin-tools.js';

/** Tier-1 capability descriptions: always cheap, always in the stable prefix. */
const CAPABILITIES: Omit<Capability, 'implementationIds'>[] = [
  {
    id: 'list_files',
    title: 'List files',
    snippet: 'list repository files under a directory or matching a glob',
    tags: ['list', 'files', 'tree', 'glob', 'directory', 'folder', 'exist', 'ls'],
    risk: RiskClass.Low,
  },
  {
    id: 'search_source_code',
    title: 'Search source',
    snippet: 'find source locations matching text or a regular expression',
    tags: [
      'search',
      'grep',
      'find',
      'locate',
      'look',
      'symbol',
      'usage',
      'call',
      'reference',
      'where',
      'defined',
      'occurrence',
      'string',
    ],
    risk: RiskClass.Low,
  },
  {
    id: 'read_file',
    title: 'Read file',
    snippet: 'read a file or a line range of a file',
    tags: ['read', 'open', 'view', 'show', 'line', 'content', 'file'],
    risk: RiskClass.Low,
  },
  {
    id: 'inspect_git',
    title: 'Inspect git',
    snippet: 'show git status or the working-tree diff',
    tags: [
      'git',
      'diff',
      'status',
      'staged',
      'modified',
      'uncommitted',
      'commit',
      'log',
      'history',
    ],
    risk: RiskClass.Low,
  },
  {
    id: 'run_command',
    title: 'Run command',
    snippet: 'run a shell command in the worktree (checked against permission policy)',
    tags: [
      'shell',
      'command',
      'execute',
      'exec',
      'install',
      'build',
      'script',
      'migration',
      'lint',
      'compile',
    ],
    risk: RiskClass.High,
  },
  {
    id: 'run_tests',
    title: 'Run tests',
    snippet: "run the repository's tests, optionally filtered",
    tags: ['test', 'suite', 'verify', 'check', 'spec', 'failing'],
    risk: RiskClass.Medium,
  },
  {
    id: 'apply_patch',
    title: 'Apply patch',
    snippet: 'change files: exact text edits, new files, or a unified diff',
    tags: [
      'edit',
      'write',
      'change',
      'fix',
      'modify',
      'create',
      'new',
      'add',
      'update',
      'replace',
      'rename',
      'implement',
      'refactor',
      'patch',
      'diff',
    ],
    risk: RiskClass.Medium,
  },
];

export const BUILTIN_TOOL_SOURCE_ID = 'builtin';

export class BuiltinToolSource implements IToolSource {
  readonly id = BUILTIN_TOOL_SOURCE_ID;

  async discover(): Promise<ToolCatalog> {
    const executors = createBuiltinTools();
    const capabilities = CAPABILITIES.map((c) => ({
      ...c,
      implementationIds: executors
        .filter((e) => e.implementation.capabilityId === c.id)
        .map((e) => e.implementation.id),
    }));
    return { capabilities, executors };
  }
}
