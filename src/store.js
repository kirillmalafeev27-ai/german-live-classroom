import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { getLevelMaxWords } from './level-rules.js';

const DEFAULT_DATA = {
  profiles: [],
  sessions: [],
  logs: []
};

const clone = (value) => structuredClone(value);

export class JsonStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'app-data.json');
    this.data = clone(DEFAULT_DATA);
    this.writeQueue = Promise.resolve();
  }

  async init() {
    await mkdir(this.dataDir, { recursive: true });
    try {
      const raw = await readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = {
        profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        logs: Array.isArray(parsed.logs) ? parsed.logs : []
      };
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('[store] Could not read data file. Starting clean:', error.message);
      }
      await this.persist();
    }
  }

  async persist() {
    this.writeQueue = this.writeQueue.then(async () => {
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      await rename(tmp, this.file);
    });
    return this.writeQueue;
  }

  listProfiles() {
    return clone(this.data.profiles).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }

  getProfile(id) {
    const profile = this.data.profiles.find((item) => item.id === id);
    return profile ? clone(profile) : null;
  }

  async createProfile(input) {
    const now = new Date().toISOString();
    const profile = {
      id: crypto.randomUUID(),
      name: input.name || 'Новый ученик',
      level: input.level || 'A0',
      sterility: input.sterility || 'high',
      maxWords: Number(input.maxWords ?? getLevelMaxWords(input.level)),
      maxNewWords: Number(input.maxNewWords ?? 0),
      lessonIds: Array.isArray(input.lessonIds) ? input.lessonIds.map(Number) : [1],
      knownWords: cleanArray(input.knownWords),
      learningWords: cleanArray(input.learningWords),
      unknownWords: cleanArray(input.unknownWords),
      knownGrammar: cleanArray(input.knownGrammar),
      repeatTopics: cleanArray(input.repeatTopics),
      learningGoals: cleanArray(input.learningGoals),
      avoid: cleanArray(input.avoid),
      notes: String(input.notes || ''),
      progress: {
        independent: 0,
        prompted: 0,
        errors: 0,
        mastered: 0,
        turns: 0,
        lastSummary: '',
        lastLessonAt: null,
        ...(input.progress || {})
      },
      createdAt: now,
      updatedAt: now
    };
    this.data.profiles.push(profile);
    await this.persist();
    return clone(profile);
  }

  async updateProfile(id, patch) {
    const index = this.data.profiles.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const current = this.data.profiles[index];
    const profilePatch = pickProfilePatch(patch);
    if (patch.level !== undefined && patch.maxWords === undefined) {
      profilePatch.maxWords = getLevelMaxWords(patch.level);
    }
    const next = {
      ...current,
      ...profilePatch,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString()
    };
    if (patch.progress) {
      next.progress = { ...current.progress, ...patch.progress };
    }
    this.data.profiles[index] = next;
    await this.persist();
    return clone(next);
  }

  async deleteProfile(id) {
    const before = this.data.profiles.length;
    this.data.profiles = this.data.profiles.filter((item) => item.id !== id);
    if (this.data.profiles.length === before) return false;
    await this.persist();
    return true;
  }

  getSession(code) {
    const session = this.data.sessions.find((item) => item.code === code);
    return session ? clone(session) : null;
  }

  listSessionsForProfile(profileId, limit = 20) {
    return clone(
      this.data.sessions
        .filter((item) => item.profileId === profileId)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, limit)
    );
  }

  async createSession(input) {
    const now = new Date().toISOString();
    const session = {
      id: crypto.randomUUID(),
      code: input.code,
      studentPin: input.studentPin,
      studentToken: input.studentToken,
      profileId: input.profileId,
      lessonId: Number(input.lessonId || 1),
      status: 'active',
      scaffoldLevel: 0,
      currentTurnId: null,
      lastSpoken: null,
      createdAt: now,
      updatedAt: now,
      endedAt: null
    };
    this.data.sessions.push(session);
    await this.persist();
    return clone(session);
  }

  async updateSession(code, patch) {
    const index = this.data.sessions.findIndex((item) => item.code === code);
    if (index < 0) return null;
    const current = this.data.sessions[index];
    const next = {
      ...current,
      ...patch,
      code: current.code,
      studentToken: current.studentToken,
      studentPin: current.studentPin,
      updatedAt: new Date().toISOString()
    };
    this.data.sessions[index] = next;
    await this.persist();
    return clone(next);
  }

  async addLog(entry) {
    const row = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      ...entry
    };
    this.data.logs.push(row);
    if (this.data.logs.length > 15000) {
      this.data.logs.splice(0, this.data.logs.length - 15000);
    }
    await this.persist();
    return clone(row);
  }

  getSessionLogs(code, limit = 250) {
    return clone(this.data.logs.filter((item) => item.sessionCode === code).slice(-limit));
  }
}

function cleanArray(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  }
  if (typeof value === 'string') {
    return [...new Set(value.split(/[\n,;]/).map((item) => item.trim()).filter(Boolean))];
  }
  return [];
}

function pickProfilePatch(patch) {
  const out = {};
  const stringKeys = ['name', 'level', 'sterility', 'notes'];
  const numberKeys = ['maxWords', 'maxNewWords'];
  const arrayKeys = [
    'lessonIds', 'knownWords', 'learningWords', 'unknownWords', 'knownGrammar',
    'repeatTopics', 'learningGoals', 'avoid'
  ];
  for (const key of stringKeys) {
    if (patch[key] !== undefined) out[key] = String(patch[key]);
  }
  for (const key of numberKeys) {
    if (patch[key] !== undefined) out[key] = Number(patch[key]);
  }
  for (const key of arrayKeys) {
    if (patch[key] !== undefined) {
      out[key] = key === 'lessonIds' ? cleanArray(patch[key]).map(Number) : cleanArray(patch[key]);
    }
  }
  return out;
}
