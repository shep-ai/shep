'use client';

/**
 * WelcomeBanner
 *
 * One-time hint shown at the top of /supervisor and /agents the first time
 * the user lands on each surface. Dismissed via localStorage so it stays
 * out of the way once acknowledged. Pure presentation — no domain calls.
 *
 * `id` is the storage key; pick a stable string per surface (e.g.
 * `onboarding:supervisor:v1`) so we can re-introduce a banner after a
 * refresh by bumping the version segment.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { GraduationCap, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

const STORAGE_PREFIX = 'shep:onboarding:';

export interface WelcomeBannerProps {
  /** Stable storage key suffix (e.g. "supervisor:v1"). */
  id: string;
  title: string;
  description: string;
  /** Optional CTA — typically the deep tutorial link. */
  ctaLabel?: string;
  ctaHref?: string;
  /** Force-show in tests/Storybook (ignores localStorage). */
  forceVisible?: boolean;
}

export function WelcomeBanner({
  id,
  title,
  description,
  ctaLabel,
  ctaHref,
  forceVisible,
}: WelcomeBannerProps) {
  const { t } = useTranslation('web');
  const storageKey = `${STORAGE_PREFIX}${id}`;
  // Mounted gate avoids a server/client hydration mismatch: SSR returns null,
  // the effect resolves visibility from localStorage on the client.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setMounted(true);
    if (forceVisible) {
      setVisible(true);
      return;
    }
    try {
      const dismissed = window.localStorage.getItem(storageKey);
      setVisible(dismissed !== '1');
    } catch {
      setVisible(true);
    }
  }, [forceVisible, storageKey]);

  function dismiss() {
    setVisible(false);
    if (forceVisible) return;
    try {
      window.localStorage.setItem(storageKey, '1');
    } catch {
      // best-effort
    }
  }

  if (!mounted || !visible) return null;

  return (
    <div
      className="bg-muted/40 flex items-start gap-3 rounded-lg border p-4"
      data-testid={`welcome-banner-${id}`}
    >
      <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
        <GraduationCap className="size-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        {ctaHref && ctaLabel ? (
          <div>
            <Button asChild size="sm" variant="outline">
              <Link href={ctaHref as Route} data-testid={`welcome-banner-${id}-cta`}>
                {ctaLabel}
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        onClick={dismiss}
        aria-label={t('onboarding.welcomeBanner.dismiss', {
          defaultValue: 'Dismiss this hint',
        })}
        data-testid={`welcome-banner-${id}-dismiss`}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
