/**
 * Skill Routing Service
 *
 * Phase-aware skill routing that maps workflow phases to relevant skill sets
 * and generates prompt directives guiding the agent to prioritize them.
 *
 * The default routing table follows FR-3 from the spec:
 * - analyze / requirements: architecture-reviewer, domain modeling skills
 * - research: architecture-reviewer, technology evaluation skills
 * - plan: architecture-reviewer, tdd-guide, implementation-guide
 * - implement / fast-implement: tdd-guide, implementation-guide, framework skills
 * - merge: git-related skills only
 * - evidence: testing and validation skills
 *
 * The routing table is configurable via constructor parameter (settings override).
 */

import type {
  ISkillRoutingService,
  SkillRoutingResult,
} from '@/application/ports/output/services/skill-routing.interface.js';

/**
 * Default phase-to-skill routing table (FR-3).
 */
const DEFAULT_ROUTING_TABLE: Readonly<Record<string, readonly string[]>> = {
  analyze: ['architecture-reviewer', 'mermaid-diagrams'],
  requirements: ['architecture-reviewer', 'mermaid-diagrams'],
  research: ['architecture-reviewer', 'find-skills'],
  plan: ['architecture-reviewer', 'tdd-guide', 'implementation-guide'],
  implement: ['tdd-guide', 'implementation-guide', 'shep-kit-implement'],
  'fast-implement': ['tdd-guide', 'implementation-guide', 'shep-kit-fast-loop'],
  merge: ['shep-kit-commit-pr'],
  evidence: ['tdd-guide', 'cross-validate-artifacts'],
};

export class SkillRoutingService implements ISkillRoutingService {
  private readonly routingTable: Readonly<Record<string, readonly string[]>>;

  constructor(customRoutes?: Record<string, string[]>) {
    this.routingTable = customRoutes ?? DEFAULT_ROUTING_TABLE;
  }

  /**
   * Get relevant skills and a prompt directive for a workflow phase.
   */
  getRoutingDirective(phaseName: string): SkillRoutingResult {
    const relevantSkills = [...(this.routingTable[phaseName] ?? [])];

    if (relevantSkills.length === 0) {
      return {
        relevantSkills: [],
        directive: '',
      };
    }

    const skillList = relevantSkills.join(', ');
    const directive =
      `For this [${phaseName}] phase, prioritize these skills: ${skillList}. ` +
      `Other skills are available but less relevant.`;

    return { relevantSkills, directive };
  }
}
