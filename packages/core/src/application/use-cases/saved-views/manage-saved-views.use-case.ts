import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { SavedView } from '../../../domain/generated/output.js';
import type { ISavedViewRepository } from '../../ports/output/repositories/saved-view-repository.interface.js';

export interface CreateSavedViewInput {
  projectId: string;
  name: string;
  description?: string;
  isPublic?: boolean;
  layout: string;
  configuration: string;
  createdBy?: string;
}

export type ManageSavedViewResult =
  | { ok: true; view?: SavedView; views?: SavedView[] }
  | { ok: false; error: string };

@injectable()
export class ManageSavedViewsUseCase {
  constructor(@inject('ISavedViewRepository') private readonly viewRepo: ISavedViewRepository) {}

  async list(projectId: string): Promise<SavedView[]> {
    return this.viewRepo.listByProject(projectId);
  }

  async create(input: CreateSavedViewInput): Promise<ManageSavedViewResult> {
    const now = new Date();
    const view: SavedView = {
      id: randomUUID(),
      projectId: input.projectId,
      name: input.name.trim(),
      description: input.description,
      isPublic: input.isPublic ?? false,
      layout: input.layout as SavedView['layout'],
      configuration: input.configuration,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    await this.viewRepo.create(view);
    return { ok: true, view };
  }

  async update(
    viewId: string,
    fields: Partial<
      Pick<SavedView, 'name' | 'description' | 'isPublic' | 'layout' | 'configuration'>
    >
  ): Promise<ManageSavedViewResult> {
    const existing = await this.viewRepo.findById(viewId);
    if (!existing) {
      return { ok: false, error: `Saved view not found: "${viewId}"` };
    }
    await this.viewRepo.update(viewId, fields);
    return { ok: true };
  }

  async delete(viewId: string): Promise<ManageSavedViewResult> {
    const existing = await this.viewRepo.findById(viewId);
    if (!existing) {
      return { ok: false, error: `Saved view not found: "${viewId}"` };
    }
    await this.viewRepo.softDelete(viewId);
    return { ok: true };
  }
}
