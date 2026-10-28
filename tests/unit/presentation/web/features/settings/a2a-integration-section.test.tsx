import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { A2aIntegrationSection } from '@/components/features/settings/a2a-integration-section';

const CARD = {
  name: 'Shep',
  version: '1.180.0',
  documentationUrl: 'https://github.com/shep-ai/shep/blob/main/docs/guides/a2a.md',
  supportedInterfaces: [
    { url: 'http://localhost:4050/api/a2a', protocolBinding: 'JSONRPC', protocolVersion: '1.0' },
  ],
  skills: [{ id: 'build-feature', name: 'Build a feature' }],
};

function respond(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

describe('A2aIntegrationSection', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the endpoint and version the agent card announces', async () => {
    fetchMock.mockImplementation(() => respond(CARD));
    render(<A2aIntegrationSection shepHome="/home/dev/.shep" />);
    expect(await screen.findByTestId('a2a-endpoint')).toHaveTextContent(
      'http://localhost:4050/api/a2a'
    );
    expect(fetchMock.mock.calls[0][0]).toBe('/.well-known/agent-card.json');
    expect(screen.getByRole('link', { name: /agent-card\.json/ })).toHaveAttribute(
      'href',
      '/.well-known/agent-card.json'
    );
    expect(screen.getByTestId('a2a-card-version')).toHaveTextContent('1.180.0');
  });

  it('says where the token is, never what it is', async () => {
    fetchMock.mockImplementation(() => respond(CARD));
    render(<A2aIntegrationSection shepHome="/home/dev/.shep" />);
    expect(await screen.findByTestId('a2a-token-path')).toHaveTextContent(
      '/home/dev/.shep/web-auth-token'
    );
    expect(screen.getByTestId('a2a-request')).toHaveTextContent(
      `Authorization: Bearer $(cat '/home/dev/.shep/web-auth-token')`
    );
    expect(screen.getByTestId('a2a-request')).toHaveTextContent('"method":"ListTasks"');
  });

  it('joins a Windows shep home with a backslash', async () => {
    fetchMock.mockImplementation(() => respond(CARD));
    render(<A2aIntegrationSection shepHome={'C:\\Users\\dev\\.shep'} />);
    expect(await screen.findByTestId('a2a-token-path')).toHaveTextContent(
      'C:\\Users\\dev\\.shep\\web-auth-token'
    );
  });

  it('copies the request', async () => {
    fetchMock.mockImplementation(() => respond(CARD));
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<A2aIntegrationSection shepHome="/home/dev/.shep" />);
    await screen.findByTestId('a2a-endpoint');
    await user.click(screen.getByRole('button', { name: 'Copy Try it' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('curl -s'));
  });

  it('reports an unreachable agent card', async () => {
    fetchMock.mockImplementation(() => respond({ error: 'nope' }, 500));
    render(<A2aIntegrationSection shepHome="/home/dev/.shep" />);
    await waitFor(() => expect(screen.getByTestId('a2a-card-error')).toBeInTheDocument());
  });

  it('explains Herdr and the terminal commands', async () => {
    fetchMock.mockImplementation(() => respond(CARD));
    render(<A2aIntegrationSection shepHome="/home/dev/.shep" />);
    expect(await screen.findByText(/inside a Herdr pane/)).toBeInTheDocument();
    expect(screen.getByText(/shep feat wait/)).toBeInTheDocument();
  });
});
