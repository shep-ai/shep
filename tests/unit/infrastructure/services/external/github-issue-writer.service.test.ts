/**
 * GitHubIssueWriter Octokit Adapter — unit tests
 *
 * Verifies that each port method dispatches to the correct Octokit endpoint
 * with the correct payload, that the adapter resolves its bearer token via
 * the existing GitHub-integration code path (no new auth flow), and that
 * SDK transport errors are translated into `GitHubIssueWriterError`.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

import {
  GitHubIssueWriter,
  type OctokitFactory,
  type TokenResolver,
} from '@/infrastructure/services/external/github-issue-writer.service.js';
import {
  GitHubIssueWriterError,
  type IssueRef,
} from '@/application/ports/output/services/github-issue-writer.interface.js';

interface OctokitDouble {
  issues: {
    addLabels: Mock;
    removeLabel: Mock;
    createComment: Mock;
    addAssignees: Mock;
  };
}

function makeOctokitDouble(overrides?: Partial<OctokitDouble['issues']>): OctokitDouble {
  return {
    issues: {
      addLabels: vi.fn().mockResolvedValue({ status: 200 }),
      removeLabel: vi.fn().mockResolvedValue({ status: 200 }),
      createComment: vi.fn().mockResolvedValue({ status: 201 }),
      addAssignees: vi.fn().mockResolvedValue({ status: 201 }),
      ...overrides,
    },
  };
}

const REF: IssueRef = { owner: 'shep-ai', repo: 'shep', issueNumber: 42 };

describe('GitHubIssueWriter', () => {
  let octokit: OctokitDouble;
  let factory: OctokitFactory;
  let tokenResolver: TokenResolver;
  let writer: GitHubIssueWriter;

  beforeEach(() => {
    octokit = makeOctokitDouble();
    factory = vi.fn().mockReturnValue(octokit);
    tokenResolver = vi.fn().mockResolvedValue('ghp_test_token');
    writer = new GitHubIssueWriter(tokenResolver, factory);
  });

  describe('addLabels', () => {
    it('POSTs labels to the issues addLabels endpoint', async () => {
      await writer.addLabels(REF, ['lane:docs', 'good-first-issue']);

      expect(octokit.issues.addLabels).toHaveBeenCalledOnce();
      expect(octokit.issues.addLabels).toHaveBeenCalledWith({
        owner: 'shep-ai',
        repo: 'shep',
        issue_number: 42,
        labels: ['lane:docs', 'good-first-issue'],
      });
    });

    it('skips the network call when given an empty label list', async () => {
      await writer.addLabels(REF, []);
      expect(octokit.issues.addLabels).not.toHaveBeenCalled();
    });

    it('wraps SDK errors in GitHubIssueWriterError', async () => {
      octokit.issues.addLabels.mockRejectedValueOnce(new Error('rate limit exceeded'));
      await expect(writer.addLabels(REF, ['x'])).rejects.toBeInstanceOf(GitHubIssueWriterError);
    });
  });

  describe('removeLabels', () => {
    it('removes each label individually via the removeLabel endpoint', async () => {
      await writer.removeLabels(REF, ['lane:docs', 'wontfix']);
      expect(octokit.issues.removeLabel).toHaveBeenCalledTimes(2);
      expect(octokit.issues.removeLabel).toHaveBeenNthCalledWith(1, {
        owner: 'shep-ai',
        repo: 'shep',
        issue_number: 42,
        name: 'lane:docs',
      });
      expect(octokit.issues.removeLabel).toHaveBeenNthCalledWith(2, {
        owner: 'shep-ai',
        repo: 'shep',
        issue_number: 42,
        name: 'wontfix',
      });
    });

    it('treats a 404 (label not present) as a no-op rather than failing', async () => {
      const notFound = Object.assign(new Error('Label does not exist'), { status: 404 });
      octokit.issues.removeLabel.mockRejectedValueOnce(notFound);

      await expect(writer.removeLabels(REF, ['gone'])).resolves.toBeUndefined();
    });
  });

  describe('addComment', () => {
    it('POSTs to the issues createComment endpoint', async () => {
      await writer.addComment(REF, 'welcome to shep!');
      expect(octokit.issues.createComment).toHaveBeenCalledWith({
        owner: 'shep-ai',
        repo: 'shep',
        issue_number: 42,
        body: 'welcome to shep!',
      });
    });
  });

  describe('assignUsers', () => {
    it('POSTs to the issues addAssignees endpoint', async () => {
      await writer.assignUsers(REF, ['alice', 'bob']);
      expect(octokit.issues.addAssignees).toHaveBeenCalledWith({
        owner: 'shep-ai',
        repo: 'shep',
        issue_number: 42,
        assignees: ['alice', 'bob'],
      });
    });

    it('skips the network call when given an empty assignee list', async () => {
      await writer.assignUsers(REF, []);
      expect(octokit.issues.addAssignees).not.toHaveBeenCalled();
    });
  });

  describe('auth wiring', () => {
    it('resolves the bearer token via the injected resolver and reuses the client', async () => {
      await writer.addComment(REF, 'one');
      await writer.addComment(REF, 'two');
      expect(tokenResolver).toHaveBeenCalledOnce();
      expect(factory).toHaveBeenCalledOnce();
      expect(factory).toHaveBeenCalledWith({ auth: 'ghp_test_token' });
    });

    it('wraps token resolver failures in GitHubIssueWriterError', async () => {
      (tokenResolver as Mock).mockRejectedValueOnce(new Error('not authenticated'));
      await expect(writer.addLabels(REF, ['x'])).rejects.toBeInstanceOf(GitHubIssueWriterError);
    });
  });
});
