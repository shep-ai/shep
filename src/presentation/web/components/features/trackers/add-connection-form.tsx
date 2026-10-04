'use client';

/**
 * AddConnectionForm — connect a Linear, Jira or Notion account to a space.
 * Jira also needs its site URL and the account email the token belongs to. The key is
 * tested by the server before anything is saved, and the field is cleared
 * once the connection exists.
 */

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { ConnectionProvider } from '@shepai/core/domain/generated/output';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NATIVE_SELECT_CLASS } from '@/lib/native-select-class';
import { createConnection } from '@/app/actions/manage-trackers';
import type { RunTrackerAction } from './trackers-types';

const PROVIDER_LABELS: Record<ConnectionProvider, string> = {
  [ConnectionProvider.Linear]: 'Linear',
  [ConnectionProvider.Jira]: 'Jira',
  [ConnectionProvider.Notion]: 'Notion',
};

const SECRET_LABELS: Record<ConnectionProvider, string> = {
  [ConnectionProvider.Linear]: 'trackers.add.linearSecret',
  [ConnectionProvider.Jira]: 'trackers.add.jiraSecret',
  [ConnectionProvider.Notion]: 'trackers.add.notionSecret',
};

export interface AddConnectionFormProps {
  spaces: { id: string; name: string }[];
  run: RunTrackerAction;
}

export function AddConnectionForm({ spaces, run }: AddConnectionFormProps) {
  const { t } = useTranslation('web');
  const [provider, setProvider] = useState<ConnectionProvider>(ConnectionProvider.Linear);
  const [name, setName] = useState('');
  const [space, setSpace] = useState(spaces[0]?.id ?? '');
  const [site, setSite] = useState('');
  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');
  const jira = provider === ConnectionProvider.Jira;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const created = await run(() =>
      createConnection({
        provider,
        name,
        ...(space ? { space } : {}),
        ...(jira ? { siteUrl: site, accountEmail: email } : {}),
        secret,
      })
    );
    setSecret('');
    if (created) {
      setName('');
      setSite('');
      setEmail('');
    }
  }

  return (
    <form
      onSubmit={submit}
      aria-label={t('trackers.add.title')}
      className="flex flex-wrap items-end gap-2 rounded-md border p-3"
    >
      <label className="flex flex-col gap-1 text-xs">
        {t('trackers.add.provider')}
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as ConnectionProvider)}
          className={NATIVE_SELECT_CLASS}
          data-testid="add-connection-provider"
        >
          {Object.values(ConnectionProvider).map((option) => (
            <option key={option} value={option}>
              {PROVIDER_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        {t('trackers.add.name')}
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`Acme ${PROVIDER_LABELS[provider]}`}
          className="h-8 w-36 text-sm"
          data-testid="add-connection-name"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        {t('trackers.add.space')}
        <select
          value={space}
          onChange={(e) => setSpace(e.target.value)}
          className={NATIVE_SELECT_CLASS}
          data-testid="add-connection-space"
        >
          {spaces.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      {jira ? (
        <>
          <label className="flex flex-col gap-1 text-xs">
            {t('trackers.add.site')}
            <Input
              value={site}
              onChange={(e) => setSite(e.target.value)}
              placeholder="https://acme.atlassian.net"
              className="h-8 w-56 text-sm"
              data-testid="add-connection-site"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            {t('trackers.add.email')}
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="me@acme.com"
              className="h-8 w-44 text-sm"
              data-testid="add-connection-email"
            />
          </label>
        </>
      ) : null}
      <label className="flex flex-col gap-1 text-xs">
        {t(SECRET_LABELS[provider])}
        <Input
          type="password"
          autoComplete="off"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="h-8 w-48 font-mono text-sm"
          data-testid="add-connection-secret"
        />
      </label>
      <Button
        type="submit"
        size="sm"
        disabled={!name.trim() || !secret.trim()}
        data-testid="add-connection-submit"
      >
        <Plus />
        {t('trackers.add.submit')}
      </Button>
    </form>
  );
}
