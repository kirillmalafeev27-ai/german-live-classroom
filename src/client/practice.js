import { $, esc, toast, setBusy, refreshMicrophoneSelect, startVoiceCapture, transcribeAudio } from './shared.js';

const PROGRESS_STORAGE_KEY = 'glc.practiceProgress.v1';
const LEVEL_STORAGE_KEY = 'glc.practiceLevel';

const state = {
  curricula: { A1: [], A2: [] },
  scenariosByLevel: { A1: {}, A2: {} },
  lessons: [],
  scenarios: {},
  config: { sttEnabled: false, ttsEnabled: false, aiEnabled: false },
  level: localStorage.getItem(LEVEL_STORAGE_KEY) === 'A2' ? 'A2' : 'A1',
  moduleId: 1,
  mode: 'dialog',
  scenarioId: '',
  history: [],
  started: false,
  busy: false,
  capture: null,
  micOn: false,
  lastAiText: '',
  currentAudio: null,
  pendingInputMethod: 'typed',
  progress: loadProgress()
};

const els = {};

document.addEventListener('DOMContentLoaded', boot);

async function boot() {
  cache();
  bind();
  try {
    const [curriculum, practice] = await Promise.all([
      fetchJson('/api/curriculum'),
      fetchJson('/api/practice/scenarios')
    ]);
    state.curricula = {
      A1: practice.curricula?.A1 || curriculum.lessons || [],
      A2: practice.curricula?.A2 || []
    };
    state.scenariosByLevel = {
      A1: practice.scenariosByLevel?.A1 || practice.scenarios || {},
      A2: practice.scenariosByLevel?.A2 || {}
    };
    state.config = {
      sttEnabled: Boolean(practice.sttEnabled),
      ttsEnabled: Boolean(practice.ttsEnabled),
      aiEnabled: Boolean(practice.aiEnabled)
    };
    applyLevel(state.level, { resetConversation: false });
    refreshMics();
    if (!state.config.aiEnabled) {
      els.status.textContent = 'AITUNNEL не настроен';
      els.status.className = 'status-badge warn';
      els.startButton.disabled = true;
    }
    if (!state.config.sttEnabled) {
      els.startMicButton.disabled = true;
      els.startMicButton.textContent = 'Микрофон недоступен';
    }
    if (!state.config.ttsEnabled) {
      els.repeatButton.disabled = true;
      els.slowerButton.disabled = true;
    }
  } catch (error) {
    els.status.textContent = 'Ошибка загрузки';
    els.status.className = 'status-badge error';
    toast(error.message, 'error');
  }
}

function cache() {
  els.status = $('#practiceStatus');
  els.levelSelect = $('#levelSelect');
  els.moduleSelect = $('#moduleSelect');
  els.modeSelect = $('#modeSelect');
  els.scenarioField = $('#scenarioField');
  els.scenarioSelect = $('#scenarioSelect');
  els.startButton = $('#startButton');
  els.setupHint = $('#setupHint');
  els.vocabularySummary = $('#vocabularySummary');
  els.practiceVocabulary = $('#practiceVocabulary');
  els.progressCaption = $('#progressCaption');
  els.progressSummary = $('#progressSummary');
  els.progressModules = $('#progressModules');
  els.resetProgressButton = $('#resetProgressButton');

  els.startMicButton = $('#startMicButton');
  els.stopMicButton = $('#stopMicButton');
  els.micSelect = $('#micSelect');
  els.micSignal = $('#micSignal');
  els.micMeterValue = $('#micMeterValue');
  els.micMeterFill = $('#micMeterFill');
  els.liveTranscript = $('#liveTranscript');
  els.correctionLine = $('#correctionLine');

  els.listenState = $('#listenState');
  els.listenHint = $('#listenHint');
  els.repeatButton = $('#repeatButton');
  els.slowerButton = $('#slowerButton');
  els.revealButton = $('#revealButton');
  els.revealBox = $('#revealBox');
  els.revealText = $('#revealText');
  els.hintBox = $('#hintBox');

  els.typedForm = $('#typedForm');
  els.typedInput = $('#typedInput');
  els.sendTypedButton = $('#sendTypedButton');
}

function bind() {
  els.levelSelect.addEventListener('change', () => applyLevel(els.levelSelect.value));
  els.moduleSelect.addEventListener('change', () => { state.moduleId = Number(els.moduleSelect.value); onSetupChange(); });
  els.modeSelect.addEventListener('change', () => { state.mode = els.modeSelect.value; onSetupChange(); });
  els.scenarioSelect.addEventListener('change', () => { state.scenarioId = els.scenarioSelect.value; });
  els.startButton.addEventListener('click', startSession);
  els.resetProgressButton.addEventListener('click', resetCurrentLevelProgress);

  els.startMicButton.addEventListener('click', startMic);
  els.stopMicButton.addEventListener('click', stopMic);
  els.micSelect.addEventListener('change', () => { if (state.micOn) { stopMic(); startMic(); } });

  els.repeatButton.addEventListener('click', () => replay(1));
  els.slowerButton.addEventListener('click', () => replay(0.75));
  els.revealButton.addEventListener('click', revealText);

  els.typedForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = els.typedInput.value.trim();
    if (!text) return;
    els.typedInput.value = '';
    sendUser(text, 'typed');
  });
}

function applyLevel(level, { resetConversation = true } = {}) {
  state.level = level === 'A2' ? 'A2' : 'A1';
  localStorage.setItem(LEVEL_STORAGE_KEY, state.level);
  els.levelSelect.value = state.level;
  state.lessons = state.curricula[state.level] || [];
  state.scenarios = state.scenariosByLevel[state.level] || {};
  if (!state.lessons.some((lesson) => lesson.id === state.moduleId)) state.moduleId = 1;
  state.scenarioId = '';
  renderModules();
  onSetupChange();
  renderProgress();
  if (resetConversation) {
    stopAudio();
    state.started = false;
    state.history = [];
    state.lastAiText = '';
    els.startButton.textContent = 'Начать';
    els.liveTranscript.textContent = `Выбран уровень ${state.level}. Нажмите «Начать», затем отвечайте голосом или текстом.`;
    els.correctionLine.hidden = true;
    els.revealBox.hidden = true;
    els.hintBox.hidden = true;
    els.listenState.textContent = 'Собеседник ждёт';
  }
}

function renderModules() {
  els.moduleSelect.innerHTML = state.lessons
    .map((lesson) => `<option value="${lesson.id}">${lesson.id}. ${esc(lesson.title)}</option>`)
    .join('');
  els.moduleSelect.value = String(state.moduleId);
}

function currentLesson() {
  return state.lessons.find((lesson) => lesson.id === state.moduleId);
}

function currentScenario() {
  return (state.scenarios[String(state.moduleId)] || []).find((sc) => sc.id === state.scenarioId) || null;
}

function onSetupChange() {
  const lesson = currentLesson();
  const roleplay = state.mode === 'roleplay';
  els.scenarioField.hidden = !roleplay;
  if (roleplay) {
    const list = state.scenarios[String(state.moduleId)] || [];
    if (!list.some((sc) => sc.id === state.scenarioId)) state.scenarioId = list[0]?.id || '';
    els.scenarioSelect.innerHTML = list.map((sc) => `<option value="${esc(sc.id)}">${esc(sc.title)}</option>`).join('');
    els.scenarioSelect.value = state.scenarioId;
  }
  const sc = currentScenario();
  if (roleplay && sc) {
    els.setupHint.innerHTML = `<div><b>${state.level} · ИИ играет:</b> ${esc(sc.aiRole)}. <b>Вы:</b> ${esc(sc.userRole)}.</div><div><b>Задача:</b> ${esc(sc.goal)}</div><div><b>Грамматический фокус:</b> ${esc(sc.focus || (lesson?.grammar || []).join(' · '))}</div>`;
  } else if (lesson) {
    els.setupHint.innerHTML = `<div><b>${state.level} · Грамматика:</b> ${esc((lesson.grammar || []).join(' · ')) || '—'}</div><div><b>Темы:</b> ${esc((lesson.themes || []).join(' · ')) || '—'}</div>`;
  }
  renderVocabulary();
  renderProgress();
}

function renderVocabulary() {
  const lesson = currentLesson();
  const vocabulary = lesson?.vocabulary || [];
  els.vocabularySummary.textContent = `Словарь модуля (${vocabulary.length}) · PDF-страница ${lesson?.sourcePdfPage || '—'}`;
  els.practiceVocabulary.innerHTML = vocabulary
    .map((word) => `<span class="practice-vocab-chip" lang="de">${esc(word)}</span>`)
    .join('') || '<span class="empty-small">Словарь пока не добавлен</span>';
}

function emptyLevelProgress() {
  return {
    sessions: 0,
    turns: 0,
    correct: 0,
    corrections: 0,
    currentStreak: 0,
    bestStreak: 0,
    voiceTurns: 0,
    typedTurns: 0,
    lastPracticedAt: '',
    modules: {}
  };
}

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) || '{}');
    return {
      version: 1,
      levels: {
        A1: { ...emptyLevelProgress(), ...(saved.levels?.A1 || {}) },
        A2: { ...emptyLevelProgress(), ...(saved.levels?.A2 || {}) }
      }
    };
  } catch {
    return { version: 1, levels: { A1: emptyLevelProgress(), A2: emptyLevelProgress() } };
  }
}

function currentLevelProgress() {
  if (!state.progress.levels[state.level]) state.progress.levels[state.level] = emptyLevelProgress();
  const progress = state.progress.levels[state.level];
  if (!progress.modules || typeof progress.modules !== 'object') progress.modules = {};
  return progress;
}

function currentModuleProgress() {
  const progress = currentLevelProgress();
  const key = String(state.moduleId);
  if (!progress.modules[key]) {
    progress.modules[key] = { sessions: 0, turns: 0, correct: 0, corrections: 0, lastPracticedAt: '' };
  }
  return progress.modules[key];
}

function saveProgress() {
  localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(state.progress));
  renderProgress();
}

function recordSessionStart() {
  const now = new Date().toISOString();
  const level = currentLevelProgress();
  const module = currentModuleProgress();
  level.sessions += 1;
  level.lastPracticedAt = now;
  module.sessions += 1;
  module.lastPracticedAt = now;
  saveProgress();
}

function recordPracticeTurn({ corrected, method }) {
  const now = new Date().toISOString();
  const level = currentLevelProgress();
  const module = currentModuleProgress();
  level.turns += 1;
  module.turns += 1;
  if (corrected) {
    level.corrections += 1;
    module.corrections += 1;
    level.currentStreak = 0;
  } else {
    level.correct += 1;
    module.correct += 1;
    level.currentStreak += 1;
    level.bestStreak = Math.max(level.bestStreak, level.currentStreak);
  }
  if (method === 'voice') level.voiceTurns += 1;
  else level.typedTurns += 1;
  level.lastPracticedAt = now;
  module.lastPracticedAt = now;
  saveProgress();
}

function renderProgress() {
  const progress = currentLevelProgress();
  const accuracy = progress.turns ? Math.round((progress.correct / progress.turns) * 100) : 0;
  const lastDate = progress.lastPracticedAt
    ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(progress.lastPracticedAt))
    : 'ещё не было занятий';
  els.progressCaption.textContent = `${state.level}: данные сохраняются только в этом браузере · последняя практика: ${lastDate}`;
  els.progressSummary.innerHTML = [
    ['Занятий', progress.sessions],
    ['Ответов', progress.turns],
    ['Без исправлений', `${accuracy}%`],
    ['Лучшая серия', progress.bestStreak]
  ].map(([label, value]) => `<div class="progress-stat"><b>${value}</b><span>${label}</span></div>`).join('');

  els.progressModules.innerHTML = state.lessons.map((lesson) => {
    const module = progress.modules?.[String(lesson.id)] || { sessions: 0, turns: 0, correct: 0 };
    const moduleAccuracy = module.turns ? Math.round((module.correct / module.turns) * 100) : 0;
    return `<div class="progress-module ${module.turns ? '' : 'empty'}" title="${esc(lesson.title)}">
      <div class="progress-module-head"><b>${lesson.id}. ${esc(lesson.title)}</b><small>${module.turns} отв. · ${moduleAccuracy}%</small></div>
      <div class="progress-bar"><span style="width:${module.turns ? Math.max(4, moduleAccuracy) : 0}%"></span></div>
    </div>`;
  }).join('');
}

function resetCurrentLevelProgress() {
  if (!confirm(`Сбросить всю статистику уровня ${state.level} на этом устройстве?`)) return;
  state.progress.levels[state.level] = emptyLevelProgress();
  saveProgress();
  toast(`Статистика ${state.level} сброшена`, 'success');
}

async function refreshMics() {
  try {
    await refreshMicrophoneSelect(els.micSelect, els.micSelect.value);
  } catch {
    els.micSelect.innerHTML = '<option value="">Не удалось получить список</option>';
    els.micSelect.disabled = true;
  }
}

async function startSession() {
  state.started = true;
  state.history = [];
  state.pendingInputMethod = 'typed';
  els.correctionLine.hidden = true;
  els.revealBox.hidden = true;
  els.hintBox.hidden = true;
  els.startButton.textContent = 'Начать заново';
  recordSessionStart();

  const lesson = currentLesson();
  const sc = currentScenario();
  els.liveTranscript.textContent = state.mode === 'roleplay' && sc
    ? `Роль ИИ: ${sc.aiRole}. Ответьте голосом или текстом.`
    : `Отвечайте по-немецки, используя: ${(lesson?.grammar || []).join(', ')}`;

  if (state.mode === 'roleplay' && sc?.opener) {
    presentAiTurn(sc.opener, '', '');
    state.history.push({ role: 'ai', text: sc.opener });
  } else {
    await requestReply();
  }
}

async function sendUser(text, method = 'typed') {
  const value = String(text || '').trim();
  if (!value || state.busy) return;
  if (!state.started) { toast('Сначала нажмите «Начать»', 'error'); return; }
  els.liveTranscript.textContent = `Вы сказали: «${value}»`;
  els.correctionLine.hidden = true;
  state.history.push({ role: 'user', text: value });
  state.pendingInputMethod = method === 'voice' ? 'voice' : 'typed';
  await requestReply();
}

// The client keeps the whole conversation in state.history and sends it every
// turn, so the model has full memory and moves the dialogue forward.
async function requestReply() {
  if (state.busy) return;
  state.busy = true;
  els.status.textContent = 'ИИ думает…';
  els.status.className = 'status-badge pending';
  els.listenState.textContent = 'Собеседник печатает…';
  const shouldScore = state.history.at(-1)?.role === 'user';
  const inputMethod = state.pendingInputMethod;
  try {
    const data = await fetchJson('/api/practice/reply', {
      method: 'POST',
      body: {
        level: state.level,
        moduleId: state.moduleId,
        mode: state.mode,
        scenarioId: state.scenarioId,
        history: state.history.slice(-40)
      }
    });
    const reply = data.reply_de || '…';
    state.history.push({ role: 'ai', text: reply });
    if (shouldScore) recordPracticeTurn({ corrected: Boolean(data.correction), method: inputMethod });
    presentAiTurn(reply, data.correction, data.hint_ru);
    els.status.textContent = 'Ваш ход';
    els.status.className = 'status-badge ok';
    if (data.done) {
      state.started = false;
      els.status.textContent = 'Тренировка завершена';
      els.startButton.textContent = 'Начать заново';
    }
  } catch (error) {
    els.status.textContent = 'Ошибка';
    els.status.className = 'status-badge error';
    els.listenState.textContent = 'Не удалось получить ответ';
    toast(error.message, 'error');
  } finally {
    state.busy = false;
  }
}

// Show one AI turn in the listen card: play it, hide text behind a button,
// surface the correction of the learner's last line and a Russian hint.
function presentAiTurn(reply, correction, hint) {
  state.lastAiText = reply;
  els.listenState.textContent = 'Слушайте ответ ИИ';
  els.revealBox.hidden = true;
  els.revealText.textContent = reply;
  if (correction) {
    els.correctionLine.hidden = false;
    els.correctionLine.textContent = `✏️ ${correction}`;
  }
  if (hint) {
    els.hintBox.hidden = false;
    els.hintBox.textContent = `💡 ${hint}`;
  } else {
    els.hintBox.hidden = true;
  }
  speak(reply, 1).finally(() => {
    els.listenState.textContent = 'Ваш ход — ответьте по-немецки';
  });
}

function revealText() {
  if (!state.lastAiText) return;
  els.revealBox.hidden = false;
}

// ----- Text-to-speech -----

function replay(rate) {
  if (state.lastAiText) speak(state.lastAiText, rate);
}

async function speak(text, rate = 1) {
  if (!state.config.ttsEnabled || !text) return;
  stopAudio();
  try {
    const response = await fetch('/api/practice/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!response.ok) throw new Error('tts');
    const blob = await response.blob();
    const audio = new Audio(URL.createObjectURL(blob));
    audio.playbackRate = rate;
    state.currentAudio = audio;
    await audio.play();
    await new Promise((resolve) => { audio.onended = resolve; audio.onerror = resolve; });
  } catch {
    // TTS optional — fail silently.
  }
}

function stopAudio() {
  if (state.currentAudio) { state.currentAudio.pause(); state.currentAudio = null; }
}

// ----- Voice input (Whisper) -----

async function startMic() {
  if (state.micOn || !state.config.sttEnabled) return;
  try {
    state.capture = await startVoiceCapture({
      deviceId: els.micSelect.value || '',
      fill: els.micMeterFill,
      value: els.micMeterValue,
      signal: els.micSignal,
      onState: (phase) => {
        if (phase === 'processing') els.liveTranscript.textContent = '⏳ Распознаю…';
        else if (phase === 'speaking') els.liveTranscript.textContent = '🎙 Слышу вас…';
        else if (phase === 'empty') els.liveTranscript.textContent = '🔇 Звук не пойман — говорите ближе к микрофону.';
      },
      onSegment: handleSegment
    });
    state.micOn = true;
    els.startMicButton.hidden = true;
    els.stopMicButton.hidden = false;
    await refreshMics();
  } catch (error) {
    toast(`Не удалось включить микрофон: ${error.message}`, 'error');
  }
}

function stopMic() {
  state.capture?.stop();
  state.capture = null;
  state.micOn = false;
  els.startMicButton.hidden = false;
  els.stopMicButton.hidden = true;
}

async function handleSegment(blob) {
  try {
    const text = await transcribeAudio(blob, { path: '/api/practice/transcribe' });
    if (!text) { els.liveTranscript.textContent = '🔇 Не расслышал. Повторите.'; return; }
    await sendUser(text, 'voice');
  } catch (error) {
    els.liveTranscript.textContent = `⚠️ ${error.message}`;
  }
}

// ----- helpers -----

async function fetchJson(url, { method = 'GET', body } = {}) {
  const response = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload;
}
