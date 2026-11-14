/**
 * ============================================================
 * Kidobits Learning Resume & Progress Engine (v1.0.0)
 * ============================================================
 * Module อิสระสำหรับบันทึกและกู้คืนความก้าวหน้าบทเรียน
 * ปลอดภัย 100%: ไม่กระทบ logic เดิมของแต่ละหน้า
 * รองรับทั้ง Phonics, Math, และ Chinese
 * ============================================================
 */
(function(global) {
  'use strict';

  var DEFAULT_THEMES = {
    purple: {
      bg: 'bg-purple-50',
      border: 'border-purple-200',
      textTitle: 'text-purple-900',
      textSub: 'text-purple-700',
      btn: 'bg-purple-600 hover:bg-purple-700 shadow-purple-500/20',
      badge: 'bg-purple-100 text-purple-700'
    },
    emerald: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      textTitle: 'text-emerald-900',
      textSub: 'text-emerald-700',
      btn: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20',
      badge: 'bg-emerald-100 text-emerald-700'
    },
    orange: {
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      textTitle: 'text-orange-900',
      textSub: 'text-orange-700',
      btn: 'bg-[#FF7A00] hover:bg-orange-600 shadow-orange-500/20',
      badge: 'bg-orange-100 text-orange-700'
    },
    red: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      textTitle: 'text-red-900',
      textSub: 'text-red-700',
      btn: 'bg-[#E53935] hover:bg-red-600 shadow-red-500/20',
      badge: 'bg-red-100 text-red-700'
    }
  };

  var KidobitsResume = {
    version: '1.0.0',

    /**
     * ดึงข้อมูลความก้าวหน้าทั้งหมดจาก Storage
     */
    getAll: function(storageKey) {
      if (!storageKey) return {};
      try {
        var raw = localStorage.getItem(storageKey);
        return raw ? JSON.parse(raw) : {};
      } catch (e) {
        return {};
      }
    },

    /**
     * บันทึกความก้าวหน้าของบทเรียนปัจจุบัน
     * @param {string} storageKey - คีย์จัดเก็บ เช่น 'kb_l2_progress_v1'
     * @param {string} lessonId - รหัสบทเรียน เช่น 'L2.01'
     * @param {object} payload - { step, index, title, subtitle, stars, done, extra }
     */
    save: function(storageKey, lessonId, payload) {
      if (!storageKey || !lessonId) return;
      try {
        var all = this.getAll(storageKey);
        payload = payload || {};
        all[lessonId] = {
          lessonId: lessonId,
          step: typeof payload.step === 'number' ? payload.step : 0,
          index: typeof payload.index === 'number' ? payload.index : 0,
          title: payload.title || lessonId,
          subtitle: payload.subtitle || '',
          stars: payload.stars || 0,
          done: !!payload.done,
          extra: payload.extra || null,
          updatedAt: Date.now()
        };
        all.__last = lessonId;
        localStorage.setItem(storageKey, JSON.stringify(all));

        // อัปเดต Global Resume สำหรับหน้าหลักด้วย (ถ้าต้องการ)
        this._updateGlobal(storageKey, lessonId, payload);
      } catch (e) {
        console.warn('[KidobitsResume] Save error:', e);
      }
    },

    /**
     * โหลดความก้าวหน้าที่ค้างอยู่ของบทเรียนที่ระบุ
     */
    load: function(storageKey, lessonId) {
      if (!storageKey || !lessonId) return null;
      var all = this.getAll(storageKey);
      var item = all[lessonId];
      if (!item || item.done) return null;
      return item;
    },

    /**
     * ตรวจสอบหาบทเรียนล่าสุดที่ยังเรียนค้างอยู่
     */
    getLastActive: function(storageKey) {
      if (!storageKey) return null;
      var all = this.getAll(storageKey);
      var lastId = all.__last;
      if (lastId && all[lastId] && !all[lastId].done) {
        var item = all[lastId];
        if (item.step > 0 || item.index > 0) return item;
      }
      // Smart Fallback: search for any unfinished lesson with highest updatedAt
      var best = null;
      for (var k in all) {
        if (k === '__last') continue;
        var it = all[k];
        if (it && !it.done && (it.step > 0 || it.index > 0)) {
          if (!best || (it.updatedAt || 0) > (best.updatedAt || 0)) {
            best = it;
          }
        }
      }
      return best;
    },

    /**
     * ทำเครื่องหมายว่าจบบทเรียนแล้ว (เคลียร์สถานะค้าง)
     */
    markDone: function(storageKey, lessonId) {
      if (!storageKey || !lessonId) return;
      try {
        var all = this.getAll(storageKey);
        if (all[lessonId]) {
          all[lessonId].done = true;
          all[lessonId].updatedAt = Date.now();
        }
        if (all.__last === lessonId) {
          delete all.__last;
        }
        localStorage.setItem(storageKey, JSON.stringify(all));
      } catch (e) {}
    },

    /**
     * เคลียร์ข้อมูลความก้าวหน้าของบทเรียนนั้น
     */
    clear: function(storageKey, lessonId) {
      if (!storageKey || !lessonId) return;
      try {
        var all = this.getAll(storageKey);
        delete all[lessonId];
        if (all.__last === lessonId) delete all.__last;
        localStorage.setItem(storageKey, JSON.stringify(all));
      } catch (e) {}
    },

    /**
     * เรนเดอร์การ์ดแบนเนอร์ "ยังเรียนไม่จบ — เล่นต่อได้เลย" ลงใน DOM
     * @param {object} options
     *   - storageKey: string (จำเป็น)
     *   - containerId: string | HTMLElement (id ของ element ที่จะแทรกการ์ด)
     *   - theme: 'purple' | 'emerald' | 'orange' | 'red' (default: 'purple')
     *   - onResume: function(activeItem) (callback เมื่อกดปุ่มเล่นต่อ)
     *   - fallbackUrl: string (กรณีคลิกแล้วเปิดเป็นลิงก์)
     */
    renderBanner: function(options) {
      options = options || {};
      var storageKey = options.storageKey;
      var container = typeof options.containerId === 'string' 
        ? document.getElementById(options.containerId) 
        : options.containerId;

      if (!container || !storageKey) return null;

      var active = this.getLastActive(storageKey);
      if (!active) {
        container.innerHTML = '';
        container.style.display = 'none';
        return null;
      }

      container.style.display = '';
      var t = DEFAULT_THEMES[options.theme] || DEFAULT_THEMES.purple;

      var subText = active.subtitle || ('ขั้นตอนที่ ' + (active.step + 1) + (active.index > 0 ? ' · ข้อที่ ' + (active.index + 1) : ''));

      var html = [
        '<div class="w-full ' + t.bg + ' border ' + t.border + ' rounded-2xl p-3 sm:p-3.5 shadow-sm flex items-center justify-between gap-3 transition-all mb-3">',
        '  <div class="flex items-center gap-2.5 min-w-0">',
        '    <div class="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-xl shadow-xs shrink-0">⏱️</div>',
        '    <div class="min-w-0 flex-1">',
        '      <div class="flex items-center gap-1.5">',
        '        <span class="text-xs font-black ' + t.textTitle + '">ยังเรียนไม่จบ — เล่นต่อได้เลย</span>',
        '        <span class="px-1.5 py-0.2 rounded-md text-[9px] font-black ' + t.badge + '">' + active.lessonId + '</span>',
        '      </div>',
        '      <div class="text-[11px] font-semibold ' + t.textSub + ' truncate mt-0.5">' + active.title + ' · ' + subText + '</div>',
        '    </div>',
        '  </div>',
        '  <button id="kbResumeActionBtn" class="shrink-0 h-9 px-3.5 rounded-xl ' + t.btn + ' text-white font-extrabold text-xs flex items-center gap-1 shadow-sm active:scale-95 transition cursor-pointer">',
        '    <span>▶</span><span>เล่นต่อ</span>',
        '  </button>',
        '</div>'
      ].join('\n');

      container.innerHTML = html;

      var btn = container.querySelector('#kbResumeActionBtn');
      if (btn) {
        btn.onclick = function() {
          if (typeof options.onResume === 'function') {
            options.onResume(active);
          } else if (options.fallbackUrl) {
            window.location.href = options.fallbackUrl.replace('{id}', active.lessonId);
          }
        };
      }

      return active;
    },

    _updateGlobal: function(storageKey, lessonId, payload) {
      try {
        var gKey = 'kidobits_global_last_activity';
        var gData = {
          storageKey: storageKey,
          lessonId: lessonId,
          title: payload.title || lessonId,
          updatedAt: Date.now()
        };
        localStorage.setItem(gKey, JSON.stringify(gData));
      } catch (e) {}
    }
  };

  // Export to window
  global.KidobitsResume = KidobitsResume;

})(typeof window !== 'undefined' ? window : this);
