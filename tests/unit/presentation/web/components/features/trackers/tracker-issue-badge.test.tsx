import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrackerIssueBadge } from '@/components/features/trackers/tracker-issue-badge';

describe('TrackerIssueBadge', () => {
  it('links the issue key to the tracker in a new tab', () => {
    render(<TrackerIssueBadge issueKey="ENG-42" url="https://linear.app/acme/issue/ENG-42" />);
    const link = screen.getByRole('link', { name: /ENG-42/ });
    expect(link).toHaveAttribute('href', 'https://linear.app/acme/issue/ENG-42');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAttribute('title', 'Open ENG-42 in the tracker');
  });
});
