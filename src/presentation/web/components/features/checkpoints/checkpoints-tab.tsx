'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CheckpointRestoreBlocker, type GitCheckpoint } from '@shepai/core/domain/generated/output';
import { checkpointLabel } from '@shepai/core/domain/shared/git-checkpoint';
import type { FeatureCheckpointList } from '@shepai/core/application/use-cases/features/checkpoints/list-feature-checkpoints.use-case';
import type { FeatureCheckpointDiff } from '@shepai/core/application/use-cases/features/checkpoints/get-feature-checkpoint-diff.use-case';
import {
  getFeatureCheckpointDiff,
  listFeatureCheckpoints,
  restoreFeatureCheckpoint,
} from '@/app/actions/feature-checkpoints';
import { DiffView } from '@/components/common/merge-review/diff-view';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CheckpointList } from './checkpoint-list';
import { CheckpointCompareBar } from './checkpoint-compare-bar';
import { CheckpointRestoreDialog } from './checkpoint-restore-dialog';

export interface CheckpointsTabProps {
  featureId: string;
}

enum DiffMode {
  Step = 'step',
  Compare = 'compare',
}

type DiffState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; diff: FeatureCheckpointDiff }
  | { status: 'error'; error: string };

/** Total over the enum, so a new blocker cannot ship without a message. */
const BLOCKER_MESSAGE_KEY: Record<CheckpointRestoreBlocker, string> = {
  [CheckpointRestoreBlocker.NoOwnWorktree]: 'checkpoints.blocked.NoOwnWorktree',
  [CheckpointRestoreBlocker.NotLinkedWorktree]: 'checkpoints.blocked.NotLinkedWorktree',
  [CheckpointRestoreBlocker.WorktreeUnavailable]: 'checkpoints.blocked.WorktreeUnavailable',
  [CheckpointRestoreBlocker.AgentRunning]: 'checkpoints.blocked.AgentRunning',
};

/**
 * Feature drawer → Checkpoints (spec 135): the worktree snapshot after each
 * agent step, what each step changed, a diff between any two steps, and
 * restore. Whether a restore is allowed comes from core (`restoreBlocker`).
 */
export function CheckpointsTab({ featureId }: CheckpointsTabProps) {
  const { t } = useTranslation('web');
  const [list, setList] = useState<FeatureCheckpointList | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<DiffMode>(DiffMode.Step);
  const [selectedSequence, setSelectedSequence] = useState<number | null>(null);
  const [compareFrom, setCompareFrom] = useState('');
  const [compareTo, setCompareTo] = useState('');
  const [diffState, setDiffState] = useState<DiffState>({ status: 'idle' });
  const [restoreTarget, setRestoreTarget] = useState<GitCheckpoint | null>(null);
  const [restoring, setRestoring] = useState(false);
  const diffRequest = useRef(0);

  const load = useCallback(async () => {
    const result = await listFeatureCheckpoints(featureId);
    if (!result.ok) {
      setLoadError(result.error);
      return;
    }
    setLoadError(null);
    setList(result.data);
    const { checkpoints } = result.data;
    const first = checkpoints.at(0);
    const latest = checkpoints.at(-1);
    setSelectedSequence(latest?.sequence ?? null);
    setCompareFrom(first ? checkpointLabel(first) : '');
    setCompareTo(latest ? checkpointLabel(latest) : '');
  }, [featureId]);

  useEffect(() => {
    void load();
  }, [load]);

  const checkpoints = useMemo(() => list?.checkpoints ?? [], [list]);
  const selected = checkpoints.find((c) => c.sequence === selectedSequence) ?? null;
  const selectedIsFirst = selected !== null && selected.sequence === checkpoints[0]?.sequence;

  useEffect(() => {
    let input: { featureId: string; from?: string; to: string } | null = null;
    if (mode === DiffMode.Compare && compareFrom && compareTo) {
      input = { featureId, from: compareFrom, to: compareTo };
    } else if (mode === DiffMode.Step && selected && !selectedIsFirst) {
      input = { featureId, to: checkpointLabel(selected) };
    }
    if (!input) {
      setDiffState({ status: 'idle' });
      return;
    }
    const request = ++diffRequest.current;
    setDiffState({ status: 'loading' });
    void getFeatureCheckpointDiff(input).then((result) => {
      if (request !== diffRequest.current) return; // a newer selection won
      setDiffState(
        result.ok
          ? { status: 'ready', diff: result.data }
          : { status: 'error', error: result.error }
      );
    });
  }, [featureId, mode, selected, selectedIsFirst, compareFrom, compareTo]);

  const confirmRestore = useCallback(
    async (checkpoint: GitCheckpoint) => {
      const step = checkpointLabel(checkpoint);
      setRestoring(true);
      const result = await restoreFeatureCheckpoint({ featureId, step });
      setRestoring(false);
      setRestoreTarget(null);
      if (result.ok) {
        toast.success(t('checkpoints.restored', { step }));
        await load();
      } else {
        toast.error(t('checkpoints.restoreFailed'), { description: result.error });
      }
    },
    [featureId, load, t]
  );

  if (loadError) return <p className="text-xs text-red-600">{loadError}</p>;
  if (!list) return <p className="text-muted-foreground text-xs">{t('checkpoints.loading')}</p>;
  if (checkpoints.length === 0) {
    return (
      <p className="text-muted-foreground text-xs" data-testid="checkpoints-empty">
        {t('checkpoints.empty')}
      </p>
    );
  }

  const blocker = list.restoreBlocker;
  return (
    <div className="flex flex-col gap-3" data-testid="checkpoints-tab">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={mode}
        onValueChange={(value) => {
          if (value === DiffMode.Step || value === DiffMode.Compare) setMode(value);
        }}
        className="self-start"
      >
        <ToggleGroupItem value={DiffMode.Step}>{t('checkpoints.modeStep')}</ToggleGroupItem>
        <ToggleGroupItem value={DiffMode.Compare}>{t('checkpoints.modeCompare')}</ToggleGroupItem>
      </ToggleGroup>

      {blocker ? (
        <p className="text-muted-foreground text-xs" data-testid="checkpoints-restore-blocked">
          {t(BLOCKER_MESSAGE_KEY[blocker])}
        </p>
      ) : null}

      <CheckpointList
        checkpoints={checkpoints}
        selectedSequence={mode === DiffMode.Step ? selectedSequence : null}
        onSelect={(c) => {
          setMode(DiffMode.Step);
          setSelectedSequence(c.sequence);
        }}
        onRestore={setRestoreTarget}
        restoreDisabled={blocker !== undefined}
      />

      {mode === DiffMode.Compare ? (
        <CheckpointCompareBar
          checkpoints={checkpoints}
          from={compareFrom}
          to={compareTo}
          onFromChange={setCompareFrom}
          onToChange={setCompareTo}
        />
      ) : null}

      <CheckpointDiffPanel
        state={diffState}
        baselineSelected={mode === DiffMode.Step && selectedIsFirst}
      />

      <CheckpointRestoreDialog
        checkpoint={restoreTarget}
        pending={restoring}
        onConfirm={(c) => void confirmRestore(c)}
        onCancel={() => setRestoreTarget(null)}
      />
    </div>
  );
}

function CheckpointDiffPanel({
  state,
  baselineSelected,
}: {
  state: DiffState;
  baselineSelected: boolean;
}) {
  const { t } = useTranslation('web');
  if (baselineSelected) {
    return <p className="text-muted-foreground text-xs">{t('checkpoints.baselineSelected')}</p>;
  }
  switch (state.status) {
    case 'idle':
      return <p className="text-muted-foreground text-xs">{t('checkpoints.selectStep')}</p>;
    case 'loading':
      return <p className="text-muted-foreground text-xs">{t('checkpoints.diffLoading')}</p>;
    case 'error':
      return <p className="text-xs text-red-600">{state.error}</p>;
    case 'ready': {
      const { diff } = state;
      return (
        <div className="flex flex-col gap-2" data-testid="checkpoint-diff">
          <p className="text-xs">
            <span className="font-mono">
              {checkpointLabel(diff.from)} → {checkpointLabel(diff.to)}
            </span>{' '}
            <span className="text-muted-foreground">
              {t('checkpoints.files', { count: diff.filesChanged })}
            </span>{' '}
            <span className="text-green-600">+{diff.additions}</span>{' '}
            <span className="text-red-600">-{diff.deletions}</span>
          </p>
          {diff.files.length === 0 ? (
            <p className="text-muted-foreground text-xs">{t('checkpoints.noChanges')}</p>
          ) : (
            <div className="h-[28rem] overflow-hidden rounded-md border">
              <DiffView fileDiffs={diff.files} />
            </div>
          )}
        </div>
      );
    }
  }
}
