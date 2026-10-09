/**
 * Route template for the web.area.viewed event (spec 133).
 *
 * Next.js route params are exactly the dynamic segments, so every path segment
 * equal to a param value becomes `[paramName]`. That removes ids, slugs and
 * names (a repository called `billing` included) without guessing which
 * segments "look like" ids. Browser-safe: no Node imports.
 */

export type RouteParams = Readonly<Record<string, string | string[] | undefined>>;

export interface RouteView {
  /** First segment, e.g. `/aspm` — the area to keep or cut. */
  area: string;
  /** Template such as `/feature/[featureId]/overview`. */
  route: string;
}

const ROOT = '/';

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function toRouteView(pathname: string, params: RouteParams): RouteView {
  const valueToName = new Map<string, string>();
  for (const [name, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item) valueToName.set(item, name);
    }
  }

  const segments = pathname
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const name = valueToName.get(safeDecode(segment)) ?? valueToName.get(segment);
      return name ? `[${name}]` : segment;
    });

  if (segments.length === 0) return { area: ROOT, route: ROOT };
  return { area: `/${segments[0]}`, route: `/${segments.join('/')}` };
}
