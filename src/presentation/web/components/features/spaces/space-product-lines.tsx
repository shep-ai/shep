'use client';

/**
 * SpaceProductLines — the product lines of one space, with add and remove.
 * Removing a line keeps its repositories in the space; the server refuses
 * while memory is still shared with the line.
 */

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, Plus, X } from 'lucide-react';
import type { ProductLine, Space } from '@shepai/core/domain/generated/output';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createProductLine, deleteProductLine } from '@/app/actions/manage-spaces';
import type { RunSpaceAction } from './spaces-types';

export interface SpaceProductLinesProps {
  space: Space;
  productLines: ProductLine[];
  run: RunSpaceAction;
}

export function SpaceProductLines({ space, productLines, run }: SpaceProductLinesProps) {
  const { t } = useTranslation('web');
  const [name, setName] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await run(() => createProductLine(space.id, { name }))) setName('');
  }

  return (
    <section className="space-y-2">
      <h3 className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {t('spaces.lines.title')}
      </h3>
      {productLines.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t('spaces.lines.empty')}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {productLines.map((line) => (
            <li key={line.id}>
              <Badge variant="secondary" className="gap-1 pe-0.5">
                <Layers className="size-3" />
                {line.name}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-4"
                  aria-label={t('spaces.lines.remove', { name: line.name })}
                  onClick={() => run(() => deleteProductLine(space.id, line.id))}
                  data-testid={`remove-product-line-${line.slug}`}
                >
                  <X />
                </Button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex gap-1.5">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('spaces.lines.placeholder')}
          aria-label={t('spaces.lines.placeholder')}
          className="h-7 text-xs"
          data-testid="add-product-line-name"
        />
        <Button
          type="submit"
          size="xs"
          variant="outline"
          disabled={!name.trim()}
          data-testid="add-product-line-submit"
        >
          <Plus />
          {t('spaces.lines.add')}
        </Button>
      </form>
    </section>
  );
}
