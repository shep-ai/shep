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
