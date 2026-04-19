import { describe, it, expect } from 'vitest';
import {
  parseReviewOutput,
  ReviewOutputParseError,
} from '@/infrastructure/services/code-review/review-output-parser.service.js';

describe('ReviewOutputParser', () => {
  describe('parseReviewOutput', () => {
    it('parses valid JSON input into typed ReviewOutput', () => {
      const input = JSON.stringify({
        summary: 'Found 2 issues in the PR.',
        comments: [
          {
            path: 'src/utils.ts',
            line: 42,
            body: 'Potential null pointer dereference.',
            side: 'RIGHT',
            suggestion: 'if (x != null) { return x; }',
          },
          {
            path: 'src/app.ts',
            line: 10,
            body: 'Unused import.',
          },
        ],
      });

      const result = parseReviewOutput(input);

      expect(result.summary).toBe('Found 2 issues in the PR.');
      expect(result.comments).toHaveLength(2);
      expect(result.comments[0]).toEqual({
        path: 'src/utils.ts',
        line: 42,
        body: 'Potential null pointer dereference.',
        side: 'RIGHT',
        suggestion: 'if (x != null) { return x; }',
      });
      expect(result.comments[1]).toEqual({
        path: 'src/app.ts',
        line: 10,
        body: 'Unused import.',
      });
    });

    it('strips ```json fences from wrapped JSON', () => {
      const input = '```json\n{"summary": "Looks good.", "comments": []}\n```';

      const result = parseReviewOutput(input);

      expect(result.summary).toBe('Looks good.');
      expect(result.comments).toHaveLength(0);
    });

    it('strips bare ``` fences from wrapped JSON', () => {
      const input = '```\n{"summary": "OK.", "comments": []}\n```';

      const result = parseReviewOutput(input);

      expect(result.summary).toBe('OK.');
    });

    it('fixes trailing commas before closing brackets', () => {
      const input = `{
        "summary": "Issues found.",
        "comments": [
          {
            "path": "src/a.ts",
            "line": 5,
            "body": "Bug here.",
          },
        ],
      }`;

      const result = parseReviewOutput(input);

      expect(result.summary).toBe('Issues found.');
      expect(result.comments).toHaveLength(1);
    });

    it('throws for missing summary field', () => {
      const input = JSON.stringify({ comments: [] });

      expect(() => parseReviewOutput(input)).toThrow(ReviewOutputParseError);
      expect(() => parseReviewOutput(input)).toThrow(/summary/);
    });

    it('throws for missing comments array', () => {
      const input = JSON.stringify({ summary: 'Hi' });

      expect(() => parseReviewOutput(input)).toThrow(ReviewOutputParseError);
      expect(() => parseReviewOutput(input)).toThrow(/comments/);
    });

    it('coerces line field from string to number', () => {
      const input = JSON.stringify({
        summary: 'Found issue.',
        comments: [{ path: 'src/a.ts', line: '42', body: 'Bug.' }],
      });

      const result = parseReviewOutput(input);

      expect(result.comments[0].line).toBe(42);
      expect(typeof result.comments[0].line).toBe('number');
    });

    it('throws descriptive error for completely invalid input', () => {
      expect(() => parseReviewOutput('not json at all')).toThrow(ReviewOutputParseError);
      expect(() => parseReviewOutput('not json at all')).toThrow(/Failed to parse JSON/);
    });

    it('throws for empty input', () => {
      expect(() => parseReviewOutput('')).toThrow(ReviewOutputParseError);
      expect(() => parseReviewOutput('  ')).toThrow(ReviewOutputParseError);
    });

    it('accepts empty comments array (valid — no findings)', () => {
      const input = JSON.stringify({
        summary: 'No issues found. The code looks clean.',
        comments: [],
      });

      const result = parseReviewOutput(input);

      expect(result.summary).toBe('No issues found. The code looks clean.');
      expect(result.comments).toHaveLength(0);
    });

    it('handles missing optional fields gracefully', () => {
      const input = JSON.stringify({
        summary: 'One issue.',
        comments: [{ path: 'src/a.ts', line: 10, body: 'Bug.' }],
      });

      const result = parseReviewOutput(input);

      expect(result.comments[0].side).toBeUndefined();
      expect(result.comments[0].suggestion).toBeUndefined();
      expect(result.comments[0].startLine).toBeUndefined();
    });

    it('ignores invalid side values', () => {
      const input = JSON.stringify({
        summary: 'Issue.',
        comments: [{ path: 'src/a.ts', line: 10, body: 'Bug.', side: 'MIDDLE' }],
      });

      const result = parseReviewOutput(input);
      expect(result.comments[0].side).toBeUndefined();
    });

    it('floors decimal line numbers', () => {
      const input = JSON.stringify({
        summary: 'Issue.',
        comments: [{ path: 'src/a.ts', line: 10.7, body: 'Bug.' }],
      });

      const result = parseReviewOutput(input);
      expect(result.comments[0].line).toBe(10);
    });

    it('throws for comment with empty path', () => {
      const input = JSON.stringify({
        summary: 'Issue.',
        comments: [{ path: '', line: 10, body: 'Bug.' }],
      });

      expect(() => parseReviewOutput(input)).toThrow(ReviewOutputParseError);
      expect(() => parseReviewOutput(input)).toThrow(/path/);
    });

    it('throws for comment with zero or negative line', () => {
      const input = JSON.stringify({
        summary: 'Issue.',
        comments: [{ path: 'src/a.ts', line: 0, body: 'Bug.' }],
      });

      expect(() => parseReviewOutput(input)).toThrow(ReviewOutputParseError);
    });

    it('throws for comment with empty body', () => {
      const input = JSON.stringify({
        summary: 'Issue.',
        comments: [{ path: 'src/a.ts', line: 10, body: '' }],
      });

      expect(() => parseReviewOutput(input)).toThrow(ReviewOutputParseError);
      expect(() => parseReviewOutput(input)).toThrow(/body/);
    });

    it('ignores empty suggestion strings', () => {
      const input = JSON.stringify({
        summary: 'Issue.',
        comments: [{ path: 'src/a.ts', line: 10, body: 'Bug.', suggestion: '' }],
      });

      const result = parseReviewOutput(input);
      expect(result.comments[0].suggestion).toBeUndefined();
    });

    it('handles startLine coercion', () => {
      const input = JSON.stringify({
        summary: 'Issue.',
        comments: [{ path: 'src/a.ts', line: 15, body: 'Multi-line issue.', startLine: '10' }],
      });

      const result = parseReviewOutput(input);
      expect(result.comments[0].startLine).toBe(10);
    });
  });
});
