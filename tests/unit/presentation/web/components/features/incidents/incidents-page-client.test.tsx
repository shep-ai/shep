import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IncidentsPageClient } from '@/components/features/incidents/incidents-page-client';
import {
  CHECKOUT,
  DETAIL,
  SEARCH,
  SPACES,
} from '@/components/features/incidents/incidents-fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/actions/incidents', () => ({}));

describe('IncidentsPageClient (spec 129)', () => {
  it('lists the space incidents with the selected one in full', () => {
    render(
      <IncidentsPageClient
        spaces={SPACES}
        space={SPACES[0]}
        incidents={[CHECKOUT, SEARCH]}
        selected={DETAIL}
      />
    );
    expect(screen.getByTestId(`incident-row-${CHECKOUT.id}`)).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByTestId(`incident-row-${SEARCH.id}`)).toHaveAttribute(
      'href',
      `/incidents?space=acme&incident=${SEARCH.id}`
    );
    expect(screen.getByTestId('incident-detail')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Acme' })).toHaveAttribute('aria-current', 'page');
  });

  it('says when the space has no incidents', () => {
    render(<IncidentsPageClient spaces={SPACES} space={SPACES[0]} incidents={[]} />);
    expect(screen.getByTestId('incidents-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('incident-detail')).not.toBeInTheDocument();
  });

  it('shows why the page could not load', () => {
    render(<IncidentsPageClient spaces={SPACES} loadError='No space "nowhere".' />);
    expect(screen.getByTestId('incidents-error')).toHaveTextContent('nowhere');
    expect(screen.queryByTestId('open-incident-title')).not.toBeInTheDocument();
  });
});
