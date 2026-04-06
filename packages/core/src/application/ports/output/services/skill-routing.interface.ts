/**
 * Skill Routing Service Interface
 *
 * Output port for phase-aware skill routing. Maintains a mapping of
 * workflow phases to relevant skill sets and generates prompt directives
 * that guide the agent to prioritize phase-relevant skills.
 *
 * Following Clean Architecture:
 * - Application layer depends on this interface
 * - Infrastructure layer provides static mapping with settings override
 */

/**
 * Result of generating a skill routing directive for a phase.
 */
export interface SkillRoutingResult {
  /** Ordered list of skill names relevant to the current phase */
  relevantSkills: string[];
  /** Prompt directive text to prepend/inject into the prompt */
  directive: string;
}

/**
 * Service interface for phase-aware skill routing.
 *
 * Maps workflow phases to relevant skill sets using a default routing
 * table that can be overridden via settings. Generates a prompt directive
 * listing which skills are relevant for the current phase.
 */
export interface ISkillRoutingService {
  /**
   * Get relevant skills and a prompt directive for a workflow phase.
   *
   * Looks up the phase in the routing table and returns an ordered
   * list of relevant skills plus a formatted directive for the prompt.
   * Unknown phases return a generic directive with no specific skills.
   *
   * @param phaseName - Current workflow phase (e.g., 'analyze', 'implement')
   * @returns Relevant skills and prompt directive text
   */
  getRoutingDirective(phaseName: string): SkillRoutingResult;
}
