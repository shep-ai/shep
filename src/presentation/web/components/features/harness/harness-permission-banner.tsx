'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { listHarnessPermissions } from '@/app/actions/harness-queries';
import { Button } from '@/components/ui/button';

/** How often the banner re-checks for waiting actions. */
const POLL_MS = 3000;

export interface HarnessPermissionBannerProps {
  featureId: string;
  onReview: () => void;
}

/** Pinned above every feature-drawer tab while a harness action waits for approval (spec 119, F5). */
export function HarnessPermissionBanner({ featureId, onReview }: HarnessPermissionBannerProps) {
  const { t } = useTranslation('web');
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      void listHarnessPermissions({ featureId }).then((r) => {
        if (!cancelled && r.ok) setCount(r.data.length);
      });
    check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [featureId]);

  if (count === 0) return null;
  return (
    <div
      className="flex items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs"
      data-testid="harness-permission-banner"
    >
      <ShieldAlert className="h-4 w-4 text-amber-600" />
      <span className="flex-1">{t('harness.banner.waiting', { count })}</span>
      <Button size="sm" variant="outline" className="h-6 text-xs" onClick={onReview}>
        {t('harness.banner.review')}
      </Button>
    </div>
  );
}
