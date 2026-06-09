/**
 * OwnershipYamlReader — concrete adapter for IOwnershipYamlReader.
 *
 * Reads `.shep/ownership.yaml` from an Application's repository root and
 * returns a typed OwnershipYaml document. Tolerant of missing files,
 * malformed input, and partially-shaped entries: the use case never throws
 * on user-authored YAML — it falls back to "no ownership declared" and lets
 * the resolver use the Application owner.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { injectable } from 'tsyringe';
import yaml from 'js-yaml';

import type { IOwnershipYamlReader } from '../../../application/ports/output/services/ownership-yaml-reader.interface.js';
import type {
  OwnershipYaml,
  OwnershipYamlEntry,
} from '../../../domain/aspm/ownership/resolve-ownership.js';

const EMPTY_DOC: OwnershipYaml = { entries: [] };

function ensureString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function toEntry(raw: unknown): OwnershipYamlEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const pathGlob = ensureString(obj.pathGlob);
  const ownerId = ensureString(obj.ownerId);
  if (pathGlob === undefined || ownerId === undefined) return null;
  return {
    pathGlob,
    ownerId,
    teamId: ensureString(obj.teamId),
    businessUnitId: ensureString(obj.businessUnitId),
    source: 'yaml',
  };
}

@injectable()
export class OwnershipYamlReader implements IOwnershipYamlReader {
  async read(repositoryPath: string): Promise<OwnershipYaml> {
    const normalizedRoot = repositoryPath.split('/').join(sep);
    const filePath = join(normalizedRoot, '.shep', 'ownership.yaml');

    if (!existsSync(filePath)) return EMPTY_DOC;

    let raw: string;
    try {
      raw = readFileSync(filePath, 'utf-8');
    } catch {
      return EMPTY_DOC;
    }

    let parsed: unknown;
    try {
      parsed = yaml.load(raw);
    } catch {
      return EMPTY_DOC;
    }

    if (typeof parsed !== 'object' || parsed === null) return EMPTY_DOC;
    const root = parsed as Record<string, unknown>;
    const rawEntries = root.entries;
    if (!Array.isArray(rawEntries)) return EMPTY_DOC;

    const entries: OwnershipYamlEntry[] = [];
    for (const item of rawEntries) {
      const entry = toEntry(item);
      if (entry !== null) entries.push(entry);
    }
    return { entries };
  }
}
