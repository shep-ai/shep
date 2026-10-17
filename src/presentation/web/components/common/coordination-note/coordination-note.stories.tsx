import type { Meta, StoryObj } from '@storybook/react';
import { CoordinationAction } from '@shepai/core/domain/generated/output';
import { CoordinationNote } from './coordination-note';

const decidedAt = Date.UTC(2026, 9, 12, 10, 0);

const meta: Meta<typeof CoordinationNote> = {
  title: 'Composed/CoordinationNote',
  component: CoordinationNote,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ width: '360px' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    coordination: {
      action: CoordinationAction.Defer,
      rationale:
        'Both features rewrite the session refresh path in session.ts; letting the token rotation land first avoids a conflicting rebase.',
      peerName: 'Rotate refresh tokens on every session renewal',
      overlappingPaths: ['src/auth/session.ts', 'src/auth/token-store.ts'],
      decidedAt,
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** The agent deferred this feature until its overlapping peer lands. */
export const Default: Story = {};

/** The agent judged the overlap safe and let both features keep running. */
export const RunsAlongside: Story = {
  args: {
    coordination: {
      action: CoordinationAction.Continue,
      rationale: 'Both only append separate entries to CHANGELOG.md; the edits are independent.',
      peerName: 'Add 1.3.0 changelog entry',
      overlappingPaths: ['CHANGELOG.md'],
      decidedAt,
    },
  },
};

/** The peer has since been deleted, so its name is unknown. */
export const DeletedPeer: Story = {
  args: {
    coordination: {
      action: CoordinationAction.Defer,
      rationale: 'Both change the public session API.',
      overlappingPaths: ['src/auth/session.ts'],
      decidedAt,
    },
  },
};

/** Many shared files and a long rationale. */
export const ManySharedFiles: Story = {
  args: {
    coordination: {
      action: CoordinationAction.Defer,
      rationale:
        'Both features restructure the authentication module: one splits the session store into per-tenant shards while the other changes token expiry semantics in the same files. Running them together would leave whichever lands second rebasing onto a different storage model.',
      peerName: 'Per-tenant session shards',
      overlappingPaths: [
        'packages/core/src/infrastructure/services/auth/session-store.service.ts',
        'packages/core/src/infrastructure/services/auth/token-rotation.service.ts',
        'packages/core/src/application/use-cases/auth/renew-session.use-case.ts',
        'src/auth/session.ts',
        'src/auth/token-store.ts',
      ],
      decidedAt,
    },
  },
};
