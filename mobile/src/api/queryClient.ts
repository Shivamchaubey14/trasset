/**
 * TanStack Query configuration.
 *
 * The defaults are tuned for a phone on unreliable signal rather than a desk
 * with a wire, which mostly means: do not retry things that will never succeed,
 * and do not throw away cached data that is still useful.
 */
import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "./errors";

/**
 * Retrying a 4xx is pointless — the server has told us the request is wrong,
 * and it will keep saying so. A 409 in particular is a real conflict that the
 * user has to resolve (SRS §12.5), so retrying would hide it. Network failures
 * and 5xx do get retried, because those are the ones that pass.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof ApiError) {
    if (error.isNetworkError) return true;
    return error.status >= 500;
  }
  return false;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        // Data stays fresh for a minute: an asset's holder does not change
        // second to second, and refetching on every screen focus over mobile
        // data is exactly what BE-5's delta sync exists to avoid.
        staleTime: 60_000,
        // Kept far longer than it is fresh, so an offline screen can still
        // render something with its age shown rather than a spinner.
        gcTime: 24 * 60 * 60 * 1000,
        refetchOnWindowFocus: false,
      },
      mutations: {
        // Mutations are never retried automatically here. A blind retry can
        // apply an action twice; the durable mutation queue owns replay,
        // because only it holds the idempotency key that makes it safe (BE-4).
        retry: false,
      },
    },
  });
}
