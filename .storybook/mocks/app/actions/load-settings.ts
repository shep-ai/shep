export interface LoadSettingsResult {
  settings?: unknown;
  shepHome?: string;
  dbFileSize?: string;
  error?: string;
}

export async function loadSettings(): Promise<LoadSettingsResult> {
  return {
    settings: {},
    shepHome: '/mock/.shep',
    dbFileSize: '0 B',
  };
}
