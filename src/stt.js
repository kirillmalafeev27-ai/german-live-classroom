// Speech-to-text via AITUNNEL Whisper (OpenAI-compatible /v1/audio/transcriptions).
// The AITUNNEL API key never leaves the server: the browser records short audio
// segments and posts them to /api/stt/transcribe, which forwards them here.

export class SttService {
  constructor({ apiKey, baseUrl, model, language = 'de', timeoutMs = 30000 } = {}) {
    this.apiKey = apiKey;
    this.baseUrl = String(baseUrl || 'https://api.aitunnel.ru/v1').replace(/\/$/, '');
    this.model = model || 'whisper-1';
    this.language = language;
    this.timeoutMs = Number(timeoutMs || 30000);
  }

  get enabled() {
    return Boolean(this.apiKey);
  }

  async transcribe({ buffer, mimeType = 'audio/webm', filename, language }) {
    if (!this.enabled) throw new Error('AITUNNEL_API_KEY is not configured');
    if (!buffer || !buffer.length) throw new Error('Пустая аудиозапись');

    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType }), filename || defaultFilename(mimeType));
    form.append('model', this.model);
    form.append('response_format', 'json');
    // temperature 0 = deterministic, less prone to hallucinating on quiet audio.
    form.append('temperature', '0');
    const lang = language || this.language;
    if (lang) form.append('language', lang);
    // Intentionally NO vocabulary prompt: this is a correction app, so Whisper
    // must transcribe exactly what the learner said (mistakes included) rather
    // than being biased toward the "correct" lesson words.

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: controller.signal
      });
      const raw = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${raw.slice(0, 400)}`);
      let data;
      try { data = JSON.parse(raw); } catch { data = { text: raw }; }
      const text = String(data?.text || '').trim();
      return isHallucination(text) ? '' : text;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// Whisper emits recognisable "filler" phrases when handed silence or noise —
// subtitle credits and stock sign-offs from its training data. Treat these as
// no speech so they never reach the lesson.
const HALLUCINATION_PATTERNS = [
  /amara\.?org/i,
  /untertitel/i,
  /untertitelung/i,
  /\bzdf\b/i,
  /\bwdr\b/i,
  /\bswr\b/i,
  /\bard\b/i,
  /im auftrag des/i,
  /vielen dank(?:\s+für'?s?\s+zuschauen)?\.?$/i,
  /danke\s+für'?s?\s+zuschauen/i,
  /danke\s+f[üu]rs?\s+zusehen/i,
  /thanks?\s+for\s+watching/i,
  /please\s+subscribe/i,
  /subtitles?\s+by/i,
  /transcription\s+by/i,
  /\bmooji\b/i,
  /copyright/i
];

export function isHallucination(text) {
  const clean = String(text || '').trim();
  if (!clean) return true;
  const letters = clean.replace(/[^\p{L}]/gu, '');
  if (letters.length < 2) return true; // just punctuation / a lone char
  return HALLUCINATION_PATTERNS.some((pattern) => pattern.test(clean));
}

function defaultFilename(mimeType) {
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'speech.mp4';
  if (mimeType.includes('ogg')) return 'speech.ogg';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'speech.mp3';
  if (mimeType.includes('wav')) return 'speech.wav';
  return 'speech.webm';
}
