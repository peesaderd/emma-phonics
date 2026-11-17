// Kidobits Device Orientation Lock Engine
// Strategy: CSS Transform rotation back to portrait when phone rotates to landscape.
// Works in ALL browsers including Chrome PWA, Safari iOS, regular browser tabs.
// Only targets phones (max-height <= 520px in landscape = phone, not tablet/desktop).
(function() {
  'use strict';

  var CSS_ID = 'kidobits-portrait-lock-css';

  function injectCSS() {
    if (document.getElementById(CSS_ID)) return;
    var style = document.createElement('style');
    style.id = CSS_ID;
    // When phone is in landscape (height <= 520px), rotate entire body back to portrait
    style.textContent = [
      '@media screen and (orientation: landscape) and (max-height: 520px) {',
      '  html, body {',
      '    overflow: hidden !important;',
      '  }',
      '  body {',
      '    transform: rotate(-90deg) !important;',
      '    transform-origin: left top !important;',
      '    width: 100vh !important;',
      '    height: 100vw !important;',
      '    position: fixed !important;',
      '    top: 100% !important;',
      '    left: 0 !important;',
      '    overflow-y: auto !important;',
      '    overflow-x: hidden !important;',
      '  }',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  // Also try JS API lock (works in PWA standalone mode on Android)
  function tryOrientationLock() {
    try {
      if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
        window.screen.orientation.lock('portrait').catch(function() {});
      }
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      injectCSS();
      tryOrientationLock();
    });
  } else {
    injectCSS();
    tryOrientationLock();
  }
})();
