import type { Meta, StoryObj } from '@storybook/react';
import { WorktreeSettingsSection } from './worktree-settings-section';

const meta: Meta<typeof WorktreeSettingsSection> = {
  title: 'Settings/WorktreeSettingsSection',
  component: WorktreeSettingsSection,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof WorktreeSettingsSection>;

/** Default: nothing configured, so Shep uses the built-in `git worktree add`. */
export const Default: Story = {
  args: {
    worktree: undefined,
  },
};

/** A monorepo symlinking the root `node_modules` into every new worktree. */
export const MonorepoSymlink: Story = {
  args: {
    worktree: {
      postCreateCommand: 'ln -s "$SHEP_REPO_PATH/node_modules" node_modules',
    },
  },
};

/** A wrapper tool fully replacing `git worktree add`. */
export const CustomCreateTool: Story = {
  args: {
    worktree: {
      createCommand: 'my-monorepo-tool worktree add "$SHEP_WORKTREE_PATH" "$SHEP_BRANCH"',
      postCreateCommand: 'pnpm install --offline',
      commandTimeoutMs: 900000,
    },
  },
};

/**
 * Loading: the section renders its saved values immediately and only shows a
 * "Saving..." indicator while a change is in flight, so there is no separate
 * skeleton state — this is the section as it appears before any edit.
 */
export const Loading: Story = {
  args: {
    worktree: {
      createCommand: '',
      postCreateCommand: '',
    },
  },
};

/**
 * Error: a failing save surfaces as a toast (see `updateSettingsAction`), which
 * Storybook mocks out — the section itself keeps the user's typed value so the
 * command is never lost.
 */
export const Error: Story = {
  args: {
    worktree: {
      createCommand: 'command-that-will-fail-to-save',
    },
  },
};
