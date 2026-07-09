/**
 * Debug helper — gates all console output behind window.DEBUG.
 *
 * Usage:
 *   import { dbg } from '../app/dbg.js';
 *   dbg.warn('Something happened', err);
 *   dbg.log('Info');
 *   dbg.error('Fatal');
 *   dbg.info('Notice');   // forward to console.info
 *   dbg.debug('Trace');   // forward to console.debug
 *
 * Set `window.DEBUG = true` in DevTools before modules load
 * to re-enable logging.
 */

const DBG = typeof window !== 'undefined' && window.DEBUG === true;

export const dbg = {
  warn:  (...args) => { if (DBG) console.warn(...args); },
  error: (...args) => { if (DBG) console.error(...args); },
  log:   (...args) => { if (DBG) console.log(...args); },
  info:  (...args) => { if (DBG) console.info(...args); },
  debug: (...args) => { if (DBG) console.debug(...args); },
};
