/**
 * Search helpers. People type "zurich" for "Zürich", "spaetzli" or "spatzli" for "Spätzli", "hornli" for
 * "Hörnli", and phones often have no umlaut keys. Both the text and the query are folded the same way, so
 * these all match. Two foldings are tried, so a query is never broadened more than needed:
 *   plain:    ä ö ü é ... -> a o u e ...   ("spatzli", "hornli", "zurich")
 *   expanded: ä ö ü      -> ae oe ue       ("spaetzli", "hoernli", "zuerich")
 */
const lower = (text: string) => text.normalize('NFKC').toLocaleLowerCase('de-CH').replace(/ß/g, 'ss');

/** Removes accents: "Zürich" -> "zurich", "crème" -> "creme". */
export function foldPlain(text: string): string {
  return lower(text).normalize('NFD').replace(/\p{M}+/gu, '');
}

/** German umlauts as two letters, other accents removed: "Zürich" -> "zuerich", "crème" -> "creme". */
export function foldExpanded(text: string): string {
  return lower(text).replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').normalize('NFD').replace(/\p{M}+/gu, '');
}

/** True when the query (trimmed, any case, with or without umlauts) is part of the text. An empty query matches everything. */
export function matchesQuery(text: string, query: string): boolean {
  const needle = query.trim();
  if (needle === '') return true;
  return foldPlain(text).includes(foldPlain(needle)) || foldExpanded(text).includes(foldExpanded(needle));
}
