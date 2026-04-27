'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // eslint-disable-next-line react/hook-use-state -- intentionally omitting setter; stable instance
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Most live data in the UI is delivered via SSE — react-query
            // is just a cache for one-shot fetches (settings, lists,
            // metadata). A 1s stale time meant nearly every render
            // refetched; 30s lets the cache actually amortize.
            staleTime: 30_000,
            // Keep cached data around for 5 minutes so navigating
            // between tabs doesn't re-fetch cold.
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
