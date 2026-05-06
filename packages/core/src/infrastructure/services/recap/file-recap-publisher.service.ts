/**
 * FileRecapPublisher
 *
 * Writes a recap artifact to `recaps/{recapId}.md` inside the workspace
 * root. The simplest of the three recap channels — single source of truth
 * for the markdown body that other channels reference.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { RecapChannel } from '../../../domain/generated/output.js';
import {
  RecapPublisherError,
  type IRecapPublisher,
  type RecapArtifact,
  type RecapPublishResult,
  type RecapTarget,
} from '../../../application/ports/output/services/recap-publisher.interface.js';

const RECAPS_DIRNAME = 'recaps';

export class FileRecapPublisher implements IRecapPublisher {
  readonly channel = RecapChannel.File;

  constructor(private readonly workspaceRoot: string) {}

  async publish(artifact: RecapArtifact, target: RecapTarget): Promise<RecapPublishResult> {
    if (target.channel !== RecapChannel.File) {
      throw new RecapPublisherError(
        `FileRecapPublisher cannot handle channel ${target.channel}`,
        this.channel
      );
    }
    const dir = path.join(this.workspaceRoot, RECAPS_DIRNAME);
    const filePath = path.join(dir, `${artifact.recapId}.md`);
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, artifact.body, 'utf8');
    } catch (err) {
      throw new RecapPublisherError(
        `Failed to write recap file ${filePath}`,
        this.channel,
        err instanceof Error ? err : new Error(String(err))
      );
    }
    return { channel: this.channel, reference: filePath };
  }
}
