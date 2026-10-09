import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type DependencyList } from 'react';
import { getCrowd, getMenu, getMensas } from './api';
import { CAMPUSES, DEFAULT_CAMPUS, campusById, devicePosition, nearestCampus } from './geo';
import { campus, dataVersion, dev, hiddenMensaIds } from './store';
import { getNow, isoDate } from './time';
import type { CampusId, CrowdInfo, LatLng, Meal, Mensa } from './types';

/** False during SSR and the first client render, true afterwards. Avoids hydration mismatches with localStorage state. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** The app clock (honours the developer panel's simulated time), refreshed every 30 s. */
export function useNow(intervalMs = 30_000): Date {
  const sim = useStore(dev).simNow;
  const [now, setNow] = useState(() => getNow());
  useEffect(() => {
    setNow(getNow());
    const t = setInterval(() => setNow(getNow()), intervalMs);
    return () => clearInterval(t);
  }, [sim, intervalMs]);
  return now;
}

export type AsyncState<T> =
  | { status: 'loading'; data: undefined; error: undefined }
  | { status: 'ready'; data: T; error: undefined }
  | { status: 'error'; data: T | undefined; error: Error };

/**
 * Runs `fn` whenever `deps` or the global data version change. While
 * refetching after a submission the previous data stays on screen, so the UI
 * updates without flashing a skeleton.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): AsyncState<T> & { reload: () => void } {
  const version = useStore(dataVersion);
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading', data: undefined, error: undefined });
  const [nonce, setNonce] = useState(0);
  const run = useRef(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const id = ++run.current;
    setState((s) => (s.data !== undefined ? s : { status: 'loading', data: undefined, error: undefined }));
    fn().then(
      (data) => {
        if (id === run.current) setState({ status: 'ready', data, error: undefined });
      },
      (err: unknown) => {
        if (id === run.current)
          setState((s) => ({ status: 'error', data: s.data, error: err instanceof Error ? err : new Error(String(err)) }));
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version, nonce]);

  return { ...state, reload } as AsyncState<T> & { reload: () => void };
}

export function useMensas() {
  return useAsync(getMensas, []);
}

/** Visible (non-hidden) mensas only. Hidden mensas never reach any list. */
export function useVisibleMensas() {
  const all = useMensas();
  const hidden = useStore(hiddenMensaIds);
  const visible = all.data?.filter((m) => !hidden.includes(m.id));
  return { ...all, visible };
}

export function useCrowd(mensaId: string) {
  return useAsync(() => getCrowd(mensaId), [mensaId]);
}

export interface BoardData {
  menus: Record<string, Meal[]>;
  crowds: Record<string, CrowdInfo>;
}

/** Menus and crowd info for a set of mensas on a date, fetched in parallel. */
export function useBoardData(mensas: Mensa[] | undefined, date: Date) {
  const ids = mensas?.map((m) => m.id).join(',') ?? '';
  const iso = isoDate(date);
  return useAsync<BoardData | null>(async () => {
    if (!mensas) return null;
    const entries = await Promise.all(
      mensas.map(async (m) => {
        const [menu, crowd] = await Promise.all([getMenu(m.id, iso), getCrowd(m.id)]);
        return [m.id, menu, crowd] as const;
      }),
    );
    return {
      menus: Object.fromEntries(entries.map(([id, menu]) => [id, menu])),
      crowds: Object.fromEntries(entries.map(([id, , crowd]) => [id, crowd])),
    };
  }, [ids, iso]);
}

/** Where the user is standing: the simulated mensa wins over the device position. */
export function usePosition(mensas: Mensa[] | undefined): LatLng | null {
  const device = useStore(devicePosition);
  const simId = useStore(dev).simMensaId;
  if (simId) {
    const m = mensas?.find((x) => x.id === simId);
    if (m) return m.coordinates;
  }
  return device;
}

export interface RefPoint {
  point: LatLng;
  campusId: CampusId;
  label: string;
  /** True when no campus was picked and no location is known yet. */
  isDefault: boolean;
  /** True when the position comes from the device or the simulator. */
  located: boolean;
}

/** The point distances are measured from: picked campus, else live position, else ETH Zentrum. */
export function useRefPoint(mensas: Mensa[] | undefined): RefPoint {
  const picked = useStore(campus);
  const pos = usePosition(mensas);
  const pickedCampus = campusById(picked);
  if (pickedCampus) {
    return { point: pickedCampus.coordinates, campusId: pickedCampus.id, label: pickedCampus.name, isDefault: false, located: false };
  }
  if (pos) {
    const c = nearestCampus(pos);
    return { point: pos, campusId: c.id, label: c.name, isDefault: false, located: true };
  }
  const d = CAMPUSES.find((c) => c.id === DEFAULT_CAMPUS) ?? (CAMPUSES[0] as (typeof CAMPUSES)[number]);
  return { point: d.coordinates, campusId: d.id, label: d.name, isDefault: true, located: false };
}
