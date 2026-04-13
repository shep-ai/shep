export interface AvailableTerminal {
  id: string;
  name: string;
  available: boolean;
}

export async function getAvailableTerminals(): Promise<AvailableTerminal[]> {
  return [{ id: 'system', name: 'System Terminal', available: true }];
}
