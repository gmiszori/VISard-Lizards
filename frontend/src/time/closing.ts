/** Minutes until the current opening period ends; join overlapping or adjoining windows. */
export function closingIn(windows: readonly (readonly [number, number])[], minute: number): number | null {
  const active = windows.filter(([from, to]) => from <= minute && minute < to);
  if (!active.length) return null;
  let end = Math.max(...active.map(([, to]) => to));
  for (const [from, to] of [...windows].sort((a, b) => a[0] - b[0])) {
    if (from <= end && to > end) end = to;
  }
  const remaining = Math.ceil(end - minute);
  return remaining <= 30 ? remaining : null;
}
