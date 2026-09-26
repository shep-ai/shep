'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { BuildMode } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import { useCanStartFeatures } from '@/hooks/shell-variant-context';
import { buildCreateUrl } from '@/lib/url-params';

export interface AddFeatureButtonProps {
  applicationId: string;
}

/**
 * "Start an app, then add features": opens the create drawer scoped to this
 * app in spec-driven mode. Hidden where the shell cannot open Control Center.
 */
export function AddFeatureButton({ applicationId }: AddFeatureButtonProps) {
  const router = useRouter();
  const { t } = useTranslation('web');
  const canStartFeatures = useCanStartFeatures();
  if (!canStartFeatures) return null;

  const label = t('fab.addFeature');
  return (
    <Button
      type="button"
      size="sm"
      className="h-8 gap-1.5 px-2.5"
      data-testid="top-bar-add-feature"
      aria-label={label}
      onClick={() => router.push(buildCreateUrl({ applicationId, mode: BuildMode.Spec }))}
    >
      <Plus className="size-3.5" aria-hidden="true" />
      <span className="text-xs">{label}</span>
    </Button>
  );
}
