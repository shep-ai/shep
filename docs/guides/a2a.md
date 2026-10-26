# Connecting another agent system over A2A

Shep's web daemon (`shep ui` / `shep start`) speaks [A2A](https://a2a-protocol.org)
1.0 over JSON-RPC. Another orchestrator can hand shep a feature request and follow
it as a task: watch it work, answer its agent's questions, approve or reject its
gates, and cancel it.

**A task is a feature.** The task id and the context id are both the feature id.

## Discover and authenticate

```bash
curl http://localhost:4050/.well-known/agent-card.json
```

The card names the endpoint (`http://localhost:4050/api/a2a`, binding `JSONRPC`,
version `1.0`), the skills (`build-feature`, `steer-feature`) and an HTTP bearer
security scheme. Every call to the endpoint needs the install's control-center
token: the file `web-auth-token` in the shep home directory (`~/.shep`, or
`SHEP_HOME`).

```bash
TOKEN=$(cat ~/.shep/web-auth-token)
a2a() {
  curl -s http://localhost:4050/api/a2a \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -H 'A2A-Version: 1.0' -d "$1"
}
```

The card itself is readable without the token, unless `SHEP_WEB_REQUIRE_TOKEN=1`
is set. The daemon answers loopback only unless `SHEP_ALLOWED_HOSTS` says
otherwise. Clients that send the token in a header need no Origin, so
server-to-server clients work unchanged.

## Methods

| Method | Shep does |
| ------ | --------- |
| `SendMessage` without `taskId` | Creates a feature. The text parts are the request; the repository comes from a data part `{"repositoryPath": "/abs/path"}` or from message or request `metadata.repositoryPath` |
| `SendMessage` with `taskId` | A data part `{"decision": "approve"}` or `{"decision": "reject", "feedback": "…"}` decides the gate. Otherwise the text answers the agent's open question. Free text never approves anything |
| `SendStreamingMessage` | The same, then streams the task (SSE) |
| `GetTask` | The feature as a task |
| `ListTasks` | Every feature (filters: `contextId`, `status`; `pageSize` 1–100, `pageToken`) |
| `CancelTask` | Stops the run. A finished task answers `TaskNotCancelableError` |
| `SubscribeToTask` | SSE: the task, then a `statusUpdate` per change, ending after a terminal state |
| Push notification methods | `PushNotificationNotSupportedError` (-32003); use `SubscribeToTask` |
| `GetExtendedAgentCard` | `ExtendedAgentCardNotConfiguredError` (-32007) |

```bash
a2a '{"jsonrpc":"2.0","id":1,"method":"SendMessage","params":{"message":{"messageId":"m1","role":"ROLE_USER","parts":[{"text":"Add a login page"},{"data":{"repositoryPath":"/work/acme"}}]}}}'
a2a '{"jsonrpc":"2.0","id":2,"method":"GetTask","params":{"id":"<feature id>"}}'
a2a '{"jsonrpc":"2.0","id":3,"method":"SendMessage","params":{"message":{"messageId":"m2","role":"ROLE_USER","taskId":"<feature id>","parts":[{"data":{"decision":"approve"}}]}}}'
```

## Task states

| Shep activity | A2A state | Status message |
| ------------- | --------- | -------------- |
| working | `TASK_STATE_WORKING` | "Working on the plan phase." |
| blocked at a gate | `TASK_STATE_INPUT_REQUIRED` | Which phase waits for approval, and the decision data part to send |
| blocked on a question | `TASK_STATE_INPUT_REQUIRED` | The agent's question; reply with text |
| waiting | `TASK_STATE_SUBMITTED` | Queued, deferred or waiting on a parent feature |
| done | `TASK_STATE_COMPLETED` | |
| failed | `TASK_STATE_FAILED`, or `TASK_STATE_CANCELED` for a cancelled run | The run's error |

`task.metadata.shep` carries shep's own fields: name, repository, branch,
activity, reason, phase, run status, open question, PR, the actions the run
accepts, and the version, which strictly increases within a stream (see
[agent activity](../architecture/agent-activity.md)).

## Protocol notes

- Enums are ProtoJSON names (`TASK_STATE_WORKING`, `ROLE_USER`). A part holds exactly
  one of `text`, `data`, `url` or `raw`.
- A missing `A2A-Version` header is served as 1.0. The specification reads a
  missing header as 0.3; shep does not speak 0.3. Any other major answers
  `VersionNotSupportedError` (-32009). The version may also be sent as the
  `A2A-Version` query parameter.
- Errors: -32700 parse, -32600 invalid request, -32601 unknown method, -32602 invalid
  params (including a reply the feature cannot take right now; the message says
  why), -32001 task not found, -32002 not cancelable, -32004 unsupported.
- Streams are `text/event-stream`: one JSON-RPC response per `data:` line, plus a
  `: keep-alive` comment every 15 s.
- Interoperability is tested with the official `@a2a-js/sdk` client
  (`tests/integration/infrastructure/services/a2a/a2a-sdk-interop.test.ts`).
