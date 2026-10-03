import type { Meta, StoryObj } from '@storybook/react';
import { ChunkVisibility } from '@shepai/core/domain/generated/output';
import { HarnessChunkViewer } from './harness-chunk-viewer';

const meta: Meta<typeof HarnessChunkViewer> = {
  title: 'Harness/HarnessChunkViewer',
  component: HarnessChunkViewer,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HarnessChunkViewer>;

/** Open on a search result; switch levels to re-render from stored output. */
export const Open: Story = {
  args: {
    chunkId: 'c-search',
    label: "search 'refresh'",
    initialLevel: ChunkVisibility.Long,
    onClose: () => undefined,
  },
};

/** Closed (renders nothing). */
export const Closed: Story = { args: { chunkId: null, onClose: () => undefined } };
