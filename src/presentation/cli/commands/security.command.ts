/**
 * Security Command Group
 *
 * Supply-chain security enforcement, part of ASPM (spec 133): it runs only
 * while the `aspm` feature flag is on, or when SHEP_SUPPLY_CHAIN_SECURITY=true
 * opts in explicitly (Shep's own CI does this).
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
import { isSupplyChainSecurityEnabled } from '@/domain/shared/supply-chain-security.js';
import { colors, fmt, messages } from '../ui/index.js';
import { OutputFormatter, type OutputFormat } from '../ui/output.js';
import { getCliI18n } from '../i18n.js';

/**
 * Create the security command group with all subcommands.
 */
export function createSecurityCommand(): Command {
  const t = getCliI18n().t;

  const security = new Command('security')
    .description(t('cli:commands.security.description'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep security enforce                Evaluate and enforce security posture
  $ shep security enforce --output json  Emit machine-readable output for CI
  $ SHEP_SUPPLY_CHAIN_SECURITY=false shep security enforce  Disable enforcement via CI kill-switch`
    );

  security
    .command('enforce')
    .description(t('cli:commands.security.enforce.description'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep security enforce                         Evaluate the current repository
  $ shep security enforce --repo /path/to/repo    Evaluate a different repository
  $ shep security enforce --output json           Emit machine-readable output for CI
  $ SHEP_SUPPLY_CHAIN_SECURITY=false shep security enforce  Disable enforcement via CI kill-switch`
    )
    .option('-r, --repo <path>', t('cli:commands.security.enforce.repoOption'), process.cwd())
    .option('-o, --output <format>', t('cli:commands.security.enforce.outputOption'), 'table')
    .action(async (options: { repo: string; output: string }) => {
      try {
        // Supply-chain security is part of ASPM: with the aspm feature flag off
        // the command is a no-op that exits 0, so a CI step never fails just
        // because the feature is off. SHEP_SUPPLY_CHAIN_SECURITY overrides the
        // flag either way ("false"/"0" off, "true"/"1" on) for CI.
        if (
          !isSupplyChainSecurityEnabled(
            getSettings().featureFlags,
            process.env.SHEP_SUPPLY_CHAIN_SECURITY
          )
        ) {
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
