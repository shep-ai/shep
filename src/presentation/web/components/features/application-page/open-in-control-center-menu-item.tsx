'use client';

import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';

import { BuildMode } from '@shepai/core/domain/generated/output';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { buildCreateUrl } from '@/lib/url-params';

export interface OpenInControlCenterMenuItemProps {
  applicationId: string;
}

/**
 * Routes the user from the application page to the Control Center create
 * drawer pre-scoped to this application in spec-driven (SDD) mode. Navigation
 * is via the canonical `/create?...` URL built from `lib/url-params` — no
 * inline string literals (no-magic-values rule).
 */
export function OpenInControlCenterMenuItem({ applicationId }: OpenInControlCenterMenuItemProps) {
  const router = useRouter();
  const { t } = useTranslation('web');

  const label = t('fab.openInControlCenterSdd');

  return (
    <DropdownMenuItem
      onSelect={() => {
        router.push(buildCreateUrl({ applicationId, mode: BuildMode.Spec }));
      }}
      aria-label={label}
      data-testid="open-in-control-center-sdd-menu-item"
      className="cursor-pointer"
    >
      <Sparkles className="size-3.5" />
      <span>{label}</span>
    </DropdownMenuItem>
  );
}
