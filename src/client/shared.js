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
// Whisper and returns the recognised text.
export async function transcribeAudio(blob, { token = '', roomCode = '' } = {}) {
  const response = await fetch(`/api/stt/transcribe?room=${encodeURIComponent(roomCode)}`, {
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
  speechThreshold = 0.018,
  silenceHangoverMs = 850,
  minSpeechMs = 350,
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

  let recorder = null;
  let chunks = [];
  let recording = false;
  let segmentStartAt = 0;
  let lastVoiceAt = 0;
  let segmentValid = false;

  const startSegment = (now) => {
    recording = true;
    segmentStartAt = now;
    lastVoiceAt = now;
    segmentValid = false;
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
      const shouldEmit = segmentValid && !paused && !stopped;
      onState('listening');
      if (!shouldEmit) return;
      const blob = new Blob(collected, { type });
      if (blob.size < 1200) return;
      onState('processing');
      Promise.resolve()
        .then(() => onSegment(blob))
        .catch(() => {})
        .finally(() => { if (!recording && !stopped) onState('listening'); });
    };
    try { recorder.start(); } catch { recording = false; }
    onState('speaking');
  };

  const finishSegment = (valid) => {
    if (!recording) return;
    recording = false;
    segmentValid = valid;
    try {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    } catch {}
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

    if (!paused) {
      const now = performance.now();
      const voiced = rms >= speechThreshold;
      if (voiced) lastVoiceAt = now;
      if (!recording && voiced) {
        startSegment(now);
      } else if (recording) {
        const duration = now - segmentStartAt;
        const sinceVoice = now - lastVoiceAt;
        if (duration >= maxSegmentMs) finishSegment(duration >= minSpeechMs);
        else if (sinceVoice >= silenceHangoverMs) finishSegment(duration - sinceVoice >= minSpeechMs);
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
      if (recording) finishSegment(false);
    },
    resume() {
      paused = false;
      lastVoiceAt = performance.now();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      if (recording) finishSegment(false);
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
