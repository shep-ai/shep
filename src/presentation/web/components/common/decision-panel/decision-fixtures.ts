import {
  DecisionKind,
  DecisionResponseMode,
  type Decision,
} from '@shepai/core/domain/generated/output';

/** Shared story data for the decision components (spec 134). */
export const chatDecision: Decision = {
  id: 'story-chat',
  kind: DecisionKind.ChatQuestion,
  responseMode: DecisionResponseMode.Live,
  questions: [
    {
      id: 'q1',
      header: 'Layout',
      question: 'How should the dashboard lay out its cards?',
      multiSelect: false,
      allowCustom: true,
      options: [
        {
          id: 'grid',
          label: 'Grid',
          description: 'Two columns on desktop, one on mobile',
          recommended: true,
          preview: '┌────┐ ┌────┐\n│card│ │card│\n└────┘ └────┘',
        },
        {
          id: 'list',
          label: 'List',
          description: 'One card per row, denser',
          preview: '┌──────────┐\n│ card     │\n├──────────┤\n│ card     │\n└──────────┘',
        },
        { id: 'masonry', label: 'Masonry', description: 'Variable heights, Pinterest style' },
      ],
    },
    {
      id: 'q2',
      header: 'Platforms',
      question: 'Which platforms must it support at launch?',
      multiSelect: true,
      allowCustom: false,
      options: [
        { id: 'web', label: 'Web', description: 'Desktop and mobile browsers' },
        { id: 'ios', label: 'iOS', description: 'Native app' },
        { id: 'android', label: 'Android', description: 'Native app' },
      ],
    },
  ],
};

export const agentAskDecision: Decision = {
  id: 'story-agent-ask',
  kind: DecisionKind.AgentAsk,
  responseMode: DecisionResponseMode.Async,
  title: 'fast-implement is blocked on a design choice',
  defaultAfter: new Date(Date.now() + 30 * 60 * 1000),
  questions: [
    {
      id: 'q1',
      header: 'Migration',
      question: 'The users table has 40M rows. How should the new column be added?',
      multiSelect: false,
      allowCustom: true,
      options: [
        {
          id: 'online',
          label: 'Online, nullable column',
          description: 'No lock; backfill in batches afterwards',
          recommended: true,
        },
        { id: 'default', label: 'Column with a default', description: 'Rewrites the table' },
      ],
    },
  ],
};
