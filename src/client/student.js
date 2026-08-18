import {
  api, $, esc, toast, setBusy, getQuery, storageKeys, mediaStorageKeys,
  refreshMicrophoneSelect, startVoiceCapture, transcribeAudio,
  createAudioGate, unlockOnFirstGesture, describeAudioError, isAutoplayBlocked,
  loadGermanVoice, speakWithBrowser
} from './shared.js';

const query = getQuery();
const state = {
  roomCode: String(query.room || localStorage.getItem(storageKeys.studentRoom) || '').toUpperCase(),
  token: String(query.token || localStorage.getItem(storageKeys.studentToken) || ''),
  session: null,
  lesson: null,
  profile: null,
  config: null,
  socket: null,
  capture: null,
  micStarted: false,
  currentSpeech: null,
  pendingSpeech: null,
  audio: null,
  germanVoice: null,
  playing: false,
  committedHistory: [],
  selectedMicId: localStorage.getItem(mediaStorageKeys.studentMic) || '',
  micRestarting: false
};

const els = {};

document.addEventListener('DOMContentLoaded', boot);

function cacheElements() {
  Object.assign(els, {
    joinView: $('#joinView'),
    lessonView: $('#lessonView'),
    joinForm: $('#joinForm'),
    joinCode: $('#joinCode'),
    joinPin: $('#joinPin'),
    joinButton: $('#joinButton'),
    roomLabel: $('#roomLabel'),
    studentName: $('#studentName'),
    lessonTitle: $('#lessonTitle'),
    levelLabel: $('#levelLabel'),
    connectionStatus: $('#studentConnectionStatus'),
    micStatus: $('#micStatus'),
    micSelect: $('#studentMicSelect'),
    micMeterFill: $('#studentMicMeterFill'),
    micMeterValue: $('#studentMicMeterValue'),
    micSignal: $('#studentMicSignal'),
    startMicButton: $('#startMicButton'),
    stopMicButton: $('#stopMicButton'),
    liveTranscript: $('#liveTranscript'),
    committedTranscript: $('#committedTranscript'),
    typedForm: $('#typedForm'),
    typedInput: $('#typedInput'),
    sendTypedButton: $('#sendTypedButton'),
    listenCard: $('#listenCard'),
    listenState: $('#listenState'),
    repeatButton: $('#repeatButton'),
    slowerButton: $('#slowerButton'),
    keywordButton: $('#keywordButton'),
    starterButton: $('#starterButton'),
    transcriptButton: $('#transcriptButton'),
    revealBox: $('#revealBox'),
    revealLabel: $('#revealLabel'),
    revealText: $('#revealText'),
    endedPanel: $('#endedPanel'),
    endedSummary: $('#endedSummary'),
    audioUnlock: $('#audioUnlock')
  });
}

async function boot() {
  cacheElements();
  state.audio = createAudioGate({
    onChange: (unlocked) => { if (unlocked) hideUnlockBanner(); }
  });
  // A personal link drops the learner straight into the lesson, so the first
  // phrase can arrive before any click. Catch the very first interaction —
  // whatever it is — and use it to open audio playback.
  unlockOnFirstGesture(state.audio, () => flushPendingSpeech());
  bindEvents();
  els.joinCode.value = state.roomCode;
  state.config = await loadConfig();

  if (state.roomCode && state.token) {
    try {
      await loadSession();
      enterLesson();
      connectSocket();
      return;
    } catch {
      localStorage.removeItem(storageKeys.studentToken);
      state.token = '';
    }
  }
  showJoin();
}

// /api/config decides whether the microphone button stays enabled, so one flaky
// request must not leave a working room without speech recognition.
async function loadConfig(attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await api('/api/config');
    } catch {
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  return null;
}

function bindEvents() {
  els.joinForm.addEventListener('submit', joinRoom);
  els.startMicButton.addEventListener('click', startMicrophone);
  els.stopMicButton.addEventListener('click', stopMicrophone);
  els.micSelect.addEventListener('change', async () => {
    state.selectedMicId = els.micSelect.value;
    localStorage.setItem(mediaStorageKeys.studentMic, state.selectedMicId);
    if (state.micStarted && !state.micRestarting) {
      state.micRestarting = true;
      stopMicrophone();
      await new Promise((resolve) => setTimeout(resolve, 180));
      await startMicrophone();
      state.micRestarting = false;
      toast('Микрофон переключён', 'success');
    }
  });
  navigator.mediaDevices?.addEventListener?.('devicechange', () => refreshStudentMicrophones());
  els.typedForm.addEventListener('submit', sendTyped);
  els.repeatButton.addEventListener('click', () => replay(1, 'repeat'));
  els.slowerButton.addEventListener('click', () => replay(0.72, 'slower'));
  els.keywordButton.addEventListener('click', () => reveal('keyword'));
  els.starterButton.addEventListener('click', () => reveal('starter'));
  els.transcriptButton.addEventListener('click', () => reveal('transcript'));
  els.audioUnlock.addEventListener('click', () => unlockAudio({ announce: true }));
}

// ----- Audio unlock -----

function hideUnlockBanner() {
  els.audioUnlock.hidden = true;
  els.audioUnlock.classList.remove('needed');
}

function showUnlockBanner() {
  els.audioUnlock.hidden = false;
  els.audioUnlock.classList.add('needed');
}

async function unlockAudio({ announce = false } = {}) {
  await state.audio.unlock();
  if (!state.audio.unlocked) {
    if (announce) toast('Браузер всё ещё блокирует звук. Проверьте, что вкладка не отключена (иконка динамика).', 'error', 6000);
    return false;
  }
  hideUnlockBanner();
  if (announce) toast('Звук разрешён', 'success');
  flushPendingSpeech();
  return true;
}

function flushPendingSpeech() {
  const pending = state.pendingSpeech;
  state.pendingSpeech = null;
  if (pending) void playSpeech(pending, Number(pending.playbackRate || 1));
}

function showJoin() {
  els.joinView.hidden = false;
  els.lessonView.hidden = true;
}

async function joinRoom(event) {
  event.preventDefault();
  const code = els.joinCode.value.trim().toUpperCase();
  const pin = els.joinPin.value.trim();
  if (!code || !pin) return toast('Введите код комнаты и PIN', 'error');
  // Submitting the form is a genuine gesture — the best moment to open audio.
  void unlockAudio();
  setBusy(els.joinButton, true, 'Подключаемся…');
  try {
    const result = await api('/api/sessions/join', { method: 'POST', body: { code, pin } });
    state.roomCode = code;
    state.token = result.studentToken;
    localStorage.setItem(storageKeys.studentRoom, code);
    localStorage.setItem(storageKeys.studentToken, state.token);
    await loadSession();
    enterLesson();
    connectSocket();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(els.joinButton, false);
  }
}

async function loadSession() {
  const result = await api(`/api/sessions/${encodeURIComponent(state.roomCode)}`, { token: state.token });
  state.session = result.session;
  state.lesson = result.lesson;
  state.profile = result.profile;
}

function enterLesson() {
  els.joinView.hidden = true;
  els.lessonView.hidden = false;
  els.roomLabel.textContent = state.roomCode;
  els.studentName.textContent = state.profile?.name || 'Ученик';
  els.lessonTitle.textContent = `${state.lesson?.id || ''}. ${state.lesson?.title || 'Урок немецкого'}`;
  els.levelLabel.textContent = state.profile?.level || 'A0';
  els.listenCard.classList.remove('speaking');
  if (state.audio?.unlocked) hideUnlockBanner(); else showUnlockBanner();
  setConnection('Подключаемся…', 'pending');
  refreshStudentMicrophones();
  if (state.config && !state.config.sttEnabled) {
    els.startMicButton.disabled = true;
    els.micStatus.textContent = 'Распознавание речи не настроено — используйте текстовое поле';
    els.micStatus.className = 'status-badge warn';
  } else if (!state.config) {
    // Config could not be read; keep the microphone usable and let the actual
    // recognition request report the real problem if there is one.
    els.micStatus.textContent = 'Настройки сервера недоступны — микрофон можно попробовать';
    els.micStatus.className = 'status-badge warn';
  }
}

function connectSocket() {
  state.socket?.disconnect();
  state.socket = io({
    auth: { role: 'student', roomCode: state.roomCode, token: state.token },
    transports: ['websocket', 'polling']
  });
  state.socket.on('connect', () => setConnection('Связь с преподавателем установлена', 'ok'));
  state.socket.on('disconnect', () => setConnection('Связь прервана — переподключаемся', 'error'));
  state.socket.on('connect_error', (error) => setConnection(`Ошибка подключения: ${error.message}`, 'error'));
  state.socket.on('session:snapshot', (payload) => {
    state.session = payload.session;
    state.lesson = payload.lesson || state.lesson;
  });
  state.socket.on('student:speak', handleSpeech);
  state.socket.on('session:ended', ({ summary }) => {
    stopMicrophone();
    state.audio?.stop();
    els.endedPanel.hidden = false;
    els.endedSummary.textContent = summary?.summary_ru || 'Урок завершён. Спасибо!';
    els.listenCard.hidden = true;
    toast('Урок завершён', 'success');
  });
}

function setConnection(text, kind) {
  els.connectionStatus.textContent = text;
  els.connectionStatus.className = `status-badge ${kind}`;
}

async function refreshStudentMicrophones() {
  try {
    await refreshMicrophoneSelect(els.micSelect, state.selectedMicId);
    state.selectedMicId = els.micSelect.value;
  } catch {
    els.micSelect.innerHTML = '<option value="">Не удалось получить список</option>';
    els.micSelect.disabled = true;
  }
}

async function startMicrophone() {
  if (state.micStarted || !state.socket?.connected) {
    if (!state.socket?.connected) toast('Дождитесь подключения к комнате', 'error');
    return;
  }
  setBusy(els.startMicButton, true, 'Запускаем…');
  try {
    void unlockAudio();
    state.selectedMicId = els.micSelect.value || state.selectedMicId;
    localStorage.setItem(mediaStorageKeys.studentMic, state.selectedMicId);

    state.capture?.stop();
    state.capture = await startVoiceCapture({
      deviceId: state.selectedMicId,
      fill: els.micMeterFill,
      value: els.micMeterValue,
      signal: els.micSignal,
      onDeviceResolved: ({ deviceId }) => {
        if (deviceId) state.selectedMicId = deviceId;
      },
      onState: (phase) => {
        if (state.playing) return;
        if (phase === 'processing') els.liveTranscript.textContent = '⏳ Распознаю…';
        else if (phase === 'speaking') els.liveTranscript.textContent = '🎙 Слышу вас…';
        else if (phase === 'empty') els.liveTranscript.textContent = '🔇 Звук не пойман — говорите ближе к микрофону.';
        else if (state.micStarted) els.liveTranscript.textContent = 'Говорите…';
      },
      onSegment: (blob) => handleStudentSegment(blob)
    });
    await refreshStudentMicrophones();

    state.micStarted = true;
    els.startMicButton.hidden = true;
    els.stopMicButton.hidden = false;
    els.micStatus.textContent = 'Микрофон слушает немецкую речь';
    els.micStatus.className = 'status-badge ok';
    els.liveTranscript.textContent = 'Говорите…';
  } catch (error) {
    state.capture?.stop();
    state.capture = null;
    els.micStatus.textContent = describeMicError(error);
    els.micStatus.className = 'status-badge error';
    toast(describeMicError(error), 'error', 6000);
  } finally {
    setBusy(els.startMicButton, false);
  }
}

function describeMicError(error) {
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Доступ к микрофону запрещён. Разрешите его в настройках браузера для этого сайта.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Микрофон не найден. Подключите гарнитуру и выберите её в списке.';
  }
  if (name === 'NotReadableError') {
    return 'Микрофон занят другой программой (Zoom, Skype). Закройте её и попробуйте снова.';
  }
  if (!window.isSecureContext) {
    return 'Микрофон работает только по HTTPS. Откройте сайт по защищённой ссылке.';
  }
  return `Не удалось включить микрофон: ${error?.message || 'неизвестная ошибка'}`;
}

async function handleStudentSegment(blob) {
  if (state.playing) return;
  try {
    const text = await transcribeAudio(blob, { token: state.token, roomCode: state.roomCode });
    if (!text || state.playing) {
      if (state.micStarted && !state.playing) {
        els.liveTranscript.textContent = '🔇 Не расслышал (тишина или шум). Скажите ещё раз.';
      }
      return;
    }
    els.liveTranscript.textContent = `Вы сказали: «${text}»`;
    state.socket?.emit('student:partial', { text });
    commitText(text);
  } catch (error) {
    els.micStatus.textContent = `Ошибка распознавания: ${error.message}`;
    els.micStatus.className = 'status-badge error';
    els.liveTranscript.textContent = `⚠️ Ошибка распознавания: ${error.message}`;
  }
}

function stopMicrophone() {
  state.capture?.stop();
  state.capture = null;
  state.micStarted = false;
  els.startMicButton.hidden = false;
  els.stopMicButton.hidden = true;
  els.micStatus.textContent = 'Микрофон выключен';
  els.micStatus.className = 'status-badge muted';
}

function sendTyped(event) {
  event.preventDefault();
  const text = els.typedInput.value.trim();
  if (!text) return;
  if (!state.socket?.connected) return toast('Нет связи с комнатой', 'error');
  setBusy(els.sendTypedButton, true, 'Отправляем…');
  commitText(text, () => {
    els.typedInput.value = '';
    setBusy(els.sendTypedButton, false);
  });
}

function commitText(text, done = () => {}) {
  state.committedHistory.push(text);
  state.committedHistory = state.committedHistory.slice(-8);
  els.committedTranscript.innerHTML = state.committedHistory.map((item) => `<span>${esc(item)}</span>`).join('');
  els.liveTranscript.textContent = '📨 Отправляю преподавателю…';
  state.socket.emit('student:committed', { text }, (response) => {
    if (response?.ok) {
      els.liveTranscript.textContent = `✅ Отправлено преподавателю: «${text}»`;
    } else {
      els.liveTranscript.textContent = '⚠️ Не удалось отправить реплику.';
      toast(response?.error || 'Не удалось отправить реплику', 'error');
    }
    done();
  });
}

// ----- Playback -----

async function handleSpeech(payload) {
  state.currentSpeech = payload;
  resetReveal();
  els.listenCard.hidden = false;
  els.listenCard.classList.add('speaking');
  els.listenState.textContent = payload.source === 'teacher_mic' ? 'Команда преподавателя' : 'Слушайте и ответьте';
  await playSpeech(payload, Number(payload.playbackRate || 1));
}

async function playSpeech(payload, rate = 1) {
  if (!payload?.text) return;
  state.audio.stop();
  state.playing = true;
  state.capture?.pause();
  els.listenCard.classList.add('speaking');
  els.listenState.textContent = payload.source === 'teacher_mic' ? 'Слушайте команду…' : 'Слушайте…';

  try {
    if (payload.mode === 'elevenlabs' && payload.audioUrl) {
      await state.audio.play(payload.audioUrl, { rate });
    } else {
      if (!state.germanVoice) state.germanVoice = await loadGermanVoice();
      await speakWithBrowser(payload.text, rate, state.germanVoice);
    }
    els.listenState.textContent = payload.source === 'teacher_mic'
      ? 'Выполните команду или ответьте'
      : 'Теперь ответьте по-немецки';
  } catch (error) {
    reportPlaybackFailure(payload, error);
  } finally {
    state.playing = false;
    els.listenCard.classList.remove('speaking');
    setTimeout(() => state.capture?.resume(), 220);
  }
}

function reportPlaybackFailure(payload, error) {
  if (isAutoplayBlocked(error)) {
    // Keep the phrase so the unlock click plays it instead of losing the turn.
    state.pendingSpeech = payload;
    showUnlockBanner();
    els.listenState.textContent = 'Нажмите «Включить звук», чтобы услышать преподавателя';
    els.audioUnlock.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  } else {
    els.listenState.textContent = 'Звук не воспроизвёлся — нажмите «Повторить»';
  }
  toast(describeAudioError(error), 'error', 6000);
}

function replay(rate, action) {
  if (!state.currentSpeech) return;
  state.socket?.emit('student:assist', { action });
  // Start playback straight from the click: that gesture is what unlocks the
  // shared <audio> element on iOS, so no separate unlock step is needed here.
  void playSpeech(state.currentSpeech, rate);
}

function resetReveal() {
  els.revealBox.hidden = true;
  els.revealLabel.textContent = '';
  els.revealText.textContent = '';
}

function reveal(type) {
  if (!state.currentSpeech) return;
  const meta = state.currentSpeech.transcriptMeta || {};
  const content = type === 'keyword' ? meta.keyword : type === 'starter' ? meta.starter : meta.full || state.currentSpeech.text;
  const labels = { keyword: 'Ключевое слово', starter: 'Начало ответа', transcript: 'Полный транскрипт' };
  els.revealLabel.textContent = labels[type];
  els.revealText.textContent = content || '—';
  els.revealBox.hidden = false;
  state.socket?.emit('student:assist', { action: type });
}
