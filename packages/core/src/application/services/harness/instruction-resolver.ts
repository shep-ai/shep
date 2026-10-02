/**
 * InstructionResolver (spec 119, docs/09).
 *
 * V0 activation is deterministic: every enabled instruction without a `when`
 * condition is active and pinned. Conditional instructions are parsed and
 * reported as inactive until conditional activation lands (V1), so a team can
 * author them now without them silently applying everywhere.
 */
import { createHash } from 'node:crypto';
import type { Instruction } from '../../../domain/generated/output.js';
import type {
  IBlobStore,
  IInstructionSource,
  InstructionIssue,
} from '../../ports/output/harness/index.js';

export const CONDITIONAL_INACTIVE_REASON = 'Conditional activation (`when`) arrives in V1';
export const DISABLED_REASON = 'Disabled in frontmatter';

export interface ResolvedInstructions {
  all: Instruction[];
  active: (Instruction & { body: string })[];
  issues: InstructionIssue[];
}

export class InstructionResolver {
  constructor(
    private readonly source: IInstructionSource,
    private readonly blobs: IBlobStore
  ) {}

  async resolve(repoRoot: string): Promise<ResolvedInstructions> {
    const { instructions, issues } = await this.source.discover(repoRoot);
    const all: Instruction[] = [];
    const active: (Instruction & { body: string })[] = [];
    for (const d of instructions) {
      const inactiveReason = !d.enabled
        ? DISABLED_REASON
        : d.condition
          ? CONDITIONAL_INACTIVE_REASON
          : undefined;
      const instruction: Instruction = {
        id: d.id,
        title: d.title,
        source: d.source,
        priority: d.priority,
        pinWhileActive: d.pin,
        contentRef: await this.blobs.put(d.body),
        contentHash: createHash('sha256').update(d.body).digest('hex'),
        enabled: d.enabled,
        ...(d.condition && { condition: d.condition }),
        active: inactiveReason === undefined,
        ...(inactiveReason && { inactiveReason }),
      };
      all.push(instruction);
      if (instruction.active) active.push({ ...instruction, body: d.body });
    }
    return { all, active, issues };
  }
}
