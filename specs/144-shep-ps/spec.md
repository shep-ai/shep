## Problem Statement

Shep starts detached worker processes for every feature agent and a long-running web daemon.
The only views of them are `shep agent ls` (every run ever, no resource use) and `shep status`
(the daemon only). Nothing answers "what is Shep running right now, how heavy is it, and which
feature is it for", and nothing gives a script that answer as JSON.

`shep status` also shells out to `ps` from presentation code. A process monitor would be the
second copy of that code.

## Success Criteria

- [ ] `shep ps` lists the daemon and every live agent worker: kind, PID, feature, agent,
      status, uptime, CPU and memory; a run marked active whose process died shows as crashed
- [ ] `--all` adds runs whose process has exited
- [ ] `--json` prints the same rows as JSON, with no colour
- [ ] `--watch` redraws every 2 seconds until ctrl+c (interactive terminals only)
- [ ] `shep ps stop <id>` stops an agent run by run id, feature id, or either prefix; it
      refuses the daemon and points to `shep stop`
- [ ] CPU and memory come from one `ps` call for all PIDs (argv only); on Windows they are
      omitted and documented as unavailable
- [ ] `shep status` reads CPU and memory through the same port, with unchanged output
- [ ] Process kind and state are TypeSpec enums; rows are built in a core use case

## Affected Areas

| Area | Impact | Reasoning |
| ---- | ------ | --------- |
| `tsp/common/enums/shep-process.tsp` | Low | `ShepProcessKind`, `ShepProcessState` |
| `IProcessStatsProbe` port + `PsProcessStatsProbe` | Medium | One batched `ps` call |
| `application/use-cases/processes/` | Medium | List, sample and stop use cases |
| `src/presentation/cli/commands/ps/` | Medium | Thin command and renderer |
| `status.command.ts` | Low | CPU and memory through the port; drops its own `ps` code |
| `translations/*/cli.json` | Low | Strings in all nine locales |
| `docs/cli/commands.md` | Low | Reference section |

## Out of Scope

- Killing processes with SIGKILL, restarting runs, and following logs from `ps` (use
  `shep feat logs -f`, `shep feat resume`).
- Dev servers and interactive chat sessions as rows (they record no PID today).
- CPU and memory on Windows.

## Size Estimate

**M** - one TypeSpec file, a port and adapter, three small use cases, a command with three
modes, nine locales and an e2e test.
