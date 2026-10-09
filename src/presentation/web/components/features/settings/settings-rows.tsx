/**
 * Settings rows shared by the Settings page and sections that live in their
 * own files (usage metrics, spec 133). Extracted from settings-page-client.tsx
 * so new sections reuse them instead of copying them.
 */

import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export interface SettingsRowProps {
  label: string;
  description?: string;
  htmlFor?: string;
  children: React.ReactNode;
}

/** A labelled settings row with its control on the right. */
export function SettingsRow({ label, description, htmlFor, children }: SettingsRowProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b py-2.5 last:border-b-0">
      <div className="min-w-0">
        <Label
          id={htmlFor ? `${htmlFor}-label` : undefined}
          htmlFor={htmlFor}
          className="cursor-pointer text-sm font-normal"
        >
          {label}
        </Label>
        {description ? (
          <p className="text-muted-foreground text-[11px] leading-tight">{description}</p>
        ) : null}
      </div>
      <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export interface SwitchRowProps {
  label: string;
  description?: string;
  id: string;
  testId: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

/** A settings row holding one switch. */
export function SwitchRow({
  label,
  description,
  id,
  testId,
  checked,
  onChange,
  disabled,
}: SwitchRowProps) {
  return (
    <SettingsRow label={label} description={description} htmlFor={id}>
      <Switch
        id={id}
        data-testid={testId}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className={cn('cursor-pointer', disabled && 'cursor-not-allowed opacity-50')}
      />
    </SettingsRow>
  );
}
