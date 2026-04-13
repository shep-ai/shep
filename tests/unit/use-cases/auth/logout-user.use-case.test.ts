import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogoutUserUseCase } from '@/application/use-cases/auth/logout-user.use-case.js';
import type { IPmSessionRepository } from '@/application/ports/output/repositories/pm-session-repository.interface.js';
import type { PmSession } from '@/domain/generated/output.js';

function createMockSessionRepo(): IPmSessionRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findByToken: vi.fn().mockResolvedValue(null),
    findValidByToken: vi.fn().mockResolvedValue(null),
    listByUser: vi.fn().mockResolvedValue([]),
    softDelete: vi.fn().mockResolvedValue(undefined),
    deleteExpired: vi.fn().mockResolvedValue(0),
  };
}

function makeSession(overrides: Partial<PmSession> = {}): PmSession {
  return {
    id: 'session-1',
    userId: 'user-1',
    token: 'valid-token',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('LogoutUserUseCase', () => {
  let useCase: LogoutUserUseCase;
  let sessionRepo: IPmSessionRepository;

  beforeEach(() => {
    sessionRepo = createMockSessionRepo();
    useCase = new LogoutUserUseCase(sessionRepo);
  });

  it('successfully logs out with valid token', async () => {
    vi.mocked(sessionRepo.findByToken).mockResolvedValue(makeSession());

    const result = await useCase.execute('valid-token');

    expect(result.ok).toBe(true);
    expect(sessionRepo.softDelete).toHaveBeenCalledWith('session-1');
  });

  it('returns error for empty token', async () => {
    const result = await useCase.execute('');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('token');
    }
  });

  it('returns error for non-existent session', async () => {
    const result = await useCase.execute('bad-token');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not found');
    }
  });
});
