/**
 * Container parser — Dockerfile (FROM lines, including multi-stage) +
 * docker-compose.yml service images.
 *
 * Multi-stage: every FROM emits a component; `FROM x AS build` is
 * recognized and the alias is ignored as a name source. Unpinned `:latest`
 * tags are still emitted so the IaC agent can flag them in a follow-up
 * stage.
 */

import type { ManifestParserDescriptor, ManifestComponentDraft } from './parser-types';
import { buildPurl, pathEndsWith } from './parser-types';

const FROM_LINE = /^\s*FROM\s+(--platform=\S+\s+)?(\S+)(?:\s+AS\s+\S+)?\s*$/gim;
const IMAGE_LINE = /^\s*image:\s*["']?([^"'\s#]+)["']?/gm;

function buildContainerComponent(image: string): ManifestComponentDraft {
  // image format: [registry/]repo[:tag][@digest]
  const atIdx = image.indexOf('@');
  const tagIdx = image.lastIndexOf(':');
  let name = image;
  let version: string | undefined;
  if (atIdx >= 0) {
    name = image.slice(0, atIdx);
    version = image.slice(atIdx + 1);
  } else if (tagIdx > image.indexOf('/')) {
    name = image.slice(0, tagIdx);
    version = image.slice(tagIdx + 1);
  }
  return {
    ecosystem: 'oci',
    name,
    version,
    purl: buildPurl('docker', name, version),
    type: 'container',
  };
}

export const dockerfileParser: ManifestParserDescriptor = {
  id: 'parser.container.dockerfile',
  matches: (path) => {
    const lower = path.toLowerCase().replace(/\\/g, '/');
    return (
      pathEndsWith(path, 'Dockerfile') ||
      lower.endsWith('.dockerfile') ||
      /dockerfile\.[^/]+$/.test(lower)
    );
  },
  parse: (file) => {
    const drafts: ManifestComponentDraft[] = [];
    FROM_LINE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = FROM_LINE.exec(file.content)) !== null) {
      const image = m[2]!;
      if (image.toLowerCase() === 'scratch') continue;
      drafts.push(buildContainerComponent(image));
    }
    return drafts;
  },
};

export const dockerComposeParser: ManifestParserDescriptor = {
  id: 'parser.container.docker-compose',
  matches: (path) =>
    pathEndsWith(path, 'docker-compose.yml') ||
    pathEndsWith(path, 'docker-compose.yaml') ||
    pathEndsWith(path, 'compose.yml') ||
    pathEndsWith(path, 'compose.yaml'),
  parse: (file) => {
    const drafts: ManifestComponentDraft[] = [];
    IMAGE_LINE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMAGE_LINE.exec(file.content)) !== null) {
      const image = m[1]!.trim();
      if (image.length === 0) continue;
      drafts.push(buildContainerComponent(image));
    }
    return drafts;
  },
};
