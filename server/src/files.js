// Virtual per-session file system helpers. Files are stored as flat {id, path, type, content}.
import { newId } from './db.js';

export const MAX_FILES = 200;
export const MAX_FILE_SIZE = 1_000_000;

export function cleanPath(p) {
  if (typeof p !== 'string') return null;
  const s = p.trim().replace(/^\/+|\/+$/g, '');
  if (!s || s.length > 200 || /[\\\0]/.test(s)) return null;
  const parts = s.split('/');
  if (parts.some((x) => !x || x === '.' || x === '..' || x.length > 100)) return null;
  return parts.join('/');
}

export const listFiles = (session) =>
  session.files.map(({ id, path, type }) => ({ id, path, type })).sort((a, b) => a.path.localeCompare(b.path));

export function ensureParents(session, path) {
  const parts = path.split('/').slice(0, -1);
  let cur = '';
  for (const part of parts) {
    cur = cur ? `${cur}/${part}` : part;
    const existing = session.files.find((f) => f.path === cur);
    if (existing && existing.type === 'file') throw new Error(`"${cur}" is a file, not a folder.`);
    if (!existing) session.files.push({ id: newId(), path: cur, type: 'dir', content: '' });
  }
}

export function createEntry(session, rawPath, type, content = '') {
  const path = cleanPath(rawPath);
  if (!path) throw new Error('Invalid path.');
  if (type !== 'file' && type !== 'dir') throw new Error('Invalid type.');
  if (session.files.some((f) => f.path === path)) throw new Error('A file or folder with that name already exists.');
  if (session.files.length >= MAX_FILES) throw new Error('File limit reached.');
  ensureParents(session, path);
  const entry = { id: newId(), path, type, content: type === 'file' ? content : '' };
  session.files.push(entry);
  return entry;
}

export function renameEntry(session, id, rawPath) {
  const entry = session.files.find((f) => f.id === id);
  if (!entry) throw new Error('Not found.');
  const path = cleanPath(rawPath);
  if (!path) throw new Error('Invalid path.');
  if (path === entry.path) return [entry];
  if (session.files.some((f) => f.path === path)) throw new Error('A file or folder with that name already exists.');
  if (entry.type === 'dir' && path.startsWith(entry.path + '/')) throw new Error('Cannot move a folder into itself.');
  ensureParents(session, path);
  const old = entry.path;
  const moved = [];
  for (const f of session.files) {
    if (f.id === id) { f.path = path; moved.push(f); }
    else if (entry.type === 'dir' && f.path.startsWith(old + '/')) { f.path = path + f.path.slice(old.length); moved.push(f); }
  }
  return moved;
}

export function deleteEntry(session, id) {
  const entry = session.files.find((f) => f.id === id);
  if (!entry) throw new Error('Not found.');
  const removed = session.files.filter(
    (f) => f.id === id || (entry.type === 'dir' && f.path.startsWith(entry.path + '/'))
  );
  const ids = new Set(removed.map((f) => f.id));
  session.files = session.files.filter((f) => !ids.has(f.id));
  return removed;
}
