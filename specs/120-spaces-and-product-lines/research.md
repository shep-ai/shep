## Findings

An inventory of machine-global state found no tenant, space or organization key anywhere in
the schema. Shep Brain is the only place where knowledge crosses repositories today, through
`listOrganization()`. Credentials (agent token, GitHub integration, cloud tokens) and settings
are also machine-wide; those are scoped in spec 121.

The decisions above keep this spec to knowledge isolation: one database, assignment and rule
tables keyed by normalised repository path, a pure domain resolver, and memory reads split into
three narrow, always-filtered queries.
