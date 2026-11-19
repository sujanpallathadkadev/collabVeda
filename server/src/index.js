import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Server } from 'socket.io';
import * as Y from 'yjs';
import { db, save, newId } from './db.js';
import { authRouter, requireAuth, userFromToken, publicUser } from './auth.js';
import { listFiles, createEntry, renameEntry, deleteEntry, MAX_FILE_SIZE } from './files.js';
import { getDoc, dropDoc, liveContent } from './docs.js';
import { runFile, RUNNERS } from './run.js';
import { askAI } from './ai.js';

const PORT = process.env.PORT || 4000;
const ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ORIGIN }, maxHttpBufferSize: 2e6 });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: ORIGIN }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', authRouter);

// ---------- helpers ----------
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from({ length: 8 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
const userName = (id) => db.users.find((u) => u.id === id)?.username || 'unknown';
const membersOf = (s) => s.members.map((id) => ({ id, username: userName(id), isOwner: id === s.ownerId }));
const summary = (s) => ({ id: s.id, name: s.name, code: s.code, ownerId: s.ownerId, memberCount: s.members.length });

function getSession(req, res) {
  const s = db.sessions.find((x) => x.id === req.params.id);
  if (!s || !s.members.includes(req.user.id)) { res.status(404).json({ error: 'Session not found.' }); return null; }
  return s;
}
const fail = (res, e, code = 400) => res.status(e.status || code).json({ error: e.message });

// ---------- sessions ----------
app.get('/api/sessions', requireAuth, (req, res) =>
  res.json({ sessions: db.sessions.filter((s) => s.members.includes(req.user.id)).map(summary) }));

app.post('/api/sessions', requireAuth, (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (name.length < 1 || name.length > 60) return res.status(400).json({ error: 'Session name must be 1-60 characters.' });
  let code; do code = genCode(); while (db.sessions.some((s) => s.code === code));
  const s = { id: newId(), name, code, ownerId: req.user.id, members: [req.user.id], files: [], createdAt: Date.now() };
  createEntry(s, 'main.js', 'file', '// Welcome to CollabVeda!\nconsole.log("Hello, team!");\n');
  createEntry(s, 'main.py', 'file', '# Python works too\nprint("Hello from Python")\n');
  createEntry(s, 'README.md', 'file', `# ${name}\n\nShare the join code **${code}** with your team.\n`);
  db.sessions.push(s);
  save();
  res.status(201).json({ session: summary(s) });
});

app.post('/api/sessions/join', requireAuth, (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  const s = db.sessions.find((x) => x.code === code);
  if (!s) return res.status(404).json({ error: 'No session found for that code.' });
  if (!s.members.includes(req.user.id)) {
    s.members.push(req.user.id);
    save();
    io.to(`s:${s.id}`).emit('members', membersOf(s));
  }
  res.json({ session: summary(s) });
});

app.get('/api/sessions/:id', requireAuth, (req, res) => {
  const s = getSession(req, res); if (!s) return;
  res.json({ session: summary(s), members: membersOf(s), files: listFiles(s) });
});

app.delete('/api/sessions/:id', requireAuth, (req, res) => {
  const s = getSession(req, res); if (!s) return;
  if (s.ownerId !== req.user.id) return res.status(403).json({ error: 'Only the owner can delete a session.' });
  s.files.forEach((f) => dropDoc(f.id));
  db.sessions = db.sessions.filter((x) => x !== s);
  save();
  io.to(`s:${s.id}`).emit('session:deleted');
  io.in(`s:${s.id}`).socketsLeave(`s:${s.id}`);
  res.json({ ok: true });
});

// ---------- file system ----------
const pushFiles = (s) => io.to(`s:${s.id}`).emit('files', listFiles(s));

app.post('/api/sessions/:id/files', requireAuth, (req, res) => {
  const s = getSession(req, res); if (!s) return;
  try {
    const e = createEntry(s, req.body?.path, req.body?.type === 'dir' ? 'dir' : 'file');
    save(); pushFiles(s);
    res.status(201).json({ file: { id: e.id, path: e.path, type: e.type } });
  } catch (e) { fail(res, e); }
});

app.patch('/api/sessions/:id/files/:fileId', requireAuth, (req, res) => {
  const s = getSession(req, res); if (!s) return;
  try {
    renameEntry(s, req.params.fileId, req.body?.path);
    save(); pushFiles(s);
    res.json({ ok: true });
  } catch (e) { fail(res, e); }
});

app.delete('/api/sessions/:id/files/:fileId', requireAuth, (req, res) => {
  const s = getSession(req, res); if (!s) return;
  try {
    const removed = deleteEntry(s, req.params.fileId);
    removed.forEach((f) => { io.to(`f:${f.id}`).emit('doc:deleted', { fileId: f.id }); dropDoc(f.id); });
    save(); pushFiles(s);
    res.json({ ok: true });
  } catch (e) { fail(res, e, 404); }
});

// ---------- run & AI ----------
app.get('/api/runtimes', requireAuth, (_req, res) => res.json({ extensions: Object.keys(RUNNERS) }));

app.post('/api/sessions/:id/run', requireAuth, async (req, res) => {
  if (process.env.ENABLE_CODE_EXECUTION === 'false') return res.status(403).json({ error: 'Code execution is disabled on this server.' });
  const s = getSession(req, res); if (!s) return;
  const file = s.files.find((f) => f.id === req.body?.fileId && f.type === 'file');
  if (!file) return res.status(404).json({ error: 'File not found.' });
  res.json(await runFile(s, file, req.body?.stdin));
});

app.post('/api/sessions/:id/ai', requireAuth, async (req, res) => {
  const s = getSession(req, res); if (!s) return;
  const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-20) : [];
  if (!messages.length || messages.some((m) => !['user', 'assistant'].includes(m?.role) || typeof m.content !== 'string' || m.content.length > 20000))
    return res.status(400).json({ error: 'Invalid messages.' });
  const file = s.files.find((f) => f.id === req.body?.fileId && f.type === 'file');
  try {
    const reply = await askAI({
      messages, file, content: file ? liveContent(file) : '',
      filePaths: s.files.filter((f) => f.type === 'file').map((f) => f.path),
    });
    res.json({ reply });
  } catch (e) { fail(res, e, 500); }
});

// ---------- realtime ----------
const b64 = (u8) => Buffer.from(u8).toString('base64');

function presence(sessionId) {
  const list = [];
  for (const [, sock] of io.sockets.sockets) {
    if (sock.data.sessionId === sessionId)
      list.push({ userId: sock.data.user.id, username: sock.data.user.username, fileId: sock.data.fileId || null });
  }
  io.to(`s:${sessionId}`).emit('presence', list);
}

io.use((socket, next) => {
  const user = userFromToken(socket.handshake.auth?.token);
  if (!user) return next(new Error('unauthorized'));
  socket.data.user = publicUser(user);
  next();
});

io.on('connection', (socket) => {
  const sessionOf = () => db.sessions.find((s) => s.id === socket.data.sessionId && s.members.includes(socket.data.user.id));
  const fileOf = (fileId) => sessionOf()?.files.find((f) => f.id === fileId && f.type === 'file');

  socket.on('session:join', ({ sessionId } = {}, ack) => {
    const s = db.sessions.find((x) => x.id === sessionId);
    if (!s || !s.members.includes(socket.data.user.id)) return ack?.({ error: 'Not a member of this session.' });
    socket.data.sessionId = s.id;
    socket.join(`s:${s.id}`);
    ack?.({ ok: true });
    presence(s.id);
  });

  socket.on('doc:open', ({ fileId } = {}, ack) => {
    const f = fileOf(fileId);
    if (!f) return ack?.({ error: 'File not found.' });
    if (socket.data.fileId && socket.data.fileId !== fileId) socket.leave(`f:${socket.data.fileId}`);
    socket.data.fileId = fileId;
    socket.join(`f:${fileId}`);
    ack?.({ state: b64(Y.encodeStateAsUpdate(getDoc(f).ydoc)) });
    socket.to(`f:${fileId}`).emit('awareness:query', { fileId });
    presence(socket.data.sessionId);
  });

  socket.on('doc:close', ({ fileId } = {}) => {
    socket.leave(`f:${fileId}`);
    if (socket.data.fileId === fileId) socket.data.fileId = null;
    if (socket.data.sessionId) presence(socket.data.sessionId);
  });

  socket.on('doc:update', ({ fileId, update } = {}) => {
    const f = fileOf(fileId);
    if (!f || !socket.rooms.has(`f:${fileId}`) || !update) return;
    const u = new Uint8Array(update);
    try {
      Y.applyUpdate(getDoc(f).ydoc, u, 'client');
      if (getDoc(f).ydoc.getText('t').length > MAX_FILE_SIZE) return; // soft cap; content stays but is not amplified further
    } catch { return; }
    socket.to(`f:${fileId}`).emit('doc:update', { fileId, update: u });
  });

  socket.on('awareness:update', ({ fileId, update } = {}) => {
    if (!socket.rooms.has(`f:${fileId}`) || !update) return;
    socket.to(`f:${fileId}`).emit('awareness:update', { fileId, update: new Uint8Array(update) });
  });

  socket.on('disconnect', () => { if (socket.data.sessionId) presence(socket.data.sessionId); });
});

// ---------- static client (production) ----------
const dist = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

export { app, server };
if (process.env.NODE_ENV !== 'test') server.listen(PORT, () => console.log(`CollabVeda server on :${PORT}`));
