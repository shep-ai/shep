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
    console.log('[coasts:generate] Generating Coastfile (with build validation)...');
    const coastfilePath = await coastsService.generateCoastfile(repositoryPath);
    console.log(`[coasts:generate] Coastfile generated and built at ${coastfilePath}`);
    return { success: true, coastfilePath };
  } catch (error: unknown) {
    const fullMessage = error instanceof Error ? error.message : 'Failed to generate Coastfile';
    console.error('[coasts:generate] Failed:', fullMessage);
    // Truncate for client serialization — full logs are in server console
    const message = fullMessage.length > 500 ? fullMessage.slice(0, 500) + '…' : fullMessage;
    return { success: false, error: message };
  }
}
