/**
 * Branch Rebase Workflow Template
 *
 * Rebases all tracked shep feature branches on main and resolves merge conflicts.
 * Constrained to git tools only.
 */

import type { WorkflowTemplateData } from './issue-triage.template.js';

export function getBranchRebaseTemplate(): WorkflowTemplateData {
  return {
    name: 'branch-rebase',
    description:
      'Rebase all tracked shep feature branches on the main branch and resolve any merge conflicts.',
    prompt: `You are an automated branch maintenance agent. Your task is to rebase all tracked feature branches in this repository onto the latest main branch.

Steps:
1. Fetch the latest changes from the remote repository
2. Identify all feature branches (branches that start with "feat/" or are tracked by shep)
3. For each feature branch:
   a. Check out the branch
   b. Attempt to rebase it onto main
   c. If the rebase succeeds cleanly, push the rebased branch to the remote
   d. If there are merge conflicts, attempt to resolve them automatically based on the context of the changes
   e. If conflicts cannot be resolved automatically, abort the rebase and report the conflict
4. Return to the main branch when done

Report a summary: how many branches rebased successfully, how many had conflicts, and details of any unresolved conflicts.`,
    toolConstraints: ['git'],
  };
}
