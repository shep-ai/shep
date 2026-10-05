# Incidents: triage and fix production problems

When something breaks in production, open an **incident** in the space it belongs to. Shep keeps
its timeline, asks the space's agent what is likely wrong, and can **restart**, **roll back** or
**scale** the Kubernetes deployment behind it — with your approval, or without asking for the
actions you allow. When it is over, resolve it with a postmortem.

Every incident is also recorded as an urgent **Incident** signal (see
[Opportunities](./opportunities.md)), so recurring outages compete for review time like any
other evidence.

## 1. Open an incident

```bash
shep incident open "Checkout 5xx" --space acme --severity critical \
  --workload checkout --namespace shop --context prod
```

Or use **Open** on the **Incidents** page. Severity is `critical`, `major` (the default) or
`minor`. `--workload` names a Kubernetes deployment; `--namespace` defaults to `default` and
`--context` to your current kubectl context. Without a workload the incident is a record only:
triage still runs, runtime actions do not.

## 2. Let alerts open them

A monitoring tool can open incidents with a space **intake key** — the same key that posts
feedback ([Customer feedback](./feedback.md)):

```bash
curl -X POST https://<your shep host>/api/alerts \
  -H "Authorization: Bearer shep_fb_…" \
  -H "Content-Type: application/json" \
  -d '{
        "title": "Checkout 5xx above 5%",
        "severity": "Critical",
        "detail": "Error rate on POST /checkout rose to 7% at 09:58.",
        "url": "https://grafana.acme.com/d/checkout",
        "externalId": "grafana-alert-812",
        "namespace": "shop",
        "workload": "checkout"
      }'
```

| Field | Required | Meaning |
| ----- | -------- | ------- |
| `title` | yes | What is wrong |
| `severity` | no | `Critical`, `Major` (default) or `Minor` |
| `detail` | no | More text |
| `url` | no | An http(s) link to the alert or dashboard |
| `externalId` | no | The alert's id; while that incident is unresolved, a repeat adds a note instead of a new incident |
| `context`, `namespace`, `workload` | no | Where the workload runs |

Answers: **201** opened, **200** repeat of an unresolved incident, **400** bad payload, **401**
unknown or revoked key, **413** body over 16 KB. The answer is `{ "id": "<incident id>",
"duplicate": false }`.

## 3. Triage

```bash
shep incident triage <incident>
```

Or press **Triage**. Shep reads the deployment's status, recent events and logs with `kubectl`,
records them as evidence, and asks the space's agent (no tools, nothing outside this incident)
for a summary, up to three causes ranked by confidence, and at most one runtime action. The
causes and the proposal go on the timeline.

## 4. Act

An action the agent proposes waits for you:

```bash
shep incident approve <action>
shep incident reject <action> --reason "deploy is fine"
```

Or use **Approve** / **Reject** on the page. You can also act yourself; an action you ask for
runs at once:

```bash
shep incident act <incident> rollback --reason "errors began with 4.12.0"
shep incident act <incident> scale --replicas 6
```

After an action runs, Shep waits up to three minutes for the rollout to become ready and records
**Recovered** or **Not recovered**. The first recovery marks an open incident **Mitigated**.

### Let shep act without asking

```bash
shep space config acme --auto-actions restart
```

Actions in the list run as soon as triage proposes them. Under **Agent settings** on the Spaces
page, tick them under **Runs without asking on incidents**. `--clear auto-actions` returns to
always asking. Rollbacks and scales change what runs in production; allow them only where that
is safe.

## 5. Resolve

```bash
shep incident note <incident> "Paged the DBA"
shep incident resolve <incident>
```

Resolving without `--postmortem` writes a draft from the timeline and actions: the timeline,
each action with its result, and follow-ups to fill in. Pass `--postmortem "<markdown>"` (or
write it on the page) to use your own.

## Good to know

- Runtime actions run `kubectl` on the machine running shep, with its kubeconfig. Workload,
  namespace and context names are checked before they reach `kubectl`, and are never read as
  flags.
- `shep incident ls --open` lists unresolved incidents; `shep incident show <incident>` prints
  the timeline and actions.
