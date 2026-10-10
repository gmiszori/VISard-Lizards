/** "2 dishes hidden: they contain gluten, milk." in the page language. */
export function allergenNotice(count: number, names: string[], lang: 'en' | 'de'): string {
  const list = names.join(', ');
  if (lang === 'de') return `${count} ${count === 1 ? 'Gericht' : 'Gerichte'} ausgeblendet: ${count === 1 ? 'enthält' : 'enthalten'} ${list}.`;
  return `${count} ${count === 1 ? 'dish' : 'dishes'} hidden: ${count === 1 ? 'it contains' : 'they contain'} ${list}.`;
}
