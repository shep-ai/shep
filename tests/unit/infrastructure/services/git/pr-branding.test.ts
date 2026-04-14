import { describe, it, expect } from 'vitest';
import {
  PR_BRANDING,
  COMMIT_CO_AUTHOR,
  applyPrBranding,
  applyCommitBranding,
} from '@/infrastructure/services/git/pr-branding.js';

describe('PR_BRANDING', () => {
  it('should contain the Shep branding text', () => {
    expect(PR_BRANDING).toContain('Shep');
    expect(PR_BRANDING).toContain('https://github.com/shep-ai/shep');
  });
});

describe('COMMIT_CO_AUTHOR', () => {
  it('should contain Shep Bot attribution', () => {
    expect(COMMIT_CO_AUTHOR).toContain('Shep Bot');
    expect(COMMIT_CO_AUTHOR).toContain('shep-agent@users.noreply.github.com');
  });

  it('should not contain Claude attribution', () => {
    expect(COMMIT_CO_AUTHOR).not.toContain('Claude');
    expect(COMMIT_CO_AUTHOR).not.toContain('anthropic');
  });
});

describe('applyPrBranding', () => {
  it('should append Shep branding to a plain body', () => {
    const result = applyPrBranding('## Summary\n\nSome changes');
    expect(result).toContain('## Summary');
    expect(result).toContain('Some changes');
    expect(result.endsWith(PR_BRANDING)).toBe(true);
  });

  it('should strip Claude Code branding and add Shep branding', () => {
    const body =
      '## Summary\n\nSome changes\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)';
    const result = applyPrBranding(body);
    expect(result).not.toContain('Claude Code');
    expect(result).not.toContain('claude.com');
    expect(result).toContain(PR_BRANDING);
  });

  it('should strip Claude Code branding without emoji prefix', () => {
    const body =
      '## Summary\n\nSome changes\n\nGenerated with [Claude Code](https://claude.com/claude-code)';
    const result = applyPrBranding(body);
    expect(result).not.toContain('Claude Code');
    expect(result).toContain(PR_BRANDING);
  });

  it('should strip Claude Co-Authored-By trailers from PR body', () => {
    const body = '## Summary\n\nSome changes\n\nCo-Authored-By: Claude <noreply@anthropic.com>';
    const result = applyPrBranding(body);
    expect(result).not.toContain('Claude');
    expect(result).not.toContain('anthropic.com');
    expect(result).toContain(PR_BRANDING);
  });

  it('should strip Claude Opus Co-Authored-By trailers from PR body', () => {
    const body =
      '## Summary\n\nSome changes\n\nCo-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>';
    const result = applyPrBranding(body);
    expect(result).not.toContain('Claude Opus');
    expect(result).not.toContain('anthropic.com');
    expect(result).toContain(PR_BRANDING);
  });

  it('should not duplicate branding if already present', () => {
    const body = `## Summary\n\nSome changes\n\n${PR_BRANDING}`;
    const result = applyPrBranding(body);
    const count = result.split(PR_BRANDING).length - 1;
    expect(count).toBe(1);
  });

  it('should handle empty body', () => {
    const result = applyPrBranding('');
    expect(result).toContain(PR_BRANDING);
  });

  it('should replace Claude Code branding when mixed with other content', () => {
    const body = [
      '## Summary',
      '',
      'Added a feature',
      '',
      '## Test Plan',
      '',
      '- [x] Unit tests pass',
      '',
      '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
    ].join('\n');

    const result = applyPrBranding(body);
    expect(result).not.toContain('Claude Code');
    expect(result).toContain('## Test Plan');
    expect(result.endsWith(PR_BRANDING)).toBe(true);
  });

  it('should trim trailing whitespace before appending branding', () => {
    const result = applyPrBranding('Some content   \n\n\n');
    expect(result).toBe(`Some content\n\n${PR_BRANDING}`);
  });
});

describe('applyCommitBranding', () => {
  it('should append Shep Bot co-author to a plain commit message', () => {
    const result = applyCommitBranding('feat(cli): add status command');
    expect(result).toContain('feat(cli): add status command');
    expect(result).toContain(COMMIT_CO_AUTHOR);
  });

  it('should strip Claude co-author and add Shep Bot co-author', () => {
    const message =
      'feat(cli): add status command\n\nCo-Authored-By: Claude <noreply@anthropic.com>';
    const result = applyCommitBranding(message);
    expect(result).not.toContain('Claude');
    expect(result).not.toContain('anthropic.com');
    expect(result).toContain(COMMIT_CO_AUTHOR);
  });

  it('should strip Claude Opus co-author trailer', () => {
    const message =
      'feat(web): add dark mode\n\nCo-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>';
    const result = applyCommitBranding(message);
    expect(result).not.toContain('Claude Opus');
    expect(result).not.toContain('anthropic.com');
    expect(result).toContain(COMMIT_CO_AUTHOR);
  });

  it('should strip Claude Sonnet co-author trailer', () => {
    const message =
      'fix(ci): fix build\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>';
    const result = applyCommitBranding(message);
    expect(result).not.toContain('Claude Sonnet');
    expect(result).not.toContain('anthropic.com');
    expect(result).toContain(COMMIT_CO_AUTHOR);
  });

  it('should not duplicate co-author if already present', () => {
    const message = `feat(cli): add status command\n\n${COMMIT_CO_AUTHOR}`;
    const result = applyCommitBranding(message);
    const count = result.split(COMMIT_CO_AUTHOR).length - 1;
    expect(count).toBe(1);
  });

  it('should handle message with body before co-author', () => {
    const message =
      'feat(cli): add status command\n\nThis adds a new status command.\n\nCo-Authored-By: Claude <noreply@anthropic.com>';
    const result = applyCommitBranding(message);
    expect(result).toContain('This adds a new status command.');
    expect(result).not.toContain('Claude');
    expect(result).toContain(COMMIT_CO_AUTHOR);
  });

  it('should trim trailing whitespace before appending co-author', () => {
    const result = applyCommitBranding('feat(cli): add command   \n\n\n');
    expect(result).toBe(`feat(cli): add command\n\n${COMMIT_CO_AUTHOR}`);
  });
});
