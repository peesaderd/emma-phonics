// Universal Curriculum Lock & Progression Engine
// Supports Hierarchical Subjects, Levels, Placement Tests, and Age-based Progression
(function() {
  'use strict';

  const STORAGE_KEY = 'kidobits_curriculum_progression';
  const BYPASS_KEY = 'kidobits_curriculum_bypass';
  const STUDENT_KEY = 'kidobits_student_profile';

  const defaultState = {
    version: 2,
    phonics: {
      unlockedLevel: 1,
      levels: {
        1: { unlockedMax: 1, completed: [] },
        2: { unlockedMax: 1, completed: [] },
        3: { unlockedMax: 1, completed: [] },
        4: { unlockedMax: 1, completed: [] },
        5: { unlockedMax: 1, completed: [] },
        6: { unlockedMax: 1, completed: [] }
      }
    },
    math: {
      unlockedLevel: 1,
      levels: {
        1: { unlockedMax: 1, completed: [] }
      }
    },
    chinese: {
      unlockedLevel: 1,
      levels: {
        1: { unlockedMax: 1, completed: [] }
      }
    }
  };

  let state = JSON.parse(JSON.stringify(defaultState));

  function parseLessonMeta(lessonId) {
    if (!lessonId) return { level: 1, num: 1 };
    const str = String(lessonId).trim();
    // Match L1.05 or L2.12 or L1 or E1
    const m = str.match(/^[A-Za-z]?([0-9]+)(?:\.([0-9]+))?/);
    if (m) {
      const lv = parseInt(m[1], 10) || 1;
      const num = m[2] ? parseInt(m[2], 10) : 1;
      return { level: lv, num: num };
    }
    return { level: 1, num: parseInt(str, 10) || 1 };
  }

  function migrateLegacyState(parsed) {
    if (!parsed) return defaultState;
    if (parsed.version === 2) return parsed;

    const migrated = JSON.parse(JSON.stringify(defaultState));
    ['phonics', 'math', 'chinese'].forEach(sub => {
      if (parsed[sub]) {
        const oldMax = parseInt(parsed[sub].unlockedMax, 10) || 1;
        const oldComp = Array.isArray(parsed[sub].completed) ? parsed[sub].completed : [];
        
        // Put legacy progress strictly into Level 1
        migrated[sub].levels[1] = {
          unlockedMax: Math.max(1, oldMax),
          completed: oldComp.filter(id => {
            const meta = parseLessonMeta(id);
            return meta.level === 1;
          })
        };
      }
    });
    return migrated;
  }

  function applyAgeGradeDefaults() {
    try {
      const raw = localStorage.getItem(STUDENT_KEY);
      if (!raw) return;
      const student = JSON.parse(raw);
      let age = parseInt(student.age, 10);
      if (!age && student.birthdate) {
        const bd = new Date(student.birthdate);
        if (!isNaN(bd.getTime())) {
          age = Math.floor((Date.now() - bd.getTime()) / (365.25 * 24 * 3600 * 1000));
        }
      }

      if (age) {
        // Age mapping:
        // >= 7 years (P.1) -> unlocks up to Level 2
        // >= 8 years (P.2) -> unlocks up to Level 3
        // >= 9 years (P.3+) -> unlocks up to Level 4
        let targetLv = 1;
        if (age >= 9) targetLv = 4;
        else if (age >= 8) targetLv = 3;
        else if (age >= 7) targetLv = 2;

        if (state.phonics && targetLv > state.phonics.unlockedLevel) {
          state.phonics.unlockedLevel = targetLv;
          // Ensure levels up to targetLv are initialized
          for (let l = 1; l <= targetLv; l++) {
            if (!state.phonics.levels[l]) {
              state.phonics.levels[l] = { unlockedMax: 1, completed: [] };
            }
          }
        }
      }
    } catch(e) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = migrateLegacyState(parsed);
      } else {
        state = JSON.parse(JSON.stringify(defaultState));
      }
    } catch(e) {
      state = JSON.parse(JSON.stringify(defaultState));
    }
    applyAgeGradeDefaults();
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      window.dispatchEvent(new CustomEvent('kidobits_progression_changed', { detail: state }));
    } catch(e) {}
  }

  loadState();

  function isBypass() {
    return localStorage.getItem(BYPASS_KEY) === 'true';
  }

  function setBypass(val) {
    if (val) localStorage.setItem(BYPASS_KEY, 'true');
    else localStorage.removeItem(BYPASS_KEY);
    saveState();
  }

  // Level Check
  function isLevelUnlocked(subject, level) {
    if (isBypass()) return true;
    const lv = parseInt(level, 10) || 1;
    if (lv <= 1) return true;
    const sub = state[subject] || defaultState[subject];
    return lv <= (sub ? sub.unlockedLevel : 1);
  }

  function unlockLevel(subject, level) {
    const lv = parseInt(level, 10) || 1;
    if (!state[subject]) state[subject] = { unlockedLevel: 1, levels: {} };
    if (lv > state[subject].unlockedLevel) {
      state[subject].unlockedLevel = lv;
    }
    for (let l = 1; l <= lv; l++) {
      if (!state[subject].levels[l]) {
        state[subject].levels[l] = { unlockedMax: 1, completed: [] };
      }
    }
    saveState();
  }

  // Lesson Check (Supports both (subject, level, index) and (subject, lessonIdOrIndex))
  function isUnlocked(subject, arg1, arg2) {
    if (isBypass()) return true;

    let level = 1;
    let index = 1;

    if (arg2 !== undefined) {
      level = parseInt(arg1, 10) || 1;
      index = parseInt(arg2, 10) || 1;
    } else if (typeof arg1 === 'string') {
      const meta = parseLessonMeta(arg1);
      level = meta.level;
      index = meta.num;
    } else {
      index = parseInt(arg1, 10) || 1;
      level = 1;
    }

    // Check if the level itself is accessible
    if (!isLevelUnlocked(subject, level)) return false;

    // Lesson 1 of any accessible level is always open
    if (index <= 1) return true;

    const sub = state[subject] || defaultState[subject];
    const lvState = (sub && sub.levels && sub.levels[level]) ? sub.levels[level] : { unlockedMax: 1 };
    return index <= lvState.unlockedMax;
  }

  function isCompleted(subject, arg1, arg2) {
    let level = 1;
    let lessonId = '';

    if (arg2 !== undefined) {
      level = parseInt(arg1, 10) || 1;
      lessonId = String(arg2);
    } else {
      lessonId = String(arg1);
      const meta = parseLessonMeta(lessonId);
      level = meta.level;
    }

    const sub = state[subject] || defaultState[subject];
    const lvState = (sub && sub.levels && sub.levels[level]) ? sub.levels[level] : { completed: [] };
    return (lvState.completed || []).includes(lessonId);
  }

  function unlockTo(subject, arg1, arg2) {
    let level = 1;
    let targetIndex = 1;

    if (arg2 !== undefined) {
      level = parseInt(arg1, 10) || 1;
      targetIndex = parseInt(arg2, 10) || 1;
    } else {
      targetIndex = parseInt(arg1, 10) || 1;
    }

    if (!state[subject]) state[subject] = { unlockedLevel: 1, levels: {} };
    if (!state[subject].levels[level]) state[subject].levels[level] = { unlockedMax: 1, completed: [] };

    if (targetIndex > state[subject].levels[level].unlockedMax) {
      state[subject].levels[level].unlockedMax = targetIndex;
      saveState();
    }
  }

  function markCompleted(subject, arg1, arg2, arg3) {
    let level = 1;
    let lessonId = '';
    let nextIndex = 0;

    if (arg3 !== undefined) {
      level = parseInt(arg1, 10) || 1;
      lessonId = String(arg2);
      nextIndex = parseInt(arg3, 10) || 0;
    } else {
      lessonId = String(arg1);
      const meta = parseLessonMeta(lessonId);
      level = meta.level;
      nextIndex = parseInt(arg2, 10) || (meta.num + 1);
    }

    if (!state[subject]) state[subject] = { unlockedLevel: 1, levels: {} };
    if (!state[subject].levels[level]) state[subject].levels[level] = { unlockedMax: 1, completed: [] };

    const lvState = state[subject].levels[level];
    if (!lvState.completed.includes(lessonId)) {
      lvState.completed.push(lessonId);
    }

    if (nextIndex && nextIndex > lvState.unlockedMax) {
      lvState.unlockedMax = nextIndex;
    }

    // If completed the final lesson of this level, unlock next level
    if (nextIndex > 12) {
      const nextLv = level + 1;
      if (nextLv <= 6 && nextLv > state[subject].unlockedLevel) {
        state[subject].unlockedLevel = nextLv;
        if (!state[subject].levels[nextLv]) {
          state[subject].levels[nextLv] = { unlockedMax: 1, completed: [] };
        }
      }
    }

    saveState();
  }

  // UI Toast & Shake animation when tapping a locked card
  function shakeAndNotify(cardEl, lessonTitle, isLevelLock) {
    if (!cardEl) return;
    
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

    cardEl.style.transition = 'transform 0.08s ease-in-out';
    cardEl.style.transform = 'translateX(-6px)';
    setTimeout(() => { cardEl.style.transform = 'translateX(6px)'; }, 80);
    setTimeout(() => { cardEl.style.transform = 'translateX(-4px)'; }, 160);
    setTimeout(() => { cardEl.style.transform = 'translateX(4px)'; }, 240);
    setTimeout(() => { cardEl.style.transform = 'translateX(0)'; }, 320);

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
        padding: 10px 18px;
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

    if (isLevelLock) {
      toast.innerHTML = `<span>🔒</span> <span>ต้องผ่านระดับก่อนหน้าก่อนนะคนเก่ง! หรือปรับได้ที่ Parent Zone</span>`;
    } else {
      toast.innerHTML = `<span>🔒</span> <span>ต้องผ่านบทเรียนก่อนหน้าก่อนนะคนเก่ง!</span>`;
    }
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';

    if (window._lockToastTimeout) clearTimeout(window._lockToastTimeout);
    window._lockToastTimeout = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(20px)';
    }, 2500);
  }

  // Universal Placement Evaluation Engine
  function evaluatePlacement(subject, criteria) {
    if (!criteria) return { recommendedLevel: 1 };
    let recLevel = 1;

    // Check age
    const age = parseInt(criteria.age, 10);
    if (age >= 9) recLevel = 4;
    else if (age >= 8) recLevel = 3;
    else if (age >= 7) recLevel = 2;

    // Check test score if provided (0-100)
    if (criteria.score !== undefined) {
      const score = parseFloat(criteria.score);
      if (score >= 90) recLevel = Math.max(recLevel, 4);
      else if (score >= 75) recLevel = Math.max(recLevel, 3);
      else if (score >= 50) recLevel = Math.max(recLevel, 2);
    }

    unlockLevel(subject, recLevel);
    return {
      subject: subject,
      recommendedLevel: recLevel,
      unlockedLevel: state[subject] ? state[subject].unlockedLevel : recLevel
    };
  }

  function reset(subject) {
    if (subject && state[subject]) {
      state[subject] = JSON.parse(JSON.stringify(defaultState[subject]));
    } else {
      state = JSON.parse(JSON.stringify(defaultState));
    }
    localStorage.removeItem(BYPASS_KEY);
    saveState();
  }

  // Global Universal API
  window.KidobitsLock = {
    isUnlocked: isUnlocked,
    isLevelUnlocked: isLevelUnlocked,
    unlockLevel: unlockLevel,
    isCompleted: isCompleted,
    unlockTo: unlockTo,
    markCompleted: markCompleted,
    getUnlockedMax: (subject, lv) => {
      const l = parseInt(lv, 10) || 1;
      const sub = state[subject];
      return (sub && sub.levels && sub.levels[l]) ? sub.levels[l].unlockedMax : 1;
    },
    getUnlockedLevel: (subject) => (state[subject] ? state[subject].unlockedLevel : 1),
    evaluatePlacement: evaluatePlacement,
    isBypass: isBypass,
    setBypass: setBypass,
    reset: reset,
    shakeAndNotify: shakeAndNotify,
    getState: () => JSON.parse(JSON.stringify(state))
  };
})();
