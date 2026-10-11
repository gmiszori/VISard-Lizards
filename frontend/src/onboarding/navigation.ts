export function visibleStepIndices(ids: readonly string[], ratingsAvailable: boolean): number[] {
  return ids.flatMap((id, index) => id === 'ratings' && !ratingsAvailable ? [] : [index]);
}

export function adjacentStepIndex(visible: readonly number[], current: number, direction: -1 | 1): number | null {
  return (direction === 1 ? visible.find(index => index > current) : [...visible].reverse().find(index => index < current)) ?? null;
}
