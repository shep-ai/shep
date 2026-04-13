/**
 * `shep app deploy start <id>`
 *
 * Thin wrapper over InitiateCloudDeploymentUseCase. Subscribes to the
 * in-process cloud deployment event bus (the same bus the SSE route
 * consumes) to stream progress to the terminal — no DB polling.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { InitiateCloudDeploymentUseCase } from '@/application/use-cases/cloud-deploy/initiate-cloud-deployment.use-case.js';
import { SelectCloudProviderUseCase } from '@/application/use-cases/cloud-deploy/select-cloud-provider.use-case.js';
import type { ICloudDeploymentEventBus } from '@/application/ports/output/services/cloud-deployment-event-bus.interface.js';
import {
  CloudDeploymentProvider,
  CloudDeploymentStatus,
  type CloudDeploymentProvider as CloudDeploymentProviderType,
} from '@/domain/generated/output.js';
import { messages, colors } from '../../../ui/index.js';
import { resolveApplication } from '../resolve-application.js';

function parseProvider(raw: string): CloudDeploymentProviderType | null {
  const lower = raw.toLowerCase();
  for (const id of Object.values(CloudDeploymentProvider)) {
    if (id.toLowerCase() === lower) return id;
  }
  return null;
}

function labelForStatus(status: CloudDeploymentStatus): string {
  switch (status) {
    case CloudDeploymentStatus.Uploading:
      return colors.info('uploading');
    case CloudDeploymentStatus.Deploying:
      return colors.info('deploying');
    case CloudDeploymentStatus.Deployed:
      return colors.success('deployed');
    case CloudDeploymentStatus.Failed:
      return colors.error('failed');
    default:
      return String(status);
  }
}

export function createDeployInitiateCommand(): Command {
  return new Command('start')
    .description('Start a cloud deployment for the application (streams progress)')
    .argument('<id>', 'Application id or slug')
    .option('--provider <provider>', 'Override the selected provider')
    .action(async (id: string, options: { provider?: string }) => {
      try {
        const resolved = await resolveApplication(id);
        if ('error' in resolved) {
          messages.error(resolved.error);
          process.exitCode = 1;
          return;
        }
        const app = resolved.application;

        // Optional provider override — select first so the use case picks
        // the right adapter, matching the web flow.
        if (options.provider) {
          const provider = parseProvider(options.provider);
          if (!provider) {
            messages.error(`Unknown provider: ${options.provider}`);
            process.exitCode = 1;
            return;
          }
          const selectUc = container.resolve(SelectCloudProviderUseCase);
          await selectUc.execute({ applicationId: app.id, provider });
        }

        const eventBus = container.resolve<ICloudDeploymentEventBus>('ICloudDeploymentEventBus');
        const unsubscribe = eventBus.subscribe((event) => {
          if (event.applicationId !== app.id) return;
          const line = `  [${labelForStatus(event.status)}]${
            event.message ? ` ${event.message}` : ''
          }${event.url ? ` → ${event.url}` : ''}${event.error ? ` (${event.error})` : ''}`;
          process.stdout.write(`${line}\n`);
        });

        const useCase = container.resolve(InitiateCloudDeploymentUseCase);
        process.stdout.write(`Deploying ${colors.accent(app.name)} to the cloud…\n`);
        try {
          const result = await useCase.execute({ applicationId: app.id });
          process.stdout.write(colors.success(`\n✓ Deployed: ${result.url}\n`));
        } finally {
          unsubscribe();
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Cloud deployment failed', err);
        process.exitCode = 1;
      }
    });
}
