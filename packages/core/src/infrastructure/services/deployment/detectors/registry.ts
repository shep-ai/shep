/**
 * Detector registry — the ONE place detector precedence is expressed.
 *
 * Mirrors how the rest of the deployment services express priority
 * (SCRIPT_PRIORITY, LOCKFILE_MANAGERS, CONFIG_FILES, LOCKFILES are all
 * module-level ordered `const` arrays). Adding a ninth ecosystem must mean one
 * new detector module plus one entry in the array below — nothing else
 * (NFR-3).
 *
 * ## Precedence, and why it is this order
 *
 * Node/Deno → Make → language toolchain → Docker Compose, evaluated
 * first-success-wins; a detector that cannot produce a command falls through
 * rather than terminating the chain.
 *
 * **Node is first for backward compatibility, not correctness.** Every
 * repository shep runs today is resolved by the Node detector, and any
 * reordering silently changes what runs for some of them. A polyglot repo
 * where the default is wrong is what the override tiers are for — an explicit,
 * visible answer beats a detector guessing.
 *
 * **Compose is last** because `docker compose up` creates containers,
 * networks and volumes: it is the slowest and most side-effectful option and
 * should only win when nothing else does.
 *
 * `.shep/dev.json` is deliberately absent. It is the highest-precedence tier,
 * which means it must be read BEFORE the persisted run-plan cache — an entry
 * here runs after that cache and would lose to a stale plan. The graph's
 * analyze node consumes `repo-config.detector.ts` directly at tier zero.
 */

import type { Detector } from './types.js';
import { Ecosystem } from './limits.js';
import { detectNode } from './node.detector.js';
import { detectDeno } from './deno.detector.js';
import { detectMake } from './make.detector.js';
import { detectPython } from './python.detector.js';
import { detectGo } from './go.detector.js';
import { detectRust } from './rust.detector.js';
import { detectRuby } from './ruby.detector.js';
import { detectElixir } from './elixir.detector.js';
import { detectCompose } from './compose.detector.js';

export * from './limits.js';

/** One entry in the ordered precedence list. */
export interface RegistryEntry {
  ecosystem: Ecosystem;
  detect: Detector;
}

/** Ordered, first-success-wins. See the module comment for the rationale. */
export const DETECTOR_REGISTRY: readonly RegistryEntry[] = [
  { ecosystem: Ecosystem.Node, detect: detectNode },
  { ecosystem: Ecosystem.Deno, detect: detectDeno },
  { ecosystem: Ecosystem.Make, detect: detectMake },
  { ecosystem: Ecosystem.Python, detect: detectPython },
  { ecosystem: Ecosystem.Go, detect: detectGo },
  { ecosystem: Ecosystem.Rust, detect: detectRust },
  { ecosystem: Ecosystem.Ruby, detect: detectRuby },
  { ecosystem: Ecosystem.Elixir, detect: detectElixir },
  { ecosystem: Ecosystem.Compose, detect: detectCompose },
];
