import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import Papa from 'papaparse';
import type { WorkItem, WorkItemState } from '../../../domain/generated/output.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';
import type { IWorkItemRepository } from '../../ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '../../ports/output/repositories/work-item-state-repository.interface.js';
import type { IActivityLogRepository } from '../../ports/output/repositories/activity-log-repository.interface.js';

export type ImportFieldName =
  | 'title'
  | 'description'
  | 'priority'
  | 'state'
  | 'estimateValue'
  | 'dueDate'
  | 'startDate';

export type CsvFieldMapping = Record<number, ImportFieldName>;

export interface ImportWorkItemsCsvInput {
  projectId: string;
  csvContent: string;
  fieldMapping: CsvFieldMapping;
  skipHeaderRow?: boolean;
}

export interface CsvImportError {
  rowNumber: number;
  error: string;
  value?: string;
}

export type ImportWorkItemsCsvResult =
  | { ok: true; createdCount: number; errors: CsvImportError[] }
  | { ok: false; error: string };

@injectable()
export class ImportWorkItemsCsvUseCase {
  constructor(
    @inject('IPmProjectRepository') private readonly projectRepo: IPmProjectRepository,
    @inject('IWorkItemRepository') private readonly workItemRepo: IWorkItemRepository,
    @inject('IWorkItemStateRepository') private readonly stateRepo: IWorkItemStateRepository,
    @inject('IActivityLogRepository') private readonly activityRepo: IActivityLogRepository
  ) {}

  async execute(input: ImportWorkItemsCsvInput): Promise<ImportWorkItemsCsvResult> {
    const project = await this.projectRepo.findById(input.projectId);
    if (!project) {
      return { ok: false, error: `Project not found: "${input.projectId}"` };
    }

    const parsed = Papa.parse<string[]>(input.csvContent, { header: false, skipEmptyLines: true });
    let rows = parsed.data;

    if (rows.length === 0) {
      return { ok: true, createdCount: 0, errors: [] };
    }

    const skipHeader = input.skipHeaderRow ?? true;
    if (skipHeader) {
      rows = rows.slice(1);
    }

    if (rows.length === 0) {
      return { ok: true, createdCount: 0, errors: [] };
    }

    const states = await this.stateRepo.listByProject(input.projectId);
    const stateNameMap = new Map(states.map((s) => [s.name.toLowerCase(), s]));
    const defaultState = states.find((s) => s.isDefault) ?? states[0];

    let createdCount = 0;
    const errors: CsvImportError[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = skipHeader ? i + 2 : i + 1; // 1-indexed, accounting for header skip

      try {
        const mapped = this.mapRow(row, input.fieldMapping);

        const title = mapped.title?.trim();
        if (!title) {
          errors.push({ rowNumber, error: 'Missing required field: title', value: mapped.title });
          continue;
        }

        const stateId = this.resolveStateId(mapped.state, stateNameMap, defaultState);
        const sequenceId = await this.projectRepo.incrementWorkItemCounter(input.projectId);

        const now = new Date();
        const workItem: WorkItem = {
          id: randomUUID(),
          projectId: input.projectId,
          sequenceId,
          identifierPrefix: project.identifierPrefix,
          title,
          description: mapped.description,
          stateId,
          priority: (mapped.priority as WorkItem['priority']) ?? 'None',
          sortOrder: 0,
          startDate: mapped.startDate ? this.parseDate(mapped.startDate) : undefined,
          dueDate: mapped.dueDate ? this.parseDate(mapped.dueDate) : undefined,
          estimateValue: mapped.estimateValue,
          createdAt: now,
          updatedAt: now,
        };

        await this.workItemRepo.create(workItem);

        await this.activityRepo.create({
          id: randomUUID(),
          workItemId: workItem.id,
          fieldName: 'created',
          newValue: `Imported: ${title}`,
          actorId: 'csv-import',
          createdAt: now,
          updatedAt: now,
        });

        createdCount++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ rowNumber, error: message });
      }
    }

    return { ok: true, createdCount, errors };
  }

  private mapRow(
    row: string[],
    mapping: CsvFieldMapping
  ): Record<ImportFieldName, string | undefined> {
    const result: Record<string, string | undefined> = {};
    for (const [colIndex, fieldName] of Object.entries(mapping)) {
      const idx = Number(colIndex);
      result[fieldName] = row[idx]?.trim() || undefined;
    }
    return result as Record<ImportFieldName, string | undefined>;
  }

  private resolveStateId(
    stateName: string | undefined,
    stateNameMap: Map<string, WorkItemState>,
    defaultState: WorkItemState | undefined
  ): string {
    if (stateName) {
      const matched = stateNameMap.get(stateName.toLowerCase());
      if (matched) return matched.id;
    }
    return defaultState?.id ?? '';
  }

  private parseDate(value: string): Date | undefined {
    const date = new Date(value);
    return isNaN(date.getTime()) ? undefined : date;
  }
}
