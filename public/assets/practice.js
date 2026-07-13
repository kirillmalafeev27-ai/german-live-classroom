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
  config: { sttEnabled: false, ttsEnabled: false, aiEnabled: false },
  moduleId: 1,
  mode: "dialog",
  scenarioId: "",
  history: [],
  started: false,
  busy: false,
  capture: null,
  micOn: false,
  lastAiText: "",
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
    state.config = {
      sttEnabled: Boolean(practice.sttEnabled),
      ttsEnabled: Boolean(practice.ttsEnabled),
      aiEnabled: Boolean(practice.aiEnabled)
    };
    renderModules();
    onSetupChange();
    refreshMics();
    if (!state.config.aiEnabled) {
      els.status.textContent = "AITUNNEL \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D";
      els.status.className = "status-badge warn";
      els.startButton.disabled = true;
    }
    if (!state.config.sttEnabled) {
      els.startMicButton.disabled = true;
      els.startMicButton.textContent = "\u041C\u0438\u043A\u0440\u043E\u0444\u043E\u043D \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D";
    }
    if (!state.config.ttsEnabled) {
      els.repeatButton.disabled = true;
      els.slowerButton.disabled = true;
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
  els.modeSelect = $("#modeSelect");
  els.scenarioField = $("#scenarioField");
  els.scenarioSelect = $("#scenarioSelect");
  els.startButton = $("#startButton");
  els.setupHint = $("#setupHint");
  els.startMicButton = $("#startMicButton");
  els.stopMicButton = $("#stopMicButton");
  els.micSelect = $("#micSelect");
  els.micSignal = $("#micSignal");
  els.micMeterValue = $("#micMeterValue");
  els.micMeterFill = $("#micMeterFill");
  els.liveTranscript = $("#liveTranscript");
  els.correctionLine = $("#correctionLine");
  els.listenState = $("#listenState");
  els.listenHint = $("#listenHint");
  els.repeatButton = $("#repeatButton");
  els.slowerButton = $("#slowerButton");
  els.revealButton = $("#revealButton");
  els.revealBox = $("#revealBox");
  els.revealText = $("#revealText");
  els.hintBox = $("#hintBox");
  els.typedForm = $("#typedForm");
  els.typedInput = $("#typedInput");
  els.sendTypedButton = $("#sendTypedButton");
}
function bind() {
  els.moduleSelect.addEventListener("change", () => {
    state.moduleId = Number(els.moduleSelect.value);
    onSetupChange();
  });
  els.modeSelect.addEventListener("change", () => {
    state.mode = els.modeSelect.value;
    onSetupChange();
  });
  els.scenarioSelect.addEventListener("change", () => {
    state.scenarioId = els.scenarioSelect.value;
  });
  els.startButton.addEventListener("click", startSession);
  els.startMicButton.addEventListener("click", startMic);
  els.stopMicButton.addEventListener("click", stopMic);
  els.micSelect.addEventListener("change", () => {
    if (state.micOn) {
      stopMic();
      startMic();
    }
  });
  els.repeatButton.addEventListener("click", () => replay(1));
  els.slowerButton.addEventListener("click", () => replay(0.75));
  els.revealButton.addEventListener("click", revealText);
  els.typedForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = els.typedInput.value.trim();
    if (!text) return;
    els.typedInput.value = "";
    sendUser(text);
  });
}
function renderModules() {
  els.moduleSelect.innerHTML = state.lessons.map((lesson) => `<option value="${lesson.id}">${lesson.id}. ${esc(lesson.title)}</option>`).join("");
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
  const roleplay = state.mode === "roleplay";
  els.scenarioField.hidden = !roleplay;
  if (roleplay) {
    const list = state.scenarios[String(state.moduleId)] || [];
    if (!list.some((sc2) => sc2.id === state.scenarioId)) state.scenarioId = list[0]?.id || "";
    els.scenarioSelect.innerHTML = list.map((sc2) => `<option value="${esc(sc2.id)}">${esc(sc2.title)}</option>`).join("");
    els.scenarioSelect.value = state.scenarioId;
  }
  const sc = currentScenario();
  if (roleplay && sc) {
    els.setupHint.innerHTML = `<div><b>\u0418\u0418 \u0438\u0433\u0440\u0430\u0435\u0442:</b> ${esc(sc.aiRole)}. <b>\u0412\u044B:</b> ${esc(sc.userRole)}.</div><div><b>\u0417\u0430\u0434\u0430\u0447\u0430:</b> ${esc(sc.goal)}</div>`;
  } else if (lesson) {
    els.setupHint.innerHTML = `<div><b>\u0413\u0440\u0430\u043C\u043C\u0430\u0442\u0438\u043A\u0430:</b> ${esc((lesson.grammar || []).join(" \xB7 ")) || "\u2014"}</div><div><b>\u0422\u0435\u043C\u044B:</b> ${esc((lesson.themes || []).join(" \xB7 ")) || "\u2014"}</div>`;
  }
}
async function refreshMics() {
  try {
    await refreshMicrophoneSelect(els.micSelect, els.micSelect.value);
  } catch {
    els.micSelect.innerHTML = '<option value="">\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0441\u043F\u0438\u0441\u043E\u043A</option>';
    els.micSelect.disabled = true;
  }
}
async function startSession() {
  state.started = true;
  state.history = [];
  els.correctionLine.hidden = true;
  els.revealBox.hidden = true;
  els.hintBox.hidden = true;
  els.startButton.textContent = "\u041D\u0430\u0447\u0430\u0442\u044C \u0437\u0430\u043D\u043E\u0432\u043E";
  const lesson = currentLesson();
  const sc = currentScenario();
  els.liveTranscript.textContent = state.mode === "roleplay" && sc ? `\u0420\u043E\u043B\u044C \u0418\u0418: ${sc.aiRole}. \u041E\u0442\u0432\u0435\u0442\u044C\u0442\u0435 \u0433\u043E\u043B\u043E\u0441\u043E\u043C \u0438\u043B\u0438 \u0442\u0435\u043A\u0441\u0442\u043E\u043C.` : `\u041E\u0442\u0432\u0435\u0447\u0430\u0439\u0442\u0435 \u043F\u043E-\u043D\u0435\u043C\u0435\u0446\u043A\u0438, \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044F: ${(lesson?.grammar || []).join(", ")}`;
  if (state.mode === "roleplay" && sc?.opener) {
    presentAiTurn(sc.opener, "", "");
    state.history.push({ role: "ai", text: sc.opener });
  } else {
    await requestReply("");
  }
}
async function sendUser(text) {
  const value = String(text || "").trim();
  if (!value || state.busy) return;
  if (!state.started) {
    toast("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u041D\u0430\u0447\u0430\u0442\u044C\xBB", "error");
    return;
  }
  els.liveTranscript.textContent = `\u0412\u044B \u0441\u043A\u0430\u0437\u0430\u043B\u0438: \xAB${value}\xBB`;
  els.correctionLine.hidden = true;
  state.history.push({ role: "user", text: value });
  await requestReply(value);
}
async function requestReply(userText) {
  if (state.busy) return;
  state.busy = true;
  els.status.textContent = "\u0418\u0418 \u0434\u0443\u043C\u0430\u0435\u0442\u2026";
  els.status.className = "status-badge pending";
  els.listenState.textContent = "\u0421\u043E\u0431\u0435\u0441\u0435\u0434\u043D\u0438\u043A \u043F\u0435\u0447\u0430\u0442\u0430\u0435\u0442\u2026";
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
    const reply = data.reply_de || "\u2026";
    state.history.push({ role: "ai", text: reply });
    presentAiTurn(reply, data.correction, data.hint_ru);
    els.status.textContent = "\u0412\u0430\u0448 \u0445\u043E\u0434";
    els.status.className = "status-badge ok";
  } catch (error) {
    els.status.textContent = "\u041E\u0448\u0438\u0431\u043A\u0430";
    els.status.className = "status-badge error";
    els.listenState.textContent = "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u043E\u0442\u0432\u0435\u0442";
    toast(error.message, "error");
  } finally {
    state.busy = false;
  }
}
function presentAiTurn(reply, correction, hint) {
  state.lastAiText = reply;
  els.listenState.textContent = "\u0421\u043B\u0443\u0448\u0430\u0439\u0442\u0435 \u043E\u0442\u0432\u0435\u0442 \u0418\u0418";
  els.revealBox.hidden = true;
  els.revealText.textContent = reply;
  if (correction) {
    els.correctionLine.hidden = false;
    els.correctionLine.textContent = `\u270F\uFE0F ${correction}`;
  }
  if (hint) {
    els.hintBox.hidden = false;
    els.hintBox.textContent = `\u{1F4A1} ${hint}`;
  } else {
    els.hintBox.hidden = true;
  }
  speak(reply, 1).finally(() => {
    els.listenState.textContent = "\u0412\u0430\u0448 \u0445\u043E\u0434 \u2014 \u043E\u0442\u0432\u0435\u0442\u044C\u0442\u0435 \u043F\u043E-\u043D\u0435\u043C\u0435\u0446\u043A\u0438";
  });
}
function revealText() {
  if (!state.lastAiText) return;
  els.revealBox.hidden = false;
}
function replay(rate) {
  if (state.lastAiText) speak(state.lastAiText, rate);
}
async function speak(text, rate = 1) {
  if (!state.config.ttsEnabled || !text) return;
  stopAudio();
  try {
    const response = await fetch("/api/practice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    if (!response.ok) throw new Error("tts");
    const blob = await response.blob();
    const audio = new Audio(URL.createObjectURL(blob));
    audio.playbackRate = rate;
    state.currentAudio = audio;
    await audio.play();
    await new Promise((resolve) => {
      audio.onended = resolve;
      audio.onerror = resolve;
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
    state.capture = await startVoiceCapture({
      deviceId: els.micSelect.value || "",
      fill: els.micMeterFill,
      value: els.micMeterValue,
      signal: els.micSignal,
      onState: (phase) => {
        if (phase === "processing") els.liveTranscript.textContent = "\u23F3 \u0420\u0430\u0441\u043F\u043E\u0437\u043D\u0430\u044E\u2026";
        else if (phase === "speaking") els.liveTranscript.textContent = "\u{1F399} \u0421\u043B\u044B\u0448\u0443 \u0432\u0430\u0441\u2026";
        else if (phase === "empty") els.liveTranscript.textContent = "\u{1F507} \u0417\u0432\u0443\u043A \u043D\u0435 \u043F\u043E\u0439\u043C\u0430\u043D \u2014 \u0433\u043E\u0432\u043E\u0440\u0438\u0442\u0435 \u0431\u043B\u0438\u0436\u0435 \u043A \u043C\u0438\u043A\u0440\u043E\u0444\u043E\u043D\u0443.";
      },
      onSegment: handleSegment
    });
    state.micOn = true;
    els.startMicButton.hidden = true;
    els.stopMicButton.hidden = false;
    await refreshMics();
  } catch (error) {
    toast(`\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0432\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u043C\u0438\u043A\u0440\u043E\u0444\u043E\u043D: ${error.message}`, "error");
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
    const text = await transcribeAudio(blob, { path: "/api/practice/transcribe" });
    if (!text) {
      els.liveTranscript.textContent = "\u{1F507} \u041D\u0435 \u0440\u0430\u0441\u0441\u043B\u044B\u0448\u0430\u043B. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435.";
      return;
    }
    await sendUser(text);
  } catch (error) {
    els.liveTranscript.textContent = `\u26A0\uFE0F ${error.message}`;
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
