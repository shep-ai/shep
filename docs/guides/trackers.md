# Keeping Linear and Jira in sync

Shep's agents work from shep projects. If your team plans in Linear or Jira, connect the
tracker once and shep keeps its issues in a shep project for you, and can write changes back.

## 1. Connect an account

| Tracker | What you need |
| ------- | ------------- |
| Linear  | A personal API key, from Linear's settings under Security & access |
| Jira    | Your site URL (`https://acme.atlassian.net`), your account email, and an API token from https://id.atlassian.com/manage-profile/security/api-tokens |

In the browser, open **Connections** in the sidebar, choose the tracker, give the connection a
name, pick the **space** it belongs to (so a work Jira and a personal Linear stay apart), paste
the key and press **Connect**. From the terminal:

```bash
shep connection add linear --name "Acme Linear" --space acme      # prompts for the key
shep connection add jira --name "Acme Jira" --space acme \
  --site https://acme.atlassian.net --email me@acme.com           # prompts for the token
```

Shep checks the key before saving anything, stores it encrypted on your machine, and never
shows it again. `shep connection test <name>` re-checks it later.

## 2. Add a sync rule

A rule says what to read and which shep project it lands in:

- **Linear:** a team key, such as `ENG`.
- **Jira:** any JQL query, such as `project = PAY AND type = Bug`.

```bash
shep sync rule add acme-linear --project pay --scope ENG
shep sync rule add acme-jira --project pay --scope "project = PAY" --two-way --every 30
```

On the Connections page the same form sits under each connection.

**Import** rules copy tracker changes into shep. **Two-way** rules also send shep changes back:
move a work item to Done in shep and the Linear issue moves to its first "completed" state, or
the Jira issue takes the transition into a done status.

## 3. Let it run

The shep daemon runs every enabled rule on its interval (15 minutes unless you chose another).
Each run only asks the tracker for issues changed since the last run, so it stays fast however
big the backlog is. To run now: **Sync now** on the Connections page, or `shep sync run`.

Each rule shows what its last run did: created, updated, pushed, conflicts and failures. A
synced work item shows its issue key (`ENG-42`) next to its title, linking to the tracker.

## What is synced

| Field | In | Out (two-way) |
| ----- | -- | ------------- |
| Title | ✓ | ✓ |
| Description | ✓ (Jira's rich text becomes Markdown) | ✓ |
| Status | ✓ (to the project's Backlog, Unstarted, Started, Completed or Cancelled state) | ✓ |
| Priority | ✓ | ✓ |

Comments, labels, assignees and attachments are not synced yet.

## When both sides changed

Shep remembers the values both sides had at the last sync. If only the tracker changed a field,
shep takes it; if only shep changed it, a two-way rule sends it. If both changed the same field
to different values, **the tracker wins** and the run counts a conflict, so teams that live in
Linear or Jira are never overruled by a stale copy.

## Good to know

- Removing a rule or a connection keeps every work item it already synced.
- A work item you delete in shep is not imported again.
- If the tracker rate-limits shep, the run stops, says so, and the next run picks up where it
  left off.
- If a key stops working (revoked, expired), the connection shows **Error** with the tracker's
  message, and its rules fail until the key works again. `Test` re-checks it; the next clean
  run clears the error.
