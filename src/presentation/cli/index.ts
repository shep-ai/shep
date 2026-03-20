#!/usr/bin/env node

/**
 * Shep AI CLI Entry Point
 *
 * Autonomous AI Native SDLC Platform - CLI Interface
 *
 * Usage:
 *   shep [command] [options]
 *
 * Commands:
 *   shep              Start the web UI daemon (or run onboarding on first run)
 *   shep start        Start the web UI as a background daemon
 *   shep stop         Stop the running web UI daemon
 *   shep restart      Restart (or start) the web UI daemon
 *   shep status       Show status and metrics of the running daemon
 *   shep version      Display version information
 *   shep ui           Start the web UI (foreground, interactive)
 *   shep run          Run an AI agent workflow
 *   shep agent        Manage and view agent runs
 *   shep feat         Manage features through the SDLC lifecycle
 *   shep repo         Manage tracked repositories
 *   shep settings     Configure Shep settings
 *   shep upgrade      Upgrade Shep CLI to the latest version
 *   shep --version    Display version number only
 *
 * Global Options:
 *   -v, --version  Display version number
 *   -h, --help     Display help
 */

// IMPORTANT: reflect-metadata must be imported first for tsyringe DI
import 'reflect-metadata';

import { Command } from 'commander';
import type { IVersionService } from '@/application/ports/output/services/version-service.interface.js';
import { createVersionCommand } from './commands/version.command.js';
import { createSettingsCommand } from './commands/settings/index.js';
import { createUiCommand } from './commands/ui.command.js';
import { createRunCommand } from './commands/run.command.js';
import { createAgentCommand } from './commands/agent/index.js';
import { createFeatCommand } from './commands/feat/index.js';
import { createRepoCommand } from './commands/repo/index.js';
import { createSessionCommand } from './commands/session/index.js';
import { createIdeOpenCommand } from './commands/ide-open.command.js';
import { createInstallCommand } from './commands/install.command.js';
import { createUpgradeCommand } from './commands/upgrade.command.js';
import { createToolsCommand } from './commands/tools.command.js';
import { createCoastsCommand } from './commands/coasts/index.js';
import { messages } from './ui/index.js';

// Daemon lifecycle commands
import { createStartCommand } from './commands/start.command.js';
import { createStopCommand } from './commands/stop.command.js';
import { createStatusCommand } from './commands/status.command.js';
import { createRestartCommand } from './commands/restart.command.js';
import { createServeCommand } from './commands/_serve.command.js';
import { startDaemon } from './commands/daemon/start-daemon.js';

// DI container and settings
import { initializeContainer, container } from '@/infrastructure/di/container.js';
import { InitializeSettingsUseCase } from '@/application/use-cases/settings/initialize-settings.use-case.js';
import { initializeSettings } from '@/infrastructure/services/settings.service.js';

/**
 * Bootstrap function - initializes all dependencies before CLI starts.
 * Performs async initialization (database, settings) before parsing commands.
 */
async function bootstrap() {
  try {
    // Step 1: Initialize DI container (database + migrations)
    try {
      await initializeContainer();
      // Expose the DI container on globalThis for the web UI's server-side code
      (globalThis as Record<string, unknown>).__shepContainer = container;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      messages.error('Failed to initialize database', err);
      throw error; // Re-throw to trigger outer catch
    }

    // Step 2: Initialize settings
    try {
      const initializeSettingsUseCase = container.resolve(InitializeSettingsUseCase);
      const settings = await initializeSettingsUseCase.execute();
      initializeSettings(settings);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      messages.error('Failed to initialize settings', err);
      throw error;
    }

    // Step 3: Set up Commander CLI
    const versionService = container.resolve<IVersionService>('IVersionService');
    const { version, description } = versionService.getVersion();

    const program = new Command()
      .name('shep')
      .description(description)
      .version(version, '-v, --version', 'Display version number')
      // task-10: Default action starts the daemon (or shows already-running URL).
      // The onboarding gate above (lines 82-89) ensures the wizard runs on first launch;
      // after the gate, startDaemon() is the correct next step in both cases.
      // Commander only fires this action when no subcommand matches, so `shep start` etc.
      // are unaffected.
      .action(async () => {
        await startDaemon();
      });

    // Register commands
    program.addCommand(createVersionCommand());
    program.addCommand(createSettingsCommand());
    program.addCommand(createUiCommand());
    program.addCommand(createRunCommand());
    program.addCommand(createAgentCommand());
    program.addCommand(createFeatCommand());
    program.addCommand(createRepoCommand());
    program.addCommand(createSessionCommand());
    program.addCommand(createIdeOpenCommand());
    program.addCommand(createInstallCommand());
    program.addCommand(createToolsCommand());
    program.addCommand(createUpgradeCommand());
    program.addCommand(createCoastsCommand());

    // Daemon lifecycle commands (task-9)
    program.addCommand(createStartCommand());
    program.addCommand(createStopCommand());
    program.addCommand(createRestartCommand());
    program.addCommand(createStatusCommand());
    program.addCommand(createServeCommand()); // hidden from --help

    // Parse arguments (parseAsync needed for async command actions like init)
    await program.parseAsync();
  } catch (_error) {
    // Final catch - already logged specific error above
    process.exit(1);
  }
}

// Global error handlers
process.on('uncaughtException', (error) => {
  messages.error('An unexpected error occurred', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  messages.error('Unhandled promise rejection', error);
  process.exit(1);
});

// Start the CLI
bootstrap();
