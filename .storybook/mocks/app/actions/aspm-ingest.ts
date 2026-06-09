export type AspmIngestSource = 'sarif' | 'sbom';

export interface AspmIngestSummary {
  source: AspmIngestSource;
  applicationId: string;
  applicationName: string;
  inputFile: string;
  inserted: number;
  duplicates: number;
  total: number;
  toolName?: string;
  sourceLabel: string;
  documentHash: string;
  durationMs: number;
  componentCount?: number;
  complianceLinksWritten?: number;
}

export interface AspmIngestActionResult {
  ok: boolean;
  summary?: AspmIngestSummary;
  error?: string;
}

export interface AspmIngestApplicationOption {
  id: string;
  name: string;
}

export async function listAspmIngestApplications() {
  return {
    ok: true,
    applications: [
      { id: 'app-1', name: 'shep-cli' },
      { id: 'app-2', name: 'shep-web' },
    ],
  };
}

export async function ingestAspmDocument(): Promise<AspmIngestActionResult> {
  return {
    ok: true,
    summary: {
      source: 'sarif',
      applicationId: 'app-1',
      applicationName: 'shep-cli',
      inputFile: 'semgrep.sarif',
      inserted: 12,
      duplicates: 3,
      total: 15,
      toolName: 'semgrep',
      sourceLabel: 'sarif:semgrep',
      documentHash: 'a'.repeat(64),
      durationMs: 142,
      complianceLinksWritten: 4,
    },
  };
}
