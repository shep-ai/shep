/**
 * Analysis Prompt Builder (dev-server agent)
 *
 * Pure function that builds the structured-analysis prompt the analyze node
 * sends when deterministic detection fails. Migrated from the legacy
 * DevEnvironmentAgentService prompt building (buildPrompt / getDirListing /
 * readConfigFiles), with fs access injectable for tests.
 *
 * The config-file inventory is shared with the run-plan cache hashing
 * (CONFIG_FILES from config-hash.js) so the prompt context and cache
 * invalidation always consider the same manifest set.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_FILES } from '@/infrastructure/services/deployment/config-hash.js';

/** Max characters to include from any single config file. */
export const MAX_FILE_CONTENT_LENGTH = 4000;

/** Fallback body for the config-contents section when nothing is readable. */
const NO_CONFIG_FILES_MESSAGE = 'No recognized config files found.';

/** Injectable fs access for tests. */
export interface AnalysisPromptIo {
  readdir: (path: string) => string[];
  readFile: (path: string) => string;
  existsSync: (path: string) => boolean;
}

const defaultIo: AnalysisPromptIo = {
  readdir: (path: string) => readdirSync(path, { encoding: 'utf-8' }),
  readFile: (path: string) => readFileSync(path, 'utf-8'),
  existsSync,
};

/**
 * Build the repository-analysis prompt for the structured agent call.
 *
 * @param repoPath - Absolute path of the repository to analyze
 * @param io       - Optional fs access override (defaults to real fs)
 */
export function buildAnalysisPrompt(repoPath: string, io: AnalysisPromptIo = defaultIo): string {
  const dirListing = getDirListing(repoPath, io);
  const configContents = readConfigFiles(repoPath, io);

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

/** Root-level directory listing; empty on read failure (never throws). */
function getDirListing(repoPath: string, io: AnalysisPromptIo): string[] {
  try {
    return io.readdir(repoPath);
  } catch {
    return [];
  }
}

/**
 * Fenced contents of every recognized config file present in the repo root.
 * Presence is checked per file with existsSync (rather than the directory
 * listing) so an unreadable listing does not suppress config context.
 * Unreadable files are skipped; oversized files are truncated.
 */
function readConfigFiles(repoPath: string, io: AnalysisPromptIo): string {
  const sections: string[] = [];

  for (const configFile of CONFIG_FILES) {
    const filePath = join(repoPath, configFile);
    if (!io.existsSync(filePath)) continue;

    try {
      let content = io.readFile(filePath);

      // Truncate large files to prevent prompt overflow
      if (content.length > MAX_FILE_CONTENT_LENGTH) {
        content = `${content.slice(0, MAX_FILE_CONTENT_LENGTH)}\n... (truncated)`;
      }

      sections.push(`### ${configFile}\n\`\`\`\n${content}\n\`\`\``);
    } catch {
      // Unreadable config file — skip it; the prompt is best-effort context.
    }
  }

  if (sections.length === 0) {
    return NO_CONFIG_FILES_MESSAGE;
  }

  return sections.join('\n\n');
}
