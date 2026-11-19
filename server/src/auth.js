import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { db, save, newId } from './db.js';

const SECRET = process.env.JWT_SECRET || db.secret;
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);

export const publicUser = (u) => ({ id: u.id, username: u.username, email: u.email });
export const signToken = (u) => jwt.sign({ sub: u.id }, SECRET, { expiresIn: '7d' });

export function userFromToken(token) {
  try {
    const { sub } = jwt.verify(token, SECRET);
    return db.users.find((u) => u.id === sub) || null;
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const user = h.startsWith('Bearer ') ? userFromToken(h.slice(7)) : null;
  if (!user) return res.status(401).json({ error: 'Please sign in with a valid account.' });
  req.user = user;
  next();
}

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false });
export const authRouter = Router();
authRouter.use(limiter);

authRouter.post('/register', async (req, res) => {
  const { username, email, password } = req.body || {};
  if (typeof username !== 'string' || !/^[A-Za-z0-9_]{3,24}$/.test(username))
    return res.status(400).json({ error: 'Username must be 3-24 letters, numbers or underscores.' });
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    return res.status(400).json({ error: 'Enter a valid email address.' });
  if (typeof password !== 'string' || password.length < 8 || password.length > 128)
    return res.status(400).json({ error: 'Password must be 8-128 characters.' });
  const un = username.toLowerCase(), em = email.toLowerCase();
  if (db.users.some((u) => u.username.toLowerCase() === un || u.email === em))
    return res.status(409).json({ error: 'Username or email is already registered.' });
  const user = { id: newId(), username, email: em, passwordHash: await bcrypt.hash(password, 10), createdAt: Date.now() };
  db.users.push(user);
  save();
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

authRouter.post('/login', async (req, res) => {
  const { identifier, password } = req.body || {};
  if (typeof identifier !== 'string' || typeof password !== 'string')
    return res.status(400).json({ error: 'Missing credentials.' });
  const id = identifier.toLowerCase();
  const user = db.users.find((u) => u.username.toLowerCase() === id || u.email === id);
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ error: 'Invalid username/email or password.' });
  res.json({ token: signToken(user), user: publicUser(user) });
});

authRouter.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
