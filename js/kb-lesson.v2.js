/*!
 * Kidobits Phonics Lesson Engine (Refactored & Bulletproof Architecture)
 * Unified Vanilla JS + Tailwind CSS — Pixel-perfect Kidobits Theme
 *
 * Architecture:
 *   1. AudioPlayer: Decoupled, non-blocking sound engine (never halts game advancement).
 *   2. VoiceManager: Smart Dual-Engine (Native Web Speech on PC, Whisper STT on Mobile),
 *                    guaranteed track.stop() on disarm (no persistent green dot on Android).
 *   3. LessonEngine: Deterministic State Machine with guaranteed Auto-Next watchdogs.
 */
(function (global) {
  'use strict';

  var API_BASE = '/kidobits/api';

  /* =========================================================================
   * 1. AUDIO PLAYER (Decoupled, Non-blocking, Autoplay Unlocked)
   * ========================================================================= */
  var _sharedAudioCtx = null;
  function getAudioCtx() {
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
  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', getAudioCtx, { passive: true });
    document.addEventListener('click', getAudioCtx, { passive: true });
  }

  var AudioPlayer = {
    current: null,
    token: 0,
    unlocked: false,

    unlock: function () {
      if (this.unlocked) return;
      this.unlocked = true;
      try {
        var silent = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
        silent.play().catch(function () {});
      } catch (e) {}
      getAudioCtx();
    },

    stop: function () {
      this.token++;
      if (this.current) {
        try {
          this.current.pause();
          this.current.src = '';
          this.current.onended = null;
          this.current.onerror = null;
        } catch (e) {}
        this.current = null;
      }
    },

    playSingle: function (url, onDone) {
      this.stop();
      if (!url) { if (onDone) onDone(); return; }
      var myToken = ++this.token;
      var a = new Audio(url);
      this.current = a;

      var finished = false;
      function done() {
        if (finished || myToken !== AudioPlayer.token) return;
        finished = true;
        try {
          a.pause();
          a.onended = null;
          a.onerror = null;
        } catch (e) {}
        if (AudioPlayer.current === a) AudioPlayer.current = null;
        if (onDone) onDone();
      }

      a.onended = done;
      a.onerror = done;
      var p = a.play();
      if (p && p.catch) {
        p.catch(function () { done(); });
      }
      setTimeout(done, 10000); // 10s safety fallback
    },

    playQueue: function (urls, onEachStep, onDone) {
      this.stop();
      var self = this;
      var myToken = ++this.token;
      urls = (urls || []).filter(Boolean);
      var idx = 0;

      function next() {
        if (myToken !== self.token) return;
        if (idx >= urls.length) {
          self.current = null;
          if (onDone) onDone();
          return;
        }
        var curIdx = idx;
        var u = urls[idx++];
        var a = new Audio(u);
        self.current = a;

        if (onEachStep) {
          try { onEachStep(curIdx, u); } catch (e) {}
        }

        var advanced = false;
        function step() {
          if (advanced || myToken !== self.token) return;
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
        setTimeout(step, 12000); // 12s safety per track
      }
      next();
    }
  };

  /* =========================================================================
   * 2. SPEECH HELPERS & SYNONYMS
   * ========================================================================= */
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

  function matchWord(spoken, target) {
    if (!spoken || !target) return false;
    spoken = spoken.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    target = target.toLowerCase().trim();
    if (spoken === target) return true;

    var tokens = spoken.split(/\s+/).filter(Boolean);
    if (tokens.indexOf(target) !== -1) return true;
    if (target.length >= 3 && spoken.indexOf(target) !== -1) return true;

    var syns = SPEECH_SYNONYMS[target] || [];
    for (var i = 0; i < syns.length; i++) {
      if (tokens.indexOf(syns[i]) !== -1 || spoken.indexOf(syns[i]) !== -1) return true;
    }
    for (var j = 0; j < tokens.length; j++) {
      var t = tokens[j];
      if (target.length >= 3 && (t.startsWith(target.slice(0, 2)) || t.endsWith(target.slice(-2)))) {
        return true;
      }
    }
    return false;
  }

  /* =========================================================================
   * 3. VOICE MANAGER (Smart Dual-Engine: Native Speech on PC, Whisper on Mobile)
   * ========================================================================= */
  var VoiceManager = {
    isListening: false,
    activeRec: null,
    activeStream: null,
    mediaRec: null,
    analyser: null,
    sourceNode: null,
    interval: null,
    timeout: null,

    isAndroid: function () {
      return (typeof navigator !== 'undefined') && /Android/i.test(navigator.userAgent || '');
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

    stop: function () {
      if (this.interval) {
        clearInterval(this.interval);
        this.interval = null;
      }
      if (this.timeout) {
        clearTimeout(this.timeout);
        this.timeout = null;
      }
      if (this.activeRec) {
        try {
          this.activeRec.onresult = null;
          this.activeRec.onend = null;
          this.activeRec.onerror = null;
          this.activeRec.abort();
        } catch (e) {}
        this.activeRec = null;
      }
      if (this.mediaRec && this.mediaRec.state !== 'inactive') {
        try { this.mediaRec.stop(); } catch (e) {}
      }
      this.mediaRec = null;

      if (this.sourceNode) {
        try { this.sourceNode.disconnect(); } catch (e) {}
        this.sourceNode = null;
      }
      if (this.analyser) {
        try { this.analyser.disconnect(); } catch (e) {}
        this.analyser = null;
      }

      // CRITICAL FOR ANDROID & WINDOWS: Release microphone hardware immediately!
      if (this.activeStream) {
        try {
          this.activeStream.getTracks().forEach(function (track) {
            track.stop();
          });
        } catch (e) {}
        this.activeStream = null;
      }
      this.isListening = false;
    },

    start: function (opts) {
      this.stop();
      this.isListening = true;

      var self = this;
      var target = opts.target || '';
      var isSentence = opts.isSentence || false;
      var onVolume = opts.onVolume || function () {};
      var onResult = opts.onResult || function () {};
      var onSilenceAlert = opts.onSilenceAlert || function () {};
      var onRetry = opts.onRetry || function () {};
      var onError = opts.onError || function () {};

      var SpeechRec = (typeof window !== 'undefined') ? (window.SpeechRecognition || window.webkitSpeechRecognition || null) : null;
      var useNative = !this.isAndroid() && Boolean(SpeechRec);

      // DESKTOP: Native Chrome Web Speech API (zero mic locking, zero WASAPI AEC ducking)
      if (useNative) {
        try {
          var rec = new SpeechRec();
          rec.lang = 'en-US';
          rec.continuous = false;
          rec.interimResults = true;
          rec.maxAlternatives = 5;

          rec.onaudiostart = function () { onVolume(35); };
          rec.onsoundstart = function () { onVolume(70); };
          rec.onspeechstart = function () { onVolume(95); };
          rec.onspeechend = function () { onVolume(30); };
          rec.onaudioend = function () { onVolume(0); };

          rec.onresult = function (event) {
            if (!self.isListening) return;
            for (var i = event.resultIndex; i < event.results.length; ++i) {
              var res = event.results[i];
              for (var a = 0; a < res.length; a++) {
                var raw = (res[a].transcript || '').toLowerCase();
                var clean = raw.replace(/[^a-z0-9 ]/g, ' ').trim();
                onResult(clean, res.isFinal);
              }
            }
          };

          rec.onerror = function (e) {
            console.warn('Native SpeechRec error:', e);
            if (e.error === 'not-allowed') {
              onError('not-allowed');
            } else if (e.error === 'network' || e.error === 'audio-capture') {
              // Fallback to server Whisper STT if native service fails
              self.startServerSTT(opts);
            }
          };

          rec.onend = function () {
            if (self.isListening) {
              onRetry('');
            }
          };

          rec.start();
          this.activeRec = rec;
          return;
        } catch (e) {
          console.warn('SpeechRec start failed, falling back to Server STT:', e);
        }
      }

      // MOBILE (Android / iOS) or Fallback: MediaRecorder + Whisper STT
      this.startServerSTT(opts);
    },

    startServerSTT: function (opts) {
      var self = this;
      var target = opts.target || '';
      var isSentence = opts.isSentence || false;
      var onVolume = opts.onVolume || function () {};
      var onResult = opts.onResult || function () {};
      var onSilenceAlert = opts.onSilenceAlert || function () {};
      var onRetry = opts.onRetry || function () {};
      var onError = opts.onError || function () {};

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return onError('no_mediadevices');
      }

      var constraints = [
        { audio: { echoCancellation: true, autoGainControl: true, noiseSuppression: false } },
        { audio: true }
      ];

      function tryStream(idx) {
        if (idx >= constraints.length) return onError('no_mic_available');
        navigator.mediaDevices.getUserMedia(constraints[idx]).then(function (stream) {
          if (!self.isListening) {
            stream.getTracks().forEach(function (t) { t.stop(); });
            return;
          }
          self.activeStream = stream;
          self.recordStream(stream, opts);
        }).catch(function (err) {
          console.warn('getUserMedia try', idx, 'failed:', err);
          tryStream(idx + 1);
        });
      }
      tryStream(0);
    },

    recordStream: function (stream, opts) {
      var self = this;
      var target = opts.target || '';
      var isSentence = opts.isSentence || false;
      var onVolume = opts.onVolume || function () {};
      var onResult = opts.onResult || function () {};
      var onSilenceAlert = opts.onSilenceAlert || function () {};
      var onRetry = opts.onRetry || function () {};
      var onError = opts.onError || function () {};

      var mime = this.pickMime();
      var rec;
      try {
        rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch (e) {
        rec = new MediaRecorder(stream);
      }
      this.mediaRec = rec;
      var chunks = [];
      var recStart = Date.now();
      var speechDetected = false;
      var lastVoiceTs = 0;
      var voicedMs = 0;

      rec.ondataavailable = function (ev) {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      rec.onstop = function () {
        if (!self.isListening) return;
        var blob = new Blob(chunks, { type: mime || 'audio/webm' });
        if (blob.size < 800) {
          onRetry('');
          return;
        }

        var fd = new FormData();
        fd.append('audio', blob, 'child.webm');
        var hint = isSentence ? target.replace(/[.?!]/g, '').trim() : target;
        fd.append('hint', hint);

        fetch('/kidobits/stt', {
          method: 'POST',
          body: fd
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!self.isListening) return;
          var raw = (data && data.text) || '';
          var clean = raw.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();
          onResult(clean, true, data);
        })
        .catch(function () {
          if (self.isListening) onRetry('');
        });
      };

      try {
        rec.start(100);
      } catch (e) {
        console.warn('MediaRecorder start failed:', e);
      }

      // Web Audio Analyser
      try {
        var audioCtx = getAudioCtx();
        if (audioCtx) {
          var analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.3;
          var src = audioCtx.createMediaStreamSource(stream);
          src.connect(analyser);
          this.sourceNode = src;
          this.analyser = analyser;

          var freq = new Uint8Array(analyser.frequencyBinCount);
          var hzPerBin = (audioCtx.sampleRate || 48000) / 2 / freq.length;
          var lo = Math.max(1, Math.floor(200 / hzPerBin));
          var hi = Math.min(freq.length - 1, Math.ceil(3500 / hzPerBin));

          this.interval = setInterval(function () {
            if (!self.isListening) return;
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
            onVolume(pct);

            if (bandRms > 0.02 || avgLevel > 3.0) {
              speechDetected = true;
              lastVoiceTs = Date.now();
              voicedMs += 60;
            } else if (!speechDetected && (Date.now() - recStart > 1800)) {
              onSilenceAlert();
            }

            var dur = Date.now() - recStart;
            var pauseLimit = isSentence ? 1100 : 900;
            var maxDur = isSentence ? 7500 : 6000;

            if (speechDetected && (Date.now() - lastVoiceTs >= pauseLimit)) {
              if (rec.state !== 'inactive') rec.stop();
            } else if (dur >= maxDur) {
              if (rec.state !== 'inactive') rec.stop();
            }
          }, 60);
        }
      } catch (e) {
        console.warn('Web Audio Analyser error:', e);
      }
    }
  };

  /* =========================================================================
   * 4. LESSON ENGINE (State Machine with Guaranteed Transitions)
   * ========================================================================= */
  var Engine = {
    sessionId: null,
    lessonId: 'L1.01',
    levelId: 1,
    lessonData: null,
    item: null,
    step: 1,
    wordIdx: 0,
    words: ['at', 'sat', 'mat', 'pat', 'tap'],
    typed: [],
    scrambledPool: [],
    containerEl: null,
    completedSteps: [],
    stats: { streak: 7, gems: 1, coins: 240 },
    isAdvancing: false,
    lastStartAt: 0,

    start: function (opts) {
      opts = opts || {};
      var now = Date.now();
      if (now - this.lastStartAt < 600) return;
      this.lastStartAt = now;

      var target = opts.container || '#kb-lesson-viewport';
      this.containerEl = typeof target === 'string' ? document.querySelector(target) : target;
      if (!this.containerEl) {
        this.containerEl = document.getElementById('kb-lesson-viewport');
      }
      if (!this.containerEl) {
        console.warn('[Kidobits Engine] Target container not found:', target);
        return;
      }

      AudioPlayer.unlock();
      VoiceManager.stop();

      var lid = opts.lessonId || (typeof window !== 'undefined' && window.__KIDOBITS_LESSON_ID) || 'L1.01';
      this.lessonId = lid;
      this.openSession(lid);
    },

    openSession: function (lid) {
      var self = this;
      this.renderLoading();

      fetch(API_BASE + '/session/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lesson: lid })
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok) throw new Error('API session open failed');
        self.sessionId = data.session;
        self.lessonData = data;
        self.item = data.item || {};

        if (data.lesson && data.lesson.words && data.lesson.words.length) {
          self.words = data.lesson.words;
        } else if (self.item.word) {
          self.words = [self.item.word];
        }

        self.step = (self.item && self.item.step) ? self.item.step : 1;
        self.wordIdx = (self.item && self.item.index) ? self.item.index : 0;

        self.setupWordData();
        self.render();
        self.playInitialStepAudio();
      })
      .catch(function (err) {
        console.warn('openSession fallback to local:', err);
        self.initFallbackSession(lid);
      });
    },

    initFallbackSession: function (lid) {
      this.sessionId = 'local-' + Date.now();
      this.step = 1;
      this.wordIdx = 0;
      this.words = ['at', 'sat', 'mat', 'pat', 'tap'];
      this.setupWordData();
      this.render();
      this.playInitialStepAudio();
    },

    setupWordData: function () {
      var w = this.words[this.wordIdx] || 'at';
      this.typed = [];

      var letters = w.split('');
      var pool = letters.slice();
      var distractors = ['s', 'm', 'p', 't', 'a', 'b', 'c', 'f', 'h', 'r'];
      while (pool.length < Math.max(3, letters.length + 1)) {
        var d = distractors[Math.floor(Math.random() * distractors.length)];
        if (pool.indexOf(d) === -1) pool.push(d);
      }
      pool.sort(function () { return 0.5 - Math.random(); });
      this.scrambledPool = pool.map(function (ch, idx) {
        return { id: idx, ch: ch };
      });
    },

    renderLoading: function () {
      if (!this.containerEl) return;
      this.containerEl.innerHTML = '<div class="flex flex-col items-center justify-center min-h-[60vh] gap-3 font-sans"><div class="w-10 h-10 border-4 border-[#8B7CFF] border-t-transparent rounded-full animate-spin"></div><p class="text-sm font-extrabold text-[#7B7488]">กำลังโหลดบทเรียนโฟนิกส์…</p></div>';
    },

    /* =========================================================================
     * 5. RENDERING & UI (Pixel-Perfect Match to Theme)
     * ========================================================================= */
    render: function () {
      if (!this.containerEl) return;
      if (this.step === 6) {
        this.renderSummary();
        return;
      }

      var currentWord = (this.item && this.item.word) ? this.item.word : (this.words[this.wordIdx] || 'at');
      var totalWords = (this.item && this.item.total) ? this.item.total : this.words.length;
      var wordIndex = this.wordIdx + 1;

      var stepTitles = [
        'ฟังและระบุเสียงต้นคำ',
        'ผสมเสียงและสร้างคำ',
        'ฟังและเลือกคำที่ถูกต้อง',
        'อ่านออกเสียงคำนี้',
        'อ่านประโยค'
      ];
      var stepTitle = stepTitles[this.step - 1] || 'แบบฝึกหัดโฟนิกส์';

      var html = [];
      html.push('<div class="px-4 py-4 max-w-[430px] mx-auto select-none font-sans">');

      // Top Bar (Back button, Badge, Refresh button)
      html.push('  <div class="flex items-center justify-between gap-2 mb-3">');
      html.push('    <a href="/kidobits/theme/theme_phonicsHome.html" id="kb-back-btn" class="w-10 h-10 rounded-full bg-white border border-[#E5DEF0] shadow-sm flex items-center justify-center text-[#7B7488] font-bold text-sm hover:scale-105 active:scale-95 transition cursor-pointer">←</a>');
      html.push('    <div class="flex items-center gap-2">');
      html.push('      <span class="bg-[#8B7CFF] text-white text-xs font-black px-3 py-1.5 rounded-full shadow-sm">' + this.lessonId + ' • ' + currentWord + '</span>');
      html.push('      <span class="bg-[#FFF0F5] text-[#FF5B6A] border border-[#FFD6E8] text-[11px] font-extrabold px-2.5 py-1 rounded-full">🎧 มีเสียงแท้</span>');
      html.push('    </div>');
      html.push('    <button id="kb-refresh-btn" title="โหลดโจทย์ใหม่" class="w-10 h-10 rounded-full bg-white border border-[#E5DEF0] shadow-sm flex items-center justify-center text-[#7B7488] font-black text-lg hover:scale-105 active:scale-95 transition cursor-pointer">↺</button>');
      html.push('  </div>');

      // Step Progress Dots
      html.push('  <div class="flex justify-between items-center px-1 mb-4">');
      for (var s = 1; s <= 5; s++) {
        var isDone = this.completedSteps.indexOf(s) !== -1;
        var isCurrent = (this.step === s);
        var cls = isCurrent ? 'w-8 h-8 rounded-full bg-[#8B7CFF] text-white flex items-center justify-center font-black text-sm shadow-md ring-4 ring-[#8B7CFF]/30 scale-105 transition' :
                  isDone ? 'w-8 h-8 rounded-full bg-[#7ED9A8] text-white flex items-center justify-center font-black text-xs shadow-sm transition' :
                  'w-8 h-8 rounded-full bg-white border-2 border-[#E5DEF0] text-[#9A8FA8] flex items-center justify-center font-bold text-xs transition';
        html.push('    <button data-nav-step="' + s + '" class="kb-nav-step ' + cls + ' cursor-pointer">' + (isDone ? '✓' : s) + '</button>');
      }
      html.push('  </div>');

      // Main Card
      html.push('  <div id="kb-card" class="bg-white border-2 border-[#F1EAF7] rounded-[28px] p-5 shadow-[0_12px_40px_rgba(90,60,140,0.06)] text-center relative transition-all">');
      html.push('    <div id="kb-banner" class="bg-[#FAF7FD] text-[#8B7CFF] rounded-2xl py-2 px-3 mb-4 text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[#F3EDF8]">');
      html.push('      <span>🔊 แตะตรงนี้เพื่อฟังเสียงซ้ำ</span>');
      html.push('    </div>');

      html.push('    <div class="text-[11px] font-extrabold tracking-wider text-[#9A8FA8] uppercase mb-1">คำที่ ' + wordIndex + ' จาก ' + totalWords + ' • ' + stepTitle + '</div>');
      html.push('    <div class="flex items-center justify-center gap-2 mb-4">');
      html.push('      <span class="text-4xl font-black text-[#1B1B1F] tracking-wide">' + currentWord + '</span>');
      html.push('    </div>');

      // Step-specific body
      html.push(this.renderStepBody(currentWord));

      html.push('  </div>'); // /kb-card

      // Bottom Skip / Next Row
      html.push('  <div class="flex justify-between items-center mt-4 px-2 text-xs font-extrabold text-[#9A8FA8]">');
      html.push('    <button id="kb-prev-btn" class="hover:text-black transition cursor-pointer ' + (this.step === 1 && this.wordIdx === 0 ? 'opacity-0 pointer-events-none' : '') + '">← ย้อนกลับ</button>');
      html.push('    <span class="text-[11px]">เหรียญ: 🪙 ' + this.stats.coins + '</span>');
      html.push('    <button id="kb-skip-btn" class="hover:text-black transition cursor-pointer">ข้ามข้อนี้ →</button>');
      html.push('  </div>');

      html.push('</div>');

      this.containerEl.innerHTML = html.join('');
      this.bindEvents();
    },

    renderStepBody: function (currentWord) {
      var html = [];
      var step = this.step;

      if (step === 1 || step === 2) {
        html.push('  <p class="text-xs font-bold text-[#7B7488] mb-3">แตะตัวอักษรเพื่อผสมคำ (หรือแตะช่องคำตอบเพื่อปลดออก)</p>');
        html.push('  <div id="kb-slots-box" class="flex justify-center gap-2.5 my-4">');
        for (var i = 0; i < currentWord.length; i++) {
          html.push('    <div data-slot-idx="' + i + '" class="kb-slot-box w-14 h-16 rounded-2xl border-2 border-dashed border-[#C9C0D6] bg-slate-50 flex items-center justify-center text-3xl font-black text-[#8B7CFF] shadow-inner hover:border-[#8B7CFF] transition cursor-pointer">_</div>');
        }
        html.push('  </div>');
        html.push('  <div id="kb-letter-btns-box" class="flex flex-wrap justify-center gap-2.5 my-4">');
        this.scrambledPool.forEach(function (btnObj) {
          html.push('    <button data-btn-idx="' + btnObj.id + '" data-letter="' + btnObj.ch + '" class="kb-letter-btn w-13 h-13 rounded-2xl bg-[#FFF0F5] border border-[#FFD6E8] font-black text-2xl text-[#1B1B1F] shadow-sm hover:scale-105 active:scale-95 transition cursor-pointer">' + btnObj.ch + '</button>');
        });
        html.push('  </div>');
      } else if (step === 3) {
        html.push('  <p class="text-xs font-bold text-[#7B7488] mb-4">ฟังเสียงแล้วเลือกคำศัพท์ที่ถูกต้อง</p>');
        var choices = [currentWord];
        var distractors = this.words.filter(function (x) { return x !== currentWord; });
        while (choices.length < 3 && distractors.length > 0) {
          var pick = distractors.splice(Math.floor(Math.random() * distractors.length), 1)[0];
          choices.push(pick);
        }
        choices.sort(function () { return 0.5 - Math.random(); });
        html.push('  <div class="flex flex-col gap-2.5 max-w-[280px] mx-auto my-3">');
        choices.forEach(function (ch) {
          html.push('    <button data-choice="' + ch + '" class="kb-choice-btn w-full py-3.5 px-4 rounded-2xl bg-white border-2 border-[#F1EAF7] hover:border-[#8B7CFF] hover:bg-[#FAF7FD] text-lg font-black text-[#1B1B1F] shadow-sm hover:scale-[1.02] active:scale-95 transition cursor-pointer">' + ch + '</button>');
        });
        html.push('  </div>');
      } else if (step === 4) {
        html.push('  <p class="text-xs font-bold text-[#7B7488] mb-1">แตะไมค์แล้วออกเสียงคำนี้</p>');
        html.push('  <button id="kb-mic-btn" class="my-4 w-20 h-20 rounded-full bg-[#FF5B6A] text-white flex items-center justify-center mx-auto text-3xl shadow-lg active:scale-95 transition cursor-pointer hover:opacity-95">🎙️</button>');
        html.push('  <div class="w-48 mx-auto bg-[#E5DEF0] rounded-full h-2.5 overflow-hidden my-1">');
        html.push('    <div id="kb-mic-bar" class="bg-[#FF5B6A] h-full w-0 transition-all duration-75"></div>');
        html.push('  </div>');
        html.push('  <div id="kb-mic-status" class="text-xs font-extrabold text-[#7B7488] mt-2 transition min-h-[36px] flex items-center justify-center">แตะไมค์เพื่อพูดเลยจ้า 🎙️</div>');
      } else if (step === 5) {
        var sentText = (this.lessonId.startsWith('L1')) ? 'The cat sat on the mat.' : (this.item.sentence || this.item.word || 'The cat sat on the mat.');
        var words = sentText.replace(/[.?!]/g, '').split(/\s+/).filter(Boolean);
        html.push('  <p class="text-xs font-extrabold text-[#8B7CFF]">ขั้นที่ 5 • อ่านประโยค (แตะฟังทีละคำ หรือแตะไมค์เพื่ออ่านทั้งประโยค)</p>');
        html.push('  <div id="kb-sent-words-box" class="flex flex-wrap justify-center gap-2 my-3">');
        words.forEach(function (w, i) {
          html.push('    <span data-sent-word="' + i + '" data-word="' + w + '" class="kb-sent-word px-3.5 py-2 rounded-2xl font-black text-xl bg-[#F7F3FF] text-[#1B1B1F] border border-[#E5DEF0] shadow-sm hover:scale-105 active:scale-95 transition cursor-pointer">' + w + '</span>');
        });
        html.push('  </div>');
        html.push('  <div class="my-3 flex flex-col items-center justify-center">');
        html.push('    <button id="kb-mic-sent-btn" class="w-20 h-20 rounded-full bg-[#FF5B6A] text-white flex items-center justify-center text-3xl shadow-lg active:scale-95 transition cursor-pointer hover:opacity-95">🎙️</button>');
        html.push('    <div id="kb-sent-mic-bar-wrap" class="hidden w-48 bg-[#E5DEF0] rounded-full h-2.5 overflow-hidden mt-3 mb-1">');
        html.push('      <div id="kb-sent-mic-bar" class="bg-[#FF5B6A] h-full w-0 transition-all duration-75"></div>');
        html.push('    </div>');
        html.push('    <div id="kb-sent-mic-state" class="text-xs font-bold text-[#7B7488] min-h-[22px] transition flex items-center justify-center text-center mt-2">แตะไมค์แล้วอ่านออกเสียงทั้งประโยคได้เลย 🎙️</div>');
        html.push('  </div>');
        html.push('  <div class="flex items-center justify-center gap-3 mt-1">');
        html.push('    <button id="kb-read-sentence" class="bg-[#FFC93C] text-black px-5 py-2.5 rounded-full font-black text-xs shadow hover:opacity-95 transition cursor-pointer flex items-center gap-1.5">🔊 ฟังประโยคเต็ม</button>');
        html.push('    <button id="kb-finish-btn" class="bg-[#7ED9A8] text-white px-5 py-2.5 rounded-full font-black text-xs shadow hover:opacity-95 transition cursor-pointer flex items-center gap-1.5">ข้าม / จบ 🎉 →</button>');
        html.push('  </div>');
      }

      return html.join('');
    },

    renderSummary: function () {
      if (!this.containerEl) return;
      var html = [];
      html.push('<div class="px-5 pt-8 pb-24 max-w-[440px] mx-auto text-center select-none font-sans">');
      html.push('  <div class="w-24 h-24 bg-[#E8FFF0] border-4 border-[#7ED9A8] rounded-full flex items-center justify-center mx-auto text-5xl shadow-md animate-bounce">🏆</div>');
      html.push('  <h2 class="text-2xl font-black mt-4 text-[#1B1B1F]">สุดยอดมากเลยคนเก่ง!</h2>');
      html.push('  <p class="text-sm font-bold text-[#7B7488] mt-1">เรียนจบบทเรียน ' + this.lessonId + ' ครบทั้ง 5 ขั้นตอนแล้ว 🎉</p>');
      html.push('  <div class="grid grid-cols-3 gap-3 my-6">');
      html.push('    <div class="bg-white border-2 border-[#F1EAF7] rounded-2xl p-3 shadow-sm"><span class="text-2xl">⭐</span><b class="block text-lg font-black mt-1 text-[#FFC93C]">+50</b><span class="text-[11px] text-[#7B7488] font-bold">คะแนน</span></div>');
      html.push('    <div class="bg-white border-2 border-[#F1EAF7] rounded-2xl p-3 shadow-sm"><span class="text-2xl">🪙</span><b class="block text-lg font-black mt-1 text-[#FF7AB8]">+' + this.stats.coins + '</b><span class="text-[11px] text-[#7B7488] font-bold">เหรียญ</span></div>');
      html.push('    <div class="bg-white border-2 border-[#F1EAF7] rounded-2xl p-3 shadow-sm"><span class="text-2xl">💎</span><b class="block text-lg font-black mt-1 text-[#8B7CFF]">+1</b><span class="text-[11px] text-[#7B7488] font-bold">อัญมณี</span></div>');
      html.push('  </div>');
      html.push('  <a href="/kidobits/theme/theme_phonicsHome.html" id="kb-summary-home-btn" class="block w-full py-4 rounded-full bg-black text-white font-black text-sm shadow-lg hover:opacity-90 active:scale-95 transition cursor-pointer">กลับหน้ารวมบทเรียน ✦</a>');
      html.push('</div>');

      this.containerEl.innerHTML = html.join('');
      AudioPlayer.playSingle('/kidobits/audio/l2/prompt_lesson_done.mp3');
      var homeBtn = document.getElementById('kb-summary-home-btn');
      if (homeBtn) {
        homeBtn.addEventListener('click', function (e) {
          VoiceManager.stop();
          AudioPlayer.stop();
          if (typeof window !== 'undefined' && typeof window.__kbNavigate === 'function') {
            e.preventDefault();
            window.__kbNavigate('phonicsHome');
          }
        });
      }
    },

    /* =========================================================================
     * 6. EVENT BINDINGS & USER ACTIONS
     * ========================================================================= */
    bindEvents: function () {
      var self = this;
      if (!this.containerEl) return;

      // Back Button
      var backBtn = document.getElementById('kb-back-btn');
      if (backBtn) {
        backBtn.addEventListener('click', function (e) {
          VoiceManager.stop();
          AudioPlayer.stop();
          if (typeof window !== 'undefined' && typeof window.__kbNavigate === 'function') {
            e.preventDefault();
            window.__kbNavigate('phonicsHome');
          }
        });
      }

      // Refresh Button (Top Right)
      var refreshBtn = document.getElementById('kb-refresh-btn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', function () {
          VoiceManager.stop();
          AudioPlayer.stop();
          self.setupWordData();
          self.render();
          self.playInitialStepAudio();
        });
      }

      // Step Nav Dots
      var navDots = this.containerEl.querySelectorAll('.kb-nav-step');
      navDots.forEach(function (dot) {
        dot.addEventListener('click', function () {
          var s = parseInt(dot.getAttribute('data-nav-step'), 10);
          if (s) self.jumpToStep(s);
        });
      });

      // Top Banner (Replay prompt/word)
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

      // Step 1 & 2: Letter Slots (Tap slot to remove letter tile)
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

      // Step 1 & 2: Letter Tile Click
      if (this.step === 1 || this.step === 2) {
        var letterBtns = this.containerEl.querySelectorAll('.kb-letter-btn');
        letterBtns.forEach(function (btn) {
          btn.addEventListener('click', function () {
            var btnId = parseInt(btn.getAttribute('data-btn-idx'), 10);
            var ch = btn.getAttribute('data-letter');
            var currentWord = (self.item && self.item.word) ? self.item.word : (self.words[self.wordIdx] || 'at');

            if (self.typed.length >= currentWord.length) return;
            self.typed.push({ id: btnId, ch: ch });
            self.updateSlots();

            // Auto-check immediately when slots are full
            if (self.typed.length === currentWord.length) {
              var formed = self.typed.map(function (x) { return x.ch; }).join('').toLowerCase();
              if (formed === currentWord.toLowerCase()) {
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
              self.submitAnswer(choice);
            } else {
              self.handleWrong();
            }
          });
        });
      }

      // Step 4: Mic Button
      if (this.step === 4) {
        var micBtn = document.getElementById('kb-mic-btn');
        if (micBtn) {
          micBtn.addEventListener('click', function () {
            self.toggleMicStep4();
          });
        }
      }

      // Step 5: Sentence actions
      if (this.step === 5) {
        var readSent = document.getElementById('kb-read-sentence');
        if (readSent) {
          readSent.addEventListener('click', function () {
            self.playSentence();
          });
        }
        var micSentBtn = document.getElementById('kb-mic-sent-btn');
        if (micSentBtn) {
          micSentBtn.addEventListener('click', function () {
            self.toggleMicStep5();
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
              AudioPlayer.playSingle('/kidobits/v2/audio/word_' + raw + '.mp3', function () {
                ws.classList.remove('bg-[#FFC93C]', 'scale-110');
              });
            }
          });
        });
      }

      // Next / Skip / Prev
      var skipBtn = document.getElementById('kb-skip-btn');
      if (skipBtn) {
        skipBtn.addEventListener('click', function () {
          VoiceManager.stop();
          self.advanceSubItem();
        });
      }
      var prevBtn = document.getElementById('kb-prev-btn');
      if (prevBtn) {
        prevBtn.addEventListener('click', function () {
          VoiceManager.stop();
          if (self.wordIdx > 0) {
            self.wordIdx--;
            self.setupWordData();
            self.render();
            self.playInitialStepAudio();
          } else if (self.step > 1) {
            self.jumpToStep(self.step - 1);
          }
        });
      }
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

    /* =========================================================================
     * 7. CORE GAME STATE TRANSITIONS (Guaranteed Auto-Next)
     * ========================================================================= */
    submitAnswer: function (answer) {
      if (this.isAdvancing) return;
      this.isAdvancing = true;
      var self = this;

      VoiceManager.stop();

      // Visual success feedback
      var card = document.getElementById('kb-card');
      if (card) card.classList.add('ring-4', 'ring-[#7ED9A8]');
      var banner = document.getElementById('kb-banner');
      if (banner) {
        banner.innerHTML = '<span>ถูกต้องแล้ว! เก่งมาก ✓ +10 เหรียญ</span> 🎉';
        banner.classList.remove('bg-[#FAF7FD]', 'text-[#8B7CFF]');
        banner.classList.add('bg-[#D9F8E7]', 'text-[#1B9A62]');
      }

      this.stats.coins += 10;
      if (typeof global.__kbAddReward === 'function') {
        global.__kbAddReward(10, 5);
      }

      // Background non-blocking sync with server
      if (this.sessionId && !this.sessionId.startsWith('local-')) {
        fetch(API_BASE + '/session/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session: this.sessionId, input: answer })
        }).catch(function () {});
      }

      // GUARANTEED AUTO-ADVANCE: Plays praise, advances strictly on time
      var advanced = false;
      function doAdvance() {
        if (advanced) return;
        advanced = true;
        self.advanceSubItem();
      }

      AudioPlayer.playSingle('/kidobits/v2/audio/praise_great.mp3', function () {
        setTimeout(doAdvance, 350);
      });
      // Safety watchdog: always auto-advance in 1.8s even if audio muted or blocked
      setTimeout(doAdvance, 1800);
    },

    advanceSubItem: function () {
      this.isAdvancing = false;
      var totalItems = (this.item && this.item.total) ? this.item.total : this.words.length;

      // More words in this step (e.g. at -> cat -> mat -> pat -> tap)
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
        this.playInitialStepAudio();
      } else {
        // Step Complete! Move to next step
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
      AudioPlayer.stop();
      VoiceManager.stop();
      this.step = s;
      this.wordIdx = 0;
      var w = this.words[0] || 'at';
      this.item = {
        step: s,
        index: 0,
        word: w,
        total: this.words.length,
        letters: w.split('')
      };
      this.setupWordData();
      this.render();
      this.playInitialStepAudio();
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
        banner.classList.remove('bg-[#FAF7FD]', 'text-[#8B7CFF]');
        banner.classList.add('bg-[#FFE0E8]', 'text-[#E85A8A]');
      }

      AudioPlayer.playSingle('/kidobits/v2/audio/try_again.mp3', function () {
        self.typed = [];
        self.updateSlots();
      });
    },

    /* =========================================================================
     * 8. STEP 4 & 5 VOICE INTERACTION
     * ========================================================================= */
    toggleMicStep4: function () {
      var self = this;
      var statusEl = document.getElementById('kb-mic-status');
      var micBtn = document.getElementById('kb-mic-btn');
      var micBar = document.getElementById('kb-mic-bar');
      var targetWord = (self.item && self.item.word) ? self.item.word : (self.words[self.wordIdx] || 'at');

      if (VoiceManager.isListening) {
        VoiceManager.stop();
        if (micBtn) {
          micBtn.className = 'my-4 w-20 h-20 rounded-full bg-[#FF5B6A] text-white flex items-center justify-center mx-auto text-3xl shadow-lg active:scale-95 transition cursor-pointer hover:opacity-95';
          micBtn.textContent = '🎙️';
        }
        if (micBar) micBar.style.width = '0%';
        if (statusEl) statusEl.textContent = 'แตะไมค์เพื่อพูดใหม่ได้เลยจ้า 🎙️';
        return;
      }

      if (micBtn) micBtn.classList.add('animate-pulse', 'scale-110', 'ring-4', 'ring-[#FF5B6A]/40');
      if (statusEl) {
        statusEl.innerHTML = 'กำลังฟัง… พูดคำว่า <b class="text-black text-sm">"' + targetWord + '"</b> ได้เลย 🎙️';
        statusEl.className = 'text-xs font-black text-[#FF5B6A] mt-2 transition min-h-[36px] flex items-center justify-center';
      }

      VoiceManager.start({
        target: targetWord,
        isSentence: false,
        onVolume: function (pct) {
          if (micBar) micBar.style.width = pct + '%';
        },
        onResult: function (cleanText, isFinal) {
          if (cleanText && statusEl) {
            statusEl.innerHTML = 'หนูพูดว่า: <b class="text-black text-sm">"' + cleanText + '"</b>';
          }
          if (matchWord(cleanText, targetWord)) {
            VoiceManager.stop();
            if (micBtn) {
              micBtn.className = 'my-4 w-20 h-20 rounded-full bg-[#7ED9A8] text-white flex items-center justify-center mx-auto text-3xl shadow-lg transition';
              micBtn.textContent = '✓';
            }
            if (micBar) micBar.style.width = '100%';
            if (statusEl) {
              statusEl.innerHTML = '<span class="text-[#1B9A62] font-black text-sm">✅ หนูอ่านว่า "' + cleanText + '" — เก่งมาก! (+10 เหรียญ)</span>';
            }
            self.submitAnswer(targetWord);
          } else if (isFinal) {
            VoiceManager.stop();
            if (micBtn) {
              micBtn.className = 'my-4 w-20 h-20 rounded-full bg-[#FF5B6A] text-white flex items-center justify-center mx-auto text-3xl shadow-lg active:scale-95 transition cursor-pointer hover:opacity-95';
              micBtn.textContent = '🎙️';
            }
            if (statusEl) {
              statusEl.textContent = cleanText ? ('ได้ยินว่า "' + cleanText + '" — ลองอีกครั้งนะ 🙂') : 'ไม่ได้ยินชัด ๆ — ลองพูดอีกครั้งนะ 🙂';
            }
            AudioPlayer.playSingle('/kidobits/v2/audio/try_again.mp3', function () {
              setTimeout(function () {
                if (self.step === 4 && !VoiceManager.isListening && !self.isAdvancing) {
                  self.toggleMicStep4();
                }
              }, 400);
            });
          }
        },
        onSilenceAlert: function () {
          if (statusEl) {
            statusEl.innerHTML = '⚠️ <span class="text-[#FF5B6A] font-extrabold">ไมค์ไม่ได้รับสัญญาณเสียง (RMS: 0.00)</span><br><span class="text-[11px] text-[#7B7488]">ตรวจเช็คปุ่ม Mute / ไมค์ใน Windows หรือแตะข้ามข้อได้ค่ะ</span>';
          }
        },
        onRetry: function () {
          VoiceManager.stop();
          if (micBtn) {
            micBtn.className = 'my-4 w-20 h-20 rounded-full bg-[#FF5B6A] text-white flex items-center justify-center mx-auto text-3xl shadow-lg active:scale-95 transition cursor-pointer hover:opacity-95';
            micBtn.textContent = '🎙️';
          }
          if (micBar) micBar.style.width = '0%';
        },
        onError: function (err) {
          VoiceManager.stop();
          if (statusEl) {
            statusEl.innerHTML = '⚠️ เบราว์เซอร์ยังไม่ได้อนุญาตไมโครโฟน <br><span class="text-[#7B7488]">แตะปุ่ม "ข้ามข้อนี้" ได้เลยค่ะ</span>';
          }
        }
      });
    },

    toggleMicStep5: function () {
      var self = this;
      var micSentBtn = document.getElementById('kb-mic-sent-btn');
      var barWrap = document.getElementById('kb-sent-mic-bar-wrap');
      var micBar = document.getElementById('kb-sent-mic-bar');
      var stateEl = document.getElementById('kb-sent-mic-state');
      var sentWordEls = this.containerEl.querySelectorAll('.kb-sent-word');
      var sentText = (this.lessonId.startsWith('L1')) ? 'The cat sat on the mat.' : (this.item.sentence || this.item.word || 'The cat sat on the mat.');

      if (VoiceManager.isListening) {
        VoiceManager.stop();
        if (micSentBtn) {
          micSentBtn.className = 'w-20 h-20 rounded-full bg-[#FF5B6A] text-white flex items-center justify-center text-3xl shadow-lg active:scale-95 transition cursor-pointer hover:opacity-95';
          micSentBtn.textContent = '🎙️';
        }
        if (barWrap) barWrap.classList.add('hidden');
        if (micBar) micBar.style.width = '0%';
        if (stateEl) stateEl.textContent = 'แตะไมค์เพื่อเริ่มอ่านใหม่ได้เลย 🎙️';
        return;
      }

      if (micSentBtn) {
        micSentBtn.className = 'w-20 h-20 rounded-full bg-[#FF5B6A] text-white flex items-center justify-center text-3xl shadow-lg transition cursor-pointer animate-pulse scale-110 ring-4 ring-[#FF5B6A]/40';
        micSentBtn.textContent = '⏹️';
      }
      if (barWrap) barWrap.classList.remove('hidden');
      if (stateEl) {
        stateEl.innerHTML = 'กำลังฟัง… หนูอ่านประโยคนี้ได้เลย 🎙️';
        stateEl.className = 'text-xs font-bold text-[#FF5B6A] min-h-[22px] transition flex items-center justify-center text-center';
      }

      VoiceManager.start({
        target: sentText,
        isSentence: true,
        onVolume: function (pct) {
          if (micBar) micBar.style.width = pct + '%';
        },
        onResult: function (cleanText, isFinal) {
          if (cleanText && stateEl) {
            stateEl.innerHTML = 'หนูอ่านว่า: <b class="text-black text-sm">"' + cleanText + '"</b>';
          }
          var sc = scoreSentence(sentText, cleanText);
          var plainTarget = sentText.toLowerCase().replace(/[^a-z ]/g, '').trim();

          if (cleanText && (sc.ratio >= 0.6 || cleanText.indexOf(plainTarget) !== -1)) {
            VoiceManager.stop();
            sentWordEls.forEach(function (el) {
              el.className = 'kb-sent-word px-3.5 py-2 rounded-2xl font-black text-xl bg-[#E8FFF0] text-[#1B9A62] border-2 border-[#7ED9A8] shadow-md transition scale-105';
            });
            if (micSentBtn) {
              micSentBtn.className = 'w-20 h-20 rounded-full bg-[#7ED9A8] text-white flex items-center justify-center text-3xl shadow-lg transition';
              micSentBtn.textContent = '✓';
            }
            if (stateEl) {
              stateEl.innerHTML = '<span class="text-[#1B9A62] font-black text-sm">✅ หนูอ่านประโยคได้เก่งมาก! (+20 เหรียญ)</span>';
            }
            self.stats.coins += 20;

            var advanced = false;
            function doFinish() {
              if (advanced) return;
              advanced = true;
              if (self.step === 5) {
                self.step = 6;
                self.render();
              }
            }
            AudioPlayer.playSingle('/kidobits/v2/audio/praise_great.mp3', function () {
              setTimeout(doFinish, 400);
            });
            setTimeout(doFinish, 1900);
          } else if (isFinal) {
            VoiceManager.stop();
            if (micSentBtn) {
              micSentBtn.className = 'w-20 h-20 rounded-full bg-[#FF5B6A] text-white flex items-center justify-center text-3xl shadow-lg active:scale-95 transition cursor-pointer hover:opacity-95';
              micSentBtn.textContent = '🎙️';
            }
            if (stateEl) {
              stateEl.textContent = cleanText ? ('ได้ยินว่า "' + cleanText + '" — ลองอีกครั้งนะ 🙂') : 'ไม่ได้ยินชัด ๆ — ลองพูดอีกครั้งนะ 🙂';
            }
            AudioPlayer.playSingle('/kidobits/v2/audio/try_again.mp3', function () {
              setTimeout(function () {
                if (self.step === 5 && !VoiceManager.isListening) {
                  self.toggleMicStep5();
                }
              }, 400);
            });
          }
        },
        onSilenceAlert: function () {
          if (stateEl) {
            stateEl.innerHTML = '⚠️ <span class="text-[#FF5B6A] font-extrabold">ไมค์ไม่ได้รับสัญญาณเสียง (RMS: 0.00)</span><br><span class="text-[11px] text-[#7B7488]">ตรวจเช็คปุ่ม Mute / ไมค์ใน Windows หรือแตะปุ่มข้ามได้ค่ะ</span>';
          }
        },
        onRetry: function () {
          VoiceManager.stop();
          if (micSentBtn) {
            micSentBtn.className = 'w-20 h-20 rounded-full bg-[#FF5B6A] text-white flex items-center justify-center text-3xl shadow-lg active:scale-95 transition cursor-pointer hover:opacity-95';
            micSentBtn.textContent = '🎙️';
          }
          if (barWrap) barWrap.classList.add('hidden');
        },
        onError: function () {
          VoiceManager.stop();
          if (stateEl) stateEl.innerHTML = '⚠️ เบราว์เซอร์ยังไม่ได้อนุญาตไมโครโฟน';
        }
      });
    },

    /* =========================================================================
     * 9. AUDIO PLAYBACK ROUTING
     * ========================================================================= */
    playInitialStepAudio: function () {
      var self = this;
      if (this.step === 4) {
        this.playTargetWord(function () {
          setTimeout(function () {
            if (self.step === 4 && !VoiceManager.isListening) {
              self.toggleMicStep4();
            }
          }, 350);
        });
      } else if (this.step === 5) {
        this.playSentence();
      } else {
        this.playTargetWord();
      }
    },

    playTargetWord: function (onDone) {
      var w = (this.item && this.item.word) ? this.item.word : (this.words[this.wordIdx] || 'at');
      AudioPlayer.playSingle('/kidobits/v2/audio/word_' + w + '.mp3', onDone);
    },

    playSentence: function (onDone) {
      var sentWords = (this.lessonId.startsWith('L1')) ? ['the', 'cat', 'sat', 'on', 'the', 'mat'] : ['the', 'cat', 'sat', 'on', 'the', 'mat'];
      var urls = sentWords.map(function (w) { return '/kidobits/v2/audio/word_' + w + '.mp3'; });
      AudioPlayer.playQueue(urls, null, onDone);
    }
  };

  global.KidobitsLessonEngine = Engine;

  // Zero-friction audio unlock on any interaction
  if (typeof window !== 'undefined') {
    window.addEventListener('pointerdown', function() { AudioPlayer.unlock(); }, { capture: true, passive: true });
    window.addEventListener('click', function() { AudioPlayer.unlock(); }, { capture: true, passive: true });
    window.addEventListener('touchstart', function() { AudioPlayer.unlock(); }, { capture: true, passive: true });
  }

  // Auto-start watcher for #kb-lesson-viewport
  function autoStartLessonWatcher() {
    var vp = document.getElementById('kb-lesson-viewport');
    if (vp && (!Engine.sessionId || !Engine.containerEl || !Engine.containerEl.querySelector('.select-none'))) {
      var p = new URLSearchParams(window.location.search);
      var lid = p.get('lesson') || window.__DEFAULT_LESSON__ || window.__KIDOBITS_LESSON_ID || 'L2.01';
      console.log('[Kidobits Engine] Auto starting for lesson:', lid);
      Engine.start({ container: vp, lessonId: lid });
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', autoStartLessonWatcher);
    } else {
      setTimeout(autoStartLessonWatcher, 300);
    }
    setInterval(autoStartLessonWatcher, 800);
  }

  // Lesson card click delegation: seamless navigation to lesson player
  if (typeof document !== 'undefined') {
    document.addEventListener('click', function(e) {
      var target = e.target;
      var btn = target.closest ? target.closest('button') : null;
      if (!btn) return;
      var txt = btn.innerText || '';
      if (txt.includes('แตะเพื่อเล่น →')) {
        e.preventDefault();
        e.stopPropagation();
        var match = txt.match(/(\d+)\s*\n/);
        var n = match ? parseInt(match[1]) : 1;
        var bodyText = (document.body && document.body.innerText) || '';
        var levelMatch = bodyText.match(/ระดับ\s*(\d+)/i) || bodyText.match(/LEVEL\s*(\d+)/i);
        var lvl = levelMatch ? parseInt(levelMatch[1]) : 2;
        var lid = 'L' + lvl + '.' + (n < 10 ? '0' + n : n);
        console.log('[Kidobits] Navigating to lesson:', lid);
        window.location.href = '/kidobits/theme/theme_phonicsLesson.html?lesson=' + lid;
      }
    }, true);
  }

})(typeof window !== 'undefined' ? window : this);
