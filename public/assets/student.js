// src/client/shared.js
var storageKeys = {
  teacherToken: "glc.teacherToken",
  studentToken: "glc.studentToken",
  studentRoom: "glc.studentRoom"
};
async function api(path, { method = "GET", token = "", body, headers = {} } = {}) {
  const response = await fetch(path, {
    method,
    headers: {
      ...body !== void 0 ? { "Content-Type": "application/json" } : {},
      ...token ? { Authorization: `Bearer ${token}` } : {},
      ...headers
    },
    body: body === void 0 ? void 0 : JSON.stringify(body)
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(payload?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}
function $(selector, root = document) {
  return root.querySelector(selector);
}
function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function toast(message, kind = "info", duration = 3e3) {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.append(stack);
  }
  const node = document.createElement("div");
  node.className = `toast ${kind}`;
  node.textContent = message;
  stack.append(node);
  requestAnimationFrame(() => node.classList.add("show"));
  setTimeout(() => {
    node.classList.remove("show");
    setTimeout(() => node.remove(), 220);
  }, duration);
}
function setBusy(button, busy, busyLabel = "\u041F\u043E\u0434\u043E\u0436\u0434\u0438\u0442\u0435\u2026") {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
    button.classList.add("busy");
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    button.classList.remove("busy");
  }
}
function getQuery() {
  return Object.fromEntries(new URLSearchParams(location.search));
}
var mediaStorageKeys = {
  teacherMic: "glc.teacherMicDevice",
  studentMic: "glc.studentMicDevice"
};
function canUseMicrophone() {
  return Boolean(navigator.mediaDevices?.getUserMedia && navigator.mediaDevices?.enumerateDevices);
}
async function refreshMicrophoneSelect(select, preferredDeviceId = "") {
  if (!select) return [];
  if (!canUseMicrophone()) {
    select.innerHTML = '<option value="">\u041C\u0438\u043A\u0440\u043E\u0444\u043E\u043D\u044B \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u044E\u0442\u0441\u044F</option>';
    select.disabled = true;
    return [];
  }
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "audioinput");
  const current = preferredDeviceId || select.value || "";
  const options = ['<option value="">\u0421\u0438\u0441\u0442\u0435\u043C\u043D\u044B\u0439 \u043C\u0438\u043A\u0440\u043E\u0444\u043E\u043D \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E</option>'];
  devices.forEach((device, index) => {
    const label = device.label || `\u041C\u0438\u043A\u0440\u043E\u0444\u043E\u043D ${index + 1}`;
    options.push(`<option value="${esc(device.deviceId)}">${esc(label)}</option>`);
  });
  select.innerHTML = options.join("");
  select.disabled = false;
  if (current && devices.some((device) => device.deviceId === current)) select.value = current;
  else select.value = "";
  return devices;
}
function pickRecorderMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4"
  ];
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return "";
}
async function transcribeAudio(blob, { token = "", roomCode = "" } = {}) {
  const response = await fetch(`/api/stt/transcribe?room=${encodeURIComponent(roomCode)}`, {
    method: "POST",
    headers: {
      "Content-Type": blob.type || "audio/webm",
      ...token ? { Authorization: `Bearer ${token}` } : {}
    },
    body: blob
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
  return String(payload?.text || "").trim();
}
async function startVoiceCapture({
  deviceId = "",
  fill,
  value,
  signal,
  onDeviceResolved,
  onSegment = async () => {
  },
  onState = () => {
  },
  speechThreshold = 0.018,
  silenceHangoverMs = 850,
  minSpeechMs = 350,
  maxSegmentMs = 15e3
} = {}) {
  if (!canUseMicrophone()) throw new Error("\u0411\u0440\u0430\u0443\u0437\u0435\u0440 \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F \u043A \u043C\u0438\u043A\u0440\u043E\u0444\u043E\u043D\u0443");
  if (typeof MediaRecorder === "undefined") throw new Error("\u0417\u0430\u043F\u0438\u0441\u044C \u0430\u0443\u0434\u0438\u043E \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u043E\u043C");
  const audio = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    ...deviceId ? { deviceId: { ideal: deviceId } } : {}
  };
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
  } catch (error) {
    if (!deviceId || !["OverconstrainedError", "NotFoundError"].includes(error?.name)) throw error;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      video: false
    });
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    stream.getTracks().forEach((track2) => track2.stop());
    throw new Error("Web Audio API \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F");
  }
  const context = new AudioContextClass();
  if (context.state === "suspended") await context.resume();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.72;
  source.connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);
  const mimeType = pickRecorderMimeType();
  const track = stream.getAudioTracks()[0];
  const resolvedDeviceId = track?.getSettings?.().deviceId || deviceId || "";
  onDeviceResolved?.({ deviceId: resolvedDeviceId, label: track?.label || "" });
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
      const type = recorder?.mimeType || mimeType || "audio/webm";
      const shouldEmit = segmentValid && !paused && !stopped;
      onState("listening");
      if (!shouldEmit) return;
      const blob = new Blob(collected, { type });
      if (blob.size < 1200) return;
      onState("processing");
      Promise.resolve().then(() => onSegment(blob)).catch(() => {
      }).finally(() => {
        if (!recording && !stopped) onState("listening");
      });
    };
    try {
      recorder.start();
    } catch {
      recording = false;
    }
    onState("speaking");
  };
  const finishSegment = (valid) => {
    if (!recording) return;
    recording = false;
    segmentValid = valid;
    try {
      if (recorder && recorder.state !== "inactive") recorder.stop();
    } catch {
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
    const boosted = Math.min(1, Math.max(0, (rms - 8e-3) * 8.5));
    smoothed = Math.max(boosted, smoothed * 0.82);
    const percent = Math.round(smoothed * 100);
    if (fill) {
      fill.style.transform = `scaleX(${smoothed})`;
      fill.parentElement?.classList.toggle("receiving", percent >= 4);
    }
    if (value) value.textContent = `${percent}%`;
    if (signal) {
      signal.textContent = percent >= 4 ? "\u0417\u0432\u0443\u043A \u043F\u043E\u0441\u0442\u0443\u043F\u0430\u0435\u0442" : "\u041E\u0436\u0438\u0434\u0430\u0435\u043C \u0437\u0432\u0443\u043A";
      signal.classList.toggle("active", percent >= 4);
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
    get paused() {
      return paused;
    },
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
      try {
        source.disconnect();
      } catch {
      }
      try {
        analyser.disconnect();
      } catch {
      }
      stream.getTracks().forEach((item) => item.stop());
      context.close().catch(() => {
      });
      if (fill) {
        fill.style.transform = "scaleX(0)";
        fill.parentElement?.classList.remove("receiving");
      }
      if (value) value.textContent = "0%";
      if (signal) {
        signal.textContent = "\u041C\u0438\u043A\u0440\u043E\u0444\u043E\u043D \u043D\u0435 \u0430\u043A\u0442\u0438\u0432\u0435\u043D";
        signal.classList.remove("active");
      }
    }
  };
}

// src/client/student.js
var query = getQuery();
var state = {
  roomCode: String(query.room || localStorage.getItem(storageKeys.studentRoom) || "").toUpperCase(),
  token: String(query.token || localStorage.getItem(storageKeys.studentToken) || ""),
  session: null,
  lesson: null,
  profile: null,
  config: null,
  socket: null,
  capture: null,
  micStarted: false,
  currentSpeech: null,
  currentAudio: null,
  playing: false,
  committedHistory: [],
  unlocked: false,
  selectedMicId: localStorage.getItem(mediaStorageKeys.studentMic) || "",
  micRestarting: false
};
var els = {};
document.addEventListener("DOMContentLoaded", boot);
function cacheElements() {
  Object.assign(els, {
    joinView: $("#joinView"),
    lessonView: $("#lessonView"),
    joinForm: $("#joinForm"),
    joinCode: $("#joinCode"),
    joinPin: $("#joinPin"),
    joinButton: $("#joinButton"),
    roomLabel: $("#roomLabel"),
    studentName: $("#studentName"),
    lessonTitle: $("#lessonTitle"),
    levelLabel: $("#levelLabel"),
    connectionStatus: $("#studentConnectionStatus"),
    micStatus: $("#micStatus"),
    micSelect: $("#studentMicSelect"),
    micMeterFill: $("#studentMicMeterFill"),
    micMeterValue: $("#studentMicMeterValue"),
    micSignal: $("#studentMicSignal"),
    startMicButton: $("#startMicButton"),
    stopMicButton: $("#stopMicButton"),
    liveTranscript: $("#liveTranscript"),
    committedTranscript: $("#committedTranscript"),
    typedForm: $("#typedForm"),
    typedInput: $("#typedInput"),
    sendTypedButton: $("#sendTypedButton"),
    listenCard: $("#listenCard"),
    listenState: $("#listenState"),
    repeatButton: $("#repeatButton"),
    slowerButton: $("#slowerButton"),
    keywordButton: $("#keywordButton"),
    starterButton: $("#starterButton"),
    transcriptButton: $("#transcriptButton"),
    revealBox: $("#revealBox"),
    revealLabel: $("#revealLabel"),
    revealText: $("#revealText"),
    endedPanel: $("#endedPanel"),
    endedSummary: $("#endedSummary"),
    audioUnlock: $("#audioUnlock")
  });
}
async function boot() {
  cacheElements();
  bindEvents();
  els.joinCode.value = state.roomCode;
  try {
    state.config = await api("/api/config");
  } catch {
  }
  if (state.roomCode && state.token) {
    try {
      await loadSession();
      enterLesson();
      connectSocket();
      return;
    } catch {
      localStorage.removeItem(storageKeys.studentToken);
      state.token = "";
    }
  }
  showJoin();
}
function bindEvents() {
  els.joinForm.addEventListener("submit", joinRoom);
  els.startMicButton.addEventListener("click", startMicrophone);
  els.stopMicButton.addEventListener("click", stopMicrophone);
  els.micSelect.addEventListener("change", async () => {
    state.selectedMicId = els.micSelect.value;
    localStorage.setItem(mediaStorageKeys.studentMic, state.selectedMicId);
    if (state.micStarted && !state.micRestarting) {
      state.micRestarting = true;
      stopMicrophone();
      await new Promise((resolve) => setTimeout(resolve, 180));
      await startMicrophone();
      state.micRestarting = false;
      toast("\u041C\u0438\u043A\u0440\u043E\u0444\u043E\u043D \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0451\u043D", "success");
    }
  });
  navigator.mediaDevices?.addEventListener?.("devicechange", () => refreshStudentMicrophones());
  els.typedForm.addEventListener("submit", sendTyped);
  els.repeatButton.addEventListener("click", () => replay(1, "repeat"));
  els.slowerButton.addEventListener("click", () => replay(0.72, "slower"));
  els.keywordButton.addEventListener("click", () => reveal("keyword"));
  els.starterButton.addEventListener("click", () => reveal("starter"));
  els.transcriptButton.addEventListener("click", () => reveal("transcript"));
  els.audioUnlock.addEventListener("click", () => {
    state.unlocked = true;
    els.audioUnlock.hidden = true;
    const audio = new Audio();
    audio.play().catch(() => {
    });
    toast("\u0417\u0432\u0443\u043A \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D", "success");
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
  if (!code || !pin) return toast("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043A\u043E\u0434 \u043A\u043E\u043C\u043D\u0430\u0442\u044B \u0438 PIN", "error");
  setBusy(els.joinButton, true, "\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0430\u0435\u043C\u0441\u044F\u2026");
  try {
    const result = await api("/api/sessions/join", { method: "POST", body: { code, pin } });
    state.roomCode = code;
    state.token = result.studentToken;
    localStorage.setItem(storageKeys.studentRoom, code);
    localStorage.setItem(storageKeys.studentToken, state.token);
    await loadSession();
    enterLesson();
    connectSocket();
  } catch (error) {
    toast(error.message, "error");
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
  els.studentName.textContent = state.profile?.name || "\u0423\u0447\u0435\u043D\u0438\u043A";
  els.lessonTitle.textContent = `${state.lesson?.id || ""}. ${state.lesson?.title || "\u0423\u0440\u043E\u043A \u043D\u0435\u043C\u0435\u0446\u043A\u043E\u0433\u043E"}`;
  els.levelLabel.textContent = state.profile?.level || "A0";
  els.listenCard.classList.remove("speaking");
  setConnection("\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0430\u0435\u043C\u0441\u044F\u2026", "pending");
  refreshStudentMicrophones();
  if (!state.config?.sttEnabled) {
    els.startMicButton.disabled = true;
    els.micStatus.textContent = "\u0420\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u043D\u0438\u0435 \u0440\u0435\u0447\u0438 \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u043E \u2014 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u0442\u0435\u043A\u0441\u0442\u043E\u0432\u043E\u0435 \u043F\u043E\u043B\u0435";
    els.micStatus.className = "status-badge warn";
  }
}
function connectSocket() {
  state.socket?.disconnect();
  state.socket = io({
    auth: { role: "student", roomCode: state.roomCode, token: state.token },
    transports: ["websocket", "polling"]
  });
  state.socket.on("connect", () => setConnection("\u0421\u0432\u044F\u0437\u044C \u0441 \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u0435\u043C \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u0430", "ok"));
  state.socket.on("disconnect", () => setConnection("\u0421\u0432\u044F\u0437\u044C \u043F\u0440\u0435\u0440\u0432\u0430\u043D\u0430 \u2014 \u043F\u0435\u0440\u0435\u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0430\u0435\u043C\u0441\u044F", "error"));
  state.socket.on("connect_error", (error) => setConnection(`\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F: ${error.message}`, "error"));
  state.socket.on("session:snapshot", (payload) => {
    state.session = payload.session;
    state.lesson = payload.lesson || state.lesson;
  });
  state.socket.on("student:speak", handleSpeech);
  state.socket.on("session:ended", ({ summary }) => {
    stopMicrophone();
    els.endedPanel.hidden = false;
    els.endedSummary.textContent = summary?.summary_ru || "\u0423\u0440\u043E\u043A \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D. \u0421\u043F\u0430\u0441\u0438\u0431\u043E!";
    els.listenCard.hidden = true;
    toast("\u0423\u0440\u043E\u043A \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D", "success");
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
    els.micSelect.innerHTML = '<option value="">\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0441\u043F\u0438\u0441\u043E\u043A</option>';
    els.micSelect.disabled = true;
  }
}
async function startMicrophone() {
  if (state.micStarted || !state.socket?.connected) {
    if (!state.socket?.connected) toast("\u0414\u043E\u0436\u0434\u0438\u0442\u0435\u0441\u044C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F \u043A \u043A\u043E\u043C\u043D\u0430\u0442\u0435", "error");
    return;
  }
  setBusy(els.startMicButton, true, "\u0417\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u043C\u2026");
  try {
    state.unlocked = true;
    els.audioUnlock.hidden = true;
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
        if (!state.micStarted || state.playing) return;
        if (phase === "processing") els.liveTranscript.textContent = "\u0420\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u044E\u2026";
        else if (phase === "speaking") els.liveTranscript.textContent = "\u0421\u043B\u0443\u0448\u0430\u044E\u2026";
        else els.liveTranscript.textContent = "\u0413\u043E\u0432\u043E\u0440\u0438\u0442\u0435\u2026";
      },
      onSegment: (blob) => handleStudentSegment(blob)
    });
    await refreshStudentMicrophones();
    state.micStarted = true;
    els.startMicButton.hidden = true;
    els.stopMicButton.hidden = false;
    els.micStatus.textContent = "\u041C\u0438\u043A\u0440\u043E\u0444\u043E\u043D \u0441\u043B\u0443\u0448\u0430\u0435\u0442 \u043D\u0435\u043C\u0435\u0446\u043A\u0443\u044E \u0440\u0435\u0447\u044C";
    els.micStatus.className = "status-badge ok";
    els.liveTranscript.textContent = "\u0413\u043E\u0432\u043E\u0440\u0438\u0442\u0435\u2026";
  } catch (error) {
    state.capture?.stop();
    state.capture = null;
    toast(`\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0432\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043C\u0438\u043A\u0440\u043E\u0444\u043E\u043D: ${error.message}`, "error", 6e3);
  } finally {
    setBusy(els.startMicButton, false);
  }
}
async function handleStudentSegment(blob) {
  if (state.playing) return;
  try {
    const text = await transcribeAudio(blob, { token: state.token, roomCode: state.roomCode });
    if (!text || state.playing) {
      if (state.micStarted && !state.playing) els.liveTranscript.textContent = "\u0413\u043E\u0432\u043E\u0440\u0438\u0442\u0435\u2026";
      return;
    }
    els.liveTranscript.textContent = text;
    state.socket?.emit("student:partial", { text });
    commitText(text);
  } catch (error) {
    els.micStatus.textContent = `\u041E\u0448\u0438\u0431\u043A\u0430 \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u043D\u0438\u044F: ${error.message}`;
    els.micStatus.className = "status-badge error";
  }
}
function stopMicrophone() {
  state.capture?.stop();
  state.capture = null;
  state.micStarted = false;
  els.startMicButton.hidden = false;
  els.stopMicButton.hidden = true;
  els.micStatus.textContent = "\u041C\u0438\u043A\u0440\u043E\u0444\u043E\u043D \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D";
  els.micStatus.className = "status-badge muted";
}
function sendTyped(event) {
  event.preventDefault();
  const text = els.typedInput.value.trim();
  if (!text) return;
  if (!state.socket?.connected) return toast("\u041D\u0435\u0442 \u0441\u0432\u044F\u0437\u0438 \u0441 \u043A\u043E\u043C\u043D\u0430\u0442\u043E\u0439", "error");
  setBusy(els.sendTypedButton, true, "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u043C\u2026");
  commitText(text, () => {
    els.typedInput.value = "";
    setBusy(els.sendTypedButton, false);
  });
}
function commitText(text, done = () => {
}) {
  state.committedHistory.push(text);
  state.committedHistory = state.committedHistory.slice(-8);
  els.committedTranscript.innerHTML = state.committedHistory.map((item) => `<span>${esc(item)}</span>`).join("");
  els.liveTranscript.textContent = "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E. \u041F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044C \u0433\u043E\u0442\u043E\u0432\u0438\u0442 \u043E\u0442\u0432\u0435\u0442\u2026";
  state.socket.emit("student:committed", { text }, (response) => {
    if (!response?.ok) toast(response?.error || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0440\u0435\u043F\u043B\u0438\u043A\u0443", "error");
    done();
  });
}
async function handleSpeech(payload) {
  state.currentSpeech = payload;
  resetReveal();
  els.listenCard.hidden = false;
  els.listenCard.classList.add("speaking");
  els.listenState.textContent = payload.source === "teacher_mic" ? "\u041A\u043E\u043C\u0430\u043D\u0434\u0430 \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044F" : "\u0421\u043B\u0443\u0448\u0430\u0439\u0442\u0435 \u0438 \u043E\u0442\u0432\u0435\u0442\u044C\u0442\u0435";
  await playSpeech(payload, Number(payload.playbackRate || 1));
}
async function playSpeech(payload, rate = 1) {
  if (!payload?.text) return;
  stopCurrentAudio();
  state.playing = true;
  state.capture?.pause();
  els.listenCard.classList.add("speaking");
  els.listenState.textContent = payload.source === "teacher_mic" ? "\u0421\u043B\u0443\u0448\u0430\u0439\u0442\u0435 \u043A\u043E\u043C\u0430\u043D\u0434\u0443\u2026" : "\u0421\u043B\u0443\u0448\u0430\u0439\u0442\u0435\u2026";
  try {
    if (payload.mode === "elevenlabs" && payload.audioUrl) {
      const audio = new Audio(payload.audioUrl);
      state.currentAudio = audio;
      audio.playbackRate = rate;
      audio.preload = "auto";
      await audio.play();
      await new Promise((resolve, reject) => {
        audio.onended = resolve;
        audio.onerror = () => reject(new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0441\u0442\u0438 \u0430\u0443\u0434\u0438\u043E"));
      });
    } else {
      await speakWithBrowser(payload.text, rate);
    }
    els.listenState.textContent = payload.source === "teacher_mic" ? "\u0412\u044B\u043F\u043E\u043B\u043D\u0438\u0442\u0435 \u043A\u043E\u043C\u0430\u043D\u0434\u0443 \u0438\u043B\u0438 \u043E\u0442\u0432\u0435\u0442\u044C\u0442\u0435" : "\u0422\u0435\u043F\u0435\u0440\u044C \u043E\u0442\u0432\u0435\u0442\u044C\u0442\u0435 \u043F\u043E-\u043D\u0435\u043C\u0435\u0446\u043A\u0438";
  } catch (error) {
    els.listenState.textContent = "\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C\xBB, \u0447\u0442\u043E\u0431\u044B \u0432\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0437\u0432\u0443\u043A";
    els.audioUnlock.hidden = false;
    toast(error.message, "error");
  } finally {
    state.playing = false;
    state.currentAudio = null;
    els.listenCard.classList.remove("speaking");
    setTimeout(() => state.capture?.resume(), 220);
  }
}
function speakWithBrowser(text, rate) {
  return new Promise((resolve, reject) => {
    if (!("speechSynthesis" in window)) return reject(new Error("\u0413\u043E\u043B\u043E\u0441 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430 \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F"));
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "de-DE";
    utterance.rate = Math.max(0.6, Math.min(1.1, rate));
    const germanVoice = speechSynthesis.getVoices().find((voice) => voice.lang?.toLowerCase().startsWith("de"));
    if (germanVoice) utterance.voice = germanVoice;
    utterance.onend = resolve;
    utterance.onerror = () => reject(new Error("\u0413\u043E\u043B\u043E\u0441 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D"));
    speechSynthesis.speak(utterance);
  });
}
function stopCurrentAudio() {
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio.currentTime = 0;
  }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
function replay(rate, action) {
  if (!state.currentSpeech) return;
  state.socket?.emit("student:assist", { action });
  playSpeech(state.currentSpeech, rate);
}
function resetReveal() {
  els.revealBox.hidden = true;
  els.revealLabel.textContent = "";
  els.revealText.textContent = "";
}
function reveal(type) {
  if (!state.currentSpeech) return;
  const meta = state.currentSpeech.transcriptMeta || {};
  const content = type === "keyword" ? meta.keyword : type === "starter" ? meta.starter : meta.full || state.currentSpeech.text;
  const labels = { keyword: "\u041A\u043B\u044E\u0447\u0435\u0432\u043E\u0435 \u0441\u043B\u043E\u0432\u043E", starter: "\u041D\u0430\u0447\u0430\u043B\u043E \u043E\u0442\u0432\u0435\u0442\u0430", transcript: "\u041F\u043E\u043B\u043D\u044B\u0439 \u0442\u0440\u0430\u043D\u0441\u043A\u0440\u0438\u043F\u0442" };
  els.revealLabel.textContent = labels[type];
  els.revealText.textContent = content || "\u2014";
  els.revealBox.hidden = false;
  state.socket?.emit("student:assist", { action: type });
}
//# sourceMappingURL=student.js.map
