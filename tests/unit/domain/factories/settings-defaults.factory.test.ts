/**
 * Settings Defaults Factory Unit Tests
 *
 * Tests for the createDefaultSettings factory function that generates
 * Settings entities with sensible defaults matching the TypeSpec model.
 *
 * TDD Phase: RED
 * - These tests are written BEFORE implementation
 * - All tests should FAIL initially (factory doesn't exist yet)
 */

import { describe, it, expect } from 'vitest';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';
import type {
  Settings,
  ModelConfiguration,
  UserProfile,
  EnvironmentConfig,
  SystemConfig,
} from '@/domain/generated/output.js';
import { AgentType, AgentAuthMethod, SkillSourceType } from '@/domain/generated/output.js';

describe('createDefaultSettings', () => {
  describe('return type and structure', () => {
    it('should return an object with all required fields', () => {
      // Act
      const settings = createDefaultSettings();

      // Assert
      expect(settings).toBeDefined();
      expect(settings).toHaveProperty('id');
      expect(settings).toHaveProperty('models');
      expect(settings).toHaveProperty('user');
      expect(settings).toHaveProperty('environment');
      expect(settings).toHaveProperty('system');
      expect(settings).toHaveProperty('createdAt');
      expect(settings).toHaveProperty('updatedAt');
    });

    it('should return a Settings type that matches generated types', () => {
      // Act
      const settings: Settings = createDefaultSettings();

      // Assert - TypeScript compilation validates the type
      expect(settings).toBeDefined();
    });

    it('should generate unique IDs for each call', () => {
      // Act
      const settings1 = createDefaultSettings();
      const settings2 = createDefaultSettings();

      // Assert
      expect(settings1.id).not.toBe(settings2.id);
      expect(settings1.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(settings2.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should set createdAt and updatedAt timestamps', () => {
      // Arrange
      const beforeCreation = new Date();

      // Act
      const settings = createDefaultSettings();

      // Assert
      const afterCreation = new Date();
      expect(settings.createdAt).toBeInstanceOf(Date);
      expect(settings.updatedAt).toBeInstanceOf(Date);
      expect(settings.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreation.getTime());
      expect(settings.createdAt.getTime()).toBeLessThanOrEqual(afterCreation.getTime());
      expect(settings.updatedAt).toEqual(settings.createdAt);
    });
  });

  describe('ModelConfiguration defaults', () => {
    it('should set default model field to "claude-sonnet-4-6"', () => {
      // Act
      const settings = createDefaultSettings();
      const models: ModelConfiguration = settings.models;

      // Assert
      expect(models).toBeDefined();
      expect(models.default).toBe('claude-sonnet-4-6');
      expect((models as Record<string, unknown>).analyze).toBeUndefined();
      expect((models as Record<string, unknown>).requirements).toBeUndefined();
      expect((models as Record<string, unknown>).plan).toBeUndefined();
      expect((models as Record<string, unknown>).implement).toBeUndefined();
    });

    it('should match TypeSpec model defaults', () => {
      // Act
      const settings = createDefaultSettings();

      // Assert - Verify all fields match TypeSpec defaults
      expect(settings.models).toEqual({
        default: 'claude-sonnet-4-6',
      });
    });
  });

  describe('UserProfile defaults', () => {
    it('should set all user fields to undefined (optional fields)', () => {
      // Act
      const settings = createDefaultSettings();
      const user: UserProfile = settings.user;

      // Assert
      expect(user).toBeDefined();
      expect(user.name).toBeUndefined();
      expect(user.email).toBeUndefined();
      expect(user.githubUsername).toBeUndefined();
    });

    it('should return empty UserProfile object', () => {
      // Act
      const settings = createDefaultSettings();

      // Assert
      expect(settings.user).toEqual({});
    });
  });

  describe('EnvironmentConfig defaults', () => {
    it('should set defaultEditor to "vscode"', () => {
      // Act
      const settings = createDefaultSettings();
      const environment: EnvironmentConfig = settings.environment;

      // Assert
      expect(environment).toBeDefined();
      expect(environment.defaultEditor).toBe('vscode');
    });

    it('should set shellPreference to "bash"', () => {
      // Act
      const settings = createDefaultSettings();

      // Assert
      expect(settings.environment.shellPreference).toBe('bash');
    });

    it('should set defaultCloneDirectory to homedir/repos', () => {
      // Act
      const settings = createDefaultSettings();

      // Assert
      expect(settings.environment.defaultCloneDirectory).toBe('~/repos');
    });

    it('should match TypeSpec model defaults', () => {
      // Act
      const settings = createDefaultSettings();

      // Assert
      expect(settings.environment).toEqual({
        defaultEditor: 'vscode',
        shellPreference: 'bash',
        terminalPreference: 'system',
        defaultCloneDirectory: '~/repos',
      });
    });
  });

  describe('SystemConfig defaults', () => {
    it('should set autoUpdate to true', () => {
      // Act
      const settings = createDefaultSettings();
      const system: SystemConfig = settings.system;

      // Assert
      expect(system).toBeDefined();
      expect(system.autoUpdate).toBe(true);
    });

    it('should set logLevel to "info"', () => {
      // Act
      const settings = createDefaultSettings();

      // Assert
      expect(settings.system.logLevel).toBe('info');
    });

    it('should match TypeSpec model defaults', () => {
      // Act
      const settings = createDefaultSettings();

      // Assert
      expect(settings.system).toEqual({
        autoUpdate: true,
        logLevel: 'info',
      });
    });
  });

  describe('AgentConfig defaults', () => {
    it('should have agent field defined', () => {
      // Act
      const settings = createDefaultSettings();

      // Assert
      expect(settings.agent).toBeDefined();
    });

    it('should set agent type to claude-code', () => {
      // Act
      const settings = createDefaultSettings();

      // Assert
      expect(settings.agent.type).toBe(AgentType.ClaudeCode);
    });

    it('should set agent authMethod to session', () => {
      // Act
      const settings = createDefaultSettings();

      // Assert
      expect(settings.agent.authMethod).toBe(AgentAuthMethod.Session);
    });

    it('should have token as undefined', () => {
      // Act
      const settings = createDefaultSettings();

      // Assert
      expect(settings.agent.token).toBeUndefined();
    });

    it('should match TypeSpec model defaults', () => {
      // Act
      const settings = createDefaultSettings();

      // Assert
      expect(settings.agent).toEqual({
        type: AgentType.ClaudeCode,
        authMethod: AgentAuthMethod.Session,
      });
    });
  });

  describe('NotificationPreferences defaults', () => {
    it('should have notifications field defined', () => {
      // Act
      const settings = createDefaultSettings();

      // Assert
      expect(settings.notifications).toBeDefined();
    });

    it('should have all notification channels enabled (opt-out)', () => {
      // Act
      const settings = createDefaultSettings();

      // Assert
      expect(settings.notifications.inApp.enabled).toBe(true);
      expect(settings.notifications.browser.enabled).toBe(true);
      expect(settings.notifications.desktop.enabled).toBe(false);
    });

    it('should have all notification event types enabled', () => {
      // Act
      const settings = createDefaultSettings();

      // Assert
      expect(settings.notifications.events.agentStarted).toBe(true);
      expect(settings.notifications.events.phaseCompleted).toBe(true);
      expect(settings.notifications.events.waitingApproval).toBe(true);
      expect(settings.notifications.events.agentCompleted).toBe(true);
      expect(settings.notifications.events.agentFailed).toBe(true);
      expect(settings.notifications.events.prMerged).toBe(true);
      expect(settings.notifications.events.prClosed).toBe(true);
      expect(settings.notifications.events.prChecksPassed).toBe(true);
      expect(settings.notifications.events.prChecksFailed).toBe(true);
    });

    it('should match TypeSpec model defaults', () => {
      // Act
      const settings = createDefaultSettings();

      // Assert
      expect(settings.notifications).toEqual({
        inApp: { enabled: true },
        browser: { enabled: true },
        desktop: { enabled: false },
        events: {
          agentStarted: true,
          phaseCompleted: true,
          waitingApproval: true,
          agentCompleted: true,
          agentFailed: true,
          prMerged: true,
          prClosed: true,
          prChecksPassed: true,
          prChecksFailed: true,
          prBlocked: true,
          mergeReviewReady: true,
        },
      });
    });
  });

  describe('FeatureFlags defaults', () => {
    it('should have featureFlags field defined', () => {
      const settings = createDefaultSettings();
      expect(settings.featureFlags).toBeDefined();
    });

    it('should default feature flags with envDeploy enabled', () => {
      const settings = createDefaultSettings();
      expect(settings.featureFlags).toEqual({
        skills: false,
        envDeploy: true,
        debug: false,
        githubImport: false,
        adoptBranch: false,
        gitRebaseSync: false,
        reactFileManager: false,
        inventory: false,
      });
    });
  });

  describe('WorkflowConfig defaults', () => {
    it('should default workflow.defaultMode to Fast', () => {
      const settings = createDefaultSettings();
      expect(settings.workflow.defaultMode).toBe('Fast');
    });

    it('should default workflow.explorationMaxIterations to 10', () => {
      const settings = createDefaultSettings();
      expect(settings.workflow.explorationMaxIterations).toBe(10);
    });

    it('should include all workflow defaults', () => {
      const settings = createDefaultSettings();
      expect(settings.workflow).toEqual({
        openPrOnImplementationComplete: false,
        approvalGateDefaults: {
          allowPrd: false,
          allowPlan: false,
          allowMerge: false,
          pushOnImplementationComplete: false,
        },
        ciWatchEnabled: true,
        enableEvidence: false,
        commitEvidence: false,
        defaultMode: 'Fast',
        explorationMaxIterations: 10,
        autoArchiveDelayMinutes: 10,
        skillInjection: {
          enabled: false,
          skills: [
            {
              name: 'architecture-reviewer',
              type: SkillSourceType.Remote,
              source: 'shep-ai/shep',
              remoteSkillName: 'architecture-reviewer',
            },
            {
              name: 'cross-validate-artifacts',
              type: SkillSourceType.Remote,
              source: 'shep-ai/shep',
              remoteSkillName: 'cross-validate-artifacts',
            },
            {
              name: 'mermaid-diagrams',
              type: SkillSourceType.Remote,
              source: 'shep-ai/shep',
              remoteSkillName: 'mermaid-diagrams',
            },
            {
              name: 'react-flow',
              type: SkillSourceType.Remote,
              source: 'shep-ai/shep',
              remoteSkillName: 'react-flow',
            },
            {
              name: 'shadcn-ui',
              type: SkillSourceType.Remote,
              source: 'shep-ai/shep',
              remoteSkillName: 'shadcn-ui',
            },
            {
              name: 'tsp-model',
              type: SkillSourceType.Remote,
              source: 'shep-ai/shep',
              remoteSkillName: 'tsp-model',
            },
            {
              name: 'vercel-react-best-practices',
              type: SkillSourceType.Remote,
              source: 'shep-ai/shep',
              remoteSkillName: 'vercel-react-best-practices',
            },
            {
              name: 'frontend-design',
              type: SkillSourceType.Remote,
              source: 'anthropics/claude-code',
              remoteSkillName: 'frontend-design',
            },
          ],
        },
      });
    });
  });

  describe('SkillInjectionConfig defaults', () => {
    it('should have skillInjection defined on workflow', () => {
      const settings = createDefaultSettings();
      expect(settings.workflow.skillInjection).toBeDefined();
    });

    it('should have skillInjection.enabled set to false', () => {
      const settings = createDefaultSettings();
      expect(settings.workflow.skillInjection!.enabled).toBe(false);
    });

    it('should have 8 default skills', () => {
      const settings = createDefaultSettings();
      expect(settings.workflow.skillInjection!.skills).toHaveLength(8);
    });

    it('should have all skills as remote type', () => {
      const settings = createDefaultSettings();
      const remoteSkills = settings.workflow.skillInjection!.skills.filter(
        (s) => s.type === SkillSourceType.Remote
      );
      expect(remoteSkills).toHaveLength(8);
    });

    it('should have each remote skill with a remoteSkillName matching its name', () => {
      const settings = createDefaultSettings();
      for (const skill of settings.workflow.skillInjection!.skills) {
        expect(skill.remoteSkillName).toBe(skill.name);
      }
    });

    it('should have remote frontend-design skill with correct source and skill name', () => {
      const settings = createDefaultSettings();
      const remoteSkill = settings.workflow.skillInjection!.skills.find(
        (s) => s.name === 'frontend-design'
      );
      expect(remoteSkill).toBeDefined();
      expect(remoteSkill!.type).toBe(SkillSourceType.Remote);
      expect(remoteSkill!.source).toBe('anthropics/claude-code');
      expect(remoteSkill!.remoteSkillName).toBe('frontend-design');
    });

    it('should include the expected skill names', () => {
      const settings = createDefaultSettings();
      const names = settings.workflow.skillInjection!.skills.map((s) => s.name);
      expect(names).toEqual([
        'architecture-reviewer',
        'cross-validate-artifacts',
        'mermaid-diagrams',
        'react-flow',
        'shadcn-ui',
        'tsp-model',
        'vercel-react-best-practices',
        'frontend-design',
      ]);
    });
  });

  describe('complete default object', () => {
    it('should return complete Settings object matching all TypeSpec defaults', () => {
      // Act
      const settings = createDefaultSettings();

      // Assert - Verify entire structure (except id and timestamps)
      expect(settings.models).toEqual({
        default: 'claude-sonnet-4-6',
      });
      expect(settings.user).toEqual({});
      expect(settings.environment).toEqual({
        defaultEditor: 'vscode',
        shellPreference: 'bash',
        terminalPreference: 'system',
        defaultCloneDirectory: '~/repos',
      });
      expect(settings.system).toEqual({
        autoUpdate: true,
        logLevel: 'info',
      });
      expect(settings.agent).toEqual({
        type: AgentType.ClaudeCode,
        authMethod: AgentAuthMethod.Session,
      });
      expect(settings.notifications).toEqual({
        inApp: { enabled: true },
        browser: { enabled: true },
        desktop: { enabled: false },
        events: {
          agentStarted: true,
          phaseCompleted: true,
          waitingApproval: true,
          agentCompleted: true,
          agentFailed: true,
          prMerged: true,
          prClosed: true,
          prChecksPassed: true,
          prChecksFailed: true,
          prBlocked: true,
          mergeReviewReady: true,
        },
      });
    });
  });
});
