export async function listSdlcBoard(): Promise<{ boardData?: unknown; error?: string }> {
  return { boardData: { epics: [] } };
}
