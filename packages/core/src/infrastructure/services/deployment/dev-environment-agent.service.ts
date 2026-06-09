/**
 * Dev Environment Agent Service
 *
 * AI-driven service that analyzes any repository to determine how to start
 * a local dev environment. Language-agnostic — supports Node.js, Python,
 * Go, Rust, Java, Ruby, and more. Uses structured agent calls to get
 * typed analysis results.
 *
 * Features:
 * - In-memory per-repo caching for fast repeated calls
 * - Reads key config files (package.json, Cargo.toml, etc.) for context
 * - Handles "not deployable" repos gracefully
 * - Truncates large files to prevent prompt overflow
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  IDevEnvironmentAgent,
  DevEnvironmentAnalysis,
  DevEnvironmentAnalyzeOptions,
} from '@/application/ports/output/services/dev-environment-agent.interface.js';
import type { IStructuredAgentCaller } from '@/application/ports/output/agents/structured-agent-caller.interface.js';
import { createDeploymentLogger } from './deployment-logger.js';

const log = createDeploymentLogger('[DevEnvironmentAgent]');

/** Max characters to include from any single config file. */
const MAX_FILE_CONTENT_LENGTH = 4000;

/** Config files to read and include in the prompt, in priority order. */
const CONFIG_FILES = [
  'package.json',
  'docker-compose.yml',
  'docker-compose.yaml',
  'Dockerfile',
  'Makefile',
  'Cargo.toml',
  'go.mod',
  'requirements.txt',
  'Pipfile',
  'pyproject.toml',
  'setup.py',
  'Gemfile',
  'build.gradle',
  'pom.xml',
  'mix.exs',
  'deno.json',
  'bun.lockb',
];

/** JSON schema for the structured agent response. */
const ANALYSIS_SCHEMA = {
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
};

/** Dependencies injectable for testing. */
export interface DevEnvironmentAgentDeps {
  structuredAgentCaller: Pick<IStructuredAgentCaller, 'call'>;
  readdir: (path: string) => string[];
  readFile: (path: string) => string;
  existsSync: (path: string) => boolean;
}

const defaultDeps: DevEnvironmentAgentDeps = {
  structuredAgentCaller: null as unknown as Pick<IStructuredAgentCaller, 'call'>,
  readdir: (path: string) => readdirSync(path, { encoding: 'utf-8' }),
  readFile: (path: string) => readFileSync(path, 'utf-8'),
  existsSync,
};

export class DevEnvironmentAgentService implements IDevEnvironmentAgent {
  private readonly cache = new Map<string, DevEnvironmentAnalysis>();
  private readonly deps: DevEnvironmentAgentDeps;

  constructor(
    deps: Partial<DevEnvironmentAgentDeps> & Pick<DevEnvironmentAgentDeps, 'structuredAgentCaller'>
  ) {
    this.deps = { ...defaultDeps, ...deps };
  }

  async analyze(
    repositoryPath: string,
    options?: DevEnvironmentAnalyzeOptions
  ): Promise<DevEnvironmentAnalysis> {
    log.info(
      `analyze() called — repositoryPath="${repositoryPath}", skipCache=${options?.skipCache ?? false}`
    );

    if (!this.deps.existsSync(repositoryPath)) {
      throw new Error(`Repository path does not exist: ${repositoryPath}`);
    }

    // Check cache
    if (!options?.skipCache) {
      const cached = this.cache.get(repositoryPath);
      if (cached) {
        log.info(`cache hit for "${repositoryPath}"`);
        return cached;
      }
    }

    // Build prompt with repo context
    const prompt = this.buildPrompt(repositoryPath);

    log.info(`calling structured agent for "${repositoryPath}"`);
    const result = await this.deps.structuredAgentCaller.call<DevEnvironmentAnalysis>(
      prompt,
      ANALYSIS_SCHEMA,
      {
        silent: true,
        maxTurns: 3,
        cwd: repositoryPath,
      }
    );

    // Cache successful result
    this.cache.set(repositoryPath, result);
    log.info(
      `analysis complete — deployable=${result.deployable}, command=${result.command}, language=${result.language}`
    );

    return result;
  }

  clearCache(repositoryPath: string): void {
    log.info(`clearCache() — repositoryPath="${repositoryPath}"`);
    this.cache.delete(repositoryPath);
  }

  clearAllCaches(): void {
    log.info(`clearAllCaches() — clearing ${this.cache.size} entries`);
    this.cache.clear();
  }

  private buildPrompt(repositoryPath: string): string {
    const dirListing = this.getDirListing(repositoryPath);
    const configContents = this.readConfigFiles(repositoryPath, dirListing);

    return `You are a dev environment analysis agent. Analyze this repository and determine how to start a local development server.

## Repository Directory Listing (root level)

${dirListing.join('\n')}

## Config File Contents

${configContents}

## Instructions

Analyze the repository structure and config files above to determine:

1. **Is this repo deployable?** Does it have a web server, API server, or UI that can be started locally?
   - Libraries (npm packages, Python packages, Go modules meant only for import) are NOT deployable
   - CLI tools that don't serve HTTP are NOT deployable
   - Data repositories, documentation-only repos are NOT deployable
   - Scripts that run once and exit are NOT deployable

2. **What command starts the dev server?** Consider:
   - Node.js: \`npm run dev\`, \`pnpm dev\`, \`yarn dev\`, \`npm start\`
   - Python: \`python manage.py runserver\`, \`flask run\`, \`uvicorn main:app --reload\`
   - Go: \`go run .\`, \`air\` (hot reload)
   - Rust: \`cargo run\`, \`cargo watch -x run\`
   - Ruby: \`rails server\`, \`bundle exec rails s\`
   - Java: \`./gradlew bootRun\`, \`mvn spring-boot:run\`
   - Docker: \`docker-compose up\`
   - Generic: \`make dev\`, \`make run\`

3. **What port will it listen on?** Check config files for port definitions.

4. **What setup is needed first?** (e.g., install dependencies)

If the repo has NO server or UI to start, set deployable=false and explain why.

Respond with ONLY the JSON object matching the schema.`;
  }

  private getDirListing(repositoryPath: string): string[] {
    try {
      return this.deps.readdir(repositoryPath);
    } catch {
      log.warn(`Failed to read directory listing for "${repositoryPath}"`);
      return [];
    }
  }

  private readConfigFiles(repositoryPath: string, dirListing: string[]): string {
    const sections: string[] = [];

    for (const configFile of CONFIG_FILES) {
      if (!dirListing.includes(configFile)) continue;

      try {
        const filePath = join(repositoryPath, configFile);
        let content = this.deps.readFile(filePath);

        // Truncate large files
        if (content.length > MAX_FILE_CONTENT_LENGTH) {
          content = `${content.slice(0, MAX_FILE_CONTENT_LENGTH)}\n... (truncated)`;
        }

        sections.push(`### ${configFile}\n\`\`\`\n${content}\n\`\`\``);
      } catch {
        log.warn(`Failed to read config file "${configFile}" in "${repositoryPath}"`);
      }
    }

    if (sections.length === 0) {
      return 'No recognized config files found.';
    }

    return sections.join('\n\n');
  }
}
