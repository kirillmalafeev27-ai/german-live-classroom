import { Scribe, RealtimeEvents, CommitStrategy } from '@elevenlabs/client';
import {
  api, $, esc, toast, setBusy, getQuery, storageKeys, mediaStorageKeys,
  refreshMicrophoneSelect, microphoneConstraint, startMicrophoneMeter
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
  scribe: null,
  micStarted: false,
  currentSpeech: null,
  currentAudio: null,
  playing: false,
  committedHistory: [],
  unlocked: false,
  micMeter: null,
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
  bindEvents();
  els.joinCode.value = state.roomCode;
  try { state.config = await api('/api/config'); } catch {}

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
  els.audioUnlock.addEventListener('click', () => {
    state.unlocked = true;
    els.audioUnlock.hidden = true;
    const audio = new Audio();
    audio.play().catch(() => {});
    toast('Звук разрешён', 'success');
  });
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
  setConnection('Подключаемся…', 'pending');
  refreshStudentMicrophones();
  if (!state.config?.elevenlabsSttEnabled) {
    els.startMicButton.disabled = true;
    els.micStatus.textContent = 'Scribe не настроен — используйте текстовое поле';
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
  } catch (error) {
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
    state.unlocked = true;
    els.audioUnlock.hidden = true;
    state.selectedMicId = els.micSelect.value || state.selectedMicId;
    localStorage.setItem(mediaStorageKeys.studentMic, state.selectedMicId);

    state.micMeter?.stop();
    state.micMeter = await startMicrophoneMeter({
      deviceId: state.selectedMicId,
      fill: els.micMeterFill,
      value: els.micMeterValue,
      signal: els.micSignal,
      onDeviceResolved: ({ deviceId }) => {
        if (deviceId) state.selectedMicId = deviceId;
      }
    });
    await refreshStudentMicrophones();

    const result = await api('/api/elevenlabs/scribe-token', {
      method: 'POST',
      token: state.token,
      body: { roomCode: state.roomCode, role: 'student' }
    });
    const keyterms = (state.lesson?.vocabulary || [])
      .map((item) => String(item).replace(/[.…]/g, '').trim())
      .filter((item) => item && item.length <= 20)
      .slice(0, 50);

    const connection = Scribe.connect({
      token: result.token,
      modelId: 'scribe_v2_realtime',
      languageCode: 'de',
      commitStrategy: CommitStrategy.VAD,
      vadSilenceThresholdSecs: 0.65,
      vadThreshold: 0.45,
      minSpeechDurationMs: 140,
      minSilenceDurationMs: 250,
      keyterms,
      noVerbatim: false,
      microphone: {
        deviceId: microphoneConstraint(state.selectedMicId),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      }
    });

    connection.on(RealtimeEvents.SESSION_STARTED, () => {
      state.micStarted = true;
      els.startMicButton.hidden = true;
      els.stopMicButton.hidden = false;
      els.micStatus.textContent = 'Микрофон слушает немецкую речь';
      els.micStatus.className = 'status-badge ok';
      els.liveTranscript.textContent = 'Говорите…';
    });
    connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (data) => {
      const text = String(data?.text || '').trim();
      els.liveTranscript.textContent = text || 'Говорите…';
      if (text) state.socket.emit('student:partial', { text });
    });
    connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (data) => {
      const text = String(data?.text || '').trim();
      if (!text || state.playing) return;
      commitText(text);
    });
    connection.on(RealtimeEvents.ERROR, (error) => {
      const message = error?.error || error?.message || 'Ошибка распознавания';
      els.micStatus.textContent = message;
      els.micStatus.className = 'status-badge error';
    });
    connection.on(RealtimeEvents.CLOSE, () => {
      state.micStarted = false;
      els.startMicButton.hidden = false;
      els.stopMicButton.hidden = true;
      if (!state.playing && !state.micRestarting) {
        els.micStatus.textContent = 'Микрофон остановлен';
        els.micStatus.className = 'status-badge muted';
      }
    });

    state.scribe = connection;
  } catch (error) {
    state.micMeter?.stop();
    state.micMeter = null;
    toast(`Не удалось включить микрофон: ${error.message}`, 'error', 6000);
  } finally {
    setBusy(els.startMicButton, false);
  }
}

function stopMicrophone() {
  try { state.scribe?.close(); } catch {}
  state.scribe = null;
  state.micMeter?.stop();
  state.micMeter = null;
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
  els.liveTranscript.textContent = 'Отправлено. Преподаватель готовит ответ…';
  state.socket.emit('student:committed', { text }, (response) => {
    if (!response?.ok) toast(response?.error || 'Не удалось отправить реплику', 'error');
    done();
  });
}

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
  stopCurrentAudio();
  state.playing = true;
  muteScribe(true);
  els.listenCard.classList.add('speaking');
  els.listenState.textContent = payload.source === 'teacher_mic' ? 'Слушайте команду…' : 'Слушайте…';

  try {
    if (payload.mode === 'elevenlabs' && payload.audioUrl) {
      const audio = new Audio(payload.audioUrl);
      state.currentAudio = audio;
      audio.playbackRate = rate;
      audio.preload = 'auto';
      await audio.play();
      await new Promise((resolve, reject) => {
        audio.onended = resolve;
        audio.onerror = () => reject(new Error('Не удалось воспроизвести аудио'));
      });
    } else {
      await speakWithBrowser(payload.text, rate);
    }
    els.listenState.textContent = payload.source === 'teacher_mic' ? 'Выполните команду или ответьте' : 'Теперь ответьте по-немецки';
  } catch (error) {
    els.listenState.textContent = 'Нажмите «Повторить», чтобы включить звук';
    els.audioUnlock.hidden = false;
    toast(error.message, 'error');
  } finally {
    state.playing = false;
    state.currentAudio = null;
    els.listenCard.classList.remove('speaking');
    setTimeout(() => muteScribe(false), 220);
  }
}

function speakWithBrowser(text, rate) {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) return reject(new Error('Голос браузера не поддерживается'));
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = Math.max(0.6, Math.min(1.1, rate));
    const germanVoice = speechSynthesis.getVoices().find((voice) => voice.lang?.toLowerCase().startsWith('de'));
    if (germanVoice) utterance.voice = germanVoice;
    utterance.onend = resolve;
    utterance.onerror = () => reject(new Error('Голос браузера недоступен'));
    speechSynthesis.speak(utterance);
  });
}

function stopCurrentAudio() {
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio.currentTime = 0;
  }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

function muteScribe(muted) {
  if (!state.scribe || !state.micStarted) return;
  try {
    if (muted && !state.scribe.isMuted) state.scribe.mute();
    if (!muted && state.scribe.isMuted) state.scribe.unmute();
  } catch {}
}

function replay(rate, action) {
  if (!state.currentSpeech) return;
  state.socket?.emit('student:assist', { action });
  playSpeech(state.currentSpeech, rate);
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
