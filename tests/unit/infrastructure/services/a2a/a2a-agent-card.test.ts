/**
 * A2A agent card (spec 149): served at /.well-known/agent-card.json.
 */

import { describe, it, expect } from 'vitest';
import { buildAgentCard } from '@/infrastructure/services/a2a/a2a-agent-card.js';

describe('buildAgentCard', () => {
  const card = buildAgentCard({ baseUrl: 'http://localhost:4050/', version: '1.250.0' });

  it('has every field A2A 1.0 requires', () => {
    for (const field of [
      'name',
      'description',
      'supportedInterfaces',
      'version',
      'capabilities',
      'defaultInputModes',
      'defaultOutputModes',
      'skills',
    ]) {
      expect(card, field).toHaveProperty(field);
    }
    expect(card.version).toBe('1.250.0');
  });

  it('offers the JSON-RPC binding at /api/a2a, speaking 1.0', () => {
    expect(card.supportedInterfaces).toEqual([
      { url: 'http://localhost:4050/api/a2a', protocolBinding: 'JSONRPC', protocolVersion: '1.0' },
    ]);
  });

  it('streams, has no push notifications or extended card, and asks for the bearer token', () => {
    expect(card.capabilities).toEqual({
      streaming: true,
      pushNotifications: false,
      extendedAgentCard: false,
    });
    expect(card.securitySchemes).toEqual({
      shepToken: { httpAuthSecurityScheme: { scheme: 'Bearer', description: expect.any(String) } },
    });
    expect(card.securityRequirements).toEqual([{ schemes: { shepToken: { list: [] } } }]);
  });

  it('names its skills', () => {
    expect(card.skills.map((s) => s.id)).toEqual(['build-feature', 'steer-feature']);
    for (const skill of card.skills) {
      expect(skill.name).toBeTruthy();
      expect(skill.description).toBeTruthy();
      expect(skill.tags.length).toBeGreaterThan(0);
    }
  });
});
