/**
 * Storybook stand-in for FeatureActivitySection: the drawer's agent status
 * without the activity routes, for every story that renders the drawer.
 */
import { FeatureActivityCard } from '../../../../src/presentation/web/components/agent-activity/feature-activity-card';
import { WORKING_ACTIVITY } from '../../../../src/presentation/web/components/agent-activity/agent-activity-story-fixtures';

export interface FeatureActivitySectionProps {
  featureId: string;
  className?: string;
}

export function FeatureActivitySection({ featureId, className }: FeatureActivitySectionProps) {
  return (
    <FeatureActivityCard
      className={className}
      inDrawer
      activity={{ ...WORKING_ACTIVITY, featureId }}
      notify={{ watching: false, error: null, onStart: () => undefined, onStop: () => undefined }}
    />
  );
}
