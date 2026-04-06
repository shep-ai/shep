export async function checkAllAgentsStatus(): Promise<Record<string, boolean>> {
  return {
    'claude-code': true,
    'codex-cli': false,
    'copilot-cli': false,
    cursor: false,
    'gemini-cli': true,
    dev: true,
  };
}
