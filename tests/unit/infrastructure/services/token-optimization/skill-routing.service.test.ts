/**
 * SkillRoutingService Unit Tests
 *
 * Tests for the phase-aware skill routing service that maps workflow phases
 * to relevant skill sets and generates prompt directives.
 *
 * TDD Phase: RED
 */

import { describe, it, expect } from 'vitest';
import { SkillRoutingService } from '@/infrastructure/services/token-optimization/skill-routing.service.js';

describe('SkillRoutingService', () => {
  const service = new SkillRoutingService();

  // --- Default routing for each phase ---

  describe('default routing table', () => {
    it('should return architecture-reviewer skills for analyze phase', () => {
      const result = service.getRoutingDirective('analyze');
      expect(result.relevantSkills).toContain('architecture-reviewer');
      expect(result.relevantSkills.length).toBeGreaterThan(0);
    });

    it('should return architecture-reviewer skills for requirements phase', () => {
      const result = service.getRoutingDirective('requirements');
      expect(result.relevantSkills).toContain('architecture-reviewer');
      expect(result.relevantSkills.length).toBeGreaterThan(0);
    });

    it('should return architecture-reviewer and technology evaluation skills for research phase', () => {
      const result = service.getRoutingDirective('research');
      expect(result.relevantSkills).toContain('architecture-reviewer');
      expect(result.relevantSkills.length).toBeGreaterThan(0);
    });

    it('should return architecture-reviewer, tdd-guide, and implementation-guide skills for plan phase', () => {
      const result = service.getRoutingDirective('plan');
      expect(result.relevantSkills).toContain('architecture-reviewer');
      expect(result.relevantSkills).toContain('tdd-guide');
      expect(result.relevantSkills).toContain('implementation-guide');
    });

    it('should return tdd-guide and implementation-guide skills for implement phase', () => {
      const result = service.getRoutingDirective('implement');
      expect(result.relevantSkills).toContain('tdd-guide');
      expect(result.relevantSkills).toContain('implementation-guide');
    });

    it('should return tdd-guide and implementation-guide skills for fast-implement phase', () => {
      const result = service.getRoutingDirective('fast-implement');
      expect(result.relevantSkills).toContain('tdd-guide');
      expect(result.relevantSkills).toContain('implementation-guide');
    });

    it('should return git-related skills only for merge phase', () => {
      const result = service.getRoutingDirective('merge');
      expect(result.relevantSkills.length).toBeGreaterThan(0);
      // Merge should NOT include implementation-guide or tdd-guide
      expect(result.relevantSkills).not.toContain('tdd-guide');
      expect(result.relevantSkills).not.toContain('implementation-guide');
      expect(result.relevantSkills).not.toContain('architecture-reviewer');
    });

    it('should return testing and validation skills for evidence phase', () => {
      const result = service.getRoutingDirective('evidence');
      expect(result.relevantSkills.length).toBeGreaterThan(0);
    });
  });

  // --- Prompt directive format ---

  describe('prompt directive generation', () => {
    it('should include relevant skill names in the directive text', () => {
      const result = service.getRoutingDirective('plan');
      expect(result.directive).toContain('architecture-reviewer');
      expect(result.directive).toContain('tdd-guide');
      expect(result.directive).toContain('implementation-guide');
    });

    it('should include phase name in the directive text', () => {
      const result = service.getRoutingDirective('implement');
      expect(result.directive).toContain('implement');
    });

    it('should include a prioritization instruction in the directive', () => {
      const result = service.getRoutingDirective('plan');
      // The directive should tell the agent to prioritize listed skills
      expect(result.directive.toLowerCase()).toMatch(/prioriti[sz]e|focus|relevant/);
    });

    it('should return a non-empty directive for known phases', () => {
      const result = service.getRoutingDirective('analyze');
      expect(result.directive.length).toBeGreaterThan(0);
    });
  });

  // --- Unknown phase fallback ---

  describe('unknown phase handling', () => {
    it('should return empty skill list for unknown phase', () => {
      const result = service.getRoutingDirective('nonexistent-phase');
      expect(result.relevantSkills).toEqual([]);
    });

    it('should return a graceful directive for unknown phase', () => {
      const result = service.getRoutingDirective('nonexistent-phase');
      // Should not throw, should return some directive (possibly empty or generic)
      expect(result.directive).toBeDefined();
      expect(typeof result.directive).toBe('string');
    });

    it('should not throw for empty phase name', () => {
      expect(() => service.getRoutingDirective('')).not.toThrow();
      const result = service.getRoutingDirective('');
      expect(result.relevantSkills).toEqual([]);
    });
  });

  // --- Custom routing table override ---

  describe('custom routing table override', () => {
    it('should use custom routing table when provided', () => {
      const customRoutes: Record<string, string[]> = {
        analyze: ['custom-skill-a', 'custom-skill-b'],
        implement: ['custom-skill-c'],
      };
      const customService = new SkillRoutingService(customRoutes);

      const analyzeResult = customService.getRoutingDirective('analyze');
      expect(analyzeResult.relevantSkills).toEqual(['custom-skill-a', 'custom-skill-b']);

      const implementResult = customService.getRoutingDirective('implement');
      expect(implementResult.relevantSkills).toEqual(['custom-skill-c']);
    });

    it('should return empty list for phases not in custom table', () => {
      const customRoutes: Record<string, string[]> = {
        analyze: ['custom-skill-a'],
      };
      const customService = new SkillRoutingService(customRoutes);

      const result = customService.getRoutingDirective('merge');
      expect(result.relevantSkills).toEqual([]);
    });

    it('should include custom skill names in the directive', () => {
      const customRoutes: Record<string, string[]> = {
        plan: ['my-custom-planner'],
      };
      const customService = new SkillRoutingService(customRoutes);

      const result = customService.getRoutingDirective('plan');
      expect(result.directive).toContain('my-custom-planner');
    });
  });

  // --- Consistency checks ---

  describe('consistency', () => {
    it('should return the same result for repeated calls with the same phase', () => {
      const result1 = service.getRoutingDirective('implement');
      const result2 = service.getRoutingDirective('implement');
      expect(result1.relevantSkills).toEqual(result2.relevantSkills);
      expect(result1.directive).toBe(result2.directive);
    });

    it('should return skills as an array of strings', () => {
      const result = service.getRoutingDirective('plan');
      expect(Array.isArray(result.relevantSkills)).toBe(true);
      for (const skill of result.relevantSkills) {
        expect(typeof skill).toBe('string');
      }
    });
  });
});
