'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import type { HarnessSessionListItem } from '@shepai/core/application/use-cases/harness/list-harness-sessions.use-case';

export interface HarnessSessionsTableProps {
  items: HarnessSessionListItem[];
}

/** The /harness sessions list (spec 119): standalone, feature and eval sessions. */
export function HarnessSessionsTable({ items }: HarnessSessionsTableProps) {
  const { t } = useTranslation('web');
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm" data-testid="harness-sessions-empty">
        {t('harness.sessions.empty')}
      </p>
    );
  }
  return (
    <table className="w-full text-sm" data-testid="harness-sessions-table">
      <thead className="text-muted-foreground text-left text-xs">
        <tr>
          <th className="py-2 pr-3 font-normal">{t('harness.sessions.title')}</th>
          <th className="py-2 pr-3 font-normal">{t('harness.sessions.origin')}</th>
          <th className="py-2 pr-3 font-normal">{t('harness.sessions.mode')}</th>
          <th className="py-2 pr-3 font-normal">{t('harness.sessions.status')}</th>
          <th className="py-2 pr-3 font-normal">{t('harness.sessions.tasks')}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((i) => (
          <tr key={i.session.id} className="border-t">
            <td className="py-2 pr-3">
              <Link href={`/harness/${i.session.id}`} className="hover:underline">
                {i.session.title}
              </Link>
              {i.pendingPermissions > 0 ? (
                <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700">
                  {t('harness.sessions.pending', { count: i.pendingPermissions })}
                </span>
              ) : null}
            </td>
            <td className="py-2 pr-3 text-xs">{t(`harness.origin.${i.session.origin}`)}</td>
            <td className="py-2 pr-3 text-xs">{t(`harness.mode.${i.session.mode}`)}</td>
            <td className="py-2 pr-3 text-xs">
              {i.latestTask?.status ?? t(`harness.sessionStatus.${i.session.status}`)}
            </td>
            <td className="py-2 pr-3 text-xs tabular-nums">{i.taskCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
