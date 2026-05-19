/**
 * ConvertFindingToWorkItemUseCase (feature 098, phase 7, task-45).
 *
 * Routes a single SecurityFinding into Shep's existing engineering
 * backlog by creating a WorkItem with a back-reference to the finding.
 * Idempotent on the finding's `workItemId` — calling twice returns the
 * existing linkage without creating a duplicate (FR-27).
 */

import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';

import { FindingNotFoundError } from '../../../../domain/aspm/errors/finding-not-found.error.js';
import {
  CanonicalSeverity,
  Priority,
  type SecurityFinding,
  type WorkItem,
} from '../../../../domain/generated/output.js';
import type { IFindingRepository } from '../../../ports/output/repositories/finding-repository.interface.js';
import type { IPmProjectRepository } from '../../../ports/output/repositories/pm-project-repository.interface.js';
import type { IWorkItemRepository } from '../../../ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '../../../ports/output/repositories/work-item-state-repository.interface.js';

export interface ConvertFindingToWorkItemInput {
  findingId: string;
  /** Destination project for the new WorkItem. */
  projectId: string;
  /** Optional override of the default workflow state. */
  stateId?: string;
}

export interface ConvertFindingToWorkItemResult {
  finding: SecurityFinding;
  workItem: WorkItem;
  /** True when the linkage already existed and no new WorkItem was created. */
  alreadyLinked: boolean;
}

@injectable()
export class ConvertFindingToWorkItemUseCase {
  constructor(
    @inject('IFindingRepository') private readonly findings: IFindingRepository,
    @inject('IWorkItemRepository') private readonly workItems: IWorkItemRepository,
    @inject('IPmProjectRepository') private readonly projects: IPmProjectRepository,
    @inject('IWorkItemStateRepository') private readonly states: IWorkItemStateRepository
  ) {}

  async execute(input: ConvertFindingToWorkItemInput): Promise<ConvertFindingToWorkItemResult> {
    const finding = await this.findings.findById(input.findingId);
    if (finding === null) throw new FindingNotFoundError(input.findingId);

    if (finding.workItemId !== undefined) {
      const existing = await this.workItems.findById(finding.workItemId);
      if (existing !== null) {
        return { finding, workItem: existing, alreadyLinked: true };
      }
      // Stale pointer — fall through and re-mint the WorkItem.
    }

    const project = await this.projects.findById(input.projectId);
    if (project === null) {
      throw new Error(`PmProject ${input.projectId} not found`);
    }

    let stateId = input.stateId;
    if (stateId === undefined) {
      const states = await this.states.listByProject(input.projectId);
      const defaultState = states.find((s) => s.isDefault) ?? states[0];
      if (!defaultState) {
        throw new Error(`PmProject ${input.projectId} has no workflow states configured`);
      }
      stateId = defaultState.id;
    }

    const sequenceId = await this.projects.incrementWorkItemCounter(input.projectId);
    const now = new Date();
    const workItem: WorkItem = {
      id: randomUUID(),
      projectId: input.projectId,
      sequenceId,
      identifierPrefix: project.identifierPrefix,
      title: buildWorkItemTitle(finding),
      description: buildWorkItemDescription(finding),
      stateId,
      priority: severityToPriority(finding.canonicalSeverity),
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    } as unknown as WorkItem;

    await this.workItems.create(workItem);
    await this.findings.update(input.findingId, { workItemId: workItem.id });

    return {
      finding: { ...finding, workItemId: workItem.id },
      workItem,
      alreadyLinked: false,
    };
  }
}

export function buildWorkItemTitle(finding: SecurityFinding): string {
  return `[Security:${finding.canonicalSeverity}] ${finding.title}`;
}

export function buildWorkItemDescription(finding: SecurityFinding): string {
  const lines: string[] = [];
  lines.push(`Source: ${finding.source}`);
  lines.push(`Rule: ${finding.ruleId}`);
  if (finding.cveId !== undefined) lines.push(`CVE: ${finding.cveId}`);
  if (finding.cweId !== undefined) lines.push(`CWE: ${finding.cweId}`);
  if (finding.locationPath !== undefined) {
    const loc =
      finding.locationLine !== undefined
        ? `${finding.locationPath}:${finding.locationLine}`
        : finding.locationPath;
    lines.push(`Location: ${loc}`);
  }
  if (finding.description.length > 0) {
    lines.push('');
    lines.push(finding.description);
  }
  return lines.join('\n');
}

export function severityToPriority(severity: CanonicalSeverity): Priority {
  switch (severity) {
    case CanonicalSeverity.Critical:
      return Priority.Urgent;
    case CanonicalSeverity.High:
      return Priority.High;
    case CanonicalSeverity.Medium:
      return Priority.Medium;
    case CanonicalSeverity.Low:
      return Priority.Low;
    case CanonicalSeverity.Info:
    default:
      return Priority.None;
  }
}
