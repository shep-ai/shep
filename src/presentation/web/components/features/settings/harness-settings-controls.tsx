'use client';

import type { ReactNode } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface HarnessSettingRowProps {
  id: string;
  label: string;
  description: string;
  children: ReactNode;
}

/** A labelled settings row: text on the left, the control on the right. */
export function HarnessSettingRow({ id, label, description, children }: HarnessSettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-normal">
          {label}
        </label>
        <p className="text-muted-foreground text-[11px] leading-tight">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export interface HarnessEnumSelectProps<T extends string> {
  id: string;
  value: T;
  options: readonly T[];
  label: (value: T) => string;
  onChange: (value: T) => void;
}

/** A select over a fixed set of enum values. */
export function HarnessEnumSelect<T extends string>({
  id,
  value,
  options,
  label,
  onChange,
}: HarnessEnumSelectProps<T>) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger id={id} data-testid={id} className="w-56 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {label(o)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
