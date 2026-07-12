const base = String(process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const password = process.env.ADMIN_PASSWORD || 'teacher';

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text}`);
  return data;
}

const health = await request('/health');
if (!health.ok) throw new Error('health check failed');

const login = await request('/api/auth/login', { method: 'POST', body: { password } });
if (!login.token) throw new Error('login token missing');

const curriculum = await request('/api/curriculum');
if (curriculum.lessons?.length !== 16) throw new Error(`expected 16 lessons, got ${curriculum.lessons?.length}`);

const profileResult = await request('/api/profiles', {
  method: 'POST', token: login.token,
  body: {
    name: `Smoke ${Date.now()}`,
    level: 'A0', sterility: 'high', maxWords: 6, maxNewWords: 0,
    lessonIds: [1], knownWords: ['ich', 'wohnen', 'Berlin'], unknownWords: ['weil'],
    learningGoals: ['Ich wohne in Berlin.'], avoid: ['Nebensätze']
  }
});

const room = await request('/api/sessions', {
  method: 'POST', token: login.token,
  body: { profileId: profileResult.profile.id, lessonId: 1 }
});
if (!room.studentUrl || !room.session?.code) throw new Error('room creation failed');

const candidate = await request('/api/ai/generate', {
  method: 'POST', token: login.token,
  body: {
    profileId: profileResult.profile.id,
    lessonId: 1,
    transcript: 'Ich Berlin.',
    action: 'AUTO', scaffoldLevel: 3
  }
});
if (!candidate.candidate?.main) throw new Error('candidate missing');

await request(`/api/profiles/${profileResult.profile.id}`, { method: 'DELETE', token: login.token });

console.log(JSON.stringify({
  ok: true,
  health,
  lessonCount: curriculum.lessons.length,
  roomCode: room.session.code,
  candidate: candidate.candidate.main
}, null, 2));
