'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import type { HarnessSessionListItem } from '@shepai/core/application/use-cases/harness/list-harness-sessions.use-case';
import type { HarnessPermissionItem } from '@shepai/core/application/use-cases/harness/list-harness-permissions.use-case';
import type { HarnessCapabilityItem } from '@shepai/core/application/use-cases/harness/list-harness-capabilities.use-case';
import type { HarnessPolicies } from '@shepai/core/application/use-cases/harness/get-harness-policies.use-case';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HarnessSessionsTable } from './harness-sessions-table';
import { HarnessNewTaskForm } from './harness-new-task-form';
import { HarnessPermissionCard } from './harness-permission-card';
import { HarnessCatalogLists } from './harness-catalog-lists';
import { HarnessSetupPanel } from './harness-setup-panel';

export interface HarnessPageClientProps {
  sessions: HarnessSessionListItem[];
  approvals: HarnessPermissionItem[];
  capabilities: HarnessCapabilityItem[];
  policies: HarnessPolicies;
  repositories: string[];
  /** Extra tabs (the Evals tab) rendered after the built-in ones. */
  evals?: React.ReactNode;
}

/** /harness (spec 119): sessions, new task, approvals inbox, catalog and policies, repository setup. */
export function HarnessPageClient({
  sessions,
  approvals,
  capabilities,
  policies,
  repositories,
  evals,
}: HarnessPageClientProps) {
  const { t } = useTranslation('web');
  const router = useRouter();
  const [pending, setPending] = useState(approvals);
  const resolved = useCallback(
    (id: string) => {
      setPending((items) => items.filter((i) => i.decision.id !== id));
      router.refresh();
    },
    [router]
  );

  return (
    <div className="space-y-4" data-testid="harness-page">
      <div>
        <h1 className="text-xl font-semibold">{t('harness.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('harness.subtitle')}</p>
      </div>
      <Tabs defaultValue="sessions">
        <TabsList>
          <TabsTrigger value="sessions">{t('harness.tabs.sessions')}</TabsTrigger>
          <TabsTrigger value="new">{t('harness.tabs.newTask')}</TabsTrigger>
          <TabsTrigger value="approvals">
            {t('harness.tabs.approvals')}
            {pending.length > 0 ? ` (${pending.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="catalog">{t('harness.tabs.catalog')}</TabsTrigger>
          <TabsTrigger value="setup">{t('harness.tabs.setup')}</TabsTrigger>
          {evals ? <TabsTrigger value="evals">{t('harness.tabs.evals')}</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="sessions" className="pt-4">
          <HarnessSessionsTable items={sessions} />
        </TabsContent>
        <TabsContent value="new" className="pt-4">
          <HarnessNewTaskForm repositories={repositories} />
        </TabsContent>
        <TabsContent value="approvals" className="space-y-2 pt-4">
          {pending.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('harness.approvals.empty')}</p>
          ) : null}
          {pending.map((item) => (
            <div key={item.decision.id}>
              <p className="text-muted-foreground mb-1 text-xs">{item.session?.title}</p>
              <HarnessPermissionCard item={item} onResolved={resolved} />
            </div>
          ))}
        </TabsContent>
        <TabsContent value="catalog" className="pt-4">
          <HarnessCatalogLists capabilities={capabilities} policies={policies} />
        </TabsContent>
        <TabsContent value="setup" className="pt-4">
          <HarnessSetupPanel repositories={repositories} />
        </TabsContent>
        {evals ? (
          <TabsContent value="evals" className="pt-4">
            {evals}
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
