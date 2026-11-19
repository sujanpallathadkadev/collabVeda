// End-to-end smoke test: auth, membership enforcement, realtime Yjs sync between two users.
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = (await import('node:fs')).mkdtempSync('/tmp/cv-test-');
const assert = (await import('node:assert/strict')).default;
const Y = await import('yjs');
const { io } = await import('socket.io-client');
const { server } = await import('../src/index.js');
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
const call = async (path, { method = 'GET', body, token } = {}) => {
  const r = await fetch(base + '/api' + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body && JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
};
const reg = (u) => call('/auth/register', { method: 'POST', body: { username: u, email: `${u}@x.io`, password: 'password123' } });
const emit = (s, ev, p) => new Promise((r) => s.emit(ev, p, r));

const a = (await reg('alice')).data, b = (await reg('bob')).data, c = (await reg('carol')).data;
assert.equal((await reg('alice')).status, 409);
assert.equal((await call('/auth/login', { method: 'POST', body: { identifier: 'alice', password: 'wrong' } })).status, 401);
assert.equal((await call('/sessions')).status, 401);
assert.equal((await call('/sessions', { token: 'garbage' })).status, 401);

const { data: { session } } = await call('/sessions', { method: 'POST', body: { name: 'T' }, token: a.token });
assert.equal((await call(`/sessions/${session.id}`, { token: b.token })).status, 404, 'non-member blocked');
assert.equal((await call('/sessions/join', { method: 'POST', body: { code: session.code }, token: b.token })).status, 200);
const detail = (await call(`/sessions/${session.id}`, { token: b.token })).data;
assert.equal(detail.members.length, 2);
assert.equal((await call(`/sessions/${session.id}/files`, { method: 'POST', body: { path: '../evil', type: 'file' }, token: a.token })).status, 400);
assert.equal((await call(`/sessions/${session.id}/files`, { method: 'POST', body: { path: 'src/util/x.js', type: 'file' }, token: a.token })).status, 201);

// sockets
assert.ok(await new Promise((r) => { const s = io(base, { auth: { token: 'bad' } }); s.on('connect_error', () => { s.close(); r(true); }); }), 'bad token rejected');
const mk = async (tok) => { const s = io(base, { auth: { token: tok } }); await new Promise((r) => s.on('connect', r)); return s; };
const sa = await mk(a.token), sb = await mk(b.token), sc = await mk(c.token);
assert.ok((await emit(sc, 'session:join', { sessionId: session.id })).error, 'non-member cannot join room');
assert.ok((await emit(sa, 'session:join', { sessionId: session.id })).ok);
assert.ok((await emit(sb, 'session:join', { sessionId: session.id })).ok);
const fid = detail.files.find((f) => f.path === 'main.js').id;
const da = new Y.Doc(), db2 = new Y.Doc();
for (const [s, d] of [[sa, da], [sb, db2]]) {
  const { state } = await emit(s, 'doc:open', { fileId: fid });
  Y.applyUpdate(d, Buffer.from(state, 'base64'), 'remote');
  d.on('update', (u, o) => o !== 'remote' && s.emit('doc:update', { fileId: fid, update: u }));
  s.on('doc:update', (m) => Y.applyUpdate(d, new Uint8Array(m.update), 'remote'));
}
assert.match(da.getText('t').toString(), /Hello, team/);
da.getText('t').insert(0, 'A:'); db2.getText('t').insert(db2.getText('t').length, ':B');
await new Promise((r) => setTimeout(r, 300));
assert.equal(da.getText('t').toString(), db2.getText('t').toString(), 'docs converge');
assert.ok(da.getText('t').toString().startsWith('A:') && da.getText('t').toString().endsWith(':B'));

// run uses live content
const run = (await call(`/sessions/${session.id}/run`, { method: 'POST', body: { fileId: detail.files.find((f) => f.path === 'main.py').id }, token: b.token })).data;
assert.equal(run.stdout, 'Hello from Python\n');
assert.equal((await call(`/sessions/${session.id}/run`, { method: 'POST', body: { fileId: fid }, token: c.token })).status, 404);

// persisted after debounce
await new Promise((r) => setTimeout(r, 800));
const { db } = await import('../src/db.js');
assert.ok(db.sessions[0].files.find((f) => f.id === fid).content.startsWith('A:'));
console.log('all smoke tests passed');
process.exit(0);
