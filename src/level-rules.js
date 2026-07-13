const DEFAULT_LEVEL = 'A0';

export const LEVEL_SENTENCE_RULES = Object.freeze({
  A0: Object.freeze({ minWords: 2, maxWords: 6 }),
  A1: Object.freeze({ minWords: 4, maxWords: 9 }),
  A2: Object.freeze({ minWords: 6, maxWords: 12 }),
  B1: Object.freeze({ minWords: 8, maxWords: 16 }),
  B2: Object.freeze({ minWords: 10, maxWords: 20 }),
  C1: Object.freeze({ minWords: 12, maxWords: 24 }),
  C2: Object.freeze({ minWords: 14, maxWords: 30 })
});

export function getLevelSentenceRule(level) {
  return LEVEL_SENTENCE_RULES[String(level || '').toUpperCase()] || LEVEL_SENTENCE_RULES[DEFAULT_LEVEL];
}

export function getLevelMaxWords(level) {
  return getLevelSentenceRule(level).maxWords;
}

export function getEffectiveSentenceRule(level, configuredMaxWords) {
  const base = getLevelSentenceRule(level);
  const parsedMax = Number(configuredMaxWords);
  const maxWords = Number.isFinite(parsedMax) && parsedMax >= 2
    ? Math.min(40, Math.round(parsedMax))
    : base.maxWords;
  return {
    minWords: Math.min(base.minWords, maxWords),
    maxWords
  };
}
