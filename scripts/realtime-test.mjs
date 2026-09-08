import { io } from 'socket.io-client';

const base = String(process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const password = process.env.ADMIN_PASSWORD || 'teacher';

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${raw}`);
  return data;
}

function waitEvent(socket, event, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting ${event}`)), timeout);
    socket.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
  });
}

function connect(role, roomCode, token) {
  return io(base, { auth: { role, roomCode, token }, transports: ['websocket'] });
}

const login = await request('/api/auth/login', { method: 'POST', body: { password } });
const created = await request('/api/profiles', { method: 'POST', token: login.token, body: {
  name: `Realtime ${Date.now()}`, level: 'A0', sterility: 'high', maxWords: 6, maxNewWords: 0,
  lessonIds: [1], knownWords: ['ich','wohnen','Berlin'], unknownWords: ['weil']
} });
const room = await request('/api/sessions', { method: 'POST', token: login.token, body: { profileId: created.profile.id, lessonId: 1 } });
const teacher = connect('teacher', room.session.code, login.token);
const student = connect('student', room.session.code, room.studentToken);

await Promise.all([waitEvent(teacher, 'connect'), waitEvent(student, 'connect')]);
const readyPromise = waitEvent(teacher, 'ai:ready', 20000);
student.emit('student:committed', { text: 'Ich Berlin.' }, (ack) => {
  if (!ack?.ok) throw new Error(ack?.error || 'commit failed');
});
const ready = await readyPromise;
if (!ready.candidate?.main) throw new Error('candidate missing');

const speechPromise = waitEvent(student, 'student:speak');
const speakAck = await new Promise((resolve) => teacher.emit('teacher:speak', { text: ready.candidate.main }, resolve));
if (!speakAck?.ok) throw new Error(speakAck?.error || 'speak failed');
const speech = await speechPromise;
if (speech.text !== ready.candidate.main) throw new Error('speech text mismatch');

// The student page plays this link. Fetch it the way the browser does, so a
// TTS outage shows up here as a failed test instead of as silence in a lesson.
let audioCheck = 'browser voice (ElevenLabs off)';
if (speech.mode === 'elevenlabs') {
  const audio = await fetch(`${base}${speech.audioUrl}`);
  if (!audio.ok) throw new Error(`audio ${speech.audioUrl}: ${audio.status} ${(await audio.text()).slice(0, 200)}`);
  const type = audio.headers.get('content-type') || '';
  if (!type.startsWith('audio/')) throw new Error(`audio served as ${type}, not audio/*`);
  const size = (await audio.arrayBuffer()).byteLength;
  if (!size) throw new Error('audio body is empty');
  audioCheck = `${size} bytes of ${type}`;
} else if (speech.ttsError) {
  throw new Error(`ElevenLabs fell back to the browser voice: ${speech.ttsError}`);
}

const directText = 'Öffne bitte das Buch.';
const micAck = await new Promise((resolve) => teacher.emit('teacher:mic-committed', { text: directText }, resolve));
if (!micAck?.ok) throw new Error(micAck?.error || 'teacher mic commit failed');
const directSpeechPromise = waitEvent(student, 'student:speak');
const directSpeakAck = await new Promise((resolve) => teacher.emit('teacher:speak', {
  text: directText,
  source: 'teacher_mic',
  variant: 'teacher_mic'
}, resolve));
if (!directSpeakAck?.ok) throw new Error(directSpeakAck?.error || 'direct teacher speak failed');
const directSpeech = await directSpeechPromise;
if (directSpeech.text !== directText || directSpeech.source !== 'teacher_mic') {
  throw new Error('direct teacher speech payload mismatch');
}

teacher.disconnect();
student.disconnect();
await request(`/api/profiles/${created.profile.id}`, { method: 'DELETE', token: login.token });
console.log(JSON.stringify({
  ok: true,
  room: room.session.code,
  candidate: ready.candidate.main,
  speechMode: speech.mode,
  audioCheck,
  teacherMicSpeech: directSpeech.text,
  teacherMicSource: directSpeech.source
}, null, 2));
