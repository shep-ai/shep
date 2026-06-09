/**
 * Security Command Group
 *
 * Top-level security command with subcommands for supply-chain security
 * policy management and enforcement.
 *
 * Usage:
 *   shep security enforce          Evaluate and enforce security posture
 *   shep security enforce --output json   Machine-readable output for CI
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { EnforceSecurityUseCase } from '@/application/use-cases/security/enforce-security.use-case.js';
import { SecurityMode } from '@/domain/generated/output.js';
import { getSettings } from '@/infrastructure/services/settings.service.js';
import { colors, fmt, messages } from '../ui/index.js';
import { OutputFormatter, type OutputFormat } from '../ui/output.js';
import { getCliI18n } from '../i18n.js';

/**
 * Create the security command group with all subcommands.
 */
export function createSecurityCommand(): Command {
  const t = getCliI18n().t;

  const security = new Command('security').description(t('cli:commands.security.description'));

  security
    .command('enforce')
    .description(t('cli:commands.security.enforce.description'))
    .option('-r, --repo <path>', t('cli:commands.security.enforce.repoOption'), process.cwd())
    .option('-o, --output <format>', t('cli:commands.security.enforce.outputOption'), 'table')
    .action(async (options: { repo: string; output: string }) => {
      try {
        // Master kill switch — if the supplyChainSecurity feature flag is off,
        // the command becomes a no-op and exits 0. Prevents accidental enforcement
        // after the flag has been used as a rollback.
        //
        // Two ways to disable:
        //   1. SHEP_SUPPLY_CHAIN_SECURITY=false environment variable (intended for CI)
        //   2. featureFlags.supplyChainSecurity=false in the Shep settings DB (local user)
        const envOverride = process.env.SHEP_SUPPLY_CHAIN_SECURITY;
        const envDisabled = envOverride === 'false' || envOverride === '0';
        const settingsEnabled = getSettings().featureFlags?.supplyChainSecurity ?? true;
        if (envDisabled || !settingsEnabled) {
          messages.info(t('cli:commands.security.enforce.flagDisabledNote'));
          return;
        }

        const useCase = container.resolve(EnforceSecurityUseCase);
        const result = await useCase.execute({ repositoryPath: options.repo });

        const outputFormat = options.output as OutputFormat;

        if (outputFormat === 'json' || outputFormat === 'yaml') {
          // Machine-readable output
          console.log(OutputFormatter.format(result, outputFormat));
        } else {
          // Human-readable table output
          messages.newline();

          if (result.mode === SecurityMode.Disabled) {
            messages.info(t('cli:commands.security.enforce.disabledNote'));
            messages.newline();
          } else {
            // Summary header
            console.log(
              `${fmt.label(t('cli:commands.security.enforce.modeLabel'))}:     ${result.mode}`
            );
            console.log(
              `${fmt.label(t('cli:commands.security.enforce.sourceLabel'))}:   ${result.policy.source}`
            );
            console.log(
              `${fmt.label(t('cli:commands.security.enforce.totalFindingsLabel'))}: ${result.totalFindings}`
            );
            messages.newline();

            // Dependency findings
            if (result.dependencyFindings.length > 0) {
              console.log(fmt.heading(t('cli:commands.security.enforce.dependencyFindingsLabel')));
              for (const finding of result.dependencyFindings) {
                const severityColor =
                  finding.severity === 'Critical' || finding.severity === 'High'
                    ? colors.error
                    : colors.warning;
                console.log(
                  `  ${severityColor(`[${finding.severity}]`)} ${finding.packageName}: ${finding.message}`
                );
                if (finding.remediation) {
                  console.log(`    ${colors.muted(finding.remediation)}`);
                }
              }
              messages.newline();
            }

            // Release integrity
            const failedChecks = result.releaseIntegrity.checks.filter((c) => !c.passed);
            if (failedChecks.length > 0) {
              console.log(fmt.heading(t('cli:commands.security.enforce.releaseIntegrityLabel')));
              for (const check of failedChecks) {
                const severityColor =
                  check.severity === 'Critical' || check.severity === 'High'
                    ? colors.error
                    : colors.warning;
                console.log(`  ${severityColor(`[${check.severity}]`)} ${check.message}`);
              }
              messages.newline();
            }

            // Governance findings (audit-only)
            if (result.governanceFindings.length > 0) {
              console.log(fmt.heading(t('cli:commands.security.enforce.governanceFindingsLabel')));
              for (const finding of result.governanceFindings) {
                const severityColor =
                  finding.severity === 'Critical' || finding.severity === 'High'
                    ? colors.error
                    : colors.warning;
                console.log(`  ${severityColor(`[${finding.severity}]`)} ${finding.message}`);
                if (finding.remediation) {
                  console.log(`    ${colors.muted(finding.remediation)}`);
                }
              }
              messages.newline();
            }

            // Result
            if (result.totalFindings === 0) {
              messages.info(t('cli:commands.security.enforce.noFindings'));
            }

            if (result.passed) {
              messages.success(t('cli:commands.security.enforce.passed'));
              if (result.mode === SecurityMode.Advisory && result.totalFindings > 0) {
                messages.info(t('cli:commands.security.enforce.advisoryNote'));
              }
            } else {
              messages.error(t('cli:commands.security.enforce.failed'));
            }
          }

          messages.newline();
        }

        if (!result.passed) {
          process.exitCode = 1;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.security.enforce.failedToEnforce'), err);
        process.exitCode = 1;
      }
    });

  return security;
}
