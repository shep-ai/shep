'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { Shield, Check, AlertTriangle, ShieldAlert, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateSecurityModeAction } from '@/app/actions/security';
import { SecurityMode } from '@shepai/core/domain/generated/output';
import type { SecurityState } from '@shepai/core/application/use-cases/security/get-security-state.use-case';

export interface SupplyChainSecuritySettingsSectionProps {
  securityState: SecurityState;
}

const MODE_OPTIONS = [
  { value: SecurityMode.Disabled, icon: ShieldOff },
  { value: SecurityMode.Advisory, icon: Shield },
  { value: SecurityMode.Enforce, icon: ShieldAlert },
] as const;

const SEVERITY_COLORS: Record<string, string> = {
  Low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  High: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  Critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export function SupplyChainSecuritySettingsSection({
  securityState,
}: SupplyChainSecuritySettingsSectionProps) {
  const { t } = useTranslation('web');
  const [mode, setMode] = useState(securityState.mode);
  const [isPending, startTransition] = useTransition();
  const [showSaved, setShowSaved] = useState(false);
  const prevPendingRef = useRef(false);

  useEffect(() => {
    if (prevPendingRef.current && !isPending) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    prevPendingRef.current = isPending;
  }, [isPending]);

  function handleModeChange(value: string) {
    const newMode = value as SecurityMode;
    setMode(newMode);
    startTransition(async () => {
      const result = await updateSecurityModeAction(newMode);
      if (!result.success) {
        toast.error(result.error ?? t('settings.failedToSave'));
        setMode(securityState.mode);
      }
    });
  }

  const lastEvalDisplay = securityState.lastEvaluationAt
    ? new Date(securityState.lastEvaluationAt).toLocaleString()
    : t('settings.security.lastEvaluationNever');

  const policySourceDisplay = securityState.policySource ?? t('settings.security.policySourceNone');

  return (
    <div className="bg-background rounded-lg border" data-testid="security-settings-section">
      <div className="bg-muted/30 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Shield className="text-muted-foreground h-3.5 w-3.5" />
          <h2 className="text-sm font-semibold">{t('settings.security.sectionTitle')}</h2>
          {isPending ? (
            <span className="text-muted-foreground text-xs">{t('settings.saving')}</span>
          ) : null}
          {showSaved && !isPending ? (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" />
              {t('settings.saved')}
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          {t('settings.security.sectionDescription')}
        </p>
      </div>
      <div className="px-4">
        {/* Security Mode */}
        <div className="flex items-center justify-between gap-4 border-b py-2.5">
          <div className="min-w-0">
            <label
              htmlFor="security-mode"
              className="cursor-pointer text-sm font-normal whitespace-nowrap"
            >
              {t('settings.security.mode')}
            </label>
            <p className="text-muted-foreground text-[11px] leading-tight">
              {t('settings.security.modeDescription')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Select value={mode} onValueChange={handleModeChange}>
              <SelectTrigger
                id="security-mode"
                data-testid="security-mode-select"
                className="w-40 cursor-pointer text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className="flex items-center gap-2 text-xs">
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        {t(`settings.security.mode${opt.value}`)}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Policy Source */}
        <div className="flex items-center justify-between gap-4 border-b py-2.5">
          <div className="min-w-0">
            <span className="text-sm font-normal whitespace-nowrap">
              {t('settings.security.policySource')}
            </span>
          </div>
          <span className="text-muted-foreground max-w-50 truncate font-mono text-xs">
            {policySourceDisplay}
          </span>
        </div>

        {/* Last Evaluation */}
        <div className="flex items-center justify-between gap-4 border-b py-2.5">
          <div className="min-w-0">
            <span className="text-sm font-normal whitespace-nowrap">
              {t('settings.security.lastEvaluation')}
            </span>
          </div>
          <span className="text-muted-foreground text-xs">{lastEvalDisplay}</span>
        </div>

        {/* Recent Findings */}
        <div className="py-2.5 last:border-b-0">
          <div className="mb-2">
            <span className="text-sm font-normal">{t('settings.security.recentFindings')}</span>
          </div>
          {securityState.recentEvents.length === 0 ? (
            <p className="text-muted-foreground text-xs">{t('settings.security.noFindings')}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {securityState.recentEvents.slice(0, 5).map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-2 rounded-md border px-2.5 py-1.5"
                >
                  <AlertTriangle
                    className={cn(
                      'mt-0.5 h-3 w-3 shrink-0',
                      event.severity === 'Critical' || event.severity === 'High'
                        ? 'text-red-500'
                        : event.severity === 'Medium'
                          ? 'text-yellow-500'
                          : 'text-blue-500'
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="secondary"
                        className={cn('px-1 py-0 text-[9px]', SEVERITY_COLORS[event.severity])}
                      >
                        {t(`settings.security.severity.${event.severity}`)}
                      </Badge>
                      <span className="text-muted-foreground text-[10px]">{event.category}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px]">{event.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
