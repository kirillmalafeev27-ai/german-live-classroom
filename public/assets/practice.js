// src/client/shared.js
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
function canUseMicrophone() {
  return Boolean(navigator.mediaDevices?.getUserMedia && navigator.mediaDevices?.enumerateDevices);
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
async function transcribeAudio(blob, { token = "", roomCode = "", path } = {}) {
  const url = path || `/api/stt/transcribe?room=${encodeURIComponent(roomCode)}`;
  const response = await fetch(url, {
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
  speechThreshold = 0.02,
  silenceHangoverMs = 850,
  minVoicedMs = 400,
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
  let lastFrameAt = performance.now();
  let recorder = null;
  let chunks = [];
  let recording = false;
  let voicedMs = 0;
  let lastVoiceAt = 0;
  let segmentReason = "";
  let pendingTeardown = false;
  const teardown = () => {
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
  };
  const startSegment = (now) => {
    recording = true;
    voicedMs = 0;
    lastVoiceAt = now;
    segmentReason = "";
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
      const heardEnough = voicedMs >= minVoicedMs && segmentReason !== "abort";
      const blob = new Blob(collected, { type });
      const emit = heardEnough && blob.size >= 1200 && !paused;
      if (emit) {
        onState("processing");
        Promise.resolve().then(() => onSegment(blob)).catch(() => {
        }).finally(() => {
          if (!recording && !stopped) onState("listening");
        });
      } else {
        onState(segmentReason === "abort" ? "listening" : "empty");
      }
      if (pendingTeardown) {
        pendingTeardown = false;
        teardown();
      }
    };
    try {
      recorder.start();
    } catch {
      recording = false;
    }
    onState("speaking");
  };
  const finishSegment = (reason) => {
    if (!recording) return;
    recording = false;
    segmentReason = reason;
    try {
      if (recorder && recorder.state !== "inactive") recorder.stop();
      else if (pendingTeardown) {
        pendingTeardown = false;
        teardown();
      }
    } catch {
      if (pendingTeardown) {
        pendingTeardown = false;
        teardown();
      }
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
        if (voicedMs >= maxSegmentMs) finishSegment("max");
        else if (sinceVoice >= silenceHangoverMs) finishSegment("silence");
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
      if (recording) finishSegment("abort");
    },
    resume() {
      paused = false;
      lastVoiceAt = performance.now();
      lastFrameAt = performance.now();
    },
    // Transcribe whatever has been said so far, then stop listening.
    flush() {
      if (recording && voicedMs >= minVoicedMs) finishSegment("silence");
    },
    stop() {
      if (stopped) return;
      stopped = true;
      if (recording) {
        pendingTeardown = true;
        finishSegment(voicedMs >= minVoicedMs ? "silence" : "abort");
      } else {
        teardown();
      }
    }
  };
}

// src/client/practice.js
var state = {
  lessons: [],
  scenarios: {},
  modes: [],
  config: { sttEnabled: false, ttsEnabled: false, aiEnabled: false },
  moduleId: 1,
  mode: "dialog",
  scenarioId: "",
  history: [],
  capture: null,
  micOn: false,
  busy: false,
  currentAudio: null
};
var els = {};
document.addEventListener("DOMContentLoaded", boot);
async function boot() {
  cache();
  bind();
  try {
    const [curriculum, practice] = await Promise.all([
      fetchJson("/api/curriculum"),
      fetchJson("/api/practice/scenarios")
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
      els.status.textContent = "AITUNNEL \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D";
      els.status.className = "status-badge warn";
      els.startButton.disabled = true;
    }
    if (!state.config.sttEnabled) els.micButton.hidden = true;
    if (!state.config.ttsEnabled) {
      els.ttsToggle.checked = false;
      els.ttsToggle.closest(".practice-tts-toggle").hidden = true;
    }
  } catch (error) {
    els.status.textContent = "\u041E\u0448\u0438\u0431\u043A\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438";
    els.status.className = "status-badge error";
    toast(error.message, "error");
  }
}
function cache() {
  els.status = $("#practiceStatus");
  els.moduleSelect = $("#moduleSelect");
  els.moduleMeta = $("#moduleMeta");
  els.modeTabs = $("#modeTabs");
  els.scenarioBlock = $("#scenarioBlock");
  els.scenarioButtons = $("#scenarioButtons");
  els.startButton = $("#startButton");
  els.setupCard = $("#setupCard");
  els.chatCard = $("#chatCard");
  els.chatMode = $("#chatMode");
  els.chatTitle = $("#chatTitle");
  els.chatGoal = $("#chatGoal");
  els.chatLog = $("#chatLog");
  els.hintBar = $("#hintBar");
  els.chatInput = $("#chatInput");
  els.sendButton = $("#sendButton");
  els.resetButton = $("#resetButton");
  els.micButton = $("#micButton");
  els.micStopButton = $("#micStopButton");
  els.micMeterWrap = $("#micMeterWrap");
  els.micSignal = $("#micSignal");
  els.micMeterValue = $("#micMeterValue");
  els.micMeterFill = $("#micMeterFill");
  els.micLive = $("#micLive");
  els.ttsToggle = $("#ttsToggle");
}
function bind() {
  els.moduleSelect.addEventListener("change", () => {
    state.moduleId = Number(els.moduleSelect.value);
    onModuleChange();
  });
  els.modeTabs.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.mode = tab.dataset.mode;
      els.modeTabs.querySelectorAll(".mode-tab").forEach((t) => t.classList.toggle("active", t === tab));
      els.scenarioBlock.hidden = state.mode !== "roleplay";
      updateStartState();
    });
  });
  els.startButton.addEventListener("click", startSession);
  els.resetButton.addEventListener("click", resetSession);
  els.sendButton.addEventListener("click", () => sendUser(els.chatInput.value));
  els.chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendUser(els.chatInput.value);
    }
  });
  els.micButton.addEventListener("click", startMic);
  els.micStopButton.addEventListener("click", stopMic);
}
function renderModules() {
  els.moduleSelect.innerHTML = state.lessons.map((lesson) => `<option value="${lesson.id}">${lesson.id}. ${esc(lesson.title)}</option>`).join("");
  els.moduleSelect.value = String(state.moduleId);
}
function currentLesson() {
  return state.lessons.find((lesson) => lesson.id === state.moduleId);
}
function onModuleChange() {
  const lesson = currentLesson();
  if (lesson) {
    els.moduleMeta.innerHTML = `
      <div><b>\u0413\u0440\u0430\u043C\u043C\u0430\u0442\u0438\u043A\u0430:</b> ${esc((lesson.grammar || []).join(" \xB7 ")) || "\u2014"}</div>
      <div><b>\u0422\u0435\u043C\u044B:</b> ${esc((lesson.themes || []).join(" \xB7 ")) || "\u2014"}</div>`;
  }
  renderScenarios();
  updateStartState();
}
function renderScenarios() {
  const list = state.scenarios[String(state.moduleId)] || [];
  state.scenarioId = list[0]?.id || "";
  els.scenarioButtons.innerHTML = list.map((sc) => `
    <button type="button" class="scenario-chip${sc.id === state.scenarioId ? " active" : ""}" data-id="${esc(sc.id)}">
      <b>${esc(sc.title)}</b>
      <span>\u0418\u0418: ${esc(sc.aiRole)}</span>
      <small>${esc(sc.goal)}</small>
    </button>`).join("");
  els.scenarioButtons.querySelectorAll(".scenario-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.scenarioId = chip.dataset.id;
      els.scenarioButtons.querySelectorAll(".scenario-chip").forEach((c) => c.classList.toggle("active", c === chip));
      updateStartState();
    });
  });
}
function currentScenario() {
  return (state.scenarios[String(state.moduleId)] || []).find((sc) => sc.id === state.scenarioId) || null;
}
function updateStartState() {
  const ok = state.config.aiEnabled && (state.mode === "dialog" || Boolean(currentScenario()));
  els.startButton.disabled = !ok;
}
async function startSession() {
  state.history = [];
  els.chatLog.innerHTML = "";
  els.hintBar.hidden = true;
  const lesson = currentLesson();
  const scenario = currentScenario();
  els.setupCard.hidden = true;
  els.chatCard.hidden = false;
  els.chatMode.textContent = state.mode === "roleplay" ? "\u0420\u043E\u043B\u0435\u0432\u043E\u0439 \u0434\u0438\u0430\u043B\u043E\u0433" : "\u0414\u0438\u0430\u043B\u043E\u0433 \u043F\u043E \u0442\u0435\u043C\u0435";
  els.chatTitle.textContent = state.mode === "roleplay" && scenario ? scenario.title : `${lesson.id}. ${lesson.title}`;
  els.chatGoal.textContent = state.mode === "roleplay" && scenario ? `\u0412\u0430\u0448\u0430 \u0440\u043E\u043B\u044C: ${scenario.userRole}. \u0417\u0430\u0434\u0430\u0447\u0430: ${scenario.goal}` : `\u041E\u0442\u0432\u0435\u0447\u0430\u0439\u0442\u0435 \u043F\u043E-\u043D\u0435\u043C\u0435\u0446\u043A\u0438, \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044F: ${(lesson.grammar || []).join(", ")}`;
  if (state.mode === "roleplay" && scenario?.opener) {
    addMessage("ai", scenario.opener);
    state.history.push({ role: "ai", text: scenario.opener });
    maybeSpeak(scenario.opener);
  } else {
    await requestReply("");
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
  const value = String(text || "").trim();
  if (!value || state.busy) return;
  els.chatInput.value = "";
  addMessage("user", value);
  state.history.push({ role: "user", text: value });
  await requestReply(value);
}
async function requestReply(userText) {
  if (state.busy) return;
  state.busy = true;
  setBusy(els.sendButton, true, "\u2026");
  els.status.textContent = "\u0418\u0418 \u0434\u0443\u043C\u0430\u0435\u0442\u2026";
  els.status.className = "status-badge pending";
  const typing = addMessage("ai", "\u2026", true);
  try {
    const data = await fetchJson("/api/practice/reply", {
      method: "POST",
      body: {
        moduleId: state.moduleId,
        mode: state.mode,
        scenarioId: state.scenarioId,
        history: state.history.slice(-16),
        userText
      }
    });
    typing.remove();
    const reply = data.reply_de || "\u2026";
    addMessage("ai", reply, false, data.correction);
    state.history.push({ role: "ai", text: reply });
    if (data.hint_ru) {
      els.hintBar.hidden = false;
      els.hintBar.textContent = `\u{1F4A1} ${data.hint_ru}`;
    } else els.hintBar.hidden = true;
    els.status.textContent = "\u0412\u0430\u0448 \u0445\u043E\u0434";
    els.status.className = "status-badge ok";
    maybeSpeak(reply);
  } catch (error) {
    typing.remove();
    els.status.textContent = "\u041E\u0448\u0438\u0431\u043A\u0430";
    els.status.className = "status-badge error";
    toast(error.message, "error");
  } finally {
    state.busy = false;
    setBusy(els.sendButton, false);
  }
}
function addMessage(role, text, temporary = false, correction = "") {
  const wrap = document.createElement("div");
  wrap.className = `chat-bubble ${role === "ai" ? "from-ai" : "from-user"}${temporary ? " typing" : ""}`;
  const body = document.createElement("div");
  body.className = "bubble-text";
  body.lang = role === "ai" ? "de" : "";
  body.textContent = text;
  wrap.append(body);
  if (role === "ai" && !temporary && state.config.ttsEnabled) {
    const play = document.createElement("button");
    play.className = "bubble-play";
    play.type = "button";
    play.textContent = "\u{1F50A}";
    play.title = "\u041F\u0440\u043E\u0441\u043B\u0443\u0448\u0430\u0442\u044C";
    play.addEventListener("click", () => speak(text));
    wrap.append(play);
  }
  if (correction) {
    const corr = document.createElement("div");
    corr.className = "bubble-correction";
    corr.lang = "de";
    corr.textContent = `\u270F\uFE0F ${correction}`;
    wrap.append(corr);
  }
  els.chatLog.append(wrap);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
  return wrap;
}
function maybeSpeak(text) {
  if (els.ttsToggle?.checked && state.config.ttsEnabled) speak(text);
}
async function speak(text) {
  if (!state.config.ttsEnabled) return;
  stopAudio();
  try {
    const response = await fetch("/api/practice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    if (!response.ok) throw new Error("\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0430\u0443\u0434\u0438\u043E");
    const blob = await response.blob();
    const audio = new Audio(URL.createObjectURL(blob));
    state.currentAudio = audio;
    audio.play().catch(() => {
    });
  } catch {
  }
}
function stopAudio() {
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio = null;
  }
}
async function startMic() {
  if (state.micOn || !state.config.sttEnabled) return;
  try {
    els.micMeterWrap.hidden = false;
    state.capture = await startVoiceCapture({
      fill: els.micMeterFill,
      value: els.micMeterValue,
      signal: els.micSignal,
      onState: (phase) => {
        if (phase === "processing") els.micLive.textContent = "\u23F3 \u0420\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u044E\u2026";
        else if (phase === "speaking") els.micLive.textContent = "\u{1F399} \u0421\u043B\u044B\u0448\u0443 \u0432\u0430\u0441\u2026";
        else if (phase === "empty") els.micLive.textContent = "\u{1F507} \u0417\u0432\u0443\u043A \u043D\u0435 \u043F\u043E\u0439\u043C\u0430\u043D \u2014 \u0433\u043E\u0432\u043E\u0440\u0438\u0442\u0435 \u0431\u043B\u0438\u0436\u0435 \u043A \u043C\u0438\u043A\u0440\u043E\u0444\u043E\u043D\u0443.";
        else els.micLive.textContent = "\u0413\u043E\u0432\u043E\u0440\u0438\u0442\u0435 \u043F\u043E-\u043D\u0435\u043C\u0435\u0446\u043A\u0438\u2026";
      },
      onSegment: handleMicSegment
    });
    state.micOn = true;
    els.micButton.hidden = true;
    els.micStopButton.hidden = false;
  } catch (error) {
    els.micMeterWrap.hidden = true;
    toast(`\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0432\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043C\u0438\u043A\u0440\u043E\u0444\u043E\u043D: ${error.message}`, "error");
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
    const text = await transcribeAudio(blob, { path: "/api/practice/transcribe" });
    if (!text) {
      els.micLive.textContent = "\u{1F507} \u041D\u0435 \u0440\u0430\u0441\u0441\u043B\u044B\u0448\u0430\u043B. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435.";
      return;
    }
    els.micLive.textContent = `\u0412\u044B \u0441\u043A\u0430\u0437\u0430\u043B\u0438: \xAB${text}\xBB`;
    await sendUser(text);
  } catch (error) {
    els.micLive.textContent = `\u26A0\uFE0F ${error.message}`;
  }
}
async function fetchJson(url, { method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: body !== void 0 ? { "Content-Type": "application/json" } : {},
    body: body === void 0 ? void 0 : JSON.stringify(body)
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload;
}
//# sourceMappingURL=practice.js.map
