---
name: migrations
description: Add or change a database column without breaking existing rows
---

1. Add the column as nullable in its own migration.
2. Backfill existing rows in the same migration, in batches.
3. Only then add the NOT NULL constraint and the default.
4. Run the migration twice against a copy of the database; it must be idempotent.
