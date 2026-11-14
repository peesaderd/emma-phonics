/*!
 * kb-lesson.js — Phonics Lesson Engine (standalone module)
 * ไม่แตะ HTML เดิม: ทำงานผ่าน DOM + window.__kbLesson
 *
 * เจ้าของหน้าที่:
 *   LessonState  — step/index/total (คำถาม+คำตอบ)
 *   AudioQueue   — auto play ต่อเนื่อง ไม่ตัดกัน
 *   Praise       — "Good job!" เท่านั้น
 *   Advancer     — auto next หลังตอบถูก (lock + fingerprint)
 *
 * API: /kidobits/api  (emma-phonics :8116)
 */
(function (global) {
  'use strict';
  if (global.__kbLesson) return;

  var API = '/kidobits/api';
  var LESSON = 'L1.01';         /* จะ override อัตโนมัติถ้าหาได้จากหน้า */
  var PRAISE = 'Good job!';
  var PRAISE_MP3 = '/kidobits/v2/audio/praise_great.mp3';

  /* ---------- utils ---------- */
  function vis(el) {
    if (!el || el.offsetParent === null) {
      if (!el || getComputedStyle(el).position !== 'fixed') return false;
    }
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    var s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) !== 0;
  }
  function visibleButtons() {
    return [].slice.call(document.querySelectorAll('button')).filter(vis);
  }
  function btnText(b) { return (b.innerText || '').replace(/\n/g, ' ').trim(); }
  function bodyText() { return document.body ? document.body.innerText : ''; }

  /* root ของแท็บที่กำลังเปิด: การ์ดที่มีหัวข้อ "ขั้นที่ N • ..."
     คืน element การ์ด ไม่ใช่ทั้งหน้า — เพราะหน้าเก็บทุกแท็บไว้ใน DOM */
  function currentCard() {
    /* การ์ดจริงของระบบเดิม = div.bg-white.border-2.border-[#F1EAF7].rounded-[24px]
       ยึด class ตรง ๆ ไม่เดาจากขนาด (เดิมเดาขนาด → หลุดไปหยิบหน้า/body) */
    var all = document.querySelectorAll('div');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var cls = (el.className || '').toString();
      if (!/rounded-\[24px\]/.test(cls)) continue;
      if (!/border-\[#F1EAF7\]/i.test(cls)) continue;
      if (!vis(el)) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 200) continue;
      return el;
    }
    return null;
  }
  /* แท็บ 3 (ฟังเลือกคำ): คำที่ผู้เล่นเลือก = ปุ่มใน-card ที่มีสีพื้นหลังต่าง
     ตรวจจาก style/class ที่ระบบเดิมใช้ไฮไลต์ */
  function selectedWord() {
    var card = currentCard();
    if (!card) return '';
    var bs = [].slice.call(card.querySelectorAll('button')).filter(vis);
    var picks = [];
    for (var i = 0; i < bs.length; i++) {
      var tx = btnText(bs[i]);
      if (!/^[a-z]{2,10}$/.test(tx)) continue;
      var cs = getComputedStyle(bs[i]);
      var bg = cs.backgroundColor || '';
      var bd = cs.borderColor || '';
      var cls = bs[i].className || '';
      var marked = /selected|active|chosen|correct|picked|ring/i.test(cls)
                || !!bs[i].getAttribute('aria-pressed') && bs[i].getAttribute('aria-pressed') === 'true'
                || /rgb\((?!255, 255, 255)/.test(bg)
                || (cs.borderWidth && parseFloat(cs.borderWidth) >= 3);
      if (marked) picks.push(tx);
    }
    return picks.length === 1 ? picks[0] : '';
  }
  /* ข้อความเฉพาะแท็บปัจจุบัน
     สำคัญ: หาการ์ดไม่ได้ = "" (ห้ามใช้ทั้งหน้า เพราะจะเห็นข้อความแท็บอื่น) */
  function cardText() {
    var c = currentCard();
    if (!c) return '';
    var tx = c.innerText || '';
    /* การ์ดที่ใหญ่เกินครึ่งจอ = ไม่ใช่การ์ด ให้ถือว่าไม่เจอ */
    var r = c.getBoundingClientRect();
    if (r.height > (window.innerHeight * 0.6)) return '';
    return tx;
  }
  function log() {
    try { console.log.apply(console, ['KBLESSON:'].concat([].slice.call(arguments))); } catch (e) {}
  }
  function post(path, data) {
    return fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (r) { return r.json(); });
  }
  function get(path) {
    return fetch(API + path).then(function (r) { return r.json(); });
  }

  /* ---------- 1) LessonState : ระบบคำถาม ---------- */
  var State = {
    lesson: LESSON,
    step: 0,
    index: 0,
    total: 0,
    words: [],
    ready: false,
    detectStep: function () {
      var m = bodyText().match(/ขั้นที่\s*(\d)\s*[•·]/);
      return m ? parseInt(m[1], 10) : 0;
    },
    load: function (step) {
      var self = this;
      return get('/lesson/' + this.lesson).then(function (d) {
        var s = (d.steps || []).filter(function (x) { return x.step === step; })[0];
        if (!s) return self;
        self.step = step;
        self.total = s.count || 0;
        self.words = s.words || [];
        self.ready = true;
        log('state step=' + step + ' total=' + self.total);
        return self;
      }).catch(function (e) { log('load-fail ' + e); return self; });
    }
  };

  /* ---------- 2) AudioQueue : auto play ---------- */
  var AudioQueue = {
    el: null,
    token: 0,
    list: [],
    play: function (list, onDone) {
      var self = this;
      this.stop();
      var my = this.token;
      var i = 0;
      function next() {
        if (my !== self.token) return;
        if (i >= list.length) {
          self.el = null;
          log('audio done');
          if (onDone) { try { onDone(); } catch (e) {} }
          return;
        }
        var url = list[i++];
        var a = new Audio(url);
        self.el = a;
        self.startedAt = Date.now();
        var advanced = false;
        function go() {
          if (advanced || my !== self.token) return;
          advanced = true;
          try { a.onended = null; a.onerror = null; } catch (e) {}
          next();
        }
        a.onended = go;
        a.onerror = function () { log('audio-error ' + url.split('/').pop()); go(); };
        var pr = a.play();
        if (pr && pr.catch) pr.catch(function (e) { log('audio-blocked ' + e.name); go(); });
        log('audio-play ' + url.split('/').pop());
      }
      next();
    },
    stop: function () {
      this.token++;
      this.list = [];
      if (this.el) {
        try {
          this.el.onended = null;
          this.el.onerror = null;
          this.el.pause();
        } catch (e) {}
        this.el = null;
      }
    },
    /* ตรวจจากของจริง: ต้องยังไม่จบจริง ๆ เท่านั้น */
    startedAt: 0,
    isPlaying: function () {
      try {
        if (!this.el) return false;
        if (this.el.ended) { this.el = null; this.startedAt = 0; return false; }
        if (this.el.paused) { this.el = null; this.startedAt = 0; return false; }
        var d = this.el.duration;
        var c = this.el.currentTime;
        if (d && isFinite(d) && c >= d - 0.15) { this.el = null; this.startedAt = 0; return false; }
        /* กันค้างเด็ดขาด: ห้ามเกิน 20 วิ */
        if (this.startedAt && Date.now() - this.startedAt > 20000) {
          log('audio-timeout');
          try { this.el.pause(); } catch (e) {}
          this.el = null; this.startedAt = 0;
          return false;
        }
        return true;
      } catch (e) { return false; }
    }
  };

  /* ---------- 3) Praise ---------- */
  var Praise = {
    say: function (text) {
      var t = text || PRAISE;
      /* ใช้ hook เดิมของหน้า: ใส่ข้อความ "ฟัง: ..." ไม่ได้ — ใช้ element ชั่วคราวแทน */
      AudioQueue.play([PRAISE_MP3]);
      log('praise ' + t);
      return t;
    }
  };

  /* ---------- 4) ระบบคำตอบ (ผ่าน API) ---------- */
  var Checker = {
    check: function (text) {
      return post('/check', {
        lesson: State.lesson,
        step: State.step,
        index: State.index,
        input: text          /* API ใช้ชื่อ field ว่า input */
      });
    }
  };

  /* อ่านคำที่เด็กเรียงได้จากช่องบนการ์ด (แท็บ 1/2) */
  function composedText() {
    var card = currentCard();
    if (!card) return '';
    /* ช่องคำตอบ = span ที่มีพื้นหลัง F0EFFF (ช่องที่เติมแล้ว) หรือเส้นประ (ช่องว่าง)
       ไม่ใช่ปุ่มตัวอักษร (bg-FFF0F5) */
    var spans = card.querySelectorAll('span');
    var out = '';
    for (var i = 0; i < spans.length; i++) {
      var s = (spans[i].innerText || '').trim();
      if (!s || s === '_') continue;
      if (!/^[a-zA-Z]$/.test(s)) continue;
      var cls = spans[i].className || '';
      if (/F0EFFF/i.test(cls)) out += s.toLowerCase();   /* ช่องที่เติมแล้ว */
    }
    return out;
  }

  /* ---------- 5) Advancer : auto next ---------- */
  var Advancer = {
    handled: {},
    lastClickAt: Date.now(),
    lastCheckAt: 0,
    pending: false,
    fingerprint: function () {
      var step = State.step || State.detectStep() || 0;
      var card = currentCard();
      var bs = (card ? [].slice.call(card.querySelectorAll('button')) : visibleButtons()).filter(vis);
      var letters = [], opts = [];
      bs.forEach(function (b) {
        var s = btnText(b);
        if (b.hasAttribute('data-kbcheck') || b.hasAttribute('data-kbreset')) return;
        if (/^[a-z]$/.test(s)) letters.push(s);
        else if (/^[a-z]{2,6}$/.test(s)) opts.push(s);
      });
      if (step === 1 || step === 2) return step + '|' + State.index + '|' + composedText();
      if (step === 3) {
        /* ตัวเลือกเป็นชุดเดิมทุกข้อ → ต้องรวม "คำที่ N" ด้วย */
        var m3 = cardText().match(/คำที่\s*(\d+)\s*จาก/);
        return step + '|' + (m3 ? m3[1] : '?') + '|' + opts.sort().join(',');
      }
      if (step === 4) {
        var m4 = cardText().match(/ลองพูด:\s*\n?\s*([a-zA-Z'-]+)/);
        return step + '|' + (m4 ? m4[1] : '');
      }
      var m5 = cardText().match(/คำที่\s*(\d+)\s*จาก\s*(\d+)/);
      return step + '|' + (m5 ? m5[1] + '/' + m5[2] : '');
    },
    nextButton: function () {
      var pats = [
        /^รับ \+10 เหรียญ → ขั้นต่อไป$/,
        /^ไปขั้นที่ 5 →$/,
        /^ต่อไป\s*→$/,
        /^ข้อต่อไป\s*→$/,
        /^ไปข้อถัดไป/
      ];
      /* ปุ่มนำทางอยู่ "นอกการ์ด" (แถบล่างของหน้า) → ต้องหาทั้งหน้า */
      var bs = visibleButtons();
      for (var p = 0; p < pats.length; p++) {
        for (var i = 0; i < bs.length; i++) {
          if (pats[p].test(btnText(bs[i]))) return bs[i];
        }
      }
      return null;
    },
    correctShown: function () {
      /* อ่านเฉพาะการ์ดของแท็บปัจจุบัน — ข้อความ "ถูกต้อง" ของแท็บอื่นค้างใน DOM */
      return /ถูกต้อง|เก่งมาก|Good job/.test(cardText());
    },
    /* กด "ตรวจคำตอบ ✓" ให้เองเมื่อช่องตัวอักษรครบคำ (แท็บ 2) */
    tapCheck: function () {
      var card = currentCard();
      var bs = (card ? [].slice.call(card.querySelectorAll('button')) : visibleButtons()).filter(vis);
      var chk = null;
      for (var i = 0; i < bs.length; i++) {
        if (/^ตรวจคำตอบ/.test(btnText(bs[i]))) { chk = bs[i]; break; }
      }
      if (!chk) { if (window.__kbLessonDebug) log('tap-nochk'); return false; }
      if (chk.hasAttribute('data-kbnoauto')) return false;
      var now = Date.now();
      var lc = (this.lastCheckAt === undefined) ? 0 : this.lastCheckAt;
      if (now - lc < 1500) { if (window.__kbLessonDebug) log('tap-cooldown ' + (now - lc)); return false; }
      this.lastCheckAt = now;
      chk.click();
      log('tap-check');
      return true;
    },
    /* ปุ่มไปข้อถัดไป "ภายในขั้น" (ไม่ใช่เปลี่ยนขั้น) */
    nextItemButton: function () {
      var pats = [/^ข้อต่อไป/, /^คำต่อไป\s*→$/, /^ถัดไป\s*→$/, /^ต่อไป\s*▶$/, /^▶$/];
      var bs = visibleButtons();
      for (var p = 0; p < pats.length; p++) {
        for (var i = 0; i < bs.length; i++) {
          if (pats[p].test(btnText(bs[i]))) return bs[i];
        }
      }
      return null;
    },
    btnTextInCard: function (card) {
      if (!card) return '';
      var bs = [].slice.call(card.querySelectorAll('button')).filter(vis);
      return bs.map(btnText).join('|');
    },
    advanceNow: function (fp) {
      if (window.__kbLessonDebug) log('advanceNow ' + fp + ' idx=' + State.index + '/' + State.words.length);
      /* ถ้ายังเหลือข้อในขั้นนี้ → ไปข้อถัดไปก่อน อย่าข้ามขั้น */
      if (State.index < State.words.length - 1) {
        var ib = this.nextItemButton();
        if (ib) {
          this.handled[fp] = true;
          this.lastClickAt = Date.now();
          this.pending = true;
          var sf = this;
          log('advance-item ' + fp + ' btn=' + btnText(ib));
          State.index = State.index + 1;          /* เดินข้อจริงด้วย */
          setTimeout(function () {
            sf.pending = false;
            ib.click();
            sf.lastClickAt = Date.now();
            log('advance-item-clicked -> idx=' + State.index);
          }, 800);
          return;
        }
        /* ไม่มีปุ่ม "คำต่อไป" ในขั้น → ต้องหาปุ่มเลื่อนข้ออื่น (chevron, ›, →) */
        var ib2 = null;
        var c2 = currentCard();
        var cb = (c2 ? [].slice.call(c2.querySelectorAll('button')) : []).filter(vis);
        for (var k = 0; k < cb.length; k++) {
          var bt = btnText(cb[k]);
          if (/^[›>»→]$/.test(bt) || /คำถัดไป|ข้อถัดไป|ถัดไป/.test(bt)) { ib2 = cb[k]; break; }
        }
        if (ib2) {
          this.handled[fp] = true;
          this.lastClickAt = Date.now();
          this.pending = true;
          var s3 = this;
          log('advance-next ' + fp + ' btn=' + btnText(ib2));
          State.index = State.index + 1;
          setTimeout(function () {
            s3.pending = false; ib2.click(); s3.lastClickAt = Date.now();
            log('advance-next-clicked -> idx=' + State.index);
          }, 800);
          return;
        }
        /* ไม่มีปุ่มเลื่อนในขั้น → กด "ตรวจคำตอบ" ให้หน้าเดิมจัดการเอง
           ต้นฉบับ: ตรวจถูกแล้วหน้าเดิม render ปุ่ม "ข้อต่อไป →" ขึ้นมาเอง
           → กดตรวจก่อน แล้วปล่อยให้ tick ถัดไปกดปุ่มนั้น (ห้าม return เฉย ๆ) */
        if (State.step === 2 || /ตรวจคำตอบ/.test(this.btnTextInCard(currentCard()))) {
          log('need-check ' + fp);
          if (this.tapCheck()) { return; }
          if (this.correctShown()) { log('wait-nextbtn ' + fp); return; }
          return;
        }
        log('no-advance-path ' + fp);
        return;
      }
      var btn = this.nextButton();
      if (!btn) {
        this.tries = (this.tries || 0) + 1;
        log('no-next-btn ' + fp + ' try=' + this.tries);
        if (this.tries >= 3) { this.handled[fp] = true; log('giveup ' + fp); }
        return;
      }
      this.handled[fp] = true;
      this.lastClickAt = Date.now();
      this.pending = true;
      var self = this;
      log('advance ' + fp + ' btn=' + btnText(btn));
      setTimeout(function () {
        self.pending = false;
        btn.click();
        log('advance-clicked');
      }, 800);
    },
    tick: function () {
      var D = window.__kbLessonDebug;
      if (this.pending) { return; }
      if (State.step >= 6) { return; }          /* ขั้นสรุป = จบบท ไม่ต้องเลื่อน */
      if (AudioQueue.isPlaying()) { if (D) log('t-block-audio'); return; }
      var fp = this.fingerprint();
      var now = Date.now();
      if (this._lastFp !== fp) { this._lastFp = fp; this.handled = {}; this.tries = 0; }
      if (this.handled[fp]) { if (D) log('t-block-handled ' + fp); return; }
      if (!this.correctShown()) {
        if (window.__kbLessonDebug) log('t-nocorrect card="' + cardText().slice(0,60).replace(/\n/g,'|') + '"');
        /* ไม่มีการแจ้ง "ถูกต้อง" จากหน้า → module ตรวจเองผ่าน API */
        var self0 = this;
        var word = composedText();
        /* แท็บ 3+: ไม่มีช่องประกอบคำ → อ่านคำที่ผู้เล่นเลือก (ปุ่มไฮไลต์) */
        if (!word) word = selectedWord();
        var expected = State.words[State.index] || '';
        if (word && expected && word.length === expected.length && !self0.checking) {
          self0.checking = true;
          Checker.check(word).then(function (r) {
            self0.checking = false;
            if (r && r.correct) {
              log('api-correct ' + word);
              Praise.say();
              self0.advanceNow(fp);
            } else {
              log('api-wrong ' + word + ' != ' + (r && r.expected));
            }
          }).catch(function (e) { self0.checking = false; log('api-fail ' + e); });
        }
        return;
      }
      if (AudioQueue.isPlaying()) return;             /* รอเสียงจบก่อน */
      if (now - this.lastClickAt < 2500) { if (D) log('t-block-cooldown ' + (now - this.lastClickAt)); return; }
      if (D) log('t-advance fp=' + fp);
      this.advanceNow(fp);
    },
    start: function () {
      var self = this;
      setInterval(function () { self.tick(); }, 450);
    }
  };

  /* ---------- public API ---------- */
  var Engine = {
    state: State,
    audio: AudioQueue,
    praise: Praise,
    check: Checker,
    advancer: Advancer,
    /** เรียกเมื่อเข้าขั้นใหม่: โหลดคำถาม + เล่นเสียงโจทย์ */
    enterStep: function (step) {
      State.index = 0;
      Advancer.handled = {};        /* ขั้นใหม่ = ล้าง fingerprint ที่จัดการแล้ว */
      Advancer.lastCheckAt = 0;
      log('enter-step ' + step);
      return State.load(step).then(function () {
        return post('/audio-plan', { lesson: State.lesson, step: step, index: 0 });
      }).then(function (plan) {
        if (plan && plan.play && plan.play.length) AudioQueue.play(plan.play);
        return plan;
      }).catch(function (e) { log('enterStep-fail ' + e); });
    },
    /** เรียกเมื่อตอบถูก */
    onCorrect: function (text) {
      return Checker.check(text).then(function (r) {
        if (r.correct) {
          Praise.say();
          State.index = r.next_index;
          return post('/audio-plan', { lesson: State.lesson, step: State.step, index: State.index });
        }
        return null;
      });
    },
    version: '1.0.0'
  };

  global.__kbLesson = Engine;
  log('module loaded v' + Engine.version + ' api=' + API);

  /* ---------- bootstrap: ตามการเปลี่ยนขั้นของหน้าเดิม ---------- */
  var lastStep = 0;
  setInterval(function () {
    var s = State.detectStep();
    if (s && s !== lastStep) {
      lastStep = s;
      Engine.enterStep(s);
    }
  }, 900);
  Advancer.start();
})(window);
