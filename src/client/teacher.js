import {
  api, $, $$, esc, parseList, formatList, toast, setBusy, copyText, formatTime,
  socketAck, makePill, mediaStorageKeys, refreshMicrophoneSelect,
  startVoiceCapture, transcribeAudio
} from './shared.js';
import { getEffectiveSentenceRule, getLevelMaxWords, getLevelSentenceRule } from '../level-rules.js';

const VARIANTS = [
  ['main', 'Основной'],
  ['simpler', 'Проще'],
  ['shorter', 'Короче'],
  ['yes_no', 'Ja / Nein'],
  ['choice', 'Выбор A / B'],
  ['starter', 'Начало ответа'],
  ['full_model', 'Полный образец'],
  ['recast', 'Исправить мягко'],
  ['continue', 'Продолжить'],
  ['clarification', 'Уточнить']
];

const state = {
  token: localStorage.getItem('glc.teacherToken') || '',
  config: null,
  curriculum: [],
  profiles: [],
  currentProfile: null,
  editingProfileId: null,
  selectedLessonId: 1,
  wordStates: new Map(),
  room: null,
  roomSecrets: null,
  voices: [],
  activeVoice: 'primary',
  socket: null,
  candidate: null,
  selectedVariant: 'main',
  selectedText: '',
  transcript: '',
  scaffoldLevel: 0,
  studentOnline: false,
  sessionEnded: false,
  teacherCapture: null,
  teacherMicStarted: false,
  teacherMicId: localStorage.getItem(mediaStorageKeys.teacherMic) || '',
  teacherCommandText: ''
};

const els = {};

document.addEventListener('DOMContentLoaded', boot);

async function boot() {
  cacheElements();
  bindStaticEvents();
  try {
    const [config, curriculumResult] = await Promise.all([
      api('/api/config'),
      api('/api/curriculum')
    ]);
    state.config = config;
    state.curriculum = curriculumResult.lessons || [];
    renderServiceStatus();
    renderLessonOptions();
    refreshTeacherMicrophones();
  } catch (error) {
    toast(`Не удалось загрузить конфигурацию: ${error.message}`, 'error', 6000);
  }

  if (state.token) {
    await enterApp();
  } else {
    showLogin();
  }
}

function cacheElements() {
  Object.assign(els, {
    loginView: $('#loginView'),
    appView: $('#appView'),
    loginForm: $('#loginForm'),
    loginPassword: $('#loginPassword'),
    loginButton: $('#loginButton'),
    logoutButton: $('#logoutButton'),
    serviceStatus: $('#serviceStatus'),
    profileList: $('#profileList'),
    newProfileButton: $('#newProfileButton'),
    deleteProfileButton: $('#deleteProfileButton'),
    profileForm: $('#profileForm'),
    profileTitle: $('#profileTitle'),
    profileName: $('#profileName'),
    profileLevel: $('#profileLevel'),
    profileSterility: $('#profileSterility'),
    profileMaxWords: $('#profileMaxWords'),
    profileWordLimitHint: $('#profileWordLimitHint'),
    profileMaxNewWords: $('#profileMaxNewWords'),
    lessonSelect: $('#lessonSelect'),
    lessonDetails: $('#lessonDetails'),
    vocabularySearch: $('#vocabularySearch'),
    vocabularyChips: $('#vocabularyChips'),
    vocabLegend: $('#vocabLegend'),
    knownWordsInput: $('#knownWordsInput'),
    learningWordsInput: $('#learningWordsInput'),
    unknownWordsInput: $('#unknownWordsInput'),
    knownGrammarInput: $('#knownGrammarInput'),
    repeatTopicsInput: $('#repeatTopicsInput'),
    learningGoalsInput: $('#learningGoalsInput'),
    avoidInput: $('#avoidInput'),
    notesInput: $('#notesInput'),
    saveProfileButton: $('#saveProfileButton'),
    createRoomButton: $('#createRoomButton'),
    roomEmpty: $('#roomEmpty'),
    roomPanel: $('#roomPanel'),
    roomCode: $('#roomCode'),
    roomPin: $('#roomPin'),
    roomStudentUrl: $('#roomStudentUrl'),
    copyRoomLinkButton: $('#copyRoomLinkButton'),
    connectionStatus: $('#connectionStatus'),
    studentStatus: $('#studentStatus'),
    modelStatus: $('#modelStatus'),
    partialTranscript: $('#partialTranscript'),
    transcriptInput: $('#transcriptInput'),
    teacherInstruction: $('#teacherInstruction'),
    requiredWordsInput: $('#requiredWordsInput'),
    requiredWordsHint: $('#requiredWordsHint'),
    generateSentenceButton: $('#generateSentenceButton'),
    generateButton: $('#generateButton'),
    aiStatus: $('#aiStatus'),
    interpretation: $('#interpretation'),
    correctedStudent: $('#correctedStudent'),
    candidateEditor: $('#candidateEditor'),
    candidateMeta: $('#candidateMeta'),
    variantsGrid: $('#variantsGrid'),
    speakButton: $('#speakButton'),
    speakButton2: $('#speakButton2'),
    slowerSpeakButton: $('#slowerSpeakButton'),
    voiceHint: $('#voiceHint'),
    scaffoldRow: $('#scaffoldRow'),
    assessmentRow: $('#assessmentRow'),
    sessionLog: $('#sessionLog'),
    endSessionButton: $('#endSessionButton'),
    summaryPanel: $('#summaryPanel'),
    summaryText: $('#summaryText'),
    curriculumQuick: $('#curriculumQuick'),
    teacherMicSelect: $('#teacherMicSelect'),
    teacherMicStatus: $('#teacherMicStatus'),
    teacherMicStartButton: $('#teacherMicStartButton'),
    teacherMicStopButton: $('#teacherMicStopButton'),
    teacherMicClearButton: $('#teacherMicClearButton'),
    teacherMicSendButton: $('#teacherMicSendButton'),
    teacherMicPartial: $('#teacherMicPartial'),
    teacherCommandInput: $('#teacherCommandInput'),
    teacherMicMeterFill: $('#teacherMicMeterFill'),
    teacherMicMeterValue: $('#teacherMicMeterValue'),
    teacherMicSignal: $('#teacherMicSignal')
  });
}

function bindStaticEvents() {
  els.loginForm.addEventListener('submit', login);
  els.logoutButton.addEventListener('click', logout);
  els.newProfileButton.addEventListener('click', () => editProfile(null));
  els.deleteProfileButton.addEventListener('click', deleteCurrentProfile);
  els.profileForm.addEventListener('submit', saveProfile);
  els.profileLevel.addEventListener('change', applyLevelWordLimit);
  els.profileMaxWords.addEventListener('input', renderLevelWordLimitHint);
  els.lessonSelect.addEventListener('change', () => {
    state.selectedLessonId = Number(els.lessonSelect.value || 1);
    renderLessonDetails();
    renderVocabulary();
  });
  els.vocabularySearch.addEventListener('input', renderVocabulary);
  els.createRoomButton.addEventListener('click', createRoom);
  els.copyRoomLinkButton.addEventListener('click', async () => {
    await copyText(els.roomStudentUrl.value);
    toast('Ссылка ученика скопирована', 'success');
  });
  els.requiredWordsInput.addEventListener('input', renderRequiredWordsHint);
  els.generateSentenceButton.addEventListener('click', () => generate('WORD_SENTENCE'));
  els.generateButton.addEventListener('click', () => generate('AUTO'));
  els.speakButton.addEventListener('click', () => speak(1, 'primary'));
  els.speakButton2.addEventListener('click', () => speak(1, 'secondary'));
  // Slower repeats the phrase with whichever voice was used last.
  els.slowerSpeakButton.addEventListener('click', () => speak(0.76, state.activeVoice));
  els.candidateEditor.addEventListener('input', () => {
    state.selectedText = els.candidateEditor.value.trim();
    state.selectedVariant = 'manual';
    if (state.socket?.connected && state.selectedText) {
      state.socket.emit('teacher:candidate', { text: state.selectedText, variant: 'manual' });
    }
    updateSpeakState();
  });
  els.endSessionButton.addEventListener('click', endSession);
  els.teacherMicStartButton.addEventListener('click', startTeacherMicrophone);
  els.teacherMicStopButton.addEventListener('click', stopTeacherMicrophone);
  els.teacherMicClearButton.addEventListener('click', clearTeacherCommand);
  els.teacherMicSendButton.addEventListener('click', sendTeacherVoiceCommand);
  els.teacherCommandInput.addEventListener('input', () => {
    state.teacherCommandText = els.teacherCommandInput.value.trim();
    updateTeacherMicSendState();
  });
  els.teacherMicSelect.addEventListener('change', async () => {
    state.teacherMicId = els.teacherMicSelect.value;
    localStorage.setItem(mediaStorageKeys.teacherMic, state.teacherMicId);
    if (state.teacherMicStarted && !state.teacherMicRestarting) {
      state.teacherMicRestarting = true;
      stopTeacherMicrophone();
      await new Promise((resolve) => setTimeout(resolve, 180));
      await startTeacherMicrophone();
      state.teacherMicRestarting = false;
      toast('Микрофон преподавателя переключён', 'success');
    }
  });
  navigator.mediaDevices?.addEventListener?.('devicechange', () => refreshTeacherMicrophones());

  $$('.semantic-action').forEach((button) => {
    button.addEventListener('click', () => generate(button.dataset.action));
  });
  $$('.transform-action').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.variant && state.candidate?.[button.dataset.variant]) {
        selectVariant(button.dataset.variant);
      } else {
        runTransform(button.dataset.instruction);
      }
    });
  });
  els.assessmentRow.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-assessment]');
    if (!button) return;
    await assess(button.dataset.assessment);
  });
}

function showLogin() {
  els.loginView.hidden = false;
  els.appView.hidden = true;
  setTimeout(() => els.loginPassword.focus(), 50);
}

async function login(event) {
  event.preventDefault();
  setBusy(els.loginButton, true, 'Входим…');
  try {
    const result = await api('/api/auth/login', {
      method: 'POST',
      body: { password: els.loginPassword.value }
    });
    state.token = result.token;
    localStorage.setItem('glc.teacherToken', state.token);
    els.loginPassword.value = '';
    await enterApp();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(els.loginButton, false);
  }
}

function logout() {
  stopTeacherMicrophone();
  state.socket?.disconnect();
  state.socket = null;
  state.token = '';
  localStorage.removeItem('glc.teacherToken');
  localStorage.removeItem('glc.teacherRoom');
  showLogin();
}

async function enterApp() {
  try {
    await loadProfiles();
    els.loginView.hidden = true;
    els.appView.hidden = false;
    const lastRoom = localStorage.getItem('glc.teacherRoom');
    if (lastRoom) {
      try {
        const result = await api(`/api/sessions/${encodeURIComponent(lastRoom)}`, { token: state.token });
        if (result.session?.status === 'active') {
          state.room = result.session;
          state.currentProfile = state.profiles.find((item) => item.id === result.session.profileId) || state.currentProfile;
          state.selectedLessonId = Number(result.session.lessonId);
          renderRoom();
          connectTeacherSocket(lastRoom);
        }
      } catch {
        localStorage.removeItem('glc.teacherRoom');
      }
    }
  } catch (error) {
    if (error.status === 401) return logout();
    toast(error.message, 'error', 6000);
  }
}

async function loadProfiles(selectId = null) {
  const result = await api('/api/profiles', { token: state.token });
  state.profiles = result.profiles || [];
  renderProfileList();
  const target = selectId || state.currentProfile?.id || state.profiles[0]?.id;
  if (target) {
    const profile = state.profiles.find((item) => item.id === target);
    if (profile) editProfile(profile);
  } else {
    editProfile(null);
  }
}

function renderServiceStatus() {
  if (!state.config) return;
  const entries = [
    ['AITUNNEL', state.config.aitunnelEnabled ? `${state.config.model}` : 'демо'],
    ['Whisper', state.config.sttEnabled ? (state.config.sttModel || 'готов') : 'ручной ввод'],
    ['Голос', state.config.elevenlabsTtsEnabled ? state.config.ttsModel : 'голос браузера']
  ];
  renderVoiceButtons();
  els.serviceStatus.innerHTML = entries.map(([label, value]) => makePill(label, value, value === 'демо' || value === 'ручной ввод' ? 'warn' : 'ok')).join('');
  els.modelStatus.textContent = state.config.aitunnelEnabled ? state.config.model : 'AITUNNEL не настроен — демо-режим';
  if (!state.config.sttEnabled) {
    els.teacherMicStartButton.disabled = true;
    els.teacherMicStatus.textContent = 'Распознавание речи не настроено';
    els.teacherMicStatus.className = 'status-badge warn';
  }
}

// Two speak buttons, one per configured ElevenLabs voice. A voice that has no
// id on the server stays disabled and says which variable is missing.
function renderVoiceButtons() {
  state.voices = state.config?.ttsVoices || [];
  const buttons = [
    { el: els.speakButton, key: 'primary', fallback: 'Голос 1', envVar: 'ELEVENLABS_VOICE_ID' },
    { el: els.speakButton2, key: 'secondary', fallback: 'Голос 2', envVar: 'ELEVENLABS_VOICE_ID_2' }
  ];
  const missing = [];
  // Without ElevenLabs there is only the browser voice, so a second button
  // would send exactly the same thing — show one.
  const ttsOn = Boolean(state.config?.elevenlabsTtsEnabled);

  buttons.forEach(({ el, key, fallback, envVar }) => {
    if (!el) return;
    const voice = state.voices.find((item) => item.key === key);
    el.textContent = ttsOn ? `▶ ${voice?.label || fallback}` : '▶ Сказать ученику';
    el.dataset.available = voice ? 'yes' : 'no';
    el.title = !ttsOn
      ? 'Отправить ученику голосом браузера'
      : (voice ? `Озвучить голосом «${voice.label}»` : `Голос не настроен: задайте ${envVar}`);
    if (!voice) missing.push(envVar);
  });

  els.speakButton2.hidden = !ttsOn;

  if (!ttsOn) {
    els.voiceHint.textContent = 'ElevenLabs не настроен — фраза уйдёт голосом браузера.';
  } else if (missing.length) {
    els.voiceHint.textContent = `Второй голос недоступен. Задайте ${missing.join(' и ')} в переменных окружения.`;
  } else {
    els.voiceHint.textContent = '';
  }

  if (!state.voices.some((item) => item.key === state.activeVoice)) {
    state.activeVoice = state.voices[0]?.key || 'primary';
  }
  updateSpeakState();
}

function renderProfileList() {
  if (!state.profiles.length) {
    els.profileList.innerHTML = '<div class="empty-small">Пока нет учеников</div>';
    return;
  }
  els.profileList.innerHTML = state.profiles.map((profile) => {
    const active = profile.id === state.editingProfileId ? 'active' : '';
    const total = Number(profile.progress?.turns || 0);
    return `<button type="button" class="profile-item ${active}" data-profile-id="${esc(profile.id)}">
      <span class="profile-avatar">${esc((profile.name || '?').slice(0, 1).toUpperCase())}</span>
      <span class="profile-item-copy"><b>${esc(profile.name)}</b><small>${esc(profile.level)} · ${total} оценённых ответов</small></span>
    </button>`;
  }).join('');
  $$('.profile-item', els.profileList).forEach((button) => {
    button.addEventListener('click', () => {
      const profile = state.profiles.find((item) => item.id === button.dataset.profileId);
      if (profile) editProfile(profile);
    });
  });
}

function editProfile(profile) {
  state.currentProfile = profile;
  state.editingProfileId = profile?.id || null;
  state.wordStates = new Map();
  for (const word of profile?.knownWords || []) state.wordStates.set(word, 'known');
  for (const word of profile?.learningWords || []) state.wordStates.set(word, 'learning');
  for (const word of profile?.unknownWords || []) state.wordStates.set(word, 'unknown');

  els.profileTitle.textContent = profile ? `Профиль: ${profile.name}` : 'Новый ученик';
  els.profileName.value = profile?.name || '';
  els.profileLevel.value = profile?.level || 'A0';
  els.profileSterility.value = profile?.sterility || 'high';
  els.profileMaxWords.value = profile?.maxWords ?? getLevelMaxWords(els.profileLevel.value);
  els.profileMaxNewWords.value = profile?.maxNewWords ?? 0;
  state.selectedLessonId = Number(profile?.lessonIds?.[0] || state.selectedLessonId || 1);
  els.lessonSelect.value = String(state.selectedLessonId);
  els.knownWordsInput.value = formatList(profile?.knownWords || []);
  els.learningWordsInput.value = formatList(profile?.learningWords || []);
  els.unknownWordsInput.value = formatList(profile?.unknownWords || []);
  els.knownGrammarInput.value = formatList(profile?.knownGrammar || []);
  els.repeatTopicsInput.value = formatList(profile?.repeatTopics || []);
  els.learningGoalsInput.value = formatList(profile?.learningGoals || []);
  els.avoidInput.value = formatList(profile?.avoid || []);
  els.notesInput.value = profile?.notes || '';
  els.deleteProfileButton.hidden = !profile;
  renderLevelWordLimitHint();
  renderRequiredWordsHint();
  renderProfileList();
  renderLessonDetails();
  renderVocabulary();
}

function applyLevelWordLimit() {
  els.profileMaxWords.value = String(getLevelMaxWords(els.profileLevel.value));
  renderLevelWordLimitHint();
  renderRequiredWordsHint();
}

function renderLevelWordLimitHint() {
  const level = els.profileLevel.value || 'A0';
  const recommended = getLevelSentenceRule(level);
  const selected = getEffectiveSentenceRule(level, els.profileMaxWords.value);
  els.profileWordLimitHint.textContent = selected.maxWords === recommended.maxWords
    ? `${level}: ${recommended.minWords}–${recommended.maxWords} слов`
    : `${level}: рекомендуется ${recommended.minWords}–${recommended.maxWords}, выбран максимум ${selected.maxWords}`;
}

function renderRequiredWordsHint() {
  const requiredWords = parseList(els.requiredWordsInput.value);
  const level = state.currentProfile?.level || els.profileLevel.value || 'A0';
  const maxWords = state.currentProfile?.maxWords ?? els.profileMaxWords.value;
  const rule = getEffectiveSentenceRule(level, maxWords);
  const requiredCount = countWords(requiredWords.join(' '));
  els.requiredWordsHint.textContent = requiredWords.length
    ? `Добавлено: ${requiredWords.length}; минимум ${requiredCount} слов. Для ${level}: ${rule.minWords}–${rule.maxWords} слов.`
    : `Введите слова или фразы через запятую. Для ${level} предложение будет длиной ${rule.minWords}–${rule.maxWords} слов.`;
}

function renderLessonOptions() {
  els.lessonSelect.innerHTML = state.curriculum.map((lesson) =>
    `<option value="${lesson.id}">${lesson.id}. ${esc(lesson.title)}</option>`
  ).join('');
  els.lessonSelect.value = String(state.selectedLessonId);
  els.curriculumQuick.innerHTML = state.curriculum.map((lesson) =>
    `<button type="button" class="lesson-mini" style="--lesson-color:${esc(lesson.color)}" data-lesson-id="${lesson.id}">
      <b>${lesson.id}</b><span>${esc(lesson.title)}</span>
    </button>`
  ).join('');
  $$('.lesson-mini', els.curriculumQuick).forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedLessonId = Number(button.dataset.lessonId);
      els.lessonSelect.value = String(state.selectedLessonId);
      renderLessonDetails();
      renderVocabulary();
      $('#profileEditorCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  renderLessonDetails();
}

function getLesson() {
  return state.curriculum.find((lesson) => lesson.id === Number(state.selectedLessonId)) || state.curriculum[0];
}

function renderLessonDetails() {
  const lesson = getLesson();
  if (!lesson) return;
  els.lessonDetails.style.setProperty('--lesson-color', lesson.color);
  els.lessonDetails.innerHTML = `<div class="lesson-detail-head"><span class="lesson-number">${lesson.id}</span><div><h3>${esc(lesson.title)}</h3><p>Курс: стр. ${lesson.coursebookPage} · Wörterliste в Übungsbuch: PDF-стр. ${lesson.sourcePdfPage}</p></div></div>
    <div class="detail-grid">
      <div><b>Речевые действия</b><p>${lesson.speechActs.map(esc).join(' · ')}</p></div>
      <div><b>Грамматика</b><p>${lesson.grammar.map(esc).join(' · ')}</p></div>
      <div><b>Темы</b><p>${lesson.themes.map(esc).join(' · ')}</p></div>
    </div>`;
}

function renderVocabulary() {
  const lesson = getLesson();
  if (!lesson) return;
  const search = els.vocabularySearch.value.trim().toLocaleLowerCase('de');
  const words = lesson.vocabulary.filter((word) => !search || word.toLocaleLowerCase('de').includes(search));
  els.vocabularyChips.innerHTML = words.map((word) => {
    const status = state.wordStates.get(word) || 'none';
    const labels = { none: '', known: 'ЗНАЕТ', learning: 'УЧИМ', unknown: 'НЕ ЗНАЕТ' };
    return `<button type="button" class="vocab-chip ${status}" data-word="${esc(word)}" title="Нажимайте: знает → учим → не знает → сброс">
      <span>${esc(word)}</span><small>${labels[status]}</small>
    </button>`;
  }).join('') || '<div class="empty-small">Ничего не найдено</div>';
  $$('.vocab-chip', els.vocabularyChips).forEach((chip) => {
    chip.addEventListener('click', () => cycleWord(chip.dataset.word));
  });
  const counts = { known: 0, learning: 0, unknown: 0 };
  for (const word of lesson.vocabulary) {
    const status = state.wordStates.get(word);
    if (counts[status] !== undefined) counts[status] += 1;
  }
  els.vocabLegend.innerHTML = `<span class="legend known">Знает: ${counts.known}</span><span class="legend learning">Учить: ${counts.learning}</span><span class="legend unknown">Не знает: ${counts.unknown}</span><span>Всего: ${lesson.vocabulary.length}</span>`;
}

function cycleWord(word) {
  const order = ['none', 'known', 'learning', 'unknown'];
  const current = state.wordStates.get(word) || 'none';
  const next = order[(order.indexOf(current) + 1) % order.length];
  if (next === 'none') state.wordStates.delete(word);
  else state.wordStates.set(word, next);
  syncTextInputsFromWordStates();
  renderVocabulary();
}

function syncTextInputsFromWordStates() {
  const customKnown = parseList(els.knownWordsInput.value).filter((word) => !isCurriculumWord(word));
  const customLearning = parseList(els.learningWordsInput.value).filter((word) => !isCurriculumWord(word));
  const customUnknown = parseList(els.unknownWordsInput.value).filter((word) => !isCurriculumWord(word));
  els.knownWordsInput.value = formatList([...customKnown, ...wordsWithState('known')]);
  els.learningWordsInput.value = formatList([...customLearning, ...wordsWithState('learning')]);
  els.unknownWordsInput.value = formatList([...customUnknown, ...wordsWithState('unknown')]);
}

function isCurriculumWord(word) {
  return state.curriculum.some((lesson) => lesson.vocabulary.includes(word));
}

function wordsWithState(status) {
  return [...state.wordStates.entries()].filter(([, value]) => value === status).map(([word]) => word);
}

async function saveProfile(event) {
  event.preventDefault();
  const button = els.saveProfileButton;
  setBusy(button, true, 'Сохраняем…');
  try {
    const payload = collectProfilePayload();
    if (!payload.name) throw new Error('Введите имя ученика');
    let result;
    if (state.editingProfileId) {
      result = await api(`/api/profiles/${state.editingProfileId}`, { method: 'PATCH', token: state.token, body: payload });
    } else {
      result = await api('/api/profiles', { method: 'POST', token: state.token, body: payload });
    }
    await loadProfiles(result.profile.id);
    toast('Профиль сохранён', 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

function collectProfilePayload() {
  const knownWords = new Set(parseList(els.knownWordsInput.value));
  const learningWords = new Set(parseList(els.learningWordsInput.value));
  const unknownWords = new Set(parseList(els.unknownWordsInput.value));
  for (const [word, status] of state.wordStates.entries()) {
    knownWords.delete(word); learningWords.delete(word); unknownWords.delete(word);
    if (status === 'known') knownWords.add(word);
    if (status === 'learning') learningWords.add(word);
    if (status === 'unknown') unknownWords.add(word);
  }
  return {
    name: els.profileName.value.trim(),
    level: els.profileLevel.value,
    sterility: els.profileSterility.value,
    maxWords: Number(els.profileMaxWords.value || 6),
    maxNewWords: Number(els.profileMaxNewWords.value || 0),
    lessonIds: [Number(els.lessonSelect.value)],
    knownWords: [...knownWords],
    learningWords: [...learningWords],
    unknownWords: [...unknownWords],
    knownGrammar: parseList(els.knownGrammarInput.value),
    repeatTopics: parseList(els.repeatTopicsInput.value),
    learningGoals: parseList(els.learningGoalsInput.value),
    avoid: parseList(els.avoidInput.value),
    notes: els.notesInput.value.trim()
  };
}

async function deleteCurrentProfile() {
  if (!state.editingProfileId) return;
  const name = state.currentProfile?.name || 'ученика';
  if (!confirm(`Удалить профиль «${name}»?`)) return;
  try {
    await api(`/api/profiles/${state.editingProfileId}`, { method: 'DELETE', token: state.token });
    state.currentProfile = null;
    state.editingProfileId = null;
    await loadProfiles();
    toast('Профиль удалён', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function createRoom() {
  stopTeacherMicrophone();
  if (!state.editingProfileId) {
    toast('Сначала сохраните профиль ученика', 'error');
    return;
  }
  setBusy(els.createRoomButton, true, 'Создаём…');
  try {
    const result = await api('/api/sessions', {
      method: 'POST', token: state.token,
      body: { profileId: state.editingProfileId, lessonId: Number(els.lessonSelect.value) }
    });
    state.room = result.session;
    state.roomSecrets = { pin: result.studentPin, token: result.studentToken, url: result.studentUrl };
    state.currentProfile = result.profile;
    state.selectedLessonId = result.lesson.id;
    state.scaffoldLevel = 0;
    state.sessionEnded = false;
    localStorage.setItem('glc.teacherRoom', state.room.code);
    renderRoom();
    connectTeacherSocket(state.room.code);
    toast('Учебная комната создана', 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(els.createRoomButton, false);
  }
}

function renderRoom() {
  if (!state.room) {
    els.roomEmpty.hidden = false;
    els.roomPanel.hidden = true;
    return;
  }
  els.roomEmpty.hidden = true;
  els.roomPanel.hidden = false;
  els.roomCode.textContent = state.room.code;
  els.roomPin.textContent = state.roomSecrets?.pin || 'ссылка уже создана';
  els.roomStudentUrl.value = state.roomSecrets?.url || `${location.origin}/student?room=${encodeURIComponent(state.room.code)}`;
  state.scaffoldLevel = Number(state.room.scaffoldLevel || 0);
  renderScaffold();
  updateConnectionStatus('Подключаемся…', 'pending');
}

function connectTeacherSocket(roomCode) {
  state.socket?.disconnect();
  state.socket = io({
    auth: { role: 'teacher', roomCode, token: state.token },
    transports: ['websocket', 'polling']
  });

  state.socket.on('connect', () => {
    updateConnectionStatus('Учитель подключён', 'ok');
    updateTeacherMicSendState();
  });
  state.socket.on('connect_error', (error) => updateConnectionStatus(`Ошибка: ${error.message}`, 'error'));
  state.socket.on('disconnect', () => {
    updateConnectionStatus('Связь прервана', 'error');
    updateTeacherMicSendState();
  });
  state.socket.on('session:snapshot', (payload) => {
    state.room = payload.session;
    state.scaffoldLevel = Number(payload.session?.scaffoldLevel || 0);
    if (payload.profile?.id) state.currentProfile = payload.profile;
    if (payload.turn) restoreTurn(payload.turn);
    if (payload.teacherVoice?.text) {
      state.teacherCommandText = payload.teacherVoice.text;
      els.teacherCommandInput.value = payload.teacherVoice.text;
    }
    renderScaffold();
    updateTeacherMicSendState();
  });
  state.socket.on('presence:update', ({ role, online }) => {
    if (role === 'student') {
      state.studentOnline = online;
      els.studentStatus.textContent = online ? 'Ученик в комнате' : 'Ученик не подключён';
      els.studentStatus.className = `status-badge ${online ? 'ok' : 'muted'}`;
      addLog(online ? 'Ученик подключился' : 'Ученик отключился', online ? 'success' : 'muted');
    }
  });
  state.socket.on('teacher:mic-partial', ({ text }) => {
    if (!state.teacherMicStarted) els.teacherMicPartial.textContent = text || '…';
  });
  state.socket.on('teacher:mic-text', ({ text }) => {
    if (!state.teacherMicStarted && text) {
      state.teacherCommandText = text;
      els.teacherCommandInput.value = text;
      updateTeacherMicSendState();
    }
  });
  state.socket.on('student:partial', ({ text }) => {
    els.partialTranscript.textContent = text || '…';
    els.partialTranscript.classList.toggle('active', Boolean(text));
  });
  state.socket.on('student:committed', ({ text, at }) => {
    state.transcript = text;
    els.transcriptInput.value = text;
    els.partialTranscript.textContent = 'Ожидаем следующую реплику…';
    els.partialTranscript.classList.remove('active');
    addLog(`Ученик: ${text}`, 'student', at);
  });
  state.socket.on('ai:thinking', () => {
    els.aiStatus.textContent = 'Модель готовит пакет вариантов…';
    els.aiStatus.className = 'ai-status thinking';
    els.generateButton.disabled = true;
    els.generateSentenceButton.disabled = true;
  });
  state.socket.on('ai:ready', ({ candidate, transcript, selectedText }) => {
    if (transcript) {
      state.transcript = transcript;
      els.transcriptInput.value = transcript;
    }
    state.candidate = candidate;
    state.selectedVariant = 'main';
    state.selectedText = selectedText || candidate.main;
    renderCandidate();
    els.aiStatus.textContent = 'Ответ готов. Выберите фишку или отредактируйте.';
    els.aiStatus.className = 'ai-status ready';
    els.generateButton.disabled = false;
    els.generateSentenceButton.disabled = false;
  });
  state.socket.on('candidate:selected', ({ text, variant, level }) => {
    state.selectedText = text;
    state.selectedVariant = variant;
    state.scaffoldLevel = level;
    els.candidateEditor.value = text;
    renderScaffold();
    highlightVariantFromText(text);
  });
  state.socket.on('ai:error', ({ error }) => {
    els.aiStatus.textContent = error || 'Ошибка генерации';
    els.aiStatus.className = 'ai-status error';
    els.generateButton.disabled = false;
    els.generateSentenceButton.disabled = false;
  });
  state.socket.on('voice:ready', () => {
    // Only the default voice is prefetched, so only that button gets the dot.
    els.speakButton.classList.add('voice-ready');
  });
  state.socket.on('speech:sent', ({ text, source, voiceLabel }) => addLog(
    `${source === 'teacher_mic' ? 'Команда преподавателя' : 'Агент'}${voiceLabel ? ` (${voiceLabel})` : ''}: ${text}`,
    'teacher'
  ));
  state.socket.on('student:assist', ({ action }) => {
    const names = { repeat: 'повторил аудио', slower: 'включил медленнее', keyword: 'открыл ключевое слово', starter: 'открыл начало', transcript: 'открыл весь транскрипт' };
    addLog(`Ученик ${names[action] || action}`, 'assist');
  });
  state.socket.on('progress:update', ({ progress }) => {
    toast(`Прогресс обновлён: ${progress.turns} оценок`, 'success');
  });
  state.socket.on('session:ended', ({ summary }) => showSummary(summary));
}


async function refreshTeacherMicrophones() {
  try {
    await refreshMicrophoneSelect(els.teacherMicSelect, state.teacherMicId);
    state.teacherMicId = els.teacherMicSelect.value;
  } catch {
    els.teacherMicSelect.innerHTML = '<option value="">Не удалось получить список</option>';
    els.teacherMicSelect.disabled = true;
  }
}

async function startTeacherMicrophone() {
  if (state.teacherMicStarted) return;
  if (!state.room || !state.socket?.connected) {
    toast('Сначала создайте комнату и дождитесь подключения', 'error');
    return;
  }
  if (!state.config?.sttEnabled) {
    toast('Распознавание речи (AITUNNEL Whisper) не настроено', 'error');
    return;
  }
  setBusy(els.teacherMicStartButton, true, 'Запускаем…');
  try {
    state.teacherMicId = els.teacherMicSelect.value || state.teacherMicId;
    localStorage.setItem(mediaStorageKeys.teacherMic, state.teacherMicId);
    state.teacherCapture?.stop();
    state.teacherCapture = await startVoiceCapture({
      deviceId: state.teacherMicId,
      fill: els.teacherMicMeterFill,
      value: els.teacherMicMeterValue,
      signal: els.teacherMicSignal,
      onDeviceResolved: ({ deviceId }) => {
        if (deviceId) state.teacherMicId = deviceId;
      },
      onState: (phase) => {
        if (phase === 'processing') els.teacherMicPartial.textContent = '⏳ Распознаю через Whisper…';
        else if (phase === 'speaking') els.teacherMicPartial.textContent = '🎙 Слышу вас, говорите…';
        else if (phase === 'empty') els.teacherMicPartial.textContent = '🔇 Звук не пойман — говорите ближе к микрофону.';
        else els.teacherMicPartial.textContent = state.teacherMicStarted ? 'Говорите по-немецки…' : 'Микрофон выключен.';
      },
      onSegment: (blob) => handleTeacherSegment(blob)
    });
    await refreshTeacherMicrophones();

    state.teacherMicStarted = true;
    els.teacherMicStartButton.hidden = true;
    els.teacherMicStopButton.hidden = false;
    els.teacherMicStatus.textContent = 'Слушаю команду преподавателя';
    els.teacherMicStatus.className = 'status-badge ok';
    els.teacherMicPartial.textContent = 'Говорите по-немецки…';
  } catch (error) {
    state.teacherCapture?.stop();
    state.teacherCapture = null;
    toast(`Не удалось включить микрофон преподавателя: ${error.message}`, 'error', 6000);
  } finally {
    setBusy(els.teacherMicStartButton, false);
  }
}

async function handleTeacherSegment(blob) {
  try {
    const text = await transcribeAudio(blob, { token: state.token, roomCode: state.room?.code });
    if (!text) {
      els.teacherMicPartial.textContent = '🔇 Не расслышал разборчивую речь (тишина или шум). Повторите.';
      return;
    }
    state.teacherCommandText = text;
    els.teacherCommandInput.value = text;
    els.teacherMicPartial.textContent = `✅ Услышал: «${text}» — проверьте и нажмите «Выдать ученику».`;
    state.socket?.emit('teacher:mic-partial', { text });
    state.socket?.emit('teacher:mic-committed', { text }, (response) => {
      if (!response?.ok) toast(response?.error || 'Не удалось подготовить голос', 'error');
    });
    updateTeacherMicSendState();
  } catch (error) {
    els.teacherMicStatus.textContent = `Ошибка распознавания: ${error.message}`;
    els.teacherMicStatus.className = 'status-badge error';
    els.teacherMicPartial.textContent = `⚠️ Ошибка распознавания: ${error.message}`;
  }
}

function stopTeacherMicrophone() {
  state.teacherCapture?.stop();
  state.teacherCapture = null;
  state.teacherMicStarted = false;
  els.teacherMicStartButton.hidden = false;
  els.teacherMicStopButton.hidden = true;
  els.teacherMicStatus.textContent = 'Микрофон преподавателя выключен';
  els.teacherMicStatus.className = 'status-badge muted';
}

function clearTeacherCommand() {
  state.teacherCommandText = '';
  els.teacherCommandInput.value = '';
  els.teacherMicPartial.textContent = state.teacherMicStarted ? 'Говорите по-немецки…' : 'Включите микрофон и произнесите команду.';
  updateTeacherMicSendState();
}

function updateTeacherMicSendState() {
  if (!els.teacherMicSendButton) return;
  const text = els.teacherCommandInput?.value.trim() || '';
  els.teacherMicSendButton.disabled = !text || !state.socket?.connected || state.sessionEnded;
}

async function sendTeacherVoiceCommand() {
  const text = els.teacherCommandInput.value.trim();
  if (!text) return toast('Сначала произнесите или введите команду', 'error');
  if (!state.socket?.connected) return toast('Нет связи с учебной комнатой', 'error');
  setBusy(els.teacherMicSendButton, true, 'Озвучиваем…');
  try {
    const result = await socketAck(state.socket, 'teacher:speak', {
      text,
      variant: 'teacher_mic',
      source: 'teacher_mic',
      playbackRate: 1,
      voice: state.activeVoice
    });
    toast(
      result.mode === 'elevenlabs'
        ? `Команда прозвучала голосом «${result.voiceLabel || state.activeVoice}»`
        : 'Команда отправлена голосом браузера',
      'success'
    );
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(els.teacherMicSendButton, false);
    updateTeacherMicSendState();
  }
}

function updateConnectionStatus(text, kind) {
  els.connectionStatus.textContent = text;
  els.connectionStatus.className = `status-badge ${kind}`;
}

function restoreTurn(turn) {
  state.transcript = turn.transcript || '';
  state.candidate = turn.candidate || null;
  state.selectedText = turn.selectedText || turn.candidate?.main || '';
  state.selectedVariant = turn.selectedVariant || 'main';
  els.transcriptInput.value = state.transcript;
  els.requiredWordsInput.value = formatList(turn.requiredWords || []);
  renderRequiredWordsHint();
  if (state.candidate) renderCandidate();
}

async function generate(action = 'AUTO') {
  if (!state.socket?.connected) {
    toast('Сначала создайте комнату и дождитесь подключения', 'error');
    return;
  }
  const transcript = els.transcriptInput.value.trim();
  const requiredWords = parseList(els.requiredWordsInput.value).slice(0, 12);
  const isWordSentence = action === 'WORD_SENTENCE';
  if (!transcript && !isWordSentence) {
    toast('Введите или дождитесь реплики ученика', 'error');
    return;
  }
  if (isWordSentence && !requiredWords.length) {
    toast('Добавьте хотя бы одно слово для предложения', 'error');
    els.requiredWordsInput.focus();
    return;
  }
  const level = state.currentProfile?.level || els.profileLevel.value || 'A0';
  const rule = getEffectiveSentenceRule(level, state.currentProfile?.maxWords ?? els.profileMaxWords.value);
  if (countWords(requiredWords.join(' ')) > rule.maxWords) {
    toast(`Сами заданные слова длиннее лимита ${level} (${rule.maxWords}). Уберите часть слов или выберите другой уровень.`, 'error', 6000);
    return;
  }
  try {
    await socketAck(state.socket, 'teacher:generate', {
      transcript,
      action,
      requiredWords,
      instruction: els.teacherInstruction.value.trim(),
      scaffoldLevel: state.scaffoldLevel
    });
  } catch (error) {
    toast(error.message, 'error');
  }
}

function countWords(value) {
  return String(value || '').match(/[\p{L}\p{M}]+(?:[-'][\p{L}\p{M}]+)*/gu)?.length || 0;
}

async function runTransform(instruction) {
  if (!state.socket?.connected || !state.candidate) {
    toast('Сначала получите ответ модели', 'error');
    return;
  }
  try {
    await socketAck(state.socket, 'teacher:transform', {
      currentText: els.candidateEditor.value.trim(),
      instruction,
      scaffoldLevel: state.scaffoldLevel
    });
  } catch (error) {
    toast(error.message, 'error');
  }
}

function renderCandidate() {
  const c = state.candidate;
  if (!c) return;
  els.interpretation.textContent = c.interpretation_ru || '—';
  els.correctedStudent.textContent = c.corrected_student_de || '—';
  els.candidateEditor.value = state.selectedText || c.main;
  const newWords = c.new_words?.length ? c.new_words.join(', ') : '0';
  els.candidateMeta.innerHTML = [
    makePill(
      'Слов',
      c.sentence_min_words && c.sentence_max_words
        ? `${c.word_count} / ${c.sentence_min_words}–${c.sentence_max_words}`
        : c.word_count ?? String(c.main).trim().split(/\s+/).length,
      c.exceeds_word_limit || (c.required_words?.length && !c.within_level_word_range) ? 'warn' : 'ok'
    ),
    ...(c.required_words?.length ? [makePill(
      'Заданные слова',
      c.missing_required_words?.length ? `не вошли: ${c.missing_required_words.join(', ')}` : 'все использованы',
      c.missing_required_words?.length ? 'warn' : 'ok'
    )] : []),
    makePill('Новые', newWords, c.new_words?.length ? 'warn' : 'ok'),
    makePill('Грамматика', (c.grammar_used || []).join(', ') || 'знакомая'),
    makePill('Ожидаемый ответ', c.expected_answer_de || '—')
  ].join('');
  els.variantsGrid.innerHTML = VARIANTS.map(([key, label]) => {
    const text = c[key];
    if (!text) return '';
    const selected = state.selectedVariant === key ? 'selected' : '';
    return `<button type="button" class="variant-card ${selected}" data-variant="${key}">
      <span>${esc(label)}</span><b lang="de">${esc(text)}</b>
    </button>`;
  }).join('');
  $$('.variant-card', els.variantsGrid).forEach((button) => {
    button.addEventListener('click', () => selectVariant(button.dataset.variant));
  });
  updateSpeakState();
  updateTeacherMicSendState();
}

async function selectVariant(key) {
  const text = state.candidate?.[key];
  if (!text) return;
  state.selectedVariant = key;
  state.selectedText = text;
  els.candidateEditor.value = text;
  $$('.variant-card', els.variantsGrid).forEach((button) => button.classList.toggle('selected', button.dataset.variant === key));
  try {
    await socketAck(state.socket, 'teacher:candidate', { text, variant: key });
  } catch (error) {
    toast(error.message, 'error');
  }
  updateSpeakState();
}

function highlightVariantFromText(text) {
  const found = VARIANTS.find(([key]) => state.candidate?.[key] === text)?.[0] || '';
  state.selectedVariant = found || state.selectedVariant;
  $$('.variant-card', els.variantsGrid).forEach((button) => button.classList.toggle('selected', button.dataset.variant === found));
}

function updateSpeakState() {
  const ready = Boolean(state.selectedText || els.candidateEditor.value.trim());
  const blocked = !ready || !state.socket?.connected || state.sessionEnded;
  // Without ElevenLabs every phrase goes out through the browser voice, so the
  // first button still works — it just does not pick an ElevenLabs voice.
  const voiceMissing = (button) => state.config?.elevenlabsTtsEnabled && button.dataset.available === 'no';
  els.speakButton.disabled = blocked || voiceMissing(els.speakButton);
  els.speakButton2.disabled = blocked || voiceMissing(els.speakButton2);
  els.slowerSpeakButton.disabled = blocked;
}

async function speak(playbackRate, voice = state.activeVoice) {
  const text = els.candidateEditor.value.trim();
  if (!text) return;
  const button = playbackRate !== 1
    ? els.slowerSpeakButton
    : (voice === 'secondary' ? els.speakButton2 : els.speakButton);
  setBusy(button, true, 'Отправляем…');
  try {
    await socketAck(state.socket, 'teacher:candidate', { text, variant: state.selectedVariant || 'manual' });
    const result = await socketAck(state.socket, 'teacher:speak', { text, variant: state.selectedVariant, playbackRate, voice });
    state.activeVoice = result.voice || voice;
    toast(
      result.mode === 'elevenlabs'
        ? `Отправлено ученику голосом «${result.voiceLabel || voice}»`
        : 'Отправлено через голос браузера',
      'success'
    );
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(button, false);
    updateSpeakState();
  }
}

function renderScaffold() {
  const labels = ['Свободно', 'Короче', 'Проще', 'Ja/Nein', 'A/B', 'Начало', 'Образец'];
  els.scaffoldRow.innerHTML = labels.map((label, level) =>
    `<button type="button" class="scaffold-chip ${level === state.scaffoldLevel ? 'active' : ''}" data-level="${level}"><span>${level}</span>${esc(label)}</button>`
  ).join('');
  $$('.scaffold-chip', els.scaffoldRow).forEach((button) => {
    button.addEventListener('click', async () => {
      if (!state.socket?.connected) return;
      try {
        const result = await socketAck(state.socket, 'teacher:scaffold', { level: Number(button.dataset.level) });
        state.scaffoldLevel = result.level;
        renderScaffold();
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  });
}

async function assess(assessment) {
  if (!state.socket?.connected) return;
  try {
    await socketAck(state.socket, 'teacher:assessment', { assessment });
    const labels = { independent: 'Самостоятельно', prompted: 'С помощью', error: 'Ошибка', mastered: 'Освоено' };
    addLog(`Оценка: ${labels[assessment]}`, 'assessment');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function endSession() {
  if (!state.socket?.connected || state.sessionEnded) return;
  if (!confirm('Завершить урок и сформировать итог?')) return;
  setBusy(els.endSessionButton, true, 'Подводим итог…');
  try {
    const result = await socketAck(state.socket, 'teacher:end', {});
    showSummary(result.summary);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(els.endSessionButton, false);
  }
}

function showSummary(summary) {
  state.sessionEnded = true;
  stopTeacherMicrophone();
  localStorage.removeItem('glc.teacherRoom');
  els.summaryPanel.hidden = false;
  els.summaryText.innerHTML = `<p>${esc(summary?.summary_ru || 'Урок завершён.')}</p>
    ${summary?.mastered_words?.length ? `<h4>Освоено</h4><p>${summary.mastered_words.map(esc).join(', ')}</p>` : ''}
    ${summary?.repeat_words?.length ? `<h4>Повторить</h4><p>${summary.repeat_words.map(esc).join(', ')}</p>` : ''}
    ${summary?.next_steps?.length ? `<h4>Следующие шаги</h4><ul>${summary.next_steps.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}`;
  updateSpeakState();
  toast('Урок завершён', 'success');
}

function addLog(text, kind = 'info', at = Date.now()) {
  const node = document.createElement('div');
  node.className = `log-line ${kind}`;
  node.innerHTML = `<time>${formatTime(at)}</time><span>${esc(text)}</span>`;
  els.sessionLog.prepend(node);
  while (els.sessionLog.children.length > 80) els.sessionLog.lastElementChild.remove();
}
