/**
 * Mock for next/navigation used in Storybook (no Next.js router).
 * Provides usePathname and other navigation hooks so layout components render.
 */
export function usePathname(): string {
  return '/';
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams();
}

function noop(): void {
  /* mock no-op */
}

export function useRouter() {
  return {
    push: noop,
    replace: noop,
    refresh: noop,
    back: noop,
    forward: noop,
    prefetch: noop,
  };
}

/**
 * `notFound()` in Next.js throws a special error that the framework catches
 * and renders as a 404 page. In Storybook we have no router, so we throw a
 * tagged error that component code treats as an unhandled rejection — the
 * surrounding `useQuery` retry logic already stops retrying on this path,
 * so the resulting story snapshot shows the loading spinner or the error
 * state (whichever the component renders next).
 */
export function notFound(): never {
  throw new Error('NEXT_NOT_FOUND');
}

/**
 * Same shape as `notFound()`, but for redirects. Provided so that any
 * component that conditionally imports it still builds under Storybook.
 */
export function redirect(_path: string): never {
  throw new Error('NEXT_REDIRECT');
}
