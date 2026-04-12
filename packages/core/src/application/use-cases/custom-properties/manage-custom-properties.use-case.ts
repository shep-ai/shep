import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { CustomProperty } from '../../../domain/generated/output.js';
import type { ICustomPropertyRepository } from '../../ports/output/repositories/custom-property-repository.interface.js';

export interface CreateCustomPropertyInput {
  projectId: string;
  name: string;
  propertyType: string;
  options?: string;
  isRequired?: boolean;
  displayOrder?: number;
}

export type ManageCustomPropertyResult =
  | { ok: true; property?: CustomProperty; properties?: CustomProperty[] }
  | { ok: false; error: string };

@injectable()
export class ManageCustomPropertiesUseCase {
  constructor(
    @inject('ICustomPropertyRepository') private readonly propRepo: ICustomPropertyRepository
  ) {}

  async list(projectId: string): Promise<CustomProperty[]> {
    return this.propRepo.listByProject(projectId);
  }

  async create(input: CreateCustomPropertyInput): Promise<ManageCustomPropertyResult> {
    const now = new Date();
    const property: CustomProperty = {
      id: randomUUID(),
      projectId: input.projectId,
      name: input.name.trim(),
      propertyType: input.propertyType as CustomProperty['propertyType'],
      options: input.options,
      isRequired: input.isRequired ?? false,
      displayOrder: input.displayOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.propRepo.create(property);
    return { ok: true, property };
  }

  async update(
    propertyId: string,
    fields: Partial<
      Pick<CustomProperty, 'name' | 'propertyType' | 'options' | 'isRequired' | 'displayOrder'>
    >
  ): Promise<ManageCustomPropertyResult> {
    const existing = await this.propRepo.findById(propertyId);
    if (!existing) {
      return { ok: false, error: `Custom property not found: "${propertyId}"` };
    }
    await this.propRepo.update(propertyId, fields);
    return { ok: true };
  }

  async delete(propertyId: string): Promise<ManageCustomPropertyResult> {
    const existing = await this.propRepo.findById(propertyId);
    if (!existing) {
      return { ok: false, error: `Custom property not found: "${propertyId}"` };
    }
    await this.propRepo.softDelete(propertyId);
    return { ok: true };
  }
}
