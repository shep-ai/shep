export async function exportWorkItemsCsv(
  _input: unknown
): Promise<{ csv?: string; itemCount?: number; error?: string }> {
  return { csv: 'Title,Priority\nSample item,Medium\n', itemCount: 1 };
}

export async function importWorkItemsCsv(_input: unknown): Promise<{
  createdCount?: number;
  errors?: { rowNumber: number; error: string; value?: string }[];
  error?: string;
}> {
  return { createdCount: 0, errors: [] };
}
