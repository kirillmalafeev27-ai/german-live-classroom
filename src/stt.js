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

  async transcribe({ buffer, mimeType = 'audio/webm', filename, language, prompt = '' }) {
    if (!this.enabled) throw new Error('AITUNNEL_API_KEY is not configured');
    if (!buffer || !buffer.length) throw new Error('Пустая аудиозапись');

    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType }), filename || defaultFilename(mimeType));
    form.append('model', this.model);
    form.append('response_format', 'json');
    const lang = language || this.language;
    if (lang) form.append('language', lang);
    if (prompt) form.append('prompt', prompt);

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
      return String(data?.text || '').trim();
    } finally {
      clearTimeout(timeout);
    }
  }
}

function defaultFilename(mimeType) {
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'speech.mp4';
  if (mimeType.includes('ogg')) return 'speech.ogg';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'speech.mp3';
  if (mimeType.includes('wav')) return 'speech.wav';
  return 'speech.webm';
}
