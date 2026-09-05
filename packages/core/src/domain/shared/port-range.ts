/**
 * The valid TCP port range, and the predicate over it.
 *
 * Four places decide whether a number is a usable `expectedPort`: the
 * in-command port extractor, the Docker Compose detector, the `.shep/dev.json`
 * reader, and `OverrideDevServerRunPlanUseCase`. Three of those are in
 * infrastructure and one is in the application layer, which cannot import
 * from infrastructure — so the fact itself lives here, where both can reach it.
 *
 * Pure, zero imports, no I/O — a legitimate inhabitant of `domain/shared/`.
 */

/** Lowest port a server can be asked to listen on. */
export const PORT_MIN = 1;

/** Highest port a server can be asked to listen on. */
export const PORT_MAX = 65535;

/**
 * True for an integer inside the valid TCP port range.
 *
 * Non-integers are rejected rather than truncated: an `expectedPort` drives
 * the verify node's TCP probe, where a coerced value would probe a socket
 * nothing is listening on and report a healthy server as failed.
 */
export function isValidPort(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= PORT_MIN && value <= PORT_MAX
  );
}
