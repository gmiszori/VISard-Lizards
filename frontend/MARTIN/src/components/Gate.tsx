import type { ReactNode } from 'react';
import { useIsClient } from '../lib/hooks';

/**
 * Renders `fallback` on the server and during hydration, then the real UI.
 * Persisted state lives in localStorage, which the server cannot see; gating
 * keeps the first client render identical to the server HTML.
 */
export function Gate({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  return <>{useIsClient() ? children : fallback}</>;
}
