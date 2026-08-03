import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { BulkImportDialog } from './bulk-import-dialog';
import { Button } from '@/components/ui/button';

type Scenario = 'default' | 'loading' | 'error' | 'empty' | 'allTracked' | 'partialFailure';

const meta: Meta<typeof BulkImportDialog> = {
  title: 'Composed/BulkImportDialog',
  component: BulkImportDialog,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof BulkImportDialog>;

const logImportComplete = fn().mockName('onImportComplete');

/**
 * Harness that pins the mocked server-action scenario before opening the
 * dialog, so each story exercises a distinct state of the same component.
 */
function DialogHarness({
  scenario,
  startOpen = true,
}: {
  scenario: Scenario;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (globalThis as { __storybookBulkImportScenario?: Scenario }).__storybookBulkImportScenario =
      scenario;
    if (startOpen) setOpen(true);
  }, [scenario, startOpen]);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Import repositories
      </Button>
      <BulkImportDialog
        open={open}
        onOpenChange={setOpen}
        directoryPath="/Users/dev/Code"
        onImportComplete={logImportComplete}
      />
    </>
  );
}

/** Default — a realistic mix of git repos, a plain folder, a previously removed repo, and one already tracked. */
export const Default: Story = {
  render: () => <DialogHarness scenario="default" />,
};

/** Loading — the folder is still being read. */
export const Loading: Story = {
  render: () => <DialogHarness scenario="loading" />,
};

/** Error — the directory could not be read. */
export const Error: Story = {
  render: () => <DialogHarness scenario="error" />,
};

/** Empty — the chosen folder has no subfolders at all. */
export const Empty: Story = {
  render: () => <DialogHarness scenario="empty" />,
};

/** All already tracked — nothing left to import, so the submit button stays disabled. */
export const AllAlreadyTracked: Story = {
  render: () => <DialogHarness scenario="allTracked" />,
};

/** Partial failure — one path fails and its error is surfaced inline instead of closing the dialog. */
export const PartialFailure: Story = {
  render: () => <DialogHarness scenario="partialFailure" />,
};
