'use server';

/* eslint-disable no-console */
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
  console.log(`[coasts:generate] Starting Coastfile generation for ${repositoryPath}`);

  if (!repositoryPath || !path.isAbsolute(repositoryPath)) {
    console.warn('[coasts:generate] Invalid path:', repositoryPath);
    return { success: false, error: 'repositoryPath must be an absolute path' };
  }

  if (!existsSync(repositoryPath)) {
    console.warn(`[coasts:generate] Directory does not exist: ${repositoryPath}`);
    return { success: false, error: `Directory does not exist: ${repositoryPath}` };
  }

  try {
    const coastsService = resolve<ICoastsService>('ICoastsService');
    console.log('[coasts:generate] Generating Coastfile...');
    const coastfilePath = await coastsService.generateCoastfile(repositoryPath);
    console.log(`[coasts:generate] Coastfile generated at ${coastfilePath}`);
    console.log('[coasts:generate] Building coast container...');
    await coastsService.build(repositoryPath);
    console.log('[coasts:generate] Build complete.');
    return { success: true, coastfilePath };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate Coastfile';
    console.error('[coasts:generate] Failed:', message);
    return { success: false, error: message };
  }
}
