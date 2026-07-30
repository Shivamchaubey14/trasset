/**
 * The hook form of `offlineRead`, wired to live connectivity.
 *
 * Kept separate from the decision itself so the decision stays free of platform
 * imports and can be exercised directly.
 */
import { useOnline } from "@/net/online";

import { offlineRead, type OfflineRead, type QueryFacts } from "./read";

export { factsOf, offlineRead } from "./read";
export type { OfflineRead, QueryFacts } from "./read";

export function useOfflineRead(facts: QueryFacts): OfflineRead {
  const online = useOnline();
  return offlineRead(facts, online);
}
