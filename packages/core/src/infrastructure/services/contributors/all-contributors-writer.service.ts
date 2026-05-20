/**
 * AllContributorsWriter
 *
 * In-house adapter for `IAllContributorsWriter`. Reads/mutates the workspace
 * `.all-contributorsrc` (JSON) and renders the README block between the
 * `<!-- ALL-CONTRIBUTORS-LIST:START -->` / `:END -->` markers.
 *
 * Reasons we re-implement rather than depend on `all-contributors-cli` or
 * the upstream GitHub App: research decision 3 / spec product-question 6
 * — the dogfooding pitch requires the contributor pipeline stay
 * self-contained, with extension points (firstPR / nthPR / monthlyShoutout)
 * that the bot does not expose.
 *
 * Idempotent: reapplying the same `(login, contributions)` produces no diff
 * (NFR-11).
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import {
  AllContributorsWriterError,
  type AppendContributorInput,
  type IAllContributorsWriter,
} from '../../../application/ports/output/services/all-contributors-writer.interface.js';

interface AllContributorsRcShape {
  projectName?: string;
  projectOwner?: string;
  contributorsPerLine?: number;
  imageSize?: number;
  contributors: ContributorEntry[];
  [k: string]: unknown;
}

interface ContributorEntry {
  login: string;
  name?: string;
  avatar_url?: string;
  profile?: string;
  contributions: string[];
}

const RC_FILENAME = '.all-contributorsrc';
const README_FILENAME = 'README.md';
const START_MARKER = '<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->';
const END_MARKER = '<!-- ALL-CONTRIBUTORS-LIST:END -->';
const DEFAULT_PER_LINE = 7;
const DEFAULT_IMAGE_SIZE = 100;

function buildDefaultProfile(login: string): string {
  return `https://github.com/${login}`;
}

function buildDefaultAvatar(login: string, size: number): string {
  return `https://avatars.githubusercontent.com/${login}?v=4&size=${size}`;
}

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function findContributor(
  list: ContributorEntry[],
  login: string
): { index: number; entry: ContributorEntry | undefined } {
  const lower = login.toLowerCase();
  const index = list.findIndex((c) => c.login.toLowerCase() === lower);
  return { index, entry: index >= 0 ? list[index] : undefined };
}

function renderRow(entry: ContributorEntry, imageSize: number): string {
  const profile = entry.profile ?? buildDefaultProfile(entry.login);
  const avatar = entry.avatar_url ?? buildDefaultAvatar(entry.login, imageSize);
  const name = entry.name ?? entry.login;
  const contribLinks = entry.contributions
    .map((c) => `<a href="#${c}-${entry.login}" title="${c}">${emojiFor(c)}</a>`)
    .join(' ');
  return [
    `<td align="center" valign="top" width="14.28%">`,
    `  <a href="${profile}">`,
    `    <img src="${avatar}" width="${imageSize}px;" alt="${name}"/>`,
    `    <br /><sub><b>${name}</b></sub>`,
    `  </a>`,
    `  <br />${contribLinks}`,
    `</td>`,
  ].join('\n');
}

function emojiFor(kind: string): string {
  switch (kind) {
    case 'code':
      return '\u{1F4BB}';
    case 'doc':
      return '\u{1F4D6}';
    case 'review':
      return '\u{1F440}';
    case 'bug':
      return '\u{1F41B}';
    case 'design':
      return '\u{1F3A8}';
    case 'ideas':
      return '\u{1F914}';
    case 'infra':
      return '\u{1F6A7}';
    case 'maintenance':
      return '\u{1F527}';
    case 'test':
      return '⚠️';
    case 'tutorial':
      return '✅';
    default:
      return '✨';
  }
}

function renderTable(
  contributors: readonly ContributorEntry[],
  perLine: number,
  size: number
): string {
  if (contributors.length === 0) {
    return '<table>\n  <tbody>\n  </tbody>\n</table>';
  }
  const rows: string[] = [];
  for (let i = 0; i < contributors.length; i += perLine) {
    const slice = contributors.slice(i, i + perLine);
    rows.push(`    <tr>\n${slice.map((c) => indent(renderRow(c, size), 6)).join('\n')}\n    </tr>`);
  }
  return `<table>\n  <tbody>\n${rows.join('\n')}\n  </tbody>\n</table>`;
}

function indent(s: string, n: number): string {
  const pad = ' '.repeat(n);
  return s
    .split('\n')
    .map((l) => (l.length > 0 ? pad + l : l))
    .join('\n');
}

function renderReadmeBlock(rc: AllContributorsRcShape): string {
  const perLine = rc.contributorsPerLine ?? DEFAULT_PER_LINE;
  const size = rc.imageSize ?? DEFAULT_IMAGE_SIZE;
  return [
    START_MARKER,
    '<!-- prettier-ignore-start -->',
    '<!-- markdownlint-disable -->',
    renderTable(rc.contributors, perLine, size),
    '<!-- markdownlint-restore -->',
    '<!-- prettier-ignore-end -->',
    END_MARKER,
  ].join('\n');
}

function replaceBlock(readme: string, replacement: string): string {
  const startIdx = readme.indexOf('<!-- ALL-CONTRIBUTORS-LIST:START');
  const endTag = END_MARKER;
  const endIdx = readme.indexOf(endTag);
  if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) {
    throw new AllContributorsWriterError(
      'README is missing ALL-CONTRIBUTORS-LIST markers — cannot render block'
    );
  }
  const before = readme.slice(0, startIdx);
  const after = readme.slice(endIdx + endTag.length);
  return before + replacement + after;
}

export class AllContributorsWriter implements IAllContributorsWriter {
  constructor(private readonly workspaceRoot: string) {}

  async appendContributor(input: AppendContributorInput): Promise<void> {
    const rcPath = path.join(this.workspaceRoot, RC_FILENAME);
    const readmePath = path.join(this.workspaceRoot, README_FILENAME);

    const rcRaw = await this.readFile(rcPath);
    const rc = this.parseRc(rcRaw);

    const { index, entry } = findContributor(rc.contributors, input.login);
    const incoming = uniqueSorted(input.contributions);
    if (entry) {
      const merged = uniqueSorted([...entry.contributions, ...incoming]);
      if (merged.length === entry.contributions.length) {
        // Same set already — write nothing, but still re-render README block
        // so the README/RC stay consistent if the README drifted.
      } else {
        rc.contributors[index] = { ...entry, contributions: merged };
      }
    } else {
      rc.contributors.push({
        login: input.login,
        name: input.name ?? input.login,
        avatar_url:
          input.avatarUrl ?? buildDefaultAvatar(input.login, rc.imageSize ?? DEFAULT_IMAGE_SIZE),
        profile: input.profile ?? buildDefaultProfile(input.login),
        contributions: incoming,
      });
    }

    const nextRc = `${JSON.stringify(rc, null, 2)}\n`;
    if (nextRc !== rcRaw) {
      await fs.writeFile(rcPath, nextRc, 'utf8');
    }

    const readme = await this.readFile(readmePath);
    const nextReadme = replaceBlock(readme, renderReadmeBlock(rc));
    if (nextReadme !== readme) {
      await fs.writeFile(readmePath, nextReadme, 'utf8');
    }
  }

  private async readFile(p: string): Promise<string> {
    try {
      return await fs.readFile(p, 'utf8');
    } catch (err) {
      throw new AllContributorsWriterError(
        `Failed to read ${path.basename(p)} at ${p}`,
        err instanceof Error ? err : new Error(String(err))
      );
    }
  }

  private parseRc(raw: string): AllContributorsRcShape {
    try {
      const parsed = JSON.parse(raw) as AllContributorsRcShape;
      if (!Array.isArray(parsed.contributors)) parsed.contributors = [];
      return parsed;
    } catch (err) {
      throw new AllContributorsWriterError(
        '.all-contributorsrc is not valid JSON',
        err instanceof Error ? err : new Error(String(err))
      );
    }
  }
}
