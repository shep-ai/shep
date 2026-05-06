import { notFound } from 'next/navigation';
import { getFeatureFlags } from '@/lib/feature-flags';
import { resolve } from '@/lib/server-container';
import { OnboardingTutorial } from '@/components/onboarding/onboarding-tutorial';
import { ContributorOnboardingView } from '@/components/contributors/ContributorOnboardingView';
import type {
  GetContributorLeaderboardUseCase,
  ContributorLeaderboardEntry,
} from '@shepai/core/application/use-cases/contributors/get-contributor-leaderboard.use-case';
import type { RunDoctorUseCase } from '@shepai/core/application/use-cases/doctor/run-doctor.use-case';
import type { LeaderboardEntry } from '@/components/contributors/ContributorLeaderboard';
import type { DoctorSummaryReport } from '@/components/contributors/DoctorSummary';

export const dynamic = 'force-dynamic';

const LEADERBOARD_LIMIT = 7;

interface LeaderboardLoadResult {
  entries: readonly LeaderboardEntry[];
  error?: string;
}

interface DoctorLoadResult {
  report?: DoctorSummaryReport;
  error?: string;
}

async function loadInitialLeaderboard(): Promise<LeaderboardLoadResult> {
  try {
    const useCase = resolve<GetContributorLeaderboardUseCase>('GetContributorLeaderboardUseCase');
    const result = await useCase.execute({ scope: 'month', limit: LEADERBOARD_LIMIT });
    const entries: LeaderboardEntry[] = result.entries.map((e: ContributorLeaderboardEntry) => ({
      login: e.login,
      displayName: e.displayName,
      avatarUrl: e.avatarUrl,
      prCount: e.prCount,
      level: e.level,
      lane: e.lane,
    }));
    return { entries };
  } catch (error: unknown) {
    return {
      entries: [],
      error: error instanceof Error ? error.message : 'Failed to load leaderboard',
    };
  }
}

async function loadInitialDoctorReport(): Promise<DoctorLoadResult> {
  try {
    const useCase = resolve<RunDoctorUseCase>('RunDoctorUseCase');
    const report = await useCase.execute();
    return {
      report: {
        results: report.results.map((r) => ({
          name: r.name,
          status: r.status,
          detail: r.detail,
          fixHint: r.fixHint,
        })),
        overallStatus: report.overallStatus,
        summary: report.summary,
      },
    };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Doctor unavailable' };
  }
}

export default async function OnboardingRoute() {
  const flags = getFeatureFlags();
  if (!flags.collaboration) {
    notFound();
  }

  const [leaderboard, doctor] = await Promise.all([
    loadInitialLeaderboard(),
    loadInitialDoctorReport(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-12 p-6">
      <ContributorOnboardingView
        initialLeaderboard={{
          scope: 'month',
          entries: leaderboard.entries,
          error: leaderboard.error,
        }}
        initialDoctorReport={doctor.report}
        doctorError={doctor.error}
      />
      <OnboardingTutorial />
    </div>
  );
}
