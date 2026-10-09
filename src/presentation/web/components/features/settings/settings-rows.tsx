'use client';

/**
 * The label + control rows every Settings section is built from.
 */

import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export function SettingsRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b py-2.5 last:border-b-0">
      {/* Grows and shrinks so the controls stay beside a long description; wraps below 16rem. */}
      <div className="min-w-0 flex-[1_1_16rem]">
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

export function SwitchRow({
  label,
  description,
  id,
  testId,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  id: string;
  testId: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
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
