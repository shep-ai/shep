/** Result envelope of the harness server actions (spec 119). */
export type HarnessResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function toHarnessResult<T>(fn: () => Promise<T>): Promise<HarnessResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
