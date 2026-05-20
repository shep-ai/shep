/**
 * .NET parser — *.csproj (PackageReference) + packages.lock.json.
 */

import type { ManifestParserDescriptor, ManifestComponentDraft } from './parser-types';
import { buildPurl, pathEndsWith } from './parser-types';

const PACKAGE_REFERENCE =
  /<PackageReference[^>]*Include\s*=\s*["']([^"']+)["'][^>]*Version\s*=\s*["']([^"']+)["']/g;

export const csprojParser: ManifestParserDescriptor = {
  id: 'parser.dotnet.csproj',
  matches: (path) =>
    pathEndsWith(path, '.csproj') || pathEndsWith(path, '.fsproj') || pathEndsWith(path, '.vbproj'),
  parse: (file) => {
    const drafts: ManifestComponentDraft[] = [];
    PACKAGE_REFERENCE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PACKAGE_REFERENCE.exec(file.content)) !== null) {
      const name = m[1]!;
      const version = m[2]!;
      drafts.push({
        ecosystem: 'nuget',
        name,
        version,
        purl: buildPurl('nuget', name, version),
        type: 'library',
      });
    }
    return drafts;
  },
};

interface PackagesLockJson {
  dependencies?: Record<string, Record<string, { resolved?: string; type?: string }>>;
}

export const packagesLockParser: ManifestParserDescriptor = {
  id: 'parser.dotnet.packages-lock',
  matches: (path) => pathEndsWith(path, 'packages.lock.json'),
  parse: (file) => {
    try {
      const lock = JSON.parse(file.content) as PackagesLockJson;
      const drafts: ManifestComponentDraft[] = [];
      for (const framework of Object.values(lock.dependencies ?? {})) {
        for (const [name, entry] of Object.entries(framework)) {
          drafts.push({
            ecosystem: 'nuget',
            name,
            version: entry.resolved,
            purl: buildPurl('nuget', name, entry.resolved),
            type: 'library',
          });
        }
      }
      return drafts;
    } catch {
      return [];
    }
  },
};
