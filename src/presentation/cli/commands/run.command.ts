/**
 * Run Command
 *
 * Runs an AI agent workflow against a repository.
 *
 * Usage: shep run <agent-name> [options]
 *
 * @example
 * $ shep run analyze-repository
 * $ shep run analyze-repository --prompt "Focus on security"
 * $ shep run analyze-repository --repo /path/to/repo
 * $ shep run analyze-repository --stream
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { RunAgentUseCase } from '@/application/use-cases/agents/run-agent.use-case.js';
import { colors, symbols, fmt, messages } from '../ui/index.js';
import { getCliI18n } from '../i18n.js';

/**
 * Creates a terminal spinner that shows progress while awaiting an async operation.
 * Returns start/stop controls. The spinner writes to stderr to avoid polluting stdout.
 */
function createSpinner(text: string) {
  const frames = symbols.spinner;
  let frameIndex = 0;
  let intervalId: ReturnType<typeof setInterval> | undefined;

  return {
    start() {
      process.stderr.write(`${colors.info(frames[0])} ${text}`);
      intervalId = setInterval(() => {
        frameIndex = (frameIndex + 1) % frames.length;
        process.stderr.write(`\r${colors.info(frames[frameIndex])} ${text}`);
      }, 80);
    },
    stop() {
      if (intervalId) clearInterval(intervalId);
      process.stderr.write(`\r${' '.repeat(text.length + 4)}\r`);
    },
  };
}

interface RunOptions {
  prompt: string;
  repo?: string;
  stream?: boolean;
}

/**
 * Create the run command
 */
export function createRunCommand(): Command {
  const t = getCliI18n().t;
  return new Command('run')
    .description(t('cli:commands.run.description'))
    .argument('<agent-name>', t('cli:commands.run.agentArgument'))
    .option(
      '-p, --prompt <prompt>',
      t('cli:commands.run.promptOption'),
      t('cli:commands.run.promptDefault')
    )
    .option('-r, --repo <path>', t('cli:commands.run.repoOption'))
    .option('-s, --stream', t('cli:commands.run.streamOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep run analyze-repository
  $ shep run analyze-repository --prompt "Focus on security"
  $ shep run analyze-repository --repo /path/to/repo
  $ shep run analyze-repository --stream`
    )
    .action(async (agentName: string, options: RunOptions) => {
      try {
        const useCase = container.resolve(RunAgentUseCase);
        const repoPath = options.repo ?? process.cwd();

        messages.newline();
        console.log(
          `${fmt.heading(t('cli:commands.run.runningAgent'))} ${colors.accent(agentName)}`
        );
        console.log(colors.muted(`  ${t('cli:commands.run.repositoryLabel', { path: repoPath })}`));
        console.log(
          colors.muted(`  ${t('cli:commands.run.promptLabel', { prompt: options.prompt })}`)
        );
        messages.newline();

        if (options.stream) {
          await runStreaming(useCase, agentName, options.prompt, repoPath);
        } else {
          await runBlocking(useCase, agentName, options.prompt, repoPath);
        }

        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.run.failedToRun'), err);
        process.exitCode = 1;
      }
    });
}

/** Stream agent events to stdout in real-time. */
async function runStreaming(
  useCase: RunAgentUseCase,
  agentName: string,
  prompt: string,
  repoPath: string
): Promise<void> {
  const t = getCliI18n().t;
  let hasResult = false;

  for await (const event of useCase.executeStream({
    agentName,
    prompt,
    options: { repositoryPath: repoPath },
  })) {
    if (event.type === 'progress') {
      process.stdout.write(event.content);
    } else if (event.type === 'result') {
      hasResult = true;
      messages.newline();
      messages.success(t('cli:commands.run.agentCompleted', { name: agentName }));
      messages.newline();
      console.log(fmt.heading(t('cli:commands.run.resultHeading')));
      messages.newline();
      console.log(event.content);
    } else if (event.type === 'error') {
      messages.error(event.content);
      process.exitCode = 1;
    }
  }

  if (!hasResult) {
    messages.success(t('cli:commands.run.agentCompleted', { name: agentName }));
  }
}

/** Run agent with spinner (blocking mode). */
async function runBlocking(
  useCase: RunAgentUseCase,
  agentName: string,
  prompt: string,
  repoPath: string
): Promise<void> {
  const t = getCliI18n().t;
  const spinner = createSpinner(t('cli:commands.run.agentWorking', { name: agentName }));
  spinner.start();

  let run;
  try {
    run = await useCase.execute({
      agentName,
      prompt,
      options: { repositoryPath: repoPath },
    });
  } finally {
    spinner.stop();
  }

  if (run.status === 'completed') {
    messages.success(t('cli:commands.run.agentCompleted', { name: agentName }));
    messages.newline();
    console.log(fmt.heading(t('cli:commands.run.resultHeading')));
    messages.newline();
    console.log(run.result ?? t('cli:commands.run.noOutput'));
  } else if (run.status === 'failed') {
    messages.error(t('cli:commands.run.agentFailed'), new Error(run.error ?? 'Unknown error'));
    process.exitCode = 1;
  }
}
