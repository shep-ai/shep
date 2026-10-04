/**
 * Shared shapes for server actions that call one use case: the message of a
 * thrown error, and the plain success-or-error outcome a page needs before it
 * refreshes. (Not a 'use server' module, so it may export helpers.)
 */

export type ActionOutcome = { ok: true } | { ok: false; error: string };

/** The message of anything thrown. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Only success or the error of a use-case result; a throw becomes a failure. */
export async function attemptOutcome(
  body: () => Promise<{ ok: boolean; error?: string }>
): Promise<ActionOutcome> {
  try {
    const result = await body();
    return result.ok ? { ok: true } : { ok: false, error: result.error ?? 'Failed' };
  } catch (error: unknown) {
    return { ok: false, error: errorMessage(error) };
  }
}

/**
 * The outcome of several sync runs: the first refusal, or the first run that
 * stopped early with an error; success otherwise. A throw becomes a failure.
 */
export async function runsOutcome(
  body: () => Promise<{ ok: boolean; error?: string }[]>
): Promise<ActionOutcome> {
  try {
    for (const result of await body()) {
      if (result.error) return { ok: false, error: result.error };
      if (!result.ok) return { ok: false, error: 'Failed' };
    }
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, error: errorMessage(error) };
  }
}
