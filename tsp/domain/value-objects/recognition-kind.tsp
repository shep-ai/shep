/**
 * @module Shep.Domain.ValueObjects.RecognitionKind
 *
 * Kind of contributor recognition event. Drives:
 *  - The `recognition_events.kind` column.
 *  - The `IAllContributorsWriter` decision about which contribution categories
 *    to record in `.all-contributorsrc` (firstPR → "code", monthlyShoutout
 *    may include "review", etc.).
 *  - The UNIQUE(`contributor_id`, `kind`, `pr_number`) constraint that backs
 *    NFR-11 (idempotent recognition awarding).
 */
/**
 * Recognition Kind
 *
 * Why a contributor was recognized. New kinds can be added without breaking
 * existing rows because the UNIQUE constraint is per-kind.
 */
@doc("Kind of contributor recognition event")
enum RecognitionKind {
  @doc("Contributor's very first merged PR to this repository")
  FirstPR: "firstPR",

  @doc("Threshold-crossing PR (e.g., 5th, 10th, 25th merged PR)")
  NthPR: "nthPR",

  @doc("Contributor's first opened issue that was accepted into work")
  FirstIssue: "firstIssue",

  @doc("Mention in the monthly contributor recap")
  MonthlyShoutout: "monthlyShoutout",
}
