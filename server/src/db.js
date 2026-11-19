// Tiny JSON-file datastore (swap for Postgres/Mongo in production).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = process.env.DATA_DIR || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data');
const FILE = path.join(DIR, 'db.json');
fs.mkdirSync(DIR, { recursive: true });

export const db = { users: [], sessions: [], secret: null };
if (fs.existsSync(FILE)) Object.assign(db, JSON.parse(fs.readFileSync(FILE, 'utf8')));
if (!db.secret) db.secret = crypto.randomBytes(48).toString('hex');

let timer = null;
export function flush() {
  clearTimeout(timer);
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
}
export function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 300);
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { flush(); process.exit(0); });
process.on('exit', () => { try { flush(); } catch {} });
flush();

export const newId = () => crypto.randomUUID();
