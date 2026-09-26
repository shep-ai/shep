'use client';

import type { ElementType } from 'react';
import {
  ArrowUpRight,
  ClipboardList,
  FolderOpen,
  Github,
  Loader2,
  Plus,
  Sparkles,
} from 'lucide-react';

export interface NewApplicationCardProps {
  /** Opens the App Builder prompt (Vite + React + shadcn). */
  onQuickWebApp(): void;
  /** Opens the stack-agnostic, spec-driven project prompt. Omit where Features are unavailable. */
  onSpecDrivenProject?: () => void;
  onOpenLocalDirectory?: () => void;
  onImportGitHub?: () => void;
  /** True while a local folder import is running. */
  importing?: boolean;
}

type OptionId = 'quick-web-app' | 'spec-driven-project' | 'open-local' | 'import-github';

interface CreateOption {
  id: OptionId;
  icon: ElementType;
  label: string;
  description: string;
  onClick?: () => void;
}

/**
 * Creation choices on the App Builder page. Each option says what it builds,
 * so the single-stack App Builder is never mistaken for Shep's stack-agnostic,
 * spec-driven Feature workflow.
 */
export function NewApplicationCard({
  onQuickWebApp,
  onSpecDrivenProject,
  onOpenLocalDirectory,
  onImportGitHub,
  importing,
}: NewApplicationCardProps) {
  const options: CreateOption[] = [
    {
      id: 'quick-web-app',
      icon: Sparkles,
      label: 'Quick web app',
      description: 'Vite + React + shadcn · live preview, no spec phase',
      onClick: onQuickWebApp,
    },
    {
      id: 'spec-driven-project',
      icon: ClipboardList,
      label: 'Spec-driven project',
      description: 'Any stack · requirements, research and a plan first',
      onClick: onSpecDrivenProject,
    },
    {
      id: 'open-local',
      icon: FolderOpen,
      label: 'Open local project',
      description: 'Continue from a folder',
      onClick: onOpenLocalDirectory,
    },
    {
      id: 'import-github',
      icon: Github,
      label: 'Import from GitHub',
      description: 'Bring an existing repository',
      onClick: onImportGitHub,
    },
  ];

  return (
    <section
      aria-label="Create an application"
      className="border-primary/25 bg-primary/[0.025] flex min-h-[320px] flex-col rounded-xl border border-dashed p-5"
    >
      <div className="mb-5 flex items-center gap-3">
        <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl">
          <Plus className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Make room for your next idea</h2>
          <p className="text-muted-foreground mt-1 text-xs">Pick how Shep should build it.</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-2">
        {options
          .filter((option) => option.onClick)
          .map(({ id, icon: Icon, label, description, onClick }) => {
            const busy = id === 'open-local' && importing;
            return (
              <button
                key={id}
                type="button"
                data-testid={`new-application-option-${id}`}
                onClick={onClick}
                disabled={busy}
                className="border-border/60 bg-card hover:border-primary/35 hover:bg-primary/5 focus-visible:ring-ring group flex min-h-14 w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-start transition-colors outline-none focus-visible:ring-2 disabled:cursor-wait disabled:opacity-60"
              >
                {busy ? (
                  <Loader2
                    className="text-primary size-4 shrink-0 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Icon className="text-primary size-4 shrink-0" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold">{label}</span>
                  <span className="text-muted-foreground mt-0.5 block text-xs">{description}</span>
                </span>
                <ArrowUpRight
                  className="text-muted-foreground size-3.5 shrink-0"
                  aria-hidden="true"
                />
              </button>
            );
          })}
      </div>
    </section>
  );
}
