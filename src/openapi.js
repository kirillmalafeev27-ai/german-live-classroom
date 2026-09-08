export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'German Live Classroom API',
    version: '1.1.0',
    description: 'API for teacher profiles, realtime lesson rooms, AITUNNEL response generation, AITUNNEL Whisper speech-to-text and ElevenLabs text-to-speech.'
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: {
      teacherBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      studentBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'opaque' }
    }
  },
  paths: {
    '/health': {
      get: { summary: 'Health check', responses: { '200': { description: 'OK' } } }
    },
    '/api/config': {
      get: { summary: 'Public runtime capability flags', responses: { '200': { description: 'Configuration' } } }
    },
    '/api/auth/login': {
      post: {
        summary: 'Teacher login',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['password'], properties: { password: { type: 'string' } } } } } },
        responses: { '200': { description: 'JWT token' }, '401': { description: 'Invalid password' } }
      }
    },
    '/api/curriculum': {
      get: { summary: '16 lesson modules and vocabulary chips', responses: { '200': { description: 'Curriculum' } } }
    },
    '/api/profiles': {
      get: { security: [{ teacherBearer: [] }], summary: 'List student profiles', responses: { '200': { description: 'Profiles' } } },
      post: { security: [{ teacherBearer: [] }], summary: 'Create a student profile', responses: { '201': { description: 'Profile created' } } }
    },
    '/api/profiles/{id}': {
      patch: { security: [{ teacherBearer: [] }], summary: 'Update a profile', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Updated profile' } } },
      delete: { security: [{ teacherBearer: [] }], summary: 'Delete a profile', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { '204': { description: 'Deleted' } } }
    },
    '/api/sessions': {
      post: { security: [{ teacherBearer: [] }], summary: 'Create a live room', responses: { '201': { description: 'Room, PIN and student link' } } }
    },
    '/api/sessions/join': {
      post: { summary: 'Join with room code and PIN', responses: { '200': { description: 'Student token' } } }
    },
    '/api/sessions/{code}': {
      get: { summary: 'Read a room with role-specific token', parameters: [{ in: 'path', name: 'code', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Room state' } } }
    },
    '/api/sessions/{code}/logs': {
      get: { security: [{ teacherBearer: [] }], summary: 'Session logs', parameters: [{ in: 'path', name: 'code', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Logs' } } }
    },
    '/api/ai/generate': {
      post: { security: [{ teacherBearer: [] }], summary: 'Generate a complete response package through AITUNNEL', responses: { '200': { description: 'Candidate package' } } }
    },
    '/api/ai/transform': {
      post: { security: [{ teacherBearer: [] }], summary: 'Transform a teacher response using a natural-language instruction', responses: { '200': { description: 'Transformed package' } } }
    },
    '/api/practice/scenarios': {
      get: { summary: 'Self-study modes and per-module role-play scenarios', responses: { '200': { description: 'Modes and scenarios' } } }
    },
    '/api/practice/reply': {
      post: { summary: 'Get the next AI dialogue turn for self-study (AITUNNEL)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['moduleId', 'mode'], properties: { moduleId: { type: 'integer' }, mode: { type: 'string', enum: ['dialog', 'roleplay'] }, scenarioId: { type: 'string' }, history: { type: 'array', items: { type: 'object' } }, userText: { type: 'string' } } } } } }, responses: { '200': { description: 'reply_de, correction, hint_ru, done' } } }
    },
    '/api/practice/transcribe': {
      post: { summary: 'Transcribe self-study audio via Whisper (no room)', requestBody: { required: true, content: { 'audio/webm': {} } }, responses: { '200': { description: 'Recognised text' } } }
    },
    '/api/practice/tts': {
      post: { summary: 'Voice a German phrase for self-study', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } } } } }, responses: { '200': { description: 'MP3 stream', content: { 'audio/mpeg': {} } }, '502': { description: 'TTS provider error' }, '503': { description: 'TTS not configured' } } }
    },
    '/api/stt/transcribe': {
      post: { security: [{ teacherBearer: [] }, { studentBearer: [] }], summary: 'Transcribe a recorded audio segment via AITUNNEL Whisper', parameters: [{ in: 'query', name: 'room', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'audio/webm': {}, 'audio/mp4': {}, 'audio/ogg': {} } }, responses: { '200': { description: 'Recognised text' }, '401': { description: 'Unauthorized' }, '502': { description: 'STT provider error' }, '503': { description: 'STT not configured' } } }
    },
    '/api/audio/{playToken}': {
      get: { summary: 'Stream a teacher-approved German phrase as audio', parameters: [{ in: 'path', name: 'playToken', required: true, schema: { type: 'string' } }, { in: 'header', name: 'Range', required: false, schema: { type: 'string' }, description: 'Byte range; answered with 206' }], responses: { '200': { description: 'MP3 stream', content: { 'audio/mpeg': {} } }, '206': { description: 'Partial MP3 stream', content: { 'audio/mpeg': {} } }, '410': { description: 'Play token expired' }, '416': { description: 'Range not satisfiable' }, '502': { description: 'TTS provider error' } } }
    }
  }
};
