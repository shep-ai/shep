import type { DependencyContainer } from 'tsyringe';

import type { IToolMetadataProvider } from '../../../application/ports/output/services/tool-metadata-provider.interface.js';
import { ToolMetadataProvider } from '../../services/tool-installer/tool-metadata.provider.js';
import type { IIdeLauncherService } from '../../../application/ports/output/services/ide-launcher-service.interface.js';
import { JsonDrivenIdeLauncherService } from '../../services/ide-launchers/json-driven-ide-launcher.service.js';
import type { IWorktreePathProvider } from '../../../application/ports/output/services/worktree-path-provider.interface.js';
import { WorktreePathProvider } from '../../services/ide-launchers/worktree-path.provider.js';
import type { INodeHelpers } from '../../../application/ports/output/services/node-helpers.interface.js';
import { NodeHelpersAdapter } from '../../services/agents/feature-agent/nodes/node-helpers.adapter.js';
import type { IDaemonService } from '../../../application/ports/output/services/daemon-service.interface.js';
import { DaemonPidService } from '../../services/daemon/daemon-pid.service.js';

/**
 * Register tool metadata provider, IDE launchers, worktree path provider,
 * node helpers, and daemon service.
 */
export function registerTools(container: DependencyContainer): void {
  container.registerSingleton<IToolMetadataProvider>('IToolMetadataProvider', ToolMetadataProvider);
  container.registerSingleton<IIdeLauncherService>(
    'IIdeLauncherService',
    JsonDrivenIdeLauncherService
  );
  container.registerSingleton<IWorktreePathProvider>('IWorktreePathProvider', WorktreePathProvider);
  container.registerSingleton<INodeHelpers>('INodeHelpers', NodeHelpersAdapter);
  container.registerSingleton<IDaemonService>('IDaemonService', DaemonPidService);
}
