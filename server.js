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

const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'ofrendas.json');

// Ensure data folder and file exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf-8');
}

// ── Demo mode — canned response (no Ollama needed) ────────────────────────────
app.post('/api/demo', (req, res) => {
  const {
    name = 'them',
    relation = 'someone dear',
    dates = '',
    memory = '',
    offerings = [],
    tone = 'poetic',
  } = req.body;

  const offeringsText = offerings && offerings.length
    ? offerings.join(', ')
    : 'bright marigold petals and flickering candles';

  const memoryText = memory
    ? `We still hold onto that cherished memory: ${memory}.`
    : `There are moments that refuse to fade: the cadence of their voice, the warmth of their hands, and the quiet comfort they brought into any room.`;

  let remembrance;
  switch (tone) {
    case 'celebratory':
      remembrance = `¡Que viva el recuerdo! Today we do not mourn what was lost, but celebrate the radiant light of ${name}${dates ? ` (${dates})` : ''} — our beloved ${relation}.

${memoryText}

We have set the table with love: ${offeringsText}. Every gift placed on this ofrenda is an invitation to dance, to laugh, and to toast to a life lived fully and without reservation.

Open-weight AI gives us the privacy to honor you freely, without data harvesting or cloud dependencies. Tonight, the music plays on and ${name}'s spirit dances in every spark.

*¡Salud, alegría y memoria eterna!*`;
      break;

    case 'solemn':
      remembrance = `In reverent silence, we speak the name of ${name}${dates ? ` (${dates})` : ''}. To lose ${relation} is to carry a quiet space in the chest where their guidance once stood.

${memoryText}

Before the portrait, we lay offerings of remembrance: ${offeringsText}. Each candle flame is a steadfast promise that time will not diminish what you gave to this world.

May peace surround your memory as it rests securely in our hearts and in this private space.

*Rest in peace, surrounded by the golden light.*`;
      break;

    case 'storyteller':
      remembrance = `Gather round the altar, because there is a story to tell about ${name} — ${relation} who left footprints across all our days.

${memoryText}

Look closely at what we've gathered for them today: ${offeringsText}. Each item is a chapter in the book of who they were, a reminder that every shared meal and quiet evening was holy.

No server in the cloud owns these words. They live right here, where the memory was made. We keep telling the story so the flame never goes out.

*As long as we tell the tales, you walk beside us.*`;
      break;

    case 'poetic':
    default:
      remembrance = `In the soft amber glow of cempasúchil light, we summon the spirit of ${name}${dates ? ` (${dates})` : ''} — our ${relation} whose laughter could fill any room.

${memoryText}

Tonight on the altar, we offer: ${offeringsText}. The scent of petals creates a golden bridge across the veil, carrying our gratitude through the quiet dark.

Private by design and woven from affection, these words stay on this machine, just as your memory stays rooted in our blood.

*Remember. Light a candle. Tell the story.*`;
      break;
  }

  res.json({ text: remembrance });
});

// ── Save ofrenda as JSON ───────────────────────────────────────────────────────
app.post('/api/ofrenda/save', (req, res) => {
  try {
    const { name, relation, dates, memory, offerings, remembrance, tone } = req.body;
    const newEntry = {
      id: `ofrenda_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      saved_at: new Date().toISOString(),
      name: name || 'Beloved',
      relation: relation || '',
      dates: dates || '',
      memory: memory || '',
      offerings: offerings || [],
      remembrance: remembrance || '',
      tone: tone || 'poetic',
    };

    let entries = [];
    if (fs.existsSync(DATA_FILE)) {
      try {
        entries = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      } catch {
        entries = [];
      }
    }

    entries.unshift(newEntry);
    // Keep up to 50 saved ofrendas
    if (entries.length > 50) entries = entries.slice(0, 50);

    fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), 'utf-8');
    res.json({ success: true, entry: newEntry });
  } catch (err) {
    res.status(500).json({ error: 'Failed to persist ofrenda', details: err.message });
  }
});

// ── List saved ofrendas ────────────────────────────────────────────────────────
app.get('/api/ofrendas', (_req, res) => {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return res.json([]);
    }
    const entries = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    res.json(entries);
  } catch {
    res.json([]);
  }
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
