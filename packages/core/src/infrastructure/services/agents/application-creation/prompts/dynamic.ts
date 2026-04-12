/**
 * Renderers for per-call dynamic content in the system prompt —
 * workspace facts and attachments. The user's description itself is
 * returned as a separate `userMessage` slot (not part of the system
 * prompt) so the chat UI can show it cleanly.
 *
 * Static section bodies live alongside this file as named constants;
 * dynamic content is built here so the static sections stay pure
 * string literals (easy to read, easy to swap out via overrides).
 */

import type {
  ApplicationCreationPromptAttachment,
  ApplicationCreationPromptWorkspace,
} from '../../../../../application/ports/output/services/application-creation-prompt-builder.interface.js';

export function renderWorkspace(
  workspace: ApplicationCreationPromptWorkspace | undefined
): string | null {
  if (!workspace) return null;

  const platform = workspace.platform ?? 'posix';
  const shell =
    platform === 'windows'
      ? 'PowerShell / cmd — use Windows path separators and quoting rules.'
      : 'POSIX shell — forward slashes, standard quoting.';

  // Give the agent the concrete facts up front so it never has to
  // spend a turn running `pwd`, `ls`, or `git status` to figure out
  // where it is. Everything here is true the moment the session boots.
  return [
    '# Environment — Ground Truth, Do Not Verify',
    '',
    '**These facts are guaranteed by Shep before you get control.** Do NOT run `pwd`, `ls`, `ls -la`, `git log`, `git status`, `find`, or any other discovery command to "check" them. Running any of these is a wasted turn and a Workflow violation — your very first tool call MUST be the scaffold command in Workflow step 1.',
    '',
    `- **Working directory (cwd)**: \`${workspace.workingDirectory}\``,
    `- **Directory state**: EMPTY. Only a freshly-initialized git repo exists (\`main\` branch, one empty initial commit by \`Shep <shep@local>\`). There are no source files, no \`package.json\`, nothing to read. You are not "examining an existing project" — you are building a new one from zero.`,
    `- **Platform**: ${platform}`,
    `- **Shell**: ${shell}`,
    '',
    'All relative paths you write, read, or edit resolve against the cwd above. When you scaffold, scaffold INTO this directory (`npm create vite@latest . -- --template react-ts` — note the dot). Do not `cd` elsewhere.',
    '',
    'Your FIRST assistant message to the user should be a short, friendly acknowledgement ("Building your landing page now — scaffolding Vite + React + Tailwind…") followed IMMEDIATELY by the scaffold tool call. No discovery, no questions, no planning turns.',
  ].join('\n');
}

export function renderAttachments(
  attachments: ApplicationCreationPromptAttachment[] | undefined
): string | null {
  if (!attachments || attachments.length === 0) return null;

  const lines = attachments.map((a) => {
    const note = a.notes ? ` — ${a.notes}` : '';
    return `- \`${a.name}\` at \`${a.path}\`${note}`;
  });

  return [
    '# Attached Files',
    '',
    'The user attached these files. Read them with your file tools to understand what they contain before starting.',
    '',
    lines.join('\n'),
  ].join('\n');
}
