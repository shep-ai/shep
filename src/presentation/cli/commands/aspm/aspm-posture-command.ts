/**
 * Shep ASPM Posture Command
 *
 * Prints the headline posture summary (or per-application posture when
 * --app is supplied). Routes through GetPostureSummaryUseCase and
 * GetApplicationPostureUseCase.
 *
 * Usage:
 *   shep aspm posture [--app <slug>] [--top <n>] [--json]
 *
 * Feature 098, phase 10, task-56.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetPostureSummaryUseCase } from '@/application/use-cases/aspm/posture/get-posture-summary.js';
import {
  GetApplicationPostureUseCase,
  type GetApplicationPostureResult,
} from '@/application/use-cases/aspm/posture/get-application-posture.js';
import { colors, messages } from '../../ui/index.js';
import { resolveApplication } from './resolve-application.js';

interface PostureOptions {
  app?: string;
  top?: string;
  json?: boolean;
}

export function createAspmPostureCommand(): Command {
  return new Command('posture')
    .description('Show ASPM posture summary (workspace or per-application)')
    .option('--app <slug>', 'Show per-application posture')
    .option('--top <n>', 'Number of top at-risk apps to include', '5')
    .option('--json', 'Emit JSON instead of a formatted view')
    .action(async (opts: PostureOptions) => {
      try {
        if (opts.app) {
          const resolved = await resolveApplication(opts.app);
          if ('error' in resolved) {
            messages.error(resolved.error);
            process.exitCode = 1;
            return;
          }
          const useCase = container.resolve(GetApplicationPostureUseCase);
          const result = await useCase.execute({ applicationId: resolved.application.id });
          if (opts.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
          }
          renderApplicationPosture(result, resolved.application.slug);
          return;
        }

        const useCase = container.resolve(GetPostureSummaryUseCase);
        const summary = await useCase.execute({
          topAtRiskLimit: opts.top ? Number(opts.top) : undefined,
        });
        if (opts.json) {
          console.log(JSON.stringify(summary, null, 2));
          return;
        }
        renderPostureSummary(summary);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to fetch posture', err);
        process.exitCode = 1;
      }
    });
}

interface PostureSummaryShape {
  openBySeverity: { severity: string; count: number }[];
  topAtRiskApplications: {
    applicationId: string;
    riskScoreSum: number;
    openFindingCount: number;
  }[];
  kevOpenCount: number;
  slaBreachCount: number;
  exceptionCount: number;
  aiReviewQueueDepth: number;
  lastIngestedAt: Date | null;
}

function renderPostureSummary(s: PostureSummaryShape): void {
  const lines = ['', `  ${colors.brand('ASPM Posture')}`, ''];
  lines.push('  Open by severity:');
  for (const row of s.openBySeverity) {
    lines.push(`    ${row.severity.padEnd(10)} ${row.count}`);
  }
  lines.push('');
  lines.push(`  KEV-listed open    ${s.kevOpenCount}`);
  lines.push(`  SLA breached       ${s.slaBreachCount}`);
  lines.push(`  Active exceptions  ${s.exceptionCount}`);
  lines.push(`  AI-review queue    ${s.aiReviewQueueDepth}`);
  lines.push(
    `  Last ingested      ${s.lastIngestedAt ? new Date(s.lastIngestedAt).toLocaleString() : colors.muted('—')}`
  );
  lines.push('');
  if (s.topAtRiskApplications.length > 0) {
    lines.push(`  ${colors.brand('Top at-risk applications:')}`);
    for (const a of s.topAtRiskApplications) {
      lines.push(
        `    ${colors.muted(a.applicationId.substring(0, 8))}  risk=${a.riskScoreSum}  findings=${a.openFindingCount}`
      );
    }
    lines.push('');
  }
  console.log(lines.join('\n'));
}

function renderApplicationPosture(p: GetApplicationPostureResult, slug: string): void {
  const lines = ['', `  ${colors.brand('Application posture')} ${slug}`, ''];
  lines.push('  Open by severity:');
  for (const row of p.openBySeverity) {
    lines.push(`    ${row.severity.padEnd(10)} ${row.count}`);
  }
  lines.push('');
  if (p.topFindings.length > 0) {
    lines.push(`  ${colors.brand('Top findings:')}`);
    for (const f of p.topFindings) {
      const finding = f.finding;
      const riskLabel = f.riskScoreTotal !== null ? colors.muted(`(risk=${f.riskScoreTotal})`) : '';
      lines.push(
        `    ${colors.muted(finding.id.substring(0, 8))}  ${
          finding.canonicalSeverity ?? '—'
        }  ${finding.title ?? finding.ruleId} ${riskLabel}`
      );
    }
    lines.push('');
  }
  if (p.sparkline.length > 0) {
    lines.push(`  ${colors.brand('30-day open count sparkline:')}`);
    for (const b of p.sparkline) {
      const total = b.countsBySeverity.reduce((sum, row) => sum + row.count, 0);
      const date = b.bucketStart instanceof Date ? b.bucketStart : new Date(b.bucketStart);
      lines.push(`    ${date.toISOString().slice(0, 10)}  ${total}`);
    }
    lines.push('');
  }
  console.log(lines.join('\n'));
}
