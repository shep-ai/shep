/**
 * Which routes show the Control Center's session-tree sub-nav.
 *
 * The (dashboard) route group's layout ALWAYS renders the ControlCenter canvas
 * and layers drawer routes on top of it, so the canvas is visible for every
 * route in that group — not just /control-center. Gating on the exact
 * /control-center path made the sub-nav vanish the moment a feature or
 * repository drawer opened, even though the canvas was still on screen behind
 * it.
 *
 * Extracted and tested because an inline path comparison here has already
 * shipped wrong twice: first as '/' (so it never rendered at all), then as an
 * exact match (so it disappeared on drawer navigation).
 */

/** The Control Center route itself. */
export const CONTROL_CENTER_ROUTE = '/control-center';

/**
 * Route prefixes rendered inside the (dashboard) group, i.e. over the canvas.
 *
 * Derived from the group's actual page.tsx files. Trailing slashes on the
 * parameterised segments matter: '/feature/' must not match '/features', which
 * is the separate Inventory page outside this group.
 */
export const CANVAS_ROUTE_PREFIXES = [
  CONTROL_CENTER_ROUTE,
  '/feature/',
  '/repository/',
  '/chat',
  '/create',
  '/adopt',
] as const;

/** Whether the session tree should render for the given pathname. */
export function shouldShowSessionTree(pathname: string | null | undefined): boolean {
  if (pathname === null || pathname === undefined || pathname === '') return false;

  return CANVAS_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}
