'use client';

import { useState, useTransition } from 'react';
import { ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GrantScope, HarnessSessionOrigin } from '@shepai/core/domain/generated/output';
import type { HarnessPermissionItem } from '@shepai/core/application/use-cases/harness/list-harness-permissions.use-case';
import { resolveHarnessPermission } from '@/app/actions/harness-commands';

export interface HarnessPermissionCardProps {
  item: HarnessPermissionItem;
  onResolved?: (id: string) => void;
}

/**
 * Effect-oriented permission prompt (spec 119, F5): the agent's reason, what
 * the action will do, scopes in the user's vocabulary, and a note that goes
 * back to the agent. Hard denies are never offered as approvable.
 */
export function HarnessPermissionCard({ item, onResolved }: HarnessPermissionCardProps) {
  const { t } = useTranslation('web');
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();
  const d = item.decision;
  const feature = item.session?.origin === HarnessSessionOrigin.Feature;

  const scopeLabel = (scope: GrantScope) => {
    if (scope === GrantScope.Once) return t('harness.permission.allowOnce');
    if (scope === GrantScope.Task) return t('harness.permission.allowPhase');
    return feature ? t('harness.permission.allowFeature') : t('harness.permission.allowSession');
  };

  function answer(allow: boolean, scope?: GrantScope) {
    startTransition(async () => {
      const result = await resolveHarnessPermission({
        id: d.id,
        allow,
        ...(scope && { scope }),
        ...(note.trim() && { note: note.trim() }),
      });
      if (!result.ok) toast.error(result.error);
      else onResolved?.(d.id);
    });
  }

  return (
    <div
      className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3"
      data-testid="harness-permission-card"
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-mono text-xs break-all">{d.action.summary}</p>
          {d.action.intent ? (
            <p className="text-xs">
              <span className="text-muted-foreground">{t('harness.permission.reason')}</span>{' '}
              {d.action.intent}
            </p>
          ) : null}
          <div className="text-xs">
            <p className="text-muted-foreground">{t('harness.permission.willDo')}</p>
            <ul className="mt-1 list-disc pl-5">
              {d.effects.length > 0 ? (
                d.effects.map((e) => (
                  <li key={`${e.category}:${e.description}`}>{e.description}</li>
                ))
              ) : (
                <li>{t('harness.permission.noEffects')}</li>
              )}
            </ul>
          </div>
          <p className="text-muted-foreground text-[11px]">
            {t('harness.permission.rules')} {d.matchedRuleIds.join(', ') || d.reasonCode}
          </p>
          {item.approvable ? (
            <>
              <Input
                data-testid="harness-permission-note"
                className="text-xs"
                placeholder={t('harness.permission.notePlaceholder')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                {item.scopes.map((scope) => (
                  <Button
                    key={scope}
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => answer(true, scope)}
                  >
                    {scopeLabel(scope)}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={isPending}
                  onClick={() => answer(false)}
                >
                  {t('harness.permission.deny')}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-xs text-red-600">{t('harness.permission.hardDeny')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
