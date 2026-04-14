/**
 * Merge Node Prompt Builders
 *
 * Builds prompts for agent calls in the merge node:
 * 1. buildCommitPushPrPrompt — commit (always), push (conditional), PR create (conditional)
 * 2. buildCiWatchFixPrompt — diagnose and fix CI failures
 *
 * NOTE: The actual PR merge and local squash-merge are handled directly by
 * GitPrService.mergePr() and GitPrService.localMergeSquash() — not via agent prompts.
 */

import yaml from 'js-yaml';
import { EvidenceType, type Evidence } from '@/domain/generated/output.js';
import { readSpecFile, buildResumeContext } from '../node-helpers.js';
import type { FeatureAgentState } from '../../state.js';
import { PR_BRANDING, COMMIT_CO_AUTHOR } from './pr-branding.js';

/**
 * Extract merge-phase rejection feedback from spec.yaml.
 */
function getMergeRejectionFeedback(specContent: string): string {
  try {
    const specData = yaml.load(specContent) as Record<string, unknown> | null;
    const rejectionFeedback = specData?.rejectionFeedback as
      | { iteration: number; message: string; phase?: string; timestamp: string }[]
      | undefined;
    if (rejectionFeedback && rejectionFeedback.length > 0) {
      const mergeRejections = rejectionFeedback.filter((e) => e.phase === 'merge');
      if (mergeRejections.length > 0) {
        const latest = mergeRejections[mergeRejections.length - 1];
        const older = mergeRejections.slice(0, -1);
        const olderSection =
          older.length > 0
            ? `\n### Earlier feedback (for context only)\n${older.map((e) => `- Iteration ${e.iteration}: ${e.message}`).join('\n')}\n`
            : '';
        return `
## ⚠️ CRITICAL — User Rejection Feedback (MUST ADDRESS)

**YOUR PRIMARY TASK: The user rejected the previous result and gave this feedback. You MUST act on it:**

> ${latest.message}

(Iteration ${latest.iteration}, ${latest.timestamp})

Do NOT just record this feedback — you must actually make the changes the user requested.
${olderSection}
`;
      }
    }
  } catch {
    // Continue without rejection feedback
  }
  return '';
}

/**
 * Parse a GitHub remote URL (HTTPS or SSH) into owner/repo.
 * Returns null if the URL does not match a known GitHub format.
 */
export function parseGitHubOwnerRepo(remoteUrl: string): { owner: string; repo: string } | null {
  // HTTPS: https://github.com/owner/repo.git or https://github.com/owner/repo
  const httpsMatch = remoteUrl.match(/github\.com\/([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };

  // SSH: git@github.com:owner/repo.git or git@github.com:owner/repo
  const sshMatch = remoteUrl.match(/github\.com:([^/]+)\/([^/.]+?)(?:\.git)?$/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

  return null;
}

/**
 * Convert a relative evidence path to an absolute GitHub raw URL.
 * Falls back to the relative path if repoUrl is unavailable or not a GitHub repo.
 */
function toGitHubRawUrl(
  relativePath: string,
  branch: string | undefined,
  repoUrl: string | undefined
): string {
  if (!repoUrl || !branch) return relativePath;
  const parsed = parseGitHubOwnerRepo(repoUrl);
  if (!parsed) return relativePath;
  return `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${branch}/${relativePath}`;
}

/**
 * Format a single evidence record as GitHub-compatible markdown.
 * When repoUrl and branch are provided, converts relative paths to
 * absolute raw.githubusercontent.com URLs so images render in PR bodies.
 */
function formatEvidenceItem(e: Evidence, branch?: string, repoUrl?: string): string {
  const taskLine = e.taskRef ? ` (${e.taskRef})` : '';
  const url = toGitHubRawUrl(e.relativePath, branch, repoUrl);
  switch (e.type) {
    case EvidenceType.Screenshot:
      return `- **${e.description}**${taskLine}\n  ![${e.description}](${url})`;
    case EvidenceType.TestOutput:
      return `- **${e.description}**${taskLine}\n  See: \`${e.relativePath}\``;
    case EvidenceType.Video:
      return `- [${e.description}](${url})${taskLine}`;
    case EvidenceType.TerminalRecording:
      return `- [${e.description}](${url})${taskLine}`;
    default:
      return `- [${e.description}](${url})${taskLine}`;
  }
}

/**
 * Build a markdown evidence section from evidence records.
 * Returns empty string when no evidence is available.
 * When branch and repoUrl are provided, image paths are converted to
 * absolute raw.githubusercontent.com URLs for correct rendering in PR bodies.
 */
export function formatEvidenceSection(
  evidence: Evidence[],
  branch?: string,
  repoUrl?: string
): string {
  if (!evidence || evidence.length === 0) return '';

  const items = evidence.map((e) => formatEvidenceItem(e, branch, repoUrl)).join('\n');
  return `\n## Evidence

The following evidence was captured to prove task completion. Include this section in the PR body:

${items}
`;
}

/**
 * Build a prompt for the commit + push + PR agent call.
 *
 * The agent always commits. Push and PR creation are conditional based
 * on state.push and state.openPr flags.
 */
export function buildCommitPushPrPrompt(
  state: FeatureAgentState,
  branch: string,
  baseBranch: string,
  repoUrl?: string
): string {
  const specContent = readSpecFile(state.specDir, 'spec.yaml');
  const cwd = state.worktreePath || state.repositoryPath;
  const shouldPush = state.push || state.openPr;
  const rejectionSection = getMergeRejectionFeedback(specContent);
  // Only include evidence in the PR body when commitEvidence is enabled
  const evidenceSection = state.evidence?.length
    ? formatEvidenceSection(state.evidence, branch, repoUrl)
    : '';

  const steps: string[] = [];

  // Step 1: Commit (always)
  const stageCmd = state.commitSpecs
    ? '`git add -A`'
    : '`git add -A` then `git reset -- specs/` (do NOT commit the specs/ directory)';
  steps.push(`1. Review the current changes using \`git diff\` and \`git status\`
2. Stage changes with ${stageCmd}
3. Write a conventional commit message based on the actual diff content
   - Use the format: \`feat(<scope>): <description>\` or \`fix(<scope>): <description>\`
   - The commit message should summarize what actually changed, not be generic
   - MUST include the co-author trailer: \`${COMMIT_CO_AUTHOR}\`
   - Run: \`git commit -m "<your message>" -m "" -m "${COMMIT_CO_AUTHOR}"\`
   - Do NOT include any other Co-Authored-By trailer (e.g. Claude) — only the Shep Bot trailer above`);

  // Step 2: Local verification before push (conditional)
  if (shouldPush) {
    steps.push(`4. Run local verification checks before pushing:
   - Build the project — must compile without errors
   - Run the test suite — all tests must pass
   - Run the linter — no lint errors
   - Discover the correct commands by inspecting package.json or the project's build tooling
   - Fix any issues found before proceeding to push`);
    steps.push(`5. Push the branch to remote: \`git push -u origin ${branch}\``);
  }

  // Step 3: PR creation (conditional)
  if (state.openPr) {
    steps.push(`${shouldPush ? '6' : '4'}. Create a pull request:
   - Run \`gh pr create --base ${baseBranch} --head ${branch} --title "<title>" --body "<body>"\`
   - Write a descriptive PR title using conventional commit format
   - Write a rich PR body that summarizes the changes using the spec context below
   - The PR body MUST end with this exact branding line (on its own line): \`${PR_BRANDING}\`
   - Do NOT include any other attribution footer (e.g. "Generated with Claude Code" or similar) — only the Shep branding line above`);
  }

  const resumeContext = buildResumeContext(state.resumeReason);

  return `${resumeContext}You are performing git operations in a feature worktree.
${rejectionSection}
## Feature Specification Context

\`\`\`yaml
${specContent}
\`\`\`

## Branch Information

- Feature branch: \`${branch}\`
- Base branch: \`${baseBranch}\`

## Working Directory

${cwd}

## Instructions

${steps.join('\n')}
${evidenceSection}
## Constraints

- Write a meaningful conventional commit message derived from the actual diff — do NOT use generic messages
- Every commit MUST include the co-author trailer: \`${COMMIT_CO_AUTHOR}\` — do NOT include any other Co-Authored-By trailer
${rejectionSection ? '- You MUST modify source code files to address the rejection feedback above BEFORE committing' : '- Do NOT modify any source code files — only perform git operations'}
${!state.commitSpecs ? '- Do NOT commit the `specs/` directory — it must stay untracked. If you accidentally staged it, run `git reset -- specs/` before committing' : ''}
- Do NOT amend existing commits
- Do NOT run \`git pull\`, \`git rebase\`, or \`git merge\` — this is a fresh branch, push it directly
- If there are no changes to commit, skip the commit step and report that no changes were found`;
}

/**
 * Build a prompt for agent-based local squash merge with conflict resolution.
 *
 * Used as a fallback when the programmatic localMergeSquash encounters merge
 * conflicts. The agent resolves conflicts using its full coding capabilities,
 * then commits and cleans up.
 *
 * @param repositoryPath - Path to the original repository (not worktree)
 * @param featureBranch - Branch to squash-merge from
 * @param baseBranch - Target branch (e.g. main)
 * @param commitMessage - Commit message for the squash merge commit
 * @param conflictDetails - Stdout/stderr from the failed merge attempt describing the conflicts
 */
export function buildLocalSquashMergePrompt(
  repositoryPath: string,
  featureBranch: string,
  baseBranch: string,
  commitMessage: string,
  conflictDetails: string
): string {
  return `You are resolving merge conflicts for a local squash merge.

## Context

A programmatic \`git merge --squash\` of \`${featureBranch}\` into \`${baseBranch}\` failed due to merge conflicts.
The repo has already been cleaned up (merge aborted). You need to perform the merge manually, resolving all conflicts.

## Conflict Details

\`\`\`
${conflictDetails}
\`\`\`

## Working Directory

${repositoryPath}

## Instructions

Follow these steps EXACTLY:

1. Make sure you are on the \`${baseBranch}\` branch:
   \`git checkout ${baseBranch}\`

2. Start the squash merge:
   \`git merge --squash ${featureBranch}\`

3. Resolve ALL merge conflicts:
   - For each conflicted file, open it and resolve the conflict markers (\`<<<<<<<\`, \`=======\`, \`>>>>>>>\`)
   - Choose the correct resolution by understanding what both sides intended
   - For lock files (package-lock.json, yarn.lock, pnpm-lock.yaml), accept the feature branch version and regenerate if possible, or accept theirs
   - For config files (.gitignore, tsconfig.json, etc.), merge both sides' additions
   - Stage each resolved file: \`git add <file>\`

4. After ALL conflicts are resolved, commit with the Shep Bot co-author trailer:
   \`git commit -m "${commitMessage.replace(/"/g, '\\"')}" -m "" -m "${COMMIT_CO_AUTHOR}"\`

5. Delete the feature branch:
   \`git branch -d ${featureBranch}\` (non-fatal if it fails)

## Constraints

- Work in the repository at: ${repositoryPath}
- Do NOT push — this is a local-only operation
- Do NOT modify any source code beyond resolving conflicts
- Do NOT create new files
- If a conflict cannot be resolved confidently, prefer the feature branch version (theirs in squash context)
- Ensure the final commit has no conflict markers remaining`;
}

/**
 * Build a prompt for the CI watch/fix agent call.
 *
 * Instructs the executor to diagnose CI failure logs, apply a targeted fix,
 * commit with the prescribed conventional message format, and push to the branch.
 *
 * @param failureLogs - Truncated CI failure log output
 * @param attemptNumber - 1-based current attempt number
 * @param maxAttempts - Maximum allowed attempts
 * @param branch - Feature branch name to push to after fixing
 */
export function buildCiWatchFixPrompt(
  failureLogs: string,
  attemptNumber: number,
  maxAttempts: number,
  branch: string
): string {
  return `You are fixing a CI failure on branch \`${branch}\` (attempt ${attemptNumber}/${maxAttempts}).

## CI Failure Logs

The following logs were retrieved from the failed GitHub Actions run:

\`\`\`
${failureLogs}
\`\`\`

## Instructions

1. Analyze the CI failure logs above to diagnose the root cause
2. Apply a targeted fix to resolve the failure — change only what is necessary
3. Stage all changes: \`git add -A\`
4. Commit with this exact conventional commit message format and the Shep Bot co-author trailer:
   \`git commit -m "fix(ci): attempt ${attemptNumber}/${maxAttempts} — <short description of what you fixed>" -m "" -m "${COMMIT_CO_AUTHOR}"\`
5. Push the fix to the branch: \`git push origin ${branch}\`

## Constraints

- Fix ONLY the issue(s) causing the CI failure — do not refactor unrelated code
- The commit message MUST start with \`fix(ci): attempt ${attemptNumber}/${maxAttempts} — \`
- The commit MUST include the co-author trailer: \`${COMMIT_CO_AUTHOR}\`
- Do NOT include any other Co-Authored-By trailer (e.g. Claude) — only the Shep Bot trailer
- Do NOT create a new branch — push directly to \`${branch}\`
- If the failure is unclear, make your best diagnosis and explain your reasoning in the commit message`;
}

/**
 * Build a prompt for the CI watch agent call.
 *
 * Instructs the agent to check ALL CI runs for a branch, wait for all
 * to complete, verify every run passed, and report structured status.
 * Generic — works with any git/gh repo, not tied to specific workflows.
 *
 * @param branch - Feature branch name to watch CI for
 */
export function buildCiWatchPrompt(branch: string): string {
  return `You are checking CI status for branch \`${branch}\`.

## Instructions

Follow these steps EXACTLY:

### Step 1: List all CI runs for the branch

\`\`\`
gh run list --branch ${branch} --json databaseId,status,conclusion,name
\`\`\`

This shows ALL workflow runs. A single push can trigger MULTIPLE runs (e.g., CI/CD + PR validation).
You MUST check every run, not just one.

### Step 2: Watch all in-progress runs

For EACH run with \`status\` that is NOT \`completed\`, watch it:

\`\`\`
gh run watch <databaseId> --interval 20
\`\`\`

Wait for each in-progress run to finish before proceeding.

### Step 3: Verify all runs after watching

After all runs complete, run the list command again to confirm:

\`\`\`
gh run list --branch ${branch} --json databaseId,status,conclusion,name
\`\`\`

Check that EVERY run shows \`status: completed\`. Do NOT trust \`gh run watch\` exit status alone.

### Step 4: Report status

After verifying all runs are complete, report EXACTLY ONE of these lines:

- If every run has \`conclusion: success\`:
  \`CI_STATUS: PASSED\`

- If any run has a non-success conclusion:
  \`CI_STATUS: FAILED — <brief summary of which runs failed and why>\`

## Constraints

- NEVER claim CI passed until EVERY run shows \`completed\` + \`success\`
- NEVER watch a single run and assume it is the only one
- If \`gh run list\` returns no runs, wait 10 seconds and retry up to 3 times
- If rate-limited (403 error), report: \`CI_STATUS: PASSED\` (skip check gracefully)
- Print the URL of the failing run if CI fails`;
}
