export const storageKeys = {
  teacherToken: 'glc.teacherToken',
  studentToken: 'glc.studentToken',
  studentRoom: 'glc.studentRoom'
};

export async function api(path, { method = 'GET', token = '', body, headers = {} } = {}) {
  const response = await fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  if (!response.ok) {
    const error = new Error(payload?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export function $(selector, root = document) {
  return root.querySelector(selector);
}

export function $$(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function parseList(value) {
  if (Array.isArray(value)) return [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))];
  return [...new Set(String(value || '').split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean))];
}

export function formatList(value) {
  return (value || []).join('\n');
}

export function debounce(fn, delay = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function toast(message, kind = 'info', duration = 3000) {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.append(stack);
  }
  const node = document.createElement('div');
  node.className = `toast ${kind}`;
  node.textContent = message;
  stack.append(node);
  requestAnimationFrame(() => node.classList.add('show'));
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 220);
  }, duration);
}

export function setBusy(button, busy, busyLabel = 'Подождите…') {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
    button.classList.add('busy');
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    button.classList.remove('busy');
  }
}

export function copyText(text) {
  return navigator.clipboard?.writeText(text).catch(() => {
    const input = document.createElement('textarea');
    input.value = text;
    document.body.append(input);
    input.select();
    document.execCommand('copy');
    input.remove();
  });
}

export function formatTime(value) {
  if (!value) return '—';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
}

export function getQuery() {
  return Object.fromEntries(new URLSearchParams(location.search));
}

export function socketAck(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.timeout(30000).emit(event, payload, (error, response) => {
      if (error) return reject(new Error('Сервер не ответил вовремя'));
      if (!response?.ok) return reject(new Error(response?.error || 'Операция не выполнена'));
      resolve(response);
    });
  });
}

export function makePill(label, value, className = '') {
  return `<span class="meta-pill ${className}"><b>${esc(label)}</b> ${esc(value)}</span>`;
}

export const mediaStorageKeys = {
  teacherMic: 'glc.teacherMicDevice',
  studentMic: 'glc.studentMicDevice'
};

export function canUseMicrophone() {
  return Boolean(navigator.mediaDevices?.getUserMedia && navigator.mediaDevices?.enumerateDevices);
}

export async function refreshMicrophoneSelect(select, preferredDeviceId = '') {
  if (!select) return [];
  if (!canUseMicrophone()) {
    select.innerHTML = '<option value="">Микрофоны не поддерживаются</option>';
    select.disabled = true;
    return [];
  }

  const devices = (await navigator.mediaDevices.enumerateDevices())
    .filter((device) => device.kind === 'audioinput');
  const current = preferredDeviceId || select.value || '';
  const options = ['<option value="">Системный микрофон по умолчанию</option>'];
  devices.forEach((device, index) => {
    const label = device.label || `Микрофон ${index + 1}`;
    options.push(`<option value="${esc(device.deviceId)}">${esc(label)}</option>`);
  });
  select.innerHTML = options.join('');
  select.disabled = false;
  if (current && devices.some((device) => device.deviceId === current)) select.value = current;
  else select.value = '';
  return devices;
}

export function microphoneConstraint(deviceId = '') {
  return deviceId ? { ideal: deviceId } : undefined;
}

function pickRecorderMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4'
  ];
  if (typeof MediaRecorder === 'undefined') return '';
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return '';
}

// Send a recorded audio segment to the server, which forwards it to AITUNNEL
// Whisper and returns the recognised text. Defaults to the room-scoped endpoint;
// self-study passes a path to the open practice endpoint.
export async function transcribeAudio(blob, { token = '', roomCode = '', path } = {}) {
  const url = path || `/api/stt/transcribe?room=${encodeURIComponent(roomCode)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': blob.type || 'audio/webm',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: blob
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
  return String(payload?.text || '').trim();
}

// One microphone stream drives both the level meter and a voice-activity
// detector. When the speaker pauses, the buffered segment is handed to
// onSegment(blob) so it can be transcribed by Whisper. This replaces the
// realtime streaming STT with a record-then-transcribe flow.
export async function startVoiceCapture({
  deviceId = '',
  fill,
  value,
  signal,
  onDeviceResolved,
  onSegment = async () => {},
  onState = () => {},
  speechThreshold = 0.02,
  silenceHangoverMs = 850,
  minVoicedMs = 400,
  maxSegmentMs = 15000
} = {}) {
  if (!canUseMicrophone()) throw new Error('Браузер не поддерживает доступ к микрофону');
  if (typeof MediaRecorder === 'undefined') throw new Error('Запись аудио не поддерживается браузером');

  const audio = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    ...(deviceId ? { deviceId: { ideal: deviceId } } : {})
  };

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
  } catch (error) {
    if (!deviceId || !['OverconstrainedError', 'NotFoundError'].includes(error?.name)) throw error;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      video: false
    });
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('Web Audio API не поддерживается');
  }
  const context = new AudioContextClass();
  if (context.state === 'suspended') await context.resume();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.72;
  source.connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);

  const mimeType = pickRecorderMimeType();
  const track = stream.getAudioTracks()[0];
  const resolvedDeviceId = track?.getSettings?.().deviceId || deviceId || '';
  onDeviceResolved?.({ deviceId: resolvedDeviceId, label: track?.label || '' });

  let stopped = false;
  let paused = false;
  let smoothed = 0;
  let raf = 0;
  let lastFrameAt = performance.now();

  let recorder = null;
  let chunks = [];
  let recording = false;
  let voicedMs = 0;        // accumulated time with real speech energy in this segment
  let lastVoiceAt = 0;
  let segmentReason = '';  // 'silence' | 'max' | 'abort'
  let pendingTeardown = false;

  const teardown = () => {
    cancelAnimationFrame(raf);
    try { source.disconnect(); } catch {}
    try { analyser.disconnect(); } catch {}
    stream.getTracks().forEach((item) => item.stop());
    context.close().catch(() => {});
    if (fill) {
      fill.style.transform = 'scaleX(0)';
      fill.parentElement?.classList.remove('receiving');
    }
    if (value) value.textContent = '0%';
    if (signal) {
      signal.textContent = 'Микрофон не активен';
      signal.classList.remove('active');
    }
  };

  const startSegment = (now) => {
    recording = true;
    voicedMs = 0;
    lastVoiceAt = now;
    segmentReason = '';
    chunks = [];
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      recorder = new MediaRecorder(stream);
    }
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      const collected = chunks;
      chunks = [];
      const type = recorder?.mimeType || mimeType || 'audio/webm';
      const heardEnough = voicedMs >= minVoicedMs && segmentReason !== 'abort';
      const blob = new Blob(collected, { type });
      const emit = heardEnough && blob.size >= 1200 && !paused;

      if (emit) {
        onState('processing');
        Promise.resolve()
          .then(() => onSegment(blob))
          .catch(() => {})
          .finally(() => { if (!recording && !stopped) onState('listening'); });
      } else {
        // A real attempt that captured no usable speech: tell the UI so it can
        // say "no sound" instead of silently doing nothing.
        onState(segmentReason === 'abort' ? 'listening' : 'empty');
      }

      if (pendingTeardown) { pendingTeardown = false; teardown(); }
    };
    try { recorder.start(); } catch { recording = false; }
    onState('speaking');
  };

  const finishSegment = (reason) => {
    if (!recording) return;
    recording = false;
    segmentReason = reason;
    try {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      else if (pendingTeardown) { pendingTeardown = false; teardown(); }
    } catch {
      if (pendingTeardown) { pendingTeardown = false; teardown(); }
    }
  };

  const render = () => {
    if (stopped) return;
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const normalized = (samples[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / samples.length);
    const boosted = Math.min(1, Math.max(0, (rms - 0.008) * 8.5));
    smoothed = Math.max(boosted, smoothed * 0.82);
    const percent = Math.round(smoothed * 100);
    if (fill) {
      fill.style.transform = `scaleX(${smoothed})`;
      fill.parentElement?.classList.toggle('receiving', percent >= 4);
    }
    if (value) value.textContent = `${percent}%`;
    if (signal) {
      signal.textContent = percent >= 4 ? 'Звук поступает' : 'Ожидаем звук';
      signal.classList.toggle('active', percent >= 4);
    }

    const now = performance.now();
    const dt = now - lastFrameAt;
    lastFrameAt = now;

    if (!paused) {
      const voiced = rms >= speechThreshold;
      if (voiced) lastVoiceAt = now;
      if (!recording && voiced) {
        startSegment(now);
      } else if (recording) {
        if (voiced) voicedMs += dt;
        const sinceVoice = now - lastVoiceAt;
        if (voicedMs >= maxSegmentMs) finishSegment('max');
        else if (sinceVoice >= silenceHangoverMs) finishSegment('silence');
      }
    }

    raf = requestAnimationFrame(render);
  };
  render();

  return {
    stream,
    track,
    deviceId: resolvedDeviceId,
    get paused() { return paused; },
    pause() {
      if (paused) return;
      paused = true;
      if (recording) finishSegment('abort');
    },
    resume() {
      paused = false;
      lastVoiceAt = performance.now();
      lastFrameAt = performance.now();
    },
    // Transcribe whatever has been said so far, then stop listening.
    flush() {
      if (recording && voicedMs >= minVoicedMs) finishSegment('silence');
    },
    stop() {
      if (stopped) return;
      stopped = true;
      if (recording) {
        // Flush a real utterance instead of discarding it; defer teardown until
        // the recorder hands us the final blob.
        pendingTeardown = true;
        finishSegment(voicedMs >= minVoicedMs ? 'silence' : 'abort');
      } else {
        teardown();
      }
    }
  };
}

export async function startMicrophoneMeter({ deviceId = '', fill, value, signal, onDeviceResolved } = {}) {
  if (!canUseMicrophone()) throw new Error('Браузер не поддерживает доступ к микрофону');
  const audio = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    ...(deviceId ? { deviceId: { ideal: deviceId } } : {})
  };

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
  } catch (error) {
    if (!deviceId || !['OverconstrainedError', 'NotFoundError'].includes(error?.name)) throw error;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      video: false
    });
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('Web Audio API не поддерживается');
  }
  const context = new AudioContextClass();
  if (context.state === 'suspended') await context.resume();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.72;
  source.connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);
  let raf = 0;
  let smoothed = 0;
  let stopped = false;

  const track = stream.getAudioTracks()[0];
  const resolvedDeviceId = track?.getSettings?.().deviceId || deviceId || '';
  onDeviceResolved?.({ deviceId: resolvedDeviceId, label: track?.label || '' });

  const render = () => {
    if (stopped) return;
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const normalized = (samples[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / samples.length);
    const boosted = Math.min(1, Math.max(0, (rms - 0.008) * 8.5));
    smoothed = Math.max(boosted, smoothed * 0.82);
    const percent = Math.round(smoothed * 100);
    if (fill) {
      fill.style.transform = `scaleX(${smoothed})`;
      fill.parentElement?.classList.toggle('receiving', percent >= 4);
    }
    if (value) value.textContent = `${percent}%`;
    if (signal) {
      signal.textContent = percent >= 4 ? 'Звук поступает' : 'Ожидаем звук';
      signal.classList.toggle('active', percent >= 4);
    }
    raf = requestAnimationFrame(render);
  };
  render();

  return {
    stream,
    track,
    deviceId: resolvedDeviceId,
    stop() {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      try { source.disconnect(); } catch {}
      try { analyser.disconnect(); } catch {}
      stream.getTracks().forEach((item) => item.stop());
      context.close().catch(() => {});
      if (fill) {
        fill.style.transform = 'scaleX(0)';
        fill.parentElement?.classList.remove('receiving');
      }
      if (value) value.textContent = '0%';
      if (signal) {
        signal.textContent = 'Микрофон не активен';
        signal.classList.remove('active');
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Audio playback gate
//
// Browsers refuse programmatic playback until the user has interacted with the
// page ("play() failed because the user didn't interact with the document
// first"). Two things make that bite here:
//   * a student who opens a personal link goes straight into the lesson, so no
//     click ever happens before the teacher pushes the first phrase;
//   * iOS/Safari does not accept a page-wide interaction — it only trusts an
//     <audio> element that was already started inside a real gesture.
// So both pages share ONE element that is unlocked on the first gesture and
// then reused for every phrase.
// ---------------------------------------------------------------------------

let silentClip = '';

function silentClipUrl(seconds = 0.05, sampleRate = 8000) {
  if (silentClip) return silentClip;
  const frames = Math.max(1, Math.round(seconds * sampleRate));
  const buffer = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(buffer);
  const ascii = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + frames * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, frames * 2, true);
  silentClip = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  return silentClip;
}

export function isAutoplayBlocked(error) {
  if (!error) return false;
  if (error.name === 'NotAllowedError') return true;
  return /didn'?t interact|user gesture|user activation|not allowed|autoplay/i.test(String(error.message || ''));
}

export function describeAudioError(error) {
  if (isAutoplayBlocked(error)) return 'Браузер заблокировал звук. Нажмите «Включить звук» один раз — дальше всё играет само.';
  if (error?.name === 'NotSupportedError') return 'Браузер не смог проиграть это аудио. Обновите страницу или используйте Chrome/Safari посвежее.';
  return `Не удалось воспроизвести аудио: ${error?.message || 'неизвестная ошибка'}`;
}

export function createAudioGate({ onChange = () => {} } = {}) {
  let element = null;
  let context = null;
  let unlocked = false;
  let pending = null;
  let unlocking = null;

  const ensureElement = () => {
    if (element) return element;
    element = new Audio();
    element.preload = 'auto';
    element.playsInline = true;
    element.setAttribute('playsinline', '');
    return element;
  };

  const markUnlocked = () => {
    if (unlocked) return;
    unlocked = true;
    try { onChange(true); } catch {}
  };

  // Safari also gates speechSynthesis behind a gesture; a muted throwaway
  // utterance inside the unlock click is enough to open it.
  const primeSpeech = () => {
    if (!('speechSynthesis' in window)) return;
    try {
      const utterance = new SpeechSynthesisUtterance(' ');
      utterance.volume = 0;
      utterance.lang = 'de-DE';
      speechSynthesis.speak(utterance);
      speechSynthesis.cancel();
    } catch {}
  };

  async function runUnlock() {
    const el = ensureElement();
    // Everything that needs the gesture is started before the first await:
    // Safari only counts a call made in the same task as the click.
    let started = null;
    try {
      el.src = silentClipUrl();
      started = el.play();
    } catch {}
    primeSpeech();

    try {
      await started;
      el.pause();
      try { el.currentTime = 0; } catch {}
      markUnlocked();
    } catch {}

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      try {
        context = context || new AudioContextClass();
        if (context.state === 'suspended') await context.resume();
        const source = context.createBufferSource();
        source.buffer = context.createBuffer(1, 1, 22050);
        source.connect(context.destination);
        source.start(0);
      } catch {}
    }
    return unlocked;
  }

  const clearPending = (mode = 'resolve', error = null) => {
    const current = pending;
    pending = null;
    if (!current) return;
    current.cleanup();
    if (mode === 'reject') current.reject(error || new Error('Воспроизведение прервано'));
    else current.resolve();
  };

  return {
    get unlocked() { return unlocked; },
    get element() { return ensureElement(); },

    // Call this synchronously from a real user gesture (click/tap/keydown).
    // Concurrent calls (the document-wide listener and the banner click fire
    // together) share one attempt instead of interrupting each other.
    unlock() {
      if (unlocked) return Promise.resolve(true);
      if (unlocking) return unlocking;
      unlocking = runUnlock().finally(() => { unlocking = null; });
      return unlocking;
    },

    // Resolves when the clip finishes; rejects with the browser error when the
    // browser refuses to start it, so callers can offer the unlock button.
    async play(url, { rate = 1 } = {}) {
      const el = ensureElement();
      clearPending('resolve');
      try { el.pause(); } catch {}
      el.src = url;
      try { el.load(); } catch {}
      el.playbackRate = rate;
      await el.play();
      markUnlocked();
      try { el.playbackRate = rate; } catch {}
      return new Promise((resolve, reject) => {
        const onEnded = () => clearPending('resolve');
        const onError = () => clearPending('reject', new Error('Аудио не загрузилось'));
        const cleanup = () => {
          el.removeEventListener('ended', onEnded);
          el.removeEventListener('error', onError);
        };
        pending = { resolve, reject, cleanup };
        el.addEventListener('ended', onEnded);
        el.addEventListener('error', onError);
        // A very short clip can finish before the listeners are attached.
        if (el.ended) clearPending('resolve');
      });
    },

    stop() {
      clearPending('resolve');
      if (element) {
        try { element.pause(); } catch {}
      }
      if ('speechSynthesis' in window) {
        try { speechSynthesis.cancel(); } catch {}
      }
    }
  };
}

// Watches for any interaction anywhere on the page and uses it to unlock audio,
// even if the learner never presses the unlock banner. It keeps watching until
// an attempt actually succeeds.
export function unlockOnFirstGesture(gate, done = () => {}) {
  const events = ['pointerdown', 'touchstart', 'keydown'];
  const detach = () => events.forEach((name) => document.removeEventListener(name, handler, true));
  function handler() {
    Promise.resolve(gate.unlock())
      .then(() => {
        // A failed attempt keeps the listeners alive so the next tap can retry.
        if (!gate.unlocked) return;
        detach();
        done(true);
      })
      .catch(() => {});
  }
  events.forEach((name) => document.addEventListener(name, handler, true));
  return detach;
}

// getVoices() is empty on the first call in Chrome — the list arrives later via
// the voiceschanged event, which is why German phrases used to be read out with
// a Russian or English voice.
export async function loadGermanVoice() {
  if (!('speechSynthesis' in window)) return null;
  let voices = speechSynthesis.getVoices();
  if (!voices.length) {
    voices = await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(speechSynthesis.getVoices());
      };
      speechSynthesis.addEventListener?.('voiceschanged', finish, { once: true });
      setTimeout(finish, 1500);
    });
  }
  const german = voices.filter((voice) => voice.lang?.toLowerCase().startsWith('de'));
  return german.find((voice) => voice.localService) || german[0] || null;
}

export function speakWithBrowser(text, rate = 1, voice = null) {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) return reject(new Error('Голос браузера не поддерживается'));
    let settled = false;
    let keepAlive = 0;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearInterval(keepAlive);
      clearTimeout(watchdog);
      if (error) reject(error); else resolve();
    };
    try { speechSynthesis.cancel(); } catch {}
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = Math.max(0.6, Math.min(1.1, rate));
    if (voice) utterance.voice = voice;
    utterance.onend = () => finish();
    utterance.onerror = (event) => finish(
      event?.error === 'not-allowed'
        ? Object.assign(new Error('Браузер заблокировал голос'), { name: 'NotAllowedError' })
        : new Error('Голос браузера недоступен')
    );
    // Chrome silently stops long utterances after ~15s unless nudged, and it
    // sometimes never fires onend at all — the watchdog keeps the UI moving.
    keepAlive = setInterval(() => { try { speechSynthesis.resume(); } catch {} }, 9000);
    const watchdog = setTimeout(() => finish(), Math.max(8000, text.length * 140));
    speechSynthesis.speak(utterance);
  });
}
