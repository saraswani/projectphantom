/**
 * Universal Browser API Polyfill for Manifest V3 (Chrome, Firefox, Edge, Safari)
 */
(function() {
  'use strict';

  const browserApi = (typeof browser !== 'undefined') ? browser : (typeof chrome !== 'undefined' ? chrome : null);

  if (!browserApi) {
    console.warn('[PrivacyShield] No WebExtension API detected in current environment.');
    return;
  }

  // Universal proxy wrapper ensuring Promise-based API support
  const universalBrowser = {
    runtime: {
      id: browserApi.runtime?.id,
      getURL: (path) => browserApi.runtime?.getURL(path),
      sendMessage: (message) => {
        return new Promise((resolve) => {
          try {
            if (!browserApi.runtime?.id) {
              return resolve({ error: 'Extension context invalidated. Please refresh the page.' });
            }
            browserApi.runtime.sendMessage(message, (response) => {
              if (browserApi.runtime?.lastError) {
                // Return gracefully without throwing unhandled rejection on standard message drops
                resolve({ error: browserApi.runtime.lastError.message });
              } else {
                resolve(response);
              }
            });
          } catch (err) {
            resolve({ error: err.message || 'Extension context invalidated.' });
          }
        });
      },
      onMessage: browserApi.runtime?.onMessage,
      lastError: browserApi.runtime?.lastError
    },

    storage: {
      local: {
        get: (keys) => {
          return new Promise((resolve) => {
            browserApi.storage.local.get(keys, (result) => resolve(result || {}));
          });
        },
        set: (items) => {
          return new Promise((resolve) => {
            browserApi.storage.local.set(items, () => resolve());
          });
        },
        remove: (keys) => {
          return new Promise((resolve) => {
            browserApi.storage.local.remove(keys, () => resolve());
          });
        }
      }
    },

    tabs: {
      query: (queryInfo) => {
        return new Promise((resolve) => {
          browserApi.tabs?.query(queryInfo, (tabs) => resolve(tabs || []));
        });
      },
      captureVisibleTab: (windowId, options) => {
        return new Promise((resolve, reject) => {
          if (!browserApi.tabs?.captureVisibleTab) {
            reject(new Error('captureVisibleTab API unavailable'));
            return;
          }
          browserApi.tabs.captureVisibleTab(windowId, options, (dataUrl) => {
            if (browserApi.runtime.lastError) {
              reject(new Error(browserApi.runtime.lastError.message));
            } else {
              resolve(dataUrl);
            }
          });
        });
      },
      sendMessage: (tabId, message) => {
        return new Promise((resolve) => {
          browserApi.tabs?.sendMessage(tabId, message, (response) => {
            if (browserApi.runtime.lastError) {
              resolve({ error: browserApi.runtime.lastError.message });
            } else {
              resolve(response);
            }
          });
        });
      }
    },

    action: browserApi.action || browserApi.browserAction
  };

  if (typeof window !== 'undefined') {
    window.UniversalBrowser = universalBrowser;
    if (!window.browser) {
      window.browser = universalBrowser;
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = universalBrowser;
  }
})();
