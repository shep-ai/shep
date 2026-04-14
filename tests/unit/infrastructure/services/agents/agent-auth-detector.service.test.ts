/**
 * PlatformAgentAuthDetectorService Unit Tests
 *
 * Tests for SDK agent auth detection — verifies that SDK agent types
 * return authenticated=true when binaryName is null (no binary to check).
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { PlatformAgentAuthDetectorService } from '@/infrastructure/services/agent-auth-detector/platform-agent-auth-detector.service.js';
import { AgentType } from '@/domain/generated/output.js';

describe('PlatformAgentAuthDetectorService', () => {
  const detector = new PlatformAgentAuthDetectorService();

  describe('SDK agent types', () => {
    it('should return true for openrouter with null binaryName', async () => {
      const result = await detector.isAuthenticated(AgentType.OpenRouter, null);

      expect(result).toBe(true);
    });

    it('should return true for together-ai with null binaryName', async () => {
      const result = await detector.isAuthenticated(AgentType.TogetherAi, null);

      expect(result).toBe(true);
    });
  });

  describe('existing agent types', () => {
    it('should return true for dev with null binaryName', async () => {
      const result = await detector.isAuthenticated(AgentType.Dev, null);

      expect(result).toBe(true);
    });
  });
});
