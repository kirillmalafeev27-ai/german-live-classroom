import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import swaggerUi from 'swagger-ui-express';

import { JsonStore } from './store.js';
import { authMiddleware, issueTeacherToken, randomCode, randomPin, randomToken, verifyTeacherToken } from './auth.js';
import { AiService } from './ai.js';
import { TtsService } from './tts.js';
import { SttService } from './stt.js';
import { curriculum, getLesson } from './curriculum.js';
import { a2Curriculum } from './curriculum-a2.js';
import {
  practiceModes, listPracticeScenarios, getScenario, getPracticeLesson, normalizePracticeLevel
} from './practice.js';
import { openapi } from './openapi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 3000);
const sessionSecret = process.env.SESSION_SECRET || 'development-secret-change-me';
const adminPassword = process.env.ADMIN_PASSWORD || 'teacher';
const dataDir = path.resolve(process.env.DATA_DIR || path.join(rootDir, 'data'));
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);

if (process.env.NODE_ENV === 'production' && (sessionSecret === 'development-secret-change-me' || adminPassword === 'teacher')) {
  console.warn('[security] Set ADMIN_PASSWORD and SESSION_SECRET before public deployment.');
}

const store = new JsonStore(dataDir);
await store.init();

const ai = new AiService({
  apiKey: process.env.AITUNNEL_API_KEY,
  baseUrl: process.env.AITUNNEL_BASE_URL,
  model: process.env.AITUNNEL_MODEL || 'gpt-5.4-mini',
  reasoningEffort: process.env.AITUNNEL_REASONING_EFFORT || 'none',
  timeoutMs: process.env.AITUNNEL_TIMEOUT_MS || 20000
});

const tts = new TtsService({
  apiKey: process.env.ELEVENLABS_API_KEY,
  voices: [
    {
      key: 'primary',
      id: process.env.ELEVENLABS_VOICE_ID,
      label: process.env.ELEVENLABS_VOICE_LABEL || 'Голос 1'
    },
    {
      key: 'secondary',
      id: process.env.ELEVENLABS_VOICE_ID_2,
      label: process.env.ELEVENLABS_VOICE_LABEL_2 || 'Голос 2'
    }
  ],
  model: process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5',
  outputFormat: process.env.ELEVENLABS_TTS_OUTPUT || 'mp3_44100_128',
  prefetchCount: process.env.TTS_PREFETCH_COUNT || 2
});

const stt = new SttService({
  apiKey: process.env.AITUNNEL_STT_API_KEY || process.env.AITUNNEL_API_KEY,
  baseUrl: process.env.AITUNNEL_STT_BASE_URL || process.env.AITUNNEL_BASE_URL,
  model: process.env.AITUNNEL_STT_MODEL || 'whisper-1',
  language: process.env.AITUNNEL_STT_LANGUAGE || 'de',
  timeoutMs: process.env.AITUNNEL_STT_TIMEOUT_MS || 30000
});

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: allowedOrigins.length ? { origin: allowedOrigins, credentials: false } : undefined,
  maxHttpBufferSize: 1e6,
  pingTimeout: 20000,
  pingInterval: 10000
});

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      mediaSrc: ["'self'", 'blob:', 'data:'],
      connectSrc: ["'self'", 'https://api.elevenlabs.io', 'wss://api.elevenlabs.io', 'https://api.aitunnel.ru'],
      fontSrc: ["'self'", 'data:']
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.RATE_LIMIT_PER_MINUTE || 180),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (req) => req.path === '/health' || req.path.startsWith('/socket.io')
}));

const requireTeacher = authMiddleware(sessionSecret);
const turnState = new Map();
const teacherVoiceState = new Map();

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'german-live-classroom',
    aitunnel: ai.enabled,
    stt: stt.enabled,
    sttModel: stt.model,
    elevenlabsTts: tts.enabled,
    ttsVoices: tts.publicVoices().map((voice) => voice.key),
    model: ai.model,
    now: new Date().toISOString()
  });
});

app.get('/api/config', (_req, res) => {
  res.json({
    model: ai.model,
    aitunnelEnabled: ai.enabled,
    sttEnabled: stt.enabled,
    sttModel: stt.model,
    sttProvider: 'aitunnel-whisper',
    elevenlabsTtsEnabled: tts.enabled,
    ttsModel: tts.model,
    ttsVoices: tts.publicVoices(),
    demoMode: !ai.enabled || !tts.enabled,
    version: '1.1.0'
  });
});

app.post('/api/auth/login', (req, res) => {
  const token = issueTeacherToken({
    secret: sessionSecret,
    password: String(req.body?.password || ''),
    expectedPassword: adminPassword
  });
  if (!token) return res.status(401).json({ error: 'Неверный пароль' });
  res.json({ token, expiresIn: 43_200 });
});

app.get('/api/curriculum', (_req, res) => res.json({ lessons: curriculum }));

// ----- Self-study practice (no teacher, no room) -----

app.get('/api/practice/scenarios', (_req, res) => {
  res.json({
    modes: practiceModes,
    scenarios: listPracticeScenarios(),
    curricula: { A1: curriculum, A2: a2Curriculum },
    scenariosByLevel: { A1: listPracticeScenarios('A1'), A2: listPracticeScenarios('A2') },
    sttEnabled: stt.enabled,
    ttsEnabled: tts.enabled,
    aiEnabled: ai.enabled
  });
});

app.post('/api/practice/reply', async (req, res) => {
  const level = normalizePracticeLevel(req.body?.level);
  const moduleId = Number(req.body?.moduleId);
  const lesson = getPracticeLesson(level, moduleId);
  if (!lesson) return res.status(400).json({ error: 'Неизвестный модуль' });
  const mode = req.body?.mode === 'roleplay' ? 'roleplay' : 'dialog';
  const scenario = mode === 'roleplay' ? getScenario(moduleId, String(req.body?.scenarioId || ''), level) : null;
  if (mode === 'roleplay' && !scenario) return res.status(400).json({ error: 'Неизвестный сценарий' });
  if (!ai.enabled) return res.status(503).json({ error: 'AITUNNEL не настроен' });

  const history = Array.isArray(req.body?.history)
    ? req.body.history.slice(-40).map((turn) => ({
        role: turn?.role === 'ai' ? 'ai' : 'user',
        text: cleanText(turn?.text, 500)
      })).filter((turn) => turn.text)
    : [];
  const userText = cleanText(req.body?.userText, 500);

  try {
    const reply = await ai.practiceReply({ level, moduleId, mode, scenario, history, userText });
    res.json({ ...reply, model: ai.model });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post(
  '/api/practice/transcribe',
  express.raw({ type: () => true, limit: '25mb' }),
  async (req, res) => {
    if (!stt.enabled) return res.status(503).json({ error: 'STT не настроен' });
    const buffer = Buffer.isBuffer(req.body) ? req.body : null;
    if (!buffer || !buffer.length) return res.status(400).json({ error: 'Пустая аудиозапись' });
    try {
      const text = await stt.transcribe({ buffer, mimeType: req.get('content-type') || 'audio/webm' });
      res.json({ text });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  }
);

app.post('/api/practice/tts', async (req, res, next) => {
  const text = cleanText(req.body?.text, 400);
  if (!text) return res.status(400).json({ error: 'Пустой текст' });
  if (!tts.enabled) return res.status(503).json({ error: 'Озвучивание не настроено' });
  try {
    const buffer = await tts.getBuffer(text);
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, max-age=300'
    });
    res.end(buffer);
  } catch (error) { next(error); }
});

app.get('/api/profiles', requireTeacher, (_req, res) => {
  res.json({ profiles: store.listProfiles() });
});

app.post('/api/profiles', requireTeacher, async (req, res, next) => {
  try {
    const profile = await store.createProfile(req.body || {});
    res.status(201).json({ profile });
  } catch (error) { next(error); }
});

app.patch('/api/profiles/:id', requireTeacher, async (req, res, next) => {
  try {
    const profile = await store.updateProfile(req.params.id, req.body || {});
    if (!profile) return res.status(404).json({ error: 'Профиль не найден' });
    res.json({ profile });
  } catch (error) { next(error); }
});

app.delete('/api/profiles/:id', requireTeacher, async (req, res, next) => {
  try {
    const deleted = await store.deleteProfile(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Профиль не найден' });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.get('/api/profiles/:id/sessions', requireTeacher, (req, res) => {
  res.json({ sessions: store.listSessionsForProfile(req.params.id) });
});

app.post('/api/sessions', requireTeacher, async (req, res, next) => {
  try {
    const profile = store.getProfile(req.body?.profileId);
    if (!profile) return res.status(400).json({ error: 'Выберите существующий профиль ученика' });
    const lesson = getLesson(req.body?.lessonId || profile.lessonIds?.[0] || 1);
    if (!lesson) return res.status(400).json({ error: 'Неизвестный модуль' });

    let code;
    do code = randomCode(); while (store.getSession(code));
    const studentPin = randomPin();
    const studentToken = randomToken();
    const session = await store.createSession({
      code,
      studentPin,
      studentToken,
      profileId: profile.id,
      lessonId: lesson.id
    });
    const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const studentUrl = `${base}/student?room=${encodeURIComponent(code)}&token=${encodeURIComponent(studentToken)}`;
    res.status(201).json({
      session: publicSession(session),
      studentPin,
      studentToken,
      studentUrl,
      profile,
      lesson
    });
  } catch (error) { next(error); }
});

app.post('/api/sessions/join', async (req, res) => {
  const code = normalizeCode(req.body?.code);
  const pin = String(req.body?.pin || '').trim();
  const session = store.getSession(code);
  if (!session || session.status !== 'active' || session.studentPin !== pin) {
    return res.status(401).json({ error: 'Неверный код комнаты или PIN' });
  }
  res.json({ studentToken: session.studentToken, session: publicSession(session) });
});

app.get('/api/sessions/:code', (req, res) => {
  const code = normalizeCode(req.params.code);
  const session = store.getSession(code);
  if (!session) return res.status(404).json({ error: 'Комната не найдена' });
  const bearer = getBearer(req);
  const teacher = verifyTeacherToken(bearer, sessionSecret);
  const student = bearer && bearer === session.studentToken;
  if (!teacher && !student) return res.status(401).json({ error: 'unauthorized' });
  const profile = store.getProfile(session.profileId);
  const lesson = getLesson(session.lessonId);
  res.json({
    session: publicSession(session),
    profile: teacher ? profile : { name: profile?.name, level: profile?.level },
    lesson,
    turn: turnState.get(code) || null,
    role: teacher ? 'teacher' : 'student'
  });
});

app.get('/api/sessions/:code/logs', requireTeacher, (req, res) => {
  res.json({ logs: store.getSessionLogs(normalizeCode(req.params.code)) });
});

app.post('/api/ai/generate', requireTeacher, async (req, res, next) => {
  try {
    const profile = store.getProfile(req.body?.profileId);
    const lesson = getLesson(req.body?.lessonId);
    if (!profile || !lesson) return res.status(400).json({ error: 'profileId и lessonId обязательны' });
    const candidate = await ai.generate({
      transcript: String(req.body?.transcript || ''),
      profile,
      lesson,
      recentTurns: Array.isArray(req.body?.recentTurns) ? req.body.recentTurns : [],
      action: req.body?.action || 'AUTO',
      scaffoldLevel: Number(req.body?.scaffoldLevel || 0),
      teacherInstruction: String(req.body?.teacherInstruction || ''),
      requiredWords: cleanWordList(req.body?.requiredWords)
    });
    res.json({ candidate, model: ai.model });
  } catch (error) { next(error); }
});

app.post('/api/ai/transform', requireTeacher, async (req, res, next) => {
  try {
    const profile = store.getProfile(req.body?.profileId);
    const lesson = getLesson(req.body?.lessonId);
    if (!profile || !lesson) return res.status(400).json({ error: 'profileId и lessonId обязательны' });
    const candidate = await ai.transform({
      currentText: String(req.body?.currentText || ''),
      transcript: String(req.body?.transcript || ''),
      instruction: String(req.body?.instruction || ''),
      profile,
      lesson,
      scaffoldLevel: Number(req.body?.scaffoldLevel || 0),
      recentTurns: Array.isArray(req.body?.recentTurns) ? req.body.recentTurns : []
    });
    res.json({ candidate, model: ai.model });
  } catch (error) { next(error); }
});

app.post(
  '/api/stt/transcribe',
  express.raw({ type: () => true, limit: '25mb' }),
  async (req, res) => {
    const roomCode = normalizeCode(req.query?.room || req.get('x-room-code'));
    const bearer = getBearer(req);
    const session = store.getSession(roomCode);
    const teacherAuthorized = Boolean(session && verifyTeacherToken(bearer, sessionSecret));
    const studentAuthorized = Boolean(session && bearer === session.studentToken);
    if (!session || session.status !== 'active' || (!teacherAuthorized && !studentAuthorized)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    if (!stt.enabled) {
      return res.status(503).json({ error: 'STT не настроен: задайте AITUNNEL_API_KEY' });
    }
    const buffer = Buffer.isBuffer(req.body) ? req.body : null;
    if (!buffer || !buffer.length) {
      return res.status(400).json({ error: 'Пустая аудиозапись' });
    }
    try {
      const text = await stt.transcribe({
        buffer,
        mimeType: req.get('content-type') || 'audio/webm'
      });
      res.json({ text, role: teacherAuthorized ? 'teacher' : 'student', model: stt.model });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  }
);

app.get('/api/audio/:playToken', async (req, res, next) => {
  try {
    const play = tts.getPlayToken(req.params.playToken);
    if (!play) return res.status(404).json({ error: 'Audio token expired' });
    const buffer = await tts.getBuffer(play.text, play.voiceId);
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, max-age=600',
      'Accept-Ranges': 'bytes'
    });
    res.end(buffer);
  } catch (error) { next(error); }
});

app.get('/api/openapi.json', (_req, res) => res.json(openapi));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'German Live Classroom API' }));

app.use(express.static(path.join(rootDir, 'public'), { extensions: ['html'] }));
app.get('/', (_req, res) => res.sendFile(path.join(rootDir, 'public', 'index.html')));
app.get('/teacher', (_req, res) => res.sendFile(path.join(rootDir, 'public', 'teacher.html')));
app.get('/student', (_req, res) => res.sendFile(path.join(rootDir, 'public', 'student.html')));
app.get('/practice', (_req, res) => res.sendFile(path.join(rootDir, 'public', 'practice.html')));

io.use((socket, next) => {
  const role = socket.handshake.auth?.role;
  const roomCode = normalizeCode(socket.handshake.auth?.roomCode);
  const token = String(socket.handshake.auth?.token || '');
  const session = store.getSession(roomCode);
  if (!session || session.status !== 'active') return next(new Error('session_not_found'));
  if (role === 'teacher' && !verifyTeacherToken(token, sessionSecret)) return next(new Error('unauthorized'));
  if (role === 'student' && token !== session.studentToken) return next(new Error('unauthorized'));
  socket.data.role = role;
  socket.data.roomCode = roomCode;
  socket.data.session = session;
  next();
});

io.on('connection', (socket) => {
  const { role, roomCode } = socket.data;
  socket.join(`session:${roomCode}`);
  socket.join(`${role}:${roomCode}`);

  const session = store.getSession(roomCode);
  const profile = store.getProfile(session.profileId);
  const lesson = getLesson(session.lessonId);
  socket.emit('session:snapshot', {
    session: publicSession(session),
    profile: role === 'teacher' ? profile : { name: profile?.name, level: profile?.level },
    lesson,
    turn: turnState.get(roomCode) || null,
    teacherVoice: role === 'teacher' ? (teacherVoiceState.get(roomCode) || null) : null,
    config: { aitunnel: ai.enabled, elevenlabsTts: tts.enabled, model: ai.model }
  });
  io.to(`teacher:${roomCode}`).emit('presence:update', { role, online: true, socketId: socket.id });

  socket.on('teacher:mic-partial', (payload) => {
    if (role !== 'teacher') return;
    const text = cleanText(payload?.text, 1000);
    const current = teacherVoiceState.get(roomCode) || {};
    teacherVoiceState.set(roomCode, { ...current, partial: text, updatedAt: Date.now() });
    socket.to(`teacher:${roomCode}`).emit('teacher:mic-partial', { text, at: Date.now() });
  });

  socket.on('teacher:mic-committed', async (payload, ack = () => {}) => {
    if (role !== 'teacher') return ack({ ok: false, error: 'forbidden' });
    const text = cleanText(payload?.text, 1200);
    if (!text) return ack({ ok: false, error: 'empty' });
    teacherVoiceState.set(roomCode, { text, partial: '', updatedAt: Date.now() });
    io.to(`teacher:${roomCode}`).emit('teacher:mic-text', { text, at: Date.now() });
    try {
      let voiceReady = false;
      if (tts.enabled) {
        const results = await tts.prefetch([text]);
        voiceReady = results.some((item) => item.status === 'fulfilled');
        if (voiceReady) io.to(`teacher:${roomCode}`).emit('voice:ready', { text, source: 'teacher_mic' });
      }
      ack({ ok: true, text, voiceReady });
    } catch (error) {
      ack({ ok: false, error: error.message });
    }
  });

  socket.on('student:partial', (payload) => {
    if (role !== 'student') return;
    const text = cleanText(payload?.text, 1000);
    io.to(`teacher:${roomCode}`).emit('student:partial', { text, at: Date.now() });
  });

  socket.on('student:committed', async (payload, ack = () => {}) => {
    if (role !== 'student') return ack({ ok: false, error: 'forbidden' });
    const text = cleanText(payload?.text, 1200);
    if (!text) return ack({ ok: false, error: 'empty' });
    const turnId = randomToken().slice(0, 12);
    const state = turnState.get(roomCode) || { recentTurns: [], generationSeq: 0 };
    state.generationSeq += 1;
    const generationSeq = state.generationSeq;
    state.turnId = turnId;
    state.transcript = text;
    state.requiredWords = [];
    state.partial = '';
    state.status = 'thinking';
    state.candidate = null;
    state.recentTurns = [...(state.recentTurns || []), { role: 'student', text }].slice(-12);
    turnState.set(roomCode, state);

    io.to(`teacher:${roomCode}`).emit('student:committed', { turnId, text, at: Date.now() });
    io.to(`teacher:${roomCode}`).emit('ai:thinking', { turnId });
    await store.addLog({ sessionCode: roomCode, profileId: session.profileId, type: 'student_utterance', turnId, text });
    ack({ ok: true, turnId });

    await generateForRoom({ roomCode, turnId, generationSeq, action: 'AUTO' });
  });

  socket.on('teacher:generate', async (payload, ack = () => {}) => {
    if (role !== 'teacher') return ack({ ok: false, error: 'forbidden' });
    const state = turnState.get(roomCode) || { recentTurns: [], generationSeq: 0 };
    const action = cleanText(payload?.action || 'AUTO', 40).toUpperCase();
    const requiredWords = cleanWordList(payload?.requiredWords);
    const suppliedTranscript = cleanText(payload?.transcript, 1200);
    const transcript = suppliedTranscript || (action === 'WORD_SENTENCE' ? '' : cleanText(state.transcript, 1200));
    if (!transcript && action !== 'WORD_SENTENCE') return ack({ ok: false, error: 'Введите реплику ученика' });
    if (action === 'WORD_SENTENCE' && !requiredWords.length) return ack({ ok: false, error: 'Добавьте слова для предложения' });
    state.generationSeq += 1;
    state.turnId = payload?.turnId || state.turnId || randomToken().slice(0, 12);
    state.transcript = transcript;
    state.requiredWords = requiredWords;
    state.status = 'thinking';
    turnState.set(roomCode, state);
    io.to(`teacher:${roomCode}`).emit('ai:thinking', { turnId: state.turnId });
    ack({ ok: true, turnId: state.turnId });
    await generateForRoom({
      roomCode,
      turnId: state.turnId,
      generationSeq: state.generationSeq,
      action,
      teacherInstruction: cleanText(payload?.instruction, 1000),
      scaffoldLevel: Number(payload?.scaffoldLevel ?? session.scaffoldLevel ?? 0),
      requiredWords
    });
  });

  socket.on('teacher:transform', async (payload, ack = () => {}) => {
    if (role !== 'teacher') return ack({ ok: false, error: 'forbidden' });
    const state = turnState.get(roomCode);
    if (!state?.transcript && !state?.candidate) return ack({ ok: false, error: 'Нет реплики или предложения для изменения' });
    const currentSession = store.getSession(roomCode);
    const currentProfile = store.getProfile(currentSession.profileId);
    const currentLesson = getLesson(currentSession.lessonId);
    io.to(`teacher:${roomCode}`).emit('ai:thinking', { turnId: state.turnId, transform: true });
    try {
      const candidate = await ai.transform({
        currentText: cleanText(payload?.currentText || state.candidate?.main, 1000),
        transcript: state.transcript,
        profile: currentProfile,
        lesson: currentLesson,
        instruction: cleanText(payload?.instruction, 1200),
        scaffoldLevel: Number(payload?.scaffoldLevel ?? currentSession.scaffoldLevel ?? 0),
        recentTurns: state.recentTurns || [],
        requiredWords: state.requiredWords || []
      });
      state.candidate = candidate;
      state.status = 'ready';
      turnState.set(roomCode, state);
      io.to(`teacher:${roomCode}`).emit('ai:ready', { turnId: state.turnId, candidate, transcript: state.transcript });
      void prefetchCandidate(candidate, roomCode, state.turnId);
      ack({ ok: true, candidate });
    } catch (error) {
      io.to(`teacher:${roomCode}`).emit('ai:error', { turnId: state.turnId, error: error.message });
      ack({ ok: false, error: error.message });
    }
  });

  socket.on('teacher:candidate', (payload, ack = () => {}) => {
    if (role !== 'teacher') return ack({ ok: false, error: 'forbidden' });
    const state = turnState.get(roomCode);
    if (!state) return ack({ ok: false, error: 'no_turn' });
    const text = cleanText(payload?.text, 1000);
    if (!text) return ack({ ok: false, error: 'empty' });
    state.selectedText = text;
    state.selectedVariant = String(payload?.variant || 'manual');
    turnState.set(roomCode, state);
    void tts.prefetch([text]).then(() => io.to(`teacher:${roomCode}`).emit('voice:ready', { turnId: state.turnId, text })).catch(() => {});
    ack({ ok: true });
  });

  socket.on('teacher:scaffold', async (payload, ack = () => {}) => {
    if (role !== 'teacher') return ack({ ok: false, error: 'forbidden' });
    const level = Math.max(0, Math.min(6, Number(payload?.level || 0)));
    const updated = await store.updateSession(roomCode, { scaffoldLevel: level });
    const state = turnState.get(roomCode);
    if (state?.candidate) {
      const text = selectScaffoldVariant(state.candidate, level);
      state.selectedText = text;
      state.selectedVariant = `scaffold_${level}`;
      turnState.set(roomCode, state);
      io.to(`teacher:${roomCode}`).emit('candidate:selected', { level, text, variant: state.selectedVariant });
      void tts.prefetch([text]).then(() => io.to(`teacher:${roomCode}`).emit('voice:ready', { turnId: state.turnId, text })).catch(() => {});
    }
    ack({ ok: true, level, session: publicSession(updated) });
  });

  socket.on('teacher:speak', async (payload, ack = () => {}) => {
    if (role !== 'teacher') return ack({ ok: false, error: 'forbidden' });
    const state = turnState.get(roomCode);
    const text = cleanText(payload?.text || state?.selectedText || state?.candidate?.main, 1000);
    if (!text) return ack({ ok: false, error: 'Нет текста для озвучивания' });
    const playbackRate = Math.max(0.6, Math.min(1.25, Number(payload?.playbackRate || 1)));
    const source = String(payload?.source || 'ai_candidate');
    const directTeacherCommand = source === 'teacher_mic';
    const transcriptMeta = {
      keyword: directTeacherCommand ? firstKeyword(text) : (state?.candidate?.keyword || firstKeyword(text)),
      starter: directTeacherCommand ? makeStarter(text) : (state?.candidate?.starter || makeStarter(text)),
      full: text
    };

    const voice = tts.resolveVoice(payload?.voice);
    let speechPayload;
    if (tts.enabled && voice) {
      const playToken = tts.createPlayToken({ roomCode, text, transcriptMeta, playbackRate, voiceId: voice.id });
      speechPayload = {
        mode: 'elevenlabs',
        audioUrl: `/api/audio/${playToken}`,
        text,
        playbackRate,
        transcriptMeta,
        turnId: state?.turnId || null,
        source,
        voice: voice.key,
        voiceLabel: voice.label
      };
      void tts.prefetch([text], voice.id);
    } else {
      speechPayload = {
        mode: 'browser',
        audioUrl: null,
        text,
        playbackRate,
        transcriptMeta,
        turnId: state?.turnId || null,
        source,
        voice: null,
        voiceLabel: 'Голос браузера'
      };
    }

    io.to(`student:${roomCode}`).emit('student:speak', speechPayload);
    io.to(`teacher:${roomCode}`).emit('speech:sent', speechPayload);
    if (state) {
      state.recentTurns = [...(state.recentTurns || []), { role: 'teacher', text }].slice(-12);
      state.lastSpoken = speechPayload;
      turnState.set(roomCode, state);
    }
    await store.updateSession(roomCode, { lastSpoken: { text, at: new Date().toISOString(), turnId: state?.turnId || null } });
    await store.addLog({
      sessionCode: roomCode,
      profileId: session.profileId,
      type: 'teacher_speech',
      turnId: state?.turnId || null,
      text,
      variant: payload?.variant || state?.selectedVariant || 'main',
      source,
      voice: speechPayload.voice,
      scaffoldLevel: store.getSession(roomCode)?.scaffoldLevel || 0
    });
    ack({ ok: true, mode: speechPayload.mode, voice: speechPayload.voice, voiceLabel: speechPayload.voiceLabel });
  });

  socket.on('student:assist', async (payload) => {
    if (role !== 'student') return;
    const action = String(payload?.action || 'unknown');
    io.to(`teacher:${roomCode}`).emit('student:assist', { action, at: Date.now() });
    await store.addLog({ sessionCode: roomCode, profileId: session.profileId, type: 'student_assist', action });
  });

  socket.on('teacher:assessment', async (payload, ack = () => {}) => {
    if (role !== 'teacher') return ack({ ok: false, error: 'forbidden' });
    const assessment = ['independent', 'prompted', 'error', 'mastered'].includes(payload?.assessment)
      ? payload.assessment : null;
    if (!assessment) return ack({ ok: false, error: 'invalid_assessment' });
    const currentSession = store.getSession(roomCode);
    const currentProfile = store.getProfile(currentSession.profileId);
    const progress = { ...(currentProfile.progress || {}) };
    progress.turns = Number(progress.turns || 0) + 1;
    const progressKey = assessment === 'error' ? 'errors' : assessment;
    progress[progressKey] = Number(progress[progressKey] || 0) + 1;
    progress.lastLessonAt = new Date().toISOString();
    const updatedProfile = await store.updateProfile(currentProfile.id, { progress });
    await store.addLog({
      sessionCode: roomCode,
      profileId: currentProfile.id,
      type: 'assessment',
      turnId: turnState.get(roomCode)?.turnId || null,
      assessment,
      note: cleanText(payload?.note, 500)
    });
    io.to(`teacher:${roomCode}`).emit('progress:update', { progress: updatedProfile.progress });
    ack({ ok: true, progress: updatedProfile.progress });
  });

  socket.on('teacher:end', async (_payload, ack = () => {}) => {
    if (role !== 'teacher') return ack({ ok: false, error: 'forbidden' });
    const currentSession = store.getSession(roomCode);
    const currentProfile = store.getProfile(currentSession.profileId);
    const currentLesson = getLesson(currentSession.lessonId);
    const logs = store.getSessionLogs(roomCode, 500);
    const summary = await ai.summarizeSession({ profile: currentProfile, lesson: currentLesson, logs });
    await store.updateSession(roomCode, { status: 'ended', endedAt: new Date().toISOString() });
    await store.updateProfile(currentProfile.id, {
      progress: {
        ...(currentProfile.progress || {}),
        lastSummary: summary.summary_ru || '',
        lastLessonAt: new Date().toISOString()
      }
    });
    await store.addLog({ sessionCode: roomCode, profileId: currentProfile.id, type: 'session_summary', summary });
    io.to(`session:${roomCode}`).emit('session:ended', { summary });
    teacherVoiceState.delete(roomCode);
    ack({ ok: true, summary });
  });

  socket.on('disconnect', () => {
    io.to(`teacher:${roomCode}`).emit('presence:update', { role, online: false, socketId: socket.id });
  });
});

async function generateForRoom({ roomCode, turnId, generationSeq, action, teacherInstruction = '', scaffoldLevel, requiredWords = [] }) {
  const session = store.getSession(roomCode);
  if (!session) return;
  const state = turnState.get(roomCode);
  if (!state) return;
  const profile = store.getProfile(session.profileId);
  const lesson = getLesson(session.lessonId);
  const candidate = await ai.generate({
    transcript: state.transcript,
    profile,
    lesson,
    recentTurns: state.recentTurns || [],
    action,
    scaffoldLevel: Number(scaffoldLevel ?? session.scaffoldLevel ?? 0),
    teacherInstruction,
    requiredWords
  });
  const latest = turnState.get(roomCode);
  if (!latest || latest.generationSeq !== generationSeq || latest.turnId !== turnId) return;
  latest.candidate = candidate;
  latest.requiredWords = cleanWordList(requiredWords);
  latest.selectedText = selectScaffoldVariant(candidate, Number(scaffoldLevel ?? session.scaffoldLevel ?? 0));
  latest.selectedVariant = 'main';
  latest.status = 'ready';
  turnState.set(roomCode, latest);
  io.to(`teacher:${roomCode}`).emit('ai:ready', {
    turnId,
    candidate,
    transcript: latest.transcript,
    requiredWords: latest.requiredWords,
    selectedText: latest.selectedText,
    model: ai.model
  });
  await store.addLog({
    sessionCode: roomCode,
    profileId: session.profileId,
    type: 'ai_candidate',
    turnId,
    transcript: latest.transcript,
    candidate,
    model: ai.model
  });
  void prefetchCandidate(candidate, roomCode, turnId);
}

async function prefetchCandidate(candidate, roomCode, turnId) {
  if (!tts.enabled) return;
  const results = await tts.prefetch([candidate.main, candidate.simpler, candidate.choice, candidate.full_model]);
  if (results.some((item) => item.status === 'fulfilled')) {
    io.to(`teacher:${roomCode}`).emit('voice:ready', { turnId, text: candidate.main });
  }
}

function selectScaffoldVariant(candidate, level) {
  return [
    candidate.main,
    candidate.shorter || candidate.main,
    candidate.simpler || candidate.shorter || candidate.main,
    candidate.yes_no || candidate.clarification || candidate.main,
    candidate.choice || candidate.yes_no || candidate.main,
    candidate.starter || candidate.full_model || candidate.main,
    candidate.full_model || candidate.recast || candidate.main
  ][Math.max(0, Math.min(6, level))];
}

function publicSession(session) {
  if (!session) return null;
  const { studentToken: _token, studentPin: _pin, ...safe } = session;
  return safe;
}

function getBearer(req) {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

function cleanText(value, max = 1000) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

function cleanWordList(value) {
  const items = Array.isArray(value) ? value : String(value || '').split(/[\n,;]/);
  return [...new Set(items.map((item) => cleanText(item, 80)).filter(Boolean))].slice(0, 12);
}

function firstKeyword(text) {
  return String(text || '').replace(/[?!.,:;]/g, '').split(/\s+/).find((word) => word.length > 3) || 'Deutsch';
}

function makeStarter(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  return `${words.slice(0, Math.min(3, Math.max(1, words.length - 1))).join(' ')} ...`;
}

app.use((error, req, res, _next) => {
  console.error('[server]', error);
  if (res.headersSent) return;
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Внутренняя ошибка сервера' : error.message,
    path: req.path
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`German Live Classroom listening on http://0.0.0.0:${port}`);
  console.log(`AITUNNEL model: ${ai.model} (${ai.enabled ? 'enabled' : 'demo fallback'})`);
  console.log(`ElevenLabs TTS: ${tts.enabled ? 'enabled' : 'browser fallback'}`);
  if (tts.enabled) {
    console.log(`ElevenLabs voices: ${tts.publicVoices().map((voice) => `${voice.key} (${voice.label})`).join(', ')}`);
    if (tts.voices.length < 2) console.log('Set ELEVENLABS_VOICE_ID_2 to enable the second voice button.');
  }
});
