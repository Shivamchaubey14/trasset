/**
 * Debounce a value.
 *
 * Search runs on every keystroke, and over mobile data that is both slow and
 * expensive — 300 ms is long enough to skip the noise of typing and short
 * enough that results feel immediate.
 */
import { useEffect, useState } from "react";

export function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
