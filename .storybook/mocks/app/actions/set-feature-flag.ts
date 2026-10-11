export async function setFeatureFlag(
  _key: string,
  _enabled: boolean
): Promise<{ ok: boolean; error?: string }> {
  return { ok: true };
}
