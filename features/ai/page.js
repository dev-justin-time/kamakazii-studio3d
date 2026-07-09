/* global _refreshUI */

/**
 * AI Tools — Custom prompts, response display, templates
 * Extended with Puter AI image generation (txt2img) and TTS (text-to-speech).
 */
import { dbg } from '../../app/dbg.js';
import { renderControls } from '../_shared/renderControls.js';
import { writeStatus } from '../../app/status-bar.js';

// ── Image preview state ────────────────────────────────────────────────────
let _lastGeneratedImageUrl = null;

// ── Speech Synthesis State & Helpers ───────────────────────────────────────
let _browserVoices = [];
let _isSpeaking = false;

function _initSpeechSynthesis() {
  if (!window.speechSynthesis) return;
  
  const loadVoices = () => {
    _browserVoices = window.speechSynthesis.getVoices();
    _updateVoiceDropdown();
  };
  
  loadVoices();
  // Voices are often loaded asynchronously in some browsers
  if (_browserVoices.length === 0) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}
_initSpeechSynthesis();

function _updateVoiceDropdown() {
  const select = document.querySelector('#popupContent [data-key="tts-voice"] select');
  if (!select) return;
  
  let optionsHtml = '<option value="">Default Voice</option>';
  _browserVoices.forEach(voice => {
    optionsHtml += `<option value="${voice.name}">${voice.name} (${voice.lang})</option>`;
  });
  select.innerHTML = optionsHtml;
}

function _speakBrowser(text, voiceName = null) {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error('Speech synthesis not supported in this browser.'));
      return;
    }
    
    window.speechSynthesis.cancel();
    
    // FIX: Use window.SpeechSynthesisUtterance to satisfy ESLint no-undef
    const utterance = new window.SpeechSynthesisUtterance(text);
    
    if (voiceName) {
      const voice = _browserVoices.find(v => v.name === voiceName);
      if (voice) utterance.voice = voice;
    } else if (_browserVoices.length > 0) {
      // Fallback to an English voice if available
      const englishVoice = _browserVoices.find(v => v.lang.startsWith('en'));
      if (englishVoice) utterance.voice = englishVoice;
    }
    
    utterance.onstart = () => {
      _isSpeaking = true;
      if (typeof _refreshUI === 'function') _refreshUI();
    };
    utterance.onend = () => {
      _isSpeaking = false;
      if (typeof _refreshUI === 'function') _refreshUI();
      resolve(true);
    };
    utterance.onerror = (e) => {
      _isSpeaking = false;
      if (typeof _refreshUI === 'function') _refreshUI();
      reject(e);
    };
    
    window.speechSynthesis.speak(utterance);
  });
}

function _stopBrowserSpeech() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  _isSpeaking = false;
}

// ── Helper: get the shared puter-client ────────────────────────────────────
async function _getPuterClient() {
  return import('../../app/puter-client.js');
}

// ── Helper: append a message to the AI response log ────────────────────────
function _addMessage(text, type = 'ai') {
  const el = document.getElementById('aiResponseLog');
  if (!el) return;
  const row = document.createElement('div');
  row.style.cssText = `
    padding: 8px 10px;
    margin-bottom: 6px;
    border-radius: 4px;
    font-size: 12px;
    line-height: 1.5;
    font-family: 'JetBrains Mono', 'Space Mono', monospace;
    ${type === 'user'
      ? 'background:rgba(74,158,255,0.1);border-left:2px solid #4a9eff;color:#98cbff;'
      : type === 'error'
      ? 'background:rgba(255,100,100,0.1);border-left:2px solid #ff6464;color:#ffb4ab;'
      : 'background:rgba(0,221,221,0.06);border-left:2px solid #00dddd;color:#98cbff;'
    }
  `;
  if (type === 'user') {
    row.innerHTML = `<strong style="color:#4a9eff;">You:</strong> ${text.replace(/\n/g, '<br>')}`;
  } else if (type === 'error') {
    row.innerHTML = `<strong style="color:#ff6464;">Error:</strong> ${text.replace(/\n/g, '<br>')}`;
  } else {
    row.innerHTML = `<strong style="color:#00dddd;">AI:</strong> ${text.replace(/\n/g, '<br>')}`;
  }
  el.appendChild(row);
  el.scrollTop = el.scrollHeight;
}

function _clearResponses() {
  const el = document.getElementById('aiResponseLog');
  if (el) el.innerHTML = '<div style="font-size:11px;color:rgba(152,203,255,0.4);padding:8px;">Responses will appear here...</div>';
}

// ── Helper: get the app reference ──────────────────────────────────────────
function _getApp() {
  return window.ProModelerApp || (window.state && window.state.get && window.state.get('studio'));
}

/**
 * Builds the controls array dynamically based on the current application state.
 */
function buildControls(state = {}) {
  const app = _getApp();
  const sel = state.selectedObject || app?.selectedObject;
  const objName = sel?.name || 'No object selected';
  const objFaces = sel?.geometry?.index?.count / 3 || '?';
  const sceneObjects = app?.objects.length || 0;

  return [
    // ═════════════════════════════════════════════════════════════════════
    // SECTION 1: AI Chat
    // ═════════════════════════════════════════════════════════════════════
    { key: 'sec-chat', label: '── AI CHAT ──', type: 'label' },
    { key: 'ai-context', type: 'label', label: `Context: ${objName} (${objFaces} faces)` },

    {
      key: 'ai-prompt',
      label: 'Quick Prompt',
      type: 'select',
      default: 'suggest',
      options: [
        { value: 'suggest', label: `Suggest next step for "${objName}"` },
        { value: 'describe', label: `Describe "${objName}"` },
        { value: 'generate', label: `Generate scene description for "${objName}"` },
        { value: 'optimize', label: `Optimization tips (${sceneObjects} objects)` },
        { value: 'material', label: `Material advice for "${objName}"` },
      ],
      description: 'Select a quick prompt template',
    },
    { key: 'sep0', label: '──────────', type: 'label' },

    { key: 'info-custom', type: 'label', label: 'Or write your own (textarea below):' },
    { key: 'sep1', label: '──────────', type: 'label' },

    {
      key: 'run-ai',
      label: '🚀 Run AI Query',
      type: 'button',
      onClick: async () => {
        const textarea = document.getElementById('aiCustomInput');
        const customPrompt = textarea?.value?.trim() || '';

        const selectEl = document.querySelector('#popupContent [data-key="ai-prompt"] select');
        const template = selectEl?.value || 'suggest';

        let prompt;
        if (customPrompt) {
          prompt = customPrompt + (sel ? `\n\nContext: Selected object is "${sel.name}".` : '');
        } else {
          const templates = {
            suggest: sel
              ? `Suggest next steps for modeling "${sel.name}" in a 3D editor. It has ${objFaces} faces.`
              : 'Suggest how to start a 3D modeling project.',
            describe: sel
              ? `Describe the 3D object "${sel.name}" — its possible use cases and what could be improved.`
              : 'No object selected. Describe general 3D scene composition tips.',
            generate: sel
              ? `Generate a detailed description for a 3D model named "${sel.name}".`
              : 'Generate ideas for a 3D modeling scene.',
            optimize: `The scene has ${sceneObjects} objects. Suggest optimization strategies for real-time rendering.`,
            material: sel
              ? `Suggest materials and textures for "${sel.name}". What would make it look realistic/stylized?`
              : 'Suggest how to choose materials for different objects in a 3D scene.',
          };
          prompt = templates[template] || templates.suggest;
        }

        _addMessage(prompt, 'user');
        writeStatus('AI thinking...');

        try {
          const { aiBridge } = await import('../../app/ai-bridge.js');
          const result = await aiBridge.request({
            prompt,
            system: window.__aiSystemPrompt || 'You are a 3D modeling assistant. Give concise, actionable advice.',
            timeout: 15000,
          });
          if (result.content) {
            _addMessage(result.content, 'ai');
            writeStatus(`AI: ${result.content.slice(0, 80)}...`);
          } else {
            _addMessage('No response (bridge not ready)', 'error');
            writeStatus('AI: No response (bridge not ready)');
          }
        } catch (e) {
          _addMessage(`Error: ${e.message}`, 'error');
          writeStatus(`AI error: ${e.message}`);
        }
      },
    },
    {
      key: 'clear-ai',
      label: '🗑 Clear Responses',
      type: 'button',
      onClick: () => { _clearResponses(); },
    },
    { key: 'sep2', label: '──────────', type: 'label' },

    {
      key: 'system-prompt',
      label: 'System Prompt',
      type: 'select',
      default: 'modeling',
      options: [
        { value: 'modeling', label: '3D Modeling Assistant' },
        { value: 'creative', label: 'Creative/Artistic Advisor' },
        { value: 'technical', label: 'Technical/Performance Expert' },
        { value: 'custom', label: 'Custom... (write your own)' },
      ],
      description: 'AI persona/behavior preset',
      onChange: (val) => {
        const prompts = {
          modeling: 'You are a 3D modeling assistant. Give concise, actionable advice.',
          creative: 'You are a creative 3D art director. Suggest artistic improvements and stylized approaches.',
          technical: 'You are a technical artist specialized in real-time rendering. Focus on performance, optimization, and best practices.',
          custom: window.__aiCustomSystem || 'You are a helpful assistant.',
        };
        window.__aiSystemPrompt = prompts[val] || prompts.modeling;
      },
    },
    { key: 'info-custom-sys', type: 'label', label: 'Set system prompt to "Custom..." to type your own below.' },
    { key: 'sep3', label: '──────────', type: 'label' },

    {
      key: 'ai-responses',
      type: 'label',
      label: 'Responses will appear here...',
    },
    { key: 'sep4', label: '──────────', type: 'label' },

    // ═════════════════════════════════════════════════════════════════════
    // SECTION 2: Puter AI Image Generation
    // ═════════════════════════════════════════════════════════════════════
    { key: 'sec-image', label: '── IMAGE GENERATION (Puter AI) ──', type: 'label' },
    { key: 'info-img', type: 'label', label: 'Generate a texture, concept art, or reference image via Puter AI txt2img.' },

    {
      key: 'image-prompt',
      label: 'Prompt',
      type: 'label',
    },
    { key: 'sep5', label: '──────────', type: 'label' },

    {
      key: 'gen-image',
      label: '🎨 Generate Image',
      type: 'button',
      onClick: async () => {
        const textarea = document.getElementById('aiImagePrompt');
        const prompt = textarea?.value?.trim();
        if (!prompt) {
          _addMessage('Enter an image prompt first.', 'error');
          return;
        }

        const sizeSelect = document.querySelector('#popupContent [data-key="image-size"] select');
        const size = sizeSelect?.value || '512x512';

        const preview = document.getElementById('aiImagePreview');
        const status = document.getElementById('aiImageStatus');

        if (status) status.textContent = 'Generating...';
        if (preview) preview.style.display = 'none';
        writeStatus('🎨 Generating image via Puter AI...');

        try {
          const puterClient = await _getPuterClient();
          const url = await puterClient.generateImage(prompt, { size });

          if (url) {
            _lastGeneratedImageUrl = url;
            if (preview) {
              preview.style.backgroundImage = `url(${url})`;
              preview.style.display = 'block';
            }
            if (status) {
              status.textContent = '✅ Image generated! Right-click to save.';
              status.style.color = '#4ade80';
            }
            _addMessage(`🎨 Image generated (${size}): ${prompt.slice(0, 60)}...`, 'ai');
            _addMessage(`Image URL: ${url.length > 100 ? url.slice(0, 100) + '...' : url}`, 'ai');
          } else {
            if (status) {
              status.textContent = '⚠️ Failed to generate image. Check Puter sign-in.';
              status.style.color = '#ffb4ab';
            }
            _addMessage('Image generation failed — Puter AI may not be available.', 'error');
          }
        } catch (e) {
          dbg.warn('[AI Page] Image gen error:', e);
          if (status) {
            status.textContent = '⚠️ Error: ' + e.message;
            status.style.color = '#ffb4ab';
          }
          _addMessage(`Image generation error: ${e.message}`, 'error');
        }
        writeStatus('Ready');
      },
    },
    {
      key: 'clear-img',
      label: '🗑 Clear Image',
      type: 'button',
      onClick: () => {
        const preview = document.getElementById('aiImagePreview');
        const status = document.getElementById('aiImageStatus');
        if (preview) { preview.style.backgroundImage = ''; preview.style.display = 'none'; }
        if (status) { status.textContent = ''; }
        _lastGeneratedImageUrl = null;
      },
    },
    { key: 'sep6', label: '──────────', type: 'label' },

    // ═════════════════════════════════════════════════════════════════════
    // SECTION 3: Text-to-Speech (Puter AI + Browser Fallback)
    // ═════════════════════════════════════════════════════════════════════
    { key: 'sec-tts', label: '── TEXT-TO-SPEECH ──', type: 'label' },
    { key: 'info-tts', type: 'label', label: 'Speak text aloud using Puter AI or Browser Speech Synthesis.' },

    {
      key: 'tts-text',
      label: 'Text to speak',
      type: 'label',
    },
    { key: 'sep7', label: '──────────', type: 'label' },

    {
      key: 'speak-tts',
      label: _isSpeaking ? '🔊 Speaking...' : '🔊 Speak',
      type: 'button',
      disabled: _isSpeaking,
      onClick: async () => {
        const textarea = document.getElementById('aiTtsText');
        const text = textarea?.value?.trim();
        if (!text) {
          _addMessage('Enter text to speak.', 'error');
          return;
        }

        const engineSelect = document.querySelector('#popupContent [data-key="tts-engine"] select');
        const useBrowser = engineSelect?.value === 'browser';

        writeStatus('🔊 Speaking...');

        try {
          if (useBrowser) {
            const voiceSelect = document.querySelector('#popupContent [data-key="tts-voice"] select');
            const voiceName = voiceSelect?.value;
            await _speakBrowser(text, voiceName);
            _addMessage(`🔊 Spoke (Browser): "${text.slice(0, 60)}..."`, 'ai');
          } else {
            const puterClient = await _getPuterClient();
            const ok = await puterClient.speak(text);
            if (ok) {
              _addMessage(`🔊 Spoke (Puter): "${text.slice(0, 60)}..."`, 'ai');
            } else {
              _addMessage('Puter TTS unavailable. Try Browser engine.', 'error');
            }
          }
        } catch (e) {
          dbg.warn('[AI Page] TTS error:', e);
          _addMessage(`TTS error: ${e.message}`, 'error');
        }
        writeStatus('Ready');
      },
    },
    {
      key: 'stop-tts',
      label: '⏹ Stop',
      type: 'button',
      disabled: !_isSpeaking,
      onClick: () => {
        _stopBrowserSpeech();
        writeStatus('Ready');
        if (typeof _refreshUI === 'function') _refreshUI();
      },
    },
    { key: 'sep8', label: '──────────', type: 'label' },

    {
      key: 'info-puter',
      type: 'label',
      label: 'Powered by Puter AI (txt2img + txt2speech) & Browser Speech API. Sign in via Cloud Sync to enable Puter features.',
    },
  ];
}

const meta = {
  controls: buildControls(),
  onApply: () => {},
};

export { meta };

/**
 * Renders the AI Tools UI panel.
 * Uses a safeAppend helper to prevent duplicating custom DOM elements on re-renders.
 */
export function render(container, state) {
  const currentControls = buildControls(state);
  renderControls(container, currentControls);

  // ── Safely append custom textareas and preview elements ──
  const safeAppend = (anchorSelector, wrapperId, createFn) => {
    if (document.getElementById(wrapperId)) return;
    const anchor = container.querySelector(anchorSelector)?.closest('.ctrl-group') || container.querySelector(anchorSelector);
    if (anchor) {
      const el = createFn();
      el.id = wrapperId;
      anchor.parentNode.insertBefore(el, anchor.nextSibling);
    }
  };

  // AI Chat custom input textarea
  safeAppend('[data-key="run-ai"]', 'aiCustomInput-wrapper', () => {
    const div = document.createElement('div');
    div.className = 'ctrl-group';
    div.style.marginBottom = '12px';
    div.innerHTML = `
      <textarea id="aiCustomInput" placeholder="Write your own prompt here..." rows="3"
        style="width:100%;padding:8px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;font-size:12px;font-family:'JetBrains Mono',monospace;resize:vertical;"></textarea>
    `;
    return div;
  });

  // AI Response log
  safeAppend('[data-key="clear-ai"]', 'aiResponseLog-wrapper', () => {
    const div = document.createElement('div');
    div.className = 'ctrl-group';
    div.innerHTML = `
      <div id="aiResponseLog" style="max-height:200px;overflow-y:auto;padding:4px;border:1px solid rgba(152,203,255,0.15);border-radius:4px;background:rgba(0,0,0,0.2);">
        <div style="font-size:11px;color:rgba(152,203,255,0.4);padding:8px;">Responses will appear here...</div>
      </div>
    `;
    return div;
  });

  // Image generation prompt textarea
  safeAppend('[data-key="image-prompt"]', 'aiImagePrompt-wrapper', () => {
    const div = document.createElement('div');
    div.className = 'ctrl-group';
    div.innerHTML = `
      <textarea id="aiImagePrompt" placeholder="e.g. cyberpunk city skyline, volumetric lighting, 4k" rows="2"
        style="width:100%;padding:8px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;font-size:12px;font-family:'JetBrains Mono',monospace;resize:vertical;"></textarea>
    `;
    return div;
  });

  // Image size selector
  safeAppend('[data-key="gen-image"]', 'image-size-wrapper', () => {
    const div = document.createElement('div');
    div.className = 'ctrl-group';
    div.dataset.key = 'image-size';
    div.innerHTML = `
      <div class="ctrl-label">Image Size</div>
      <select aria-label="Image size"
        style="width:100%;padding:8px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;font-size:12px;">
        <option value="256x256">256×256 (fast)</option>
        <option value="512x512" selected>512×512 (standard)</option>
        <option value="1024x1024">1024×1024 (HD)</option>
      </select>
    `;
    return div;
  });

  // Image preview + status
  safeAppend('[data-key="clear-img"]', 'aiImagePreview-wrapper', () => {
    const div = document.createElement('div');
    div.className = 'ctrl-group';
    div.innerHTML = `
      <div id="aiImagePreview"
        style="display:none;width:100%;aspect-ratio:1;border-radius:4px;border:1px solid rgba(152,203,255,0.2);background-size:cover;background-position:center;background-color:rgba(0,0,0,0.3);margin-top:8px;"
        role="img" aria-label="Generated image preview"></div>
      <div id="aiImageStatus" style="font-size:11px;color:rgba(152,203,255,0.6);text-align:center;min-height:16px;margin-top:4px;"></div>
    `;
    return div;
  });

  // TTS text textarea
  safeAppend('[data-key="tts-text"]', 'aiTtsText-wrapper', () => {
    const div = document.createElement('div');
    div.className = 'ctrl-group';
    div.innerHTML = `
      <textarea id="aiTtsText" placeholder="Type something to speak..." rows="2"
        style="width:100%;padding:8px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;font-size:12px;font-family:'JetBrains Mono',monospace;resize:vertical;"></textarea>
    `;
    return div;
  });

  // TTS engine selector
  safeAppend('[data-key="speak-tts"]', 'tts-engine-wrapper', () => {
    const div = document.createElement('div');
    div.className = 'ctrl-group';
    div.dataset.key = 'tts-engine';
    div.innerHTML = `
      <div class="ctrl-label">TTS Engine</div>
      <select aria-label="TTS engine"
        style="width:100%;padding:8px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;font-size:12px;">
        <option value="puter" selected>Puter AI (cloud)</option>
        <option value="browser">Browser Speech API</option>
      </select>
    `;
    return div;
  });

  // TTS voice selector (for browser engine)
  safeAppend('[data-key="tts-engine"]', 'tts-voice-wrapper', () => {
    const div = document.createElement('div');
    div.className = 'ctrl-group';
    div.dataset.key = 'tts-voice';
    
    let optionsHtml = '<option value="">Default Voice</option>';
    _browserVoices.forEach(voice => {
      optionsHtml += `<option value="${voice.name}">${voice.name} (${voice.lang})</option>`;
    });
    
    div.innerHTML = `
      <div class="ctrl-label">Browser Voice</div>
      <select aria-label="Browser voice"
        style="width:100%;padding:8px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;font-size:12px;">
        ${optionsHtml}
      </select>
    `;
    return div;
  });
}