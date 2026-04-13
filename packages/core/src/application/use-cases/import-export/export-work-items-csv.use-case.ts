import { injectable, inject } from 'tsyringe';
import Papa from 'papaparse';
import type { WorkItem, WorkItemState, Label } from '../../../domain/generated/output.js';
import type { IWorkItemRepository } from '../../ports/output/repositories/work-item-repository.interface.js';
import type { ICycleRepository } from '../../ports/output/repositories/cycle-repository.interface.js';
import type { IWorkItemStateRepository } from '../../ports/output/repositories/work-item-state-repository.interface.js';
import type { ILabelRepository } from '../../ports/output/repositories/label-repository.interface.js';

export type ExportColumn =
  | 'identifier'
  | 'title'
  | 'description'
  | 'state'
  | 'priority'
  | 'labels'
  | 'dueDate'
  | 'startDate'
  | 'estimate'
  | 'assignees';

export interface ExportWorkItemsCsvInput {
  projectId: string;
  cycleId?: string;
  columns: ExportColumn[];
}

export type ExportWorkItemsCsvResult =
  | { ok: true; csv: string; itemCount: number }
  | { ok: false; error: string };

const COLUMN_HEADERS: Record<ExportColumn, string> = {
  identifier: 'Identifier',
  title: 'Title',
  description: 'Description',
  state: 'State',
  priority: 'Priority',
  labels: 'Labels',
  dueDate: 'Due Date',
  startDate: 'Start Date',
  estimate: 'Estimate',
  assignees: 'Assignees',
};

@injectable()
export class ExportWorkItemsCsvUseCase {
  constructor(
    @inject('IWorkItemRepository') private readonly workItemRepo: IWorkItemRepository,
    @inject('ICycleRepository') private readonly cycleRepo: ICycleRepository,
    @inject('IWorkItemStateRepository') private readonly stateRepo: IWorkItemStateRepository,
    @inject('ILabelRepository') private readonly labelRepo: ILabelRepository
  ) {}

  async execute(input: ExportWorkItemsCsvInput): Promise<ExportWorkItemsCsvResult> {
    let items = await this.workItemRepo.listByProject(input.projectId);

    if (input.cycleId) {
      const cycleItemIds = new Set(await this.cycleRepo.getWorkItemIds(input.cycleId));
      items = items.filter((i) => cycleItemIds.has(i.id));
    }

    const stateMap = await this.buildStateMap(input.projectId);
    const labelMap = await this.buildLabelMap(input.projectId);
    const needLabels = input.columns.includes('labels');

    const rows: string[][] = [];
    for (const item of items) {
      const labelNames = needLabels ? await this.resolveLabels(item.id, labelMap) : [];
      rows.push(this.buildRow(item, input.columns, stateMap, labelNames));
    }

    const headers = input.columns.map((c) => COLUMN_HEADERS[c]);
    const csv = Papa.unparse({ fields: headers, data: rows });

    return { ok: true, csv, itemCount: items.length };
  }

  private async buildStateMap(projectId: string): Promise<Map<string, WorkItemState>> {
    const states = await this.stateRepo.listByProject(projectId);
    return new Map(states.map((s) => [s.id, s]));
  }

  private async buildLabelMap(projectId: string): Promise<Map<string, Label>> {
    const labels = await this.labelRepo.listByProject(projectId);
    return new Map(labels.map((l) => [l.id, l]));
  }

  private async resolveLabels(workItemId: string, labelMap: Map<string, Label>): Promise<string[]> {
    const labelIds = await this.workItemRepo.getLabels(workItemId);
    return labelIds.map((id) => labelMap.get(id)?.name ?? id);
  }

  private buildRow(
    item: WorkItem,
    columns: ExportColumn[],
    stateMap: Map<string, WorkItemState>,
    labelNames: string[]
  ): string[] {
    return columns.map((col) => {
      switch (col) {
        case 'identifier':
          return `${item.identifierPrefix}-${item.sequenceId}`;
        case 'title':
          return item.title;
        case 'description':
          return item.description ?? '';
        case 'state':
          return stateMap.get(item.stateId)?.name ?? item.stateId;
        case 'priority':
          return item.priority;
        case 'labels':
          return labelNames.join(', ');
        case 'dueDate':
          return item.dueDate ? new Date(item.dueDate).toISOString().split('T')[0] : '';
        case 'startDate':
          return item.startDate ? new Date(item.startDate).toISOString().split('T')[0] : '';
        case 'estimate':
          return item.estimateValue ?? '';
        case 'assignees':
          return '';
        default:
          return '';
      }
    });
  }
}
