'use client';

/**
 * AddKnowledgeSourceForm — keep a Notion page tree or database, by link, as
 * knowledge of the connection's space or of one of its product lines, synced
 * every N minutes (spec 125). The server checks the page is shared with the
 * integration before saving.
 */

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import {
  DEFAULT_KNOWLEDGE_INTERVAL_MINUTES,
  MAX_KNOWLEDGE_INTERVAL_MINUTES,
  MIN_KNOWLEDGE_INTERVAL_MINUTES,
} from '@shepai/core/domain/shared/knowledge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NATIVE_SELECT_CLASS } from '@/lib/native-select-class';
import { createKnowledgeSource } from '@/app/actions/manage-knowledge';
import type { RunTrackerAction } from '@/components/features/trackers/trackers-types';

const DEFAULT_INTERVAL = String(DEFAULT_KNOWLEDGE_INTERVAL_MINUTES);

export interface AddKnowledgeSourceFormProps {
  connectionId: string;
  /** Product lines of the connection's space. */
  productLines: { id: string; name: string }[];
  run: RunTrackerAction;
}

export function AddKnowledgeSourceForm({
  connectionId,
  productLines,
  run,
}: AddKnowledgeSourceFormProps) {
  const { t } = useTranslation('web');
  const [scope, setScope] = useState('');
  const [productLine, setProductLine] = useState('');
  const [every, setEvery] = useState(DEFAULT_INTERVAL);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const added = await run(() =>
      createKnowledgeSource({
        connection: connectionId,
        scope,
        ...(productLine ? { productLine } : {}),
        intervalMinutes: Number.parseInt(every, 10),
      })
    );
    if (added) {
      setScope('');
      setProductLine('');
      setEvery(DEFAULT_INTERVAL);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-1.5">
      <Input
        value={scope}
        onChange={(e) => setScope(e.target.value)}
        placeholder="https://www.notion.so/acme/Engineering-…"
        aria-label={t('knowledge.sources.scope')}
        className="h-7 min-w-56 flex-1 text-xs"
        data-testid="add-source-scope"
      />
      <select
        value={productLine}
        onChange={(e) => setProductLine(e.target.value)}
        aria-label={t('knowledge.sources.productLineLabel')}
        className={`${NATIVE_SELECT_CLASS} h-7`}
        data-testid="add-source-product-line"
      >
        <option value="">{t('knowledge.sources.wholeSpace')}</option>
        {productLines.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-xs">
        {t('trackers.rules.every')}
        <Input
          type="number"
          min={MIN_KNOWLEDGE_INTERVAL_MINUTES}
          max={MAX_KNOWLEDGE_INTERVAL_MINUTES}
          value={every}
          onChange={(e) => setEvery(e.target.value)}
          className="h-7 w-16 text-xs"
          data-testid="add-source-every"
        />
        {t('trackers.rules.minutes')}
      </label>
      <Button
        type="submit"
        size="xs"
        variant="outline"
        disabled={!scope.trim()}
        data-testid="add-source-submit"
      >
        <Plus />
        {t('knowledge.sources.add')}
      </Button>
    </form>
  );
}
