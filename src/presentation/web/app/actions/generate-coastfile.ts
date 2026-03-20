'use server';

import path from 'node:path';
import { existsSync } from 'node:fs';
import { resolve } from '@/lib/server-container';
import type { ICoastsService } from '@shepai/core/application/ports/output/services/coasts-service.interface';

export interface GenerateCoastfileResult {
  success: boolean;
  coastfilePath?: string;
  error?: string;
}

export async function generateCoastfileAction(
  repositoryPath: string
): Promise<GenerateCoastfileResult> {
  if (!repositoryPath || !path.isAbsolute(repositoryPath)) {
    return { success: false, error: 'repositoryPath must be an absolute path' };
  }

  if (!existsSync(repositoryPath)) {
    return { success: false, error: `Directory does not exist: ${repositoryPath}` };
  }

  try {
    const coastsService = resolve<ICoastsService>('ICoastsService');
    const coastfilePath = await coastsService.generateCoastfile(repositoryPath);
    await coastsService.build(repositoryPath);
    return { success: true, coastfilePath };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate Coastfile';
    return { success: false, error: message };
  }
}
