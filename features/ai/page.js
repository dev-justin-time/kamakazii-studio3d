/**
 * AI Tools — Custom prompts, response display, templates
 * Extended with Puter AI image generation (txt2img) and TTS (text-to-speech).
 */
import { dbg } from '../../app/dbg.js';
import { renderControls } from '../_shared/renderControls.js';
import { writeStatus } from '../../app/status-bar.js';

// ── Image preview state ────────────────────────────────────────────────────
let _lastGeneratedImageUrl = null;

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

const meta = {
  controls: [
    // ═════════════════════════════════════════════════════════════════════
    // SECTION 1: AI Chat (existing)
    // ═════════════════════════════════════════════════════════════════════
    { key: 'sec-chat', label: '── AI CHAT ──', type: 'label' },

    // ── Prompt Templates ──
    {
      key: 'ai-prompt',
      label: 'Quick Prompt',
      type: 'select',
      default: 'suggest',
      options: [
        { value: 'suggest', label: 'Suggest next modeling step' },
        { value: 'describe', label: 'Describe selected object' },
        { value: 'generate', label: 'Generate scene description' },
        { value: 'optimize', label: 'Optimization tips for scene' },
        { value: 'material', label: 'Material/texture advice' },
      ],
      description: 'Select a quick prompt template',
    },
    { key: 'sep0', label: '──────────', type: 'label' },

    // ── Custom Prompt Input ──
    { key: 'info-custom', type: 'label', label: 'Or write your own (textarea below):' },
    { key: 'sep1', label: '──────────', type: 'label' },

    // ── Run / Clear ──
    {
      key: 'run-ai',
      label: '🚀 Run AI Query',
      type: 'button',
      onClick: async () => {
        const app = _getApp();
        const sel = app?.selectedObject;

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
              ? `Suggest next steps for modeling "${sel.name}" in a 3D editor. It has ${sel.geometry?.index?.count / 3 || '?'} faces.`
              : 'Suggest how to start a 3D modeling project.',
            describe: sel
              ? `Describe the 3D object "${sel.name}" — its possible use cases and what could be improved.`
              : 'No object selected. Describe general 3D scene composition tips.',
            generate: sel
              ? `Generate a detailed description for a 3D model named "${sel.name}".`
              : 'Generate ideas for a 3D modeling scene.',
            optimize: `The scene has ${app?.objects.length || 0} objects. Suggest optimization strategies for real-time rendering.`,
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

    // ── System Prompt ──
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

    // ── Response Display ──
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
            // Add click-to-copy URL
            const imgUrl = url;
            _addMessage(`Image URL: ${imgUrl.length > 100 ? imgUrl.slice(0, 100) + '...' : imgUrl}`, 'ai');
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
    // SECTION 3: Puter AI TTS
    // ═════════════════════════════════════════════════════════════════════
    { key: 'sec-tts', label: '── TEXT-TO-SPEECH (Puter AI) ──', type: 'label' },
    { key: 'info-tts', type: 'label', label: 'Speak text aloud using Puter AI TTS (falls back to browser speech synthesis).' },

    {
      key: 'tts-text',
      label: 'Text to speak',
      type: 'label',
    },
    { key: 'sep7', label: '──────────', type: 'label' },

    {
      key: 'speak-tts',
      label: '🔊 Speak',
      type: 'button',
      onClick: async () => {
        const textarea = document.getElementById('aiTtsText');
        const text = textarea?.value?.trim();
        if (!text) {
          _addMessage('Enter text to speak.', 'error');
          return;
        }

        const voiceSelect = document.querySelector('#popupContent [data-key="tts-engine"] select');
        const useVoice = voiceSelect?.value === 'browser';

        writeStatus('🔊 Speaking...');

        try {
          const puterClient = await _getPuterClient();
          const ok = await puterClient.speak(text, { voice: useVoice });

          if (ok) {
            _addMessage(`🔊 Spoke: "${text.slice(0, 60)}..."`, 'ai');
          } else {
            _addMessage('TTS unavailable — no speech engine found.', 'error');
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
      onClick: () => {
        // Stop Puter TTS by clearing the context
        try {
          if (window.speechSynthesis) speechSynthesis.cancel();
        } catch (_) {}
        writeStatus('Ready');
      },
    },
    { key: 'sep8', label: '──────────', type: 'label' },

    // ── Common info ──
    {
      key: 'info-puter',
      type: 'label',
      label: 'Powered by Puter AI (txt2img + txt2speech). Sign in via the Cloud Sync button on the main menu to enable.',
    },
  ],
  onApply: () => {},
};

export { meta };

export function render(container, state) {
  renderControls(container, meta.controls);

  // ── Append custom textareas and preview elements ──
  // These are rendered outside the control system since they're multi-line inputs and visual outputs.

  // AI Chat custom input textarea
  const afterRunBtn = container.querySelector('[data-key="run-ai"]')?.closest('.ctrl-group');
  if (afterRunBtn) {
    const chatInputGroup = document.createElement('div');
    chatInputGroup.className = 'ctrl-group';
    chatInputGroup.style.cssText = 'margin-bottom:12px;';
    chatInputGroup.innerHTML = `
      <textarea id="aiCustomInput" placeholder="Write your own prompt here..." rows="3"
        style="width:100%;padding:8px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;font-size:12px;font-family:'JetBrains Mono',monospace;resize:vertical;"></textarea>
    `;
    afterRunBtn.parentNode.insertBefore(chatInputGroup, afterRunBtn.nextSibling);
  }

  // AI Response log
  const afterClearBtn = container.querySelector('[data-key="clear-ai"]')?.closest('.ctrl-group');
  if (afterClearBtn) {
    const logGroup = document.createElement('div');
    logGroup.className = 'ctrl-group';
    logGroup.innerHTML = `
      <div id="aiResponseLog" style="max-height:200px;overflow-y:auto;padding:4px;border:1px solid rgba(152,203,255,0.15);border-radius:4px;background:rgba(0,0,0,0.2);">
        <div style="font-size:11px;color:rgba(152,203,255,0.4);padding:8px;">Responses will appear here...</div>
      </div>
    `;
    afterClearBtn.parentNode.insertBefore(logGroup, afterClearBtn.nextSibling);
  }

  // Image generation prompt textarea
  const afterImgPrompt = container.querySelector('[data-key="image-prompt"]');
  if (afterImgPrompt) {
    const imgPromptGroup = document.createElement('div');
    imgPromptGroup.className = 'ctrl-group';
    imgPromptGroup.innerHTML = `
      <textarea id="aiImagePrompt" placeholder="e.g. cyberpunk city skyline, volumetric lighting, 4k" rows="2"
        style="width:100%;padding:8px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;font-size:12px;font-family:'JetBrains Mono',monospace;resize:vertical;"></textarea>
    `;
    afterImgPrompt.parentNode.insertBefore(imgPromptGroup, afterImgPrompt.nextSibling);
  }

  // Image size selector
  const afterGenBtn = container.querySelector('[data-key="gen-image"]')?.closest('.ctrl-group');
  if (afterGenBtn) {
    const sizeGroup = document.createElement('div');
    sizeGroup.className = 'ctrl-group';
    sizeGroup.dataset.key = 'image-size';
    sizeGroup.innerHTML = `
      <div class="ctrl-label">Image Size</div>
      <select aria-label="Image size"
        style="width:100%;padding:8px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;font-size:12px;">
        <option value="256x256">256×256 (fast)</option>
        <option value="512x512" selected>512×512 (standard)</option>
        <option value="1024x1024">1024×1024 (HD)</option>
      </select>
    `;
    afterGenBtn.parentNode.insertBefore(sizeGroup, afterGenBtn.nextSibling);
  }

  // Image preview + status
  const afterClearImg = container.querySelector('[data-key="clear-img"]')?.closest('.ctrl-group');
  if (afterClearImg) {
    const previewGroup = document.createElement('div');
    previewGroup.className = 'ctrl-group';
    previewGroup.innerHTML = `
      <div id="aiImagePreview"
        style="display:none;width:100%;aspect-ratio:1;border-radius:4px;border:1px solid rgba(152,203,255,0.2);background-size:cover;background-position:center;background-color:rgba(0,0,0,0.3);margin-top:8px;"
        role="img" aria-label="Generated image preview"></div>
      <div id="aiImageStatus" style="font-size:11px;color:rgba(152,203,255,0.6);text-align:center;min-height:16px;margin-top:4px;"></div>
    `;
    afterClearImg.parentNode.insertBefore(previewGroup, afterClearImg.nextSibling);
  }

  // TTS text textarea
  const afterTtsLabel = container.querySelector('[data-key="tts-text"]');
  if (afterTtsLabel) {
    const ttsInputGroup = document.createElement('div');
    ttsInputGroup.className = 'ctrl-group';
    ttsInputGroup.innerHTML = `
      <textarea id="aiTtsText" placeholder="Type something to speak..." rows="2"
        style="width:100%;padding:8px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;font-size:12px;font-family:'JetBrains Mono',monospace;resize:vertical;"></textarea>
    `;
    afterTtsLabel.parentNode.insertBefore(ttsInputGroup, afterTtsLabel.nextSibling);
  }

  // TTS engine selector
  const afterSpeakBtn = container.querySelector('[data-key="speak-tts"]')?.closest('.ctrl-group');
  if (afterSpeakBtn) {
    const ttsEngineGroup = document.createElement('div');
    ttsEngineGroup.className = 'ctrl-group';
    ttsEngineGroup.dataset.key = 'tts-engine';
    ttsEngineGroup.innerHTML = `
      <div class="ctrl-label">TTS Engine</div>
      <select aria-label="TTS engine"
        style="width:100%;padding:8px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;font-size:12px;">
        <option value="puter" selected>Puter AI (cloud)</option>
        <option value="browser">Browser Speech API</option>
      </select>
    `;
    afterSpeakBtn.parentNode.insertBefore(ttsEngineGroup, afterSpeakBtn.nextSibling);
  }
}
