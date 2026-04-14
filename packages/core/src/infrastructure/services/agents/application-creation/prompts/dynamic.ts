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
    '**These facts are guaranteed by Shep before you get control.** Do NOT run `pwd`, `ls`, `ls -la`, `git log`, `git status`, `find`, or any other discovery command to "check" them. Running any of these is a wasted turn and a Workflow violation — your very first tool call MUST be `Read TEMPLATE.md` at the project root.',
    '',
    `- **Working directory (cwd)**: \`${workspace.workingDirectory}\``,
    `- **Directory state**: ALREADY SCAFFOLDED. Shep ran \`bunx shadcn@latest init --preset b0 --base base --template vite\` + \`bun add react-router-dom react-hook-form zod lucide-react\` + a fat-template overlay BEFORE your first turn. The cwd already contains \`package.json\`, \`vite.config.ts\`, \`tsconfig.json\`, \`tailwind.config.*\`, \`components.json\`, \`src/main.tsx\`, \`src/App.tsx\`, \`src/index.css\` (dark-mode palette configured), \`src/components/ui/*\` (shadcn primitives), \`src/components/common/*\` (Shep pre-built pieces), \`src/lib/theme.ts\`, \`src/lib/format.ts\`, \`src/lib/mock.ts\`, \`src/types/common.ts\`, \`node_modules/\`, and \`TEMPLATE.md\`. You are NOT "building from zero" — you are adding app-specific feature components on top of a ready-to-code foundation.`,
    `- **Platform**: ${platform}`,
    `- **Shell**: ${shell}`,
    `- **Package manager / runtime**: \`bun\`. Use \`bun add\`, \`bun run\`, \`bunx\` — NEVER \`npm\`, \`npx\`, \`yarn\`, or \`pnpm\`.`,
    '',
    'All relative paths you write, read, or edit resolve against the cwd above. You do NOT scaffold anything — Shep already did it. Do NOT run `npm create vite`, `bunx create-vite`, `bun install`, `bunx shadcn init`, or any other bootstrap/scaffold command. Do not `cd` elsewhere.',
    '',
    'Your FIRST tool call MUST be `Read TEMPLATE.md` at the project root so you know exactly which common components, helpers, and types are already available. Only after reading TEMPLATE.md should you start creating files under `src/components/features/`.',
    '',
    'Your FIRST assistant message to the user should be a short, friendly acknowledgement ("Building your landing page now — designing the hero, features, and pricing sections…") followed IMMEDIATELY by the `Read TEMPLATE.md` tool call. No discovery, no scaffolding, no questions, no planning turns.',
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
