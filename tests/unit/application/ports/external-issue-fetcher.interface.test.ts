/**
 * External Issue Fetcher Interface Type Contract Tests
 *
 * Validates that the IExternalIssueFetcher interface and associated types
 * compile correctly and their type contracts are sound.
 *
 * TDD Phase: RED
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import type {
  IExternalIssueFetcher,
  ExternalIssue,
} from '@/application/ports/output/services/external-issue-fetcher.interface.js';
import {
  IssueFetcherError,
  IssueNotFoundError,
  IssueAuthenticationError,
  IssueServiceUnavailableError,
} from '@/application/ports/output/services/external-issue-fetcher.interface.js';

describe('IExternalIssueFetcher type contracts', () => {
  it('should define fetchGitHubIssue method returning Promise<ExternalIssue>', () => {
    const mockFetcher: IExternalIssueFetcher = {
      fetchGitHubIssue: async (_ref: string) => ({
        title: 'Fix bug',
        description: 'Some description',
        labels: ['bug'],
        url: 'https://github.com/owner/repo/issues/1',
        source: 'github' as const,
      }),
      fetchJiraTicket: async (_key: string) => ({
        title: 'PROJ-123',
        description: 'Jira description',
        labels: ['task'],
        url: 'https://jira.example.com/browse/PROJ-123',
        source: 'jira' as const,
      }),
      getMergedPrCount: async () => 0,
      listIssuesByLabel: async () => [],
      listIssuesByLabels: async () => [],
    };
    expect(mockFetcher.fetchGitHubIssue).toBeDefined();
    expect(mockFetcher.fetchJiraTicket).toBeDefined();
    expect(mockFetcher.getMergedPrCount).toBeDefined();
    expect(mockFetcher.listIssuesByLabel).toBeDefined();
    expect(mockFetcher.listIssuesByLabels).toBeDefined();
  });

  it('should define ExternalIssue with required fields', () => {
    const issue: ExternalIssue = {
      title: 'Add user auth',
      description: 'Implement OAuth 2.0',
      labels: ['feature', 'auth'],
      url: 'https://github.com/org/repo/issues/42',
      source: 'github',
    };
    expect(issue.title).toBe('Add user auth');
    expect(issue.description).toBe('Implement OAuth 2.0');
    expect(issue.labels).toEqual(['feature', 'auth']);
    expect(issue.url).toBe('https://github.com/org/repo/issues/42');
    expect(issue.source).toBe('github');
  });

  it('should define ExternalIssue source as github or jira', () => {
    const githubIssue: ExternalIssue = {
      title: 'GH Issue',
      description: '',
      labels: [],
      url: '',
      source: 'github',
    };
    const jiraIssue: ExternalIssue = {
      title: 'Jira Issue',
      description: '',
      labels: [],
      url: '',
      source: 'jira',
    };
    expect(githubIssue.source).toBe('github');
    expect(jiraIssue.source).toBe('jira');
  });

  it('should define error types extending IssueFetcherError', () => {
    const notFound = new IssueNotFoundError('Issue #42 not found');
    const authError = new IssueAuthenticationError('Bad credentials');
    const unavailable = new IssueServiceUnavailableError('gh CLI not installed');

    expect(notFound).toBeInstanceOf(IssueFetcherError);
    expect(notFound).toBeInstanceOf(IssueNotFoundError);
    expect(notFound.message).toBe('Issue #42 not found');

    expect(authError).toBeInstanceOf(IssueFetcherError);
    expect(authError).toBeInstanceOf(IssueAuthenticationError);

    expect(unavailable).toBeInstanceOf(IssueFetcherError);
    expect(unavailable).toBeInstanceOf(IssueServiceUnavailableError);
  });
});
