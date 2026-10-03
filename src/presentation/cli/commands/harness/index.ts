/**
 * shep harness — the query-aware agent harness (spec 119, experimental).
 *
 *   shep harness init [--repo] [--yes]
 *   shep harness run "<task>" [--repo] [--mode] [--shadow-*] [--non-interactive] [--json]
 *   shep harness resume <id> ["<next instruction>"]
 *   shep harness stop | apply | promote | discard <id>
 *   shep harness ls | inspect session|context <id> | view <chunk-id> | explain <id>
 *   shep harness permissions ls|allow|deny | capabilities | policies
 *   shep harness eval run <suite> | ls | report <run-id> | save <session-id> --suite <id>
 */
import { Command } from 'commander';
import { createRunCommand } from './run.command.js';
import { createResumeCommand } from './resume.command.js';
import {
  createApplyCommand,
  createDiscardCommand,
  createPromoteCommand,
  createStopCommand,
} from './outcome.commands.js';
import {
  createExplainCommand,
  createInspectCommand,
  createLsCommand,
  createViewCommand,
} from './inspect.commands.js';
import {
  createCapabilitiesCommand,
  createInitCommand,
  createPermissionsCommand,
  createPoliciesCommand,
} from './control.commands.js';
import { createEvalCommand } from './eval.commands.js';

export function createHarnessCommand(): Command {
  return new Command('harness')
    .description(
      'Query-aware agent harness (experimental): standalone tasks, context plans, permissions'
    )
    .addCommand(createInitCommand())
    .addCommand(createRunCommand())
    .addCommand(createResumeCommand())
    .addCommand(createStopCommand())
    .addCommand(createApplyCommand())
    .addCommand(createPromoteCommand())
    .addCommand(createDiscardCommand())
    .addCommand(createLsCommand())
    .addCommand(createInspectCommand())
    .addCommand(createViewCommand())
    .addCommand(createExplainCommand())
    .addCommand(createPermissionsCommand())
    .addCommand(createCapabilitiesCommand())
    .addCommand(createPoliciesCommand())
    .addCommand(createEvalCommand());
}
