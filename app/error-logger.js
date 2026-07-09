// Shim — re-exports the canonical shared/error-logger.js with this
// project's per-project options pre-configured via the install() call.

import { ClientErrorLogger as SharedLogger } from '../../shared/error-logger.js';

export const ClientErrorLogger = {
  install: () => SharedLogger.install({
    logDir: '/KamikazziStudio3D_Logs',
    getAnalyticsConfig: () => ({ enabled: false, endpoint: null }),
  }),
  report: SharedLogger.report,
  flush:  SharedLogger.flush,
};
