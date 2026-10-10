import test from 'node:test';
import assert from 'node:assert/strict';
import { addSpeechPhraseHints, chooseFoodAwareTranscript, speechRecognitionConstructor } from './speech.ts';

test('speech recognition supports standard and Chromium-prefixed browser APIs', () => {
  class MockRecognition { }
  assert.equal(speechRecognitionConstructor({ SpeechRecognition: MockRecognition }), MockRecognition);
  assert.equal(speechRecognitionConstructor({ webkitSpeechRecognition: MockRecognition }), MockRecognition);
  assert.equal(speechRecognitionConstructor({}), null);
  assert.equal(speechRecognitionConstructor(null), null);
});

test('contextual food and price phrases are added when the browser supports phrase hints', () => {
  class MockPhrase {
    phrase: string;
    boost: number;
    constructor(phrase: string, boost: number) { this.phrase = phrase; this.boost = boost; }
  }
  const recognition = {
    lang: 'en-US', continuous: false, interimResults: false,
    onstart: null, onend: null, onresult: null, onerror: null,
    start() { }, stop() { }, phrases: [] as MockPhrase[],
  };
  const added = addSpeechPhraseHints({ SpeechRecognitionPhrase: MockPhrase }, recognition, [' chicken ', 'chicken', '10 francs']);
  assert.equal(added, true);
  assert.deepEqual(recognition.phrases.map(phrase => phrase.phrase), ['chicken', '10 francs']);
  assert.ok(recognition.phrases.every(phrase => phrase.boost === 10));
});

test('contextual phrase hints safely fall back on browsers without support', () => {
  assert.equal(addSpeechPhraseHints({}, { } as never, ['chicken']), false);
  assert.equal(addSpeechPhraseHints({ SpeechRecognitionPhrase: class { } }, { } as never, ['chicken']), false);
});

test('food-aware selection prefers a browser alternative matching a current venue or dish', () => {
  assert.equal(chooseFoodAwareTranscript([
    { transcript: 'what can I eat at Eagle', confidence: 0.8 },
    { transcript: 'what can I eat at Irchel', confidence: 0.4 },
  ], ['Irchel Bar', 'Mensa Irchel']), 'what can I eat at Irchel');
  assert.equal(chooseFoodAwareTranscript([
    { transcript: 'vegan', confidence: 0.8 },
    { transcript: 'we can', confidence: 0.2 },
  ], ['vegan', 'chicken', 'tofu']), 'vegan');
});

test('food-aware selection keeps the browser first choice without a strong context match', () => {
  assert.equal(chooseFoodAwareTranscript([
    { transcript: 'something unclear', confidence: 0.8 },
    { transcript: 'something slightly different', confidence: 0.5 },
  ], ['Chicken Curry', 'Irchel']), 'something unclear');
});

test('food-aware selection repairs close Swiss campus-name errors from browser transcripts', () => {
  assert.equal(chooseFoodAwareTranscript([
    { transcript: 'Chicken at Eagle', confidence: 0.8 },
    { transcript: 'Chicken at Hungerberg', confidence: 0.3 },
  ], ['chicken', 'ETH Hönggerberg'], ['ETH Hönggerberg']), 'Chicken at Hönggerberg');
  assert.equal(chooseFoodAwareTranscript([
    { transcript: 'Chicken at center', confidence: 0.8 },
  ], ['chicken', 'ETH Zentrum'], ['ETH Zentrum'], [{ alias: 'center', canonical: 'Zentrum' }]), 'Chicken at Zentrum');
});
