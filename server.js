/**
 * Spiritus — Ghost in the Machine
 * Backend: Express server that proxies Ollama and serves the frontend
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_BASE = process.env.OLLAMA_URL || 'http://localhost:11434';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: '1.0.0' });
});

// ── Check Ollama status ────────────────────────────────────────────────────────
app.get('/api/ollama/status', async (_req, res) => {
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/tags`, { timeout: 3000 });
    if (!r.ok) throw new Error('non-200');
    const data = await r.json();
    const models = (data.models || []).map(m => m.name);
    res.json({ connected: true, models });
  } catch {
    res.json({ connected: false, models: [] });
  }
});

// ── List available Ollama models ───────────────────────────────────────────────
app.get('/api/ollama/models', async (_req, res) => {
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/tags`);
    const data = await r.json();
    res.json(data.models || []);
  } catch {
    res.status(503).json({ error: 'Ollama not reachable' });
  }
});

// ── Stream generate — SSE ──────────────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  const { model = 'gemma3:4b', prompt, context = [] } = req.body;

  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const ollamaRes = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, context, stream: true }),
    });

    if (!ollamaRes.ok) {
      const err = await ollamaRes.text();
      send({ error: err });
      return res.end();
    }

    // Stream chunks from Ollama → SSE to browser
    ollamaRes.body.on('data', chunk => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          send({ token: parsed.response || '', done: parsed.done || false, context: parsed.context });
        } catch { /* skip malformed */ }
      }
    });

    ollamaRes.body.on('end', () => {
      send({ done: true });
      res.end();
    });

    ollamaRes.body.on('error', err => {
      send({ error: err.message });
      res.end();
    });

  } catch (err) {
    send({ error: `Cannot reach Ollama: ${err.message}` });
    res.end();
  }
});

// ── Chat endpoint (multi-turn, streaming) ─────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { model = 'gemma3:4b', messages = [] } = req.body;

  if (!messages.length) return res.status(400).json({ error: 'messages required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const ollamaRes = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
    });

    if (!ollamaRes.ok) {
      send({ error: await ollamaRes.text() });
      return res.end();
    }

    ollamaRes.body.on('data', chunk => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          send({ token: parsed.message?.content || '', done: parsed.done || false });
        } catch { /* skip */ }
      }
    });

    ollamaRes.body.on('end', () => { send({ done: true }); res.end(); });
    ollamaRes.body.on('error', err => { send({ error: err.message }); res.end(); });

  } catch (err) {
    send({ error: `Cannot reach Ollama: ${err.message}` });
    res.end();
  }
});

// ── Demo mode — canned response (no Ollama needed) ────────────────────────────
app.post('/api/demo', (req, res) => {
  const { name = 'them', relation = 'someone dear' } = req.body;

  const remembrance = `In the soft glow of marigold light, I remember ${name} — ${relation} whose laughter could fill a room and whose hands knew exactly how to make the world feel safe.

There are moments that don't fade: the way ${name} hummed while cooking, the worn edges of a favourite book left open on the table, the particular warmth of a greeting that meant *you are home*.

Open-weight AI carries no subscription, no cloud overhead, no data harvested — just the quiet work of a model running on silicon that belongs to you. It felt right to build something this personal on technology that is just as private. Your memories stay in your machine. Your words stay yours.

Tonight, on the altar, candles flicker for ${name}. The marigolds know the way. And somewhere, I believe, the spirit of ${name} still hums.

*Remember. Light a candle. Tell the story.*`;

  res.json({ text: remembrance });
});

// ── Save ofrenda as JSON ───────────────────────────────────────────────────────
app.post('/api/ofrenda/save', (req, res) => {
  // In a real deployment, persist to a DB. Here we echo back with a timestamp.
  const { name, relation, dates, memory, offerings, remembrance } = req.body;
  res.json({
    id: `ofrenda_${Date.now()}`,
    saved_at: new Date().toISOString(),
    data: { name, relation, dates, memory, offerings, remembrance }
  });
});

// ── Catch-all → index.html ─────────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🕯️  Spiritus running at http://localhost:${PORT}`);
  console.log(`🤖  Ollama expected at ${OLLAMA_BASE}`);
  console.log(`📋  Press Ctrl+C to stop\n`);
});
