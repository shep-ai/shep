/**
 * What the agent addressing review comments is asked and returns (spec 124).
 */

import { PrCommentKind, type Feature, type PrComment } from '../../../domain/generated/output.js';

/** How the agent handled one comment. */
export enum CommentAction {
  Changed = 'changed',
  Answered = 'answered',
  Declined = 'declined',
}

export interface CommentResponse {
  commentId: string;
  action: CommentAction;
  reply: string;
}

export interface AddressCommentsResult {
  summary: string;
  responses: CommentResponse[];
}

export const ADDRESS_MAX_TURNS = 80;

/** Longest diff hunk shown per comment. */
const MAX_HUNK_CHARS = 2_000;

const STRING = { type: 'string' } as const;

export const ADDRESS_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    summary: STRING,
    responses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          commentId: STRING,
          action: { type: 'string', enum: Object.values(CommentAction) },
          reply: STRING,
        },
        required: ['commentId', 'action', 'reply'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'responses'],
  additionalProperties: false,
} as const;

function describeComment(comment: PrComment): string {
  const where =
    comment.kind === PrCommentKind.Inline
      ? `on ${comment.path ?? '(file unknown)'}${comment.line ? `:${comment.line}` : ''}`
      : comment.kind === PrCommentKind.Review
        ? 'as a review summary'
        : 'on the conversation';
  const hunk = comment.diffHunk
    ? `\nDiff context:\n\`\`\`diff\n${comment.diffHunk.slice(-MAX_HUNK_CHARS)}\n\`\`\``
    : '';
  return `### Comment ${comment.id}\nBy @${comment.author} ${where}:\n\n${comment.body.trim()}${hunk}`;
}

export function buildAddressCommentsPrompt(feature: Feature, comments: PrComment[]): string {
  return `You are working on the pull request for the feature "${feature.name}" on branch
${feature.branch}, checked out in your current directory. Reviewers left the comments below.
Address each one.

${comments.map(describeComment).join('\n\n')}

## How

- Where a comment asks for a change and it is right, make the change. Run the tests around what
  you changed and fix what breaks.
- Where a comment asks a question, answer it from the code.
- Where you disagree, change nothing for it and say why, politely and briefly.
- When you changed files: commit them in one commit with a conventional message (for example
  "fix: address review comments"), then push the branch: \`git push origin ${feature.branch}\`.
  Never force-push, rebase, amend, or change other branches.

## What to return

- summary: one or two sentences on what you did.
- responses: one entry per comment, with its id as commentId, the action ("changed" when you
  changed code for it, "answered" when you answered without changing code, "declined" when you
  disagree), and reply: the reply to post on GitHub, addressed to the reviewer, saying what you
  changed or answering them. Do not mention commit hashes; shep adds them.`;
}
