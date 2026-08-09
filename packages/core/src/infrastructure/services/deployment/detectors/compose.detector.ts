/**
 * Docker Compose detector — `docker compose up`.
 *
 * Last in the registry by design: `docker compose up` creates containers,
 * networks and volumes, so it is both the slowest and the most side-effectful
 * option and should only win when nothing else does.
 *
 * `expectedPort` is taken ONLY when the whole file publishes exactly one host
 * port. A stack with a web service and a database publishes several, and
 * guessing which one is the app is precisely the inference the agent tier is
 * better at — while a wrong port makes the verify node fail a healthy server.
 */

import yaml from 'js-yaml';
import { createDeploymentLogger } from '../deployment-logger.js';
import type { Detector, DetectorResult } from './types.js';
import { findManifest, readManifest } from './shared/manifest-read.js';
import { PORT_MAX, PORT_MIN } from './shared/command-port.js';

/** Compose filenames, in the order the Compose CLI resolves them. */
const COMPOSE_MANIFESTS = [
  'compose.yaml',
  'compose.yml',
  'docker-compose.yaml',
  'docker-compose.yml',
] as const;

const log = createDeploymentLogger('[detectCompose]');

/**
 * Detect a Docker Compose stack.
 *
 * @param dirPath - Absolute path to the directory to inspect.
 * @returns `docker compose up`, with `expectedPort` only when the stack
 *          publishes exactly one host port; or a fall-through error.
 */
export const detectCompose: Detector = (dirPath: string): DetectorResult => {
  const manifestPath = findManifest(dirPath, COMPOSE_MANIFESTS);
  if (manifestPath === null) {
    return { success: false, error: `No docker-compose file found in ${dirPath}` };
  }

  const contents = readManifest(manifestPath);
  if (contents === null) {
    log.warn(`could not read ${manifestPath} — falling through`);
    return { success: false, error: `Could not read ${manifestPath}` };
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(contents);
  } catch {
    log.warn(`could not parse ${manifestPath} — falling through`);
    return { success: false, error: `Could not parse ${manifestPath}` };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { success: false, error: `${manifestPath} is not a Compose document` };
  }

  const services = (parsed as Record<string, unknown>).services;
  if (typeof services !== 'object' || services === null || Array.isArray(services)) {
    return { success: false, error: `${manifestPath} declares no services` };
  }

  const expectedPort = resolveSingleHostPort(services as Record<string, unknown>);
  log.info(`detected — command="docker compose up", resolvedDir="${dirPath}"`);

  return {
    success: true,
    command: 'docker compose up',
    // Compose builds and pulls images itself on `up`.
    needsInstall: false,
    resolvedDir: dirPath,
    runtime: 'docker',
    ...(expectedPort !== undefined ? { expectedPort } : {}),
  };
};

/**
 * The stack's single published host port, or `undefined`.
 *
 * Returns `undefined` for zero ports, several ports, and anything that cannot
 * be read as a plain host port (a range, a variable) — an entry we cannot
 * understand makes the whole set ambiguous rather than silently narrowing it.
 */
function resolveSingleHostPort(services: Record<string, unknown>): number | undefined {
  const hostPorts = new Set<number>();

  for (const service of Object.values(services)) {
    if (typeof service !== 'object' || service === null) continue;
    const ports = (service as Record<string, unknown>).ports;
    if (!Array.isArray(ports)) continue;

    for (const entry of ports) {
      const port = readHostPort(entry);
      if (port === AMBIGUOUS) return undefined;
      if (port !== undefined) hostPorts.add(port);
    }
  }

  return hostPorts.size === 1 ? [...hostPorts][0] : undefined;
}

/** Sentinel for an entry that publishes a host port we cannot read. */
const AMBIGUOUS = -1;

/**
 * Read one `ports:` entry's host port.
 *
 * @returns The host port, `undefined` when the entry publishes none (a bare
 *          container port gets an ephemeral host port), or {@link AMBIGUOUS}.
 */
function readHostPort(entry: unknown): number | undefined | typeof AMBIGUOUS {
  // Long syntax: { published: 8080, target: 80 }
  if (typeof entry === 'object' && entry !== null) {
    const published = (entry as Record<string, unknown>).published;
    if (published === undefined) return undefined;
    return toPort(String(published));
  }

  // Short syntax: "8080:80", "127.0.0.1:8080:80", "8080:80/tcp", "8080"
  if (typeof entry === 'number') return undefined;
  if (typeof entry !== 'string') return AMBIGUOUS;

  const segments = entry.split('/')[0].split(':');
  // A single segment is a container port only — no host port is published.
  if (segments.length < 2) return undefined;

  return toPort(segments[segments.length - 2]);
}

/** Parse a host-port token, treating anything unusable as ambiguous. */
function toPort(token: string): number | typeof AMBIGUOUS {
  if (!/^\d+$/.test(token)) return AMBIGUOUS;
  const port = Number(token);
  return port >= PORT_MIN && port <= PORT_MAX ? port : AMBIGUOUS;
}
