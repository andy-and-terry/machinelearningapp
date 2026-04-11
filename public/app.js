'use strict';

const MAX_CONVERSATION_HISTORY = 20;

const modelSelect = document.getElementById('model-select');
const modelList   = document.getElementById('model-list');
const ollamaStatus = document.getElementById('ollama-status');
const chatMessages = document.getElementById('chat-messages');
const chatForm    = document.getElementById('chat-form');
const promptInput = document.getElementById('prompt-input');
const sendBtn     = document.getElementById('send-btn');

// Conversation history for multi-turn context
let conversationHistory = [];
let isStreaming = false;

// ===== Utility =====
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendMessage(role, text, streaming = false) {
  // Remove welcome screen on first message
  const welcome = chatMessages.querySelector('.welcome');
  if (welcome) welcome.remove();

  const div = document.createElement('div');
  div.className = `message ${role}${streaming ? ' streaming' : ''}`;
  div.textContent = text;
  chatMessages.appendChild(div);
  scrollToBottom();
  return div;
}

function setOllamaStatus(ok, label) {
  ollamaStatus.textContent = label;
  ollamaStatus.className = `status-badge ${ok ? 'status-ok' : 'status-error'}`;
}

// ===== Load health + models =====
async function loadStatus() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    setOllamaStatus(data.ollama, data.ollama ? `Ollama ${data.version || 'ok'}` : 'Ollama offline');
  } catch (_) {
    setOllamaStatus(false, 'Server error');
  }
}

async function loadModels() {
  modelList.innerHTML = '<li class="model-item loading">Loading…</li>';
  modelSelect.innerHTML = '<option value="">Loading models…</option>';

  let data;
  try {
    const res = await fetch('/api/models');
    data = await res.json();
  } catch (_) {
    modelList.innerHTML = '<li class="model-item loading">Failed to load</li>';
    return;
  }

  const { models } = data;

  // Populate sidebar list
  modelList.innerHTML = '';
  models.forEach((m) => {
    const li = document.createElement('li');
    li.className = 'model-item';
    li.innerHTML = `
      <span class="model-name">${escapeHtml(m.name)}</span>
      <span class="model-dot ${m.installed ? 'dot-installed' : 'dot-missing'}" title="${m.installed ? 'Installed' : 'Not installed'}"></span>
    `;
    modelList.appendChild(li);
  });

  // Populate select dropdown
  modelSelect.innerHTML = '<option value="">— select a model —</option>';
  models.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.name;
    opt.textContent = `${m.name}${m.installed ? '' : ' (not installed)'}`;
    if (!m.installed) opt.style.color = '#f87171';
    modelSelect.appendChild(opt);
  });

  // Auto-select first installed model
  const firstInstalled = models.find((m) => m.installed);
  if (firstInstalled) {
    modelSelect.value = firstInstalled.name;
    updateSendButton();
  }
}

function updateSendButton() {
  const hasModel = modelSelect.value !== '';
  sendBtn.disabled = !hasModel || isStreaming;
}

modelSelect.addEventListener('change', () => {
  updateSendButton();
  // Reset conversation when switching models
  conversationHistory = [];
});

// ===== Chat / SSE streaming =====
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (isStreaming) return;

  const model  = modelSelect.value;
  const prompt = promptInput.value.trim();
  if (!model || !prompt) return;

  promptInput.value = '';
  promptInput.style.height = 'auto';
  isStreaming = true;
  updateSendButton();

  appendMessage('user', prompt);

  const assistantDiv = appendMessage('assistant', '', true);

  let fullResponse = '';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, history: conversationHistory })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      assistantDiv.textContent = `Error: ${err.error || response.statusText}`;
      assistantDiv.classList.remove('streaming');
      assistantDiv.classList.add('error');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let partial = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      partial += decoder.decode(value, { stream: true });
      const lines = partial.split('\n');
      partial = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        try {
          const evt = JSON.parse(raw);
          if (evt.error) {
            assistantDiv.textContent = `Error: ${evt.error}`;
            assistantDiv.classList.remove('streaming');
            assistantDiv.classList.add('error');
            return;
          }
          if (evt.token) {
            fullResponse += evt.token;
            assistantDiv.textContent = fullResponse;
            scrollToBottom();
          }
        } catch (_) {
          // ignore malformed events
        }
      }
    }
  } catch (err) {
    assistantDiv.textContent = `Network error: ${err.message}`;
    assistantDiv.classList.remove('streaming');
    assistantDiv.classList.add('error');
  } finally {
    assistantDiv.classList.remove('streaming');
    isStreaming = false;
    updateSendButton();
    promptInput.focus();

    if (fullResponse) {
      conversationHistory.push({ role: 'user', content: prompt });
      conversationHistory.push({ role: 'assistant', content: fullResponse });
      // Keep last MAX_CONVERSATION_HISTORY messages to avoid huge context
      if (conversationHistory.length > MAX_CONVERSATION_HISTORY) {
        conversationHistory = conversationHistory.slice(-MAX_CONVERSATION_HISTORY);
      }
    }
  }
});

// Enter to send (Shift+Enter = new line)
promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) chatForm.requestSubmit();
  }
});

// Auto-resize textarea
promptInput.addEventListener('input', () => {
  promptInput.style.height = 'auto';
  promptInput.style.height = Math.min(promptInput.scrollHeight, 160) + 'px';
});

// ===== Init =====
(async function init() {
  await Promise.all([loadStatus(), loadModels()]);
  // Refresh status every 30 seconds
  setInterval(async () => {
    await Promise.all([loadStatus(), loadModels()]);
  }, 30000);
})();
