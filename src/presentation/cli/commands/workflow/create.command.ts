/**
 * Workflow Create Command
 *
 * Create a new scheduled workflow definition with a name, prompt, and optional
 * description, tool constraints, and template.
 *
 * Usage:
 *   shep workflow create <name> --prompt <prompt> [options]
 *   shep workflow create <name> --template <template-name> [options]
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { CreateScheduledWorkflowUseCase } from '@/application/use-cases/scheduled-workflows/create-scheduled-workflow.use-case.js';
import { colors, messages } from '../../ui/index.js';
import { getIssueTriageTemplate } from '@/application/use-cases/scheduled-workflows/templates/issue-triage.template.js';
import { getBranchRebaseTemplate } from '@/application/use-cases/scheduled-workflows/templates/branch-rebase.template.js';
import type { WorkflowTemplateData } from '@/application/use-cases/scheduled-workflows/templates/issue-triage.template.js';

function collectToolConstraints(value: string, previous: string[]): string[] {
  return [...previous, value];
}

const TEMPLATES: Record<string, () => WorkflowTemplateData> = {
  'issue-triage': getIssueTriageTemplate,
  'branch-rebase': getBranchRebaseTemplate,
};

export function createCreateCommand(): Command {
  return new Command('create')
    .description('Create a new workflow')
    .argument('<name>', 'Unique workflow name')
    .option('-p, --prompt <prompt>', 'Agent prompt (the instruction the AI agent will execute)')
    .option('-d, --description <text>', 'Human-readable description')
    .option('-t, --tool-constraint <tool>', 'Allowed tool (repeatable)', collectToolConstraints, [])
    .option('--template <name>', 'Create from built-in template (issue-triage, branch-rebase)')
    .option('-r, --repo <path>', 'Repository path (defaults to current directory)')
    .option('--disabled', 'Create in disabled state')
    .action(
      async (
        name: string,
        options: {
          prompt?: string;
          description?: string;
          toolConstraint: string[];
          template?: string;
          repo?: string;
          disabled?: boolean;
        }
      ) => {
        try {
          let prompt = options.prompt;
          let description = options.description;
          let toolConstraints =
            options.toolConstraint.length > 0 ? options.toolConstraint : undefined;

          // Resolve template if specified
          if (options.template) {
            const templateFactory = TEMPLATES[options.template];
            if (!templateFactory) {
              messages.error(
                `Unknown template: "${options.template}". Available templates: ${Object.keys(TEMPLATES).join(', ')}`
              );
              process.exitCode = 1;
              return;
            }
            const template = templateFactory();
            prompt = prompt ?? template.prompt;
            description = description ?? template.description;
            toolConstraints = toolConstraints ?? template.toolConstraints;
          }

          if (!prompt) {
            messages.error('A prompt is required. Use --prompt <prompt> or --template <name>.');
            process.exitCode = 1;
            return;
          }

          const repositoryPath = options.repo ?? process.cwd();
          const useCase = container.resolve(CreateScheduledWorkflowUseCase);
          const workflow = await useCase.execute({
            name,
            prompt,
            repositoryPath,
            ...(description != null && { description }),
            ...(toolConstraints != null && { toolConstraints }),
            ...(options.disabled && { enabled: false }),
          });

          messages.newline();
          messages.success('Workflow created');
          console.log(`  ${colors.muted('Name:')}    ${colors.accent(workflow.name)}`);
          console.log(`  ${colors.muted('ID:')}      ${workflow.id.substring(0, 8)}`);
          console.log(
            `  ${colors.muted('Enabled:')} ${workflow.enabled ? colors.success('yes') : colors.muted('no')}`
          );
          if (workflow.description) {
            console.log(`  ${colors.muted('Desc:')}    ${workflow.description}`);
          }
          messages.newline();
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          messages.error('Failed to create workflow', err);
          process.exitCode = 1;
        }
      }
    );
}
