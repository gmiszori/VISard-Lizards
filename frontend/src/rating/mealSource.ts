/**
 * Where the meals of a rating day come from.
 *
 * - No backend configured: the bundled list.
 * - Backend configured: the backend's list. If that request fails the error is passed on, because the
 *   bundled list can contain an id that the backend stores for a different dish, and the rating is sent
 *   to the backend.
 * - `allowBundledFallback` is only for the development simulator, whose ratings never leave the device.
 */
export async function loadMeals<T>(live: (() => Promise<T[]>) | null, bundled: () => T[], allowBundledFallback = false): Promise<T[]> {
  if (!live) return bundled();
  try {
    return await live();
  } catch (error) {
    if (allowBundledFallback) return bundled();
    throw error;
  }
}
