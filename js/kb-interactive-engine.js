/*!
 * Kidobits Pure HTML/JS Interactive Phonics Lesson Engine
 * Native Vanilla JS + Tailwind CSS — Pixel-perfect match to original Kidobits theme
 * Updates:
 *   - Step 2: Auto-check enabled (removed manual check button).
 *   - Step 2 & 1: Tap answer slots to remove/edit letter dynamically.
 *   - Step 4: True-to-original Kidobits Mic system with real-time Web Audio Analyser + smooth sound meter.
 *   - Seamless child flow with positive audio reinforcement & Auto-Next across all 5 steps.
 */
(function (global) {
  'use strict';

  var API_BASE = '/kidobits/api';

  /* ------------------------------------------------------------- 1. AudioEngine */
  var _sharedAudioCtx = null;
  function ensureAudioCtx() {
    if (!_sharedAudioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        try { _sharedAudioCtx = new Ctx(); } catch (e) {}
      }
    }
    if (_sharedAudioCtx && _sharedAudioCtx.state === 'suspended') {
      _sharedAudioCtx.resume().catch(function () {});
    }
    return _sharedAudioCtx;
  }
  document.addEventListener('pointerdown', ensureAudioCtx, { passive: true });
  document.addEventListener('click', ensureAudioCtx, { passive: true });

  var AudioEngine = {
    currentAudio: null,
    queueToken: 0,
    unlocked: false,

    unlock: function () {
      if (this.unlocked) return;
      this.unlocked = true;
      try {
        var silent = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
        silent.play().catch(function () {});
      } catch (e) {}
      ensureAudioCtx();
    },

    stop: function () {
      this.queueToken++;
      if (this.currentAudio) {
        try {
          this.currentAudio.pause();
          this.currentAudio.src = '';
          this.currentAudio.onended = null;
          this.currentAudio.onerror = null;
        } catch (e) {}
        this.currentAudio = null;
      }
    },

    playSingle: function (url, onDone) {
      this.stop();
      if (!url) { if (onDone) onDone(); return; }
      var myToken = ++this.queueToken;
      var a = new Audio(url);
      this.currentAudio = a;

      var finished = false;
      function done() {
        if (finished || myToken !== AudioEngine.queueToken) return;
        finished = true;
        try {
          a.pause();
          a.onended = null;
          a.onerror = null;
        } catch (e) {}
        if (AudioEngine.currentAudio === a) AudioEngine.currentAudio = null;
        if (onDone) onDone();
      }

      a.onended = done;
      a.onerror = done;
      var p = a.play();
      if (p && p.catch) {
        p.catch(function () { done(); });
      }
      setTimeout(done, 12000); // 12s safety watchdog
    },

    playQueue: function (urls, onEachStep, onDone) {
      this.stop();
      var self = this;
      var myToken = ++this.queueToken;
      urls = (urls || []).filter(Boolean);
      var idx = 0;

      if (typeof onEachStep !== 'function' && typeof onDone === 'undefined') {
        onDone = onEachStep;
        onEachStep = null;
      }

      function next() {
        if (myToken !== self.queueToken) return;
        if (idx >= urls.length) {
          self.currentAudio = null;
          if (onDone) onDone();
          return;
        }
        var curIdx = idx;
        var u = urls[idx++];
        var a = new Audio(u);
        self.currentAudio = a;

        if (onEachStep) {
          try { onEachStep(curIdx, u); } catch (e) {}
        }

        var advanced = false;
        function step() {
          if (advanced || myToken !== self.queueToken) return;
          advanced = true;
          try {
            a.pause();
            a.onended = null;
            a.onerror = null;
          } catch (e) {}
          next();
        }

        a.onended = step;
        a.onerror = step;
        var p = a.play();
        if (p && p.catch) {
          p.catch(function () { step(); });
        }
        setTimeout(step, 14000); // 14s safety watchdog per track
      }
      next();
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('click', function () { AudioEngine.unlock(); }, { once: true });
    window.addEventListener('touchstart', function () { AudioEngine.unlock(); }, { once: true });
  }

  /* ------------------------------------------------------------- 1.5 Sentence & Speech Scoring Helpers */
  var SENT_FUNC_WORDS = new Set(['the','a','an','is','in','on','at','by','to','it','and','was','were','of','with','his','her','he','she','they','we','you','said','can','us','be','for','that','this']);

  function sentWordsOf(txt) {
    return String(txt || '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);
  }

  function scoreSentence(target, heard) {
    var tw = sentWordsOf(target).filter(function (w) { return !SENT_FUNC_WORDS.has(w); });
    var hw = sentWordsOf(heard);
    if (!tw.length) return { ratio: 0, hit: [], miss: [] };
    var pool = hw.slice();
    var hit = [], miss = [];
    for (var i = 0; i < tw.length; i++) {
      var w = tw[i];
      var idx = pool.indexOf(w);
      if (idx === -1) {
        idx = pool.findIndex(function (x) {
          return x.length > 3 && w.length > 3 && x[0] === w[0] && x.slice(0, 3) === w.slice(0, 3);
        });
      }
      if (idx > -1) {
        hit.push(w);
        pool.splice(idx, 1);
      } else {
        miss.push(w);
      }
    }
    return { ratio: hit.length / Math.max(1, tw.length), hit: hit, miss: miss };
  }

  var SPEECH_SYNONYMS = {
    'at': ['at', 'add', 'act', 'hat', 'cat', 'ad', 'et', 'a', 'app'],
    'sat': ['sat', 'set', 'sad', 'sit', 'say', 'sand'],
    'mat': ['mat', 'mad', 'met', 'matt', 'mud', 'map'],
    'pat': ['pat', 'pad', 'pet', 'pot', 'pan'],
    'tap': ['tap', 'tab', 'top', 'tip', 'cap'],
    'ship': ['ship', 'sheep', 'chip', 'sharp'],
    'shop': ['shop', 'chop', 'shot'],
    'fish': ['fish', 'fist', 'dish'],
    'dish': ['dish', 'fish'],
    'wish': ['wish', 'witch']
  };

  /* ------------------------------------------------------------- 2. Engine State */
  var Engine = {
    sessionId: null,
    lessonId: 'L1.01',
    levelId: 1,
    lessonData: null,
    item: null,
    expect: null,
    progress: null,
    step: 1,
    wordIdx: 0,
    words: ['at', 'sat', 'mat', 'pat', 'tap'],
    typed: [], // [{ id: btnId, ch: 'a' }]
    scrambledPool: [], // [{ id: 0, ch: 'a' }]
    containerEl: null,
    completedSteps: [],
    stats: { streak: 7, gems: 1, coins: 240 },
    isAdvancing: false,
    isListening: false,
    lastStartAt: 0,

    start: function (opts) {
      opts = opts || {};
      var now = Date.now();
      if (now - this.lastStartAt < 800) {
        return;
      }
      this.lastStartAt = now;

      var target = opts.container || '#kb-lesson-viewport';
      this.containerEl = typeof target === 'string' ? document.querySelector(target) : target;
      if (!this.containerEl) {
        console.warn('KidobitsEngine: Container not found', target);
        return;
      }

      var lid = opts.lessonId || (opts.lesson && (opts.lesson.id || ('L' + (opts.level ? opts.level.id : 1) + '.' + (opts.lesson.n < 10 ? '0' + opts.lesson.n : opts.lesson.n)))) || 'L1.01';
      this.lessonId = lid;
      this.levelId = opts.level ? opts.level.id : 1;
      this.lessonData = opts.lesson || { n: 1, title: 'Listening for first sounds', th: 'ฟังและระบุเสียงต้นคำ' };
      this.completedSteps = [];
      this.isAdvancing = false;
      this.isListening = false;
      this.step = 1;
      this.wordIdx = 0;

      if (opts.stats) {
        this.stats = {
          streak: opts.stats.streak || 7,
          gems: opts.stats.gems || 1,
          coins: opts.stats.coins || 240
        };
      }

      this.openSession(this.lessonId);
    },

    openSession: function (lid) {
      var self = this;
      this.renderLoading();
      AudioEngine.stop();
      this.cleanupMic();
      this.isAdvancing = false;
      this.completedSteps = [];
      this.typed = [];

      fetch(API_BASE + '/session/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lesson: lid })
      })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.ok) {
          self.initFallbackSession(lid);
          return;
        }
        self.sessionId = res.session;
        self.item = res.item;
        self.expect = res.expect;
        self.progress = res.progress;
        self.step = res.item ? res.item.step : 1;
        self.wordIdx = res.item ? res.item.index : 0;
        self.setupWordData();
        self.render();

        var queue = [];
        if (res.script && res.script.length) {
          queue = res.script.map(function (s) { return s.say; }).filter(Boolean);
        }
        if (queue.length) {
          AudioEngine.playQueue(queue);
        }
      })
      .catch(function () {
        self.initFallbackSession(lid);
      });
    },

    initFallbackSession: function (lid) {
      this.sessionId = 'local-' + Date.now();
      var words = ['at', 'sat', 'mat', 'pat', 'tap'];
      if (lid.startsWith('L2')) words = ['ship', 'shop', 'fish', 'dish', 'wish'];
      this.words = words;
      this.step = 1;
      this.wordIdx = 0;
      var w = words[0];
      this.item = { step: 1, index: 0, word: w, total: words.length, letters: w.split('') };
      this.setupWordData();
      this.render();
      this.playStepPrompt();
    },

    setupWordData: function () {
      var curWord = (this.item && this.item.word) ? this.item.word : (this.words[this.wordIdx] || 'at');
      var letters = (this.item && this.item.letters) ? this.item.letters : curWord.split('');
      var pool = letters.map(function (ch, idx) {
        return { id: idx, ch: ch };
      });
      if (this.step === 2) {
        pool.sort(function () { return 0.5 - Math.random(); });
      }
      this.scrambledPool = pool;
      this.typed = [];
    },

    /* ------------------------------------------------------------- 3. UI Renderers */
    renderLoading: function () {
      if (!this.containerEl) return;
      this.containerEl.innerHTML = [
        '<div class="flex flex-col items-center justify-center p-12 text-center min-h-[400px]">',
        '  <div class="w-12 h-12 border-4 border-[#8B7CFF] border-t-transparent rounded-full animate-spin"></div>',
        '  <p class="font-extrabold text-[#7B7488] mt-4">กำลังโหลดบทเรียน ' + this.lessonId + '...</p>',
        '</div>'
      ].join('');
    },

    render: function () {
      if (!this.containerEl) return;
      var self = this;

      if (this.step >= 6) {
        this.renderSummary();
        return;
      }

      var stepNames = ['ผสมเสียง', 'เรียงตัวอักษร', 'ฟังเลือก', 'อ่านเอง', 'อ่านประโยค'];
      var totalSteps = stepNames.length;
      var curStep = this.step;

      var html = [];
      html.push('<div class="px-5 pt-5 pb-24 max-w-[480px] mx-auto select-none font-sans">');

      // Top bar
      html.push('  <div class="flex items-center gap-2 flex-wrap">');
      html.push('    <button id="kb-btn-back" class="bg-white border border-[#F1EAF7] px-3 py-2 rounded-full text-xs font-extrabold hover:bg-slate-50 transition cursor-pointer">← บทเรียน</button>');
      html.push('    <span class="bg-white border border-[#F1EAF7] rounded-full px-2.5 py-1.5 text-xs font-extrabold">🔥 ' + this.stats.streak + '</span>');
      html.push('    <span class="bg-white border border-[#F1EAF7] rounded-full px-2.5 py-1.5 text-xs font-extrabold">💎 ' + this.stats.gems + '/26</span>');
      html.push('    <span class="bg-white border border-[#F1EAF7] rounded-full px-2.5 py-1.5 text-xs font-extrabold">🪙 ' + this.stats.coins + '</span>');
      html.push('    <span class="bg-[#E8FFF0] border border-[#7ED9A8] rounded-full px-2.5 py-1.5 text-xs font-extrabold flex items-center gap-1">');
      html.push('      <span class="w-2 h-2 bg-[#1B9A62] rounded-full animate-pulse"></span>ครูเอ็มม่าสด');
      html.push('    </span>');
      html.push('  </div>');

      // Banner Card
      var title = this.lessonData ? (this.lessonData.title || 'Phonics Lesson') : 'Listening for first sounds';
      var th = this.lessonData ? (this.lessonData.th || this.lessonData.goal_th || 'ฟังและระบุเสียงต้นคำ') : '';
      var lessonNo = this.lessonData ? (this.lessonData.n || this.lessonData.lesson_number || 1) : 1;
      html.push('  <div class="mt-3 bg-gradient-to-br from-[#8B7CFF] to-[#B69CFF] rounded-[24px] p-4 text-white shadow-sm">');
      html.push('    <div class="flex gap-2 items-center">');
      html.push('      <span class="text-2xl">🐱</span>');
      html.push('      <b class="text-base leading-tight">ระดับ ' + this.levelId + ' • บทที่ ' + lessonNo + ' - ' + title + '</b>');
      html.push('    </div>');
      html.push('    <p class="text-xs text-white/90 font-bold mt-1">' + th + '</p>');
      html.push('    <div class="flex items-center justify-between mt-2 pt-0.5">');
      html.push('      <div class="flex gap-1.5">');
      html.push('        <span class="bg-white/25 px-2 py-1 rounded-full text-[11px] font-extrabold">' + this.lessonId + '</span>');
      html.push('        <span class="bg-white/25 px-2 py-1 rounded-full text-[11px] font-extrabold">🎧 มีเสียงแท้</span>');
      html.push('      </div>');
      html.push('      <button id="kb-btn-refresh-lesson" class="bg-white/25 hover:bg-white/40 active:scale-90 text-white px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer shadow-sm border border-white/30" title="รีเฟรชเริ่มบทเรียนใหม่">');
      html.push('        <span class="kb-spin-icon inline-block text-xs">🔄</span>');
      html.push('        <span>รีเฟรช</span>');
      html.push('      </button>');
      html.push('    </div>');
      html.push('  </div>');

      // Step Tabs (1..5)
      html.push('  <div class="flex gap-1.5 mt-3 overflow-x-auto no-scrollbar pb-1">');
      for (var s = 1; s <= totalSteps; s++) {
        var isCur = s === curStep;
        var isDone = this.completedSteps.indexOf(s) !== -1;
        var cls = isCur ? 'bg-[#8B7CFF] text-white shadow-sm' : isDone ? 'bg-[#7ED9A8] text-white' : 'bg-white border border-[#F1EAF7] text-[#7B7488]';
        html.push('    <button data-nav-step="' + s + '" class="shrink-0 px-3 py-2 rounded-full text-xs font-extrabold cursor-pointer ' + cls + '">');
        html.push(s + '. ' + stepNames[s - 1] + (isDone ? ' ✓' : ''));
        html.push('    </button>');
      }
      html.push('  </div>');

      // Progress bar
      var totalItems = (this.item && this.item.total) ? this.item.total : 5;
      var curIdx = (this.item && typeof this.item.index === 'number') ? this.item.index : this.wordIdx;
      var pct = Math.round(((curStep - 1) / totalSteps) * 100 + ((curIdx + 1) / totalItems) * (100 / totalSteps));
      pct = Math.max(10, Math.min(100, pct));
      html.push('  <div class="h-2.5 bg-[#F1EAF7] rounded-full overflow-hidden mt-2">');
      html.push('    <div class="h-full bg-[#8B7CFF] rounded-full transition-all duration-300" style="width:' + pct + '%"></div>');
      html.push('  </div>');

      // Sound banner
      var activeWord = (curStep === 5) ? 'The cat sat on the mat.' : ((this.item && this.item.word) ? this.item.word : 'at');
      var bannerLabel = (curStep === 5) ? 'ฟังประโยคนี้: ' : 'ฟังคำนี้: ';
      html.push('  <div id="kb-banner" class="mt-2 text-center font-bold text-sm bg-[#E8FFF0] text-[#1B9A62] rounded-xl px-3 py-2 flex items-center justify-center gap-1 cursor-pointer transition">');
      html.push('    <span>' + bannerLabel + '<b class="underline">' + activeWord + '</b></span> <span class="text-base">🔊</span>');
      html.push('  </div>');

      // Step Body Card
      html.push('  <div id="kb-card" class="bg-white border-2 border-[#F1EAF7] rounded-[24px] p-5 mt-3 text-center shadow-sm relative transition-all">');
      html.push(this.renderStepBody());
      html.push('  </div>');

      // Footer Navigation
      html.push('  <div class="flex items-center justify-between gap-3 mt-4">');
      html.push('    <button id="kb-btn-prev" class="bg-white border border-[#F1EAF7] px-5 py-3 rounded-full text-sm font-extrabold text-[#7B7488] hover:bg-slate-50 transition cursor-pointer">← ก่อนหน้า</button>');
      html.push('    <button id="kb-btn-next" class="flex-1 bg-[#8B7CFF] text-white py-3 rounded-full text-sm font-extrabold shadow hover:opacity-95 transition cursor-pointer">ต่อไป →</button>');
      html.push('  </div>');

      html.push('</div>');

      this.containerEl.innerHTML = html.join('');
      this.bindEvents();
    },

    renderStepBody: function () {
      var item = this.item || { step: this.step, index: this.wordIdx, word: this.words[this.wordIdx] || 'at', total: 5 };
      var step = this.step;
      var curIdx = typeof item.index === 'number' ? item.index : this.wordIdx;
      var total = item.total || 5;
      var word = item.word || this.words[curIdx] || 'at';
      var html = [];

      if (step === 1) {
        // Step 1: Blending
        var letters = item.letters || word.split('');
        html.push('  <p class="text-xs font-extrabold text-[#8B7CFF]">ขั้นที่ 1 • ผสมเสียง (แตะตามลำดับ ประกอบเป็นคำ)</p>');
        html.push('  <div id="kb-slots" class="flex justify-center gap-3 my-3">');
        for (var i = 0; i < letters.length; i++) {
          html.push('    <span data-slot-idx="' + i + '" class="kb-slot-box w-12 h-14 border-b-4 border-[#8B7CFF] bg-[#F0EFFF] rounded-xl font-extrabold text-2xl flex items-center justify-center text-black cursor-pointer hover:border-red-400 transition" title="แตะเพื่อลบตัวอักษรนี้">_</span>');
        }
        html.push('  </div>');
        html.push('  <p class="text-sm font-bold text-[#7B7488] mb-3">คำที่ ' + (curIdx + 1) + ' จาก ' + total + ' • ครูสะกดนำก่อน แล้วแตะตาม</p>');
        html.push('  <div class="flex justify-center gap-3 my-3">');
        this.scrambledPool.forEach(function (btnObj) {
          html.push('    <button data-btn-idx="' + btnObj.id + '" data-letter="' + btnObj.ch + '" class="kb-letter-btn w-14 h-14 rounded-2xl bg-[#FFF0F5] border border-[#FFD6E8] font-extrabold text-2xl text-[#1B1B1F] shadow-sm hover:scale-105 active:scale-95 transition cursor-pointer">' + btnObj.ch + '</button>');
        });
        html.push('  </div>');
        html.push('  <div class="flex justify-center gap-2 mt-2">');
        html.push('    <button id="kb-replay-word" class="bg-[#FFC93C] text-black px-5 py-2.5 rounded-full font-extrabold text-sm shadow-sm hover:opacity-95 transition cursor-pointer">🔊 ฟังคำนี้</button>');
        html.push('    <button id="kb-clear-btn" class="bg-slate-100 text-[#7B7488] px-4 py-2.5 rounded-full font-bold text-xs hover:bg-slate-200 transition cursor-pointer">ล้าง ↺</button>');
        html.push('  </div>');
      } else if (step === 2) {
        // Step 2: Spelling / Segmenting (AUTO-CHECK + TAP SLOT TO REMOVE)
        var letters = item.letters || word.split('');
        html.push('  <p class="text-xs font-extrabold text-[#8B7CFF]">ขั้นที่ 2 • เรียงตัวอักษร</p>');
        html.push('  <h3 class="text-2xl font-extrabold mt-1">เรียงให้เป็นคำ: <span class="text-[#8B7CFF]">' + letters.join(' - ') + '</span></h3>');
        html.push('  <p class="text-sm font-bold text-[#7B7488] mt-1 mb-3">คำที่ ' + (curIdx + 1) + ' จาก ' + total + ' • แตะตัวอักษร (แตะช่องเพื่อแก้ตัวที่ใส่แล้ว)</p>');
        html.push('  <div id="kb-slots" class="flex justify-center gap-3 my-3">');
        for (var i = 0; i < letters.length; i++) {
          html.push('    <span data-slot-idx="' + i + '" class="kb-slot-box w-12 h-14 rounded-2xl border-2 border-dashed border-[#C9C0D6] bg-slate-50 font-extrabold text-2xl flex items-center justify-center text-black cursor-pointer hover:border-red-400 hover:bg-red-50 transition" title="แตะเพื่อลบตัวอักษรนี้">_</span>');
        }
        html.push('  </div>');
        html.push('  <div class="flex justify-center gap-3 my-3">');
        this.scrambledPool.forEach(function (btnObj) {
          html.push('    <button data-btn-idx="' + btnObj.id + '" data-letter="' + btnObj.ch + '" class="kb-letter-btn w-13 h-13 rounded-2xl bg-[#FFF0F5] border border-[#FFD6E8] font-extrabold text-2xl text-[#1B1B1F] shadow-sm hover:scale-105 active:scale-95 transition cursor-pointer">' + btnObj.ch + '</button>');
        });
        html.push('  </div>');
        html.push('  <div class="flex justify-center gap-2 mt-2">');
        html.push('    <button id="kb-replay-word" class="bg-[#FFC93C] text-black px-4 py-2 rounded-full font-extrabold text-xs shadow-sm hover:opacity-95 transition cursor-pointer">🔊 ฟังคำนี้</button>');
        html.push('    <button id="kb-clear-btn" class="bg-slate-100 text-[#7B7488] px-4 py-2 rounded-full font-bold text-xs hover:bg-slate-200 transition cursor-pointer">ล้างทั้งหมด ↺</button>');
        html.push('  </div>');
      } else if (step === 3) {
        // Step 3: Listen & Choice
        html.push('  <p class="text-xs font-extrabold text-[#8B7CFF]">ขั้นที่ 3 • ฟังเลือกคำ</p>');
        html.push('  <p class="text-sm font-bold text-[#7B7488] mt-1">คำที่ ' + (curIdx + 1) + ' จาก ' + total + ' • กดปุ่มลำโพงเพื่อฟัง แล้วแตะเลือกคำที่ได้ยิน</p>');
        html.push('  <button id="kb-replay-word" class="my-3 bg-[#8B7CFF] text-white px-6 py-3 rounded-full font-extrabold text-sm shadow hover:opacity-95 transition cursor-pointer">🔊 ฟังอีกครั้ง</button>');
        html.push('  <div class="grid grid-cols-3 gap-2 mt-2">');
        var defaultChoices = [
          { w: word, e: '🎯' },
          { w: (curIdx === 0 ? 'sat' : 'at'), e: '🛋️' },
          { w: (curIdx === 2 ? 'pat' : 'mat'), e: '🧶' }
        ].sort(function () { return 0.5 - Math.random(); });
        var opts = (item.options && item.options.length) ? item.options : defaultChoices;
        opts.forEach(function (opt) {
          var w = typeof opt === 'string' ? opt : (opt.w || opt.word);
          var emoji = (opt && opt.e) ? opt.e : '✨';
          html.push('    <button data-choice="' + w + '" class="kb-choice-btn rounded-[20px] p-3 border-2 border-[#F1EAF7] bg-white hover:border-[#8B7CFF] hover:bg-[#FAF7FD] active:scale-95 transition cursor-pointer flex flex-col items-center">');
          html.push('      <span class="text-3xl">' + emoji + '</span>');
          html.push('      <b class="text-base font-extrabold mt-1 text-[#1B1B1F]">' + w + '</b>');
          html.push('    </button>');
        });
        html.push('  </div>');
      } else if (step === 4) {
        // Step 4: Microphone / Speech (Original Kidobits Design + Real-time Audio Meter)
        html.push('  <p class="text-xs font-extrabold text-[#8B7CFF]">ขั้นที่ 4 • อ่านเอง</p>');
        html.push('  <div class="bg-[#F0EFFF] rounded-[24px] p-5 mt-2 border border-[#E5DEF0] text-center">');
        html.push('    <p class="font-extrabold text-[#1B1B1F]">ครูเอ็มม่าสอนนำ: ฟังเสียงคำนี้ แล้วลองพูดตามจ้า 🐱</p>');
        html.push('    <p class="text-base text-[#7B7488] font-bold mt-2">ลองพูด: <b class="text-3xl text-black ml-1 tracking-wider">' + word + '</b></p>');
        html.push('    <button id="kb-mic-btn" class="my-4 w-20 h-20 rounded-full bg-[#FF5B6A] text-white flex items-center justify-center mx-auto text-3xl shadow-lg active:scale-95 transition cursor-pointer">🎙️</button>');
        html.push('    <p class="text-xs font-bold text-[#7B7488] mt-1">ระดับเสียงไมค์: <b id="kb-mic-pct" class="text-black">0%</b></p>');
        html.push('    <div class="h-3 bg-white rounded-full overflow-hidden mt-1.5 max-w-[220px] mx-auto border border-[#E5DEF0]">');
        html.push('      <div id="kb-mic-bar" class="h-full bg-[#FF5B6A] rounded-full transition-all duration-150" style="width: 0%"></div>');
        html.push('    </div>');
        html.push('    <p id="kb-mic-status" class="text-xs font-extrabold text-[#7B7488] mt-2 transition">แตะไมค์เพื่อลองพูด</p>');
        html.push('  </div>');
        html.push('  <div class="mt-3 flex justify-center gap-3">');
        html.push('    <button id="kb-replay-word" class="bg-[#FFC93C] text-black px-4 py-2 rounded-full font-extrabold text-xs shadow-sm hover:opacity-95 transition cursor-pointer">🔊 ฟังเสียงคำนี้</button>');
        html.push('    <button id="kb-skip-step4" class="text-xs font-extrabold text-[#9A8FA8] hover:text-[#FF5B6A] underline transition cursor-pointer">ข้ามข้อนี้ไปก่อน →</button>');
        html.push('  </div>');
      } else if (step === 5) {
        // Step 5: Read Sentence ("The cat sat on the mat.")
        var sentText = (this.lessonId.startsWith('L1')) ? 'The cat sat on the mat.' : (item.sentence || item.word || 'The cat sat on the mat.');
        var words = sentText.replace(/[.?!]/g, '').split(/\s+/).filter(Boolean);
        html.push('  <p class="text-xs font-extrabold text-[#8B7CFF]">ขั้นที่ 5 • อ่านประโยค (แตะฟังทีละคำ หรือลองอ่านออกเสียง)</p>');
        html.push('  <div id="kb-sent-words-box" class="flex flex-wrap justify-center gap-2 my-4">');
        words.forEach(function (w, i) {
          html.push('    <span data-sent-word="' + i + '" data-word="' + w + '" class="kb-sent-word px-3.5 py-2 rounded-2xl font-extrabold text-xl bg-[#F7F3FF] text-[#1B1B1F] border border-[#E5DEF0] shadow-sm hover:scale-105 active:scale-95 transition cursor-pointer">' + w + '</span>');
        });
        html.push('  </div>');
        html.push('  <p class="text-xs font-bold text-[#7B7488] mb-3">แตะคำไหนเพื่อฟังเสียง หรือกดปุ่มด้านล่างเพื่อฟังทั้งประโยค / บันทึกเสียงอ่าน</p>');
        html.push('  <div class="flex flex-col gap-2.5 max-w-[280px] mx-auto">');
        html.push('    <button id="kb-read-sentence" class="bg-[#FFC93C] text-black px-6 py-3 rounded-full font-extrabold text-sm shadow hover:opacity-95 transition cursor-pointer flex items-center justify-center gap-2">🔊 ฟังประโยคเต็ม</button>');
        html.push('    <button id="kb-mic-sent-btn" class="bg-white border-2 border-[#FF5B6A] text-[#FF5B6A] hover:bg-[#FFF0F2] px-6 py-3 rounded-full font-extrabold text-sm shadow-sm transition cursor-pointer flex items-center justify-center gap-2">🎙️ อ่านออกเสียงเอง</button>');
        html.push('    <div id="kb-sent-mic-bar-wrap" class="hidden w-full bg-[#E5DEF0] rounded-full h-2.5 overflow-hidden my-1">');
        html.push('      <div id="kb-sent-mic-bar" class="bg-[#FF5B6A] h-full w-0 transition-all duration-75"></div>');
        html.push('    </div>');
        html.push('    <div id="kb-sent-mic-state" class="text-xs font-bold text-[#7B7488] min-h-[22px] transition flex items-center justify-center text-center"></div>');
        html.push('    <button id="kb-finish-btn" class="bg-[#7ED9A8] text-white px-6 py-3.5 rounded-full font-extrabold text-sm shadow hover:opacity-95 transition cursor-pointer mt-1">จบแบบฝึกหัด 🎉 →</button>');
        html.push('  </div>');
      }

      return html.join('');
    },

    renderSummary: function () {
      var html = [];
      html.push('<div class="px-5 pt-8 pb-24 max-w-[440px] mx-auto text-center select-none font-sans">');
      html.push('  <div class="w-24 h-24 bg-[#E8FFF0] border-4 border-[#7ED9A8] rounded-full flex items-center justify-center mx-auto text-5xl shadow-md animate-bounce">🏆</div>');
      html.push('  <h2 class="text-2xl font-extrabold mt-4 text-[#1B1B1F]">สุดยอดมากเลยคนเก่ง!</h2>');
      html.push('  <p class="text-sm font-bold text-[#7B7488] mt-1">เรียนจบบทเรียน ' + this.lessonId + ' ครบทั้ง 5 ขั้นตอนแล้ว 🎉</p>');
      html.push('  <div class="grid grid-cols-3 gap-3 my-6">');
      html.push('    <div class="bg-white border-2 border-[#F1EAF7] rounded-2xl p-3 shadow-sm">');
      html.push('      <span class="text-2xl">⭐</span>');
      html.push('      <b class="block text-lg font-extrabold mt-1 text-[#FFC93C]">+50</b>');
      html.push('      <span class="text-[11px] font-bold text-[#9A8FA8]">Stars</span>');
      html.push('    </div>');
      html.push('    <div class="bg-white border-2 border-[#F1EAF7] rounded-2xl p-3 shadow-sm">');
      html.push('      <span class="text-2xl">🪙</span>');
      html.push('      <b class="block text-lg font-extrabold mt-1 text-[#FF9A4D]">+50</b>');
      html.push('      <span class="text-[11px] font-bold text-[#9A8FA8]">Coins</span>');
      html.push('    </div>');
      html.push('    <div class="bg-white border-2 border-[#F1EAF7] rounded-2xl p-3 shadow-sm">');
      html.push('      <span class="text-2xl">💎</span>');
      html.push('      <b class="block text-lg font-extrabold mt-1 text-[#8B7CFF]">+1</b>');
      html.push('      <span class="text-[11px] font-bold text-[#9A8FA8]">Gems</span>');
      html.push('    </div>');
      html.push('  </div>');
      html.push('  <button id="kb-summary-done" class="w-full bg-[#8B7CFF] text-white py-4 rounded-full font-extrabold text-base shadow-lg hover:opacity-95 transition cursor-pointer">กลับสู่หน้ารายการบทเรียน →</button>');
      html.push('</div>');

      this.containerEl.innerHTML = html.join('');
      var self = this;
      var btn = document.getElementById('kb-summary-done');
      if (btn) {
        btn.addEventListener('click', function () {
          if (typeof global.__kbNavigate === 'function') {
            global.__kbNavigate('phonicsHome');
          } else {
            window.location.href = '/kidobits/theme/theme_home.html';
          }
        });
      }
      AudioEngine.playSingle('/kidobits/audio/l2/prompt_lesson_done.mp3');
    },

    /* ------------------------------------------------------------- 4. Event Handlers */
    bindEvents: function () {
      var self = this;

      // Top back button
      var backBtn = document.getElementById('kb-btn-back');
      if (backBtn) {
        backBtn.addEventListener('click', function () {
          AudioEngine.stop();
          if (typeof global.__kbNavigate === 'function') {
            global.__kbNavigate('phonicsHome');
          } else {
            window.location.href = '/kidobits/theme/theme_home.html';
          }
        });
      }

      // Refresh Lesson Button
      var refreshBtn = document.getElementById('kb-btn-refresh-lesson');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', function () {
          var icon = refreshBtn.querySelector('.kb-spin-icon');
          if (icon) {
            icon.classList.add('animate-spin');
            setTimeout(function () {
              icon.classList.remove('animate-spin');
            }, 750);
          }
          AudioEngine.stop();
          if (self.micStream) {
            try { self.micStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
          }
          self.isListening = false;
          self.isAdvancing = false;
          self.completedSteps = [];
          self.step = 1;
          self.wordIdx = 0;
          self.typed = [];
          self.openSession(self.lessonId);
        });

        // Double click shortcut to hard reload the browser window
        refreshBtn.addEventListener('dblclick', function () {
          window.location.reload();
        });
      }

      // Step Tabs Navigation
      var navBtns = this.containerEl.querySelectorAll('[data-nav-step]');
      navBtns.forEach(function (nb) {
        nb.addEventListener('click', function () {
          var s = parseInt(nb.getAttribute('data-nav-step'), 10);
          self.jumpToStep(s);
        });
      });

      // Sound banner replay
      var banner = document.getElementById('kb-banner');
      if (banner) {
        banner.addEventListener('click', function () {
          if (self.step === 5) {
            self.playSentence();
          } else {
            self.playTargetWord();
          }
        });
      }

      // Replay Word button
      var replayBtn = document.getElementById('kb-replay-word');
      if (replayBtn) {
        replayBtn.addEventListener('click', function () {
          self.playTargetWord();
        });
      }

      // Clear button
      var clearBtn = document.getElementById('kb-clear-btn');
      if (clearBtn) {
        clearBtn.addEventListener('click', function () {
          self.typed = [];
          self.updateSlots();
        });
      }

      // Slot Click to Remove Letter (Steps 1 & 2)
      var slotBoxes = this.containerEl.querySelectorAll('.kb-slot-box');
      slotBoxes.forEach(function (slotEl) {
        slotEl.addEventListener('click', function () {
          var idx = parseInt(slotEl.getAttribute('data-slot-idx'), 10);
          if (self.typed[idx]) {
            self.typed.splice(idx, 1);
            self.updateSlots();
          }
        });
      });

      // Steps 1 & 2: Letter Click
      if (this.step === 1 || this.step === 2) {
        var letterBtns = this.containerEl.querySelectorAll('.kb-letter-btn');
        letterBtns.forEach(function (btn) {
          btn.addEventListener('click', function () {
            var btnId = parseInt(btn.getAttribute('data-btn-idx'), 10);
            var ch = btn.getAttribute('data-letter');
            var currentWord = (self.item && self.item.word) ? self.item.word : (self.words[self.wordIdx] || 'at');

            // Don't add beyond target length
            if (self.typed.length >= currentWord.length) return;

            self.typed.push({ id: btnId, ch: ch });
            self.updateSlots();

            // Auto-Check immediately when all letters filled!
            if (self.typed.length === currentWord.length) {
              var formedWord = self.typed.map(function (x) { return x.ch; }).join('').toLowerCase();
              if (formedWord === currentWord.toLowerCase()) {
                self.submitAnswer(currentWord);
              } else {
                self.handleWrong();
              }
            }
          });
        });
      }

      // Step 3: Choice click
      if (this.step === 3) {
        var choiceBtns = this.containerEl.querySelectorAll('.kb-choice-btn');
        choiceBtns.forEach(function (cb) {
          cb.addEventListener('click', function () {
            var choice = cb.getAttribute('data-choice');
            var currentWord = (self.item && self.item.word) ? self.item.word : (self.words[self.wordIdx] || 'at');
            if (choice.toLowerCase() === currentWord.toLowerCase()) {
              cb.classList.add('bg-[#D9F8E7]', 'border-[#7ED9A8]');
              self.submitAnswer(choice);
            } else {
              cb.classList.add('bg-[#FFE0E8]', 'border-[#FF7AB8]', 'animate-bounce');
              self.handleWrong();
            }
          });
        });
      }

      // Step 4: Mic & Skip
      if (this.step === 4) {
        var micBtn = document.getElementById('kb-mic-btn');
        if (micBtn) {
          micBtn.addEventListener('click', function () { self.startMic(); });
        }
        var skipBtn = document.getElementById('kb-skip-step4');
        if (skipBtn) {
          skipBtn.addEventListener('click', function () {
            self.cleanupMic();
            var currentWord = (self.item && self.item.word) ? self.item.word : (self.words[self.wordIdx] || 'at');
            self.submitAnswer(currentWord);
          });
        }
      }

      // Step 5: Read Sentence & Individual Word Click
      if (this.step === 5) {
        var readSent = document.getElementById('kb-read-sentence');
        if (readSent) {
          readSent.addEventListener('click', function () {
            self.playSentence(function () {
              setTimeout(function () {
                if (self.step === 5 && !self.isListening) self.startSentenceMic();
              }, 400);
            });
          });
        }
        var micSentBtn = document.getElementById('kb-mic-sent-btn');
        if (micSentBtn) {
          micSentBtn.addEventListener('click', function () {
            self.startSentenceMic();
          });
        }
        var finishBtn = document.getElementById('kb-finish-btn');
        if (finishBtn) {
          finishBtn.addEventListener('click', function () {
            self.step = 6;
            self.render();
          });
        }
        var sentWords = this.containerEl.querySelectorAll('.kb-sent-word');
        sentWords.forEach(function (ws) {
          ws.addEventListener('click', function () {
            var raw = ws.getAttribute('data-word').replace(/[^a-zA-Z]/g, '').toLowerCase();
            if (raw) {
              ws.classList.add('bg-[#FFC93C]', 'scale-110');
              AudioEngine.playSingle('/kidobits/v2/audio/word_' + raw + '.mp3', function () {
                ws.classList.remove('bg-[#FFC93C]', 'scale-110');
              });
            }
          });
        });
      }

      // Footer Navigation buttons
      var nextBtn = document.getElementById('kb-btn-next');
      if (nextBtn) {
        nextBtn.addEventListener('click', function () {
          if (self.step < 5) {
            self.jumpToStep(self.step + 1);
          } else {
            self.step = 6;
            self.render();
          }
        });
      }
      var prevBtn = document.getElementById('kb-btn-prev');
      if (prevBtn) {
        prevBtn.addEventListener('click', function () {
          if (self.step > 1) {
            self.jumpToStep(self.step - 1);
          }
        });
      }

      this.updateSlots();
    },

    updateSlots: function () {
      var slotEls = this.containerEl.querySelectorAll('[data-slot-idx]');
      var typed = this.typed;
      var usedIds = typed.map(function (x) { return x.id; });

      slotEls.forEach(function (el, i) {
        if (typed[i]) {
          el.textContent = typed[i].ch;
          el.classList.add('bg-[#F0EFFF]', 'border-solid', 'border-[#8B7CFF]');
          el.classList.remove('bg-slate-50', 'border-dashed', 'border-[#C9C0D6]');
        } else {
          el.textContent = '_';
          el.classList.remove('bg-[#F0EFFF]', 'border-solid', 'border-[#8B7CFF]');
          el.classList.add('bg-slate-50', 'border-dashed', 'border-[#C9C0D6]');
        }
      });

      // Update letter buttons enabled/disabled state in Step 1 & 2
      var letterBtns = this.containerEl.querySelectorAll('.kb-letter-btn');
      letterBtns.forEach(function (btn) {
        var bId = parseInt(btn.getAttribute('data-btn-idx'), 10);
        if (usedIds.indexOf(bId) !== -1) {
          btn.classList.add('opacity-25', 'pointer-events-none', 'scale-95');
        } else {
          btn.classList.remove('opacity-25', 'pointer-events-none', 'scale-95');
        }
      });
    },

    /* ------------------------------------------------------------- 5. Core Game Loop */
    submitAnswer: function (answer) {
      if (this.isAdvancing) return;
      this.isAdvancing = true;
      var self = this;

      // Visual feedback
      var card = document.getElementById('kb-card');
      if (card) {
        card.classList.add('ring-4', 'ring-[#7ED9A8]');
      }
      var banner = document.getElementById('kb-banner');
      if (banner) {
        banner.innerHTML = '<span>ถูกต้องแล้ว! เก่งมาก ✓ +10 เหรียญ</span> 🎉';
        banner.classList.remove('bg-[#E8FFF0]', 'text-[#1B9A62]');
        banner.classList.add('bg-[#D9F8E7]', 'text-[#1B9A62]');
      }

      this.stats.coins += 10;
      if (typeof global.__kbAddReward === 'function') {
        global.__kbAddReward(10, 5);
      }

      // Sync answer with server API in background (non-blocking)
      if (this.sessionId && !this.sessionId.startsWith('local-')) {
        fetch(API_BASE + '/session/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session: this.sessionId, input: answer })
        }).catch(function () {});
      }

      // Praise sound + Auto Next
      var praiseFile = '/kidobits/v2/audio/praise_great.mp3';
      AudioEngine.playSingle(praiseFile, function () {
        setTimeout(function () {
          self.advanceSubItem();
        }, 1100);
      });
    },

    advanceSubItem: function () {
      this.isAdvancing = false;
      var totalItems = (this.item && this.item.total) ? this.item.total : 5;

      // Check if more words remain in this step (0..4)
      if (this.wordIdx < totalItems - 1) {
        this.wordIdx++;
        var w = this.words[this.wordIdx] || 'at';
        this.item = {
          step: this.step,
          index: this.wordIdx,
          word: w,
          total: totalItems,
          letters: w.split('')
        };
        this.setupWordData();
        this.render();
        if (this.step === 4) {
          var self = this;
          this.playTargetWord(function () {
            setTimeout(function () {
              if (self.step === 4 && !self.isListening) self.startMic();
            }, 350);
          });
        } else {
          this.playTargetWord();
        }
      } else {
        // Step complete!
        if (this.completedSteps.indexOf(this.step) === -1) {
          this.completedSteps.push(this.step);
        }
        if (this.step < 5) {
          this.jumpToStep(this.step + 1);
        } else {
          this.step = 6;
          this.render();
        }
      }
    },

    jumpToStep: function (s) {
      AudioEngine.stop();
      this.cleanupMic();
      this.step = s;
      this.wordIdx = 0;
      var w = this.words[0] || 'at';
      this.item = {
        step: s,
        index: 0,
        word: w,
        total: 5,
        letters: w.split('')
      };
      this.setupWordData();
      this.render();
      if (s === 5) {
        var self = this;
        this.playSentence(function () {
          setTimeout(function () {
            if (self.step === 5 && !self.isListening) {
              self.startSentenceMic();
            }
          }, 400);
        });
      } else {
        this.playStepPrompt();
      }
    },

    handleWrong: function () {
      var self = this;
      var card = document.getElementById('kb-card');
      if (card) {
        card.classList.add('ring-4', 'ring-[#FF7AB8]', 'animate-shake');
        setTimeout(function () {
          card.classList.remove('ring-4', 'ring-[#FF7AB8]', 'animate-shake');
        }, 800);
      }
      var banner = document.getElementById('kb-banner');
      if (banner) {
        banner.innerHTML = '<span>ยังไม่ถูกนะคนเก่ง ลองใหม่อีกครั้ง ↺</span>';
        banner.classList.remove('bg-[#E8FFF0]', 'text-[#1B9A62]');
        banner.classList.add('bg-[#FFE0E8]', 'text-[#E85A8A]');
      }

      AudioEngine.playSingle('/kidobits/v2/audio/try_again.mp3', function () {
        self.typed = [];
        self.updateSlots();
      });
    },

    /* ------------------------------------------------------------- 6. Audio Helpers */
    playTargetWord: function (onDone) {
      var w = (this.item && this.item.word) ? this.item.word : (this.words[this.wordIdx] || 'at');
      if (!w) return;
      var url = '/kidobits/v2/audio/word_' + w.toLowerCase() + '.mp3';
      AudioEngine.playSingle(url, onDone);
    },

    playStepPrompt: function () {
      var self = this;
      var promptMap = {
        1: '/kidobits/audio/l2/prompt_blend.mp3',
        2: '/kidobits/audio/l2/prompt_spell.mp3',
        3: '/kidobits/audio/l2/prompt_listen.mp3',
        4: '/kidobits/audio/l2/prompt_your_turn.mp3',
        5: '/kidobits/audio/l2/prompt_read_sent.mp3'
      };
      var p = promptMap[this.step];
      var w = (this.item && this.item.word) ? this.item.word : (this.words[this.wordIdx] || 'at');
      var wordAudio = w ? '/kidobits/v2/audio/word_' + w.toLowerCase() + '.mp3' : null;
      AudioEngine.playQueue([p, wordAudio].filter(Boolean), null, function () {
        if (self.step === 4) {
          // 🔊 รอเสียงครูพูดจบก่อน แล้วเปิดไมค์ Auto ทันที (เหมือนระบบเดิม)
          setTimeout(function () {
            if (self.step === 4 && !self.isListening) {
              self.startMic();
            }
          }, 350);
        }
      });
    },

    playSentence: function (onDone) {
      var self = this;
      var sentWords = this.containerEl.querySelectorAll('[data-sent-word]');

      // Chain of authentic audio files for "The cat sat on the mat."
      var audioChain = [
        '/kidobits/v2/audio/word_the.mp3',
        '/kidobits/v2/audio/word_cat.mp3',
        '/kidobits/v2/audio/word_sat.mp3',
        '/kidobits/v2/audio/word_on.mp3',
        '/kidobits/v2/audio/word_the.mp3',
        '/kidobits/v2/audio/word_mat.mp3'
      ];

      AudioEngine.playQueue(audioChain, function (activeIdx) {
        sentWords.forEach(function (el, i) {
          if (i === activeIdx) {
            el.classList.add('bg-[#FFC93C]', 'scale-110');
            el.classList.remove('bg-[#F7F3FF]');
          } else {
            el.classList.remove('bg-[#FFC93C]', 'scale-110');
            el.classList.add('bg-[#F7F3FF]');
          }
        });
      }, function () {
        sentWords.forEach(function (el) {
          el.classList.remove('bg-[#FFC93C]', 'scale-110');
          el.classList.add('bg-[#F7F3FF]');
        });
        if (onDone) onDone();
      });
    },

    /* ------------------------------------------------------------- 7. Kidobits Authentic Speech & Mic System (Step 4 & Step 5) */
    checkSpeechMatch: function (spokenText, targetWord) {
      if (!spokenText || !targetWord) return false;
      spokenText = spokenText.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
      targetWord = targetWord.toLowerCase().trim();
      var tokens = spokenText.split(/\s+/).filter(Boolean);

      if (tokens.indexOf(targetWord) !== -1) return true;
      if (targetWord.length >= 3 && spokenText.indexOf(targetWord) !== -1) return true;

      var syns = SPEECH_SYNONYMS[targetWord] || [];
      for (var i = 0; i < syns.length; i++) {
        if (tokens.indexOf(syns[i]) !== -1 || spokenText.indexOf(syns[i]) !== -1) {
          return true;
        }
      }

      for (var j = 0; j < tokens.length; j++) {
        var t = tokens[j];
        if (targetWord.length >= 3 && (t.startsWith(targetWord.slice(0, 2)) || t.endsWith(targetWord.slice(-2)))) {
          return true;
        }
      }
      return false;
    },

    pickMime: function () {
      if (typeof MediaRecorder === 'undefined') return '';
      var c = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
      for (var i = 0; i < c.length; i++) {
        try {
          if (MediaRecorder.isTypeSupported(c[i])) return c[i];
        } catch (e) {}
      }
      return '';
    },

    ensureMic: function (onSuccess, onError) {
      var self = this;
      if (this.micStream && this.micStream.active && this.micStream.getAudioTracks().some(function (t) { return t.readyState === 'live'; })) {
        return onSuccess(this.micStream);
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return onError(new Error('no_mediadevices'));
      }
      navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      }).then(function (stream) {
        self.micStream = stream;
        onSuccess(stream);
      }).catch(function (err) {
        onError(err);
      });
    },

    cleanupMic: function () {
      if (this.micInterval) {
        clearInterval(this.micInterval);
        this.micInterval = null;
      }
      if (this.micTimeout) {
        clearTimeout(this.micTimeout);
        this.micTimeout = null;
      }
      if (this.activeRecognition) {
        try { this.activeRecognition.abort(); } catch (e) {}
        this.activeRecognition = null;
      }
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        try { this.mediaRecorder.stop(); } catch (e) {}
      }
      this.mediaRecorder = null;
      if (this.micSource) {
        try { this.micSource.disconnect(); } catch (e) {}
        this.micSource = null;
      }
      if (this.analyser) {
        try { this.analyser.disconnect(); } catch (e) {}
        this.analyser = null;
      }
      this.isListening = false;
    },

    /* Step 4: Word Reading Mic */
    startMic: function () {
      var self = this;
      var statusEl = document.getElementById('kb-mic-status');
      var micBtn = document.getElementById('kb-mic-btn');
      var micBar = document.getElementById('kb-mic-bar');
      var micPct = document.getElementById('kb-mic-pct');
      var targetWord = (self.item && self.item.word) ? self.item.word : (self.words[self.wordIdx] || 'at');

      if (this.isListening) {
        this.cleanupMic();
        if (statusEl) {
          statusEl.textContent = 'แตะไมค์เพื่อเริ่มพูดใหม่ได้เลยจ้า 🎙️';
          statusEl.className = 'text-xs font-extrabold text-[#7B7488] mt-2 transition';
        }
        if (micBtn) {
          micBtn.className = 'my-4 w-20 h-20 rounded-full bg-[#FF5B6A] text-white flex items-center justify-center mx-auto text-3xl shadow-lg active:scale-95 transition cursor-pointer';
          micBtn.textContent = '🎙️';
        }
        if (micBar) micBar.style.width = '0%';
        if (micPct) micPct.textContent = '0%';
        return;
      }

      this.isListening = true;

      if (micBtn) {
        micBtn.classList.add('animate-pulse', 'scale-110', 'ring-4', 'ring-[#FF5B6A]/40');
      }
      if (statusEl) {
        statusEl.innerHTML = 'กำลังฟัง… พูดคำว่า <b class="text-black text-sm">"' + targetWord + '"</b> ได้เลย 🎙️';
        statusEl.className = 'text-xs font-extrabold text-[#FF5B6A] mt-2 transition';
      }

      var hasPassed = false;
      var speechDetected = false;
      var lastVoiceTs = 0;
      var voicedMs = 0;
      var recStart = Date.now();
      var chunks = [];

      function handleSuccess(heard) {
        if (hasPassed) return;
        hasPassed = true;
        self.cleanupMic();

        if (micBar) micBar.style.width = '100%';
        if (micPct) micPct.textContent = '100%';
        if (micBtn) {
          micBtn.className = 'my-4 w-20 h-20 rounded-full bg-[#7ED9A8] text-white flex items-center justify-center mx-auto text-3xl shadow-lg transition';
          micBtn.textContent = '✓';
        }
        if (statusEl) {
          statusEl.innerHTML = '<span class="text-[#1B9A62] font-black text-sm">✅ หนูอ่านว่า "' + (heard || targetWord) + '" — เก่งมาก! (+10 เหรียญ)</span>';
        }
        AudioEngine.playSingle('/kidobits/v2/audio/praise_great.mp3');
        setTimeout(function () {
          self.submitAnswer(targetWord);
        }, 1300);
      }

      function handleRetry(heard) {
        if (hasPassed || self.step !== 4) return;
        self.cleanupMic();

        var msg = heard ? ('ได้ยินว่า "' + heard + '" — ลองอีกครั้งนะ 🙂') : 'ไม่ได้ยินชัด ๆ — ลองพูดอีกครั้งนะ 🙂';
        if (statusEl) {
          statusEl.textContent = msg;
          statusEl.className = 'text-xs font-extrabold text-[#FF5B6A] mt-2 transition';
        }
        if (micBtn) {
          micBtn.className = 'my-4 w-20 h-20 rounded-full bg-[#FF5B6A] text-white flex items-center justify-center mx-auto text-3xl shadow-lg active:scale-95 transition cursor-pointer';
          micBtn.textContent = '🎙️';
        }
        if (micBar) micBar.style.width = '0%';
        if (micPct) micPct.textContent = '0%';

        AudioEngine.playSingle('/kidobits/v2/audio/try_again.mp3', function () {
          setTimeout(function () {
            if (self.step === 4 && !self.isListening && !hasPassed) {
              self.startMic();
            }
          }, 400);
        });
      }

      this.ensureMic(function (stream) {
        if (hasPassed || !self.isListening) return;

        var mime = self.pickMime();
        var rec;
        try {
          rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        } catch (e) {
          rec = new MediaRecorder(stream);
        }
        self.mediaRecorder = rec;

        rec.ondataavailable = function (ev) {
          if (ev.data && ev.data.size > 0) chunks.push(ev.data);
        };

        rec.onstop = function () {
          if (hasPassed) return;
          var blob = new Blob(chunks, { type: mime || 'audio/webm' });

          // Discard only if genuinely empty / cancelled immediately (< 800 bytes)
          if (blob.size < 800) {
            handleRetry('');
            return;
          }

          if (statusEl) {
            statusEl.textContent = 'กำลังฟัง… 🎧';
            statusEl.className = 'text-xs font-extrabold text-[#8B7CFF] mt-2 transition animate-pulse';
          }

          // Send to Kidobits STT server
          var fd = new FormData();
          fd.append('audio', blob, 'child.webm');
          fd.append('hint', targetWord);

          fetch('/kidobits/stt', {
            method: 'POST',
            body: fd
          })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (hasPassed) return;
            var raw = (data && data.text) || '';
            var clean = raw.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
            console.log('Kidobits Server STT (Step 4):', data);

            var hit = (clean === targetWord.toLowerCase()) || (data && data.fuzzy_ok) || self.checkSpeechMatch(clean, targetWord);
            if (hit) {
              handleSuccess(clean || targetWord);
            } else {
              handleRetry(clean);
            }
          })
          .catch(function (err) {
            console.warn('STT request error:', err);
            if (hasPassed) return;
            if (speechDetected && voicedMs >= 350) {
              handleSuccess(targetWord);
            } else {
              handleRetry('');
            }
          });
        };

        try {
          rec.start();
        } catch (e) {
          console.warn('MediaRecorder start error:', e);
        }

        // Web Audio Analyser for live volume meter + VAD
        try {
          var audioCtx = ensureAudioCtx();
          if (audioCtx) {
            var analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.3;
            var src = audioCtx.createMediaStreamSource(stream);
            src.connect(analyser);
            self.micSource = src;
            self.analyser = analyser;

            var freq = new Uint8Array(analyser.frequencyBinCount);
            var hzPerBin = (audioCtx.sampleRate || 48000) / 2 / freq.length;
            var lo = Math.max(1, Math.floor(200 / hzPerBin));
            var hi = Math.min(freq.length - 1, Math.ceil(3500 / hzPerBin));

            self.micInterval = setInterval(function () {
              if (hasPassed || !self.isListening) return;
              analyser.getByteFrequencyData(freq);

              var sum = 0, n = 0, totalSum = 0;
              for (var i = 0; i < freq.length; i++) {
                totalSum += freq[i];
                if (i >= lo && i <= hi) {
                  sum += freq[i] * freq[i];
                  n++;
                }
              }
              var bandRms = n ? Math.sqrt(sum / n) / 255 : 0;
              var avgLevel = totalSum / freq.length;

              // Responsive volume meter animation
              var pct = Math.min(100, Math.round(Math.max(bandRms * 500, (avgLevel / 30) * 100)));
              if (micBar) micBar.style.width = pct + '%';
              if (micPct) micPct.textContent = pct + '%';

              // Sensitive voice activity detection
              if (bandRms > 0.02 || avgLevel > 3.0) {
                speechDetected = true;
                lastVoiceTs = Date.now();
                voicedMs += 60;
              }

              var dur = Date.now() - recStart;
              if (speechDetected && (Date.now() - lastVoiceTs >= 900)) {
                if (rec.state !== 'inactive') rec.stop();
              } else if (dur >= 6000) {
                if (rec.state !== 'inactive') rec.stop();
              }
            }, 60);
          }
        } catch (e) {
          console.warn('Web Audio error:', e);
        }

        // Parallel Web Speech API for 0.2s instant client-side feedback
        var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
        if (SpeechRec) {
          try {
            var recognition = new SpeechRec();
            recognition.lang = 'en-US';
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.maxAlternatives = 3;

            recognition.onresult = function (event) {
              if (hasPassed) return;
              for (var i = event.resultIndex; i < event.results.length; ++i) {
                var transcript = event.results[i][0].transcript;
                var clean = transcript.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
                if (clean && statusEl) {
                  statusEl.innerHTML = 'หนูพูดว่า: <b class="text-black text-sm">"' + clean + '"</b>';
                }
                if (self.checkSpeechMatch(clean, targetWord)) {
                  handleSuccess(clean);
                  return;
                }
              }
            };

            recognition.onerror = function () {};
            recognition.start();
            self.activeRecognition = recognition;
          } catch (e) {}
        }

      }, function (err) {
        console.warn('getUserMedia error:', err);
        if (statusEl) {
          statusEl.innerHTML = '⚠️ เบราว์เซอร์ยังไม่ได้อนุญาตไมโครโฟน <br><span class="text-[#7B7488]">แตะปุ่ม "ข้ามข้อนี้ไปก่อน" ได้เลยค่ะ</span>';
          statusEl.className = 'text-xs font-bold text-[#FF5B6A] mt-2 transition leading-tight';
        }
        if (micBtn) {
          micBtn.classList.remove('animate-pulse', 'scale-110', 'ring-4', 'ring-[#FF5B6A]/40');
        }
        self.isListening = false;
      });
    },

    /* Step 5: Sentence Reading Mic (Kidobits Authentic Word-by-Word Scoring) */
    startSentenceMic: function () {
      var self = this;
      var micSentBtn = document.getElementById('kb-mic-sent-btn');
      var barWrap = document.getElementById('kb-sent-mic-bar-wrap');
      var micBar = document.getElementById('kb-sent-mic-bar');
      var stateEl = document.getElementById('kb-sent-mic-state');
      var sentWordEls = this.containerEl.querySelectorAll('.kb-sent-word');

      var sentText = (this.lessonId.startsWith('L1')) ? 'The cat sat on the mat.' : (this.item.sentence || this.item.word || 'The cat sat on the mat.');
      var hintWords = sentWordsOf(sentText).filter(function (w) { return !SENT_FUNC_WORDS.has(w); });

      if (this.isListening) {
        this.cleanupMic();
        if (micSentBtn) {
          micSentBtn.className = 'bg-white border-2 border-[#FF5B6A] text-[#FF5B6A] hover:bg-[#FFF0F2] px-6 py-3 rounded-full font-extrabold text-sm shadow-sm transition cursor-pointer flex items-center justify-center gap-2';
          micSentBtn.textContent = '🎙️ อ่านออกเสียงเอง';
        }
        if (barWrap) barWrap.classList.add('hidden');
        if (micBar) micBar.style.width = '0%';
        if (stateEl) stateEl.textContent = 'แตะเพื่อเริ่มอ่านใหม่อีกครั้ง 🎙️';
        return;
      }

      this.isListening = true;

      if (micSentBtn) {
        micSentBtn.className = 'bg-[#FFF0F2] border-2 border-[#FF5B6A] text-[#FF5B6A] px-6 py-3 rounded-full font-extrabold text-sm shadow-sm transition cursor-pointer flex items-center justify-center gap-2 animate-pulse ring-4 ring-[#FF5B6A]/30';
        micSentBtn.textContent = '🎙️ กำลังฟัง… แตะเพื่อหยุด';
      }
      if (barWrap) barWrap.classList.remove('hidden');
      if (stateEl) {
        stateEl.innerHTML = 'กำลังฟัง… หนูอ่านประโยคนี้ได้เลย 🎙️';
        stateEl.className = 'text-xs font-bold text-[#FF5B6A] min-h-[22px] transition flex items-center justify-center text-center';
      }

      var hasPassed = false;
      var speechDetected = false;
      var lastVoiceTs = 0;
      var voicedMs = 0;
      var recStart = Date.now();
      var chunks = [];

      function handleSentenceSuccess(heard, sc) {
        if (hasPassed) return;
        hasPassed = true;
        self.cleanupMic();

        if (micBar) micBar.style.width = '100%';
        if (barWrap) setTimeout(function () { barWrap.classList.add('hidden'); }, 1200);

        // Highlight all words in celebratory green
        sentWordEls.forEach(function (el) {
          el.className = 'kb-sent-word px-3.5 py-2 rounded-2xl font-extrabold text-xl bg-[#E8FFF0] text-[#1B9A62] border-2 border-[#7ED9A8] shadow-md transition scale-105';
        });

        if (micSentBtn) {
          micSentBtn.className = 'bg-[#7ED9A8] text-white px-6 py-3 rounded-full font-extrabold text-sm shadow transition flex items-center justify-center gap-2';
          micSentBtn.textContent = '✓ อ่านเก่งมาก!';
        }

        var hitCount = sc ? sc.hit.length : 3;
        var totalCount = sc ? (sc.hit.length + sc.miss.length) : 3;
        if (stateEl) {
          stateEl.innerHTML = '<span class="text-[#1B9A62] font-black text-sm">✅ หนูอ่านได้ ' + hitCount + ' จาก ' + totalCount + ' คำ — เก่งมาก! (+20 เหรียญ)</span>';
        }

        self.stats.coins += 20;
        if (typeof global.__kbAddReward === 'function') {
          global.__kbAddReward(20, 10);
        }

        AudioEngine.playSingle('/kidobits/v2/audio/praise_great.mp3');
        setTimeout(function () {
          if (self.step === 5) {
            self.step = 6;
            self.render();
          }
        }, 1600);
      }

      function handleSentenceRetry(heard, sc) {
        if (hasPassed || self.step !== 5) return;
        self.cleanupMic();

        if (micSentBtn) {
          micSentBtn.className = 'bg-white border-2 border-[#FF5B6A] text-[#FF5B6A] hover:bg-[#FFF0F2] px-6 py-3 rounded-full font-extrabold text-sm shadow-sm transition cursor-pointer flex items-center justify-center gap-2';
          micSentBtn.textContent = '🎙️ อ่านออกเสียงเอง';
        }
        if (barWrap) barWrap.classList.add('hidden');
        if (micBar) micBar.style.width = '0%';

        var missTxt = (sc && sc.miss && sc.miss.length) ? (' (ลองคำ: ' + sc.miss.join(', ') + ')') : '';
        var msg = heard ? ('ได้ยินว่า "' + heard + '" — ลองอีกครั้งนะ 🙂' + missTxt) : 'ไม่ได้ยินชัด ๆ — ลองพูดอีกครั้งนะ 🙂';
        if (stateEl) {
          stateEl.textContent = msg;
          stateEl.className = 'text-xs font-bold text-[#FF5B6A] min-h-[22px] transition flex items-center justify-center text-center';
        }

        AudioEngine.playSingle('/kidobits/v2/audio/try_again.mp3', function () {
          setTimeout(function () {
            if (self.step === 5 && !self.isListening && !hasPassed) {
              self.startSentenceMic();
            }
          }, 400);
        });
      }

      this.ensureMic(function (stream) {
        if (hasPassed || !self.isListening) return;

        var mime = self.pickMime();
        var rec;
        try {
          rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        } catch (e) {
          rec = new MediaRecorder(stream);
        }
        self.mediaRecorder = rec;

        rec.ondataavailable = function (ev) {
          if (ev.data && ev.data.size > 0) chunks.push(ev.data);
        };

        rec.onstop = function () {
          if (hasPassed) return;
          var blob = new Blob(chunks, { type: mime || 'audio/webm' });

          if (blob.size < 800) {
            handleSentenceRetry('', null);
            return;
          }

          if (stateEl) {
            stateEl.textContent = 'กำลังฟัง… 🎧';
            stateEl.className = 'text-xs font-bold text-[#8B7CFF] min-h-[22px] transition animate-pulse flex items-center justify-center text-center';
          }

          var fd = new FormData();
          fd.append('audio', blob, 'child.webm');
          var hintArr = (hintWords.length > 0) ? hintWords : ['cat', 'sat', 'mat'];
          fd.append('hint', Array.from(new Set(hintArr)).join(','));

          fetch('/kidobits/stt', {
            method: 'POST',
            body: fd
          })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (hasPassed) return;
            var raw = (data && data.text) || '';
            var clean = raw.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();
            console.log('Kidobits Server STT (Step 5 Sentence):', data);

            var sc = scoreSentence(sentText, clean);
            var plainTarget = sentText.toLowerCase().replace(/[^a-z ]/g, '').trim();
            var hit = clean && (sc.ratio >= 0.6 || clean.indexOf(plainTarget) !== -1);

            if (hit) {
              handleSentenceSuccess(clean, sc);
            } else {
              handleSentenceRetry(clean, sc);
            }
          })
          .catch(function (err) {
            console.warn('Sentence STT error:', err);
            if (hasPassed) return;
            if (speechDetected && voicedMs >= 500) {
              handleSentenceSuccess(sentText, { ratio: 1.0, hit: hintWords, miss: [] });
            } else {
              handleSentenceRetry('', null);
            }
          });
        };

        try {
          rec.start();
        } catch (e) {
          console.warn('MediaRecorder sentence start error:', e);
        }

        // Analyser for Step 5
        try {
          var audioCtx = ensureAudioCtx();
          if (audioCtx) {
            var analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.3;
            var src = audioCtx.createMediaStreamSource(stream);
            src.connect(analyser);
            self.micSource = src;
            self.analyser = analyser;

            var freq = new Uint8Array(analyser.frequencyBinCount);
            var hzPerBin = (audioCtx.sampleRate || 48000) / 2 / freq.length;
            var lo = Math.max(1, Math.floor(200 / hzPerBin));
            var hi = Math.min(freq.length - 1, Math.ceil(3500 / hzPerBin));

            self.micInterval = setInterval(function () {
              if (hasPassed || !self.isListening) return;
              analyser.getByteFrequencyData(freq);

              var sum = 0, n = 0, totalSum = 0;
              for (var i = 0; i < freq.length; i++) {
                totalSum += freq[i];
                if (i >= lo && i <= hi) {
                  sum += freq[i] * freq[i];
                  n++;
                }
              }
              var bandRms = n ? Math.sqrt(sum / n) / 255 : 0;
              var avgLevel = totalSum / freq.length;

              var pct = Math.min(100, Math.round(Math.max(bandRms * 500, (avgLevel / 30) * 100)));
              if (micBar) micBar.style.width = pct + '%';

              if (bandRms > 0.02 || avgLevel > 3.0) {
                speechDetected = true;
                lastVoiceTs = Date.now();
                voicedMs += 60;
              }

              var dur = Date.now() - recStart;
              // Sentence pause hold 1100ms, max 7500ms
              if (speechDetected && (Date.now() - lastVoiceTs >= 1100)) {
                if (rec.state !== 'inactive') rec.stop();
              } else if (dur >= 7500) {
                if (rec.state !== 'inactive') rec.stop();
              }
            }, 60);
          }
        } catch (e) {
          console.warn('Web Audio error:', e);
        }

        // Parallel Web Speech API for Step 5
        var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
        if (SpeechRec) {
          try {
            var recognition = new SpeechRec();
            recognition.lang = 'en-US';
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.maxAlternatives = 3;

            recognition.onresult = function (event) {
              if (hasPassed) return;
              for (var i = event.resultIndex; i < event.results.length; ++i) {
                var transcript = event.results[i][0].transcript;
                var clean = transcript.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();
                if (clean && stateEl) {
                  stateEl.innerHTML = 'หนูพูดว่า: <b class="text-black text-sm">"' + clean + '"</b>';
                }
                var sc = scoreSentence(sentText, clean);
                if (sc.ratio >= 0.6) {
                  handleSentenceSuccess(clean, sc);
                  return;
                }
              }
            };

            recognition.onerror = function () {};
            recognition.start();
            self.activeRecognition = recognition;
          } catch (e) {}
        }

      }, function (err) {
        console.warn('getUserMedia error:', err);
        if (stateEl) {
          stateEl.innerHTML = '⚠️ เบราว์เซอร์ยังไม่ได้อนุญาตไมโครโฟน';
          stateEl.className = 'text-xs font-bold text-[#FF5B6A] min-h-[22px] transition flex items-center justify-center text-center';
        }
        if (micSentBtn) {
          micSentBtn.className = 'bg-white border-2 border-[#FF5B6A] text-[#FF5B6A] hover:bg-[#FFF0F2] px-6 py-3 rounded-full font-extrabold text-sm shadow-sm transition cursor-pointer flex items-center justify-center gap-2';
          micSentBtn.textContent = '🎙️ อ่านออกเสียงเอง';
        }
        self.isListening = false;
      });
    }

  };

  global.KidobitsLessonEngine = Engine;
})(window);