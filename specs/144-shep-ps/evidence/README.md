# Evidence: `shep ps` (spec 144)

Real runs of the built CLI (`dist/`) against a throwaway `SHEP_HOME` and a git repository named
`acme-web`, with the deterministic mock executor. Three features were created with
`shep feat new`; each worker ran to its first approval gate and exited.

| File | What it shows |
| --- | --- |
| `ps.txt` | `shep ps` after the workers parked at their gates: nothing is running, and the hint points to `--all` |
| `ps-all.txt`, `ps-all.png` | `shep ps --all`: three feature agents, exited at `waiting_approval`; a long name is shortened so the columns stay aligned |
| `ps.json` | `shep ps --json --all`: the same rows for scripts, no colour |
| `ps-live.txt`, `ps-live.png`, `ps-live.json` | `shep ps` with a live web daemon (`shep start` from the release build): PID, URL, uptime, CPU and memory sampled by one `ps` call |
| `ps-stop-daemon.txt`, `ps-stop-daemon.png` | `shep ps stop daemon`: refused, points to `shep stop`, exit 1 |
| `ps-stop-unknown.txt` | `shep ps stop nope`: no match, exit 1 |
| `zombie-probe.txt` | Why a zombie counts as exited (see below) |
| `verification.txt` | Every check run locally and its result |

`.ans` files are the raw coloured output; `.txt` files are the same without escape codes.

## A bug the first real run found

The first capture listed a worker as `running` with `109% CPU` and `0.0 MB`. Sampling it with
`ps -o pid=,stat=,pcpu=,rss=,etimes=` showed `12071 Zs 108 0 1`: a **zombie**. The worker had
exited, its parent had not reaped it yet, and `process.kill(pid, 0)` (Shep's liveness check)
still succeeds for zombies. `shep ps` now reads `stat` in the same single `ps` call and treats a
zombie as gone (`exited`, or `crashed` if its run is still marked running). Covered by
`ps-process-stats-probe.test.ts` and `list-shep-processes.use-case.test.ts`.

Because the mock workers finish in about a second, no capture shows a live worker; `ps-live`
shows the same running path (CPU, memory, uptime) for the daemon, and the unit tests cover it
for workers. CPU and memory are not available on
Windows, where those columns show `—`.
