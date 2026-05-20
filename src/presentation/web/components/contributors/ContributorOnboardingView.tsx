'use client';

/**
 * ContributorOnboardingView — client wrapper that composes the four
 * contributor onboarding components (LaneChooser, CuratedIssuesList,
 * DoctorSummary, ContributorLeaderboard) and drives the lane → curated
 * issues interaction via a server action (spec 097, task-47).
 */

import { useState, useTransition } from 'react';
import type { ContributorLane } from '@shepai/core/domain/generated/output';
import { LaneChooser } from './LaneChooser';
import { CuratedIssuesList, type CuratedIssueView } from './CuratedIssuesList';
import { DoctorSummary, type DoctorSummaryReport } from './DoctorSummary';
import { ContributorLeaderboard } from './ContributorLeaderboard';
import type { LeaderboardEntry, LeaderboardScope } from './ContributorLeaderboard';
import { loadCuratedIssues } from '@/app/actions/load-curated-issues';
import { useTranslation } from 'react-i18next';

export interface ContributorOnboardingViewProps {
  initialLeaderboard: {
    scope: LeaderboardScope;
    entries: readonly LeaderboardEntry[];
    error?: string;
  };
  initialDoctorReport?: DoctorSummaryReport;
  doctorError?: string;
}

export function ContributorOnboardingView({
  initialLeaderboard,
  initialDoctorReport,
  doctorError,
}: ContributorOnboardingViewProps) {
  const { t } = useTranslation('web');
  const [lane, setLane] = useState<ContributorLane | undefined>(undefined);
  const [issues, setIssues] = useState<readonly CuratedIssueView[]>([]);
  const [issuesError, setIssuesError] = useState<string | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  function handleLaneChange(next: ContributorLane) {
    setLane(next);
    setIssuesError(undefined);
    startTransition(async () => {
      const result = await loadCuratedIssues(next);
      if (result.error) {
        setIssues([]);
        setIssuesError(result.error);
      } else {
        setIssues(result.issues ?? []);
      }
    });
  }

  return (
    <div className="flex flex-col gap-8" data-testid="contributor-onboarding-view">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">
          {t('contributors.onboarding.title', { defaultValue: 'Contribute to Shep' })}
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          {t('contributors.onboarding.description', {
            defaultValue:
              'Pick a lane that matches what you want to work on. Shep will list curated good-first-issues you can ship in under 30 minutes — and run a quick environment check so your fresh clone actually builds.',
          })}
        </p>
      </header>

      <section className="flex flex-col gap-3" data-testid="contributor-pick-issue">
        <LaneChooser value={lane} onLaneChange={handleLaneChange} />
        {lane ? (
          <CuratedIssuesList issues={issues} loading={pending} error={issuesError} />
        ) : (
          <p
            className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm"
            data-testid="contributor-pick-issue-prompt"
          >
            {t('contributors.onboarding.pickLanePrompt', {
              defaultValue: 'Choose a lane to see curated issues.',
            })}
          </p>
        )}
      </section>

      <DoctorSummary report={initialDoctorReport} />
      {doctorError ? (
        <p className="text-muted-foreground text-xs" data-testid="doctor-summary-fallback">
          {t('contributors.onboarding.doctorUnavailable', {
            error: doctorError,
            defaultValue: 'Environment check unavailable: {{error}}',
          })}
        </p>
      ) : null}

      <ContributorLeaderboard
        scope={initialLeaderboard.scope}
        entries={initialLeaderboard.entries}
        error={initialLeaderboard.error}
      />
    </div>
  );
}
