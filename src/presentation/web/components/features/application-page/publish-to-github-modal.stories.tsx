import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PublishToGitHubModal, type PublishOwner } from './publish-to-github-modal';

const owners: PublishOwner[] = [
  { login: 'octocat', kind: 'user', description: 'Your personal account' },
  { login: 'shep-ai', kind: 'org', description: 'The Shep AI organization' },
  { login: 'acme-corp', kind: 'org', description: 'ACME Corporation' },
];

const meta: Meta<typeof PublishToGitHubModal> = {
  title: 'ApplicationPage/PublishToGitHubModal',
  component: PublishToGitHubModal,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof meta>;

function Wrapper({
  initialOwners,
  startOpen = true,
  defaultRepoName = 'my-cool-app',
  failNext = false,
}: {
  initialOwners: PublishOwner[];
  startOpen?: boolean;
  defaultRepoName?: string;
  failNext?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div className="space-y-4">
      <Button onClick={() => setOpen(true)}>Open modal</Button>
      <PublishToGitHubModal
        open={open}
        onOpenChange={setOpen}
        owners={initialOwners}
        defaultRepoName={defaultRepoName}
        onSubmit={async () => {
          if (failNext) {
            throw new Error('Repository "my-cool-app" already exists on octocat.');
          }
        }}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <Wrapper initialOwners={owners} />,
};

export const SingleOwner: Story = {
  render: () => <Wrapper initialOwners={owners.slice(0, 1)} defaultRepoName="snake-game" />,
};

export const SubmissionError: Story = {
  render: () => <Wrapper initialOwners={owners} failNext />,
};

export const Closed: Story = {
  render: () => <Wrapper initialOwners={owners} startOpen={false} />,
};
