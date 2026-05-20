/**
 * Python parser — requirements.txt + pyproject.toml + Pipfile.lock.
 *
 * Coverage rationale: requirements.txt is universal; pyproject.toml is the
 * modern declarative source-of-truth for poetry/hatch/PEP 621 projects;
 * Pipfile.lock pins versions for pipenv users. Together these three cover
 * the >95% case for Python dependency declarations.
 */

import type { ManifestParserDescriptor, ManifestComponentDraft } from './parser-types';
import { buildPurl, pathEndsWith } from './parser-types';

const REQUIREMENT_LINE = /^([A-Za-z0-9_.-]+)\s*(?:\[[^\]]*\])?\s*([=<>!~]=?\s*[^;#\s]+)?/;

export const pythonRequirementsParser: ManifestParserDescriptor = {
  id: 'parser.python.requirements',
  matches: (path) => pathEndsWith(path, 'requirements.txt'),
  parse: (file) => {
    const drafts: ManifestComponentDraft[] = [];
    for (const raw of file.content.split(/\r?\n/)) {
      const line = raw.trim();
      if (line.length === 0 || line.startsWith('#') || line.startsWith('-')) continue;
      const match = REQUIREMENT_LINE.exec(line);
      if (!match) continue;
      const name = match[1]!.toLowerCase();
      const version = match[2] ? match[2].replace(/^[=<>!~]+\s*/, '').trim() : undefined;
      drafts.push({
        ecosystem: 'pypi',
        name,
        version,
        purl: buildPurl('pypi', name, version),
        type: 'library',
      });
    }
    return drafts;
  },
};

const PYPROJECT_DEP_BLOCK = /\[(?:project\.|tool\.poetry\.)dependencies\]([\s\S]*?)(?=\n\[|$)/g;
const TOML_DEP_LINE = /^([A-Za-z0-9_.-]+)\s*=\s*["']([^"']+)["']/gm;

export const pythonPyprojectParser: ManifestParserDescriptor = {
  id: 'parser.python.pyproject',
  matches: (path) => pathEndsWith(path, 'pyproject.toml'),
  parse: (file) => {
    const drafts: ManifestComponentDraft[] = [];
    const blocks = file.content.matchAll(PYPROJECT_DEP_BLOCK);
    for (const block of blocks) {
      const body = block[1] ?? '';
      TOML_DEP_LINE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = TOML_DEP_LINE.exec(body)) !== null) {
        const name = m[1]!.toLowerCase();
        if (name === 'python') continue;
        const version = m[2]!.replace(/^[\^~>=<]+/, '').trim();
        drafts.push({
          ecosystem: 'pypi',
          name,
          version: version.length > 0 ? version : undefined,
          purl: buildPurl('pypi', name, version),
          type: 'library',
        });
      }
    }
    return drafts;
  },
};

interface PipfileLock {
  default?: Record<string, { version?: string }>;
  develop?: Record<string, { version?: string }>;
}

export const pythonPipfileLockParser: ManifestParserDescriptor = {
  id: 'parser.python.pipfile-lock',
  matches: (path) => pathEndsWith(path, 'Pipfile.lock'),
  parse: (file) => {
    try {
      const lock = JSON.parse(file.content) as PipfileLock;
      const drafts: ManifestComponentDraft[] = [];
      for (const bucket of [lock.default, lock.develop]) {
        if (!bucket) continue;
        for (const [name, entry] of Object.entries(bucket)) {
          const version = entry.version?.replace(/^==/, '');
          drafts.push({
            ecosystem: 'pypi',
            name: name.toLowerCase(),
            version,
            purl: buildPurl('pypi', name, version),
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
