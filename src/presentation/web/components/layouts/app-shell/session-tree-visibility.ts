/**
 * Which routes show the Control Center's session-tree sidenav.
 *
 * Extracted so the route can be asserted in a test. Inlining the comparison in
 * app-shell is what allowed a wrong path ('/' instead of '/control-center') to
 * ship silently: every layer was correct and the panel simply never mounted.
 */

/** The Control Center route, as registered in app/(dashboard)/control-center. */
export const CONTROL_CENTER_ROUTE = '/control-center';

/** Whether the session tree should render for the given pathname. */
export function shouldShowSessionTree(pathname: string | null | undefined): boolean {
  return pathname === CONTROL_CENTER_ROUTE;
}
