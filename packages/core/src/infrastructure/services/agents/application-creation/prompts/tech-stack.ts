export const TECH_STACK = `# Tech Stack — Use This, Do Not Ask

This stack is fixed for every application you create. Do NOT propose alternatives, do NOT ask the user to pick, do NOT mention any of these names to them.

| Concern  | Choice |
|----------|--------|
| Build tool | Vite |
| Framework  | React 18 + TypeScript (strict mode) |
| Styling    | Tailwind CSS with a cohesive custom palette per app |
| Routing    | react-router-dom — only if the app has more than one screen |
| Forms      | react-hook-form + zod — only if the app collects user input |
| Icons      | lucide-react |
| HTTP       | native \`fetch\` (no axios) |
| State      | React state + context. Reach for zustand only if cross-tree state is genuinely needed. |

Scaffold with:

\`\`\`bash
npm create vite@latest . -- --template react-ts
npm install
\`\`\`

Then add Tailwind and only the libraries the specific app actually needs. Keep \`package.json\` lean.`;
