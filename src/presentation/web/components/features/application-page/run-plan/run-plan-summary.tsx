'use client';

/**
 * Read-only view of the resolved dev-server run plan.
 *
 * Purely presentational: every value it renders — including `isStale` and
 * `repoConfigControlled` — is derived in the application layer, so this
 * component never computes what will run, only shows it.
 *
 * Optional fields are rendered by PRESENCE, not truthiness. `expectedPort: 0`
 * is not a real port, but the use case validates the range; a component that
 * dropped it on falsiness would silently hide whatever the plan actually says.
 */

import { useTranslation } from 'react-i18next';
import { FileCog, TriangleAlert } from 'lucide-react';

import { RunPlanSource } from '@shepai/core/domain/generated/output';
import type { DevServerRunPlanView } from '@shepai/core/application/use-cases/deployments/dev-server-run-plan-vocabulary';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface RunPlanSummaryProps {
  /** The resolved plan, or `null` when nothing is cached for the target yet. */
  plan: DevServerRunPlanView | null;
  /** A committed `.shep/dev.json` outranks anything stored for this target. */
  repoConfigControlled?: boolean;
}

/**
 * How each provenance reads to a user, and how it reads visually. Keyed by the
 * domain enum so a new `RunPlanSource` member is a compile error here rather
 * than a silently unlabelled badge.
 */
const SOURCE_PRESENTATION: Record<
  RunPlanSource,
  { labelKey: string; variant: 'default' | 'secondary' | 'outline' }
> = {
  [RunPlanSource.Deterministic]: { labelKey: 'runPlan.source.deterministic', variant: 'secondary' },
  [RunPlanSource.Agent]: { labelKey: 'runPlan.source.agent', variant: 'outline' },
  [RunPlanSource.Manual]: { labelKey: 'runPlan.source.manual', variant: 'default' },
};

export function RunPlanSummary({ plan, repoConfigControlled = false }: RunPlanSummaryProps) {
  const { t } = useTranslation('web');

  if (!plan) {
    return (
      <div className="flex flex-col gap-2">
        {repoConfigControlled ? <RepoConfigNotice /> : null}
        <p data-testid="run-plan-empty" className="text-muted-foreground text-xs leading-relaxed">
          {t('runPlan.empty')}
        </p>
      </div>
    );
  }

  const source = SOURCE_PRESENTATION[plan.source];

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5 text-xs">
        <Row label={t('runPlan.source.label')}>
          <Badge
            data-testid="run-plan-source-badge"
            data-source={plan.source}
            variant={source.variant}
            className="px-1.5 py-0 text-[10px] font-medium"
          >
            {t(source.labelKey)}
          </Badge>
        </Row>

        <Row label={t('runPlan.fields.command')}>
          <code data-testid="run-plan-command" className="text-foreground font-mono break-all">
            {plan.command}
          </code>
        </Row>

        <Row label={t('runPlan.fields.cwd')}>
          <code data-testid="run-plan-cwd" className="text-foreground font-mono break-all">
            {plan.cwd}
          </code>
        </Row>

        {plan.language === undefined ? null : (
          <Row label={t('runPlan.fields.language')}>
            <span data-testid="run-plan-language">{plan.language}</span>
          </Row>
        )}

        {plan.framework === undefined ? null : (
          <Row label={t('runPlan.fields.framework')}>
            <span data-testid="run-plan-framework">{plan.framework}</span>
          </Row>
        )}

        {plan.expectedPort === undefined ? null : (
          <Row label={t('runPlan.fields.expectedPort')}>
            <span data-testid="run-plan-expected-port" className="font-mono">
              {plan.expectedPort}
            </span>
          </Row>
        )}

        {plan.packageManager === undefined ? null : (
          <Row label={t('runPlan.fields.packageManager')}>
            <span data-testid="run-plan-package-manager">{plan.packageManager}</span>
          </Row>
        )}

        {plan.setupCommands.length === 0 ? null : (
          <Row label={t('runPlan.fields.setupCommands')}>
            <ul data-testid="run-plan-setup-commands" className="flex flex-col gap-0.5">
              {plan.setupCommands.map((command) => (
                <li key={command} className="text-foreground font-mono break-all">
                  {command}
                </li>
              ))}
            </ul>
          </Row>
        )}
      </dl>

      {plan.isStale ? (
        <Notice
          testId="run-plan-stale-hint"
          icon={<TriangleAlert className="mt-px size-3 shrink-0" />}
          tone="warning"
        >
          {t('runPlan.staleHint')}
        </Notice>
      ) : null}

      {repoConfigControlled ? <RepoConfigNotice /> : null}
    </div>
  );
}

function RepoConfigNotice() {
  const { t } = useTranslation('web');
  return (
    <Notice
      testId="run-plan-repo-config-notice"
      icon={<FileCog className="mt-px size-3 shrink-0" />}
      tone="info"
    >
      {t('runPlan.repoConfigControlled')}
    </Notice>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground whitespace-nowrap">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function Notice({
  testId,
  icon,
  tone,
  children,
}: {
  testId: string;
  icon: React.ReactNode;
  tone: 'warning' | 'info';
  children: React.ReactNode;
}) {
  return (
    <p
      data-testid={testId}
      className={cn(
        'flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[11px] leading-relaxed',
        tone === 'warning'
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
          : 'border-border bg-muted/50 text-muted-foreground'
      )}
    >
      {icon}
      <span>{children}</span>
    </p>
  );
}
