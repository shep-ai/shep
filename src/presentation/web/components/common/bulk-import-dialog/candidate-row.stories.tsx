import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { CandidateRow } from './candidate-row';

const meta: Meta<typeof CandidateRow> = {
  title: 'Composed/BulkImportDialog/CandidateRow',
  component: CandidateRow,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof CandidateRow>;

const baseCandidate = {
  name: 'api-server',
  path: '/Users/dev/Code/api-server',
  isGitRepository: true,
  alreadyTracked: false,
  previouslyRemoved: false,
};

function Controlled({
  candidate,
  error,
  initialChecked = false,
}: {
  candidate: typeof baseCandidate;
  error?: string;
  initialChecked?: boolean;
}) {
  const [checked, setChecked] = useState(initialChecked);
  return (
    <div className="w-96">
      <CandidateRow
        candidate={candidate}
        checked={checked}
        onCheckedChange={setChecked}
        error={error}
      />
    </div>
  );
}

/** Default — an untracked git repository, selectable. */
export const Default: Story = {
  render: () => <Controlled candidate={baseCandidate} initialChecked />,
};

/** Not a git repository — offered anyway, just flagged. */
export const NotAGitRepository: Story = {
  render: () => (
    <Controlled candidate={{ ...baseCandidate, name: 'design-notes', isGitRepository: false }} />
  ),
};

/** Already tracked — disabled, cannot be re-imported. */
export const AlreadyTracked: Story = {
  render: () => <Controlled candidate={{ ...baseCandidate, alreadyTracked: true }} />,
};

/** Previously removed — importing restores the soft-deleted repository. */
export const PreviouslyRemoved: Story = {
  render: () => <Controlled candidate={{ ...baseCandidate, previouslyRemoved: true }} />,
};

/** Error — a failed import attempt reported inline on the row. */
export const WithError: Story = {
  render: () => <Controlled candidate={baseCandidate} error="permission denied" initialChecked />,
};
