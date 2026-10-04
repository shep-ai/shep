## Findings

- Work item descriptions render as plain text in the web UI, so Markdown is stored as-is.
- StateGroup (Backlog/Unstarted/Started/Completed/Cancelled) matches Linear's state types
  (triage/backlog/unstarted/started/completed/canceled) and Jira's status categories
  (new/indeterminate/done) closely enough to map without configuration.
- The bug-solver prototype's ADF parser misses nested lists, task lists, status/date/expand
  nodes and escaping, and has no tests; this spec writes a tested converter.
