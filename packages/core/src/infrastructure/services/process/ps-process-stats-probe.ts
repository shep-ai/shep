/**
 * ps-backed process stats (spec 144).
 *
 * Implements IProcessStatsProbe with ONE `ps -o pid=,stat=,pcpu=,rss= -p a,b,c`
 * call per sample, through the shared ExecFunction (argv only, no shell).
 * `ps` exits non-zero when any listed PID is gone but still prints the ones
 * it found, so a failed call's stdout is parsed too. `stat` flags zombies:
 * exited processes not reaped yet, which still answer `kill(pid, 0)`.
 *
 * Windows has no `ps`; there the probe reports nothing and callers show CPU
 * and memory as unavailable.
 */

import type {
  IProcessStatsProbe,
  ProcessStats,
} from '../../../application/ports/output/services/process-stats-probe.interface.js';
import type { ExecFunction } from '../git/worktree.service.js';

const PS_TIMEOUT_MS = 2000;
const BYTES_PER_KIB = 1024;
const PS_ARGS = ['-o', 'pid=,stat=,pcpu=,rss='] as const;
const PID_LIST_FLAG = '-p';
const PID_SEPARATOR = ',';
const LINE_BREAK = /\r?\n/;
const COLUMN_SEPARATOR = /\s+/;
const DECIMAL_COMMA = /,/g;
const EXPECTED_COLUMNS = 4;
/** First letter of `stat` for an exited, unreaped process. */
const ZOMBIE_STATE = 'Z';

function toNumber(text: string): number {
  return Number(text.replace(DECIMAL_COMMA, '.'));
}

/** PID → stats from `ps -o pid=,stat=,pcpu=,rss=` output; malformed lines are skipped. */
export function parsePsStats(output: string): Map<number, ProcessStats> {
  const stats = new Map<number, ProcessStats>();
  for (const line of output.split(LINE_BREAK)) {
    const columns = line.trim().split(COLUMN_SEPARATOR);
    if (columns.length !== EXPECTED_COLUMNS) continue;
    const [pidText, state, cpuText, rssText] = columns;
    const [pid, cpu, rssKib] = [pidText, cpuText, rssText].map(toNumber);
    if (!Number.isInteger(pid) || pid <= 0 || !Number.isFinite(cpu) || !Number.isFinite(rssKib)) {
      continue;
    }
    stats.set(pid, {
      cpuPercent: cpu,
      rssBytes: rssKib * BYTES_PER_KIB,
      zombie: state.startsWith(ZOMBIE_STATE),
    });
  }
  return stats;
}

export class PsProcessStatsProbe implements IProcessStatsProbe {
  constructor(
    private readonly exec: ExecFunction,
    private readonly isWindows: boolean
  ) {}

  async sample(pids: readonly number[]): Promise<Map<number, ProcessStats>> {
    const valid = pids.filter((pid) => Number.isInteger(pid) && pid > 0);
    if (this.isWindows || valid.length === 0) return new Map();
    try {
      const { stdout } = await this.exec(
        'ps',
        [...PS_ARGS, PID_LIST_FLAG, valid.join(PID_SEPARATOR)],
        { timeout: PS_TIMEOUT_MS, windowsHide: true }
      );
      return parsePsStats(stdout);
    } catch (error) {
      const stdout = (error as { stdout?: unknown }).stdout;
      return typeof stdout === 'string' ? parsePsStats(stdout) : new Map();
    }
  }
}
