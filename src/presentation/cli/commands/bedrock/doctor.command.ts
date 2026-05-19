/**
 * `shep bedrock doctor`
 *
 * Runs the three-tier prerequisite probe (Python ≥ 3.9, pipx, bedrock binary)
 * and renders the typed BedrockHealth report as a per-tier table.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { CheckBedrockHealthUseCaseToken } from '@/infrastructure/di/tokens.js';
import type { CheckBedrockHealthUseCase } from '@/application/use-cases/applications/check-bedrock-health.use-case.js';
import type { BedrockHealth, BedrockTierStatus } from '@/domain/generated/output.js';
import { colors, messages, renderListView } from '../../ui/index.js';
import { renderBedrockError } from './shared.js';

function colorStatus(status: BedrockTierStatus['status']): string {
  switch (status) {
    case 'ok':
      return colors.success(status);
    case 'missing':
      return colors.warning(status);
    case 'error':
      return colors.error(status);
    default:
      return colors.muted(String(status));
  }
}

function tiersOf(health: BedrockHealth): BedrockTierStatus[] {
  return [health.python, health.pipx, health.bedrock];
}

export function createBedrockDoctorCommand(): Command {
  return new Command('doctor')
    .description('Verify bedrock prerequisites (Python, pipx, bedrock binary)')
    .action(async () => {
      try {
        const useCase = container.resolve<CheckBedrockHealthUseCase>(
          CheckBedrockHealthUseCaseToken
        );
        const health = await useCase.execute();

        renderListView({
          title: 'Bedrock prerequisites',
          columns: [
            { label: 'Tier', width: 10 },
            { label: 'Status', width: 10 },
            { label: 'Detail', width: 40 },
          ],
          rows: tiersOf(health).map((tier) => [
            tier.tier,
            colorStatus(tier.status),
            tier.detail ?? colors.muted('—'),
          ]),
          emptyMessage: 'No tiers reported',
        });

        for (const tier of tiersOf(health)) {
          if (tier.status !== 'ok' && tier.remediation) {
            messages.info(`${tier.tier}: ${tier.remediation}`);
          }
        }

        if (health.overall !== 'ok') {
          process.exitCode = 1;
        }
      } catch (error) {
        renderBedrockError('Failed to check bedrock health', error);
      }
    });
}
