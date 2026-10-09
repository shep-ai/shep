/**
 * ProviderList — the cloud-provider switcher inside the Deploy panel.
 *
 * Spec 133 removed the placeholder providers, so every listed provider is
 * actionable: no row is disabled and no "Coming soon" badge renders.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CloudDeploymentProvider } from '@shepai/core/domain/generated/output';
import { ProviderList } from '@/components/features/application-page/provider-list';

const CLOUDFLARE = {
  id: CloudDeploymentProvider.CloudflarePages,
  displayName: 'Cloudflare Pages',
};

function renderList(connected: boolean) {
  const onSelectConnected = vi.fn();
  const onSelectDisconnected = vi.fn();
  render(
    <ProviderList
      providers={[{ ...CLOUDFLARE, connected }]}
      selectedProvider={null}
      onSelectConnected={onSelectConnected}
      onSelectDisconnected={onSelectDisconnected}
    />
  );
  return { onSelectConnected, onSelectDisconnected };
}

describe('ProviderList', () => {
  it('renders Cloudflare Pages as an actionable row without a coming-soon badge', () => {
    renderList(false);

    const row = screen.getByRole('button', { name: /Cloudflare Pages/ });
    expect(row).not.toBeDisabled();
    expect(row.textContent).toMatch(/Not connected/i);
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });

  it('opens the connect flow for a provider without a token', () => {
    const { onSelectConnected, onSelectDisconnected } = renderList(false);

    fireEvent.click(screen.getByRole('button', { name: /Cloudflare Pages/ }));

    expect(onSelectDisconnected).toHaveBeenCalledWith(CloudDeploymentProvider.CloudflarePages);
    expect(onSelectConnected).not.toHaveBeenCalled();
  });

  it('deploys straight away for a connected provider', () => {
    const { onSelectConnected, onSelectDisconnected } = renderList(true);

    const row = screen.getByRole('button', { name: /Cloudflare Pages/ });
    expect(row.textContent).toMatch(/Connected/);
    fireEvent.click(row);

    expect(onSelectConnected).toHaveBeenCalledWith(CloudDeploymentProvider.CloudflarePages);
    expect(onSelectDisconnected).not.toHaveBeenCalled();
  });

  it('does not offer a provider switcher when Cloudflare Pages is the only provider', () => {
    renderList(true);

    expect(screen.queryByRole('button', { name: /Change provider/i })).toBeNull();
  });
});
