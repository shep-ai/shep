'use server';

import { revalidatePath } from 'next/cache';
import { resolve } from '@/lib/server-container';
import type {
  UpdateApplicationFields,
  UpdateApplicationUseCase,
} from '@shepai/core/application/use-cases/applications/update-application.use-case';

export async function updateApplication(
  id: string,
  fields: UpdateApplicationFields
): Promise<{ error?: string }> {
  if (!id?.trim()) {
    return { error: 'Application ID is required' };
  }

  try {
    const useCase = resolve<UpdateApplicationUseCase>('UpdateApplicationUseCase');
    await useCase.execute(id, fields);
    // Refresh server components that read the application — the
    // application page itself, and the dashboard graph data.
    revalidatePath(`/application/${id}`);
    revalidatePath('/');
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update application';
    return { error: message };
  }
}
