import type { Meta, StoryObj } from '@storybook/react';
import { A2aIntegrationSection, AGENT_CARD_PATH } from './a2a-integration-section';

const CARD = {
  name: 'Shep',
  version: '1.180.0',
  documentationUrl: 'https://github.com/shep-ai/shep/blob/main/docs/guides/a2a.md',
  supportedInterfaces: [
    { url: 'http://localhost:4050/api/a2a', protocolBinding: 'JSONRPC', protocolVersion: '1.0' },
  ],
  skills: [{ id: 'build-feature', name: 'Build a feature' }],
};

type CardStub = { card: typeof CARD } | { status: number } | { pending: true };

function withAgentCard(stub: CardStub) {
  return function AgentCardDecorator(Story: React.FC) {
    const original = window.fetch.bind(window);
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes(AGENT_CARD_PATH)) return original(input, init);
      if ('pending' in stub) return new Promise<Response>(() => undefined);
      if ('status' in stub) return new Response('{}', { status: stub.status });
      return new Response(JSON.stringify(stub.card), {
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof window.fetch;
    return (
      <div className="max-w-2xl">
        <Story />
      </div>
    );
  };
}

const meta: Meta<typeof A2aIntegrationSection> = {
  title: 'Features/Settings/A2aIntegrationSection',
  component: A2aIntegrationSection,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { shepHome: '/home/dev/.shep' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { decorators: [withAgentCard({ card: CARD })] };

export const WindowsHome: Story = {
  args: { shepHome: 'C:\\Users\\dev\\.shep' },
  decorators: [withAgentCard({ card: CARD })],
};

export const Loading: Story = { decorators: [withAgentCard({ pending: true })] };

export const ErrorState: Story = { decorators: [withAgentCard({ status: 503 })] };
