import crypto from 'node:crypto';

export class TtsService {
  // `voices` is an ordered list of { key, id, label }; the first configured one
  // is the default. The teacher picks between them per phrase.
  constructor({ apiKey, voices = [], model = 'eleven_flash_v2_5', outputFormat = 'mp3_44100_128', prefetchCount = 2, timeoutMs = 15000 }) {
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
    // The teacher waits on this call before the phrase reaches the student, so
    // a hung request must give up in time to fall back to the browser voice.
    this.timeoutMs = Number(timeoutMs || 15000);
    this.cache = new Map();
    this.playTokens = new Map();
    this.maxCacheItems = 180;
    this.ttlMs = 30 * 60 * 1000;
    // A lesson runs far longer than the audio cache lives, and "Повторить"
    // must still work an hour after the phrase was spoken, so play tokens
    // outlive the buffers they point at (the audio is regenerated on demand).
    this.playTokenTtlMs = 8 * 60 * 60 * 1000;
    // Remembered so /health and the teacher cabinet can say *why* the premium
    // voice went quiet instead of leaving everyone guessing.
    this.lastError = null;
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
        throw this.rememberError(error);
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
    // The teacher waits on this call before the phrase reaches the student, so
    // the timeout covers reading the audio body too, not just the headers.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
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
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const detail = await response.text();
        const friendly = describeTtsStatus(response.status);
        // The full body goes to the server log; only the readable half is handed
        // to the teacher and to /health.
        throw Object.assign(
          new Error(`${friendly} (HTTP ${response.status}: ${detail.slice(0, 300)})`),
          { friendly }
        );
      }
      const arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer.byteLength) {
        throw Object.assign(new Error('ElevenLabs вернул пустой аудиофайл'), { friendly: 'ElevenLabs вернул пустой аудиофайл' });
      }
      this.lastError = null;
      return Buffer.from(arrayBuffer);
    } catch (error) {
      if (controller.signal.aborted) {
        const friendly = `ElevenLabs не ответил за ${Math.round(this.timeoutMs / 1000)} с`;
        throw this.rememberError(Object.assign(new Error(friendly), { friendly }));
      }
      throw this.rememberError(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  rememberError(error) {
    this.lastError = { message: this.describeError(error), at: new Date().toISOString() };
    return error;
  }

  // A message safe to show in the teacher cabinet: named cause for an HTTP
  // failure, a plain network note otherwise.
  describeError(error) {
    if (error?.friendly) return error.friendly;
    if (error?.name === 'AbortError' || /fetch failed|network|ENOTFOUND|ECONNRESET|timeout/i.test(String(error?.message || ''))) {
      return 'Сервер не смог связаться с ElevenLabs (сеть недоступна)';
    }
    return String(error?.message || 'Неизвестная ошибка озвучивания');
  }

  prune() {
    const now = Date.now();
    for (const [key, value] of this.playTokens.entries()) {
      if (now - value.createdAt > this.playTokenTtlMs) this.playTokens.delete(key);
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

// ElevenLabs failures are almost always operational (an expired key, spent
// credits, throttling) rather than a bug, so name the cause in the message that
// reaches the teacher instead of a bare status code.
function describeTtsStatus(status) {
  if (status === 401 || status === 403) return 'ElevenLabs отклонил ключ ELEVENLABS_API_KEY';
  if (status === 402) return 'На аккаунте ElevenLabs закончились символы (квота исчерпана)';
  if (status === 404) return 'Голос ElevenLabs не найден — проверьте ELEVENLABS_VOICE_ID';
  if (status === 422) return 'ElevenLabs не принял текст или настройки голоса';
  if (status === 429) return 'ElevenLabs ограничил частоту запросов — попробуйте ещё раз';
  if (status >= 500) return 'Сервис ElevenLabs временно недоступен';
  return 'ElevenLabs вернул ошибку';
}
