import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

export const issueTeacherToken = ({ secret, password, expectedPassword }) => {
  if (!expectedPassword || password !== expectedPassword) return null;
  return jwt.sign({ role: 'teacher', nonce: crypto.randomUUID() }, secret, { expiresIn: '12h' });
};

export const verifyTeacherToken = (token, secret) => {
  try {
    const decoded = jwt.verify(token, secret);
    return decoded?.role === 'teacher' ? decoded : null;
  } catch {
    return null;
  }
};

export const authMiddleware = (secret) => (req, res, next) => {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!verifyTeacherToken(token, secret)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.teacherToken = token;
  next();
};

export const randomCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
};

export const randomPin = () => String(crypto.randomInt(1000, 10000));
export const randomToken = () => crypto.randomBytes(24).toString('base64url');
