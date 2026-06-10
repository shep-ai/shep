import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { within, userEvent, fn } from '@storybook/test';
import { GitHubImportDialog } from './github-import-dialog';
import { Button } from '@/components/ui/button';

const meta: Meta<typeof GitHubImportDialog> = {
  title: 'Composed/GitHubImportDialog',
  component: GitHubImportDialog,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof GitHubImportDialog>;

const logImportComplete = fn().mockName('onImportComplete');

function DialogTrigger({ label = 'Import from GitHub' }: { label?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <GitHubImportDialog
        open={open}
        onOpenChange={setOpen}
        onImportComplete={(repo) => {
          logImportComplete(repo);
          setOpen(false);
        }}
      />
    </>
  );
}

/** Default — click button to open the dialog. URL tab is shown by default. */
export const Default: Story = {
  render: () => <DialogTrigger />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Import from GitHub' }));
  },
};

/** URL tab — dialog opens with URL input focused, ready for a GitHub URL. */
export const URLTab: Story = {
  render: () => <DialogTrigger label="Open URL Tab" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open URL Tab' }));

    const body = within(canvasElement.ownerDocument.body);
    const urlInput = await body.findByPlaceholderText(
      'owner/repo or https://github.com/owner/repo'
    );
    await userEvent.type(urlInput, 'facebook/react');
  },
};

/** Browse tab — switches to the repository browser with search and list. */
export const BrowseTab: Story = {
  render: () => <DialogTrigger label="Open Browse Tab" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Open Browse Tab' }));

    const body = within(canvasElement.ownerDocument.body);
    const browseTab = await body.findByRole('tab', { name: 'Browse' });
    await userEvent.click(browseTab);
  },
};

/** Pre-opened — dialog starts open for visual inspection without interaction. */
export const PreOpened: Story = {
  args: {
    open: true,
    onOpenChange: fn().mockName('onOpenChange'),
    onImportComplete: fn().mockName('onImportComplete'),
  },
};
