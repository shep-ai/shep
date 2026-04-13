import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegisterUserUseCase } from '@/application/use-cases/auth/register-user.use-case.js';
import type { IPmUserRepository } from '@/application/ports/output/repositories/pm-user-repository.interface.js';
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

describe('RegisterUserUseCase', () => {
  let useCase: RegisterUserUseCase;
  let userRepo: IPmUserRepository;

  beforeEach(() => {
    userRepo = createMockUserRepo();
    useCase = new RegisterUserUseCase(userRepo);
  });

  it('registers a new user with valid input', async () => {
    const result = await useCase.execute({
      email: 'test@example.com',
      password: 'password123',
      displayName: 'Test User',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.displayName).toBe('Test User');
      expect(result.user.isSystemUser).toBe(false);
      expect((result.user as PmUser).passwordHash).toBeUndefined();
    }
    expect(userRepo.create).toHaveBeenCalledTimes(1);
  });

  it('rejects empty email', async () => {
    const result = await useCase.execute({
      email: '',
      password: 'password123',
      displayName: 'Test User',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('email');
    }
  });

  it('rejects invalid email', async () => {
    const result = await useCase.execute({
      email: 'notanemail',
      password: 'password123',
      displayName: 'Test User',
    });

    expect(result.ok).toBe(false);
  });

  it('rejects short password', async () => {
    const result = await useCase.execute({
      email: 'test@example.com',
      password: 'short',
      displayName: 'Test User',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('8 characters');
    }
  });

  it('rejects empty display name', async () => {
    const result = await useCase.execute({
      email: 'test@example.com',
      password: 'password123',
      displayName: '   ',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Display name');
    }
  });

  it('rejects duplicate email', async () => {
    vi.mocked(userRepo.findByEmail).mockResolvedValue({
      id: 'existing-id',
      email: 'test@example.com',
      passwordHash: 'hash',
      displayName: 'Existing',
      isSystemUser: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await useCase.execute({
      email: 'test@example.com',
      password: 'password123',
      displayName: 'Test User',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('already exists');
    }
  });

  it('normalizes email to lowercase', async () => {
    const result = await useCase.execute({
      email: 'Test@EXAMPLE.COM',
      password: 'password123',
      displayName: 'Test User',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.email).toBe('test@example.com');
    }
  });
});
