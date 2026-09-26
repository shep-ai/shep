# Start a New Project with Spec-Driven Development

Shep does not pick your stack. For a brand-new project, the spec-driven workflow writes the
requirements, researches the technical options, **chooses the stack in the research phase**,
and writes a plan. You approve each step before any code is written.

In Shep, **everything is a feature**, including the first one. A new project is an empty folder
with a first feature on it.

## Two ways to build

| | **Features** (Control Center, `shep feat`) | **App Builder** (the Applications page) |
| --- | --- | --- |
| Stack | Any. Chosen during research, or whatever your repo already uses | Always Vite + React + TypeScript + Tailwind + shadcn (bun) |
| Where it works | Your repository, or a new empty folder | A new sandbox under `~/.shep/projects/<name>` |
| Spec-driven gates | Optional: requirements → research → plan, each approved before code | None: chat, build, preview |
| Best for | Real products, existing (brownfield) code, proofs of concept that need the right stack | Quick web-app prototypes and demos |

If you care about the stack, or you want requirements and a plan before code, use **Features**.

## From the web UI

1. Open **Control Center** (first item in the sidebar).
2. Choose **Start from a prompt**. On first run it sits on the *Add a project* screen; once you
   have repositories it is in the **(+)** menu.
3. Leave the mode on **Spec-driven** (the default). The line under the prompt reads
   *"Any stack, chosen during research"*.
4. Describe the product, not the technology, for example:
   *"A booking tool for climbing gyms with waitlists, memberships and Stripe payments."*
5. Send. Shep creates an empty project folder, initialises git, and starts the spec-driven
   workflow. Your prompt is passed to the agent unchanged.
6. Review and approve the requirements and the plan (including the stack decision) when the
   feature pauses at each gate.

Prefer to name or place the folder yourself? Use **New Project** (an empty folder under
`~/.shep/projects`) or **Choose a Folder** (any empty folder), then start a feature on it with
**(+) → New Feature** and pick **Spec** in the drawer.

From the App Builder page, **Spec-driven project** in the create card opens the same prompt in
Spec-driven mode.

### Pointing at code you already have

A new project always starts empty. If your prompt names a folder that already exists, for example
*"look at /home/me/code/app and plan the next step"*, the prompt shows a hint. Choose
**Work on this folder instead** to open a spec-driven feature on that folder. Shep registers the
folder as a repository if needed.

You can also add the folder first (**(+) → Local Folder**) and start a feature on it.

## From the CLI

```bash
mkdir booking-tool && cd booking-tool
shep feat new "A booking tool for climbing gyms with waitlists and payments" --no-fast
```

- `--no-fast` runs the full spec-driven pipeline (requirements → research → plan → implement).
  Without it, Shep uses your configured default mode, which is Fast unless you changed it.
- The folder does not have to be a git repository: Shep runs `git init` and makes an initial
  commit when it needs to.
- Approve or reject each gate with `shep feat approve <id>` / `shep feat reject <id> --reason "…"`.
  Pass `--allow-prd`, `--allow-plan` or `--allow-all` to skip gates you do not need.

Then keep going: every later change to the project is another feature, created the same way.

## Related

- [Spec-driven development workflow](../development/spec-driven-workflow.md)
- [Getting started](./getting-started.md)
- [Web UI guide](./web-ui.md)
