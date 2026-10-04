import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { KnowledgeDocumentsPanel } from '@/components/features/knowledge/knowledge-documents-panel';

const T = new Date('2026-10-01T10:00:00Z');

describe('KnowledgeDocumentsPanel', () => {
  it('lists each space with links back to its documents', () => {
    render(
      <KnowledgeDocumentsPanel
        groups={[
          {
            space: { id: 's-acme', name: 'Acme' },
            documents: [
              {
                id: 'd1',
                sourceId: 'src',
                title: 'Release process',
                url: 'https://notion.so/release',
                productLineId: 'pl-pay',
                pageEditedAt: T,
              },
            ],
          },
        ]}
        productLines={{ 'pl-pay': 'Payments' }}
      />
    );
    const group = within(screen.getByTestId('knowledge-space-s-acme'));
    expect(group.getByText('Acme')).toBeInTheDocument();
    expect(group.getByRole('link', { name: /Release process/ })).toHaveAttribute(
      'href',
      'https://notion.so/release'
    );
    expect(group.getByText('Payments')).toBeInTheDocument();
  });

  it('points to Connections when there is no team knowledge yet', () => {
    render(<KnowledgeDocumentsPanel groups={[]} productLines={{}} />);
    expect(screen.getByTestId('knowledge-empty')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Connections/ })).toHaveAttribute(
      'href',
      '/connections'
    );
  });
});
