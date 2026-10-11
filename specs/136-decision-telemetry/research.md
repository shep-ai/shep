## Summary

Two emit points (answer, deadline default), typed with DecisionKind / DecisionSurface /
DurationBucket. No new ports: ITelemetry and toDurationBucket come from spec 133.

## Security and Privacy

Only enums, a boolean and a duration bucket are sent — no question text, answers, actors or
ids. The typed property map rejects content properties at compile time.
