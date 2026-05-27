import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import webI18n from '@/lib/i18n';
import { AgentEditorTabs } from '@/components/agent-editor/agent-editor-tabs';
import {
  AgentGraphView,
  type AgentGraphDescriptor,
} from '@/components/agent-editor/agent-graph-view';
import { AgentList } from '@/components/agent-editor/agent-list';
import { CreateAgentDialog } from '@/components/agent-editor/create-agent-dialog';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const graph: AgentGraphDescriptor = {
  agentType: 'feature-agent',
  nodes: [{ id: 'plan', label: 'Plan' }],
  edges: [],
};

describe('agent editor i18n', () => {
  beforeEach(async () => {
    await act(async () => {
      await webI18n.changeLanguage('en');
    });
  });

  it('updates AgentEditorTabs labels when the locale changes', async () => {
    render(
      <AgentEditorTabs
        agentType="feature-agent"
        prompts={[promptEntry('system', 'System'), promptEntry('review', 'Review')]}
        graph={graph}
      />
    );

    expect(screen.getByRole('tab', { name: 'Graph' })).toBeInTheDocument();

    await act(async () => {
      await webI18n.changeLanguage('fr');
    });

    expect(
      screen.getByRole('tab', { name: webI18n.t('agentEditor.graph', { ns: 'web' }) })
    ).toBeInTheDocument();
  });

  it('updates AgentList text when the locale changes', async () => {
    render(
      <AgentList
        agents={[
          {
            agentType: 'custom-agent',
            displayName: 'Custom Agent',
            isCustom: true,
            promptCount: 2,
            overrideCount: 1,
          },
        ]}
      />
    );

    expect(screen.getByText('Custom')).toBeInTheDocument();

    await act(async () => {
      await webI18n.changeLanguage('fr');
    });

    expect(screen.getByText(webI18n.t('agentEditor.custom', { ns: 'web' }))).toBeInTheDocument();
    expect(screen.getByText(webI18n.t('agentEditor.edit', { ns: 'web' }))).toBeInTheDocument();
  });

  it('updates AgentGraphView controls when the locale changes', async () => {
    render(<AgentGraphView graph={graph} initialEditing />);

    expect(screen.getByRole('button', { name: /Add node/i })).toBeInTheDocument();

    await act(async () => {
      await webI18n.changeLanguage('fr');
    });

    expect(
      screen.getByRole('button', { name: webI18n.t('agentEditor.addNode', { ns: 'web' }) })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: webI18n.t('agentEditor.saveGraph', { ns: 'web' }) })
    ).toBeInTheDocument();
  });

  it('updates CreateAgentDialog text when the locale changes', async () => {
    render(<CreateAgentDialog initialOpen />);

    expect(screen.getByRole('heading', { name: 'Create custom agent' })).toBeInTheDocument();

    await act(async () => {
      await webI18n.changeLanguage('fr');
    });

    expect(
      screen.getByRole('heading', {
        name: webI18n.t('agentEditor.createCustomAgent', { ns: 'web' }),
      })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(webI18n.t('agentEditor.stableTypeId', { ns: 'web' }))
    ).toBeInTheDocument();
  });
});

function promptEntry(promptId: string, name: string) {
  return {
    agentType: 'feature-agent',
    promptId,
    name,
    description: `${name} prompt`,
    bundledBody: '',
    effectiveBody: '',
    hasOverride: false,
  };
}
