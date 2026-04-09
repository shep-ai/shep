/**
 * Application Brief Store Implementation
 *
 * Concrete adapter for {@link IApplicationBriefStore}. Writes briefs
 * under `<SHEP_HOME>/application-briefs/<applicationId>.md`.
 *
 * Keeping briefs in the Shep home directory (instead of inside the
 * scaffolded project) gives us three wins:
 *   1. The user's project stays clean — no stray `SHEP_BRIEF.md`
 *      committed alongside their source code.
 *   2. Briefs are auditable and survive project deletion.
 *   3. Test isolation via `SHEP_HOME=<tmp>` works automatically.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { injectable } from 'tsyringe';

import type { IApplicationBriefStore } from '../../../application/ports/output/services/application-brief-store.interface.js';
import { getShepHomeDir } from './shep-directory.service.js';

/** Subdirectory (under Shep home) that holds one file per application. */
export const APPLICATION_BRIEFS_DIRNAME = 'application-briefs';

@injectable()
export class ApplicationBriefStore implements IApplicationBriefStore {
  async write(applicationId: string, content: string): Promise<string> {
    if (!applicationId?.trim()) {
      throw new Error('ApplicationBriefStore.write: applicationId is required');
    }

    const briefPath = join(getShepHomeDir(), APPLICATION_BRIEFS_DIRNAME, `${applicationId}.md`);

    await mkdir(dirname(briefPath), { recursive: true });
    await writeFile(briefPath, content, 'utf-8');

    return briefPath;
  }
}
