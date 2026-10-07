/**
 * Local stub for Yandex Games SDK.
 * On the live iframe the platform serves the real /sdk.js — do not ship this file in the upload zip.
 */
window.YaGames = {
  init: function () {
    var storage = {
      getItem: function (key) {
        try {
          return localStorage.getItem(key);
        } catch (e) {
          return null;
        }
      },
      setItem: function (key, value) {
        try {
          localStorage.setItem(key, value);
        } catch (e) {
          /* ignore */
        }
      },
      removeItem: function (key) {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          /* ignore */
        }
      },
    };
    return Promise.resolve({
      features: {
        LoadingAPI: { ready: function () {} },
        GameplayAPI: { start: function () {}, stop: function () {} },
      },
      getStorage: function () {
        return Promise.resolve(storage);
      },
      adv: {
        showFullscreenAdv: function (opts) {
          var cb = opts && opts.callbacks;
          if (cb && cb.onClose) {
            cb.onClose(false);
          }
        },
      },
      on: function () {},
      off: function () {},
    });
  },
};
