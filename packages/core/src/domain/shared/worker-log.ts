/**
 * Worker log file naming.
 *
 * Each detached agent worker writes stdout/stderr to one file in the Shep
 * logs directory, named after its agent run. Writers, readers and retention
 * all derive the name here so they cannot disagree about it.
 *
 * Note the import convention for `domain/`: no imports, no I/O.
 */

/** Sub-directory of the Shep home that holds worker logs. */
export const WORKER_LOGS_DIRNAME = 'logs';

const LOG_EXTENSION = '.log';
const FEATURE_WORKER_PREFIX = 'worker-';
const CLUSTER_WORKER_PREFIX = 'cluster-worker-';
/** Longest first, so a prefix that ends another one never wins by accident. */
const WORKER_PREFIXES = [CLUSTER_WORKER_PREFIX, FEATURE_WORKER_PREFIX] as const;

/** File name of a feature-agent worker's log, e.g. `worker-<runId>.log`. */
export function featureWorkerLogFileName(runId: string): string {
  return `${FEATURE_WORKER_PREFIX}${runId}${LOG_EXTENSION}`;
}

/**
 * The agent run a worker log belongs to, or `null` for any other file.
 * Recognises feature (`worker-<id>.log`) and cluster (`cluster-worker-<id>.log`) logs.
 */
export function runIdOfWorkerLog(fileName: string): string | null {
  if (!fileName.endsWith(LOG_EXTENSION)) return null;
  for (const prefix of WORKER_PREFIXES) {
    if (fileName.startsWith(prefix)) {
      const runId = fileName.slice(prefix.length, -LOG_EXTENSION.length);
      return runId === '' ? null : runId;
    }
  }
  return null;
}
