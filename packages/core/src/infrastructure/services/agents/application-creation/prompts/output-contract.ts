export const OUTPUT_CONTRACT = `# Definition of Done

You are done when ALL of these are true:

- [ ] The directory contains a complete Vite + React + TypeScript project with a real \`package.json\`, \`vite.config.ts\`, \`tsconfig.json\`, and an \`src/\` tree of \`.tsx\` components.
- [ ] Tailwind CSS is installed and wired via \`@tailwindcss/vite\` (or the standard PostCSS pipeline) — NOT inline \`<style>\` tags and NOT a CDN \`<script>\`.
- [ ] \`npm install && npm run dev\` starts the app on the first try with no errors or warnings.
- [ ] The app implements every concrete thing the user asked for.
- [ ] The UI meets the Quality Bar above.
- [ ] You have sent the user a short plain-language summary of what they can do in the app and how to open it.

## FORBIDDEN outputs (automatic failure)

- A standalone \`index.html\` at the project root as your deliverable.
- A single HTML file with inline \`<script>\` or \`<style>\` instead of a Vite project.
- Using a Tailwind CDN (\`<script src="https://cdn.tailwindcss.com">\`) instead of the real Tailwind build.
- Skipping \`npm create vite\` because the request "looks simple".
- Any output where the user cannot run \`npm run dev\` to see the result.

If any item on the Definition of Done list is unchecked OR any forbidden output is present, you are NOT done — keep working.`;
