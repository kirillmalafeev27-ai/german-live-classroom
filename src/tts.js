import crypto from 'node:crypto';

export class TtsService {
  // `voices` is an ordered list of { key, id, label }; the first configured one
  // is the default. The teacher picks between them per phrase.
  constructor({ apiKey, voices = [], model = 'eleven_flash_v2_5', outputFormat = 'mp3_44100_128', prefetchCount = 2 }) {
    this.apiKey = apiKey;
    this.voices = voices
      .filter((voice) => voice && voice.id)
      .map((voice, index) => ({
        key: String(voice.key || `voice${index + 1}`),
        id: String(voice.id),
        label: String(voice.label || `Голос ${index + 1}`)
      }));
    this.model = model;
    this.outputFormat = outputFormat;
    this.prefetchCount = Number(prefetchCount || 0);
    this.cache = new Map();
    this.playTokens = new Map();
    this.maxCacheItems = 180;
    this.ttlMs = 30 * 60 * 1000;
  }

  get enabled() {
    return Boolean(this.apiKey && this.voices.length);
  }

  get defaultVoice() {
    return this.voices[0] || null;
  }

  get voiceId() {
    return this.defaultVoice?.id || '';
  }

  // Unknown or missing keys fall back to the default voice so a stale client
  // never silences the lesson.
  resolveVoice(key) {
    const wanted = String(key || '');
    return this.voices.find((voice) => voice.key === wanted) || this.defaultVoice;
  }

  // Voice ids stay on the server; the UI only needs keys and labels.
  publicVoices() {
    return this.voices.map(({ key, label }) => ({ key, label }));
  }

  cacheKey(text, voiceId = this.voiceId) {
    return crypto.createHash('sha256')
      .update(`${voiceId}|${this.model}|${this.outputFormat}|${text}`)
      .digest('hex');
  }

  async prefetch(texts, voiceId = this.voiceId) {
    if (!this.enabled || this.prefetchCount <= 0) return [];
    const selected = [...new Set(texts.filter(Boolean))].slice(0, this.prefetchCount);
    return Promise.allSettled(selected.map((text) => this.getBuffer(text, voiceId)));
  }

  async getBuffer(text, voiceId = this.voiceId) {
    if (!this.enabled) throw new Error('ElevenLabs TTS is not configured');
    if (!voiceId) throw new Error('ElevenLabs voice is not configured');
    this.prune();
    const key = this.cacheKey(text, voiceId);
    const existing = this.cache.get(key);
    if (existing?.buffer) return existing.buffer;
    if (existing?.promise) return existing.promise;

    const promise = this.generate(text, voiceId)
      .then((buffer) => {
        this.cache.set(key, { buffer, createdAt: Date.now(), text });
        this.prune();
        return buffer;
      })
      .catch((error) => {
        this.cache.delete(key);
        throw error;
      });

    this.cache.set(key, { promise, createdAt: Date.now(), text });
    return promise;
  }

  createPlayToken({ roomCode, text, transcriptMeta = {}, playbackRate = 1, voiceId = this.voiceId }) {
    this.prune();
    const token = crypto.randomBytes(24).toString('base64url');
    this.playTokens.set(token, {
      roomCode,
      text,
      transcriptMeta,
      playbackRate,
      voiceId,
      createdAt: Date.now()
    });
    return token;
  }

  getPlayToken(token) {
    this.prune();
    return this.playTokens.get(token) || null;
  }

  async generate(text, voiceId = this.voiceId) {
    const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream`);
    url.searchParams.set('output_format', this.outputFormat);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: this.model,
        language_code: 'de',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: true
        }
      })
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`ElevenLabs HTTP ${response.status}: ${detail.slice(0, 500)}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  prune() {
    const now = Date.now();
    for (const [key, value] of this.playTokens.entries()) {
      if (now - value.createdAt > this.ttlMs) this.playTokens.delete(key);
    }
    for (const [key, value] of this.cache.entries()) {
      if (now - value.createdAt > this.ttlMs) this.cache.delete(key);
    }
    if (this.cache.size > this.maxCacheItems) {
      const oldest = [...this.cache.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
      for (const [key] of oldest.slice(0, this.cache.size - this.maxCacheItems)) this.cache.delete(key);
    }
  }
}
