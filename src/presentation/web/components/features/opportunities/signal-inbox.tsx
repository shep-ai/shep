'use client';

/**
 * SignalInbox — signals not yet linked to an opportunity (spec 126): link
 * each to an open opportunity of the space, or remove it.
 */

import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import type { Opportunity, Signal } from '@shepai/core/domain/generated/output';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NATIVE_SELECT_CLASS } from '@/lib/native-select-class';
import type { RunAction } from '@/hooks/use-run-action';
import { linkSignal, removeSignal } from '@/app/actions/manage-opportunities';

export interface SignalInboxProps {
  signals: Signal[];
  /** Open opportunities a signal can be linked to. */
  opportunities: Pick<Opportunity, 'id' | 'title'>[];
  run: RunAction;
}

export function SignalInbox({ signals, opportunities, run }: SignalInboxProps) {
  const { t } = useTranslation('web');
  return (
    <section data-testid="signal-inbox" className="space-y-2">
      <h2 className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {t('opportunities.inbox.title', { count: signals.length })}
      </h2>
      {signals.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t('opportunities.inbox.empty')}</p>
      ) : (
        <ul className="space-y-1">
          {signals.map((signal) => (
            <li
              key={signal.id}
              className="bg-card flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-xs"
            >
              <Badge variant="outline" className="text-[10px]">
                {t(`opportunities.kind.${signal.kind}`)}
              </Badge>
              {signal.urgent ? (
                <Badge variant="destructive" className="text-[10px]">
                  {t('opportunities.inbox.urgent')}
                </Badge>
              ) : null}
              <span className="min-w-0 flex-1 truncate">
                {signal.url ? (
                  <a href={signal.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {signal.title}
                  </a>
                ) : (
                  signal.title
                )}
              </span>
              {signal.customer ? (
                <span className="text-muted-foreground">
                  {signal.monthlyRevenue
                    ? t('opportunities.inbox.customerRevenue', {
                        customer: signal.customer,
                        revenue: signal.monthlyRevenue,
                      })
                    : signal.customer}
                </span>
              ) : null}
              <select
                value=""
                disabled={opportunities.length === 0}
                onChange={(e) => {
                  if (e.target.value) void run(() => linkSignal(signal.id, e.target.value));
                }}
                aria-label={t('opportunities.inbox.link')}
                className={`${NATIVE_SELECT_CLASS} h-7`}
                data-testid={`signal-link-${signal.id}`}
              >
                <option value="">{t('opportunities.inbox.link')}</option>
                {opportunities.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="icon-xs"
                title={t('opportunities.inbox.remove')}
                aria-label={t('opportunities.inbox.remove')}
                onClick={() => run(() => removeSignal(signal.id))}
                data-testid={`signal-remove-${signal.id}`}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
