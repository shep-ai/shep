'use client';

import { useTranslation } from 'react-i18next';
import type { HarnessCapabilityItem } from '@shepai/core/application/use-cases/harness/list-harness-capabilities.use-case';
import type { HarnessPolicies } from '@shepai/core/application/use-cases/harness/get-harness-policies.use-case';
import { type PermissionEffect } from '@shepai/core/domain/generated/output';
import { EFFECT_CLASS } from './harness-format';

export interface HarnessCatalogListsProps {
  capabilities: HarnessCapabilityItem[];
  policies: HarnessPolicies;
}

/** The tiered tool catalog and the effective permission rules (spec 119). */
export function HarnessCatalogLists({ capabilities, policies }: HarnessCatalogListsProps) {
  const { t } = useTranslation('web');
  return (
    <div className="grid gap-6 lg:grid-cols-2" data-testid="harness-catalog-lists">
      <section>
        <h3 className="mb-2 text-sm font-semibold">{t('harness.capabilities.title')}</h3>
        <p className="text-muted-foreground mb-2 text-xs">
          {t('harness.capabilities.description')}
        </p>
        <ul className="space-y-2">
          {capabilities.map((c) => (
            <li key={c.capability.id} className="rounded border p-2 text-xs">
              <p className="font-mono font-medium">
                {c.capability.id}{' '}
                <span className="text-muted-foreground">· {c.capability.risk}</span>
              </p>
              <p>{c.capability.snippet}</p>
              <p className="text-muted-foreground">
                {t('harness.capabilities.cost', {
                  snippet: c.snippetTokens,
                  schema: c.schemaTokens,
                })}{' '}
                · {c.implementations.map((i) => i.toolName).join(', ')}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">{t('harness.policies.title')}</h3>
        <p className="text-muted-foreground mb-2 text-xs">{t('harness.policies.description')}</p>
        <ul className="space-y-1">
          {policies.rules.map((r) => (
            <li key={`${r.source}:${r.id}`} className="text-xs">
              <span className={EFFECT_CLASS[r.effect as PermissionEffect] ?? ''}>{r.effect}</span>{' '}
              <span className="font-mono">{r.id}</span>
              {r.hard ? (
                <span className="text-muted-foreground"> ({t('harness.policies.hard')})</span>
              ) : null}
              {r.reason ? (
                <span className="text-muted-foreground block pl-10">{r.reason}</span>
              ) : null}
            </li>
          ))}
        </ul>
        {policies.issues.map((i) => (
          <p key={i.file} className="mt-2 text-xs text-red-600">
            {i.file}: {i.message}
          </p>
        ))}
      </section>
    </div>
  );
}
