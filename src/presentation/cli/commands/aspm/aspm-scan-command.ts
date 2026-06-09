/**
 * `shep aspm scan` + `shep aspm rescan` (Phase 11, task-80).
 *
 * Replaces the upload-driven ingest flow with native scan/rescan that runs
 * Shep's in-house SBOM/secrets scanners + agent-driven SAST/container/IaC
 * checks over the local working tree. Re-running on an unchanged tree is
 * a no-op (FR-8 / NFR-10).
 *
 * Usage:
 *   shep aspm scan --app <slug> [--stages sbom,secrets,sast] [--json]
 *   shep aspm rescan --app <slug> [--stages secrets] [--json]
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ScanApplicationUseCase } from '@/application/use-cases/aspm/scan/scan-application.js';
import { RescanApplicationUseCase } from '@/application/use-cases/aspm/scan/rescan-application.js';
import { ScanStageName, ScanTrigger, type ScanStage } from '@/domain/generated/output.js';
import { colors, messages } from '../../ui/index.js';
import { resolveApplication } from './resolve-application.js';

interface ScanOptions {
  app: string;
  stages?: string;
  json?: boolean;
}

const VALID_STAGES: ReadonlySet<string> = new Set(Object.values(ScanStageName));

function parseStages(raw: string | undefined): ScanStageName[] | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0)
    .filter((s) => VALID_STAGES.has(s));
  return parts.length > 0 ? (parts as ScanStageName[]) : undefined;
}

function renderStage(stage: ScanStage): string {
  const status = stage.status;
  const label = colors.muted(stage.name.padEnd(10));
  const tail =
    stage.findingsCount !== undefined
      ? colors.muted(`${stage.findingsCount} finding(s)`)
      : stage.componentsCount !== undefined
        ? colors.muted(`${stage.componentsCount} component(s)`)
        : '';
  const colored =
    status === 'Succeeded'
      ? colors.success(status)
      : status === 'Failed'
        ? colors.error(status)
        : status === 'Skipped'
          ? colors.muted(status)
          : colors.warning(status);
  const err = stage.errorMessage ? `  ${colors.muted(`· ${stage.errorMessage}`)}` : '';
  return `  ${label} ${colored}  ${tail}${err}`;
}

function buildCommand(
  name: 'scan' | 'rescan',
  describe: string,
  useCaseName: 'scan' | 'rescan'
): Command {
  return new Command(name)
    .description(describe)
    .requiredOption('-a, --app <slug>', 'Application slug or id')
    .option(
      '--stages <list>',
      'Comma-separated stages to run (sbom,sca,secrets,sast,container,iac)'
    )
    .option('--json', 'Emit a structured JSON summary on stdout')
    .action(async (options: ScanOptions) => {
      try {
        const resolved = await resolveApplication(options.app);
        if ('error' in resolved) {
          messages.error(resolved.error);
          process.exitCode = 1;
          return;
        }
        const app = resolved.application;

        const stagesEnabled = parseStages(options.stages);
        const triggeredBy = ScanTrigger.User;

        const result =
          useCaseName === 'scan'
            ? await container
                .resolve(ScanApplicationUseCase)
                .execute({ applicationId: app.id, stagesEnabled, triggeredBy })
            : await container
                .resolve(RescanApplicationUseCase)
                .execute({ applicationId: app.id, stagesEnabled, triggeredBy });

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                scanRunId: result.scanRunId,
                applicationId: app.id,
                applicationSlug: app.slug,
                status: result.status,
                findingsInserted: result.findingsInserted,
                stages: result.stages,
              },
              null,
              2
            )
          );
          return;
        }

        const header =
          result.status === 'Succeeded'
            ? colors.success('Succeeded')
            : result.status === 'Partial'
              ? colors.warning('Partial')
              : result.status === 'Failed'
                ? colors.error('Failed')
                : colors.muted(result.status);

        console.log('');
        console.log(`  ${header} ${colors.muted(`(${result.scanRunId.substring(0, 8)})`)}`);
        console.log(`  Application      ${app.slug}`);
        console.log(`  Findings (new)   ${colors.success(String(result.findingsInserted))}`);
        console.log('');
        for (const stage of result.stages) {
          console.log(renderStage(stage));
        }
        console.log('');
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(`shep aspm ${name} failed`, err);
        process.exitCode = 1;
      }
    });
}

export function createAspmScanCommand(): Command {
  return buildCommand('scan', 'Run a fresh ASPM scan over the application working tree', 'scan');
}

export function createAspmRescanCommand(): Command {
  return buildCommand(
    'rescan',
    'Re-scan an application — idempotent if the tree is unchanged',
    'rescan'
  );
}
