# Spaces: keeping personal and work knowledge apart

Shep learns as it works. After each merged feature its agents distil conventions,
library choices and fixes into **project memory**, and every later agent reads that
memory before it starts. Spaces decide how far a lesson travels.

## The three reaches of a memory entry

| Reach              | Who reads it                                              |
| ------------------ | --------------------------------------------------------- |
| This repository    | Only agents working in the repository that learned it     |
| Its product line   | Every repository in the same product line                 |
| Its whole space    | Every repository in the same space                        |

A **space** is a hard wall. "Acme uses the internal release train" shared with the
Acme space reaches every Acme repository and nothing in your Personal space, or in
another client's space. A **product line** is a group of repositories inside a
space, such as Acme's Payments services.

New entries start at "this repository". Widen one on the **Project Memory** page
(the scope button on each entry) when the lesson is true more broadly.

## Where a repository lands

Every repository is in exactly one space. Shep decides which, in this order:

1. **A pin.** You pinned this repository to a space.
2. **A rule.** The most specific matching rule wins. A rule is either a folder
   (`~/work/acme`) or a git remote pattern (`github.com/acme/*`).
3. **The default space.** Everything else. A fresh install has one space,
   `Default`, so nothing changes until you add another.

## Set it up in the browser

Open **Spaces** in the sidebar.

1. Create a space: give it a name, and optionally a description and colour.
2. Add product lines to it if you want sharing narrower than the whole space.
3. Add rules: type a folder or a remote pattern, and optionally pick the product
   line that matching repositories join.
4. Check the **Repositories** table. It shows each repository's space, product line
   and the reason it landed there. Use **Pin to space** to override the rules for
   one repository, and the unpin button to hand it back to them.

## Set it up from the terminal

```bash
shep space new Acme -c "#3456c4"
shep space line new acme Payments
shep space rule add acme "github.com/acme/*"
shep space rule add acme "github.com/acme/pay-*" -l payments
shep space show ~/work/acme/pay-api      # Acme · Payments · matched Remote rule …
shep space assign personal ~/oss/acme-fork
shep space ls
```

The full command list is in the [CLI reference](../cli/commands.md#space-commands).

## Separate logins and git identity per space

A space can also decide **who agents are** when they work on its repositories: which
Claude login and GitHub account they use, which name and email go on their commits,
whether Claude runs through Amazon Bedrock, and which agents may run at all. Anything you
leave empty inherits your machine's setup, so personal projects keep working as before.

Shep never stores a password or token for this. Instead you give each tool its own config
directory and log in there once:

```bash
# A separate Claude login for Acme work
CLAUDE_CONFIG_DIR=~/.claude-acme claude          # log in, then exit

# A separate GitHub account for Acme work
GH_CONFIG_DIR=~/.config/gh-acme gh auth login

shep space config acme \
  --claude-config-dir ~/.claude-acme \
  --gh-config-dir ~/.config/gh-acme \
  --git-name "Ada Lovelace" --git-email ada@acme.com \
  --agents claude-code
```

From then on every feature run in an Acme repository (its agent, and every `gh` and `git`
command it runs) uses the Acme logins and identity, including the pull request it opens.
A login exported in your shell (`GH_TOKEN`, `ANTHROPIC_API_KEY`, ...) would normally win over
a config directory, so Shep removes it for that space's runs. Chat sessions about a feature
use the same settings.

`shep space config acme` shows the settings and exactly which variables a run gets. In the
browser, open **Agent settings** on the space's card on the **Spaces** page.

If a space allows only some agents, a run with another agent stops before it starts and says
why. Change the run's agent or the space's allowed agents.

A space also decides which review comments on shep's pull requests are answered without
asking: those mentioning `#shep` (the default), all of them, or none
(`shep space config acme --pr-comments all`). See [PR comments](./pr-comments.md).

It also decides which runtime actions — restart, rollback, scale — shep runs on the space's
incidents without waiting for approval (`shep space config acme --auto-actions restart`). See
[Incidents](./incidents.md).

## Docs first

A space can require that features are documented before they are built:

```bash
shep space config acme --docs-first                          # docs/ and README.md
shep space config acme --docs-first --docs-paths docs/,CHANGES.md
```

Or tick **Require docs first** under **Agent settings** on the Spaces page. In a docs-first space:

- while **planning**, the agent writes or updates the user-facing documentation for the feature
  under the documentation paths first, as if it had shipped, and lists those files in the plan;
- while **implementing**, the agent treats that documentation as the contract and changes it in
  the same change when the build has to differ;
- before **merging**, shep looks at the changed files. When none is under the documentation
  paths, the run does not merge on its own even if merges are automatic: the merge gate opens
  and says why. Approve it to merge anyway.

A path ending in `/` covers everything under it; any other path covers that one file. Paths are
relative to the repository. `--no-docs-first` turns it off; `--clear docs-paths` returns to the
defaults.

## Team knowledge

Besides the memory agents write, a space can hold your team's own documents: Notion pages kept
in sync through a Notion connection of the space. Agents in the space read the sections that fit
their task; a source limited to a product line reaches only that product line's repositories.
See [Team knowledge from Notion](./knowledge.md).

## Things to know

- **Deleting is safe.** Shep refuses to delete a space that still holds memory, or a
  product line that memory is shared with, and tells you how many entries are in
  the way. The default space cannot be deleted; make another space the default
  first.
- **Moving a repository does not move shared memory.** Its own repository-only
  entries go with it, but entries it shared stay in the space they were written in.
  A repository that moves starts reading its new space's shared memory and stops
  reading the old one's.
- **Entries from before spaces existed.** Entries that were "organization-wide" now
  read as space-wide, inside the space they were written in, which on an upgraded
  install is the default space.
- **What agent settings do not cover.** The Shep web server's own GitHub calls, such as
  listing repositories to import, still use your machine's login. Claude transcripts for a
  space with its own Claude config directory live in that directory, so the session list
  in the web UI shows only the transcripts of the default login.
