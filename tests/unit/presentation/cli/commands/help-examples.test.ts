/**
 * CLI `--help` examples
 *
 * Every user-facing subcommand in these groups ends its `--help` with an
 * `Examples:` block, and every `$ shep …` example in those blocks parses
 * against the command as it is defined today — so an example cannot outlive
 * a renamed option, a removed argument or a narrowed set of choices.
 *
 * Commands are built and parsed in-process (actions replaced by no-ops); the
 * CLI is never spawned.
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import type { Command } from 'commander';

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: vi.fn() },
}));

vi.mock('@/infrastructure/services/settings.service.js', () => ({
  hasSettings: vi.fn(() => false),
  getSettings: vi.fn(() => ({ featureFlags: {}, environment: {} })),
}));

// `shep agent message` is a dev-only namespace; show it as production users see it (hidden).
vi.mock('../../../../../src/presentation/cli/commands/agent/message/dev-mode.js', () => ({
  isDevModeEnabled: () => false,
}));

const COMMANDS = '../../../../../src/presentation/cli/commands';

const GROUP_FACTORIES: Record<string, () => Promise<Command>> = {
  agent: async () => (await import(`${COMMANDS}/agent/index.js`)).createAgentCommand(),
  app: async () => (await import(`${COMMANDS}/app/index.js`)).createAppCommand(),
  bedrock: async () =>
    (await import(`${COMMANDS}/bedrock/bedrock.command.js`)).createBedrockCommand(),
  cluster: async () => (await import(`${COMMANDS}/cluster/index.js`)).createClusterCommand(),
  cycle: async () => (await import(`${COMMANDS}/cycle/index.js`)).createCycleCommand(),
  dev: async () => (await import(`${COMMANDS}/dev/index.js`)).createDevCommand(),
  feat: async () => (await import(`${COMMANDS}/feat/index.js`)).createFeatCommand(),
  feedback: async () => (await import(`${COMMANDS}/feedback/index.js`)).createFeedbackCommand(),
  fleet: async () => (await import(`${COMMANDS}/fleet/index.js`)).createFleetCommand(),
  ide: async () => (await import(`${COMMANDS}/ide-open.command.js`)).createIdeOpenCommand(),
  intake: async () => (await import(`${COMMANDS}/intake/index.js`)).createIntakeCommand(),
  item: async () => (await import(`${COMMANDS}/item/index.js`)).createItemCommand(),
  learn: async () => (await import(`${COMMANDS}/learn/index.js`)).createLearnCommand(),
  notifications: async () =>
    (await import(`${COMMANDS}/notifications/index.js`)).createNotificationsCommand(),
  outcome: async () => (await import(`${COMMANDS}/outcome/index.js`)).createOutcomeCommand(),
  project: async () => (await import(`${COMMANDS}/project/index.js`)).createProjectCommand(),
  repo: async () => (await import(`${COMMANDS}/repo/index.js`)).createRepoCommand(),
  session: async () => (await import(`${COMMANDS}/session/index.js`)).createSessionCommand(),
  whatsapp: async () =>
    (await import(`${COMMANDS}/whatsapp/whatsapp.command.js`)).createWhatsappCommand(),
  workflow: async () => (await import(`${COMMANDS}/workflow/index.js`)).createWorkflowCommand(),
};

interface Leaf {
  path: string;
  command: Command;
  hidden: boolean;
}

function isHidden(cmd: Command): boolean {
  return (cmd as unknown as { _hidden?: boolean })._hidden === true;
}

function hasAction(cmd: Command): boolean {
  return Boolean((cmd as unknown as { _actionHandler?: unknown })._actionHandler);
}

function leaves(cmd: Command, path = `shep ${cmd.name()}`, hidden = false): Leaf[] {
  const self = hasAction(cmd) ? [{ path, command: cmd, hidden }] : [];
  return [
    ...self,
    ...cmd.commands.flatMap((sub) => leaves(sub, `${path} ${sub.name()}`, hidden || isHidden(sub))),
  ];
}

function fullHelp(cmd: Command): string {
  let output = '';
  cmd.configureOutput({
    writeOut: (str) => {
      output += str;
    },
    writeErr: (str) => {
      output += str;
    },
  });
  cmd.outputHelp();
  return output;
}

/** `$ shep …` lines of the Examples block, without their trailing descriptions. */
function exampleInvocations(help: string): string[] {
  const block = help.split('\nExamples:\n')[1] ?? '';
  return block
    .split('\n')
    .filter((line) => line.startsWith('  $ '))
    .map((line) => line.slice('  $ '.length).split(/ {2,}/)[0])
    .flatMap((line) => line.split(/\s*(?:&&|\|)\s*/))
    .map((segment) => segment.replace(/^(?:[A-Z_]+=\S+\s+)+/, ''))
    .filter((segment) => segment.startsWith('shep '));
}

/** Split a shell-like line on whitespace, honouring double quotes. */
function tokenize(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
}

/** Make a command tree safe to parse: no actions run, errors throw instead of exiting. */
function neutralize(cmd: Command): Command {
  cmd.exitOverride();
  cmd.configureOutput({ writeOut: () => undefined, writeErr: () => undefined });
  if (hasAction(cmd)) cmd.action(() => undefined);
  cmd.commands.forEach(neutralize);
  return cmd;
}

async function parseExample(example: string): Promise<void> {
  const [, group, ...args] = tokenize(example);
  const factory = GROUP_FACTORIES[group];
  if (!factory) throw new Error(`no command group "${group}" is covered by this test`);
  await neutralize(await factory()).parseAsync(args, { from: 'user' });
}

const groups = await Promise.all(
  Object.entries(GROUP_FACTORIES).map(async ([name, factory]) => ({
    name,
    leaves: leaves(await factory()),
  }))
);

describe('CLI help examples', () => {
  describe.each(groups)('shep $name', ({ leaves: commands }) => {
    const visible = commands.filter((leaf) => !leaf.hidden);

    it.each(visible.map((leaf) => [leaf.path, leaf] as const))(
      '%s --help ends with an Examples block for itself',
      (path, leaf) => {
        const help = fullHelp(leaf.command);
        expect(help).toContain('\nExamples:\n');
        expect(exampleInvocations(help).some((example) => example.startsWith(path))).toBe(true);
      }
    );

    const examples = commands.flatMap((leaf) => exampleInvocations(fullHelp(leaf.command)));
    it.each(examples)('"%s" parses against the current definition', async (example) => {
      await expect(parseExample(example)).resolves.toBeUndefined();
    });
  });
});
