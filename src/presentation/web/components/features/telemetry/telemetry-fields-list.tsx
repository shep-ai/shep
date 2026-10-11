import { useTranslation } from 'react-i18next';
import {
  TELEMETRY_ANONYMOUS_FIELDS,
  TELEMETRY_IDENTITY_FIELDS,
  type TelemetryNoticeField,
} from '@shepai/core/domain/shared/telemetry/telemetry-notice';
import { cn } from '@/lib/utils';

export interface TelemetryFieldsListProps {
  className?: string;
}

function FieldItems({ fields }: { fields: readonly TelemetryNoticeField[] }) {
  const { t } = useTranslation('web');
  return (
    <ul className="text-muted-foreground mt-1 list-disc space-y-0.5 ps-4">
      {fields.map((field) => (
        <li key={field} data-testid={`telemetry-field-${field}`}>
          {t(`telemetry.fields.${field}`)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Exactly what usage metrics send (spec 133). Rendered from the same domain
 * lists the CLI notice uses, so the two surfaces cannot disagree. Identity is
 * opt-in, so its fields get their own heading.
 */
export function TelemetryFieldsList({ className }: TelemetryFieldsListProps) {
  const { t } = useTranslation('web');
  return (
    <div data-testid="telemetry-fields-list" className={cn('text-xs', className)}>
      <p className="text-foreground font-medium">{t('telemetry.fieldsHeading')}</p>
      <FieldItems fields={TELEMETRY_ANONYMOUS_FIELDS} />
      <div data-testid="telemetry-identity-fields" className="mt-2">
        <p className="text-foreground font-medium">{t('telemetry.identityHeading')}</p>
        <FieldItems fields={TELEMETRY_IDENTITY_FIELDS} />
      </div>
      <p className="text-muted-foreground mt-2">{t('telemetry.neverSent')}</p>
    </div>
  );
}
