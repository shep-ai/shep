## Findings

- Spaces and product lines (spec 120) give every repository a space; tracker connections and
  knowledge sources already hang off a space.
- CreateWorkItemUseCase creates a work item in a project with its default state; the
  opportunity keeps its id.
- The sidebar lists pages in one long component; this feature moves its plain links into a
  list before adding Opportunities.
