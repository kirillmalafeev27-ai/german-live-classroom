// src/client/shared.js
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
function $$(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}
function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function parseList(value) {
  if (Array.isArray(value)) return [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))];
  return [...new Set(String(value || "").split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean))];
}
function formatList(value) {
  return (value || []).join("\n");
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
function copyText(text) {
  return navigator.clipboard?.writeText(text).catch(() => {
    const input = document.createElement("textarea");
    input.value = text;
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  });
}
function formatTime(value) {
  if (!value) return "\u2014";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}
function socketAck(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.timeout(3e4).emit(event, payload, (error, response) => {
      if (error) return reject(new Error("\u0421\u0435\u0440\u0432\u0435\u0440 \u043D\u0435 \u043E\u0442\u0432\u0435\u0442\u0438\u043B \u0432\u043E\u0432\u0440\u0435\u043C\u044F"));
      if (!response?.ok) return reject(new Error(response?.error || "\u041E\u043F\u0435\u0440\u0430\u0446\u0438\u044F \u043D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0430"));
      resolve(response);
    });
  });
}
function makePill(label, value, className = "") {
  return `<span class="meta-pill ${className}"><b>${esc(label)}</b> ${esc(value)}</span>`;
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

// src/client/teacher.js
var VARIANTS = [
  ["main", "\u041E\u0441\u043D\u043E\u0432\u043D\u043E\u0439"],
  ["simpler", "\u041F\u0440\u043E\u0449\u0435"],
  ["shorter", "\u041A\u043E\u0440\u043E\u0447\u0435"],
  ["yes_no", "Ja / Nein"],
  ["choice", "\u0412\u044B\u0431\u043E\u0440 A / B"],
  ["starter", "\u041D\u0430\u0447\u0430\u043B\u043E \u043E\u0442\u0432\u0435\u0442\u0430"],
  ["full_model", "\u041F\u043E\u043B\u043D\u044B\u0439 \u043E\u0431\u0440\u0430\u0437\u0435\u0446"],
  ["recast", "\u0418\u0441\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043C\u044F\u0433\u043A\u043E"],
  ["continue", "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C"],
  ["clarification", "\u0423\u0442\u043E\u0447\u043D\u0438\u0442\u044C"]
];
var state = {
  token: localStorage.getItem("glc.teacherToken") || "",
  config: null,
  curriculum: [],
  profiles: [],
  currentProfile: null,
  editingProfileId: null,
  selectedLessonId: 1,
  wordStates: /* @__PURE__ */ new Map(),
  room: null,
  roomSecrets: null,
  socket: null,
  candidate: null,
  selectedVariant: "main",
  selectedText: "",
  transcript: "",
  scaffoldLevel: 0,
  studentOnline: false,
  sessionEnded: false,
  teacherCapture: null,
  teacherMicStarted: false,
  teacherMicId: localStorage.getItem(mediaStorageKeys.teacherMic) || "",
  teacherCommandText: ""
};
var els = {};
document.addEventListener("DOMContentLoaded", boot);
async function boot() {
  cacheElements();
  bindStaticEvents();
  try {
    const [config, curriculumResult] = await Promise.all([
      api("/api/config"),
      api("/api/curriculum")
    ]);
    state.config = config;
    state.curriculum = curriculumResult.lessons || [];
    renderServiceStatus();
    renderLessonOptions();
    refreshTeacherMicrophones();
  } catch (error) {
    toast(`\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u043A\u043E\u043D\u0444\u0438\u0433\u0443\u0440\u0430\u0446\u0438\u044E: ${error.message}`, "error", 6e3);
  }
  if (state.token) {
    await enterApp();
  } else {
    showLogin();
  }
}
function cacheElements() {
  Object.assign(els, {
    loginView: $("#loginView"),
    appView: $("#appView"),
    loginForm: $("#loginForm"),
    loginPassword: $("#loginPassword"),
    loginButton: $("#loginButton"),
    logoutButton: $("#logoutButton"),
    serviceStatus: $("#serviceStatus"),
    profileList: $("#profileList"),
    newProfileButton: $("#newProfileButton"),
    deleteProfileButton: $("#deleteProfileButton"),
    profileForm: $("#profileForm"),
    profileTitle: $("#profileTitle"),
    profileName: $("#profileName"),
    profileLevel: $("#profileLevel"),
    profileSterility: $("#profileSterility"),
    profileMaxWords: $("#profileMaxWords"),
    profileMaxNewWords: $("#profileMaxNewWords"),
    lessonSelect: $("#lessonSelect"),
    lessonDetails: $("#lessonDetails"),
    vocabularySearch: $("#vocabularySearch"),
    vocabularyChips: $("#vocabularyChips"),
    vocabLegend: $("#vocabLegend"),
    knownWordsInput: $("#knownWordsInput"),
    learningWordsInput: $("#learningWordsInput"),
    unknownWordsInput: $("#unknownWordsInput"),
    knownGrammarInput: $("#knownGrammarInput"),
    repeatTopicsInput: $("#repeatTopicsInput"),
    learningGoalsInput: $("#learningGoalsInput"),
    avoidInput: $("#avoidInput"),
    notesInput: $("#notesInput"),
    saveProfileButton: $("#saveProfileButton"),
    createRoomButton: $("#createRoomButton"),
    roomEmpty: $("#roomEmpty"),
    roomPanel: $("#roomPanel"),
    roomCode: $("#roomCode"),
    roomPin: $("#roomPin"),
    roomStudentUrl: $("#roomStudentUrl"),
    copyRoomLinkButton: $("#copyRoomLinkButton"),
    connectionStatus: $("#connectionStatus"),
    studentStatus: $("#studentStatus"),
    modelStatus: $("#modelStatus"),
    partialTranscript: $("#partialTranscript"),
    transcriptInput: $("#transcriptInput"),
    teacherInstruction: $("#teacherInstruction"),
    generateButton: $("#generateButton"),
    aiStatus: $("#aiStatus"),
    interpretation: $("#interpretation"),
    correctedStudent: $("#correctedStudent"),
    candidateEditor: $("#candidateEditor"),
    candidateMeta: $("#candidateMeta"),
    variantsGrid: $("#variantsGrid"),
    speakButton: $("#speakButton"),
    slowerSpeakButton: $("#slowerSpeakButton"),
    scaffoldRow: $("#scaffoldRow"),
    assessmentRow: $("#assessmentRow"),
    sessionLog: $("#sessionLog"),
    endSessionButton: $("#endSessionButton"),
    summaryPanel: $("#summaryPanel"),
    summaryText: $("#summaryText"),
    curriculumQuick: $("#curriculumQuick"),
    teacherMicSelect: $("#teacherMicSelect"),
    teacherMicStatus: $("#teacherMicStatus"),
    teacherMicStartButton: $("#teacherMicStartButton"),
    teacherMicStopButton: $("#teacherMicStopButton"),
    teacherMicClearButton: $("#teacherMicClearButton"),
    teacherMicSendButton: $("#teacherMicSendButton"),
    teacherMicPartial: $("#teacherMicPartial"),
    teacherCommandInput: $("#teacherCommandInput"),
    teacherMicMeterFill: $("#teacherMicMeterFill"),
    teacherMicMeterValue: $("#teacherMicMeterValue"),
    teacherMicSignal: $("#teacherMicSignal")
  });
}
function bindStaticEvents() {
  els.loginForm.addEventListener("submit", login);
  els.logoutButton.addEventListener("click", logout);
  els.newProfileButton.addEventListener("click", () => editProfile(null));
  els.deleteProfileButton.addEventListener("click", deleteCurrentProfile);
  els.profileForm.addEventListener("submit", saveProfile);
  els.lessonSelect.addEventListener("change", () => {
    state.selectedLessonId = Number(els.lessonSelect.value || 1);
    renderLessonDetails();
    renderVocabulary();
  });
  els.vocabularySearch.addEventListener("input", renderVocabulary);
  els.createRoomButton.addEventListener("click", createRoom);
  els.copyRoomLinkButton.addEventListener("click", async () => {
    await copyText(els.roomStudentUrl.value);
    toast("\u0421\u0441\u044B\u043B\u043A\u0430 \u0443\u0447\u0435\u043D\u0438\u043A\u0430 \u0441\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u0430", "success");
  });
  els.generateButton.addEventListener("click", () => generate("AUTO"));
  els.speakButton.addEventListener("click", () => speak(1));
  els.slowerSpeakButton.addEventListener("click", () => speak(0.76));
  els.candidateEditor.addEventListener("input", () => {
    state.selectedText = els.candidateEditor.value.trim();
    state.selectedVariant = "manual";
    if (state.socket?.connected && state.selectedText) {
      state.socket.emit("teacher:candidate", { text: state.selectedText, variant: "manual" });
    }
    updateSpeakState();
  });
  els.endSessionButton.addEventListener("click", endSession);
  els.teacherMicStartButton.addEventListener("click", startTeacherMicrophone);
  els.teacherMicStopButton.addEventListener("click", stopTeacherMicrophone);
  els.teacherMicClearButton.addEventListener("click", clearTeacherCommand);
  els.teacherMicSendButton.addEventListener("click", sendTeacherVoiceCommand);
  els.teacherCommandInput.addEventListener("input", () => {
    state.teacherCommandText = els.teacherCommandInput.value.trim();
    updateTeacherMicSendState();
  });
  els.teacherMicSelect.addEventListener("change", async () => {
    state.teacherMicId = els.teacherMicSelect.value;
    localStorage.setItem(mediaStorageKeys.teacherMic, state.teacherMicId);
    if (state.teacherMicStarted && !state.teacherMicRestarting) {
      state.teacherMicRestarting = true;
      stopTeacherMicrophone();
      await new Promise((resolve) => setTimeout(resolve, 180));
      await startTeacherMicrophone();
      state.teacherMicRestarting = false;
      toast("\u041C\u0438\u043A\u0440\u043E\u0444\u043E\u043D \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044F \u043F\u0435\u0440\u0435\u043A\u043B\u044E\u0447\u0451\u043D", "success");
    }
  });
  navigator.mediaDevices?.addEventListener?.("devicechange", () => refreshTeacherMicrophones());
  $$(".semantic-action").forEach((button) => {
    button.addEventListener("click", () => generate(button.dataset.action));
  });
  $$(".transform-action").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.variant && state.candidate?.[button.dataset.variant]) {
        selectVariant(button.dataset.variant);
      } else {
        runTransform(button.dataset.instruction);
      }
    });
  });
  els.assessmentRow.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-assessment]");
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
  setBusy(els.loginButton, true, "\u0412\u0445\u043E\u0434\u0438\u043C\u2026");
  try {
    const result = await api("/api/auth/login", {
      method: "POST",
      body: { password: els.loginPassword.value }
    });
    state.token = result.token;
    localStorage.setItem("glc.teacherToken", state.token);
    els.loginPassword.value = "";
    await enterApp();
  } catch (error) {
    toast(error.message, "error");
  } finally {
    setBusy(els.loginButton, false);
  }
}
function logout() {
  stopTeacherMicrophone();
  state.socket?.disconnect();
  state.socket = null;
  state.token = "";
  localStorage.removeItem("glc.teacherToken");
  localStorage.removeItem("glc.teacherRoom");
  showLogin();
}
async function enterApp() {
  try {
    await loadProfiles();
    els.loginView.hidden = true;
    els.appView.hidden = false;
    const lastRoom = localStorage.getItem("glc.teacherRoom");
    if (lastRoom) {
      try {
        const result = await api(`/api/sessions/${encodeURIComponent(lastRoom)}`, { token: state.token });
        if (result.session?.status === "active") {
          state.room = result.session;
          state.currentProfile = state.profiles.find((item) => item.id === result.session.profileId) || state.currentProfile;
          state.selectedLessonId = Number(result.session.lessonId);
          renderRoom();
          connectTeacherSocket(lastRoom);
        }
      } catch {
        localStorage.removeItem("glc.teacherRoom");
      }
    }
  } catch (error) {
    if (error.status === 401) return logout();
    toast(error.message, "error", 6e3);
  }
}
async function loadProfiles(selectId = null) {
  const result = await api("/api/profiles", { token: state.token });
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
    ["AITUNNEL", state.config.aitunnelEnabled ? `${state.config.model}` : "\u0434\u0435\u043C\u043E"],
    ["Whisper", state.config.sttEnabled ? state.config.sttModel || "\u0433\u043E\u0442\u043E\u0432" : "\u0440\u0443\u0447\u043D\u043E\u0439 \u0432\u0432\u043E\u0434"],
    ["\u0413\u043E\u043B\u043E\u0441", state.config.elevenlabsTtsEnabled ? state.config.ttsModel : "\u0433\u043E\u043B\u043E\u0441 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430"]
  ];
  els.serviceStatus.innerHTML = entries.map(([label, value]) => makePill(label, value, value === "\u0434\u0435\u043C\u043E" || value === "\u0440\u0443\u0447\u043D\u043E\u0439 \u0432\u0432\u043E\u0434" ? "warn" : "ok")).join("");
  els.modelStatus.textContent = state.config.aitunnelEnabled ? state.config.model : "AITUNNEL \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D \u2014 \u0434\u0435\u043C\u043E-\u0440\u0435\u0436\u0438\u043C";
  if (!state.config.sttEnabled) {
    els.teacherMicStartButton.disabled = true;
    els.teacherMicStatus.textContent = "\u0420\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u043D\u0438\u0435 \u0440\u0435\u0447\u0438 \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u043E";
    els.teacherMicStatus.className = "status-badge warn";
  }
}
function renderProfileList() {
  if (!state.profiles.length) {
    els.profileList.innerHTML = '<div class="empty-small">\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0443\u0447\u0435\u043D\u0438\u043A\u043E\u0432</div>';
    return;
  }
  els.profileList.innerHTML = state.profiles.map((profile) => {
    const active = profile.id === state.editingProfileId ? "active" : "";
    const total = Number(profile.progress?.turns || 0);
    return `<button type="button" class="profile-item ${active}" data-profile-id="${esc(profile.id)}">
      <span class="profile-avatar">${esc((profile.name || "?").slice(0, 1).toUpperCase())}</span>
      <span class="profile-item-copy"><b>${esc(profile.name)}</b><small>${esc(profile.level)} \xB7 ${total} \u043E\u0446\u0435\u043D\u0451\u043D\u043D\u044B\u0445 \u043E\u0442\u0432\u0435\u0442\u043E\u0432</small></span>
    </button>`;
  }).join("");
  $$(".profile-item", els.profileList).forEach((button) => {
    button.addEventListener("click", () => {
      const profile = state.profiles.find((item) => item.id === button.dataset.profileId);
      if (profile) editProfile(profile);
    });
  });
}
function editProfile(profile) {
  state.currentProfile = profile;
  state.editingProfileId = profile?.id || null;
  state.wordStates = /* @__PURE__ */ new Map();
  for (const word of profile?.knownWords || []) state.wordStates.set(word, "known");
  for (const word of profile?.learningWords || []) state.wordStates.set(word, "learning");
  for (const word of profile?.unknownWords || []) state.wordStates.set(word, "unknown");
  els.profileTitle.textContent = profile ? `\u041F\u0440\u043E\u0444\u0438\u043B\u044C: ${profile.name}` : "\u041D\u043E\u0432\u044B\u0439 \u0443\u0447\u0435\u043D\u0438\u043A";
  els.profileName.value = profile?.name || "";
  els.profileLevel.value = profile?.level || "A0";
  els.profileSterility.value = profile?.sterility || "high";
  els.profileMaxWords.value = profile?.maxWords ?? 6;
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
  els.notesInput.value = profile?.notes || "";
  els.deleteProfileButton.hidden = !profile;
  renderProfileList();
  renderLessonDetails();
  renderVocabulary();
}
function renderLessonOptions() {
  els.lessonSelect.innerHTML = state.curriculum.map(
    (lesson) => `<option value="${lesson.id}">${lesson.id}. ${esc(lesson.title)}</option>`
  ).join("");
  els.lessonSelect.value = String(state.selectedLessonId);
  els.curriculumQuick.innerHTML = state.curriculum.map(
    (lesson) => `<button type="button" class="lesson-mini" style="--lesson-color:${esc(lesson.color)}" data-lesson-id="${lesson.id}">
      <b>${lesson.id}</b><span>${esc(lesson.title)}</span>
    </button>`
  ).join("");
  $$(".lesson-mini", els.curriculumQuick).forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedLessonId = Number(button.dataset.lessonId);
      els.lessonSelect.value = String(state.selectedLessonId);
      renderLessonDetails();
      renderVocabulary();
      $("#profileEditorCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
  els.lessonDetails.style.setProperty("--lesson-color", lesson.color);
  els.lessonDetails.innerHTML = `<div class="lesson-detail-head"><span class="lesson-number">${lesson.id}</span><div><h3>${esc(lesson.title)}</h3><p>\u041A\u0443\u0440\u0441: \u0441\u0442\u0440. ${lesson.coursebookPage} \xB7 W\xF6rterliste \u0432 \xDCbungsbuch: PDF-\u0441\u0442\u0440. ${lesson.sourcePdfPage}</p></div></div>
    <div class="detail-grid">
      <div><b>\u0420\u0435\u0447\u0435\u0432\u044B\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F</b><p>${lesson.speechActs.map(esc).join(" \xB7 ")}</p></div>
      <div><b>\u0413\u0440\u0430\u043C\u043C\u0430\u0442\u0438\u043A\u0430</b><p>${lesson.grammar.map(esc).join(" \xB7 ")}</p></div>
      <div><b>\u0422\u0435\u043C\u044B</b><p>${lesson.themes.map(esc).join(" \xB7 ")}</p></div>
    </div>`;
}
function renderVocabulary() {
  const lesson = getLesson();
  if (!lesson) return;
  const search = els.vocabularySearch.value.trim().toLocaleLowerCase("de");
  const words = lesson.vocabulary.filter((word) => !search || word.toLocaleLowerCase("de").includes(search));
  els.vocabularyChips.innerHTML = words.map((word) => {
    const status = state.wordStates.get(word) || "none";
    const labels = { none: "", known: "\u0417\u041D\u0410\u0415\u0422", learning: "\u0423\u0427\u0418\u041C", unknown: "\u041D\u0415 \u0417\u041D\u0410\u0415\u0422" };
    return `<button type="button" class="vocab-chip ${status}" data-word="${esc(word)}" title="\u041D\u0430\u0436\u0438\u043C\u0430\u0439\u0442\u0435: \u0437\u043D\u0430\u0435\u0442 \u2192 \u0443\u0447\u0438\u043C \u2192 \u043D\u0435 \u0437\u043D\u0430\u0435\u0442 \u2192 \u0441\u0431\u0440\u043E\u0441">
      <span>${esc(word)}</span><small>${labels[status]}</small>
    </button>`;
  }).join("") || '<div class="empty-small">\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E</div>';
  $$(".vocab-chip", els.vocabularyChips).forEach((chip) => {
    chip.addEventListener("click", () => cycleWord(chip.dataset.word));
  });
  const counts = { known: 0, learning: 0, unknown: 0 };
  for (const word of lesson.vocabulary) {
    const status = state.wordStates.get(word);
    if (counts[status] !== void 0) counts[status] += 1;
  }
  els.vocabLegend.innerHTML = `<span class="legend known">\u0417\u043D\u0430\u0435\u0442: ${counts.known}</span><span class="legend learning">\u0423\u0447\u0438\u0442\u044C: ${counts.learning}</span><span class="legend unknown">\u041D\u0435 \u0437\u043D\u0430\u0435\u0442: ${counts.unknown}</span><span>\u0412\u0441\u0435\u0433\u043E: ${lesson.vocabulary.length}</span>`;
}
function cycleWord(word) {
  const order = ["none", "known", "learning", "unknown"];
  const current = state.wordStates.get(word) || "none";
  const next = order[(order.indexOf(current) + 1) % order.length];
  if (next === "none") state.wordStates.delete(word);
  else state.wordStates.set(word, next);
  syncTextInputsFromWordStates();
  renderVocabulary();
}
function syncTextInputsFromWordStates() {
  const customKnown = parseList(els.knownWordsInput.value).filter((word) => !isCurriculumWord(word));
  const customLearning = parseList(els.learningWordsInput.value).filter((word) => !isCurriculumWord(word));
  const customUnknown = parseList(els.unknownWordsInput.value).filter((word) => !isCurriculumWord(word));
  els.knownWordsInput.value = formatList([...customKnown, ...wordsWithState("known")]);
  els.learningWordsInput.value = formatList([...customLearning, ...wordsWithState("learning")]);
  els.unknownWordsInput.value = formatList([...customUnknown, ...wordsWithState("unknown")]);
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
  setBusy(button, true, "\u0421\u043E\u0445\u0440\u0430\u043D\u044F\u0435\u043C\u2026");
  try {
    const payload = collectProfilePayload();
    if (!payload.name) throw new Error("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0438\u043C\u044F \u0443\u0447\u0435\u043D\u0438\u043A\u0430");
    let result;
    if (state.editingProfileId) {
      result = await api(`/api/profiles/${state.editingProfileId}`, { method: "PATCH", token: state.token, body: payload });
    } else {
      result = await api("/api/profiles", { method: "POST", token: state.token, body: payload });
    }
    await loadProfiles(result.profile.id);
    toast("\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0451\u043D", "success");
  } catch (error) {
    toast(error.message, "error");
  } finally {
    setBusy(button, false);
  }
}
function collectProfilePayload() {
  const knownWords = new Set(parseList(els.knownWordsInput.value));
  const learningWords = new Set(parseList(els.learningWordsInput.value));
  const unknownWords = new Set(parseList(els.unknownWordsInput.value));
  for (const [word, status] of state.wordStates.entries()) {
    knownWords.delete(word);
    learningWords.delete(word);
    unknownWords.delete(word);
    if (status === "known") knownWords.add(word);
    if (status === "learning") learningWords.add(word);
    if (status === "unknown") unknownWords.add(word);
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
  const name = state.currentProfile?.name || "\u0443\u0447\u0435\u043D\u0438\u043A\u0430";
  if (!confirm(`\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043F\u0440\u043E\u0444\u0438\u043B\u044C \xAB${name}\xBB?`)) return;
  try {
    await api(`/api/profiles/${state.editingProfileId}`, { method: "DELETE", token: state.token });
    state.currentProfile = null;
    state.editingProfileId = null;
    await loadProfiles();
    toast("\u041F\u0440\u043E\u0444\u0438\u043B\u044C \u0443\u0434\u0430\u043B\u0451\u043D", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}
async function createRoom() {
  stopTeacherMicrophone();
  if (!state.editingProfileId) {
    toast("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0435 \u043F\u0440\u043E\u0444\u0438\u043B\u044C \u0443\u0447\u0435\u043D\u0438\u043A\u0430", "error");
    return;
  }
  setBusy(els.createRoomButton, true, "\u0421\u043E\u0437\u0434\u0430\u0451\u043C\u2026");
  try {
    const result = await api("/api/sessions", {
      method: "POST",
      token: state.token,
      body: { profileId: state.editingProfileId, lessonId: Number(els.lessonSelect.value) }
    });
    state.room = result.session;
    state.roomSecrets = { pin: result.studentPin, token: result.studentToken, url: result.studentUrl };
    state.currentProfile = result.profile;
    state.selectedLessonId = result.lesson.id;
    state.scaffoldLevel = 0;
    state.sessionEnded = false;
    localStorage.setItem("glc.teacherRoom", state.room.code);
    renderRoom();
    connectTeacherSocket(state.room.code);
    toast("\u0423\u0447\u0435\u0431\u043D\u0430\u044F \u043A\u043E\u043C\u043D\u0430\u0442\u0430 \u0441\u043E\u0437\u0434\u0430\u043D\u0430", "success");
  } catch (error) {
    toast(error.message, "error");
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
  els.roomPin.textContent = state.roomSecrets?.pin || "\u0441\u0441\u044B\u043B\u043A\u0430 \u0443\u0436\u0435 \u0441\u043E\u0437\u0434\u0430\u043D\u0430";
  els.roomStudentUrl.value = state.roomSecrets?.url || `${location.origin}/student?room=${encodeURIComponent(state.room.code)}`;
  state.scaffoldLevel = Number(state.room.scaffoldLevel || 0);
  renderScaffold();
  updateConnectionStatus("\u041F\u043E\u0434\u043A\u043B\u044E\u0447\u0430\u0435\u043C\u0441\u044F\u2026", "pending");
}
function connectTeacherSocket(roomCode) {
  state.socket?.disconnect();
  state.socket = io({
    auth: { role: "teacher", roomCode, token: state.token },
    transports: ["websocket", "polling"]
  });
  state.socket.on("connect", () => {
    updateConnectionStatus("\u0423\u0447\u0438\u0442\u0435\u043B\u044C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D", "ok");
    updateTeacherMicSendState();
  });
  state.socket.on("connect_error", (error) => updateConnectionStatus(`\u041E\u0448\u0438\u0431\u043A\u0430: ${error.message}`, "error"));
  state.socket.on("disconnect", () => {
    updateConnectionStatus("\u0421\u0432\u044F\u0437\u044C \u043F\u0440\u0435\u0440\u0432\u0430\u043D\u0430", "error");
    updateTeacherMicSendState();
  });
  state.socket.on("session:snapshot", (payload) => {
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
  state.socket.on("presence:update", ({ role, online }) => {
    if (role === "student") {
      state.studentOnline = online;
      els.studentStatus.textContent = online ? "\u0423\u0447\u0435\u043D\u0438\u043A \u0432 \u043A\u043E\u043C\u043D\u0430\u0442\u0435" : "\u0423\u0447\u0435\u043D\u0438\u043A \u043D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0451\u043D";
      els.studentStatus.className = `status-badge ${online ? "ok" : "muted"}`;
      addLog(online ? "\u0423\u0447\u0435\u043D\u0438\u043A \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u043B\u0441\u044F" : "\u0423\u0447\u0435\u043D\u0438\u043A \u043E\u0442\u043A\u043B\u044E\u0447\u0438\u043B\u0441\u044F", online ? "success" : "muted");
    }
  });
  state.socket.on("teacher:mic-partial", ({ text }) => {
    if (!state.teacherMicStarted) els.teacherMicPartial.textContent = text || "\u2026";
  });
  state.socket.on("teacher:mic-text", ({ text }) => {
    if (!state.teacherMicStarted && text) {
      state.teacherCommandText = text;
      els.teacherCommandInput.value = text;
      updateTeacherMicSendState();
    }
  });
  state.socket.on("student:partial", ({ text }) => {
    els.partialTranscript.textContent = text || "\u2026";
    els.partialTranscript.classList.toggle("active", Boolean(text));
  });
  state.socket.on("student:committed", ({ text, at }) => {
    state.transcript = text;
    els.transcriptInput.value = text;
    els.partialTranscript.textContent = "\u041E\u0436\u0438\u0434\u0430\u0435\u043C \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0443\u044E \u0440\u0435\u043F\u043B\u0438\u043A\u0443\u2026";
    els.partialTranscript.classList.remove("active");
    addLog(`\u0423\u0447\u0435\u043D\u0438\u043A: ${text}`, "student", at);
  });
  state.socket.on("ai:thinking", () => {
    els.aiStatus.textContent = "\u041C\u043E\u0434\u0435\u043B\u044C \u0433\u043E\u0442\u043E\u0432\u0438\u0442 \u043F\u0430\u043A\u0435\u0442 \u0432\u0430\u0440\u0438\u0430\u043D\u0442\u043E\u0432\u2026";
    els.aiStatus.className = "ai-status thinking";
    els.generateButton.disabled = true;
  });
  state.socket.on("ai:ready", ({ candidate, transcript, selectedText }) => {
    if (transcript) {
      state.transcript = transcript;
      els.transcriptInput.value = transcript;
    }
    state.candidate = candidate;
    state.selectedVariant = "main";
    state.selectedText = selectedText || candidate.main;
    renderCandidate();
    els.aiStatus.textContent = "\u041E\u0442\u0432\u0435\u0442 \u0433\u043E\u0442\u043E\u0432. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0444\u0438\u0448\u043A\u0443 \u0438\u043B\u0438 \u043E\u0442\u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u0443\u0439\u0442\u0435.";
    els.aiStatus.className = "ai-status ready";
    els.generateButton.disabled = false;
  });
  state.socket.on("candidate:selected", ({ text, variant, level }) => {
    state.selectedText = text;
    state.selectedVariant = variant;
    state.scaffoldLevel = level;
    els.candidateEditor.value = text;
    renderScaffold();
    highlightVariantFromText(text);
  });
  state.socket.on("ai:error", ({ error }) => {
    els.aiStatus.textContent = error || "\u041E\u0448\u0438\u0431\u043A\u0430 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438";
    els.aiStatus.className = "ai-status error";
    els.generateButton.disabled = false;
  });
  state.socket.on("voice:ready", () => {
    els.speakButton.classList.add("voice-ready");
    els.speakButton.title = "\u0410\u0443\u0434\u0438\u043E \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043B\u0435\u043D\u043E";
  });
  state.socket.on("speech:sent", ({ text, source }) => addLog(`${source === "teacher_mic" ? "\u041A\u043E\u043C\u0430\u043D\u0434\u0430 \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044F" : "\u0410\u0433\u0435\u043D\u0442"}: ${text}`, "teacher"));
  state.socket.on("student:assist", ({ action }) => {
    const names = { repeat: "\u043F\u043E\u0432\u0442\u043E\u0440\u0438\u043B \u0430\u0443\u0434\u0438\u043E", slower: "\u0432\u043A\u043B\u044E\u0447\u0438\u043B \u043C\u0435\u0434\u043B\u0435\u043D\u043D\u0435\u0435", keyword: "\u043E\u0442\u043A\u0440\u044B\u043B \u043A\u043B\u044E\u0447\u0435\u0432\u043E\u0435 \u0441\u043B\u043E\u0432\u043E", starter: "\u043E\u0442\u043A\u0440\u044B\u043B \u043D\u0430\u0447\u0430\u043B\u043E", transcript: "\u043E\u0442\u043A\u0440\u044B\u043B \u0432\u0435\u0441\u044C \u0442\u0440\u0430\u043D\u0441\u043A\u0440\u0438\u043F\u0442" };
    addLog(`\u0423\u0447\u0435\u043D\u0438\u043A ${names[action] || action}`, "assist");
  });
  state.socket.on("progress:update", ({ progress }) => {
    toast(`\u041F\u0440\u043E\u0433\u0440\u0435\u0441\u0441 \u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D: ${progress.turns} \u043E\u0446\u0435\u043D\u043E\u043A`, "success");
  });
  state.socket.on("session:ended", ({ summary }) => showSummary(summary));
}
async function refreshTeacherMicrophones() {
  try {
    await refreshMicrophoneSelect(els.teacherMicSelect, state.teacherMicId);
    state.teacherMicId = els.teacherMicSelect.value;
  } catch {
    els.teacherMicSelect.innerHTML = '<option value="">\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0441\u043F\u0438\u0441\u043E\u043A</option>';
    els.teacherMicSelect.disabled = true;
  }
}
async function startTeacherMicrophone() {
  if (state.teacherMicStarted) return;
  if (!state.room || !state.socket?.connected) {
    toast("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043A\u043E\u043C\u043D\u0430\u0442\u0443 \u0438 \u0434\u043E\u0436\u0434\u0438\u0442\u0435\u0441\u044C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F", "error");
    return;
  }
  if (!state.config?.sttEnabled) {
    toast("\u0420\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u043D\u0438\u0435 \u0440\u0435\u0447\u0438 (AITUNNEL Whisper) \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u043E", "error");
    return;
  }
  setBusy(els.teacherMicStartButton, true, "\u0417\u0430\u043F\u0443\u0441\u043A\u0430\u0435\u043C\u2026");
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
        if (!state.teacherMicStarted) return;
        if (phase === "processing") els.teacherMicPartial.textContent = "\u0420\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u044E \u0447\u0435\u0440\u0435\u0437 Whisper\u2026";
        else if (phase === "speaking") els.teacherMicPartial.textContent = "\u0421\u043B\u0443\u0448\u0430\u044E\u2026";
        else els.teacherMicPartial.textContent = "\u0413\u043E\u0432\u043E\u0440\u0438\u0442\u0435 \u043F\u043E-\u043D\u0435\u043C\u0435\u0446\u043A\u0438\u2026";
      },
      onSegment: (blob) => handleTeacherSegment(blob)
    });
    await refreshTeacherMicrophones();
    state.teacherMicStarted = true;
    els.teacherMicStartButton.hidden = true;
    els.teacherMicStopButton.hidden = false;
    els.teacherMicStatus.textContent = "\u0421\u043B\u0443\u0448\u0430\u044E \u043A\u043E\u043C\u0430\u043D\u0434\u0443 \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044F";
    els.teacherMicStatus.className = "status-badge ok";
    els.teacherMicPartial.textContent = "\u0413\u043E\u0432\u043E\u0440\u0438\u0442\u0435 \u043F\u043E-\u043D\u0435\u043C\u0435\u0446\u043A\u0438\u2026";
  } catch (error) {
    state.teacherCapture?.stop();
    state.teacherCapture = null;
    toast(`\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0432\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043C\u0438\u043A\u0440\u043E\u0444\u043E\u043D \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044F: ${error.message}`, "error", 6e3);
  } finally {
    setBusy(els.teacherMicStartButton, false);
  }
}
async function handleTeacherSegment(blob) {
  try {
    const text = await transcribeAudio(blob, { token: state.token, roomCode: state.room?.code });
    if (!text) {
      if (state.teacherMicStarted) els.teacherMicPartial.textContent = "\u041D\u0435 \u0440\u0430\u0441\u0441\u043B\u044B\u0448\u0430\u043B. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435, \u043F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430.";
      return;
    }
    state.teacherCommandText = text;
    els.teacherCommandInput.value = text;
    els.teacherMicPartial.textContent = "\u0424\u0440\u0430\u0437\u0430 \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u043D\u0430. \u041C\u043E\u0436\u043D\u043E \u0438\u0441\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u0438 \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C.";
    state.socket?.emit("teacher:mic-partial", { text });
    state.socket?.emit("teacher:mic-committed", { text }, (response) => {
      if (!response?.ok) toast(response?.error || "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u0438\u0442\u044C \u0433\u043E\u043B\u043E\u0441", "error");
    });
    updateTeacherMicSendState();
  } catch (error) {
    els.teacherMicStatus.textContent = `\u041E\u0448\u0438\u0431\u043A\u0430 \u0440\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u0432\u0430\u043D\u0438\u044F: ${error.message}`;
    els.teacherMicStatus.className = "status-badge error";
  }
}
function stopTeacherMicrophone() {
  state.teacherCapture?.stop();
  state.teacherCapture = null;
  state.teacherMicStarted = false;
  els.teacherMicStartButton.hidden = false;
  els.teacherMicStopButton.hidden = true;
  els.teacherMicStatus.textContent = "\u041C\u0438\u043A\u0440\u043E\u0444\u043E\u043D \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044F \u0432\u044B\u043A\u043B\u044E\u0447\u0435\u043D";
  els.teacherMicStatus.className = "status-badge muted";
}
function clearTeacherCommand() {
  state.teacherCommandText = "";
  els.teacherCommandInput.value = "";
  els.teacherMicPartial.textContent = state.teacherMicStarted ? "\u0413\u043E\u0432\u043E\u0440\u0438\u0442\u0435 \u043F\u043E-\u043D\u0435\u043C\u0435\u0446\u043A\u0438\u2026" : "\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u043C\u0438\u043A\u0440\u043E\u0444\u043E\u043D \u0438 \u043F\u0440\u043E\u0438\u0437\u043D\u0435\u0441\u0438\u0442\u0435 \u043A\u043E\u043C\u0430\u043D\u0434\u0443.";
  updateTeacherMicSendState();
}
function updateTeacherMicSendState() {
  if (!els.teacherMicSendButton) return;
  const text = els.teacherCommandInput?.value.trim() || "";
  els.teacherMicSendButton.disabled = !text || !state.socket?.connected || state.sessionEnded;
}
async function sendTeacherVoiceCommand() {
  const text = els.teacherCommandInput.value.trim();
  if (!text) return toast("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u0440\u043E\u0438\u0437\u043D\u0435\u0441\u0438\u0442\u0435 \u0438\u043B\u0438 \u0432\u0432\u0435\u0434\u0438\u0442\u0435 \u043A\u043E\u043C\u0430\u043D\u0434\u0443", "error");
  if (!state.socket?.connected) return toast("\u041D\u0435\u0442 \u0441\u0432\u044F\u0437\u0438 \u0441 \u0443\u0447\u0435\u0431\u043D\u043E\u0439 \u043A\u043E\u043C\u043D\u0430\u0442\u043E\u0439", "error");
  setBusy(els.teacherMicSendButton, true, "\u041E\u0437\u0432\u0443\u0447\u0438\u0432\u0430\u0435\u043C\u2026");
  try {
    const result = await socketAck(state.socket, "teacher:speak", {
      text,
      variant: "teacher_mic",
      source: "teacher_mic",
      playbackRate: 1
    });
    toast(result.mode === "elevenlabs" ? "\u041A\u043E\u043C\u0430\u043D\u0434\u0430 \u043F\u0440\u043E\u0437\u0432\u0443\u0447\u0430\u043B\u0430 \u0433\u043E\u043B\u043E\u0441\u043E\u043C \u043D\u043E\u0441\u0438\u0442\u0435\u043B\u044F" : "\u041A\u043E\u043C\u0430\u043D\u0434\u0430 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0430 \u0433\u043E\u043B\u043E\u0441\u043E\u043C \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430", "success");
  } catch (error) {
    toast(error.message, "error");
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
  state.transcript = turn.transcript || "";
  state.candidate = turn.candidate || null;
  state.selectedText = turn.selectedText || turn.candidate?.main || "";
  state.selectedVariant = turn.selectedVariant || "main";
  els.transcriptInput.value = state.transcript;
  if (state.candidate) renderCandidate();
}
async function generate(action = "AUTO") {
  if (!state.socket?.connected) {
    toast("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043A\u043E\u043C\u043D\u0430\u0442\u0443 \u0438 \u0434\u043E\u0436\u0434\u0438\u0442\u0435\u0441\u044C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F", "error");
    return;
  }
  const transcript = els.transcriptInput.value.trim();
  if (!transcript) {
    toast("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0438\u043B\u0438 \u0434\u043E\u0436\u0434\u0438\u0442\u0435\u0441\u044C \u0440\u0435\u043F\u043B\u0438\u043A\u0438 \u0443\u0447\u0435\u043D\u0438\u043A\u0430", "error");
    return;
  }
  try {
    await socketAck(state.socket, "teacher:generate", {
      transcript,
      action,
      instruction: els.teacherInstruction.value.trim(),
      scaffoldLevel: state.scaffoldLevel
    });
  } catch (error) {
    toast(error.message, "error");
  }
}
async function runTransform(instruction) {
  if (!state.socket?.connected || !state.candidate) {
    toast("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u0435 \u043E\u0442\u0432\u0435\u0442 \u043C\u043E\u0434\u0435\u043B\u0438", "error");
    return;
  }
  try {
    await socketAck(state.socket, "teacher:transform", {
      currentText: els.candidateEditor.value.trim(),
      instruction,
      scaffoldLevel: state.scaffoldLevel
    });
  } catch (error) {
    toast(error.message, "error");
  }
}
function renderCandidate() {
  const c = state.candidate;
  if (!c) return;
  els.interpretation.textContent = c.interpretation_ru || "\u2014";
  els.correctedStudent.textContent = c.corrected_student_de || "\u2014";
  els.candidateEditor.value = state.selectedText || c.main;
  const newWords = c.new_words?.length ? c.new_words.join(", ") : "0";
  els.candidateMeta.innerHTML = [
    makePill("\u0421\u043B\u043E\u0432", c.word_count ?? String(c.main).trim().split(/\s+/).length, c.exceeds_word_limit ? "warn" : "ok"),
    makePill("\u041D\u043E\u0432\u044B\u0435", newWords, c.new_words?.length ? "warn" : "ok"),
    makePill("\u0413\u0440\u0430\u043C\u043C\u0430\u0442\u0438\u043A\u0430", (c.grammar_used || []).join(", ") || "\u0437\u043D\u0430\u043A\u043E\u043C\u0430\u044F"),
    makePill("\u041E\u0436\u0438\u0434\u0430\u0435\u043C\u044B\u0439 \u043E\u0442\u0432\u0435\u0442", c.expected_answer_de || "\u2014")
  ].join("");
  els.variantsGrid.innerHTML = VARIANTS.map(([key, label]) => {
    const text = c[key];
    if (!text) return "";
    const selected = state.selectedVariant === key ? "selected" : "";
    return `<button type="button" class="variant-card ${selected}" data-variant="${key}">
      <span>${esc(label)}</span><b lang="de">${esc(text)}</b>
    </button>`;
  }).join("");
  $$(".variant-card", els.variantsGrid).forEach((button) => {
    button.addEventListener("click", () => selectVariant(button.dataset.variant));
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
  $$(".variant-card", els.variantsGrid).forEach((button) => button.classList.toggle("selected", button.dataset.variant === key));
  try {
    await socketAck(state.socket, "teacher:candidate", { text, variant: key });
  } catch (error) {
    toast(error.message, "error");
  }
  updateSpeakState();
}
function highlightVariantFromText(text) {
  const found = VARIANTS.find(([key]) => state.candidate?.[key] === text)?.[0] || "";
  state.selectedVariant = found || state.selectedVariant;
  $$(".variant-card", els.variantsGrid).forEach((button) => button.classList.toggle("selected", button.dataset.variant === found));
}
function updateSpeakState() {
  const ready = Boolean(state.selectedText || els.candidateEditor.value.trim());
  els.speakButton.disabled = !ready || !state.socket?.connected || state.sessionEnded;
  els.slowerSpeakButton.disabled = !ready || !state.socket?.connected || state.sessionEnded;
}
async function speak(playbackRate) {
  const text = els.candidateEditor.value.trim();
  if (!text) return;
  setBusy(playbackRate === 1 ? els.speakButton : els.slowerSpeakButton, true, "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u0435\u043C\u2026");
  try {
    await socketAck(state.socket, "teacher:candidate", { text, variant: state.selectedVariant || "manual" });
    const result = await socketAck(state.socket, "teacher:speak", { text, variant: state.selectedVariant, playbackRate });
    toast(result.mode === "elevenlabs" ? "\u0413\u043E\u043B\u043E\u0441 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D \u0443\u0447\u0435\u043D\u0438\u043A\u0443" : "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E \u0447\u0435\u0440\u0435\u0437 \u0433\u043E\u043B\u043E\u0441 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430", "success");
  } catch (error) {
    toast(error.message, "error");
  } finally {
    setBusy(playbackRate === 1 ? els.speakButton : els.slowerSpeakButton, false);
    updateSpeakState();
  }
}
function renderScaffold() {
  const labels = ["\u0421\u0432\u043E\u0431\u043E\u0434\u043D\u043E", "\u041A\u043E\u0440\u043E\u0447\u0435", "\u041F\u0440\u043E\u0449\u0435", "Ja/Nein", "A/B", "\u041D\u0430\u0447\u0430\u043B\u043E", "\u041E\u0431\u0440\u0430\u0437\u0435\u0446"];
  els.scaffoldRow.innerHTML = labels.map(
    (label, level) => `<button type="button" class="scaffold-chip ${level === state.scaffoldLevel ? "active" : ""}" data-level="${level}"><span>${level}</span>${esc(label)}</button>`
  ).join("");
  $$(".scaffold-chip", els.scaffoldRow).forEach((button) => {
    button.addEventListener("click", async () => {
      if (!state.socket?.connected) return;
      try {
        const result = await socketAck(state.socket, "teacher:scaffold", { level: Number(button.dataset.level) });
        state.scaffoldLevel = result.level;
        renderScaffold();
      } catch (error) {
        toast(error.message, "error");
      }
    });
  });
}
async function assess(assessment) {
  if (!state.socket?.connected) return;
  try {
    await socketAck(state.socket, "teacher:assessment", { assessment });
    const labels = { independent: "\u0421\u0430\u043C\u043E\u0441\u0442\u043E\u044F\u0442\u0435\u043B\u044C\u043D\u043E", prompted: "\u0421 \u043F\u043E\u043C\u043E\u0449\u044C\u044E", error: "\u041E\u0448\u0438\u0431\u043A\u0430", mastered: "\u041E\u0441\u0432\u043E\u0435\u043D\u043E" };
    addLog(`\u041E\u0446\u0435\u043D\u043A\u0430: ${labels[assessment]}`, "assessment");
  } catch (error) {
    toast(error.message, "error");
  }
}
async function endSession() {
  if (!state.socket?.connected || state.sessionEnded) return;
  if (!confirm("\u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C \u0443\u0440\u043E\u043A \u0438 \u0441\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u0438\u0442\u043E\u0433?")) return;
  setBusy(els.endSessionButton, true, "\u041F\u043E\u0434\u0432\u043E\u0434\u0438\u043C \u0438\u0442\u043E\u0433\u2026");
  try {
    const result = await socketAck(state.socket, "teacher:end", {});
    showSummary(result.summary);
  } catch (error) {
    toast(error.message, "error");
  } finally {
    setBusy(els.endSessionButton, false);
  }
}
function showSummary(summary) {
  state.sessionEnded = true;
  stopTeacherMicrophone();
  localStorage.removeItem("glc.teacherRoom");
  els.summaryPanel.hidden = false;
  els.summaryText.innerHTML = `<p>${esc(summary?.summary_ru || "\u0423\u0440\u043E\u043A \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D.")}</p>
    ${summary?.mastered_words?.length ? `<h4>\u041E\u0441\u0432\u043E\u0435\u043D\u043E</h4><p>${summary.mastered_words.map(esc).join(", ")}</p>` : ""}
    ${summary?.repeat_words?.length ? `<h4>\u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u044C</h4><p>${summary.repeat_words.map(esc).join(", ")}</p>` : ""}
    ${summary?.next_steps?.length ? `<h4>\u0421\u043B\u0435\u0434\u0443\u044E\u0449\u0438\u0435 \u0448\u0430\u0433\u0438</h4><ul>${summary.next_steps.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}`;
  updateSpeakState();
  toast("\u0423\u0440\u043E\u043A \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043D", "success");
}
function addLog(text, kind = "info", at = Date.now()) {
  const node = document.createElement("div");
  node.className = `log-line ${kind}`;
  node.innerHTML = `<time>${formatTime(at)}</time><span>${esc(text)}</span>`;
  els.sessionLog.prepend(node);
  while (els.sessionLog.children.length > 80) els.sessionLog.lastElementChild.remove();
}
//# sourceMappingURL=teacher.js.map
