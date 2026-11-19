// Runs a file from a session in a throwaway temp dir. NOT a hardened sandbox: see README.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { liveContent } from './docs.js';

export const RUNNERS = {
  '.js': ['node'], '.mjs': ['node'], '.cjs': ['node'],
  '.py': ['python3', '-u'],
  '.sh': ['bash'],
  '.rb': ['ruby'], '.php': ['php'], '.pl': ['perl'], '.lua': ['lua'],
};
const TIMEOUT_MS = 10_000;
const MAX_OUT = 100_000;

export function runFile(session, file, stdin = '') {
  return new Promise((resolve) => {
    const ext = path.extname(file.path).toLowerCase();
    const cmd = RUNNERS[ext];
    if (!cmd) return resolve({ error: `Running "${ext || file.path}" files is not supported. Supported: ${Object.keys(RUNNERS).join(' ')}` });

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-run-'));
    for (const f of session.files) {
      const target = path.join(dir, f.path);
      if (!target.startsWith(dir + path.sep)) continue;
      if (f.type === 'dir') fs.mkdirSync(target, { recursive: true });
      else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, liveContent(f)); }
    }

    const started = Date.now();
    let out = '', err = '', timedOut = false, done = false;
    const child = spawn(cmd[0], [...cmd.slice(1), file.path], {
      cwd: dir, detached: true,
      env: { PATH: process.env.PATH, HOME: dir, LANG: 'C.UTF-8' }, // never leak server secrets
    });
    const finish = (code, extra = {}) => {
      if (done) return; done = true;
      clearTimeout(timer);
      fs.rm(dir, { recursive: true, force: true }, () => {});
      resolve({ stdout: out, stderr: err, code, timedOut, durationMs: Date.now() - started, ...extra });
    };
    const killGroup = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} };
    const timer = setTimeout(() => { timedOut = true; killGroup(); }, TIMEOUT_MS);
    const cap = (s, chunk) => (s.length < MAX_OUT ? s + chunk.toString() : s);
    child.stdout.on('data', (c) => { out = cap(out, c); if (out.length >= MAX_OUT) killGroup(); });
    child.stderr.on('data', (c) => { err = cap(err, c); if (err.length >= MAX_OUT) killGroup(); });
    child.on('error', (e) => finish(null, { error: e.code === 'ENOENT' ? `"${cmd[0]}" is not installed on the server.` : e.message }));
    child.on('close', (code) => finish(code));
    child.stdin.on('error', () => {});
    child.stdin.end(String(stdin).slice(0, 10_000));
  });
}
