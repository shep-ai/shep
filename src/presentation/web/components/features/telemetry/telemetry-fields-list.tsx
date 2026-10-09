import { useTranslation } from 'react-i18next';
import { TELEMETRY_NOTICE_FIELDS } from '@shepai/core/domain/shared/telemetry/telemetry-notice';
import { cn } from '@/lib/utils';

export interface TelemetryFieldsListProps {
  className?: string;
}

/**
 * Exactly what usage metrics send (spec 133). Rendered from the same domain
 * list the CLI notice uses, so the two surfaces cannot disagree.
 */
export function TelemetryFieldsList({ className }: TelemetryFieldsListProps) {
  const { t } = useTranslation('web');
  return (
    <div data-testid="telemetry-fields-list" className={cn('text-xs', className)}>
      <p className="text-foreground font-medium">{t('telemetry.fieldsHeading')}</p>
      <ul className="text-muted-foreground mt-1 list-disc space-y-0.5 ps-4">
        {TELEMETRY_NOTICE_FIELDS.map((field) => (
          <li key={field} data-testid={`telemetry-field-${field}`}>
            {t(`telemetry.fields.${field}`)}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-2">{t('telemetry.neverSent')}</p>
    </div>
  );
}
