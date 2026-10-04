# Team knowledge from Notion

Agents write good code when they know how your team works: the release process, the API
conventions, the product decisions behind a feature. That knowledge usually lives in Notion.
Connect it once and shep keeps the pages you choose as **team knowledge** of a space, so every
agent working in that space reads the parts that matter for its task.

## 1. Create a Notion integration

1. In Notion, open **Settings → Connections → Develop or manage integrations** and create an
   **internal integration** for your workspace. Read access to content is enough.
2. Copy its **internal integration token** (it starts with `ntn_` or `secret_`).
3. Open each page or database you want shep to read and choose **••• → Connections → Add
   connection** with your integration. Notion only shows an integration the pages shared
   with it, and their sub-pages.

## 2. Connect it to a space

Knowledge belongs to a **space**, so your work handbook never reaches a personal project. In
the browser, open **Connections**, choose **Notion**, name the connection, pick the space and
paste the token. From the terminal:

```bash
shep connection add notion --name "Acme Notion" --space acme     # prompts for the token
```

Shep checks the token before saving it, stores it encrypted on your machine and never shows it
again.

## 3. Choose what to keep

A **knowledge source** is one page (with every page under it, five levels deep) or one
database (every row). Paste its link:

```bash
shep knowledge source add acme-notion \
  --scope https://www.notion.so/acme/Engineering-handbook-0123456789abcdef0123456789abcdef
shep knowledge source add acme-notion --scope <payments PRD database link> \
  --product-line payments --every 240
```

On the Connections page the same form sits under the Notion connection.

- **Whole space** (the default): every repository in the space can read it.
- **One product line** (`--product-line`): only repositories of that product line read it —
  the Payments PRDs stay out of the Growth team's prompts.

## 4. Let it sync

The daemon syncs each source on its interval (every 60 minutes unless you choose 15 to 1440).
A sync reads only the pages edited since the last one and forgets pages that were deleted or
unshared. To sync now: **Sync now** on the Connections page, or `shep knowledge sync`.

Each source shows how many documents it holds and what its last sync did: added, updated,
removed and failed pages. The **Project Memory** page lists every space's documents with links
back to Notion.

## What agents see

When an agent starts work in a repository, shep splits the space's documents into sections by
heading, ranks the sections against the task, and adds the best ones — about 1,000 tokens — to
the agent's prompt under **Team knowledge**, each naming the page and section it came from. See
exactly what an agent would get:

```bash
shep knowledge search "refund guest orders" --repo ~/src/pay
```

## Good to know

- Sources are read-only: shep never edits Notion.
- Up to 500 pages per source and 100,000 characters per page are kept.
- Images, files and embeds become placeholders; tables, lists, code and callouts keep their
  shape.
- If Notion rate-limits shep or the token stops working, the sync stops, says so, and the next
  one picks up where it left off. `shep connection test acme-notion` re-checks the token.
- Removing a source removes its documents; removing the connection removes its sources.
