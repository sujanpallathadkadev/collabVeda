// AI assistant: proxies to the Anthropic Messages API using a server-side key.
const MODEL = process.env.AI_MODEL || 'claude-sonnet-5-5';

export async function askAI({ messages, file, content, filePaths }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    const e = new Error('AI is not configured. Set ANTHROPIC_API_KEY on the server.');
    e.status = 503;
    throw e;
  }
  const system = [
    'You are an expert pair-programming assistant inside a collaborative online code editor.',
    'Be concise. Put code in fenced blocks with a language tag. When changing code, show the full updated snippet.',
    filePaths?.length ? `Project files:\n${filePaths.join('\n')}` : '',
    file ? `The user is editing "${file.path}":\n\`\`\`\n${(content || '').slice(0, 30000)}\n\`\`\`` : '',
  ].filter(Boolean).join('\n\n');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 2048, system, messages }),
    signal: AbortSignal.timeout(60_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(j?.error?.message || `AI request failed (${r.status})`);
    e.status = 502;
    throw e;
  }
  return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}
