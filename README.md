# ⚡ CollabVeda

A collaborative, AI-assisted online code editor built with React.

## Features
- **Auth** – register / sign in (bcrypt-hashed passwords, JWT). Every API call and every WebSocket connection requires a valid token; only session **members** can read or edit a session.
- **Sessions** – a team creates a session and gets an 8-character join code; teammates sign in and join with it.
- **Real-time editing** – Monaco editor + Yjs CRDT: concurrent edits merge conflict-free, live remote cursors, presence (who is online / in which file), auto-reconnect.
- **File system** – per-session virtual file tree: create / rename / move / delete files and folders, synced live to everyone, persisted on the server.
- **Language support** – Monaco syntax highlighting & IntelliSense for 70+ languages (JS/TS/JSON/HTML/CSS have rich language services). **Run** button executes `.js .py .sh .rb .php .pl .lua` on the server (10 s timeout, 100 KB output cap) with optional stdin.
- **AI assistant** – side panel that sees your open file + file list; "Insert at cursor" puts generated code straight into the shared document. Uses the Anthropic API.

## Run it
```bash
npm run install:all
export ANTHROPIC_API_KEY=sk-ant-...   # optional; enables the AI panel
npm run dev                            # server :4000, client http://localhost:5173
```
Production: `npm run build && npm start` (server serves `client/dist` on :4000).

| Env var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | enables AI assistant |
| `AI_MODEL` | model id (default `claude-sonnet-5-5`) |
| `JWT_SECRET` | token signing secret (auto-generated & stored if unset) |
| `CLIENT_ORIGIN` | allowed CORS origin (default `http://localhost:5173`) |
| `PORT`, `DATA_DIR` | server port / data directory |
| `ENABLE_CODE_EXECUTION=false` | disable the Run feature |

Tests: `cd server && npm test` (auth, membership enforcement, two-client CRDT convergence, run).

## Security notes
- **Code execution is not a hardened sandbox.** It runs in a temp dir with a stripped environment, a timeout and an output cap, but still as the server's OS user. Before exposing this publicly, run it in containers / gVisor / Firecracker, or set `ENABLE_CODE_EXECUTION=false`.
- Data is stored in a JSON file (`server/data/db.json`) for simplicity; swap `db.js` for a real database for production use.
- Auth endpoints are rate limited; passwords must be ≥ 8 chars.

## Layout
`server/src` – `index.js` (REST + Socket.IO), `auth.js`, `files.js`, `docs.js` (Yjs docs), `run.js`, `ai.js`  
`client/src` – `pages/` (Auth, Dashboard, Workspace), `components/` (CodeEditor, FileTree, AIPanel)
