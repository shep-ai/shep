export const TECH_STACK = `# Tech Stack — Already Installed, Do Not Touch

Shep scaffolded this project BEFORE your first turn via a deterministic
\`BunShadcnScaffolder\` pipeline: bun bootstrap → \`bunx shadcn@latest init
--preset b0 --base base --template vite\` → flatten → \`bun add\` extras →
fat-template overlay. Everything listed below is already present in your
working directory. You do NOT need to install any of it.

| Concern   | Choice                                                                    |
|-----------|---------------------------------------------------------------------------|
| Package manager / runtime | \`bun\` — use \`bun add\`, \`bun run\`, \`bunx\`. NEVER \`npm\`, \`npx\`, \`yarn\`, or \`pnpm\`. |
| Build tool | Vite — already configured, already installed                             |
| Framework  | React + TypeScript (strict mode) — already wired via the shadcn b0 preset |
| Styling    | Tailwind CSS — already configured, palette already set in \`src/index.css\` |
| Primitives | shadcn base components under \`src/components/ui/\` — already installed  |
| Routing    | \`react-router-dom\` — already installed, use only when the app has more than one screen |
| Forms      | \`react-hook-form\` + \`zod\` — already installed, use only when the app collects input |
| Icons      | \`lucide-react\` — already installed                                     |
| HTTP       | native \`fetch\` (no axios)                                              |
| State      | React state + context. Reach for zustand only if cross-tree state is genuinely needed. |

## What is ALREADY in your working directory

The scaffold + fat-template overlay put all of these in place before
your first turn. You MUST use them instead of reinventing:

- \`package.json\`, \`vite.config.ts\`, \`tsconfig.json\`, \`tailwind.config.*\`, \`components.json\`
- \`src/main.tsx\`, \`src/App.tsx\`, \`src/index.css\` (dark-mode palette already configured)
- \`src/components/ui/\` — shadcn primitives (Button, Card, Input, …)
- \`src/components/common/\` — Shep pre-built pieces (Avatar, StatusDot, Badge, EmptyState, LoadingSpinner, ErrorBoundary, BottomNav, TopBar, IconButton, SectionHeader)
- \`src/lib/theme.ts\`, \`src/lib/format.ts\`, \`src/lib/mock.ts\`, \`src/lib/utils.ts\` (\`cn\`)
- \`src/types/common.ts\` — shared types (User, Id, Url, Timestamp, OnlineStatus, Timestamped)
- \`TEMPLATE.md\` at the project root — the cheat sheet. **Your very first tool call MUST be \`Read TEMPLATE.md\`.**
- \`node_modules/\` — every dependency listed above is already installed

## FORBIDDEN actions

- Running \`npm create vite\`, \`bunx create-vite\`, or any scaffolding tool. The project is already scaffolded.
- Running \`npm install\`, \`bun install\`, or any dependency bootstrap. Dependencies are already installed.
- Running \`bunx shadcn init\` or adding shadcn components via the CLI. The base primitives are already present.
- Installing Tailwind or writing a Tailwind config. It is already wired.
- Rewriting \`src/index.css\`, \`src/main.tsx\`, or \`src/components/common/*\`. They are the Shep baseline.
- Calling \`npm\`, \`npx\`, \`yarn\`, or \`pnpm\` for anything. Bun is the ONLY runtime and package manager.`;
