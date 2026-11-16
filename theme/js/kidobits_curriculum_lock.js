/**
 * Kidobits Curriculum Lock & Unlock System
 * Manages bottom-to-top sequential lesson progression per subject
 */
(function() {
  const STORAGE_KEY = 'kidobits_curriculum_progression';
  const BYPASS_KEY = 'kidobits_curriculum_bypass';

  // Default state: Lesson 1 of every subject is unlocked by default
  const defaultState = {
    phonics: {
      unlockedMax: 1, // 1-based index (Lesson 1 is open)
      completed: []   // Array of lesson IDs e.g. ["L1.01"]
    },
    math: {
      unlockedMax: 1, // Lesson 1 is open
      completed: []   // e.g. ["1", "2"]
    },
    chinese: {
      unlockedMax: 1, // Lesson 1 is open
      completed: []   // e.g. ["E1", "E2"]
    }
  };

  let state = defaultState;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = {
          phonics: Object.assign({}, defaultState.phonics, parsed.phonics || {}),
          math: Object.assign({}, defaultState.math, parsed.math || {}),
          chinese: Object.assign({}, defaultState.chinese, parsed.chinese || {})
        };
      }
    } catch(e) {
      state = defaultState;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      window.dispatchEvent(new CustomEvent('kidobits_progression_changed', { detail: state }));
    } catch(e) {}
  }

  loadState();

  // Teacher / Parent bypass mode
  function isBypass() {
    return localStorage.getItem(BYPASS_KEY) === 'true';
  }

  function setBypass(val) {
    if (val) {
      localStorage.setItem(BYPASS_KEY, 'true');
    } else {
      localStorage.removeItem(BYPASS_KEY);
    }
    saveState();
  }

  // Check if a lesson at (1-based index) is unlocked
  function isUnlocked(subject, index) {
    if (isBypass()) return true;
    if (index <= 1) return true; // Lesson 1 is always unlocked
    const sub = state[subject] || { unlockedMax: 1 };
    return index <= sub.unlockedMax;
  }

  // Check if a specific lesson ID is marked completed
  function isCompleted(subject, lessonId) {
    const sub = state[subject] || { completed: [] };
    return (sub.completed || []).includes(String(lessonId));
  }

  // Mark lesson completed and unlock the next lesson
  function unlockTo(subject, targetIndex) {
    if (!state[subject]) {
      state[subject] = { unlockedMax: 1, completed: [] };
    }
    const idx = parseInt(targetIndex, 10) || 1;
    if (idx > state[subject].unlockedMax) {
      state[subject].unlockedMax = idx;
      saveState();
    }
  }

  function markCompleted(subject, lessonId, nextIndex) {
    if (!state[subject]) {
      state[subject] = { unlockedMax: 1, completed: [] };
    }
    const strId = String(lessonId);
    if (!state[subject].completed.includes(strId)) {
      state[subject].completed.push(strId);
    }
    if (nextIndex && nextIndex > state[subject].unlockedMax) {
      state[subject].unlockedMax = nextIndex;
    }
    saveState();
  }

  // UI Toast & Shake animation when tapping a locked card
  function shakeAndNotify(cardEl, lessonTitle) {
    if (!cardEl) return;
    
    // Play gentle error chime
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(260, ctx.currentTime);
      osc.frequency.setValueAtTime(220, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch(e) {}

    // Shake animation
    cardEl.style.transition = 'transform 0.08s ease-in-out';
    cardEl.style.transform = 'translateX(-6px)';
    setTimeout(() => { cardEl.style.transform = 'translateX(6px)'; }, 80);
    setTimeout(() => { cardEl.style.transform = 'translateX(-4px)'; }, 160);
    setTimeout(() => { cardEl.style.transform = 'translateX(4px)'; }, 240);
    setTimeout(() => { cardEl.style.transform = 'translateX(0)'; }, 320);

    // Toast
    let toast = document.getElementById('kidobitsLockToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'kidobitsLockToast';
      toast.style.cssText = `
        position: fixed;
        bottom: 84px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: rgba(22, 19, 32, 0.94);
        color: white;
        padding: 10px 16px;
        border-radius: 9999px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.35);
        font-size: 12px;
        font-weight: 800;
        z-index: 999999;
        display: flex;
        align-items: center;
        gap: 8px;
        opacity: 0;
        transition: all 0.28s cubic-bezier(0.34, 1.45, 0.64, 1);
        pointer-events: none;
        white-space: nowrap;
        border: 1px solid rgba(255, 255, 255, 0.18);
        font-family: 'Prompt', sans-serif;
      `;
      document.body.appendChild(toast);
    }

    toast.innerHTML = `<span>🔒</span> <span>ต้องผ่านบทเรียนก่อนหน้าก่อนนะคนเก่ง!</span>`;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';

    if (window._lockToastTimeout) clearTimeout(window._lockToastTimeout);
    window._lockToastTimeout = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(20px)';
    }, 2400);
  }

  function reset(subject) {
    if (subject && state[subject]) {
      state[subject] = { unlockedMax: 1, completed: [] };
    } else {
      state = {
        phonics: { unlockedMax: 1, completed: [] },
        math: { unlockedMax: 1, completed: [] },
        chinese: { unlockedMax: 1, completed: [] }
      };
    }
    // Also clear lesson stars if resetting math
    if (!subject || subject === 'math') {
      for (let i = 1; i <= 12; i++) {
        const id = 'L' + (i < 10 ? '0' : '') + i;
        localStorage.removeItem('kidobits_lesson_stars_' + id);
      }
      localStorage.removeItem('kidobits_math_stars');
    }
    localStorage.removeItem(BYPASS_KEY);
    saveState();
  }

  // Global API
  window.KidobitsLock = {
    unlockTo: unlockTo,
    isUnlocked: isUnlocked,
    isCompleted: isCompleted,
    markCompleted: markCompleted,
    getUnlockedMax: (subject) => (state[subject] ? state[subject].unlockedMax : 1),
    isBypass: isBypass,
    setBypass: setBypass,
    reset: reset,
    shakeAndNotify: shakeAndNotify
  };
})();
