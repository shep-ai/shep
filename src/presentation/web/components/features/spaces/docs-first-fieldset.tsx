'use client';

/**
 * DocsFirstFieldset — a space's docs-first policy (spec 131): whether agents
 * write the user-facing docs while planning and a change without docs waits
 * for a person before merging, and which repository paths hold the docs.
 */

import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';

export interface DocsFirstFieldsetProps {
  enabled: boolean;
  /** Comma-separated path prefixes as typed; empty means the defaults. */
  paths: string;
  defaultPaths: readonly string[];
  onEnabledChange: (enabled: boolean) => void;
  onPathsChange: (paths: string) => void;
}

export function DocsFirstFieldset({
  enabled,
  paths,
  defaultPaths,
  onEnabledChange,
  onPathsChange,
}: DocsFirstFieldsetProps) {
  const { t } = useTranslation('web');
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs">{t('spaces.agent.docsFirst')}</legend>
      <p className="text-muted-foreground text-[11px]">{t('spaces.agent.docsFirstHint')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            data-testid="agent-settings-docs-first"
          />
          {t('spaces.agent.docsFirstOn')}
        </label>
        <Input
          value={paths}
          disabled={!enabled}
          onChange={(e) => onPathsChange(e.target.value)}
          placeholder={defaultPaths.join(', ')}
          aria-label={t('spaces.agent.docsPaths')}
          className="h-7 min-w-48 flex-1 font-mono text-xs"
          data-testid="agent-settings-docs-paths"
        />
      </div>
    </fieldset>
  );
}
