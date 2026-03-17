import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '@/components/ui/button';
import { FeatureFlagsProvider } from '@/hooks/feature-flags-context';
import { RepositoryDrawer } from './repository-drawer';
import type { RepositoryNodeData } from './repository-node-config';
import { InitRemoteSection } from './init-remote-section';

const meta: Meta<typeof RepositoryDrawer> = {
  title: 'Drawers/Feature/RepositoryDrawer',
  component: RepositoryDrawer,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof RepositoryDrawer>;

const repoData: RepositoryNodeData = {
  id: 'repo-1',
  name: 'shep-ai/cli',
  repositoryPath: '/home/user/shep-ai/cli',
};

function DrawerTrigger({ data, label }: { data: RepositoryNodeData; label: string }) {
  const [selected, setSelected] = useState<RepositoryNodeData | null>(null);

  return (
    <div className="flex h-screen items-start p-4">
      <Button variant="outline" onClick={() => setSelected(data)}>
        {label}
      </Button>
      <RepositoryDrawer data={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

export const Default: Story = {
  render: () => <RepositoryDrawerShellTemplate data={repoData} />,
};

export const LongPath: Story = {
  render: () => (
    <DrawerTrigger
      data={{
        ...repoData,
        repositoryPath: '/home/user/projects/company/some-very-long-path/shep-ai/cli',
      }}
      label="Open Long Path"
    />
  ),
};

export const WithoutPath: Story = {
  render: () => (
    <DrawerTrigger data={{ ...repoData, repositoryPath: undefined }} label="Open Without Path" />
  ),
};

/* ---------------------------------------------------------------------------
 * Shell template — full page context, starts open (matches ReviewDrawerShell pattern)
 * ------------------------------------------------------------------------- */

function RepositoryDrawerShellTemplate({ data }: { data: RepositoryNodeData }) {
  const [selected, setSelected] = useState<RepositoryNodeData | null>(data);

  return (
    <div style={{ height: '100vh', background: '#f8fafc', padding: '2rem' }}>
      <button
        type="button"
        onClick={() => setSelected(data)}
        style={{ padding: '8px 16px', border: '1px solid #ccc', borderRadius: '6px' }}
      >
        Open Drawer
      </button>
      <RepositoryDrawer data={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/** Repository drawer rendered inside a full-page context — starts open. */
export const InDrawer: Story = {
  render: () => <RepositoryDrawerShellTemplate data={repoData} />,
};

/* ---------------------------------------------------------------------------
 * Git operations story — wraps with FeatureFlagsProvider to enable gitRebaseSync
 * ------------------------------------------------------------------------- */

function WithGitOpsTemplate({ data }: { data: RepositoryNodeData }) {
  const [selected, setSelected] = useState<RepositoryNodeData | null>(data);
  const allEnabledFlags = {
    skills: true,
    envDeploy: true,
    debug: true,
    githubImport: true,
    adoptBranch: true,
    gitRebaseSync: true,
    reactFileManager: true,
  };

  return (
    <FeatureFlagsProvider flags={allEnabledFlags}>
      <div style={{ height: '100vh', background: '#f8fafc', padding: '2rem' }}>
        <button
          type="button"
          onClick={() => setSelected(data)}
          style={{ padding: '8px 16px', border: '1px solid #ccc', borderRadius: '6px' }}
        >
          Open Drawer
        </button>
        <RepositoryDrawer data={selected} onClose={() => setSelected(null)} />
      </div>
    </FeatureFlagsProvider>
  );
}

/** Repository drawer with git operations section visible (gitRebaseSync flag enabled). */
export const WithGitOperations: Story = {
  render: () => <WithGitOpsTemplate data={repoData} />,
};

/* ---------------------------------------------------------------------------
 * GitHub remote init stories
 * ------------------------------------------------------------------------- */

const noRemoteData: RepositoryNodeData = {
  id: 'repo-1',
  name: 'my-project',
  repositoryPath: '/home/user/my-project',
  gitInfoStatus: 'ready',
  hasRemote: false,
};

/** Drawer open with no remote configured — init-remote form is visible. */
export const HasNoRemote: Story = {
  render: () => <RepositoryDrawerShellTemplate data={noRemoteData} />,
};

/** Drawer open with a remote already configured — init-remote form is absent. */
export const HasRemote: Story = {
  render: () => <RepositoryDrawerShellTemplate data={{ ...noRemoteData, hasRemote: true }} />,
};

/** Init-remote section in pre-seeded error state. */
export const InitRemoteError: Story = {
  render: () => (
    <div className="bg-background w-72 rounded-lg border p-4">
      <InitRemoteSection
        repositoryId="repo-1"
        repositoryPath="/home/user/my-project"
        _initialErrorMessage="gh CLI not found. Install with: brew install gh"
      />
    </div>
  ),
};

/** Init-remote section in pre-seeded success state. */
export const InitRemoteSuccess: Story = {
  render: () => (
    <div className="bg-background w-72 rounded-lg border p-4">
      <InitRemoteSection
        repositoryId="repo-1"
        repositoryPath="/home/user/my-project"
        _initialSuccessUrl="github.com/example/my-project"
      />
    </div>
  ),
};

/** Static loading skeleton representing the transient loading state. */
export const InitRemoteLoading: Story = {
  render: () => (
    <div className="bg-background w-72 rounded-lg border p-4">
      <div className="mt-4 border-t pt-4">
        <p className="text-muted-foreground mb-3 text-sm font-medium tracking-wide uppercase">
          Set Up GitHub Remote
        </p>
        <div className="pointer-events-none space-y-3 opacity-50">
          <div className="bg-muted h-7 animate-pulse rounded" />
          <div className="bg-muted h-7 animate-pulse rounded" />
          <div className="bg-muted h-7 animate-pulse rounded" />
          <div className="bg-primary/30 h-8 animate-pulse rounded" />
        </div>
      </div>
    </div>
  ),
};
