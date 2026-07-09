/* global _getApp, _refreshUI */

/**
 * Chat — AI Chat interface with history, export, and quick prompts
 */
import { renderControls } from '../_shared/renderControls.js';

// ── State ──────────────────────────────────────────────────────────────────
const chatState = {
  history: [],
  isLoading: false
};

// ── Deduped console warn for AI errors (60s window) ────────────────────────
let _lastChatWarnAt = 0;
function _dedupedWarn(label, ...args) {
  if (Date.now() - _lastChatWarnAt > 60000) {
    _lastChatWarnAt = Date.now();
    console.warn(label, ...args);
  }
}

// ── Helper Functions ───────────────────────────────────────────────────────

/**
 * Sends a prompt to the AI and updates the chat history.
 */
async function _askAI(prompt) {
  if (!prompt || chatState.isLoading) return;
  
  chatState.history.push({ role: 'user', content: prompt });
  chatState.isLoading = true;
  _refreshUI();

  try {
    // Attempt to use the ai-bridge if available
    const { aiBridge } = await import('../../app/ai-bridge.js');
    const result = await aiBridge.request({
      prompt,
      system: 'You are a helpful 3D modeling assistant.',
      timeout: 15000,
    });
    
    if (result?.content) {
      chatState.history.push({ role: 'ai', content: result.content });
    } else {
      chatState.history.push({ role: 'ai', content: 'No response received.' });
    }
  } catch (e) {
    _dedupedWarn('[Chat] AI error:', e);
    chatState.history.push({ role: 'ai', content: `Error: ${e.message}` });
  } finally {
    chatState.isLoading = false;
    _refreshUI();
  }
}

/**
 * Clears the chat history.
 */
function _clearChat() {
  chatState.history = [];
  _refreshUI();
}

/**
 * Exports the chat history to a text file.
 */
function _exportChat() {
  if (chatState.history.length === 0) return;
  
  const text = chatState.history.map(msg => {
    const sender = msg.role === 'user' ? 'You' : 'AI';
    return `[${sender}]: ${msg.content}`;
  }).join('\n\n');
  
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chat-history-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── UI Builder ─────────────────────────────────────────────────────────────

/**
 * Builds the controls array dynamically based on the current application state.
 */
function buildControls(state = {}) {
  const app = _getApp();
  const selected = state.selectedObject || app?.selectedObject;
  const objName = selected?.name || 'the object';
  
  const msgCount = chatState.history.length;
  const isDisabled = chatState.isLoading;

  return [
    { 
      key: 'chat-info', 
      type: 'label', 
      label: `Chat History (${msgCount} messages)` 
    },
    { key: 'sep0', type: 'label', label: '──────────' },
    
    { 
      key: 'quick-1', 
      type: 'button', 
      label: '💡 Suggest next step', 
      disabled: isDisabled,
      onClick: () => _askAI(`Suggest the next modeling step for ${objName}.`) 
    },
    { 
      key: 'quick-2', 
      type: 'button', 
      label: '🎨 Material advice', 
      disabled: isDisabled,
      onClick: () => _askAI(`What materials would look good on ${objName}?`) 
    },
    { 
      key: 'quick-3', 
      type: 'button', 
      label: '⚡ Optimize scene', 
      disabled: isDisabled,
      onClick: () => _askAI('How can I optimize this scene for better performance?') 
    },
    { 
      key: 'quick-4', 
      type: 'button', 
      label: '📝 Describe object', 
      disabled: isDisabled,
      onClick: () => _askAI(`Describe ${objName} and its potential use cases.`) 
    },
    
    { key: 'sep1', type: 'label', label: '──────────' },
    
    { 
      key: 'clear-chat', 
      type: 'button', 
      label: '🗑 Clear Chat', 
      disabled: msgCount === 0,
      onClick: () => _clearChat() 
    },
    { 
      key: 'export-chat', 
      type: 'button', 
      label: '💾 Export Chat', 
      disabled: msgCount === 0,
      onClick: () => _exportChat() 
    }
  ];
}

// ── Exports ────────────────────────────────────────────────────────────────

const meta = {
  controls: buildControls(),
  onApply: () => {},
};

export { meta };

/**
 * Renders the Chat UI panel.
 * Uses the state parameter to personalize prompts and manages custom DOM elements safely.
 */
export function render(container, state) {
    // ── Use shared state (see app/state.js). Tags the container with the
  //    active feature name so other systems can route events back to us,
  //    and publishes it back so the next feature knows what was here.
  const featureName = state?.get?.('currentFeature') ?? "chat";
  container.dataset.feature = featureName;
  if (state && typeof state.set === 'function') {
    state.set('currentFeature', "chat");
  }
const currentControls = buildControls(state);
  renderControls(container, currentControls);

  // Render the chat log safely
  const logId = 'chat-log-container';
  if (!document.getElementById(logId)) {
    const logContainer = document.createElement('div');
    logContainer.id = logId;
    logContainer.style.cssText = `
      margin-top: 12px;
      max-height: 300px;
      overflow-y: auto;
      padding: 8px;
      border: 1px solid rgba(152,203,255,0.15);
      border-radius: 4px;
      background: rgba(0,0,0,0.2);
      font-size: 12px;
      line-height: 1.5;
    `;
    container.appendChild(logContainer);
  }

  const logContainer = document.getElementById(logId);
  logContainer.innerHTML = '';

  if (chatState.history.length === 0) {
    logContainer.innerHTML = '<div style="color:rgba(152,203,255,0.4);text-align:center;padding:20px;">No messages yet. Ask a question above!</div>';
  } else {
    chatState.history.forEach(msg => {
      const row = document.createElement('div');
      row.style.cssText = `
        padding: 8px 10px;
        margin-bottom: 6px;
        border-radius: 4px;
        ${msg.role === 'user' 
          ? 'background:rgba(74,158,255,0.1);border-left:2px solid #4a9eff;color:#98cbff;' 
          : 'background:rgba(0,221,221,0.06);border-left:2px solid #00dddd;color:#e0f7fa;'}
      `;
      const sender = msg.role === 'user' ? '<strong style="color:#4a9eff;">You:</strong>' : '<strong style="color:#00dddd;">AI:</strong>';
      row.innerHTML = `${sender} ${msg.content.replace(/\n/g, '<br>')}`;
      logContainer.appendChild(row);
    });
    
    // Auto-scroll to bottom
    logContainer.scrollTop = logContainer.scrollHeight;
  }
  
  // Add custom input if not exists
  const inputId = 'chat-custom-input';
  if (!document.getElementById(inputId)) {
    const inputGroup = document.createElement('div');
    inputGroup.id = inputId;
    inputGroup.style.cssText = 'margin-top: 12px; display: flex; gap: 8px;';
    inputGroup.innerHTML = `
      <input type="text" id="chat-input-field" placeholder="Type a custom prompt..." 
        style="flex:1;padding:8px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;font-size:12px;" />
      <button id="chat-send-btn" style="padding:8px 16px;border-radius:4px;border:none;background:#4a9eff;color:white;cursor:pointer;font-weight:bold;">Send</button>
    `;
    container.appendChild(inputGroup);
    
    // Wire up the send button
    document.getElementById('chat-send-btn').addEventListener('click', () => {
      const input = document.getElementById('chat-input-field');
      const val = input.value.trim();
      if (val) {
        _askAI(val);
        input.value = '';
      }
    });
    
    // Allow Enter key to send
    document.getElementById('chat-input-field').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('chat-send-btn').click();
      }
    });
  }
}