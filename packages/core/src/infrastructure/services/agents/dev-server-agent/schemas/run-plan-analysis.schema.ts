/**
 * Run-Plan Analysis Schema (dev-server agent)
 *
 * JSON schema for the structured agent call the analyze node makes when
 * deterministic detection cannot resolve a dev command. Migrated verbatim
 * from the legacy spec-068 dev-environment agent (spec 103 replaced that
 * service with the dev-server agent graph).
 */

/** JSON schema for the structured agent response. */
export const RUN_PLAN_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    deployable: {
      type: 'boolean',
      description:
        'Whether this repository has a startable dev server or UI. False for libraries, scripts, data repos, etc.',
    },
    reason: {
      type: 'string',
      description: 'Brief explanation of what was detected or why the repo is not deployable.',
    },
    command: {
      type: ['string', 'null'],
      description: 'The shell command to start the dev server. Null if not deployable.',
    },
    cwd: {
      type: 'string',
      description:
        'Working directory relative to repo root where the command should run. Use "." for repo root.',
    },
    expectedPort: {
      type: ['integer', 'null'],
      description: 'Expected port the dev server will listen on. Null if unknown.',
    },
    language: {
      type: ['string', 'null'],
      description:
        'Primary language/runtime (e.g., "node", "python", "go", "rust", "ruby", "java").',
    },
    framework: {
      type: ['string', 'null'],
      description:
        'Detected framework if any (e.g., "next.js", "django", "flask", "gin", "rails").',
    },
    setupCommands: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Setup commands to run before the dev command (e.g., "npm install", "pip install -r requirements.txt").',
    },
  },
  required: [
    'deployable',
    'reason',
    'command',
    'cwd',
    'expectedPort',
    'language',
    'framework',
    'setupCommands',
  ],
  additionalProperties: false,
} as const;

/** Typed shape of a structured analysis response matching RUN_PLAN_ANALYSIS_SCHEMA. */
export interface DevServerAnalysis {
  /** Whether this repository has a startable dev server or UI. */
  deployable: boolean;
  /** Brief explanation of what was detected or why the repo is not deployable. */
  reason: string;
  /** The shell command to start the dev server. Null if not deployable. */
  command: string | null;
  /** Working directory relative to repo root ('.' means repo root). */
  cwd: string;
  /** Expected port the dev server will listen on. Null if unknown. */
  expectedPort: number | null;
  /** Primary language/runtime (e.g., 'node', 'python'). Null if unknown. */
  language: string | null;
  /** Detected framework (e.g., 'next.js', 'django'). Null if none. */
  framework: string | null;
  /** Setup commands to run before the dev command (may be empty). */
  setupCommands: string[];
}
