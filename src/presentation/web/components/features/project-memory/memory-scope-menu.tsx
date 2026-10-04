'use client';

/**
 * MemoryScopeMenu — chooses who sees a memory entry (spec 120): only its
 * repository, its product line, or its whole space. Legacy Organization
 * entries show as space-wide. The server decides whether a move is allowed
 * (for example, a repository outside any product line) and the panel
 * announces its error.
 */

import { useTranslation } from 'react-i18next';
import { Boxes, FolderGit2, Layers } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MemoryScope } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { effectiveScope } from './memory-scope';

export interface MemoryScopeMenuProps {
  scope: MemoryScope | undefined;
  onSelect: (scope: MemoryScope) => void;
}

const OPTIONS: readonly { scope: MemoryScope; labelKey: string; icon: LucideIcon }[] = [
  { scope: MemoryScope.Project, labelKey: 'memory.scope.project', icon: FolderGit2 },
  { scope: MemoryScope.ProductLine, labelKey: 'memory.scope.productLine', icon: Layers },
  { scope: MemoryScope.Space, labelKey: 'memory.scope.space', icon: Boxes },
];

export function MemoryScopeMenu({ scope, onSelect }: MemoryScopeMenuProps) {
  const { t } = useTranslation('web');
  const current = effectiveScope(scope);
  const Icon = OPTIONS.find((o) => o.scope === current)?.icon ?? FolderGit2;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          title={t('memory.actions.scope')}
          aria-label={t('memory.actions.scope')}
          data-testid="project-memory-scope-toggle"
        >
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('memory.scope.menuLabel')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(value) => {
            if (value !== current) onSelect(value as MemoryScope);
          }}
        >
          {OPTIONS.map((option) => (
            <DropdownMenuRadioItem
              key={option.scope}
              value={option.scope}
              data-testid={`project-memory-scope-option-${option.scope}`}
            >
              <option.icon className="size-3.5" />
              {t(option.labelKey)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
