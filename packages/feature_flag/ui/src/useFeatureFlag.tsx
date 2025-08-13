import { useEffect, useState } from 'react';

/**
 * Minimal async flag hook.
 * @param getFlag a function that resolves to the flag's boolean value.
 * @returns the latest resolved value (defaults to false).
 */
export function useFeatureFlag(getFlag: () => Promise<boolean>, deps: React.DependencyList = []) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const val = await getFlag();
        if (!cancelled) {
          setEnabled(val);
        }
      } catch {
        if (!cancelled) {
          setEnabled(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, deps);

  return enabled;
}
