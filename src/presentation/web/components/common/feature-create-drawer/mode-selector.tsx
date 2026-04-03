'use client';

import { ClipboardList, Zap, FlaskConical } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FeatureMode } from '@shepai/core/domain/generated/output';

const MODE_OPTIONS = [
  {
    value: FeatureMode.Regular,
    icon: ClipboardList,
    label: 'Regular',
    description: 'Full SDLC — requirements, research, planning, implementation, and review.',
  },
  {
    value: FeatureMode.Fast,
    icon: Zap,
    label: 'Fast',
    description: 'Direct implementation — skip SDLC phases, go straight to code.',
  },
  {
    value: FeatureMode.Exploration,
    icon: FlaskConical,
    label: 'Explore',
    description: 'Iterative prototyping — generate quick prototypes and iterate with feedback.',
  },
] as const;

export interface ModeSelectorProps {
  value: FeatureMode;
  onChange: (mode: FeatureMode) => void;
  disabled?: boolean;
}

export function ModeSelector({ value, onChange, disabled }: ModeSelectorProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={value}
        onValueChange={(v) => {
          // ToggleGroup emits empty string when clicking the already-selected item — ignore it
          if (v) onChange(v as FeatureMode);
        }}
        disabled={disabled}
        aria-label="Feature mode"
        data-testid="mode-selector"
      >
        {MODE_OPTIONS.map((opt) => (
          <Tooltip key={opt.value}>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value={opt.value}
                aria-label={opt.label}
                data-testid={`mode-option-${opt.value.toLowerCase()}`}
                className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground flex items-center gap-1 px-2 text-xs"
              >
                <opt.icon className="h-3.5 w-3.5" />
                {opt.label}
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent side="bottom">{opt.description}</TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
    </TooltipProvider>
  );
}
