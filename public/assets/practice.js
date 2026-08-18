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
var silentClip = "";
function silentClipUrl(seconds = 0.05, sampleRate = 8e3) {
  if (silentClip) return silentClip;
  const frames = Math.max(1, Math.round(seconds * sampleRate));
  const buffer = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(buffer);
  const ascii = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + frames * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, frames * 2, true);
  silentClip = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
  return silentClip;
}
function isAutoplayBlocked(error) {
  if (!error) return false;
  if (error.name === "NotAllowedError") return true;
  return /didn'?t interact|user gesture|user activation|not allowed|autoplay/i.test(String(error.message || ""));
}
function describeAudioError(error) {
  if (isAutoplayBlocked(error)) return "\u0411\u0440\u0430\u0443\u0437\u0435\u0440 \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043B \u0437\u0432\u0443\u043A. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0437\u0432\u0443\u043A\xBB \u043E\u0434\u0438\u043D \u0440\u0430\u0437 \u2014 \u0434\u0430\u043B\u044C\u0448\u0435 \u0432\u0441\u0451 \u0438\u0433\u0440\u0430\u0435\u0442 \u0441\u0430\u043C\u043E.";
  if (error?.name === "NotSupportedError") return "\u0411\u0440\u0430\u0443\u0437\u0435\u0440 \u043D\u0435 \u0441\u043C\u043E\u0433 \u043F\u0440\u043E\u0438\u0433\u0440\u0430\u0442\u044C \u044D\u0442\u043E \u0430\u0443\u0434\u0438\u043E. \u041E\u0431\u043D\u043E\u0432\u0438\u0442\u0435 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443 \u0438\u043B\u0438 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 Chrome/Safari \u043F\u043E\u0441\u0432\u0435\u0436\u0435\u0435.";
  return `\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0432\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0441\u0442\u0438 \u0430\u0443\u0434\u0438\u043E: ${error?.message || "\u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430"}`;
}
function createAudioGate({ onChange = () => {
} } = {}) {
  let element = null;
  let context = null;
  let unlocked = false;
  let pending = null;
  let unlocking = null;
  const ensureElement = () => {
    if (element) return element;
    element = new Audio();
    element.preload = "auto";
    element.playsInline = true;
    element.setAttribute("playsinline", "");
    return element;
  };
  const markUnlocked = () => {
    if (unlocked) return;
    unlocked = true;
    try {
      onChange(true);
    } catch {
    }
  };
  const primeSpeech = () => {
    if (!("speechSynthesis" in window)) return;
    try {
      const utterance = new SpeechSynthesisUtterance(" ");
      utterance.volume = 0;
      utterance.lang = "de-DE";
      speechSynthesis.speak(utterance);
      speechSynthesis.cancel();
    } catch {
    }
  };
  async function runUnlock() {
    const el = ensureElement();
    let started = null;
    try {
      el.src = silentClipUrl();
      started = el.play();
    } catch {
    }
    primeSpeech();
    try {
      await started;
      el.pause();
      try {
        el.currentTime = 0;
      } catch {
      }
      markUnlocked();
    } catch {
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      try {
        context = context || new AudioContextClass();
        if (context.state === "suspended") await context.resume();
        const source = context.createBufferSource();
        source.buffer = context.createBuffer(1, 1, 22050);
        source.connect(context.destination);
        source.start(0);
      } catch {
      }
    }
    return unlocked;
  }
  const clearPending = (mode = "resolve", error = null) => {
    const current = pending;
    pending = null;
    if (!current) return;
    current.cleanup();
    if (mode === "reject") current.reject(error || new Error("\u0412\u043E\u0441\u043F\u0440\u043E\u0438\u0437\u0432\u0435\u0434\u0435\u043D\u0438\u0435 \u043F\u0440\u0435\u0440\u0432\u0430\u043D\u043E"));
    else current.resolve();
  };
  return {
    get unlocked() {
      return unlocked;
    },
    get element() {
      return ensureElement();
    },
    // Call this synchronously from a real user gesture (click/tap/keydown).
    // Concurrent calls (the document-wide listener and the banner click fire
    // together) share one attempt instead of interrupting each other.
    unlock() {
      if (unlocked) return Promise.resolve(true);
      if (unlocking) return unlocking;
      unlocking = runUnlock().finally(() => {
        unlocking = null;
      });
      return unlocking;
    },
    // Resolves when the clip finishes; rejects with the browser error when the
    // browser refuses to start it, so callers can offer the unlock button.
    async play(url, { rate = 1 } = {}) {
      const el = ensureElement();
      clearPending("resolve");
      try {
        el.pause();
      } catch {
      }
      el.src = url;
      try {
        el.load();
      } catch {
      }
      el.playbackRate = rate;
      await el.play();
      markUnlocked();
      try {
        el.playbackRate = rate;
      } catch {
      }
      return new Promise((resolve, reject) => {
        const onEnded = () => clearPending("resolve");
        const onError = () => clearPending("reject", new Error("\u0410\u0443\u0434\u0438\u043E \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u043B\u043E\u0441\u044C"));
        const cleanup = () => {
          el.removeEventListener("ended", onEnded);
          el.removeEventListener("error", onError);
        };
        pending = { resolve, reject, cleanup };
        el.addEventListener("ended", onEnded);
        el.addEventListener("error", onError);
        if (el.ended) clearPending("resolve");
      });
    },
    stop() {
      clearPending("resolve");
      if (element) {
        try {
          element.pause();
        } catch {
        }
      }
      if ("speechSynthesis" in window) {
        try {
          speechSynthesis.cancel();
        } catch {
        }
      }
    }
  };
}
function unlockOnFirstGesture(gate, done = () => {
}) {
  const events = ["pointerdown", "touchstart", "keydown"];
  const detach = () => events.forEach((name) => document.removeEventListener(name, handler, true));
  function handler() {
    Promise.resolve(gate.unlock()).then(() => {
      if (!gate.unlocked) return;
      detach();
      done(true);
    }).catch(() => {
    });
  }
  events.forEach((name) => document.addEventListener(name, handler, true));
  return detach;
}

// src/client/practice.js
var PROGRESS_STORAGE_KEY = "glc.practiceProgress.v1";
var LEVEL_STORAGE_KEY = "glc.practiceLevel";
var state = {
  curricula: { A1: [], A2: [] },
  scenariosByLevel: { A1: {}, A2: {} },
  lessons: [],
  scenarios: {},
  config: { sttEnabled: false, ttsEnabled: false, aiEnabled: false },
  level: localStorage.getItem(LEVEL_STORAGE_KEY) === "A2" ? "A2" : "A1",
  moduleId: 1,
  mode: "dialog",
  scenarioId: "",
  history: [],
  started: false,
  busy: false,
  capture: null,
  micOn: false,
  lastAiText: "",
  audio: null,
  speaking: false,
  pendingSpeech: null,
  pendingInputMethod: "typed",
  progress: loadProgress()
};
var els = {};
document.addEventListener("DOMContentLoaded", boot);
async function boot() {
  cache();
  state.audio = createAudioGate({ onChange: (unlocked) => {
    if (unlocked) hideUnlockBanner();
  } });
  unlockOnFirstGesture(state.audio, () => flushPendingSpeech());
  bind();
  try {
    const [curriculum, practice] = await Promise.all([
      fetchJson("/api/curriculum"),
      fetchJson("/api/practice/scenarios")
    ]);
    state.curricula = {
      A1: practice.curricula?.A1 || curriculum.lessons || [],
      A2: practice.curricula?.A2 || []
    };
    state.scenariosByLevel = {
      A1: practice.scenariosByLevel?.A1 || practice.scenarios || {},
      A2: practice.scenariosByLevel?.A2 || {}
    };
    state.config = {
      sttEnabled: Boolean(practice.sttEnabled),
      ttsEnabled: Boolean(practice.ttsEnabled),
      aiEnabled: Boolean(practice.aiEnabled)
    };
    applyLevel(state.level, { resetConversation: false });
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
  els.levelSelect = $("#levelSelect");
  els.moduleSelect = $("#moduleSelect");
  els.modeSelect = $("#modeSelect");
  els.scenarioField = $("#scenarioField");
  els.scenarioSelect = $("#scenarioSelect");
  els.startButton = $("#startButton");
  els.setupHint = $("#setupHint");
  els.vocabularySummary = $("#vocabularySummary");
  els.practiceVocabulary = $("#practiceVocabulary");
  els.progressCaption = $("#progressCaption");
  els.progressSummary = $("#progressSummary");
  els.progressModules = $("#progressModules");
  els.resetProgressButton = $("#resetProgressButton");
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
  els.audioUnlock = $("#audioUnlock");
}
function bind() {
  els.levelSelect.addEventListener("change", () => applyLevel(els.levelSelect.value));
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
  els.startButton.addEventListener("click", () => {
    void unlockAudio().then(startSession);
  });
  els.resetProgressButton.addEventListener("click", resetCurrentLevelProgress);
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
  els.audioUnlock.addEventListener("click", () => unlockAudio({ announce: true }));
  els.typedForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = els.typedInput.value.trim();
    if (!text) return;
    els.typedInput.value = "";
    sendUser(text, "typed");
  });
}
function applyLevel(level, { resetConversation = true } = {}) {
  state.level = level === "A2" ? "A2" : "A1";
  localStorage.setItem(LEVEL_STORAGE_KEY, state.level);
  els.levelSelect.value = state.level;
  state.lessons = state.curricula[state.level] || [];
  state.scenarios = state.scenariosByLevel[state.level] || {};
  if (!state.lessons.some((lesson) => lesson.id === state.moduleId)) state.moduleId = 1;
  state.scenarioId = "";
  renderModules();
  onSetupChange();
  renderProgress();
  if (resetConversation) {
    stopAudio();
    state.started = false;
    state.history = [];
    state.lastAiText = "";
    els.startButton.textContent = "\u041D\u0430\u0447\u0430\u0442\u044C";
    els.liveTranscript.textContent = `\u0412\u044B\u0431\u0440\u0430\u043D \u0443\u0440\u043E\u0432\u0435\u043D\u044C ${state.level}. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u041D\u0430\u0447\u0430\u0442\u044C\xBB, \u0437\u0430\u0442\u0435\u043C \u043E\u0442\u0432\u0435\u0447\u0430\u0439\u0442\u0435 \u0433\u043E\u043B\u043E\u0441\u043E\u043C \u0438\u043B\u0438 \u0442\u0435\u043A\u0441\u0442\u043E\u043C.`;
    els.correctionLine.hidden = true;
    els.revealBox.hidden = true;
    els.hintBox.hidden = true;
    els.listenState.textContent = "\u0421\u043E\u0431\u0435\u0441\u0435\u0434\u043D\u0438\u043A \u0436\u0434\u0451\u0442";
  }
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
    els.setupHint.innerHTML = `<div><b>${state.level} \xB7 \u0418\u0418 \u0438\u0433\u0440\u0430\u0435\u0442:</b> ${esc(sc.aiRole)}. <b>\u0412\u044B:</b> ${esc(sc.userRole)}.</div><div><b>\u0417\u0430\u0434\u0430\u0447\u0430:</b> ${esc(sc.goal)}</div><div><b>\u0413\u0440\u0430\u043C\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0444\u043E\u043A\u0443\u0441:</b> ${esc(sc.focus || (lesson?.grammar || []).join(" \xB7 "))}</div>`;
  } else if (lesson) {
    els.setupHint.innerHTML = `<div><b>${state.level} \xB7 \u0413\u0440\u0430\u043C\u043C\u0430\u0442\u0438\u043A\u0430:</b> ${esc((lesson.grammar || []).join(" \xB7 ")) || "\u2014"}</div><div><b>\u0422\u0435\u043C\u044B:</b> ${esc((lesson.themes || []).join(" \xB7 ")) || "\u2014"}</div>`;
  }
  renderVocabulary();
  renderProgress();
}
function renderVocabulary() {
  const lesson = currentLesson();
  const vocabulary = lesson?.vocabulary || [];
  els.vocabularySummary.textContent = `\u0421\u043B\u043E\u0432\u0430\u0440\u044C \u043C\u043E\u0434\u0443\u043B\u044F (${vocabulary.length}) \xB7 PDF-\u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0430 ${lesson?.sourcePdfPage || "\u2014"}`;
  els.practiceVocabulary.innerHTML = vocabulary.map((word) => `<span class="practice-vocab-chip" lang="de">${esc(word)}</span>`).join("") || '<span class="empty-small">\u0421\u043B\u043E\u0432\u0430\u0440\u044C \u043F\u043E\u043A\u0430 \u043D\u0435 \u0434\u043E\u0431\u0430\u0432\u043B\u0435\u043D</span>';
}
function emptyLevelProgress() {
  return {
    sessions: 0,
    turns: 0,
    correct: 0,
    corrections: 0,
    currentStreak: 0,
    bestStreak: 0,
    voiceTurns: 0,
    typedTurns: 0,
    lastPracticedAt: "",
    modules: {}
  };
}
function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) || "{}");
    return {
      version: 1,
      levels: {
        A1: { ...emptyLevelProgress(), ...saved.levels?.A1 || {} },
        A2: { ...emptyLevelProgress(), ...saved.levels?.A2 || {} }
      }
    };
  } catch {
    return { version: 1, levels: { A1: emptyLevelProgress(), A2: emptyLevelProgress() } };
  }
}
function currentLevelProgress() {
  if (!state.progress.levels[state.level]) state.progress.levels[state.level] = emptyLevelProgress();
  const progress = state.progress.levels[state.level];
  if (!progress.modules || typeof progress.modules !== "object") progress.modules = {};
  return progress;
}
function currentModuleProgress() {
  const progress = currentLevelProgress();
  const key = String(state.moduleId);
  if (!progress.modules[key]) {
    progress.modules[key] = { sessions: 0, turns: 0, correct: 0, corrections: 0, lastPracticedAt: "" };
  }
  return progress.modules[key];
}
function saveProgress() {
  localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(state.progress));
  renderProgress();
}
function recordSessionStart() {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const level = currentLevelProgress();
  const module = currentModuleProgress();
  level.sessions += 1;
  level.lastPracticedAt = now;
  module.sessions += 1;
  module.lastPracticedAt = now;
  saveProgress();
}
function recordPracticeTurn({ corrected, method }) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const level = currentLevelProgress();
  const module = currentModuleProgress();
  level.turns += 1;
  module.turns += 1;
  if (corrected) {
    level.corrections += 1;
    module.corrections += 1;
    level.currentStreak = 0;
  } else {
    level.correct += 1;
    module.correct += 1;
    level.currentStreak += 1;
    level.bestStreak = Math.max(level.bestStreak, level.currentStreak);
  }
  if (method === "voice") level.voiceTurns += 1;
  else level.typedTurns += 1;
  level.lastPracticedAt = now;
  module.lastPracticedAt = now;
  saveProgress();
}
function renderProgress() {
  const progress = currentLevelProgress();
  const accuracy = progress.turns ? Math.round(progress.correct / progress.turns * 100) : 0;
  const lastDate = progress.lastPracticedAt ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(progress.lastPracticedAt)) : "\u0435\u0449\u0451 \u043D\u0435 \u0431\u044B\u043B\u043E \u0437\u0430\u043D\u044F\u0442\u0438\u0439";
  els.progressCaption.textContent = `${state.level}: \u0434\u0430\u043D\u043D\u044B\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0432 \u044D\u0442\u043E\u043C \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435 \xB7 \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u044F\u044F \u043F\u0440\u0430\u043A\u0442\u0438\u043A\u0430: ${lastDate}`;
  els.progressSummary.innerHTML = [
    ["\u0417\u0430\u043D\u044F\u0442\u0438\u0439", progress.sessions],
    ["\u041E\u0442\u0432\u0435\u0442\u043E\u0432", progress.turns],
    ["\u0411\u0435\u0437 \u0438\u0441\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0439", `${accuracy}%`],
    ["\u041B\u0443\u0447\u0448\u0430\u044F \u0441\u0435\u0440\u0438\u044F", progress.bestStreak]
  ].map(([label, value]) => `<div class="progress-stat"><b>${value}</b><span>${label}</span></div>`).join("");
  els.progressModules.innerHTML = state.lessons.map((lesson) => {
    const module = progress.modules?.[String(lesson.id)] || { sessions: 0, turns: 0, correct: 0 };
    const moduleAccuracy = module.turns ? Math.round(module.correct / module.turns * 100) : 0;
    return `<div class="progress-module ${module.turns ? "" : "empty"}" title="${esc(lesson.title)}">
      <div class="progress-module-head"><b>${lesson.id}. ${esc(lesson.title)}</b><small>${module.turns} \u043E\u0442\u0432. \xB7 ${moduleAccuracy}%</small></div>
      <div class="progress-bar"><span style="width:${module.turns ? Math.max(4, moduleAccuracy) : 0}%"></span></div>
    </div>`;
  }).join("");
}
function resetCurrentLevelProgress() {
  if (!confirm(`\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0432\u0441\u044E \u0441\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0443 \u0443\u0440\u043E\u0432\u043D\u044F ${state.level} \u043D\u0430 \u044D\u0442\u043E\u043C \u0443\u0441\u0442\u0440\u043E\u0439\u0441\u0442\u0432\u0435?`)) return;
  state.progress.levels[state.level] = emptyLevelProgress();
  saveProgress();
  toast(`\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430 ${state.level} \u0441\u0431\u0440\u043E\u0448\u0435\u043D\u0430`, "success");
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
  state.pendingInputMethod = "typed";
  els.correctionLine.hidden = true;
  els.revealBox.hidden = true;
  els.hintBox.hidden = true;
  els.startButton.textContent = "\u041D\u0430\u0447\u0430\u0442\u044C \u0437\u0430\u043D\u043E\u0432\u043E";
  recordSessionStart();
  const lesson = currentLesson();
  const sc = currentScenario();
  els.liveTranscript.textContent = state.mode === "roleplay" && sc ? `\u0420\u043E\u043B\u044C \u0418\u0418: ${sc.aiRole}. \u041E\u0442\u0432\u0435\u0442\u044C\u0442\u0435 \u0433\u043E\u043B\u043E\u0441\u043E\u043C \u0438\u043B\u0438 \u0442\u0435\u043A\u0441\u0442\u043E\u043C.` : `\u041E\u0442\u0432\u0435\u0447\u0430\u0439\u0442\u0435 \u043F\u043E-\u043D\u0435\u043C\u0435\u0446\u043A\u0438, \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u044F: ${(lesson?.grammar || []).join(", ")}`;
  if (state.mode === "roleplay" && sc?.opener) {
    presentAiTurn(sc.opener, "", "");
    state.history.push({ role: "ai", text: sc.opener });
  } else {
    await requestReply();
  }
}
async function sendUser(text, method = "typed") {
  const value = String(text || "").trim();
  if (!value || state.busy) return;
  if (!state.started) {
    toast("\u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u041D\u0430\u0447\u0430\u0442\u044C\xBB", "error");
    return;
  }
  els.liveTranscript.textContent = `\u0412\u044B \u0441\u043A\u0430\u0437\u0430\u043B\u0438: \xAB${value}\xBB`;
  els.correctionLine.hidden = true;
  state.history.push({ role: "user", text: value });
  state.pendingInputMethod = method === "voice" ? "voice" : "typed";
  await requestReply();
}
async function requestReply() {
  if (state.busy) return;
  state.busy = true;
  els.status.textContent = "\u0418\u0418 \u0434\u0443\u043C\u0430\u0435\u0442\u2026";
  els.status.className = "status-badge pending";
  els.listenState.textContent = "\u0421\u043E\u0431\u0435\u0441\u0435\u0434\u043D\u0438\u043A \u043F\u0435\u0447\u0430\u0442\u0430\u0435\u0442\u2026";
  const shouldScore = state.history.at(-1)?.role === "user";
  const inputMethod = state.pendingInputMethod;
  try {
    const data = await fetchJson("/api/practice/reply", {
      method: "POST",
      body: {
        level: state.level,
        moduleId: state.moduleId,
        mode: state.mode,
        scenarioId: state.scenarioId,
        history: state.history.slice(-40)
      }
    });
    const reply = data.reply_de || "\u2026";
    state.history.push({ role: "ai", text: reply });
    if (shouldScore) recordPracticeTurn({ corrected: Boolean(data.correction), method: inputMethod });
    presentAiTurn(reply, data.correction, data.hint_ru);
    els.status.textContent = "\u0412\u0430\u0448 \u0445\u043E\u0434";
    els.status.className = "status-badge ok";
    if (data.done) {
      state.started = false;
      els.status.textContent = "\u0422\u0440\u0435\u043D\u0438\u0440\u043E\u0432\u043A\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0430";
      els.startButton.textContent = "\u041D\u0430\u0447\u0430\u0442\u044C \u0437\u0430\u043D\u043E\u0432\u043E";
    }
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
  if (!state.lastAiText) return;
  void unlockAudio().then(() => speak(state.lastAiText, rate));
}
function hideUnlockBanner() {
  if (!els.audioUnlock) return;
  els.audioUnlock.hidden = true;
  els.audioUnlock.classList.remove("needed");
}
function showUnlockBanner() {
  if (!els.audioUnlock) return;
  els.audioUnlock.hidden = false;
  els.audioUnlock.classList.add("needed");
}
async function unlockAudio({ announce = false } = {}) {
  await state.audio.unlock();
  if (!state.audio.unlocked) {
    if (announce) toast("\u0411\u0440\u0430\u0443\u0437\u0435\u0440 \u0432\u0441\u0451 \u0435\u0449\u0451 \u0431\u043B\u043E\u043A\u0438\u0440\u0443\u0435\u0442 \u0437\u0432\u0443\u043A. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435, \u0447\u0442\u043E \u0432\u043A\u043B\u0430\u0434\u043A\u0430 \u043D\u0435 \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D\u0430 (\u0438\u043A\u043E\u043D\u043A\u0430 \u0434\u0438\u043D\u0430\u043C\u0438\u043A\u0430).", "error", 6e3);
    return false;
  }
  hideUnlockBanner();
  if (announce) toast("\u0417\u0432\u0443\u043A \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D", "success");
  flushPendingSpeech();
  return true;
}
function flushPendingSpeech() {
  const pending = state.pendingSpeech;
  state.pendingSpeech = null;
  if (pending) void speak(pending.text, pending.rate);
}
async function speak(text, rate = 1) {
  if (!state.config.ttsEnabled || !text) return;
  state.audio.stop();
  state.speaking = true;
  state.capture?.pause();
  let objectUrl = "";
  try {
    const response = await fetch("/api/practice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    if (!response.ok) throw new Error(`\u0441\u0435\u0440\u0432\u0435\u0440 \u043E\u0437\u0432\u0443\u0447\u0438\u0432\u0430\u043D\u0438\u044F \u043E\u0442\u0432\u0435\u0442\u0438\u043B ${response.status}`);
    const blob = await response.blob();
    objectUrl = URL.createObjectURL(blob);
    await state.audio.play(objectUrl, { rate });
  } catch (error) {
    reportSpeakFailure(text, rate, error);
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    state.speaking = false;
    setTimeout(() => state.capture?.resume(), 220);
  }
}
function reportSpeakFailure(text, rate, error) {
  if (isAutoplayBlocked(error)) {
    state.pendingSpeech = { text, rate };
    showUnlockBanner();
    els.listenState.textContent = "\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \xAB\u0412\u043A\u043B\u044E\u0447\u0438\u0442\u044C \u0437\u0432\u0443\u043A\xBB, \u0447\u0442\u043E\u0431\u044B \u0443\u0441\u043B\u044B\u0448\u0430\u0442\u044C \u043E\u0442\u0432\u0435\u0442";
    els.audioUnlock?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  } else {
    els.listenState.textContent = "\u0417\u0432\u0443\u043A \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u2014 \u043E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0442\u0435\u043A\u0441\u0442 \u043A\u043D\u043E\u043F\u043A\u043E\u0439 \xAB\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0442\u0435\u043A\u0441\u0442\xBB";
  }
  toast(describeAudioError(error), "error", 5e3);
}
function stopAudio() {
  state.audio?.stop();
}
async function startMic() {
  if (state.micOn || !state.config.sttEnabled) return;
  try {
    void unlockAudio();
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
  if (state.speaking) return;
  try {
    const text = await transcribeAudio(blob, { path: "/api/practice/transcribe" });
    if (!text) {
      els.liveTranscript.textContent = "\u{1F507} \u041D\u0435 \u0440\u0430\u0441\u0441\u043B\u044B\u0448\u0430\u043B. \u041F\u043E\u0432\u0442\u043E\u0440\u0438\u0442\u0435.";
      return;
    }
    await sendUser(text, "voice");
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
