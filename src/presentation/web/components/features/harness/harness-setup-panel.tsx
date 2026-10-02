'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { InitHarnessProjectResult } from '@shepai/core/application/use-cases/harness/init-harness-project.use-case';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setUpHarnessRepository } from '@/app/actions/harness-commands';

export interface HarnessSetupPanelProps {
  repositories: string[];
}

/** Set up a repository (spec 119, F2): detect, preview, write only on confirm, only under .shep/harness/. */
export function HarnessSetupPanel({ repositories }: HarnessSetupPanelProps) {
  const { t } = useTranslation('web');
  const [repoRoot, setRepoRoot] = useState(repositories[0] ?? '');
  const [preview, setPreview] = useState<InitHarnessProjectResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function call(confirm: boolean) {
    startTransition(async () => {
      const r = await setUpHarnessRepository(repoRoot.trim(), confirm);
      if (!r.ok) return void toast.error(r.error);
      setPreview(r.data);
      if (confirm) toast.success(t('harness.setup.written', { count: r.data.written.length }));
    });
  }

  const i = preview?.inspection;
  const nothingToWrite = preview?.files.every((f) => f.exists) ?? false;
  return (
    <div className="max-w-3xl space-y-3" data-testid="harness-setup-panel">
      <p className="text-muted-foreground text-xs">{t('harness.setup.description')}</p>
      <div className="flex gap-2">
        <Input
          list="harness-setup-repos"
          className="font-mono text-xs"
          value={repoRoot}
          onChange={(e) => setRepoRoot(e.target.value)}
        />
        <datalist id="harness-setup-repos">
          {repositories.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending || !repoRoot.trim()}
          onClick={() => call(false)}
        >
          {t('harness.setup.preview')}
        </Button>
      </div>
      {i ? (
        <dl className="grid grid-cols-[120px_1fr] gap-1 text-xs">
          <dt className="text-muted-foreground">{t('harness.setup.instructions')}</dt>
          <dd>{i.instructionFiles.join(', ') || '–'}</dd>
          <dt className="text-muted-foreground">{t('harness.setup.manifests')}</dt>
          <dd>{i.manifests.join(', ') || '–'}</dd>
          <dt className="text-muted-foreground">{t('harness.setup.commands')}</dt>
          <dd className="font-mono">
            {[i.testCommand, i.lintCommand].filter(Boolean).join(' · ') || '–'}
          </dd>
          <dt className="text-muted-foreground">{t('harness.setup.sensitive')}</dt>
          <dd className="font-mono">{i.sensitivePaths.join(', ') || '–'}</dd>
        </dl>
      ) : null}
      {preview?.files.map((f) => (
        <div key={f.path}>
          <p className="font-mono text-xs">
            {f.path}
            {f.exists ? ` (${t('harness.setup.exists')})` : ''}
          </p>
          <pre className="bg-muted max-h-48 overflow-auto rounded p-2 text-[11px]">{f.content}</pre>
        </div>
      ))}
      {preview && !nothingToWrite ? (
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => call(true)}
          data-testid="harness-setup-confirm"
        >
          {t('harness.setup.confirm')}
        </Button>
      ) : null}
    </div>
  );
}
