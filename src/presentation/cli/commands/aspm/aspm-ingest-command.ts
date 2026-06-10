/**
 * Shep ASPM Ingest Command
 *
 * Ingests a SARIF v2.1.0 or CycloneDX 1.5+ document into the ASPM
 * SecurityFinding store for a given Application.
 *
 * Usage:
 *   shep aspm ingest --sarif <file> --application <slug>
 *   shep aspm ingest --sbom <file> --application <slug>
 *   shep aspm ingest --sarif <file> --application <slug> --json
 *
 * Feature 098, phase 10, task-55. Routes through IngestFindingsUseCase
 * (SARIF) and IngestSbomUseCase (CycloneDX). Re-running on the same
 * file is a no-op (FR-8 / NFR-10).
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { IngestFindingsUseCase } from '@/application/use-cases/aspm/findings/ingest-findings.js';
import { IngestSbomUseCase } from '@/application/use-cases/aspm/findings/ingest-sbom.js';
import { colors, messages } from '../../ui/index.js';
import { resolveApplication } from './resolve-application.js';

interface IngestOptions {
  sarif?: string;
  sbom?: string;
  application: string;
  json?: boolean;
}

interface IngestSummary {
  source: 'sarif' | 'sbom';
  applicationId: string;
  applicationSlug: string;
  inputFile: string;
  inserted: number;
  duplicates: number;
  total: number;
  toolName?: string;
  sourceLabel: string;
  documentHash: string;
  durationMs: number;
  componentCount?: number;
  complianceLinksWritten?: number;
}

export function createAspmIngestCommand(): Command {
  return new Command('ingest')
    .description('Ingest SARIF or CycloneDX findings for an application')
    .requiredOption('-a, --application <slug>', 'Application slug or id')
    .option('--sarif <file>', 'Path to a SARIF v2.1.0 document')
    .option('--sbom <file>', 'Path to a CycloneDX 1.5+ SBOM document')
    .option('--json', 'Emit a structured JSON summary on stdout')
    .addHelpText(
      'after',
      `
Examples:
  $ shep aspm ingest --sarif reports/app.sarif --application api       Ingest SARIF findings
  $ shep aspm ingest --sbom reports/bom.json --application api --json  Ingest an SBOM and print JSON`
    )
    .action(async (options: IngestOptions) => {
      try {
        if (!options.sarif && !options.sbom) {
          messages.error('Provide either --sarif or --sbom');
          process.exitCode = 2;
          return;
        }
        if (options.sarif && options.sbom) {
          messages.error('Pass only one of --sarif or --sbom per invocation');
          process.exitCode = 2;
          return;
        }

        const resolved = await resolveApplication(options.application);
        if ('error' in resolved) {
          messages.error(resolved.error);
          process.exitCode = 1;
          return;
        }
        const app = resolved.application;

        const sourceKind: 'sarif' | 'sbom' = options.sarif ? 'sarif' : 'sbom';
        const inputFile = resolve(process.cwd(), (options.sarif ?? options.sbom) as string);
        const document = await readFile(inputFile, 'utf8');

        const summary: IngestSummary =
          sourceKind === 'sarif'
            ? await runSarif(app.id, app.slug, inputFile, document)
            : await runSbom(app.id, app.slug, inputFile, document);

        if (options.json) {
          console.log(JSON.stringify(summary, null, 2));
          return;
        }

        renderSummary(summary);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('ASPM ingest failed', err);
        process.exitCode = 1;
      }
    });
}

async function runSarif(
  applicationId: string,
  applicationSlug: string,
  inputFile: string,
  document: string
): Promise<IngestSummary> {
  const useCase = container.resolve(IngestFindingsUseCase);
  const result = await useCase.execute({
    applicationId,
    sourceType: 'sarif',
    document,
  });
  return {
    source: 'sarif',
    applicationId,
    applicationSlug,
    inputFile,
    inserted: result.inserted,
    duplicates: result.duplicates,
    total: result.total,
    toolName: result.toolName,
    sourceLabel: result.sourceLabel,
    documentHash: result.documentHash,
    durationMs: result.durationMs,
    complianceLinksWritten: result.complianceLinksWritten,
  };
}

async function runSbom(
  applicationId: string,
  applicationSlug: string,
  inputFile: string,
  document: string
): Promise<IngestSummary> {
  const useCase = container.resolve(IngestSbomUseCase);
  const result = await useCase.execute({ applicationId, document });
  return {
    source: 'sbom',
    applicationId,
    applicationSlug,
    inputFile,
    inserted: result.inserted,
    duplicates: result.duplicates,
    total: result.total,
    toolName: result.toolName,
    sourceLabel: result.sourceLabel,
    documentHash: result.documentHash,
    durationMs: result.durationMs,
    componentCount: result.componentCount,
  };
}

function renderSummary(s: IngestSummary): void {
  const lines = [
    '',
    `  ${colors.success('Ingested')} ${s.source.toUpperCase()} ${colors.muted(`(${s.toolName ?? s.sourceLabel})`)}`,
    '',
    `  Application      ${s.applicationSlug} ${colors.muted(`(${s.applicationId.substring(0, 8)})`)}`,
    `  Input            ${colors.muted(s.inputFile)}`,
    `  New              ${colors.success(String(s.inserted))}`,
    `  Duplicates       ${s.duplicates > 0 ? colors.warning(String(s.duplicates)) : colors.muted('0')}`,
    `  Total drafts     ${s.total}`,
  ];
  if (s.componentCount !== undefined) {
    lines.push(`  Components       ${s.componentCount}`);
  }
  if (s.complianceLinksWritten !== undefined) {
    lines.push(`  Compliance links ${s.complianceLinksWritten}`);
  }
  lines.push(`  Document hash    ${colors.muted(s.documentHash.substring(0, 16))}…`);
  lines.push(`  Duration         ${s.durationMs} ms`);
  lines.push('');
  console.log(lines.join('\n'));
}
