'use client';

/**
 * SpaceRules — the rules that place repositories in one space. A pattern that
 * is an absolute path is a path rule; anything else (github.com/acme/*) is a
 * git-remote rule. The most specific matching rule wins.
 */

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type { ProductLine, Space, SpaceRule } from '@shepai/core/domain/generated/output';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { addSpaceRule, removeSpaceRule } from '@/app/actions/manage-spaces';
import { SPACE_SELECT_CLASS, type RunSpaceAction } from './spaces-types';

export interface SpaceRulesProps {
  space: Space;
  rules: SpaceRule[];
  productLines: ProductLine[];
  run: RunSpaceAction;
}

export function SpaceRules({ space, rules, productLines, run }: SpaceRulesProps) {
  const { t } = useTranslation('web');
  const [pattern, setPattern] = useState('');
  const [line, setLine] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const added = await run(() =>
      addSpaceRule({ space: space.id, pattern, ...(line ? { productLine: line } : {}) })
    );
    if (added) {
      setPattern('');
      setLine('');
    }
  }

  return (
    <section className="space-y-2">
      <h3 className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {t('spaces.rules.title')}
      </h3>
      {rules.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t('spaces.rules.empty')}</p>
      ) : (
        <ul className="space-y-1">
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-center gap-2 text-xs">
              <Badge variant="outline" className="text-[10px]">
                {rule.kind}
              </Badge>
              <code className="min-w-0 flex-1 truncate">{rule.pattern}</code>
              {rule.productLineId ? (
                <span className="text-muted-foreground">
                  {productLines.find((l) => l.id === rule.productLineId)?.name}
                </span>
              ) : null}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t('spaces.rules.remove')}
                title={t('spaces.rules.remove')}
                onClick={() => run(() => removeSpaceRule(rule.id))}
                data-testid={`remove-rule-${rule.id}`}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex flex-wrap gap-1.5">
        <Input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder={t('spaces.rules.placeholder')}
          aria-label={t('spaces.rules.placeholder')}
          className="h-7 min-w-48 flex-1 font-mono text-xs"
          data-testid="add-rule-pattern"
        />
        {productLines.length > 0 ? (
          <select
            value={line}
            onChange={(e) => setLine(e.target.value)}
            aria-label={t('spaces.rules.line')}
            className={`${SPACE_SELECT_CLASS} h-7`}
            data-testid="add-rule-line"
          >
            <option value="">{t('spaces.rules.noLine')}</option>
            {productLines.map((productLine) => (
              <option key={productLine.id} value={productLine.id}>
                {productLine.name}
              </option>
            ))}
          </select>
        ) : null}
        <Button
          type="submit"
          size="xs"
          variant="outline"
          disabled={!pattern.trim()}
          data-testid="add-rule-submit"
        >
          <Plus />
          {t('spaces.rules.add')}
        </Button>
      </form>
    </section>
  );
}
