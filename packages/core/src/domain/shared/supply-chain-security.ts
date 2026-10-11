/**
 * Supply-chain security is part of ASPM (spec 135): it has no flag of its
 * own and is on exactly when the `aspm` feature flag is on.
 *
 * `override` is the `SHEP_SUPPLY_CHAIN_SECURITY` environment value, read by
 * the CLI: "false"/"0" force it off (a CI kill switch) and "true"/"1" force
 * it on (CI runs enforcement on a fresh install where ASPM is off). Any
 * other value is ignored.
 */
import type { FeatureFlags } from '../generated/output';

const FORCE_OFF: readonly string[] = ['false', '0'];
const FORCE_ON: readonly string[] = ['true', '1'];

export function isSupplyChainSecurityEnabled(
  flags: Pick<FeatureFlags, 'aspm'> | undefined,
  override?: string
): boolean {
  if (override !== undefined && FORCE_OFF.includes(override)) return false;
  if (override !== undefined && FORCE_ON.includes(override)) return true;
  return flags?.aspm === true;
}
