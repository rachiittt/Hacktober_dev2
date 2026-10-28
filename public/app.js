/**
 * Spiritus — Frontend Application
 * Ghost in the Machine · Hacktoberfest 2026
 *
 * Connects to the Express backend (/api/*) which proxies Ollama.
 * Falls back to demo mode when Ollama isn't running.
 */

/* ──────────────────────────────────────────────────────────────
   STATE
────────────────────────────────────────────────────────────── */
const state = {
  offerings: [],
  remembrance: '',
  tone: 'poetic',
  chatHistory: [],    // [{role, content}]
  ollamaConnected: false,
  demoMode: false,
  generating: false,
  chatContext: null,  // Ollama context array for /api/generate
};

/* ──────────────────────────────────────────────────────────────
   DOM REFS
────────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const dom = {
  // Nav
  statusDot:        $('status-dot'),
  statusText:       $('status-text'),
  // Ofrenda
  personName:       $('person-name'),
  personDates:      $('person-dates'),
  personRelation:   $('person-relation'),
  personMemory:     $('person-memory'),
  offeringsGrid:    $('offerings-grid'),
  offeringInput:    $('offering-input'),
  addOfferingBtn:   $('add-offering-btn'),
  // Altar preview
  altarName:        $('altar-name-display'),
  altarOfferings:   $('altar-offerings-display'),
  // AI
  modelSelect:      $('model-select'),
  checkOllamaBtn:   $('check-ollama-btn'),
  connectionCard:   $('connection-card'),
  connectionIcon:   $('connection-icon'),
  connectionTitle:  $('connection-title'),
  connectionSub:    $('connection-sub'),
  fallbackNote:     $('fallback-note'),
  tonePills:        $('tone-pills'),
  generateBtn:      $('generate-btn'),
  outputPlaceholder:$('output-placeholder'),
  outputText:       $('output-text'),
  outputLoading:    $('output-loading'),
  loadingMessage:   $('loading-message'),
  outputActions:    $('output-actions'),
  speakBtn:         $('speak-btn'),
  speakBtnText:     $('speak-btn-text'),
  copyBtn:          $('copy-btn'),
  regenerateBtn:    $('regenerate-btn'),
  shareBtn:         $('share-btn'),
  useDemoBtn:       $('use-demo-btn'),
  // Chat
  chatMessages:     $('chat-messages'),
  chatInput:        $('chat-input'),
  chatSendBtn:      $('chat-send-btn'),
  // Toast
  toast:            $('toast'),
};

/* ──────────────────────────────────────────────────────────────
   PARTICLES (marigold petals floating)
────────────────────────────────────────────────────────────── */
(function initParticles() {
  const canvas = $('particles-canvas');
  const ctx    = canvas.getContext('2d');
  let W, H, particles = [];

  const COLORS = ['#f5c842','#ff7b2e','#f25c8f','#9b5cf6','#2adfe0'];
  const EMOJIS = ['🌼','✨','🌸','💀'];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  class Particle {
    constructor() { this.reset(true); }
    reset(init = false) {
      this.x  = Math.random() * W;
      this.y  = init ? Math.random() * H : -20;
      this.r  = 1 + Math.random() * 2.5;
      this.vx = (Math.random() - .5) * .4;
      this.vy = .3 + Math.random() * .7;
      this.op = .1 + Math.random() * .4;
      this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
      this.isEmoji = Math.random() < .04;
      this.emoji   = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
      this.angle   = Math.random() * Math.PI * 2;
      this.spin    = (Math.random() - .5) * .04;
    }
    update() {
      this.x     += this.vx;
      this.y     += this.vy;
      this.angle += this.spin;
      if (this.y > H + 20) this.reset();
    }
    draw() {
      if (this.isEmoji) {
        ctx.save();
        ctx.globalAlpha = this.op * .7;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.font = '14px serif';
        ctx.fillText(this.emoji, -7, 7);
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = this.op;
        ctx.fillStyle   = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur  = 6;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function init() {
    resize();
    particles = Array.from({ length: 80 }, () => new Particle());
  }

  function loop() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  init();
  loop();
})();

/* ──────────────────────────────────────────────────────────────
   TOAST
────────────────────────────────────────────────────────────── */
let toastTimer;
function showToast(msg, dur = 3000) {
  dom.toast.textContent = msg;
  dom.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove('show'), dur);
}

/* ──────────────────────────────────────────────────────────────
   OLLAMA STATUS
────────────────────────────────────────────────────────────── */
async function checkOllama() {
  dom.statusDot.className  = 'status-dot checking';
  dom.statusText.textContent = 'Checking…';
  dom.connectionIcon.textContent = '⏳';
  dom.connectionCard.classList.remove('connected','error');
  dom.connectionTitle.textContent = 'Checking connection…';

  try {
    const res  = await fetch('/api/ollama/status');
    const data = await res.json();

    if (data.connected) {
      state.ollamaConnected = true;
      state.demoMode        = false;

      dom.statusDot.className       = 'status-dot online';
      dom.statusText.textContent    = 'AI Online';
      dom.connectionIcon.textContent = '✅';
      dom.connectionCard.classList.add('connected');
      dom.connectionTitle.textContent = `Ollama connected · ${data.models.length} model(s) available`;
      dom.connectionSub.textContent   = data.models.slice(0,4).join(' · ') || 'No models pulled yet';
      dom.fallbackNote.style.display  = 'none';

      // Populate model selector with available models
      if (data.models.length) {
        dom.modelSelect.innerHTML = data.models.map(m =>
          `<option value="${m}">${m}</option>`
        ).join('');
      }
    } else {
      throw new Error('not connected');
    }
  } catch {
    state.ollamaConnected = false;
    dom.statusDot.className        = 'status-dot offline';
    dom.statusText.textContent     = 'AI Offline';
    dom.connectionIcon.textContent = '❌';
    dom.connectionCard.classList.add('error');
    dom.connectionTitle.textContent = 'Ollama not found — start it to use local AI';
    dom.connectionSub.innerHTML = 'Run: <code>ollama serve</code> · then: <code>ollama pull gemma3:4b</code>';
    dom.fallbackNote.style.display  = '';
  }

  updateGenerateButton();
}

function updateGenerateButton() {
  const hasName = dom.personName.value.trim().length > 0;
  dom.generateBtn.disabled = !hasName || state.generating;
}

/* ──────────────────────────────────────────────────────────────
   OFFERINGS
────────────────────────────────────────────────────────────── */
const OFFERING_EMOJIS = {
  coffee:   '☕', tea:    '🍵', flowers: '🌸', roses: '🌹', marigold: '🌼',
  candles:  '🕯️', music:  '🎵', book:    '📖', bread:  '🍞',
  guitar:   '🎸', photo:  '📷', wine:    '🍷', beer:   '🍺',
  chocolate:'🍫', fruit:  '🍊', corn:    '🌽', sugar:  '🍬',
  incense:  '🪔', prayer: '🙏', cross:   '✝️',  star:   '⭐',
};

function getOfferingEmoji(name) {
  const lower = name.toLowerCase();
  for (const [key, emoji] of Object.entries(OFFERING_EMOJIS)) {
    if (lower.includes(key)) return emoji;
  }
  return '🎁';
}

function renderOfferings() {
  // Tag chips in add panel
  dom.offeringsGrid.innerHTML = state.offerings.map((o, i) => `
    <span class="offering-tag">
      ${getOfferingEmoji(o)} ${o}
      <button class="offering-remove" data-i="${i}" aria-label="Remove">✕</button>
    </span>
  `).join('');

  // Altar preview
  dom.altarOfferings.innerHTML = state.offerings.map((o, i) => `
    <span class="altar-offering-icon" style="--delay:${i * .3}s" title="${o}">${getOfferingEmoji(o)}</span>
  `).join('');
}

function addOffering(customVal) {
  const val = (typeof customVal === 'string' ? customVal : dom.offeringInput.value).trim();
  if (!val) return;
  if (state.offerings.length >= 6) {
    showToast('Altar is full (max 6 offerings) 🕯️');
    return;
  }
  if (state.offerings.some(o => o.toLowerCase() === val.toLowerCase())) {
    showToast('Already placed that offering 🌼');
    return;
  }
  state.offerings.push(val);
  dom.offeringInput.value = '';
  renderOfferings();
  saveDraft();
}

dom.addOfferingBtn.addEventListener('click', () => addOffering());
dom.offeringInput.addEventListener('keydown', e => { if (e.key === 'Enter') addOffering(); });

// Quick chip suggestions
document.querySelectorAll('.quick-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    addOffering(chip.dataset.offering);
  });
});

dom.offeringsGrid.addEventListener('click', e => {
  const btn = e.target.closest('.offering-remove');
  if (!btn) return;
  state.offerings.splice(Number(btn.dataset.i), 1);
  renderOfferings();
  saveDraft();
});

/* ──────────────────────────────────────────────────────────────
   LOCAL STORAGE PERSISTENCE & AUTO-SAVE
────────────────────────────────────────────────────────────── */
const STORAGE_KEY = 'spiritus_ofrenda_draft';

function saveDraft() {
  const draft = {
    name: dom.personName.value,
    dates: dom.personDates.value,
    relation: dom.personRelation.value,
    memory: dom.personMemory.value,
    offerings: state.offerings,
    tone: state.tone,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {}
}

function restoreDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const draft = JSON.parse(raw);
    if (draft.name) dom.personName.value = draft.name;
    if (draft.dates) dom.personDates.value = draft.dates;
    if (draft.relation) dom.personRelation.value = draft.relation;
    if (draft.memory) dom.personMemory.value = draft.memory;
    if (Array.isArray(draft.offerings) && draft.offerings.length) {
      state.offerings = draft.offerings;
    }
    if (draft.tone) {
      state.tone = draft.tone;
      document.querySelectorAll('.tone-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tone === draft.tone);
      });
    }
    return true;
  } catch {
    return false;
  }
}

/* ──────────────────────────────────────────────────────────────
   ALTAR PREVIEW & FORM INPUTS — live
────────────────────────────────────────────────────────────── */
[dom.personName, dom.personDates, dom.personRelation, dom.personMemory].forEach(el => {
  el.addEventListener('input', () => {
    const name = dom.personName.value.trim();
    dom.altarName.querySelector('.altar-name-text').textContent = name || '—';
    updateGenerateButton();
    saveDraft();
  });
});

/* ──────────────────────────────────────────────────────────────
   BUILD PROMPT
────────────────────────────────────────────────────────────── */
function buildPrompt() {
  const name     = dom.personName.value.trim()    || 'them';
  const dates    = dom.personDates.value.trim()   || '';
  const relation = dom.personRelation.value.trim()|| 'someone dear';
  const memory   = dom.personMemory.value.trim()  || '';
  const offerings= state.offerings.join(', ')     || 'marigolds and candles';
  const tone     = state.tone || 'poetic';

  const toneGuides = {
    poetic: 'Lyrical, mystical, and deeply evocative prose with rich imagery of cempasúchil and candle flame.',
    celebratory: 'Vibrant, joyful, and honoring life with celebration, humor, and gratitude.',
    solemn: 'Reverent, calm, dignified, and serene, honoring quiet guidance and timeless peace.',
    storyteller: 'Narrative-driven, warming like a story told around a family table with personal anecdotes.'
  };

  return `You are Spiritus, a compassionate AI writing companion for a Día de los Muertos digital ofrenda.

Tone: ${tone.toUpperCase()} (${toneGuides[tone] || toneGuides.poetic})
Person being honored: ${name}${dates ? ` (${dates})` : ''}
My relationship to them: ${relation}
A cherished memory: ${memory || 'their warm presence and kindness'}
Offerings placed on their altar: ${offerings}

Write a beautiful, personal, and emotionally resonant remembrance of 3–4 paragraphs in this style. Weave in the specific details above naturally. End with a poignant closing line that feels like lighting a digital candle. Speak from the heart.`;
}

/* ──────────────────────────────────────────────────────────────
   GENERATE REMEMBRANCE (SSE streaming)
────────────────────────────────────────────────────────────── */
async function generateRemembrance() {
  if (state.generating) return;
  state.generating = true;
  dom.generateBtn.disabled = true;

  // Show loading
  dom.outputPlaceholder.style.display = 'none';
  dom.outputText.style.display        = 'none';
  dom.outputActions.style.display     = 'none';
  dom.outputLoading.style.display     = 'flex';
  dom.outputLoading.querySelector('#loading-message').textContent = 'Calling the spirits…';

  // Enable chat
  dom.chatInput.disabled    = false;
  dom.chatSendBtn.disabled  = false;

  if (state.demoMode || !state.ollamaConnected) {
    // Demo mode: call /api/demo
    await runDemoMode();
  } else {
    // Streaming via SSE
    await runStreamingGenerate();
  }

  state.generating = false;
  updateGenerateButton();
}

async function runDemoMode() {
  const name      = dom.personName.value.trim() || 'them';
  const relation  = dom.personRelation.value.trim() || 'someone dear';
  const dates     = dom.personDates.value.trim() || '';
  const memory    = dom.personMemory.value.trim() || '';
  const offerings = state.offerings;
  const tone      = state.tone || 'poetic';

  try {
    const res  = await fetch('/api/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, relation, dates, memory, offerings, tone })
    });
    const data = await res.json();

    dom.outputLoading.style.display = 'none';
    dom.outputText.style.display    = 'block';
    dom.outputActions.style.display = 'flex';
    state.remembrance = data.text;
    // Type out the text
    await typewriterEffect(dom.outputText, data.text);

    // Seed chat history
    state.chatHistory = [
      { role: 'system',    content: `You are Spiritus, a compassionate AI for a Día de los Muertos ofrenda app. A remembrance for ${name} has been written. Help the user expand, refine or add to it.` },
      { role: 'assistant', content: data.text }
    ];
    showToast('✨ Demo remembrance generated');

  } catch (err) {
    showError(err.message);
  }
}

async function runStreamingGenerate() {
  const prompt = buildPrompt();
  const model  = dom.modelSelect.value;

  let fullText = '';
  let cursor;

  dom.outputLoading.style.display = 'none';
  dom.outputText.style.display    = 'block';
  dom.outputText.textContent      = '';
  cursor = document.createElement('span');
  cursor.className = 'cursor-blink';
  dom.outputText.appendChild(cursor);

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt })
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const payload = JSON.parse(line.slice(6));
          if (payload.error) { showError(payload.error); return; }
          if (payload.token) {
            fullText += payload.token;
            // Remove cursor, add text, re-add cursor
            if (cursor.parentNode) cursor.remove();
            dom.outputText.textContent = fullText;
            dom.outputText.appendChild(cursor);
            // Auto-scroll
            dom.outputText.parentNode.scrollTop = dom.outputText.parentNode.scrollHeight;
          }
          if (payload.done) {
            state.chatContext = payload.context;
          }
        } catch { /* skip */ }
      }
    }

    // Final
    if (cursor.parentNode) cursor.remove();
    dom.outputText.textContent = fullText;
    state.remembrance = fullText;
    dom.outputActions.style.display = 'flex';

    // Seed chat
    state.chatHistory = [
      { role: 'system',    content: `You are Spiritus, a compassionate AI writing companion for a Día de los Muertos ofrenda app. A remembrance for ${dom.personName.value.trim() || 'them'} has been written. Help the user expand, refine or poetically extend it.` },
      { role: 'assistant', content: fullText }
    ];

    showToast('✨ Remembrance generated');

  } catch (err) {
    showError(`Stream error: ${err.message}`);
  }
}

function showError(msg) {
  dom.outputLoading.style.display = 'none';
  dom.outputPlaceholder.style.display = 'flex';
  dom.outputPlaceholder.innerHTML = `<div class="output-skull">⚠️</div><p style="color:#f25c8f">${msg}</p><p class="output-hint">Make sure Ollama is running, or use Demo Mode.</p>`;
}

async function typewriterEffect(el, text, speed = 12) {
  el.textContent = '';
  for (let i = 0; i < text.length; i++) {
    el.textContent += text[i];
    if (i % 3 === 0) await sleep(speed);
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ──────────────────────────────────────────────────────────────
   CHAT (multi-turn)
────────────────────────────────────────────────────────────── */
async function sendChat() {
  const msg = dom.chatInput.value.trim();
  if (!msg || state.generating) return;

  dom.chatInput.value = '';
  appendChatBubble('user', '🧑', msg);

  state.chatHistory.push({ role: 'user', content: msg });
  state.generating = true;
  dom.chatSendBtn.disabled = true;

  // Placeholder bubble
  const aiBubble = appendChatBubble('ai', '👻', '…');
  const aiBubbleP = aiBubble.querySelector('p');
  let fullReply = '';

  if (state.demoMode || !state.ollamaConnected) {
    // Demo reply
    await sleep(1200);
    const reply = `${genDemoReply(msg)}\n\n*— Spiritus (demo mode)*`;
    aiBubbleP.textContent = reply;
    state.chatHistory.push({ role: 'assistant', content: reply });
    state.generating = false;
    dom.chatSendBtn.disabled = false;
    return;
  }

  try {
    const model = dom.modelSelect.value;
    const res   = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: state.chatHistory })
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    aiBubbleP.textContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const payload = JSON.parse(line.slice(6));
          if (payload.token) {
            fullReply += payload.token;
            aiBubbleP.textContent = fullReply;
            dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
          }
        } catch { /* skip */ }
      }
    }

    state.chatHistory.push({ role: 'assistant', content: fullReply });

  } catch (err) {
    aiBubbleP.textContent = `Error: ${err.message}`;
  }

  state.generating = false;
  dom.chatSendBtn.disabled = false;
}

function appendChatBubble(role, emoji, text) {
  const div = document.createElement('div');
  div.className = `chat-bubble ${role}-bubble`;
  div.innerHTML = `<span>${emoji}</span><p>${text}</p>`;
  dom.chatMessages.appendChild(div);
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
  return div;
}

function genDemoReply(msg) {
  const lower = msg.toLowerCase();
  if (lower.includes('poem') || lower.includes('poetry'))
    return `Here is a poem for the altar:\n\nIn the hour the marigolds open wide,\nyour name is the candle we burn inside.\nNo distance the dead and the living keeps—\njust a thin veil that breathes, that speaks.`;
  if (lower.includes('spanish') || lower.includes('español'))
    return `En el suave resplandor de las caléndulas, tu memoria florece. Te llevamos en los latidos que siguen, en el aroma del café que preparabas, en las canciones que aún cantamos.`;
  if (lower.includes('short') || lower.includes('brief'))
    return `A single candle, a single name. That is enough to hold a life.`;
  return `Spiritus hears you. The flame does not forget. Let me add: *"And in every quiet room where they once sat, the air still holds their shape."*`;
}

/* ──────────────────────────────────────────────────────────────
   ACTIONS — copy / save / regenerate / recite aloud
────────────────────────────────────────────────────────────── */
let currentUtterance = null;

function stopSpeaking() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (dom.speakBtn) {
    dom.speakBtn.classList.remove('speaking');
    dom.speakBtnText.textContent = 'Recite Aloud';
  }
  currentUtterance = null;
}

if (dom.speakBtn) {
  dom.speakBtn.addEventListener('click', () => {
    if (!state.remembrance) return;
    if (!('speechSynthesis' in window)) {
      showToast('Speech synthesis is not supported on this browser');
      return;
    }

    if (window.speechSynthesis.speaking) {
      stopSpeaking();
      showToast('🔇 Narration stopped');
      return;
    }

    // Clean markdown symbols from speech
    const cleanText = state.remembrance
      .replace(/[*_#~`]/g, '')
      .replace(/\n+/g, ' ');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 0.88;
    utterance.pitch = 0.95;

    // Pick gentle English/Spanish voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v =>
      v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Serena'))
    );
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onstart = () => {
      dom.speakBtn.classList.add('speaking');
      dom.speakBtnText.textContent = 'Stop Reciting';
      showToast('🔊 Reciting remembrance aloud…');
    };

    utterance.onend = () => {
      stopSpeaking();
    };

    utterance.onerror = () => {
      stopSpeaking();
    };

    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  });
}

dom.copyBtn.addEventListener('click', async () => {
  if (!state.remembrance) return;
  await navigator.clipboard.writeText(state.remembrance);
  showToast('📋 Copied to clipboard');
});

dom.regenerateBtn.addEventListener('click', () => {
  stopSpeaking();
  generateRemembrance();
});

dom.shareBtn.addEventListener('click', async () => {
  if (!state.remembrance) return;

  const name = dom.personName.value.trim() || 'beloved';
  const blob = new Blob([
    `SPIRITUS — A Remembrance for ${name}\n`,
    `${'─'.repeat(50)}\n\n`,
    state.remembrance,
    `\n\n${'─'.repeat(50)}\n`,
    `Tone: ${state.tone.toUpperCase()}\n`,
    `Created with Spiritus · Hacktoberfest 2026\n`,
    `Open-source AI · Gemma via Ollama · Private by default\n`,
  ], { type: 'text/plain' });

  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `spiritus-${name.replace(/\s+/g,'-').toLowerCase()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('💾 Saved as text file');

  // Also persist to server
  await fetch('/api/ofrenda/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      relation:   dom.personRelation.value.trim(),
      dates:      dom.personDates.value.trim(),
      memory:     dom.personMemory.value.trim(),
      offerings:  state.offerings,
      remembrance:state.remembrance,
      tone:       state.tone,
    })
  }).catch(() => {});
});

/* ──────────────────────────────────────────────────────────────
   EVENTS
────────────────────────────────────────────────────────────── */
dom.checkOllamaBtn.addEventListener('click', checkOllama);
dom.generateBtn.addEventListener('click', () => {
  stopSpeaking();
  generateRemembrance();
});
dom.chatSendBtn.addEventListener('click', sendChat);
dom.chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});

// Tone selector pills
if (dom.tonePills) {
  dom.tonePills.addEventListener('click', e => {
    const btn = e.target.closest('.tone-pill');
    if (!btn) return;
    document.querySelectorAll('.tone-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    state.tone = btn.dataset.tone;
    saveDraft();
    showToast(`Style set to ${btn.dataset.tone} 🕯️`);
  });
}

dom.useDemoBtn.addEventListener('click', () => {
  state.demoMode = true;
  dom.connectionIcon.textContent = '🎭';
  dom.connectionCard.classList.remove('error');
  dom.connectionTitle.textContent = 'Demo mode — no Ollama required';
  dom.connectionSub.textContent   = 'A canned response will be shown to demonstrate the UI.';
  dom.statusDot.className = 'status-dot';
  dom.statusText.textContent = 'Demo Mode';
  updateGenerateButton();
  showToast('🎭 Demo mode enabled');
});

/* ──────────────────────────────────────────────────────────────
   NAV scroll active
────────────────────────────────────────────────────────────── */
const sections = document.querySelectorAll('section[id], header[id]');
const navLinks  = document.querySelectorAll('.nav-links a');
const observer  = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      navLinks.forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === `#${e.target.id}`);
      });
    }
  });
}, { threshold: .4 });
sections.forEach(s => observer.observe(s));

/* ──────────────────────────────────────────────────────────────
   INIT
────────────────────────────────────────────────────────────── */
const restored = restoreDraft();
checkOllama();

if (!restored || !state.offerings.length) {
  ['marigold flowers', 'old jazz records', 'coffee'].forEach(o => {
    if (!state.offerings.includes(o)) state.offerings.push(o);
  });
}

renderOfferings();
if (dom.personName.value.trim()) {
  dom.altarName.querySelector('.altar-name-text').textContent = dom.personName.value.trim();
  updateGenerateButton();
}
