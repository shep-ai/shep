'use server';

import { resolve } from '@/lib/server-container';
import type {
  ManageCustomPropertiesUseCase,
  CreateCustomPropertyInput,
} from '@shepai/core/application/use-cases/custom-properties/manage-custom-properties.use-case';
import type { CustomProperty } from '@shepai/core/domain/generated/output';

export async function listCustomProperties(
  projectId: string
): Promise<{ properties?: CustomProperty[]; error?: string }> {
  if (!projectId?.trim()) {
    return { error: 'Project ID is required' };
  }

  try {
    const useCase = resolve<ManageCustomPropertiesUseCase>('ManageCustomPropertiesUseCase');
    const properties = await useCase.list(projectId);
    return { properties };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list custom properties';
    return { error: message };
  }
}

export async function createCustomProperty(
  input: CreateCustomPropertyInput
): Promise<{ property?: CustomProperty; error?: string }> {
  try {
    const useCase = resolve<ManageCustomPropertiesUseCase>('ManageCustomPropertiesUseCase');
    const result = await useCase.create(input);
    if (!result.ok) return { error: result.error };
    return { property: result.property };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create custom property';
    return { error: message };
  }
}

export async function updateCustomProperty(
  propertyId: string,
  fields: Partial<
    Pick<CustomProperty, 'name' | 'propertyType' | 'options' | 'isRequired' | 'displayOrder'>
  >
): Promise<{ error?: string }> {
  if (!propertyId?.trim()) {
    return { error: 'Property ID is required' };
  }

  try {
    const useCase = resolve<ManageCustomPropertiesUseCase>('ManageCustomPropertiesUseCase');
    const result = await useCase.update(propertyId, fields);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update custom property';
    return { error: message };
  }
}

export async function deleteCustomProperty(propertyId: string): Promise<{ error?: string }> {
  if (!propertyId?.trim()) {
    return { error: 'Property ID is required' };
  }

  try {
    const useCase = resolve<ManageCustomPropertiesUseCase>('ManageCustomPropertiesUseCase');
    const result = await useCase.delete(propertyId);
    if (!result.ok) return { error: result.error };
    return {};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete custom property';
    return { error: message };
  }
}
