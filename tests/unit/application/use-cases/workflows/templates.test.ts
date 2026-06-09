import { describe, it, expect } from 'vitest';
import { getIssueTriageTemplate } from '@shepai/core/application/use-cases/scheduled-workflows/templates/issue-triage.template.js';
import { getBranchRebaseTemplate } from '@shepai/core/application/use-cases/scheduled-workflows/templates/branch-rebase.template.js';

describe('Workflow Templates', () => {
  describe('issueTriage template', () => {
    it('returns object with expected name and toolConstraints', () => {
      const template = getIssueTriageTemplate();

      expect(template.name).toBe('issue-triage');
      expect(template.toolConstraints).toEqual(['git', 'github']);
    });

    it('has a non-empty prompt', () => {
      const template = getIssueTriageTemplate();

      expect(template.prompt).toBeDefined();
      expect(template.prompt.length).toBeGreaterThan(0);
    });

    it('has a description', () => {
      const template = getIssueTriageTemplate();

      expect(template.description).toBeDefined();
      expect(template.description!.length).toBeGreaterThan(0);
    });
  });

  describe('branchRebase template', () => {
    it('returns object with expected name and toolConstraints', () => {
      const template = getBranchRebaseTemplate();

      expect(template.name).toBe('branch-rebase');
      expect(template.toolConstraints).toEqual(['git']);
    });

    it('has a non-empty prompt', () => {
      const template = getBranchRebaseTemplate();

      expect(template.prompt).toBeDefined();
      expect(template.prompt.length).toBeGreaterThan(0);
    });

    it('has a description', () => {
      const template = getBranchRebaseTemplate();

      expect(template.description).toBeDefined();
      expect(template.description!.length).toBeGreaterThan(0);
    });
  });

  it('both templates have distinct names', () => {
    const triage = getIssueTriageTemplate();
    const rebase = getBranchRebaseTemplate();

    expect(triage.name).not.toBe(rebase.name);
  });
});
