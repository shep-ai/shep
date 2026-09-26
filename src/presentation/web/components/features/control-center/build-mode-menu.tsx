'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  COMPOSER_BUILD_MODES,
  COMPOSER_BUILD_MODE_CONFIG,
  type ComposerBuildMode,
} from './build-mode-options';

export interface BuildModeMenuProps {
  mode: ComposerBuildMode;
  onSelect: (mode: ComposerBuildMode) => void;
  /** Platform notation of the cycle chord, e.g. "Alt+Shift+M". */
  chordLabel: string;
}

/**
 * Build-mode picker for the composer. Each option names the stack it
 * produces so the stack-agnostic Feature modes and the Vite + shadcn App
 * Builder can never be mistaken for one another.
 */
export function BuildModeMenu({ mode, onSelect, chordLabel }: BuildModeMenuProps) {
  const { t } = useTranslation('web');
  const current = COMPOSER_BUILD_MODE_CONFIG[mode];
  const CurrentIcon = current.icon;
  const currentLabel = t(current.labelKey, current.label);
  const chordHint = t('emptyState.buildModeChordHint', 'Press {{chord}} to cycle build mode', {
    chord: chordLabel,
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="build-mode-selector"
          title={`${t('emptyState.buildMode', 'Build mode')}: ${currentLabel} (${chordLabel})`}
          aria-label={`${t('emptyState.buildMode', 'Build mode')}: ${currentLabel}. ${chordHint}`}
          className="text-muted-foreground hover:text-foreground hover:bg-accent/50 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors"
        >
          <span
            key={mode}
            className="flex animate-[onboard-fade-up_0.25s_ease-out_both] items-center gap-1.5"
          >
            <CurrentIcon className="h-3.5 w-3.5" />
            {currentLabel}
          </span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[240px]">
        {COMPOSER_BUILD_MODES.map((option) => {
          const cfg = COMPOSER_BUILD_MODE_CONFIG[option];
          const Icon = cfg.icon;
          return (
            <DropdownMenuItem
              key={option}
              onClick={() => onSelect(option)}
              data-testid={`build-mode-${option}`}
              className="flex items-start gap-2"
            >
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span>{t(cfg.labelKey, cfg.label)}</span>
                <span className="text-muted-foreground text-[11px]">
                  {t(cfg.stackKey, cfg.stack)}
                </span>
              </span>
              {option === mode ? <Check className="text-foreground h-3.5 w-3.5" /> : null}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        {/* Discoverability: the chord is only useful if it's visible. Hidden
            from ARIA because a `menu` should only expose `menuitem` children —
            screen-reader users get the same hint from the trigger's aria-label. */}
        <p aria-hidden="true" className="text-muted-foreground px-2 py-1 text-[11px]">
          {chordHint}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
