import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ValidateSessionUseCase } from '@/application/use-cases/auth/validate-session.use-case.js';
import type { IPmUserRepository } from '@/application/ports/output/repositories/pm-user-repository.interface.js';
import type { IPmSessionRepository } from '@/application/ports/output/repositories/pm-session-repository.interface.js';
import type { PmSession, PmUser } from '@/domain/generated/output.js';

function createMockUserRepo(): IPmUserRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    findByEmail: vi.fn().mockResolvedValue(null),
    findSystemUser: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(undefined),
    softDelete: vi.fn().mockResolvedValue(undefined),
  };
}

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

function makeUser(): PmUser {
  return {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: 'salt:hash',
    displayName: 'Test User',
    isSystemUser: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeSession(): PmSession {
  return {
    id: 'session-1',
    userId: 'user-1',
    token: 'valid-token',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('ValidateSessionUseCase', () => {
  let useCase: ValidateSessionUseCase;
  let userRepo: IPmUserRepository;
  let sessionRepo: IPmSessionRepository;

  beforeEach(() => {
    userRepo = createMockUserRepo();
    sessionRepo = createMockSessionRepo();
    useCase = new ValidateSessionUseCase(userRepo, sessionRepo);
  });

  it('returns user for valid session', async () => {
    vi.mocked(sessionRepo.findValidByToken).mockResolvedValue(makeSession());
    vi.mocked(userRepo.findById).mockResolvedValue(makeUser());

    const result = await useCase.execute('valid-token');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.email).toBe('test@example.com');
      expect((result.user as PmUser).passwordHash).toBeUndefined();
    }
  });

  it('returns error for empty token', async () => {
    const result = await useCase.execute('');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('token');
    }
  });

  it('returns error for invalid/expired session', async () => {
    const result = await useCase.execute('expired-token');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('invalid or expired');
    }
  });

  it('returns error when user not found for session', async () => {
    vi.mocked(sessionRepo.findValidByToken).mockResolvedValue(makeSession());
    vi.mocked(userRepo.findById).mockResolvedValue(null);

    const result = await useCase.execute('valid-token');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('User not found');
    }
  });
});
