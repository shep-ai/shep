/**
 * Repair node factory for the feature-agent graph.
 *
 * Reads broken YAML content and validation errors from state,
 * builds a constrained repair prompt, and sends it to the executor
 * with limited tools (write-only) to fix the YAML files.
 */

import { join } from 'node:path';
import type { FeatureAgentState } from '../state.js';
import type { IAgentExecutor } from '@/application/ports/output/agents/agent-executor.interface.js';
import { readSpecFile, createNodeLogger } from './node-helpers.js';
import { DEFAULT_AGENT_CALL_TIMEOUT_MS } from '../../common/agent-timeouts.js';

/**
 * Build a repair prompt containing the broken YAML, validation errors,
 * and file paths for the executor to write fixed files.
 */
export function buildRepairPrompt(
  filename: string | string[],
  content: string,
  errors: string[],
  specDir: string
): string {
  const filenames = Array.isArray(filename) ? filename : [filename];
  // Normalize to forward slashes so prompts always use POSIX paths (even on Windows)
  const filePaths = filenames.map((f) => join(specDir, f).replaceAll('\\', '/'));

  return [
    '## YAML Repair Task',
    '',
    `Fix the following YAML validation errors in ${filenames.join(' and ')}.`,
    '',
    '### Validation Errors',
    ...errors.map((e) => `- ${e}`),
    '',
    '### Current File Content',
    '```yaml',
    content,
    '```',
    '',
    '### Output Files',
    ...filePaths.map((p) => `- Write fixed YAML to: ${p}`),
    '',
    '### YAML Escaping Rules',
    '',
    '**CRITICAL:** Follow these rules to ensure valid YAML:',
    '',
    '1. **Wrap all string values in double quotes** — prevents parsing errors from special characters',
    '2. **Escape internal double quotes with backslash** — use \\\\" inside quoted strings',
    '3. **Use block scalars (|) for multi-line text** — avoids escaping complexity',
    '',
    '### Examples (incorrect → correct):',
    '',
    '**Example 1: Unescaped quote in contraction**',
    "- ❌ Before: text: it's broken",
    '- ✅ After: text: "it\'s broken"',
    '- ✅ Or use: text: | followed by indented text',
    '',
    '**Example 2: Unquoted string with special characters**',
    '- ❌ Before: title: Add "strict" mode',
    '- ✅ After: title: "Add \\\\"strict\\\\" mode"',
    '',
    '**Example 3: Multi-line content on single line**',
    '- ❌ Before: description: First line then Second line',
    '- ✅ After: description: | followed by indented multi-line text',
    '',
    '### Rules',
    '- Fix ONLY the reported errors',
    '- Preserve all existing valid content',
    '- Use proper YAML formatting (apply escaping rules above)',
    '- Do not add fields that were not in the original',
  ].join('\n');
}

/**
 * Factory that creates a repair node for a specific YAML file (or files).
 *
 * Reads the broken YAML, builds a repair prompt with validation errors
 * from state, and calls the executor with constrained options (maxTurns=5,
 * write-only tools, no MCP, the default agent call timeout).
 */
export function createRepairNode(
  filename: string | string[],
  executor: IAgentExecutor
): (state: FeatureAgentState) => Promise<Partial<FeatureAgentState>> {
  const label = Array.isArray(filename) ? filename.join('+') : filename;
  const log = createNodeLogger(`repair:${label}`);

  return async (state: FeatureAgentState): Promise<Partial<FeatureAgentState>> => {
    log.activate();
    log.info(`Repairing ${label} (attempt ${state.validationRetries})`);

    const filenames = Array.isArray(filename) ? filename : [filename];
    const contents = filenames.map((f) => readSpecFile(state.specDir, f));
    const combinedContent = filenames.map((f, i) => `--- ${f} ---\n${contents[i]}`).join('\n\n');

    const prompt = buildRepairPrompt(
      filename,
      combinedContent,
      state.lastValidationErrors,
      state.specDir
    );

    const options = {
      cwd: state.worktreePath || state.repositoryPath,
      maxTurns: 5,
      disableMcp: true,
      allowedTools: ['write'] as string[],
      // A wedged repair agent must not hang the validate→repair loop forever.
      timeout: DEFAULT_AGENT_CALL_TIMEOUT_MS,
    };

    try {
      const result = await executor.execute(prompt, options);
      log.info(`Repair complete (${result.result.length} chars)`);
      return {
        messages: [`[repair:${label}] Repair attempt ${state.validationRetries} complete`],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Repair failed: ${msg}`);
      return {
        messages: [`[repair:${label}] Repair failed: ${msg}`],
      };
    }
  };
}
