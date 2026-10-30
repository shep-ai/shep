'use client';

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { LearnedHarnessStatus } from '@shepai/core/domain/generated/output';
import { EXECUTABLE_KINDS } from '@shepai/core/domain/harness-learning/harness-surfaces';
import { shortId, type HarnessVersionDetail } from './learning-types';

const ADOPTABLE: ReadonlySet<LearnedHarnessStatus> = new Set([
  LearnedHarnessStatus.Candidate,
  LearnedHarnessStatus.Superseded,
  LearnedHarnessStatus.RolledBack,
]);

export interface HarnessVersionDetailViewProps {
  detail: HarnessVersionDetail;
  /** An action on this version is in flight. */
  busy?: boolean;
  onAdopt: () => void;
  onReject: (feedback: string) => void;
}

function PathList({ label, paths, sign }: { label: string; paths: string[]; sign: string }) {
  if (paths.length === 0) return null;
  return (
    <div>
      <h4 className="text-muted-foreground text-[11px] font-semibold uppercase">{label}</h4>
      <ul className="font-mono text-xs">
        {paths.map((p) => (
          <li key={p} className="[overflow-wrap:anywhere]">
            {/* A non-breaking space keeps the sign on the line of its path. */}
            {`${sign}\u00a0${p}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One version: what changed against its base, why, and what to do with it. */
export function HarnessVersionDetailView({
  detail,
  busy,
  onAdopt,
  onReject,
}: HarnessVersionDetailViewProps) {
  const { t } = useTranslation('web');
  const [feedback, setFeedback] = useState('');
  const { version, base, diff, diffText, edits } = detail;
  const runsCode = version.components.some((c) => EXECUTABLE_KINDS.has(c.kind));
  const isCandidate = version.status === LearnedHarnessStatus.Candidate;

  return (
    <section className="space-y-4 px-4 py-4" data-testid="harness-version-detail">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold">
          {t('learning.detail.title', { id: shortId(version.id) })}
        </h3>
        <p className="text-muted-foreground text-xs">
          {base
            ? t('learning.detail.against', { id: shortId(base.id) })
            : t('learning.detail.againstBase')}
        </p>
        {version.notes ? <p className="text-xs whitespace-pre-line">{version.notes}</p> : null}
        {version.statusReason ? (
          <p className="text-muted-foreground text-xs">
            {t('learning.detail.reason', { reason: version.statusReason })}
          </p>
        ) : null}
      </header>

      {runsCode ? (
        <p
          className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
          data-testid="harness-runs-code"
        >
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {t('learning.detail.runsCode')}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-x-10 gap-y-3">
        <PathList label={t('learning.detail.added')} paths={diff.added} sign="+" />
        <PathList label={t('learning.detail.modified')} paths={diff.modified} sign="~" />
        <PathList label={t('learning.detail.removed')} paths={diff.removed} sign="-" />
      </div>
      {diffText ? (
        <pre
          className="bg-muted max-h-80 overflow-auto rounded-md p-3 text-[11px] whitespace-pre-wrap"
          data-testid="harness-diff-text"
        >
          {diffText}
        </pre>
      ) : (
        <p className="text-muted-foreground text-xs">{t('learning.detail.noChanges')}</p>
      )}

      {edits.length > 0 ? (
        <div>
          <h4 className="mb-1 text-xs font-semibold">{t('learning.detail.edits')}</h4>
          <ul className="space-y-2" data-testid="harness-edits">
            {edits.map((e) => (
              <li key={e.id} className="rounded-md border px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <code>{e.componentPath}</code>
                  <span className="text-muted-foreground ml-auto">
                    {t(`learning.verdict.${e.verdict}`)}
                  </span>
                </div>
                <p>{e.change}</p>
                <p className="text-muted-foreground">{e.observed}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {ADOPTABLE.has(version.status) ? (
        <div className="space-y-2 border-t pt-3">
          {isCandidate ? (
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={t('learning.detail.feedbackPlaceholder')}
              className="text-xs"
              data-testid="harness-reject-feedback"
              disabled={busy}
            />
          ) : null}
          <div className="flex gap-2">
            <Button size="sm" onClick={onAdopt} disabled={busy} data-testid="harness-adopt">
              {busy ? t('learning.working') : t('learning.detail.adopt')}
            </Button>
            {isCandidate ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onReject(feedback.trim())}
                disabled={busy}
                data-testid="harness-reject"
              >
                {t('learning.detail.reject')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
