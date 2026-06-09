/**
 * IaC parser — Terraform required_providers, Kubernetes manifest images,
 * GitHub Actions workflow `uses:` lines.
 *
 * These three together represent the bulk of "what version of what
 * dependency is my infrastructure pinned to". Hard-coded credentials and
 * misconfigurations themselves are surfaced by the IaC agent stage
 * (task-73) — this parser only enumerates components for SCA lookup.
 */

import type { ManifestParserDescriptor, ManifestComponentDraft } from './parser-types';
import { buildPurl, pathEndsWith } from './parser-types';

const TF_REQUIRED_PROVIDERS = /required_providers\s*\{([\s\S]*?)\n\}/g;
const TF_PROVIDER_LINE =
  /^\s*([a-z0-9_-]+)\s*=\s*\{[^}]*source\s*=\s*"([^"]+)"[^}]*version\s*=\s*"([^"]+)"/gim;

export const terraformParser: ManifestParserDescriptor = {
  id: 'parser.iac.terraform',
  matches: (path) => pathEndsWith(path, '.tf'),
  parse: (file) => {
    const drafts: ManifestComponentDraft[] = [];
    TF_REQUIRED_PROVIDERS.lastIndex = 0;
    let block: RegExpExecArray | null;
    while ((block = TF_REQUIRED_PROVIDERS.exec(file.content)) !== null) {
      const body = block[1] ?? '';
      TF_PROVIDER_LINE.lastIndex = 0;
      let line: RegExpExecArray | null;
      while ((line = TF_PROVIDER_LINE.exec(body)) !== null) {
        const source = line[2]!;
        const version = line[3]!.replace(/^[\^~>=<]+\s*/, '').trim();
        drafts.push({
          ecosystem: 'terraform',
          name: source,
          version,
          purl: buildPurl('terraform', source, version),
          type: 'library',
        });
      }
    }
    return drafts;
  },
};

const K8S_CONTAINER_IMAGE = /^\s*image:\s*["']?([^"'\s#]+)["']?/gm;

export const kubernetesParser: ManifestParserDescriptor = {
  id: 'parser.iac.kubernetes',
  matches: (path) => {
    const lower = path.toLowerCase();
    if (!(lower.endsWith('.yml') || lower.endsWith('.yaml'))) return false;
    // Avoid double-matching docker-compose files which also have `image:` lines.
    return !(
      lower.endsWith('docker-compose.yml') ||
      lower.endsWith('docker-compose.yaml') ||
      lower.endsWith('compose.yml') ||
      lower.endsWith('compose.yaml')
    );
  },
  parse: (file) => {
    // Require at least one apiVersion line to limit false-positive YAML files.
    if (!/^\s*apiVersion:\s*/m.test(file.content)) return [];
    const drafts: ManifestComponentDraft[] = [];
    K8S_CONTAINER_IMAGE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = K8S_CONTAINER_IMAGE.exec(file.content)) !== null) {
      const image = m[1]!.trim();
      if (image.length === 0) continue;
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
      drafts.push({
        ecosystem: 'oci',
        name,
        version,
        purl: buildPurl('docker', name, version),
        type: 'container',
      });
    }
    return drafts;
  },
};

const GHA_USES = /^\s*-\s+uses:\s*["']?([^"'\s@]+)@([^"'\s#]+)["']?/gm;

export const githubActionsParser: ManifestParserDescriptor = {
  id: 'parser.iac.github-actions',
  matches: (path) => {
    const normalized = path.replace(/\\/g, '/').toLowerCase();
    return (
      normalized.includes('.github/workflows/') &&
      (normalized.endsWith('.yml') || normalized.endsWith('.yaml'))
    );
  },
  parse: (file) => {
    const drafts: ManifestComponentDraft[] = [];
    GHA_USES.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = GHA_USES.exec(file.content)) !== null) {
      const name = m[1]!;
      const version = m[2]!;
      drafts.push({
        ecosystem: 'github-action',
        name,
        version,
        purl: buildPurl('githubactions', name, version),
        type: 'library',
      });
    }
    return drafts;
  },
};
