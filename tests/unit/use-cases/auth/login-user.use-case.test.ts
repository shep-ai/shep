import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoginUserUseCase } from '@/application/use-cases/auth/login-user.use-case.js';
import { RegisterUserUseCase } from '@/application/use-cases/auth/register-user.use-case.js';
import type { IPmUserRepository } from '@/application/ports/output/repositories/pm-user-repository.interface.js';
import type { IPmSessionRepository } from '@/application/ports/output/repositories/pm-session-repository.interface.js';
import type { PmUser } from '@/domain/generated/output.js';

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

describe('LoginUserUseCase', () => {
  let loginUseCase: LoginUserUseCase;
  let userRepo: IPmUserRepository;
  let sessionRepo: IPmSessionRepository;

  beforeEach(() => {
    userRepo = createMockUserRepo();
    sessionRepo = createMockSessionRepo();
    loginUseCase = new LoginUserUseCase(userRepo, sessionRepo);
  });

  it('returns error for empty email', async () => {
    const result = await loginUseCase.execute({ email: '', password: 'password123' });
    expect(result.ok).toBe(false);
  });

  it('returns error for non-existent user', async () => {
    const result = await loginUseCase.execute({
      email: 'nobody@example.com',
      password: 'password123',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Invalid email or password');
    }
  });

  it('returns error for wrong password', async () => {
    // Register a user first to get a proper hash
    const registerUseCase = new RegisterUserUseCase(userRepo);
    let createdUser: PmUser | null = null;
    vi.mocked(userRepo.create).mockImplementation(async (u) => {
      createdUser = u;
    });

    await registerUseCase.execute({
      email: 'test@example.com',
      password: 'correctpassword',
      displayName: 'Test User',
    });

    // Now mock findByEmail to return that user
    vi.mocked(userRepo.findByEmail).mockResolvedValue(createdUser!);

    const result = await loginUseCase.execute({
      email: 'test@example.com',
      password: 'wrongpassword',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Invalid email or password');
    }
  });

  it('succeeds with correct credentials and creates session', async () => {
    // Register a user
    const registerUseCase = new RegisterUserUseCase(userRepo);
    let createdUser: PmUser | null = null;
    vi.mocked(userRepo.create).mockImplementation(async (u) => {
      createdUser = u;
    });

    await registerUseCase.execute({
      email: 'test@example.com',
      password: 'password123',
      displayName: 'Test User',
    });

    vi.mocked(userRepo.findByEmail).mockResolvedValue(createdUser!);

    const result = await loginUseCase.execute({
      email: 'test@example.com',
      password: 'password123',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.token).toBeDefined();
      expect(result.session.userId).toBe(createdUser!.id);
      expect(result.user.email).toBe('test@example.com');
      expect((result.user as PmUser).passwordHash).toBeUndefined();
    }
    expect(sessionRepo.create).toHaveBeenCalledTimes(1);
  });
});
