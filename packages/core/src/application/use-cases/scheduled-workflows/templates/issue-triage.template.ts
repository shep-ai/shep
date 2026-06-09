/**
 * Issue Triage Workflow Template
 *
 * Scans open GitHub issues, identifies resolved ones by checking commits and PRs,
 * adds evidence comments, and closes them automatically.
 * Constrained to git and github tools only.
 */

import type { ScheduledWorkflow } from '../../../../domain/generated/output.js';

export type WorkflowTemplateData = Pick<
  ScheduledWorkflow,
  'name' | 'description' | 'prompt' | 'toolConstraints'
>;

export function getIssueTriageTemplate(): WorkflowTemplateData {
  return {
    name: 'issue-triage',
    description:
      'Scan open GitHub issues, identify resolved ones by checking commits and PRs, add evidence comments, and close them automatically.',
    prompt: `You are an automated issue triage agent. Your task is to review all open GitHub issues in this repository and determine which ones have been resolved.

For each open issue:
1. Read the issue title, description, and any labels
2. Search the git log and recent PRs for commits or merges that address the issue
3. If you find evidence that the issue has been resolved (matching commit messages, PR references, or code changes that fix the described problem):
   a. Add a comment to the issue explaining the evidence (link to commit/PR, describe the fix)
   b. Close the issue with a resolution comment
4. If the issue is NOT resolved, skip it silently

Be conservative — only close issues where you have clear evidence of resolution. When in doubt, leave the issue open.

Report a summary of actions taken: how many issues reviewed, how many closed, and which ones.`,
    toolConstraints: ['git', 'github'],
  };
}
