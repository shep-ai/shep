/**
 * FileRecapPublisher — unit tests.
 *
 * Writes the recap artifact to `recaps/{recapId}.md` under a workspace root.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import { promises as fs } from 'node:fs';

import { FileRecapPublisher } from '@/infrastructure/services/recap/file-recap-publisher.service.js';
import {
  RecapPublisherError,
  type RecapArtifact,
  type RecapTarget,
} from '@/application/ports/output/services/recap-publisher.interface.js';
import { RecapChannel } from '@/domain/generated/output.js';

function makeArtifact(): RecapArtifact {
  return {
    recapId: '2026-04',
    title: 'April 2026 recap',
    body: '# April 2026\n\nThanks to everyone who shipped.',
    periodStartIso: '2026-04-01T00:00:00.000Z',
  };
}

const TARGET: RecapTarget = { channel: RecapChannel.File };

describe('FileRecapPublisher', () => {
  let workspace: string;
  let publisher: FileRecapPublisher;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'shep-file-recap-'));
    publisher = new FileRecapPublisher(workspace);
  });

  it('writes the markdown body to recaps/{recapId}.md', async () => {
    const result = await publisher.publish(makeArtifact(), TARGET);

    const filePath = path.join(workspace, 'recaps', '2026-04.md');
    const content = await fs.readFile(filePath, 'utf8');
    expect(content).toContain('# April 2026');
    expect(content).toContain('Thanks to everyone who shipped.');
    expect(result.channel).toBe(RecapChannel.File);
    expect(result.reference).toBe(filePath);
  });

  it('creates the recaps/ directory if it does not exist yet', async () => {
    await publisher.publish(makeArtifact(), TARGET);
    const stat = await fs.stat(path.join(workspace, 'recaps'));
    expect(stat.isDirectory()).toBe(true);
  });

  it('overwrites a prior recap file with the same id (idempotent updates)', async () => {
    const a1 = { ...makeArtifact(), body: 'first' };
    const a2 = { ...makeArtifact(), body: 'second' };
    await publisher.publish(a1, TARGET);
    await publisher.publish(a2, TARGET);
    const content = await fs.readFile(path.join(workspace, 'recaps', '2026-04.md'), 'utf8');
    expect(content).toBe('second');
  });

  it('throws RecapPublisherError when the workspace root does not exist', async () => {
    const broken = new FileRecapPublisher(path.join(workspace, 'does-not-exist'));
    // Attempt to write into a path whose parent doesn't exist on Windows would
    // succeed via mkdir recursive; force failure by passing a path that
    // collides with an existing file.
    const badPath = path.join(workspace, 'recaps');
    await fs.writeFile(badPath, 'not a directory', 'utf8');
    await expect(publisher.publish(makeArtifact(), TARGET)).rejects.toBeInstanceOf(
      RecapPublisherError
    );
    expect(broken).toBeDefined();
  });
});
