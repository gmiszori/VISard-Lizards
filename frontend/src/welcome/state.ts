export const WELCOME_KEY = 'campuseats-welcome-tour';
export type WelcomeStep = 'install' | 'personalise' | 'settings' | 'finish';

export function welcomeStep(saved: string | null, hasProfile: boolean): WelcomeStep | null {
  if (saved === 'done') return null;
  if (saved === 'settings' || saved === 'finish') return saved;
  if (hasProfile) return null;
  return saved === 'personalise' ? 'personalise' : 'install';
}

export function nextWelcomeStep(step: WelcomeStep): WelcomeStep | 'done' {
  return ({ install: 'personalise', personalise: 'settings', settings: 'finish', finish: 'done' } as const)[step];
}

export function clearAppStorage(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>): void {
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index);
    if (key?.startsWith('campuseats-')) storage.removeItem(key);
  }
}

export async function clearAppCaches(cacheStorage: Pick<CacheStorage, 'keys' | 'delete'>): Promise<void> {
  const keys = await cacheStorage.keys();
  await Promise.all(keys.filter(key => key.startsWith('unieats-') || key.startsWith('campuseats-'))
    .map(key => cacheStorage.delete(key)));
}
