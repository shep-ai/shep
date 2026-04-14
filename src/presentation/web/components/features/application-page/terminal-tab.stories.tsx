import type { Meta, StoryObj } from '@storybook/react';
import { TerminalTab } from './terminal-tab';

/**
 * TerminalTab renders an xterm.js-backed pane that POSTs to `/api/terminal`
 * to create a PTY session. Storybook has no backend, so the component will
 * fall into its `error` status after the fetch rejects — which is itself a
 * useful visual state to snapshot. We wrap in a fixed-size container so the
 * xterm FitAddon has layout to measure.
 */
const meta: Meta<typeof TerminalTab> = {
  title: 'ApplicationPage/TerminalTab',
  component: TerminalTab,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ height: 400, width: 720, display: 'flex', flexDirection: 'column' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof TerminalTab>;

export const Default: Story = {
  args: {
    cwd: '/home/user/projects/my-app',
  },
};

export const Disconnected: Story = {
  args: {
    // The session fetch will fail in Storybook (no backend), so this
    // will render the "error" banner surface — which is the exact
    // state a disconnected terminal presents in production.
    cwd: '/nonexistent/path',
  },
};
