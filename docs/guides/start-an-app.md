# Start an App, Then Add Features

In Shep you start an **app**, then add **features** to it. Every feature belongs to the app whose
folder it runs in, and each one can run the spec-driven workflow: requirements → research → plan,
with you approving each step before any code is written.

## Two starters

| | **Plan it first** (default) | **Quick prototype** |
| --- | --- | --- |
| Starter id | `blank` | `vite-shadcn` |
| Stack | Any. The app's first feature chooses it during research | Vite + React + TypeScript + Tailwind + shadcn (bun) |
| First steps | Requirements → research → plan, each approved before code | Built straight from chat, with a live preview |
| Best for | Real products and proofs of concept that need the right stack | Quick web-app demos |

Either way the result is an app under `~/.shep/projects/<app>` that you keep adding features to.

## From the CLI

```bash
shep app new "A booking tool for climbing gyms with waitlists and payments"
```

Shep creates an empty project, registers the app, and starts its first feature in spec-driven mode.
Your prompt is passed to the agent unchanged, so nothing is assumed about the stack. The command
prints the app's folder and the first feature's id:

```text
Next steps
  Follow the first feature: shep feat show <feature-id>
  Add a feature: cd ~/.shep/projects/<app> && shep feat new "<what to add>"
```

- `--fast` builds the first feature straight from the prompt, without the spec phase.
- `--starter vite-shadcn` uses the prototype template instead.
- Approve or reject each gate with `shep feat approve <id>` / `shep feat reject <id> --reason "…"`.
  Pass `--allow-prd`, `--allow-plan` or `--allow-all` to `shep feat new` to skip gates you do not need.

Then add features from the app's folder. Each one attaches to the app automatically:

```bash
cd ~/.shep/projects/<app>
shep feat new "Add waitlists"
shep feat new "Add Stripe payments" --no-fast
```

## From the web UI

1. Open **Apps** and choose **New app**. (First run of Control Center also offers
   **Start from a prompt**.)
2. The prompt opens in **Spec-driven** mode. The line under it reads *"Any stack, chosen during
   research"*. Pick **Fast** to skip the spec phase, or **Quick prototype** for the Vite + shadcn
   template.
3. Describe the product, not the technology, for example:
   *"A booking tool for climbing gyms with waitlists, memberships and Stripe payments."*
4. Send. The app and its first feature appear on the Control Center canvas. Review and approve
   the requirements and the plan (including the stack decision) at each gate.
5. Add more features with **Add feature** on the app page, or **(+) → New Feature** in Control
   Center.

The **Apps** page's create card offers the same choices: **Plan it first** and **Quick prototype**,
plus **Open local project** and **Import from GitHub** for code you already have.

### Pointing at code you already have

A new app always starts empty. If your prompt names a folder that already exists, for example
*"look at /home/me/code/app and plan the next step"*, the prompt shows a hint. Choose
**Work on this folder instead** to open a spec-driven feature on that folder. Shep registers the
folder as a repository if needed. From the CLI, run `shep feat new` inside that folder.

## Related

- [Spec-driven development workflow](../development/spec-driven-workflow.md)
- [Getting started](./getting-started.md)
- [Web UI guide](./web-ui.md)
- [CLI commands](../cli/commands.md)
