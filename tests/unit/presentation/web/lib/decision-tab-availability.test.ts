// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { FeatureArtifact, ResearchArtifact } from '@shepai/core/domain/generated/output';
import { toDecisionTabAvailability } from '@/lib/decision-tab-availability';

const decision = {
  title: 'Bundler',
  chosen: 'Vite',
  rejected: ['Webpack'],
  rationale: 'Fast dev server',
};

function research(decisions: ResearchArtifact['decisions']): ResearchArtifact {
  return { decisions } as unknown as ResearchArtifact;
}

function spec(openQuestions: Partial<FeatureArtifact['openQuestions'][number]>[]): FeatureArtifact {
  return { openQuestions } as unknown as FeatureArtifact;
}

describe('toDecisionTabAvailability', () => {
  it('reports technical decisions when research.yaml lists at least one', () => {
    expect(toDecisionTabAvailability(research([decision]), null).hasTechDecisions).toBe(true);
  });

  it('reports none for a research artifact with an empty decisions list', () => {
    // TechDecisionsContent renders nothing for an empty list.
    expect(toDecisionTabAvailability(research([]), null).hasTechDecisions).toBe(false);
  });

  it('reports none when research.yaml could not be read', () => {
    expect(toDecisionTabAvailability(null, null).hasTechDecisions).toBe(false);
  });

  it('reports product decisions only for resolved questions', () => {
    // The Product tab lists resolved openQuestions only.
    expect(
      toDecisionTabAvailability(null, spec([{ question: 'Auth?', resolved: true }]))
        .hasProductDecisions
    ).toBe(true);
    expect(
      toDecisionTabAvailability(null, spec([{ question: 'Auth?', resolved: false }]))
        .hasProductDecisions
    ).toBe(false);
  });

  it('reports none when spec.yaml could not be read', () => {
    expect(toDecisionTabAvailability(null, null).hasProductDecisions).toBe(false);
  });
});
