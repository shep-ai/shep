import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '@/components/ui/button';
import { RepositoryDeleteDialog } from './repository-delete-dialog';

const meta: Meta<typeof RepositoryDeleteDialog> = {
  title: 'Common/RepositoryDeleteDialog',
  component: RepositoryDeleteDialog,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof RepositoryDeleteDialog>;

const REPOSITORY_NAME = 'shep-ai/shep';

interface HarnessProps {
  error?: string;
  busy?: boolean;
}

/** Keeps the dialog open so the destructive choice is inspectable. */
function Harness({ error, busy }: HarnessProps) {
  const [open, setOpen] = useState(true);
  const [confirmed, setConfirmed] = useState<boolean | null>(null);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Remove repository
      </Button>
      {confirmed !== null ? (
        <p className="text-muted-foreground mt-2 text-xs">
          Confirmed with deleteFromDisk: {String(confirmed)}
        </p>
      ) : null}
      <RepositoryDeleteDialog
        open={open}
        onOpenChange={setOpen}
        repositoryName={REPOSITORY_NAME}
        onConfirm={({ deleteFromDisk }) => {
          setConfirmed(deleteFromDisk);
          setOpen(false);
        }}
        {...(error !== undefined && { error })}
        {...(busy !== undefined && { busy })}
      />
    </>
  );
}

/** Default — untracking only; the working copy stays on disk. */
export const Default: Story = {
  render: () => <Harness />,
};

/** Loading — deletion in flight, so both choices are locked. */
export const Loading: Story = {
  render: () => <Harness busy />,
};

/** Error — the delete failed, and the dialog stays open so the reason is readable. */
export const ErrorState: Story = {
  render: () => <Harness error="Repository has a running dev server" />,
};
