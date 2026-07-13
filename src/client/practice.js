import { $, esc, toast, setBusy, refreshMicrophoneSelect, startVoiceCapture, transcribeAudio } from './shared.js';

const state = {
  lessons: [],
  scenarios: {},
  config: { sttEnabled: false, ttsEnabled: false, aiEnabled: false },
  moduleId: 1,
  mode: 'dialog',
  scenarioId: '',
  history: [],
  started: false,
  busy: false,
  capture: null,
  micOn: false,
  lastAiText: '',
  currentAudio: null
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
    state.lessons = curriculum.lessons || [];
    state.scenarios = practice.scenarios || {};
    state.config = {
      sttEnabled: Boolean(practice.sttEnabled),
      ttsEnabled: Boolean(practice.ttsEnabled),
      aiEnabled: Boolean(practice.aiEnabled)
    };
    renderModules();
    onSetupChange();
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
  els.moduleSelect = $('#moduleSelect');
  els.modeSelect = $('#modeSelect');
  els.scenarioField = $('#scenarioField');
  els.scenarioSelect = $('#scenarioSelect');
  els.startButton = $('#startButton');
  els.setupHint = $('#setupHint');

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
  els.moduleSelect.addEventListener('change', () => { state.moduleId = Number(els.moduleSelect.value); onSetupChange(); });
  els.modeSelect.addEventListener('change', () => { state.mode = els.modeSelect.value; onSetupChange(); });
  els.scenarioSelect.addEventListener('change', () => { state.scenarioId = els.scenarioSelect.value; });
  els.startButton.addEventListener('click', startSession);

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
    sendUser(text);
  });
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
    els.setupHint.innerHTML = `<div><b>ИИ играет:</b> ${esc(sc.aiRole)}. <b>Вы:</b> ${esc(sc.userRole)}.</div><div><b>Задача:</b> ${esc(sc.goal)}</div>`;
  } else if (lesson) {
    els.setupHint.innerHTML = `<div><b>Грамматика:</b> ${esc((lesson.grammar || []).join(' · ')) || '—'}</div><div><b>Темы:</b> ${esc((lesson.themes || []).join(' · ')) || '—'}</div>`;
  }
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
  els.correctionLine.hidden = true;
  els.revealBox.hidden = true;
  els.hintBox.hidden = true;
  els.startButton.textContent = 'Начать заново';

  const lesson = currentLesson();
  const sc = currentScenario();
  els.liveTranscript.textContent = state.mode === 'roleplay' && sc
    ? `Роль ИИ: ${sc.aiRole}. Ответьте голосом или текстом.`
    : `Отвечайте по-немецки, используя: ${(lesson?.grammar || []).join(', ')}`;

  if (state.mode === 'roleplay' && sc?.opener) {
    presentAiTurn(sc.opener, '', '');
    state.history.push({ role: 'ai', text: sc.opener });
  } else {
    await requestReply('');
  }
}

async function sendUser(text) {
  const value = String(text || '').trim();
  if (!value || state.busy) return;
  if (!state.started) { toast('Сначала нажмите «Начать»', 'error'); return; }
  els.liveTranscript.textContent = `Вы сказали: «${value}»`;
  els.correctionLine.hidden = true;
  state.history.push({ role: 'user', text: value });
  await requestReply(value);
}

async function requestReply(userText) {
  if (state.busy) return;
  state.busy = true;
  els.status.textContent = 'ИИ думает…';
  els.status.className = 'status-badge pending';
  els.listenState.textContent = 'Собеседник печатает…';
  try {
    const data = await fetchJson('/api/practice/reply', {
      method: 'POST',
      body: {
        moduleId: state.moduleId,
        mode: state.mode,
        scenarioId: state.scenarioId,
        history: state.history.slice(-16),
        userText
      }
    });
    const reply = data.reply_de || '…';
    state.history.push({ role: 'ai', text: reply });
    presentAiTurn(reply, data.correction, data.hint_ru);
    els.status.textContent = 'Ваш ход';
    els.status.className = 'status-badge ok';
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
    await sendUser(text);
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
