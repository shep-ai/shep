'use client';

/**
 * FeedbackKeysPanel — keys tools use to post feedback into this space (spec
 * 127). A new key's secret is shown here once; afterwards only its prefix is
 * known. Revoked keys stay listed so the team knows which tool lost access.
 */

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { KeyRound, Plus } from 'lucide-react';
import type { FeedbackKeyView } from '@shepai/core/application/use-cases/feedback/manage-feedback-keys.use-case';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { RunAction } from '@/hooks/use-run-action';
import { createFeedbackKey, revokeFeedbackKey } from '@/app/actions/manage-feedback';

const FEEDBACK_ENDPOINT = 'POST /api/feedback';

export interface FeedbackKeysPanelProps {
  spaceId: string;
  keys: FeedbackKeyView[];
  run: RunAction;
}

export function FeedbackKeysPanel({ spaceId, keys, run }: FeedbackKeysPanelProps) {
  const { t } = useTranslation('web');
  const router = useRouter();
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSecret(null);
    const result = await createFeedbackKey(spaceId, name);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSecret(result.secret);
    setName('');
    router.refresh();
  }

  return (
    <section data-testid="feedback-keys" className="bg-card space-y-2 rounded-lg border p-3">
      <h2 className="flex items-center gap-1.5 text-xs font-medium">
        <KeyRound className="size-3.5" />
        {t('opportunities.feedbackKeys.title')}
      </h2>
      <p className="text-muted-foreground text-xs">
        {t('opportunities.feedbackKeys.subtitle', { endpoint: FEEDBACK_ENDPOINT })}
      </p>
      {keys.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t('opportunities.feedbackKeys.empty')}</p>
      ) : (
        <ul className="space-y-1">
          {keys.map((key) => (
            <li key={key.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium">{key.name}</span>
              <code className="text-muted-foreground">{`${key.prefix}…`}</code>
              <span className="text-muted-foreground flex-1">
                {key.lastUsedAt
                  ? t('opportunities.feedbackKeys.lastUsed', {
                      when: new Date(key.lastUsedAt).toLocaleString(),
                    })
                  : t('opportunities.feedbackKeys.neverUsed')}
              </span>
              {key.revokedAt ? (
                <Badge variant="secondary" className="text-[10px]">
                  {t('opportunities.feedbackKeys.revoked')}
                </Badge>
              ) : (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => run(() => revokeFeedbackKey(key.id))}
                  data-testid={`feedback-key-revoke-${key.id}`}
                >
                  {t('opportunities.feedbackKeys.revoke')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={create} className="flex flex-wrap items-center gap-1.5">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('opportunities.feedbackKeys.namePlaceholder')}
          aria-label={t('opportunities.feedbackKeys.name')}
          className="h-7 w-48 text-xs"
          data-testid="feedback-key-name"
        />
        <Button
          type="submit"
          size="xs"
          variant="outline"
          disabled={!name.trim()}
          data-testid="feedback-key-create"
        >
          <Plus />
          {t('opportunities.feedbackKeys.create')}
        </Button>
      </form>
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
      {secret ? (
        <div className="space-y-1 rounded-md border border-dashed p-2 text-xs">
          <p>{t('opportunities.feedbackKeys.secretOnce')}</p>
          <code data-testid="feedback-key-secret" className="block break-all select-all">
            {secret}
          </code>
        </div>
      ) : null}
    </section>
  );
}
