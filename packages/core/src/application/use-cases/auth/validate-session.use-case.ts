import { injectable, inject } from 'tsyringe';
import type { PmUser } from '../../../domain/generated/output.js';
import type { IPmUserRepository } from '../../ports/output/repositories/pm-user-repository.interface.js';
import type { IPmSessionRepository } from '../../ports/output/repositories/pm-session-repository.interface.js';

export type ValidateSessionResult =
  | { ok: true; user: Omit<PmUser, 'passwordHash'> }
  | { ok: false; error: string };

@injectable()
export class ValidateSessionUseCase {
  constructor(
    @inject('IPmUserRepository') private readonly userRepo: IPmUserRepository,
    @inject('IPmSessionRepository') private readonly sessionRepo: IPmSessionRepository
  ) {}

  async execute(sessionToken: string): Promise<ValidateSessionResult> {
    if (!sessionToken) {
      return { ok: false, error: 'Session token is required.' };
    }

    const session = await this.sessionRepo.findValidByToken(sessionToken);
    if (!session) {
      return { ok: false, error: 'Session is invalid or expired.' };
    }

    const user = await this.userRepo.findById(session.userId);
    if (!user) {
      return { ok: false, error: 'User not found.' };
    }

    const { passwordHash: _hash, ...safeUser } = user;
    return { ok: true, user: safeUser };
  }
}
