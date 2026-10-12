import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CoordinationAction } from '@shepai/core/domain/generated/output';
import { CoordinationNote } from '@/components/common/coordination-note';

const base = {
  rationale: 'Both rewrite the session refresh path; let tokens land first.',
  peerName: 'Rotate refresh tokens',
  overlappingPaths: ['src/auth/session.ts', 'src/auth/token.ts'],
  decidedAt: new Date('2026-10-12T10:00:00.000Z').getTime(),
};

describe('CoordinationNote', () => {
  it('says the feature waits for its peer and why, after a defer', () => {
    render(<CoordinationNote coordination={{ ...base, action: CoordinationAction.Defer }} />);
    expect(screen.getByTestId('coordination-note')).toBeInTheDocument();
    expect(screen.getByTestId('coordination-note-headline')).toHaveTextContent(
      'Waits for Rotate refresh tokens'
    );
    expect(screen.getByTestId('coordination-note-rationale')).toHaveTextContent(base.rationale);
  });

  it('says the feature runs alongside its peer after a continue', () => {
    render(<CoordinationNote coordination={{ ...base, action: CoordinationAction.Continue }} />);
    expect(screen.getByTestId('coordination-note-headline')).toHaveTextContent(
      'Runs alongside Rotate refresh tokens'
    );
  });

  it('lists the files both features changed', () => {
    render(<CoordinationNote coordination={{ ...base, action: CoordinationAction.Defer }} />);
    const paths = screen.getByTestId('coordination-note-paths');
    expect(paths).toHaveTextContent('Shared files (2)');
    expect(paths).toHaveTextContent('src/auth/session.ts');
    expect(paths).toHaveTextContent('src/auth/token.ts');
  });

  it('falls back to a generic peer label when the peer was deleted', () => {
    render(
      <CoordinationNote
        coordination={{ ...base, peerName: undefined, action: CoordinationAction.Defer }}
      />
    );
    expect(screen.getByTestId('coordination-note-headline')).toHaveTextContent(
      'Waits for another feature'
    );
  });
});
