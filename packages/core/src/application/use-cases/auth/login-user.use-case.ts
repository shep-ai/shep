import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { PmUser, PmSession } from '../../../domain/generated/output.js';
import type { IPmUserRepository } from '../../ports/output/repositories/pm-user-repository.interface.js';
import type { IPmSessionRepository } from '../../ports/output/repositories/pm-session-repository.interface.js';
import { verifyPassword } from './register-user.use-case.js';

export interface LoginUserInput {
  email: string;
  password: string;
}

export type LoginUserResult =
  | { ok: true; session: PmSession; user: Omit<PmUser, 'passwordHash'> }
  | { ok: false; error: string };

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@injectable()
export class LoginUserUseCase {
  constructor(
    @inject('IPmUserRepository') private readonly userRepo: IPmUserRepository,
    @inject('IPmSessionRepository') private readonly sessionRepo: IPmSessionRepository
  ) {}

  async execute(input: LoginUserInput): Promise<LoginUserResult> {
    const trimmedEmail = input.email.trim().toLowerCase();
    if (!trimmedEmail) {
      return { ok: false, error: 'Email is required.' };
    }

    const user = await this.userRepo.findByEmail(trimmedEmail);
    if (!user) {
      return { ok: false, error: 'Invalid email or password.' };
    }

    if (!verifyPassword(input.password, user.passwordHash)) {
      return { ok: false, error: 'Invalid email or password.' };
    }

    const now = new Date();
    const session: PmSession = {
      id: randomUUID(),
      userId: user.id,
      token: randomUUID(),
      expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
      createdAt: now,
      updatedAt: now,
    };

    await this.sessionRepo.create(session);

    const { passwordHash: _hash, ...safeUser } = user;
    return { ok: true, session, user: safeUser };
  }
}
