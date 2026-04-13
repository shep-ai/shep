import { injectable, inject } from 'tsyringe';
import { randomUUID, createHash } from 'node:crypto';
import type { PmUser } from '../../../domain/generated/output.js';
import type { IPmUserRepository } from '../../ports/output/repositories/pm-user-repository.interface.js';

export interface RegisterUserInput {
  email: string;
  password: string;
  displayName: string;
}

export type RegisterUserResult =
  | { ok: true; user: Omit<PmUser, 'passwordHash'> }
  | { ok: false; error: string };

@injectable()
export class RegisterUserUseCase {
  constructor(@inject('IPmUserRepository') private readonly userRepo: IPmUserRepository) {}

  async execute(input: RegisterUserInput): Promise<RegisterUserResult> {
    const trimmedEmail = input.email.trim().toLowerCase();
    if (!trimmedEmail?.includes('@')) {
      return { ok: false, error: 'A valid email address is required.' };
    }

    const trimmedName = input.displayName.trim();
    if (!trimmedName) {
      return { ok: false, error: 'Display name is required.' };
    }

    if (input.password.length < 8) {
      return { ok: false, error: 'Password must be at least 8 characters.' };
    }

    const existing = await this.userRepo.findByEmail(trimmedEmail);
    if (existing) {
      return { ok: false, error: 'An account with this email already exists.' };
    }

    const passwordHash = hashPassword(input.password);
    const now = new Date();
    const user: PmUser = {
      id: randomUUID(),
      email: trimmedEmail,
      passwordHash,
      displayName: trimmedName,
      isSystemUser: false,
      createdAt: now,
      updatedAt: now,
    };

    await this.userRepo.create(user);

    const { passwordHash: _hash, ...safeUser } = user;
    return { ok: true, user: safeUser };
  }
}

/**
 * Simple password hashing using SHA-256 with a salt.
 * In production, bcrypt/scrypt/argon2 would be preferred.
 * For a local single-developer tool this is sufficient.
 */
function hashPassword(password: string): string {
  const salt = randomUUID();
  const hash = createHash('sha256')
    .update(salt + password)
    .digest('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a stored hash.
 * Exported for use by the login use case.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const computed = createHash('sha256')
    .update(salt + password)
    .digest('hex');
  return computed === hash;
}
