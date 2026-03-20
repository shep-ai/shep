'use server';

import path from 'node:path';
import { resolve } from '@/lib/server-container';
import type { ICoastsService } from '@shepai/core/application/ports/output/services/coasts-service.interface';

export interface CheckCoastfileResult {
  exists: boolean;
}

export async function checkCoastfileAction(repositoryPath: string): Promise<CheckCoastfileResult> {
  if (!repositoryPath || !path.isAbsolute(repositoryPath)) {
    return { exists: false };
  }

  try {
    const coastsService = resolve<ICoastsService>('ICoastsService');
    const exists = await coastsService.hasCoastfile(repositoryPath);
    return { exists };
  } catch {
    return { exists: false };
  }
}
