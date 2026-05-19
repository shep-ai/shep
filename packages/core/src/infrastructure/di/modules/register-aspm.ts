/**
 * ASPM (Application Security Posture Management) registrations.
 *
 * Feature 098 — phase 1 (Foundation & TypeSpec Scaffolding).
 *
 * This module is invoked from `container.ts` after the existing
 * `register-*` modules and after migrations run. Phase 1 establishes
 * the DI wiring point only — no repositories, ports, services, or
 * use cases are registered yet. Subsequent phases (2-10) attach
 * registrations here as they land.
 *
 * Token constants live in `./aspm-tokens.ts` — never inline string
 * literals at the call site (`.claude/rules/code-quality.md` — No
 * Magic Values).
 */
import type { DependencyContainer } from 'tsyringe';

import { ASPM_TOKENS } from './aspm-tokens.js';

/**
 * Register ASPM repositories, ports, services, and use cases on the
 * tsyringe container. Phase-1 is intentionally a no-op skeleton — its
 * job is to exist, be wired into `container.ts`, and serve as the
 * stable insertion point for subsequent phases. Touching this file is
 * MANDATORY when adding any ASPM infrastructure binding.
 */
export function registerAspm(_container: DependencyContainer): void {
  // Intentionally empty in phase 1 (Foundation & TypeSpec Scaffolding).
  //
  // Phases 2-10 add registrations in this order, following the staged
  // epics defined in the feature plan:
  //
  //   - Phase 2: Owner / Team / BusinessUnit / Service / ApiAsset /
  //              CloudEnvironment repositories + IOwnershipYamlReader.
  //   - Phase 3: SecurityFinding repository + IFindingIngestPort (SARIF).
  //   - Phase 4: ISbomPort (CycloneDX) + IExploitIntelPort (KEV+EPSS).
  //   - Phase 5: RiskScore repository + scoring use cases.
  //   - Phase 6: SecurityPolicy / RemediationCampaign / RiskException
  //              + ISlaClockPort.
  //   - Phase 7: Posture/trend/application-posture + finding→work-item
  //              use cases + SSE wiring.
  //   - Phase 8: AiChangeRiskSignal repository + AI-review use cases.
  //   - Phase 9: ComplianceControl repository + coverage use case.
  //   - Phase 10: CLI + final web wiring (no new container bindings).
  //
  // Keep the token import live so future maintainers can `Cmd-Click`
  // into `aspm-tokens.ts` from this module — and so a typo in token
  // names surfaces here (where it's easy to find), not in a far-away
  // use case constructor.
  void ASPM_TOKENS;
}
