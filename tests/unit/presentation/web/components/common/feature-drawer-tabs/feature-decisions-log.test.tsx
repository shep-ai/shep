/**
 * The feature's decisions in its Activity tab (spec 134): every question the
 * run asked, and what became of it — including when the agent proceeded with
 * its recommendation because nobody answered in time.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  AgentQuestionAnswerer,
  AgentQuestionKind,
  AgentQuestionStatus,
  type AgentQuestion,
} from '@shepai/core/domain/generated/output';
import { FeatureDecisionsLog } from '@/components/common/feature-drawer-tabs/feature-decisions-log';

function q(overrides: Partial<AgentQuestion>): AgentQuestion {
  return {
    id: 'q-1',
    agentRunId: 'run-1',
    featureId: 'feat-1',
    kind: AgentQuestionKind.blocking,
    prompt: 'How should the column be added?',
    answerer: AgentQuestionAnswerer.either,
    status: AgentQuestionStatus.pending,
    createdAt: new Date('2026-10-09T10:00:00Z'),
    updatedAt: new Date('2026-10-09T10:00:00Z'),
    ...overrides,
  };
}

describe('FeatureDecisionsLog', () => {
  it('renders nothing when the run asked nothing', () => {
    const { container } = render(<FeatureDecisionsLog decisions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says when the agent proceeded with its recommendation', () => {
    render(
      <FeatureDecisionsLog
        decisions={[
          q({
            id: 'q-d',
            status: AgentQuestionStatus.expired,
            answer: 'Online, nullable column',
            answeredBy: 'system:deadline',
          }),
          q({
            id: 'q-a',
            status: AgentQuestionStatus.answered,
            answer: 'Grid',
            answeredBy: 'user:web',
          }),
          q({ id: 'q-p' }),
        ]}
      />
    );
    expect(screen.getByTestId('feature-decision-q-d')).toHaveTextContent(
      'No answer by the deadline — proceeded with the recommended option: Online, nullable column'
    );
    expect(screen.getByTestId('feature-decision-q-a')).toHaveTextContent('user:web answered: Grid');
    expect(screen.getByTestId('feature-decision-q-p')).toHaveTextContent('Waiting for an answer');
    expect(screen.getByTestId('feature-decision-q-p')).toHaveTextContent(
      'How should the column be added?'
    );
  });
});
