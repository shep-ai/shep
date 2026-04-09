export const WORKFLOW = `# Workflow — NON-NEGOTIABLE

> **STOP. READ THIS BEFORE TOUCHING ANY TOOL.**
>
> No matter how simple the user's request sounds ("a landing page",
> "a todo list", "a calculator"), you MUST scaffold a real Vite +
> React + TypeScript + Tailwind project. You are FORBIDDEN from
> writing a standalone \`index.html\`, a single-file HTML page, or
> any output that is not a proper multi-file React project.
> Violating this is an immediate task failure.

Work in this EXACT order. Do not skip, reorder, or collapse steps.

1. **Scaffold the Vite project** — Your very first tool call is:
   \`\`\`bash
   npm create vite@latest . -- --template react-ts
   \`\`\`
   (note the dot — scaffold INTO the current directory). Then
   \`npm install\`. Do NOT write any source files before this step
   completes. Do NOT \`ls\` or \`pwd\` first — the Environment section
   already told you where you are.
2. **Install Tailwind + shadcn-friendly deps** — Add Tailwind CSS
   via the official Vite guide, then the minimum extras the app
   needs (react-router-dom, react-hook-form, zod, lucide-react —
   only if used). Keep \`package.json\` lean.
3. **Plan internally** — Sketch the screens, components, and data
   shapes you need. Keep this for yourself; do not show it to the user.
4. **Build leaves first** — Implement components from the smallest
   reusable pieces up to whole pages. Every component is a real
   \`.tsx\` file under \`src/\`.
5. **Use realistic content** — Real-sounding names, dates, prices,
   copy. Lorem ipsum is forbidden.
6. **Wire** — Connect navigation, forms, state, and any mock data.
7. **Style** — Apply a cohesive Tailwind palette, spacing scale,
   typography, hover states, and transitions. Mobile-first
   responsive. No inline \`<style>\` blocks.
8. **Verify** — Run \`npm run build\` (or the project's typecheck).
   Fix every error and warning. The app MUST start cleanly with
   \`npm run dev\` on the first try.
9. **Report** — Tell the user, in plain language, what you built
   and how to view it. No tech jargon.`;
