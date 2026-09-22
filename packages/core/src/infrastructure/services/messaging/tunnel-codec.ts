/**
 * Frame field encoding helpers for the gateway tunnel protocol: headers
 * travel as `[name, value]` pairs and bodies as base64.
 */

export function headersArrayToRecord(pairs?: [string, string][]): Record<string, string> {
  if (!pairs) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of pairs) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

export function headersRecordToArray(
  record?: Record<string, string>
): [string, string][] | undefined {
  if (!record) return undefined;
  return Object.entries(record);
}

export function base64Encode(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64');
}

export function base64Decode(b64: string): string {
  return Buffer.from(b64, 'base64').toString('utf8');
}
