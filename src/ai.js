import { z } from 'zod';

const CandidateSchema = z.object({
  interpretation_ru: z.string().default(''),
  corrected_student_de: z.string().default(''),
  main: z.string().min(1),
  simpler: z.string().default(''),
  shorter: z.string().default(''),
  yes_no: z.string().default(''),
  choice: z.string().default(''),
  starter: z.string().default(''),
  full_model: z.string().default(''),
  recast: z.string().default(''),
  continue: z.string().default(''),
  clarification: z.string().default(''),
  expected_answer_de: z.string().default(''),
  teacher_hint_ru: z.string().default(''),
  keyword: z.string().default(''),
  new_words: z.array(z.string()).default([]),
  grammar_used: z.array(z.string()).default([]),
  recommended_scaffold: z.number().int().min(0).max(6).default(0),
  confidence: z.number().min(0).max(1).default(0.7)
});

const FUNCTION_WORDS = new Set([
  'ich','du','er','sie','es','wir','ihr','ihnen','ihn','mir','dir','mich','dich','sich','mein','meine','meinen','meiner',
  'dein','deine','deinen','deiner','sein','seine','seinen','ihr','ihre','ihren','unser','unsere','euer','eure',
  'der','die','das','den','dem','des','ein','eine','einen','einem','einer','kein','keine','keinen','keinem','keiner',
  'und','oder','aber','auch','nicht','noch','schon','nur','sehr','so','gern','bitte','ja','nein','doch','hier','dort',
  'wo','woher','wohin','was','wer','wie','wann','warum','welche','welcher','welches','mit','in','an','auf','aus','bei',
  'von','zu','zum','zur','für','ohne','über','unter','vor','nach','zwischen','bis','am','im','ins','ans','ist','sind',
  'bin','bist','seid','war','waren','habe','hast','hat','haben','möchte','möchtest','möchten','kann','kannst','können',
  'will','willst','wollen','muss','musst','müssen','soll','sollst','sollen','darf','darfst','dürfen','machen','sagen',
  'sag','komm','kommen','kommt','wohnen','wohnst','wohnt','heißen','heißt','heisse','lernen','lernst','lernt',
  'nochmal','noch','einmal','langsam','wieder','weiter','gut','richtig','okay','super','toll','danke','entschuldigung'
]);

export class AiService {
  constructor({ apiKey, baseUrl, model, reasoningEffort = 'none', timeoutMs = 20000 }) {
    this.apiKey = apiKey;
    this.baseUrl = String(baseUrl || 'https://api.aitunnel.ru/v1').replace(/\/$/, '');
    this.model = model || 'gpt-5.4-mini';
    this.reasoningEffort = reasoningEffort;
    this.timeoutMs = Number(timeoutMs || 20000);
  }

  get enabled() {
    return Boolean(this.apiKey);
  }

  async generate({ transcript, profile, lesson, recentTurns = [], action = 'AUTO', scaffoldLevel = 0, teacherInstruction = '' }) {
    if (!this.enabled) {
      return enrichAndValidate(fallbackCandidate(transcript, scaffoldLevel), profile, lesson);
    }

    const system = buildSystemPrompt();
    const user = buildTurnPrompt({ transcript, profile, lesson, recentTurns, action, scaffoldLevel, teacherInstruction });

    try {
      const json = await this.requestJson({ system, user, maxTokens: 900 });
      const parsed = CandidateSchema.parse(normalizeCandidate(json));
      return enrichAndValidate(parsed, profile, lesson);
    } catch (error) {
      console.error('[AITUNNEL] generation failed:', error.message);
      const fallback = fallbackCandidate(transcript, scaffoldLevel);
      fallback.teacher_hint_ru = `AITUNNEL недоступен: ${error.message}`;
      return enrichAndValidate(fallback, profile, lesson);
    }
  }

  async transform({ currentText, transcript, profile, lesson, instruction, scaffoldLevel = 0, recentTurns = [] }) {
    if (!this.enabled) {
      return enrichAndValidate({
        ...fallbackCandidate(transcript, scaffoldLevel),
        main: currentText || fallbackCandidate(transcript, scaffoldLevel).main,
        teacher_hint_ru: 'Демо-режим: сохранён текущий текст.'
      }, profile, lesson);
    }

    const system = buildSystemPrompt();
    const user = `${buildTurnPrompt({
      transcript,
      profile,
      lesson,
      recentTurns,
      action: 'TRANSFORM',
      scaffoldLevel,
      teacherInstruction: instruction
    })}\n\nCURRENT_TEACHER_TEXT:\n${currentText}\n\nTransform CURRENT_TEACHER_TEXT according to TEACHER_INSTRUCTION while preserving the pedagogical target. Return the complete JSON package.`;

    try {
      const json = await this.requestJson({ system, user, maxTokens: 900 });
      const parsed = CandidateSchema.parse(normalizeCandidate(json));
      return enrichAndValidate(parsed, profile, lesson);
    } catch (error) {
      console.error('[AITUNNEL] transform failed:', error.message);
      return enrichAndValidate({
        ...fallbackCandidate(transcript, scaffoldLevel),
        main: currentText,
        teacher_hint_ru: `Не удалось изменить: ${error.message}`
      }, profile, lesson);
    }
  }

  async summarizeSession({ profile, lesson, logs }) {
    if (!this.enabled) return deterministicSummary(profile, lesson, logs);
    const compactLogs = logs.slice(-80).map((item) => ({
      type: item.type,
      text: item.text || item.transcript || '',
      scaffoldLevel: item.scaffoldLevel,
      assessment: item.assessment
    }));
    const system = 'You are a German teacher. Return valid JSON only. Do not include markdown.';
    const user = `Create a concise Russian-language lesson summary.\nSTUDENT: ${profile.name}\nLEVEL: ${profile.level}\nLESSON: ${lesson?.title || ''}\nLOGS: ${JSON.stringify(compactLogs)}\nReturn {"summary_ru":"...","mastered_words":[],"repeat_words":[],"next_steps":[]}.`;
    try {
      return await this.requestJson({ system, user, maxTokens: 600 });
    } catch {
      return deterministicSummary(profile, lesson, logs);
    }
  }

  async requestJson({ system, user, maxTokens }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.15,
          max_tokens: maxTokens,
          stream: false,
          reasoning: {
            effort: this.reasoningEffort,
            exclude: true
          }
        }),
        signal: controller.signal
      });

      const raw = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${raw.slice(0, 500)}`);
      }
      const payload = JSON.parse(raw);
      const content = payload?.choices?.[0]?.message?.content;
      if (!content) throw new Error('Пустой ответ модели');
      return safeJson(content);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildSystemPrompt() {
  return `You are a real-time German teacher copilot. The human teacher approves every line before it reaches the student.

Your top priority is A0-A1 learners. Generate a PACKAGE of immediately usable German reactions so the teacher can switch variants without another model call.

STRICT RULES:
- say_de fields must contain only German.
- Russian is allowed only in interpretation_ru and teacher_hint_ru.
- Preserve the student's intended meaning. Never invent personal facts.
- If the meaning is clear but grammar is wrong, prefer a natural recast or a short confirmation question.
- At A0/high sterility, use 2-6 words, one clause, present tense, one communicative goal, no subordinate clauses, no idioms.
- At sterile A1, use 4-9 words, one short question or sentence.
- Use known words whenever possible. Do not use words listed as unknown or avoid.
- Do not introduce more new words than maxNewWords.
- Scaffolding ladder: 0 natural/open; 1 slower/easier; 2 simpler; 3 yes/no; 4 A/B choice; 5 sentence starter; 6 full model for repetition.
- Every variant must remain on the same topic and target grammar.
- "choice" must contain exactly two clear alternatives.
- "starter" must be an incomplete German answer ending with an ellipsis.
- "full_model" must be a complete answer the student can repeat.
- "recast" is a corrected version of the student's intended utterance, not an explanation.
- "continue" advances the conversation without unnecessary correction.
- Never say "Fast richtig" or give long praise.

TARGETED CORRECTION (very important):
- If STUDENT_UTTERANCE is already correct and on target, set "main" to a short warm acknowledgement such as "Okay, danke schön!", "Genau, sehr gut!" or "Richtig!" and let "recast" repeat the correct sentence unchanged.
- If STUDENT_UTTERANCE contains one or more wrong words (the student said a similar but incorrect word, e.g. "Flasche" instead of "Fleisch", or "Esen" instead of "Essen"), correct ONLY those specific words using the pattern "Nicht <falsches Wort>. <richtiges Wort>." — one such pair per wrong word, chained if there are several (e.g. "Nicht Flasche. Fleisch. Nicht Esen. Essen."). Put this in "recast", and use it as "main" when the requested action is correction. Do not rephrase the words the student already said correctly.
- Return valid JSON only, with all keys listed below.

OUTPUT KEYS:
interpretation_ru, corrected_student_de, main, simpler, shorter, yes_no, choice, starter, full_model, recast, continue, clarification, expected_answer_de, teacher_hint_ru, keyword, new_words, grammar_used, recommended_scaffold, confidence.`;
}

function buildTurnPrompt({ transcript, profile, lesson, recentTurns, action, scaffoldLevel, teacherInstruction }) {
  const lessonVocabulary = lesson?.vocabulary || [];
  const knownWords = unique([...(profile.knownWords || []), ...(profile.learningWords || []), ...lessonVocabulary]);
  return `STUDENT_UTTERANCE:\n${transcript}\n\nPROFILE:\n${JSON.stringify({
    name: profile.name,
    level: profile.level,
    sterility: profile.sterility,
    maxWords: profile.maxWords,
    maxNewWords: profile.maxNewWords,
    knownWords,
    explicitlyUnknownWords: profile.unknownWords || [],
    knownGrammar: profile.knownGrammar || [],
    repeatTopics: profile.repeatTopics || [],
    learningGoals: profile.learningGoals || [],
    avoid: profile.avoid || [],
    notes: profile.notes || ''
  })}\n\nCURRENT_LESSON:\n${JSON.stringify({
    id: lesson?.id,
    title: lesson?.title,
    speechActs: lesson?.speechActs || [],
    grammar: lesson?.grammar || [],
    vocabulary: lessonVocabulary
  })}\n\nRECENT_DIALOGUE:\n${JSON.stringify(recentTurns.slice(-8))}\n\nREQUESTED_ACTION: ${action}\nSCAFFOLD_LEVEL: ${scaffoldLevel}\nTEACHER_INSTRUCTION: ${teacherInstruction || 'none'}\n\nChoose main according to REQUESTED_ACTION and SCAFFOLD_LEVEL, but still return all variants.`;
}

function normalizeCandidate(value) {
  const candidate = value?.candidate || value?.result || value;
  const aliases = candidate?.alternatives || {};
  return {
    interpretation_ru: candidate.interpretation_ru || '',
    corrected_student_de: candidate.corrected_student_de || candidate.corrected || '',
    main: candidate.main || candidate.say_de || candidate.response || 'Noch einmal, bitte.',
    simpler: candidate.simpler || aliases.simpler || '',
    shorter: candidate.shorter || aliases.shorter || '',
    yes_no: candidate.yes_no || candidate.yesNo || aliases.yes_no || '',
    choice: candidate.choice || aliases.choice || '',
    starter: candidate.starter || candidate.sentence_starter || aliases.starter || '',
    full_model: candidate.full_model || candidate.fullModel || aliases.full_model || '',
    recast: candidate.recast || aliases.recast || '',
    continue: candidate.continue || candidate.follow_up || aliases.continue || '',
    clarification: candidate.clarification || aliases.clarification || '',
    expected_answer_de: candidate.expected_answer_de || candidate.expected_answer || '',
    teacher_hint_ru: candidate.teacher_hint_ru || candidate.teacher_hint || '',
    keyword: candidate.keyword || '',
    new_words: Array.isArray(candidate.new_words) ? candidate.new_words : [],
    grammar_used: Array.isArray(candidate.grammar_used) ? candidate.grammar_used : [],
    recommended_scaffold: Number(candidate.recommended_scaffold ?? 0),
    confidence: Number(candidate.confidence ?? 0.7)
  };
}

function enrichAndValidate(candidate, profile, lesson) {
  const normalized = normalizeCandidate(candidate);
  const variants = {
    main: normalized.main,
    simpler: normalized.simpler || normalized.shorter || normalized.main,
    shorter: normalized.shorter || normalized.simpler || normalized.main,
    yes_no: normalized.yes_no || normalized.clarification || normalized.main,
    choice: normalized.choice || normalized.yes_no || normalized.main,
    starter: normalized.starter || makeStarter(normalized.full_model || normalized.corrected_student_de || normalized.main),
    full_model: normalized.full_model || normalized.corrected_student_de || normalized.main,
    recast: normalized.recast || normalized.corrected_student_de || normalized.main,
    continue: normalized.continue || normalized.main,
    clarification: normalized.clarification || normalized.yes_no || normalized.main
  };
  const allowed = new Set(
    unique([...(profile.knownWords || []), ...(profile.learningWords || []), ...(lesson?.vocabulary || [])])
      .flatMap(tokenize)
  );
  const unknown = detectNewWords(variants.main, allowed, profile.unknownWords || []);
  return {
    ...normalized,
    ...variants,
    new_words: unique([...(normalized.new_words || []), ...unknown]),
    word_count: tokenize(variants.main).length,
    exceeds_word_limit: tokenize(variants.main).length > Number(profile.maxWords || 99),
    generated_at: new Date().toISOString()
  };
}

function detectNewWords(text, allowed, explicitUnknown) {
  const blocked = new Set(explicitUnknown.flatMap(tokenize));
  return unique(tokenize(text).filter((token) => {
    if (FUNCTION_WORDS.has(token)) return false;
    if (allowed.has(token)) return false;
    if ([...allowed].some((item) => item.length > 4 && (token.startsWith(item.slice(0, -1)) || item.startsWith(token.slice(0, -1))))) return false;
    return token.length > 2 || blocked.has(token);
  }));
}

function fallbackCandidate(transcript, scaffoldLevel = 0) {
  const cleaned = String(transcript || '').trim().replace(/[.!?]+$/, '');
  const mainByLevel = [
    'Und weiter?',
    'Sag bitte mehr.',
    'Noch einmal, bitte.',
    'Ist das richtig?',
    'Ja oder nein?',
    'Ich ...',
    cleaned ? `${cleaned}.` : 'Sag: Ich lerne Deutsch.'
  ];
  const main = mainByLevel[Math.max(0, Math.min(6, Number(scaffoldLevel)))] || mainByLevel[0];
  return {
    interpretation_ru: 'Демо-режим без AITUNNEL.',
    corrected_student_de: cleaned ? `${cleaned}.` : '',
    main,
    simpler: 'Noch einmal, bitte.',
    shorter: 'Noch einmal?',
    yes_no: 'Ist das richtig?',
    choice: 'Ja oder nein?',
    starter: 'Ich ...',
    full_model: cleaned ? `${cleaned}.` : 'Ich lerne Deutsch.',
    recast: cleaned ? `${cleaned}.` : 'Ich lerne Deutsch.',
    continue: 'Und weiter?',
    clarification: 'Meinst du das?',
    expected_answer_de: 'Ja.',
    teacher_hint_ru: 'Добавьте AITUNNEL_API_KEY для адаптивной генерации.',
    keyword: cleaned.split(/\s+/)[0] || 'Deutsch',
    new_words: [],
    grammar_used: [],
    recommended_scaffold: Number(scaffoldLevel),
    confidence: 0.25
  };
}

function deterministicSummary(profile, lesson, logs) {
  const assessments = logs.filter((item) => item.type === 'assessment');
  const independent = assessments.filter((item) => item.assessment === 'independent').length;
  const prompted = assessments.filter((item) => item.assessment === 'prompted').length;
  const errors = assessments.filter((item) => item.assessment === 'error').length;
  return {
    summary_ru: `${profile.name}: урок «${lesson?.title || ''}». Самостоятельно: ${independent}, с подсказкой: ${prompted}, ошибки: ${errors}.`,
    mastered_words: [],
    repeat_words: profile.learningWords?.slice(0, 12) || [],
    next_steps: profile.repeatTopics?.slice(0, 5) || []
  };
}

function makeStarter(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'Ich ...';
  return `${words.slice(0, Math.min(3, Math.max(1, words.length - 1))).join(' ')} ...`;
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .match(/[a-zäöü]+/g) || [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function safeJson(content) {
  const stripped = String(content).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(stripped.slice(start, end + 1));
    throw new Error('Модель вернула невалидный JSON');
  }
}
