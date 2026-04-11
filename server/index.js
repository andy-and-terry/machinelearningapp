'use strict';

const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_BASE = process.env.OLLAMA_BASE || 'http://127.0.0.1:11434';

const SUPPORTED_MODELS = [
  'qwen2.5:0.5b',
  'llama3.2:1b',
  'mistral:7b',
  'deepseek-r1:7b',
  'deepseek-r1:8b'
];

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check - is Ollama reachable?
app.get('/api/health', async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_BASE}/api/version`, { timeout: 3000 });
    if (response.ok) {
      const data = await response.json();
      return res.json({ status: 'ok', ollama: true, version: data.version || 'unknown' });
    }
    return res.json({ status: 'degraded', ollama: false, error: `Ollama returned ${response.status}` });
  } catch (err) {
    return res.json({ status: 'degraded', ollama: false, error: err.message });
  }
});

// List supported models with installed status
app.get('/api/models', async (req, res) => {
  let installedNames = [];

  try {
    const response = await fetch(`${OLLAMA_BASE}/api/tags`, { timeout: 5000 });
    if (response.ok) {
      const data = await response.json();
      installedNames = (data.models || []).map((m) => m.name);
    }
  } catch (_err) {
    // Ollama not reachable - all models will show as not installed
  }

  const models = SUPPORTED_MODELS.map((name) => ({
    name,
    installed: installedNames.some((installed) => installed === name || installed.startsWith(name))
  }));

  res.json({ models });
});

// Chat endpoint - streams Ollama response back to client via SSE
app.post('/api/chat', async (req, res) => {
  const { model, prompt, history = [] } = req.body;

  if (!model || !prompt) {
    return res.status(400).json({ error: 'model and prompt are required' });
  }

  if (!SUPPORTED_MODELS.includes(model)) {
    return res.status(400).json({ error: `Unsupported model: ${model}` });
  }

  // Build messages array for Ollama /api/chat
  const messages = [
    ...history,
    { role: 'user', content: prompt }
  ];

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let ollamaRes;
  try {
    ollamaRes = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        // snake_case keys are required by the Ollama API specification
        options: {
          num_predict: 512,
          temperature: 0.7
        }
      }),
      timeout: 120000
    });
  } catch (err) {
    sendEvent({ error: `Cannot reach Ollama: ${err.message}` });
    return res.end();
  }

  if (!ollamaRes.ok) {
    const text = await ollamaRes.text().catch(() => ollamaRes.statusText);
    sendEvent({ error: `Ollama error ${ollamaRes.status}: ${text}` });
    return res.end();
  }

  const body = ollamaRes.body;
  let buffer = '';

  body.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        const content = parsed.message?.content || '';
        if (content) {
          sendEvent({ token: content });
        }
        if (parsed.done) {
          sendEvent({ done: true });
        }
      } catch (_e) {
        // skip malformed JSON lines
      }
    }
  });

  body.on('end', () => {
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer);
        const content = parsed.message?.content || '';
        if (content) sendEvent({ token: content });
        if (parsed.done) sendEvent({ done: true });
      } catch (_e) {
        // ignore
      }
    }
    sendEvent({ done: true });
    res.end();
  });

  body.on('error', (err) => {
    sendEvent({ error: `Stream error: ${err.message}` });
    res.end();
  });

  // Handle client disconnect
  req.on('close', () => {
    if (!body.destroyed) {
      try { body.destroy(); } catch (_) { /* ignore */ }
    }
  });
});

app.listen(PORT, () => {
  console.log(`ML Platform running at http://localhost:${PORT}`);
  console.log(`Ollama endpoint: ${OLLAMA_BASE}`);
});
