/**
 * Finds a learned-harness version by its full id or a unique id prefix (spec
 * 150), so people can type the short ids the CLI and web show. An ambiguous
 * prefix resolves to nothing rather than to an arbitrary version.
 */

import type { LearnedHarnessVersion } from '../../../domain/generated/output.js';
import type { ILearnedHarnessRepository } from '../../ports/output/repositories/learned-harness-repository.interface.js';

/** Two matches are enough to know a prefix is ambiguous. */
const AMBIGUITY_PROBE = 2;

export async function resolveHarnessVersion(
  harnesses: ILearnedHarnessRepository,
  idOrPrefix: string
): Promise<LearnedHarnessVersion | null> {
  const key = idOrPrefix.trim();
  if (key.length === 0) return null;
  const exact = await harnesses.findVersion(key);
  if (exact) return exact;
  const matches = await harnesses.findVersionsByIdPrefix(key, AMBIGUITY_PROBE);
  return matches.length === 1 ? matches[0] : null;
}
