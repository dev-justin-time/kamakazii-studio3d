/**
 * _shared/renderControls.js
 *
 * Shared UI control renderer for all feature pages.
 * Previously duplicated ~100 lines in every single page.js.
 * Renders controls from a meta.controls array into a container element.
 *
 * Supports: button, toggle, slider, number, color, select, text, label, textarea
 */

import { dbg } from '../../app/dbg.js';
import { actionMap } from './actionMap.js';

/**
 * Render a list of controls into a container.
 * @param {HTMLElement} container
 * @param {Array} controlsList — array of control descriptors
 */
export function renderControls(container, controlsList) {
  const form = document.createElement('div');
  form.style.cssText = 'display:flex;flex-direction:column;gap:12px;padding:4px 0;';

  controlsList.forEach(ctrl => {
    if (ctrl.type === 'label') {
      const el = document.createElement('div');
      const isBullet = ctrl.label.startsWith('  •') || ctrl.label.startsWith('  ·');
      el.style.cssText = 'font-size:12px;color:' + (isBullet ? '#888;padding-left:8px' : '#aaa');
      el.textContent = ctrl.label;
      form.appendChild(el);
      return;
    }

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:3px;';

    switch (ctrl.type) {
      case 'button': {
        const btn = document.createElement('button');
        btn.textContent = ctrl.label;
        btn.style.cssText = 'width:100%;padding:8px;border:none;border-radius:4px;background:#4a9eff;color:#fff;cursor:pointer;font-size:13px;transition:background .15s;';
        btn.addEventListener('mouseenter', () => btn.style.background = '#3a8eef');
        btn.addEventListener('mouseleave', () => btn.style.background = '#4a9eff');
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const fn = actionMap[ctrl.onClick];
          if (fn) fn();
          else dbg.warn('No action:', ctrl.onClick);
        });
        row.appendChild(btn);
        break;
      }

      case 'toggle': {
        const lbl = document.createElement('label');
        lbl.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12px;color:#ccc;cursor:pointer;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = ctrl.default ?? false;
        cb.style.cssText = 'width:16px;height:16px;accent-color:#4a9eff;';
        cb.dataset.key = ctrl.key || '';
        const span = document.createElement('span');
        span.textContent = ctrl.label;
        lbl.appendChild(cb);
        lbl.appendChild(span);
        row.appendChild(lbl);
        break;
      }

      case 'slider': {
        const lbl = document.createElement('label');
        lbl.textContent = ctrl.label;
        lbl.style.cssText = 'font-size:12px;color:#aaa;';
        const inp = document.createElement('input');
        inp.type = 'range';
        inp.min = ctrl.min ?? 0;
        inp.max = ctrl.max ?? 1;
        inp.step = ctrl.step ?? 0.01;
        inp.value = ctrl.default ?? 0.5;
        inp.style.cssText = 'width:100%;accent-color:#4a9eff;';
        inp.dataset.key = ctrl.key || '';
        const val = document.createElement('span');
        val.textContent = inp.value;
        val.style.cssText = 'font-size:11px;color:#888;text-align:right;';
        inp.addEventListener('input', () => { val.textContent = inp.value; });
        row.appendChild(lbl);
        row.appendChild(inp);
        row.appendChild(val);
        break;
      }

      case 'number': {
        const lbl = document.createElement('label');
        lbl.textContent = ctrl.label;
        lbl.style.cssText = 'font-size:12px;color:#aaa;';
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.value = ctrl.default ?? 0;
        inp.min = ctrl.min ?? '';
        inp.max = ctrl.max ?? '';
        inp.step = ctrl.step ?? 1;
        inp.style.cssText = 'width:100%;padding:6px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;box-sizing:border-box;';
        inp.dataset.key = ctrl.key || '';
        row.appendChild(lbl);
        row.appendChild(inp);
        break;
      }

      case 'color': {
        const lbl = document.createElement('label');
        lbl.textContent = ctrl.label;
        lbl.style.cssText = 'font-size:12px;color:#aaa;';
        const inp = document.createElement('input');
        inp.type = 'color';
        inp.value = ctrl.default ?? '#ffffff';
        inp.style.cssText = 'width:100%;padding:4px;border-radius:4px;border:1px solid #444;background:#222;';
        inp.dataset.key = ctrl.key || '';
        row.appendChild(lbl);
        row.appendChild(inp);
        break;
      }

      case 'select': {
        const lbl = document.createElement('label');
        lbl.textContent = ctrl.label;
        lbl.style.cssText = 'font-size:12px;color:#aaa;';
        const sel = document.createElement('select');
        sel.style.cssText = 'width:100%;padding:6px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;';
        sel.dataset.key = ctrl.key || '';
        if (ctrl.placeholder) {
          const ph = document.createElement('option');
          ph.value = '';
          ph.textContent = ctrl.placeholder;
          ph.disabled = true;
          sel.appendChild(ph);
        }
        (ctrl.options || []).forEach(opt => {
          const o = document.createElement('option');
          o.value = opt.value;
          o.textContent = opt.label;
          sel.appendChild(o);
        });
        if (ctrl.default) sel.value = ctrl.default;
        row.appendChild(lbl);
        row.appendChild(sel);
        break;
      }

      case 'text': {
        const lbl = document.createElement('label');
        lbl.textContent = ctrl.label;
        lbl.style.cssText = 'font-size:12px;color:#aaa;';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = ctrl.default ?? '';
        inp.placeholder = ctrl.placeholder || ctrl.label;
        inp.style.cssText = 'width:100%;padding:6px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;box-sizing:border-box;';
        inp.dataset.key = ctrl.key || '';
        row.appendChild(lbl);
        row.appendChild(inp);
        break;
      }

      case 'textarea': {
        const lbl = document.createElement('label');
        lbl.textContent = ctrl.label;
        lbl.style.cssText = 'font-size:12px;color:#aaa;';
        const ta = document.createElement('textarea');
        ta.id = ctrl.id || '';
        ta.value = ctrl.default ?? '';
        ta.placeholder = ctrl.placeholder || ctrl.label;
        ta.rows = ctrl.rows ?? 6;
        ta.style.cssText = 'width:100%;padding:6px;border-radius:4px;border:1px solid #444;background:#222;color:#eee;box-sizing:border-box;font-family:monospace;font-size:12px;resize:vertical;';
        ta.dataset.key = ctrl.key || '';
        row.appendChild(lbl);
        row.appendChild(ta);
        break;
      }

      default:
        // Unknown control type — skip silently
        return;
    }

    form.appendChild(row);
  });

  container.appendChild(form);
}

/**
 * Read the current values of all controls in a container.
 * Returns an object keyed by each control's `key` property.
 */
export function getControlValues(container) {
  const values = {};
  container.querySelectorAll('[data-key]').forEach(el => {
    const key = el.dataset.key;
    if (!key) return;
    if (el.type === 'checkbox') values[key] = el.checked;
    else if (el.type === 'range' || el.type === 'number') values[key] = parseFloat(el.value);
    else values[key] = el.value;
  });
  return values;
}

export default renderControls;
