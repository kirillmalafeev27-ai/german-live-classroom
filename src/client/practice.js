import { $, esc, toast, setBusy, startVoiceCapture, transcribeAudio } from './shared.js';

const state = {
  lessons: [],
  scenarios: {},
  modes: [],
  config: { sttEnabled: false, ttsEnabled: false, aiEnabled: false },
  moduleId: 1,
  mode: 'dialog',
  scenarioId: '',
  history: [],
  capture: null,
  micOn: false,
  busy: false,
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
    state.modes = practice.modes || [];
    state.config = {
      sttEnabled: Boolean(practice.sttEnabled),
      ttsEnabled: Boolean(practice.ttsEnabled),
      aiEnabled: Boolean(practice.aiEnabled)
    };
    renderModules();
    onModuleChange();
    if (!state.config.aiEnabled) {
      els.status.textContent = 'AITUNNEL не настроен';
      els.status.className = 'status-badge warn';
      els.startButton.disabled = true;
    }
    if (!state.config.sttEnabled) els.micButton.hidden = true;
    if (!state.config.ttsEnabled) { els.ttsToggle.checked = false; els.ttsToggle.closest('.practice-tts-toggle').hidden = true; }
  } catch (error) {
    els.status.textContent = 'Ошибка загрузки';
    els.status.className = 'status-badge error';
    toast(error.message, 'error');
  }
}

function cache() {
  els.status = $('#practiceStatus');
  els.moduleSelect = $('#moduleSelect');
  els.moduleMeta = $('#moduleMeta');
  els.modeTabs = $('#modeTabs');
  els.scenarioBlock = $('#scenarioBlock');
  els.scenarioButtons = $('#scenarioButtons');
  els.startButton = $('#startButton');
  els.setupCard = $('#setupCard');
  els.chatCard = $('#chatCard');
  els.chatMode = $('#chatMode');
  els.chatTitle = $('#chatTitle');
  els.chatGoal = $('#chatGoal');
  els.chatLog = $('#chatLog');
  els.hintBar = $('#hintBar');
  els.chatInput = $('#chatInput');
  els.sendButton = $('#sendButton');
  els.resetButton = $('#resetButton');
  els.micButton = $('#micButton');
  els.micStopButton = $('#micStopButton');
  els.micMeterWrap = $('#micMeterWrap');
  els.micSignal = $('#micSignal');
  els.micMeterValue = $('#micMeterValue');
  els.micMeterFill = $('#micMeterFill');
  els.micLive = $('#micLive');
  els.ttsToggle = $('#ttsToggle');
}

function bind() {
  els.moduleSelect.addEventListener('change', () => {
    state.moduleId = Number(els.moduleSelect.value);
    onModuleChange();
  });
  els.modeTabs.querySelectorAll('.mode-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      state.mode = tab.dataset.mode;
      els.modeTabs.querySelectorAll('.mode-tab').forEach((t) => t.classList.toggle('active', t === tab));
      els.scenarioBlock.hidden = state.mode !== 'roleplay';
      updateStartState();
    });
  });
  els.startButton.addEventListener('click', startSession);
  els.resetButton.addEventListener('click', resetSession);
  els.sendButton.addEventListener('click', () => sendUser(els.chatInput.value));
  els.chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); sendUser(els.chatInput.value); }
  });
  els.micButton.addEventListener('click', startMic);
  els.micStopButton.addEventListener('click', stopMic);
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

function onModuleChange() {
  const lesson = currentLesson();
  if (lesson) {
    els.moduleMeta.innerHTML = `
      <div><b>Грамматика:</b> ${esc((lesson.grammar || []).join(' · ')) || '—'}</div>
      <div><b>Темы:</b> ${esc((lesson.themes || []).join(' · ')) || '—'}</div>`;
  }
  renderScenarios();
  updateStartState();
}

function renderScenarios() {
  const list = state.scenarios[String(state.moduleId)] || [];
  state.scenarioId = list[0]?.id || '';
  els.scenarioButtons.innerHTML = list.map((sc) => `
    <button type="button" class="scenario-chip${sc.id === state.scenarioId ? ' active' : ''}" data-id="${esc(sc.id)}">
      <b>${esc(sc.title)}</b>
      <span>ИИ: ${esc(sc.aiRole)}</span>
      <small>${esc(sc.goal)}</small>
    </button>`).join('');
  els.scenarioButtons.querySelectorAll('.scenario-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.scenarioId = chip.dataset.id;
      els.scenarioButtons.querySelectorAll('.scenario-chip').forEach((c) => c.classList.toggle('active', c === chip));
      updateStartState();
    });
  });
}

function currentScenario() {
  return (state.scenarios[String(state.moduleId)] || []).find((sc) => sc.id === state.scenarioId) || null;
}

function updateStartState() {
  const ok = state.config.aiEnabled && (state.mode === 'dialog' || Boolean(currentScenario()));
  els.startButton.disabled = !ok;
}

async function startSession() {
  state.history = [];
  els.chatLog.innerHTML = '';
  els.hintBar.hidden = true;
  const lesson = currentLesson();
  const scenario = currentScenario();
  els.setupCard.hidden = true;
  els.chatCard.hidden = false;
  els.chatMode.textContent = state.mode === 'roleplay' ? 'Ролевой диалог' : 'Диалог по теме';
  els.chatTitle.textContent = state.mode === 'roleplay' && scenario
    ? scenario.title
    : `${lesson.id}. ${lesson.title}`;
  els.chatGoal.textContent = state.mode === 'roleplay' && scenario
    ? `Ваша роль: ${scenario.userRole}. Задача: ${scenario.goal}`
    : `Отвечайте по-немецки, используя: ${(lesson.grammar || []).join(', ')}`;

  if (state.mode === 'roleplay' && scenario?.opener) {
    addMessage('ai', scenario.opener);
    state.history.push({ role: 'ai', text: scenario.opener });
    maybeSpeak(scenario.opener);
  } else {
    await requestReply('');
  }
  els.chatInput.focus();
}

function resetSession() {
  stopMic();
  stopAudio();
  els.chatCard.hidden = true;
  els.setupCard.hidden = false;
}

async function sendUser(text) {
  const value = String(text || '').trim();
  if (!value || state.busy) return;
  els.chatInput.value = '';
  addMessage('user', value);
  state.history.push({ role: 'user', text: value });
  await requestReply(value);
}

async function requestReply(userText) {
  if (state.busy) return;
  state.busy = true;
  setBusy(els.sendButton, true, '…');
  els.status.textContent = 'ИИ думает…';
  els.status.className = 'status-badge pending';
  const typing = addMessage('ai', '…', true);
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
    typing.remove();
    const reply = data.reply_de || '…';
    addMessage('ai', reply, false, data.correction);
    state.history.push({ role: 'ai', text: reply });
    if (data.hint_ru) { els.hintBar.hidden = false; els.hintBar.textContent = `💡 ${data.hint_ru}`; }
    else els.hintBar.hidden = true;
    els.status.textContent = 'Ваш ход';
    els.status.className = 'status-badge ok';
    maybeSpeak(reply);
  } catch (error) {
    typing.remove();
    els.status.textContent = 'Ошибка';
    els.status.className = 'status-badge error';
    toast(error.message, 'error');
  } finally {
    state.busy = false;
    setBusy(els.sendButton, false);
  }
}

function addMessage(role, text, temporary = false, correction = '') {
  const wrap = document.createElement('div');
  wrap.className = `chat-bubble ${role === 'ai' ? 'from-ai' : 'from-user'}${temporary ? ' typing' : ''}`;
  const body = document.createElement('div');
  body.className = 'bubble-text';
  body.lang = role === 'ai' ? 'de' : '';
  body.textContent = text;
  wrap.append(body);
  if (role === 'ai' && !temporary && state.config.ttsEnabled) {
    const play = document.createElement('button');
    play.className = 'bubble-play';
    play.type = 'button';
    play.textContent = '🔊';
    play.title = 'Прослушать';
    play.addEventListener('click', () => speak(text));
    wrap.append(play);
  }
  if (correction) {
    const corr = document.createElement('div');
    corr.className = 'bubble-correction';
    corr.lang = 'de';
    corr.textContent = `✏️ ${correction}`;
    wrap.append(corr);
  }
  els.chatLog.append(wrap);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
  return wrap;
}

// ----- Text-to-speech -----

function maybeSpeak(text) {
  if (els.ttsToggle?.checked && state.config.ttsEnabled) speak(text);
}

async function speak(text) {
  if (!state.config.ttsEnabled) return;
  stopAudio();
  try {
    const response = await fetch('/api/practice/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!response.ok) throw new Error('Не удалось получить аудио');
    const blob = await response.blob();
    const audio = new Audio(URL.createObjectURL(blob));
    state.currentAudio = audio;
    audio.play().catch(() => {});
  } catch {
    // TTS is optional; ignore failures silently.
  }
}

function stopAudio() {
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio = null;
  }
}

// ----- Voice input (Whisper) -----

async function startMic() {
  if (state.micOn || !state.config.sttEnabled) return;
  try {
    els.micMeterWrap.hidden = false;
    state.capture = await startVoiceCapture({
      fill: els.micMeterFill,
      value: els.micMeterValue,
      signal: els.micSignal,
      onState: (phase) => {
        if (phase === 'processing') els.micLive.textContent = '⏳ Распознаю…';
        else if (phase === 'speaking') els.micLive.textContent = '🎙 Слышу вас…';
        else if (phase === 'empty') els.micLive.textContent = '🔇 Звук не пойман — говорите ближе к микрофону.';
        else els.micLive.textContent = 'Говорите по-немецки…';
      },
      onSegment: handleMicSegment
    });
    state.micOn = true;
    els.micButton.hidden = true;
    els.micStopButton.hidden = false;
  } catch (error) {
    els.micMeterWrap.hidden = true;
    toast(`Не удалось включить микрофон: ${error.message}`, 'error');
  }
}

function stopMic() {
  state.capture?.stop();
  state.capture = null;
  state.micOn = false;
  els.micButton.hidden = !state.config.sttEnabled;
  els.micStopButton.hidden = true;
  els.micMeterWrap.hidden = true;
}

async function handleMicSegment(blob) {
  try {
    const text = await transcribeAudio(blob, { path: '/api/practice/transcribe' });
    if (!text) { els.micLive.textContent = '🔇 Не расслышал. Повторите.'; return; }
    els.micLive.textContent = `Вы сказали: «${text}»`;
    await sendUser(text);
  } catch (error) {
    els.micLive.textContent = `⚠️ ${error.message}`;
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
