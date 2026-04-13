import { injectable, inject } from 'tsyringe';
import type { IPmSessionRepository } from '../../ports/output/repositories/pm-session-repository.interface.js';

export type LogoutUserResult = { ok: true } | { ok: false; error: string };

@injectable()
export class LogoutUserUseCase {
  constructor(@inject('IPmSessionRepository') private readonly sessionRepo: IPmSessionRepository) {}

  async execute(sessionToken: string): Promise<LogoutUserResult> {
    if (!sessionToken) {
      return { ok: false, error: 'Session token is required.' };
    }

    const session = await this.sessionRepo.findByToken(sessionToken);
    if (!session) {
      return { ok: false, error: 'Session not found.' };
    }

    await this.sessionRepo.softDelete(session.id);
    return { ok: true };
  }
}
