import type { Meta, StoryObj } from '@storybook/react';
import { SmartDeployButton } from './smart-deploy-button';
import type { SmartDeployState } from '@/hooks/use-smart-deploy-state';

const baseState: SmartDeployState = {
  kind: 'deploy',
  changeCount: 0,
  hasCloud: true,
  hasRemote: true,
  liveUrl: null,
  errorMessage: null,
  failedSource: null,
};

function PlaceholderPanel({ label }: { label: string }) {
  return (
    <div className="border-border bg-background w-[360px] rounded-md border p-4 text-xs">
      <div className="text-muted-foreground mb-2 text-[10px] tracking-wide uppercase">
        Deploy panel
      </div>
      <div>This is a placeholder for the {label} state panel.</div>
    </div>
  );
}

const meta: Meta<typeof SmartDeployButton> = {
  title: 'ApplicationPage/SmartDeployButton',
  component: SmartDeployButton,
  parameters: { layout: 'centered' },
};
export default meta;

type Story = StoryObj<typeof SmartDeployButton>;

const noop = () => undefined;

export const Loading: Story = {
  args: {
    state: { ...baseState, kind: 'loading' },
    onPrimaryClick: noop,
    panel: <PlaceholderPanel label="loading" />,
  },
};

export const GetOnline: Story = {
  args: {
    state: { ...baseState, kind: 'getOnline', hasRemote: false, hasCloud: false },
    onPrimaryClick: noop,
    panel: <PlaceholderPanel label="get online" />,
  },
};

export const Deploy: Story = {
  args: {
    state: { ...baseState, kind: 'deploy' },
    onPrimaryClick: noop,
    panel: <PlaceholderPanel label="deploy" />,
  },
};

export const Save: Story = {
  args: {
    state: { ...baseState, kind: 'save', changeCount: 3, hasCloud: false },
    onPrimaryClick: noop,
    panel: <PlaceholderPanel label="save" />,
  },
};

export const PushAndDeploy: Story = {
  args: {
    state: { ...baseState, kind: 'pushAndDeploy', changeCount: 5 },
    onPrimaryClick: noop,
    panel: <PlaceholderPanel label="push and deploy" />,
  },
};

export const Working: Story = {
  args: {
    state: { ...baseState, kind: 'working' },
    onPrimaryClick: noop,
    panel: <PlaceholderPanel label="working" />,
  },
};

export const Live: Story = {
  args: {
    state: {
      ...baseState,
      kind: 'live',
      liveUrl: 'https://landing-page-hero-features-pricing-85f4e3.pages.dev',
    },
    onPrimaryClick: noop,
    panel: <PlaceholderPanel label="live" />,
  },
};

export const Failed: Story = {
  args: {
    state: {
      ...baseState,
      kind: 'failed',
      errorMessage: 'Push rejected by GitHub',
      failedSource: 'sync',
    },
    onPrimaryClick: noop,
    panel: <PlaceholderPanel label="failed" />,
  },
};

export const LiveWithDirtyChanges: Story = {
  args: {
    // After deploy, user has made local edits — Live label still shows but
    // a tiny dirty dot signals the drift.
    state: { ...baseState, kind: 'live', changeCount: 2, liveUrl: 'https://my-app.pages.dev' },
    onPrimaryClick: noop,
    panel: <PlaceholderPanel label="live with drift" />,
  },
};
