export const OUTPUT_CONTRACT = `# Definition of Done

You are done when ALL of these are true:

- [ ] The app-specific feature components have been created under \`src/components/features/\` and wired into \`src/App.tsx\` / routing so the user can actually use what they asked for.
- [ ] Every feature component uses the Shep pre-built pieces from \`@/components/common\` (\`Avatar\`, \`Badge\`, \`EmptyState\`, \`LoadingSpinner\`, \`BottomNav\`, \`TopBar\`, \`IconButton\`, \`SectionHeader\`) wherever they apply — NO re-implementations of those primitives.
- [ ] Every screen that can render an empty list uses \`<EmptyState />\` from \`@/components/common\` for the no-data case.
- [ ] Every tappable icon uses \`<IconButton />\` from \`@/components/common\` — never a raw \`<button>\`.
- [ ] All sample data comes from the helpers in \`@/lib/mock\` (\`pickName\`, \`pickParagraph\`, \`pickPrice\`, \`pickTimestamp\`, \`pickAvatar\`, \`pickInitials\`). Lorem ipsum is FORBIDDEN.
- [ ] All timestamps are formatted with \`formatRelativeTime\` from \`@/lib/format\`. Currencies use \`formatCurrency\`. Large counts use \`formatCompactNumber\`.
- [ ] Styling uses Tailwind semantic classes from the Shep palette (\`bg-background\`, \`bg-card\`, \`text-foreground\`, \`bg-primary\`, \`border-border\`, …). You did NOT pick a new palette or hardcode colors like \`slate-950\` / \`violet-500\` when a semantic class would do.
- [ ] \`bun run build\` (or \`bun run tsc --noEmit\` if there is no \`build\` script) completes with zero errors and zero warnings.
- [ ] \`bun run dev\` starts the app on the first try with no errors in the terminal or browser console.
- [ ] You have sent the user a short plain-language summary of what they can do in the app and how to open it.

## FORBIDDEN outputs (automatic failure)

- Running \`npm create vite\`, \`bunx create-vite\`, \`bunx shadcn init\`, or ANY scaffolding / bootstrap command. The project was already scaffolded by Shep before your first turn — touching the scaffold again destroys the fat-template overlay and wipes the pre-built \`common/\` components + \`lib/\` helpers + theme.
- Running \`npm install\`, \`bun install\`, \`npm\`, \`npx\`, \`yarn\`, or \`pnpm\` anywhere. Dependencies are already installed and bun is the only package manager.
- Re-implementing \`Avatar\`, \`StatusDot\`, \`Badge\`, \`EmptyState\`, \`LoadingSpinner\`, \`ErrorBoundary\`, \`BottomNav\`, \`TopBar\`, \`IconButton\`, or \`SectionHeader\` — they already exist under \`src/components/common/\`.
- Rewriting \`src/index.css\` to pick a different palette. The dark-mode palette is already configured; use semantic Tailwind classes.
- A standalone \`index.html\` at the project root as your deliverable, or a single HTML file with inline \`<script>\` / \`<style>\` instead of Vite modules.
- Using a Tailwind CDN (\`<script src="https://cdn.tailwindcss.com">\`) — the real Tailwind build is already wired in.
- Any output where the user cannot run \`bun run dev\` to see the result.
- Lorem ipsum or placeholder text anywhere in the UI.

If any item on the Definition of Done list is unchecked OR any forbidden output is present, you are NOT done — keep working.`;
