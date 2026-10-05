/* global process, console */
// Demo only: move one shipped opportunity — its outcome window and the signals
// behind it — into the past, so `shep outcome check` judges it now instead of
// in 14 days.
// Usage: node backdate-outcome.mjs <opportunity-id> <days>
import Database from 'better-sqlite3';
import { join } from 'node:path';

const [opportunityId, days] = process.argv.slice(2);
const db = new Database(join(process.env.SHEP_HOME, 'data'));
const shift = Number(days) * 24 * 60 * 60 * 1000;
const changed = db
  .prepare(
    'UPDATE opportunity_outcomes SET shipped_at = shipped_at - ?, review_at = review_at - ? WHERE opportunity_id = ?'
  )
  .run(shift, shift, opportunityId).changes;
const EVIDENCE_LEAD_DAYS = 5;
const signalShift = (Number(days) + EVIDENCE_LEAD_DAYS) * 24 * 60 * 60 * 1000;
db.prepare('UPDATE signals SET created_at = created_at - ? WHERE opportunity_id = ?').run(
  signalShift,
  opportunityId
);
console.log(
  changed === 1 ? `Moved the outcome back ${days} days` : 'No outcome for that opportunity'
);
