/**
 * ManageSpaceMembershipUseCase (spec 120)
 *
 * How repositories map to spaces: add and remove rules (path prefix or git
 * remote pattern), and pin or unpin a single repository with an explicit
 * assignment. Patterns and paths are normalised exactly as resolution
 * normalises what they match, so what is stored is what is compared.
 */

import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import {
  SpaceRuleKind,
  type RepositorySpaceAssignment,
  type SpaceRule,
} from '../../../domain/generated/output.js';
import { isAbsolutePath } from '../../../domain/shared/absolute-path.js';
import { normalizePath } from '../../../domain/shared/normalize-path.js';
import {
  DEFAULT_SPACE_RULE_PRIORITY,
  inferSpaceRuleKind,
  normalizeSpaceRulePattern,
} from '../../../domain/shared/space-resolution.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import type { IProductLineRepository } from '../../ports/output/repositories/product-line-repository.interface.js';
import type { ISpaceMembershipRepository } from '../../ports/output/repositories/space-membership-repository.interface.js';
import { failure, findProductLine, findSpace, type SpaceResult } from './space-refs.js';

/** A remote pattern needs a host and at least an owner: `host/owner[/...]`. */
const MIN_REMOTE_SEGMENTS = 2;

export interface AddSpaceRuleInput {
  /** Space id or slug. */
  space: string;
  /** Path or Remote; inferred from the pattern when omitted. */
  kind?: SpaceRuleKind;
  /** Absolute path prefix, or remote pattern such as `github.com/acme/*`. */
  pattern: string;
  /** Optional product line id or slug inside the space. */
  productLine?: string;
  /** Tie-breaker between equally specific rules; lower wins. */
  priority?: number;
}

export interface AssignRepositoryInput {
  repositoryPath: string;
  space: string;
  productLine?: string;
}

@injectable()
export class ManageSpaceMembershipUseCase {
  constructor(
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository,
    @inject('IProductLineRepository') private readonly productLines: IProductLineRepository,
    @inject('ISpaceMembershipRepository') private readonly membership: ISpaceMembershipRepository
  ) {}

  async listRules(spaceRef?: string): Promise<SpaceResult<{ rules: SpaceRule[] }>> {
    if (!spaceRef?.trim()) return { ok: true, rules: await this.membership.listRules() };
    const space = await findSpace(this.spaces, spaceRef);
    if (!space) return failure(`No space "${spaceRef}".`);
    return { ok: true, rules: await this.membership.listRules(space.id) };
  }

  async addRule(input: AddSpaceRuleInput): Promise<SpaceResult<{ rule: SpaceRule }>> {
    const space = await findSpace(this.spaces, input.space);
    if (!space) return failure(`No space "${input.space}".`);

    const raw = input.pattern?.trim() ?? '';
    const kind = input.kind ?? inferSpaceRuleKind(raw);
    if (kind === SpaceRuleKind.Path && !isAbsolutePath(normalizePath(raw))) {
      return failure(`"${raw}" is not an absolute path.`);
    }
    const pattern = normalizeSpaceRulePattern(kind, raw);
    if (
      kind === SpaceRuleKind.Remote &&
      pattern.split('/').filter(Boolean).length < MIN_REMOTE_SEGMENTS
    ) {
      return failure(`"${raw}" needs a host and an owner, for example github.com/acme/*.`);
    }

    let productLineId: string | undefined;
    if (input.productLine?.trim()) {
      const line = await findProductLine(this.productLines, space, input.productLine);
      if (!line) return failure(`No product line "${input.productLine.trim()}" in ${space.name}.`);
      productLineId = line.id;
    }

    const duplicate = (await this.membership.listRules()).find(
      (rule) => rule.kind === kind && rule.pattern === pattern
    );
    if (duplicate) {
      return failure(`A ${kind.toLowerCase()} rule for "${pattern}" already exists.`);
    }

    const now = new Date();
    const rule: SpaceRule = {
      id: randomUUID(),
      spaceId: space.id,
      ...(productLineId ? { productLineId } : {}),
      kind,
      pattern,
      priority: input.priority ?? DEFAULT_SPACE_RULE_PRIORITY,
      createdAt: now,
      updatedAt: now,
    };
    await this.membership.createRule(rule);
    return { ok: true, rule };
  }

  async removeRule(id: string): Promise<SpaceResult> {
    const rule = await this.membership.findRuleById(id.trim());
    if (!rule) return failure(`No rule "${id}".`);
    await this.membership.deleteRule(rule.id);
    return { ok: true };
  }

  async assign(
    input: AssignRepositoryInput
  ): Promise<SpaceResult<{ assignment: RepositorySpaceAssignment }>> {
    const repositoryPath = normalizePath(input.repositoryPath?.trim());
    if (!isAbsolutePath(repositoryPath)) {
      return failure(`"${input.repositoryPath}" is not an absolute path.`);
    }
    const space = await findSpace(this.spaces, input.space);
    if (!space) return failure(`No space "${input.space}".`);

    let productLineId: string | undefined;
    if (input.productLine?.trim()) {
      const line = await findProductLine(this.productLines, space, input.productLine);
      if (!line) return failure(`No product line "${input.productLine.trim()}" in ${space.name}.`);
      productLineId = line.id;
    }

    const now = new Date();
    const assignment: RepositorySpaceAssignment = {
      repositoryPath,
      spaceId: space.id,
      ...(productLineId ? { productLineId } : {}),
      createdAt: now,
      updatedAt: now,
    };
    await this.membership.upsertAssignment(assignment);
    return { ok: true, assignment };
  }

  async unassign(repositoryPath: string): Promise<SpaceResult> {
    const path = normalizePath(repositoryPath?.trim());
    const existing = await this.membership.findAssignment(path);
    if (!existing) return failure(`${path} has no assignment; it follows the space rules.`);
    await this.membership.deleteAssignment(path);
    return { ok: true };
  }
}
