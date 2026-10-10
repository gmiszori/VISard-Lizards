export interface SpeechRecognitionAlternativeLike { transcript: string; confidence?: number }
export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternativeLike;
}
export interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [index: number]: SpeechRecognitionResultLike };
}
export interface SpeechRecognitionErrorLike extends Event { readonly error: string }
export interface SpeechRecognitionPhraseLike { phrase: string; boost: number }
export interface SpeechPlaceAlias { alias: string; canonical: string }
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  phrases?: SpeechRecognitionPhraseLike[];
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  start(): void;
  stop(): void;
}
export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
export type SpeechRecognitionPhraseConstructor = new (phrase: string, boost?: number) => SpeechRecognitionPhraseLike;

/** Standard name and Chromium's prefixed name. No credentials or API key are used by browser STT. */
export function speechRecognitionConstructor(host: unknown): SpeechRecognitionConstructor | null {
  if (!host || typeof host !== 'object') return null;
  const browser = host as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  const candidate = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
  return typeof candidate === 'function' ? candidate as SpeechRecognitionConstructor : null;
}

/** Applies experimental Web Speech contextual biasing when both the browser and recognizer support it. */
export function addSpeechPhraseHints(
  host: unknown,
  recognition: SpeechRecognitionLike,
  phrases: readonly string[],
): boolean {
  if (!host || typeof host !== 'object' || !('phrases' in recognition)) return false;
  const browser = host as { SpeechRecognitionPhrase?: unknown };
  if (typeof browser.SpeechRecognitionPhrase !== 'function') return false;
  try {
    const Phrase = browser.SpeechRecognitionPhrase as SpeechRecognitionPhraseConstructor;
    const unique = [...new Set(phrases.map(phrase => phrase.trim()).filter(Boolean))].slice(0, 100);
    recognition.phrases = unique.map(phrase => new Phrase(phrase, 10));
    return true;
  } catch {
    // Browser support is experimental and varies by recognition service.
    return false;
  }
}

function normalizeToken(value: string): string {
  return value.toLocaleLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    // Swiss German place names are often spelled phonetically by English recognizers.
    .replaceAll('ae', 'a').replaceAll('oe', 'o').replaceAll('ue', 'u');
}

function tokens(value: string): string[] {
  return value.toLocaleLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

function normalizedTokens(value: string): string[] {
  return tokens(value).map(normalizeToken);
}

function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row++) {
    const current = [row];
    for (let column = 1; column <= right.length; column++) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function placeWordDistance(word: string, placeWord: string): number {
  const left = normalizeToken(word);
  const right = normalizeToken(placeWord);
  if (left === right) return 0;
  const distance = editDistance(left, right);
  const allowance = Math.max(left.length, right.length) >= 9 ? 2 : 1;
  return distance <= allowance ? distance : Number.POSITIVE_INFINITY;
}

function canonicalizePlaceWords(
  transcript: string,
  placePhrases: readonly string[],
  placeAliases: readonly SpeechPlaceAlias[],
): string {
  const ignored = new Set(['mensa', 'cafe', 'cafeteria', 'restaurant', 'canteen', 'eth', 'uzh']);
  const placeWords = [...new Set([
    ...placePhrases.flatMap(normalizedTokens),
    ...placeAliases.flatMap(alias => normalizedTokens(alias.alias)),
  ].filter(word => word.length >= 5 && !ignored.has(word)))];
  const wordMatches = [...transcript.matchAll(/[\p{L}\p{N}]+/gu)];
  let result = transcript;
  for (const match of wordMatches.reverse()) {
    const spoken = match[0];
    const spokenNormalized = normalizeToken(spoken);
    const alias = placeAliases.find(candidate => normalizeToken(candidate.alias) === spokenNormalized);
    if (alias) {
      const start = match.index ?? 0;
      result = `${result.slice(0, start)}${alias.canonical}${result.slice(start + spoken.length)}`;
      continue;
    }
    const place = placeWords
      .map(word => ({ word, distance: placeWordDistance(spoken, word) }))
      .filter(candidate => Number.isFinite(candidate.distance))
      .sort((a, b) => a.distance - b.distance)[0];
    if (!place || place.distance === 0 && spokenNormalized === place.word) continue;
    const canonical = placePhrases.flatMap(phrase => phrase.match(/[\p{L}\p{N}]+/gu) ?? [])
      .find(word => normalizeToken(word) === place.word);
    if (!canonical) continue;
    const start = match.index ?? 0;
    result = `${result.slice(0, start)}${canonical}${result.slice(start + spoken.length)}`;
  }
  return result;
}

/**
 * Pick among browser-provided transcripts using this page's dish and canteen vocabulary.
 * It only rewrites close matches to known place names; without a strong contextual match, browser order wins.
 */
export function chooseFoodAwareTranscript(
  alternatives: readonly SpeechRecognitionAlternativeLike[],
  contextPhrases: readonly string[],
  placePhrases: readonly string[] = [],
  placeAliases: readonly SpeechPlaceAlias[] = [],
): string | null {
  const candidates = alternatives
    .map((alternative, index) => ({ alternative, index, words: tokens(alternative.transcript) }))
    .filter(candidate => candidate.words.length > 0);
  if (!candidates.length) return null;

  const phrases = [...new Set(contextPhrases.map(tokens).filter(phrase => phrase.length > 0)
    .map(phrase => phrase.join(' ')))].map(phrase => phrase.split(' '));
  const ignored = new Set(['mensa', 'cafe', 'cafeteria', 'restaurant', 'canteen', 'eth', 'uzh']);
  const placeWords = [...new Set([
    ...placePhrases.flatMap(normalizedTokens),
    ...placeAliases.flatMap(alias => normalizedTokens(alias.alias)),
  ].filter(word => word.length >= 5 && !ignored.has(word)))];
  const score = (candidate: typeof candidates[number]) => {
    const transcript = ` ${candidate.words.join(' ')} `;
    const confidence = candidate.alternative.confidence;
    let result = (Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence!)) : 0) * 0.8;
    if (candidate.index === 0) result += 0.1;
    for (const phrase of phrases) {
      const normalized = ` ${phrase.join(' ')} `;
      if (!transcript.includes(normalized)) continue;
      result += phrase.length > 1 ? 3.5 : 2;
      if (phrase.length > 1) break;
    }
    if (!phrases.some(phrase => transcript.includes(` ${phrase.join(' ')} `))) {
      const contextWords = new Set(phrases.flat().filter(word => word.length >= 4
        && !['food', 'dish', 'meal', 'menu', 'this', 'that', 'with', 'from', 'under', 'here', 'current', 'vegan', 'veggie'].includes(word)));
      if (candidate.words.some(word => contextWords.has(word))) result += 2.4;
    }
    if (candidate.words.some(word => placeWords.some(place => Number.isFinite(placeWordDistance(word, place)))))
      result += 2.8;
    return result;
  };

  const first = candidates.find(candidate => candidate.index === 0) ?? candidates[0];
  const firstScore = score(first);
  let best = first;
  let bestScore = firstScore;
  for (const candidate of candidates) {
    const candidateScore = score(candidate);
    if (candidateScore > bestScore) {
      best = candidate;
      bestScore = candidateScore;
    }
  }
  const selected = bestScore - firstScore >= 1.4 ? best : first;
  return canonicalizePlaceWords(selected.alternative.transcript.trim(), placePhrases, placeAliases);
}
