import { notFound } from 'next/navigation';
import { getFeatureFlags } from '@/lib/feature-flags';
import { OnboardingTutorial } from '@/components/onboarding/onboarding-tutorial';

/**
 * The collaboration tutorial (supervisors, agents, questions), linked from
 * the empty states on /supervisor and /agents. Shep's own contributor
 * tooling lives at /contributors.
 */
export default function OnboardingRoute() {
  const flags = getFeatureFlags();
  if (!flags.collaboration) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-12 p-6">
      <OnboardingTutorial headingLevel={1} />
    </div>
  );
}
