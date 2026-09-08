// Regression test for the bug where a failing ElevenLabs call reached the
// student as an <audio> source that answered with a JSON error, which the
// browser could only report as "Браузер не смог проиграть это аудио".
//
// Runs its own server on a spare port with ElevenLabs stubbed, so it needs no
// API keys and no network. Usage: npm run audio-test
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { parseByteRange } from '../src/audio-response.js';

// ----- unit: byte ranges -----
assert.equal(parseByteRange('', 100), null, 'no header means the whole body');
assert.deepEqual(parseByteRange('bytes=0-99', 100), { start: 0, end: 99 });
assert.deepEqual(parseByteRange('bytes=10-', 100), { start: 10, end: 99 });
assert.deepEqual(parseByteRange('bytes=0-1', 100), { start: 0, end: 1 }, 'Safari probe');
assert.deepEqual(parseByteRange('bytes=-20', 100), { start: 80, end: 99 }, 'suffix range');
assert.deepEqual(parseByteRange('bytes=0-500', 100), { start: 0, end: 99 }, 'clamped to the body');
assert.equal(parseByteRange('bytes=200-300', 100), 'invalid');
assert.equal(parseByteRange('bytes=50-10', 100), 'invalid');
assert.equal(parseByteRange('bytes=0-0,5-9', 100), null, 'multi-range falls back to the full body');

// ----- end to end -----
const port = Number(process.env.AUDIO_TEST_PORT || 3799);
const base = `http://127.0.0.1:${port}`;
const workDir = await mkdtemp(path.join(tmpdir(), 'glc-audio-'));
const stubPath = path.join(workDir, 'elevenlabs-stub.mjs');

// A stub in front of fetch() stands in for ElevenLabs: the first call answers
// with a tiny MP3, and TTS_STUB_FAIL flips it to the 401 an expired key gives.
await writeFile(stubPath, `
const realFetch = globalThis.fetch;
const mp3 = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(4092, 7)]);
globalThis.fetch = async (input, init) => {
  const url = String(input?.url || input);
  if (!url.includes('api.elevenlabs.io')) return realFetch(input, init);
  if (process.env.TTS_STUB_FAIL === '1') {
    return new Response('{"detail":{"status":"quota_exceeded"}}', { status: 401 });
  }
  if (process.env.TTS_STUB_HANG === '1') {
    // Never settles unless aborted — the case the request timeout exists for.
    return new Promise((resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
  }
  return new Response(mp3, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
};
`);

function startServer(env) {
  const child = spawn(process.execPath, ['--import', stubPath, 'src/server.js'], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: path.join(workDir, 'data'),
      ADMIN_PASSWORD: 'teacher',
      ELEVENLABS_API_KEY: 'stub-key',
      ELEVENLABS_VOICE_ID: 'stub-voice',
      ELEVENLABS_VOICE_ID_2: 'stub-voice-2',
      ...env
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  return child;
}

// Between runs the port must actually be free, or the next server dies with
// EADDRINUSE and the test silently talks to the previous one.
async function waitForPort(attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try { await fetch(`${base}/health`); } catch { return; }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('previous server did not shut down');
}

async function waitForHealth(attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('server did not start');
}

async function request(pathname, { method = 'GET', token, body } = {}) {
  const response = await fetch(base + pathname, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`${method} ${pathname}: ${response.status} ${raw}`);
  return raw ? JSON.parse(raw) : null;
}

function waitEvent(socket, event, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting ${event}`)), timeout);
    socket.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
  });
}

// Drives one teacher:speak round trip and returns what the student was sent.
// `viaCandidate` mirrors the phrase editor in the cabinet, which selects the
// phrase before voicing it; `voice` picks one of the two configured voices.
async function speakOnce(text, { voice, viaCandidate = false } = {}) {
  const login = await request('/api/auth/login', { method: 'POST', body: { password: 'teacher' } });
  const created = await request('/api/profiles', {
    method: 'POST', token: login.token,
    body: { name: `Audio ${Date.now()}`, level: 'A0', sterility: 'high', maxWords: 6, maxNewWords: 0, lessonIds: [1], knownWords: ['ich'] }
  });
  const room = await request('/api/sessions', { method: 'POST', token: login.token, body: { profileId: created.profile.id, lessonId: 1 } });
  const teacher = io(base, { auth: { role: 'teacher', roomCode: room.session.code, token: login.token }, transports: ['websocket'] });
  const student = io(base, { auth: { role: 'student', roomCode: room.session.code, token: room.studentToken }, transports: ['websocket'] });
  await Promise.all([waitEvent(teacher, 'connect'), waitEvent(student, 'connect')]);
  let candidateAck = null;
  if (viaCandidate) {
    candidateAck = await new Promise((resolve) => teacher.emit('teacher:candidate', { text, variant: 'manual' }, resolve));
  }
  const speechPromise = waitEvent(student, 'student:speak');
  const ack = await new Promise((resolve) => teacher.emit('teacher:speak', { text, ...(voice ? { voice } : {}) }, resolve));
  const speech = await speechPromise;
  teacher.disconnect();
  student.disconnect();
  await request(`/api/profiles/${created.profile.id}`, { method: 'DELETE', token: login.token });
  return { ack, speech, candidateAck };
}

const results = {};
let server = startServer({});
try {
  await waitForHealth();

  // 1. Working TTS: the student gets a link that really serves audio.
  const ok = await speakOnce('Guten Tag!');
  assert.equal(ok.ack.ok, true);
  assert.equal(ok.speech.mode, 'elevenlabs', 'a working TTS must stay on the ElevenLabs voice');
  assert.ok(ok.speech.audioUrl, 'audioUrl missing');

  const audio = await fetch(base + ok.speech.audioUrl);
  assert.equal(audio.status, 200);
  assert.equal(audio.headers.get('content-type'), 'audio/mpeg');
  const bytes = Buffer.from(await audio.arrayBuffer());
  assert.ok(bytes.length > 0, 'empty audio body');
  results.fullBody = bytes.length;

  // 2. Safari's range probe must get a 206, not the whole file.
  const ranged = await fetch(base + ok.speech.audioUrl, { headers: { Range: 'bytes=0-1' } });
  assert.equal(ranged.status, 206, 'Range request must be answered with a partial response');
  assert.equal(ranged.headers.get('content-range'), `bytes 0-1/${bytes.length}`);
  assert.equal((await ranged.arrayBuffer()).byteLength, 2);
  results.rangeOk = true;

  // 3. An unknown/expired play token reports itself as JSON, not a 500 page.
  const stale = await fetch(`${base}/api/audio/definitely-not-a-token`);
  assert.equal(stale.status, 410);
  assert.match((await stale.json()).error, /устарел/i);
  results.staleToken = stale.status;

  // 4. The opening phrase of a lesson: the teacher types it and picks the
  //    second voice before the student has said anything. This used to fail
  //    with "no_turn" because turn state only existed after a student turn.
  const opening = await speakOnce('Guten Tag! Wie heißt du?', { voice: 'secondary', viaCandidate: true });
  assert.equal(opening.candidateAck.ok, true, `selecting a phrase before any student turn failed: ${opening.candidateAck.error}`);
  assert.equal(opening.ack.ok, true, `voicing the opening phrase failed: ${opening.ack.error}`);
  assert.equal(opening.speech.mode, 'elevenlabs');
  assert.equal(opening.speech.voice, 'secondary', 'the second voice button must use the second voice');
  const secondVoiceAudio = await fetch(base + opening.speech.audioUrl);
  assert.equal(secondVoiceAudio.status, 200, 'the second voice must serve audio too');
  assert.equal(secondVoiceAudio.headers.get('content-type'), 'audio/mpeg');
  results.secondVoice = opening.ack.voiceLabel;
} finally {
  server.kill();
  await waitForPort();
}

// 5. A dead ElevenLabs must reach the student as the browser voice with a
//    reason attached — never as an audio link that plays nothing.
server = startServer({ TTS_STUB_FAIL: '1' });
try {
  await waitForHealth();
  const failed = await speakOnce('Guten Abend!');
  assert.equal(failed.ack.ok, true, 'the phrase must still be delivered');
  assert.equal(failed.speech.mode, 'browser', 'a broken TTS must downgrade to the browser voice');
  assert.equal(failed.speech.audioUrl, null, 'no dead audio link may reach the student');
  assert.ok(failed.speech.text, 'the browser voice needs the text');
  assert.match(failed.ack.ttsError, /ElevenLabs/, 'the teacher must be told why');
  results.fallbackReason = failed.ack.ttsError;

  const health = await fetch(`${base}/health`).then((response) => response.json());
  assert.ok(health.ttsLastError?.message, '/health must expose the last TTS failure');
  results.healthReason = health.ttsLastError.message;
} finally {
  server.kill();
  await waitForPort();
}

// 6. A hung ElevenLabs must give up in time to fall back, not stall the lesson
//    until the teacher's socket ack times out.
server = startServer({ TTS_STUB_HANG: '1', ELEVENLABS_TIMEOUT_MS: '1500' });
try {
  await waitForHealth();
  const startedAt = Date.now();
  const hung = await speakOnce('Guten Morgen!');
  const elapsed = Date.now() - startedAt;
  assert.equal(hung.speech.mode, 'browser', 'a hung TTS must downgrade to the browser voice');
  assert.match(hung.ack.ttsError, /не ответил/, 'the teacher must be told it timed out');
  assert.ok(elapsed < 12000, `fallback took ${elapsed}ms — the timeout did not fire`);
  results.timeoutMs = elapsed;
} finally {
  server.kill();
  await rm(workDir, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, ...results }, null, 2));
