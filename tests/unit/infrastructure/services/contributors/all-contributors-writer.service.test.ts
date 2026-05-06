/**
 * AllContributorsWriter — golden-file unit tests
 *
 * Verifies the in-house writer:
 *   - Appends a brand-new contributor entry to .all-contributorsrc
 *   - Unions contributions for an existing contributor (idempotent on dup)
 *   - Replaces only the content between the README START/END markers
 *   - Leaves surrounding README content untouched
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import { promises as fs } from 'node:fs';

import { AllContributorsWriter } from '@/infrastructure/services/contributors/all-contributors-writer.service.js';
import {
  AllContributorsWriterError,
  type AppendContributorInput,
} from '@/application/ports/output/services/all-contributors-writer.interface.js';

const README_WITH_MARKERS = `# Shep

Some intro text.

## Contributors

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

## License

MIT.
`;

const EMPTY_RC = JSON.stringify(
  {
    projectName: 'shep',
    projectOwner: 'shep-ai',
    repoType: 'github',
    repoHost: 'https://github.com',
    files: ['README.md'],
    imageSize: 100,
    commit: false,
    commitConvention: 'angular',
    contributors: [],
    contributorsPerLine: 7,
  },
  null,
  2
);

async function makeWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shep-allc-test-'));
  await fs.writeFile(path.join(dir, 'README.md'), README_WITH_MARKERS, 'utf8');
  await fs.writeFile(path.join(dir, '.all-contributorsrc'), EMPTY_RC, 'utf8');
  return dir;
}

describe('AllContributorsWriter', () => {
  let workspace: string;
  let writer: AllContributorsWriter;

  beforeEach(async () => {
    workspace = await makeWorkspace();
    writer = new AllContributorsWriter(workspace);
  });

  it('appends a new contributor to an empty list', async () => {
    const input: AppendContributorInput = {
      login: 'octocat',
      contributions: ['code'],
    };

    await writer.appendContributor(input);

    const rc = JSON.parse(
      await fs.readFile(path.join(workspace, '.all-contributorsrc'), 'utf8')
    ) as { contributors: { login: string; contributions: string[] }[] };
    expect(rc.contributors).toHaveLength(1);
    expect(rc.contributors[0]!.login).toBe('octocat');
    expect(rc.contributors[0]!.contributions).toEqual(['code']);
  });

  it('renders the README contributors block between the START/END markers', async () => {
    await writer.appendContributor({ login: 'octocat', contributions: ['code'] });

    const readme = await fs.readFile(path.join(workspace, 'README.md'), 'utf8');
    expect(readme).toContain('<!-- ALL-CONTRIBUTORS-LIST:START');
    expect(readme).toContain('<!-- ALL-CONTRIBUTORS-LIST:END -->');
    expect(readme).toContain('octocat');
    // Surrounding content untouched
    expect(readme.startsWith('# Shep\n')).toBe(true);
    expect(readme.endsWith('## License\n\nMIT.\n')).toBe(true);
  });

  it('is idempotent — reapplying the same input produces no diff', async () => {
    const input: AppendContributorInput = { login: 'octocat', contributions: ['code'] };

    await writer.appendContributor(input);
    const rcAfterFirst = await fs.readFile(path.join(workspace, '.all-contributorsrc'), 'utf8');
    const readmeAfterFirst = await fs.readFile(path.join(workspace, 'README.md'), 'utf8');

    await writer.appendContributor(input);

    expect(await fs.readFile(path.join(workspace, '.all-contributorsrc'), 'utf8')).toEqual(
      rcAfterFirst
    );
    expect(await fs.readFile(path.join(workspace, 'README.md'), 'utf8')).toEqual(readmeAfterFirst);
  });

  it('unions contributions for an existing contributor without duplicating the entry', async () => {
    await writer.appendContributor({ login: 'octocat', contributions: ['code'] });
    await writer.appendContributor({ login: 'octocat', contributions: ['doc', 'code'] });

    const rc = JSON.parse(
      await fs.readFile(path.join(workspace, '.all-contributorsrc'), 'utf8')
    ) as { contributors: { login: string; contributions: string[] }[] };
    expect(rc.contributors).toHaveLength(1);
    expect(rc.contributors[0]!.contributions.sort()).toEqual(['code', 'doc']);
  });

  it('throws AllContributorsWriterError when README markers are missing', async () => {
    await fs.writeFile(path.join(workspace, 'README.md'), '# Shep\nNo markers here.\n', 'utf8');

    await expect(
      writer.appendContributor({ login: 'octocat', contributions: ['code'] })
    ).rejects.toBeInstanceOf(AllContributorsWriterError);
  });

  it('throws AllContributorsWriterError when .all-contributorsrc is malformed JSON', async () => {
    await fs.writeFile(path.join(workspace, '.all-contributorsrc'), '{not json', 'utf8');

    await expect(
      writer.appendContributor({ login: 'octocat', contributions: ['code'] })
    ).rejects.toBeInstanceOf(AllContributorsWriterError);
  });

  it('treats login matching as case-insensitive (octocat vs OCTOCAT is the same person)', async () => {
    await writer.appendContributor({ login: 'octocat', contributions: ['code'] });
    await writer.appendContributor({ login: 'OCTOCAT', contributions: ['doc'] });

    const rc = JSON.parse(
      await fs.readFile(path.join(workspace, '.all-contributorsrc'), 'utf8')
    ) as { contributors: { login: string; contributions: string[] }[] };
    expect(rc.contributors).toHaveLength(1);
    expect(rc.contributors[0]!.contributions.sort()).toEqual(['code', 'doc']);
  });
});
