// Live Yjs documents, one per open file. Server is the source of truth that persists to the DB.
import * as Y from 'yjs';
import { save } from './db.js';

const docs = new Map(); // fileId -> { ydoc, file, timer }

export function getDoc(file) {
  let d = docs.get(file.id);
  if (!d) {
    const ydoc = new Y.Doc();
    ydoc.getText('t').insert(0, file.content || '');
    d = { ydoc, file, timer: null };
    ydoc.on('update', () => {
      clearTimeout(d.timer);
      d.timer = setTimeout(() => persist(d), 500);
    });
    docs.set(file.id, d);
  }
  return d;
}

function persist(d) {
  clearTimeout(d.timer);
  d.file.content = d.ydoc.getText('t').toString();
  save();
}

export const liveContent = (file) => (docs.has(file.id) ? docs.get(file.id).ydoc.getText('t').toString() : file.content);

export function dropDoc(fileId) {
  const d = docs.get(fileId);
  if (!d) return;
  clearTimeout(d.timer);
  d.ydoc.destroy();
  docs.delete(fileId);
}
