/**
 * Kidobits Dynamic Island & Learning Timer
 * Features:
 * - Only counts inside active exercise/lesson pages
 * - Inactivity / Idle Auto-Pause (pauses when idle > 30s)
 * - Large Modal Settings & Giant Display
 */
(function() {
  const STORAGE_KEY = 'kidobits_daily_island';
  const SETTINGS_KEY = 'kidobits_timer_settings';
  const IDLE_THRESHOLD_SECONDS = 30; // Auto-pause after 30 seconds of inactivity

  // Settings
  let settings = {
    targetMinutes: 15,
    eyeBreakAlert: true
  };
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (s && s.targetMinutes) settings = Object.assign(settings, s);
  } catch(e) {}

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch(e) {}
  }

  // Daily State
  const todayStr = new Date().toISOString().slice(0, 10);
  let state = {
    date: todayStr,
    seconds: 0,
    isCompleted: false,
    rewardClaimed: false
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved && saved.date === todayStr) {
      state = Object.assign(state, saved);
    }
  } catch(e) {}

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch(e) {}
  }

  function getTargetSeconds() {
    return (settings.targetMinutes || 15) * 60;
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // 1. Check if current page is an ACTIVE EXERCISE page
  function isExercisePage() {
    const p = window.location.pathname.toLowerCase();
    return p.includes('theme_phonicslesson.html') ||
           p.includes('phonics.html') ||
           p.includes('phonics_v2.html') ||
           p.includes('math.html') ||
           p.includes('chinese.html') ||
           p.includes('theme_games.html') ||
           p.includes('game.html');
  }

  // 2. Activity & Idle Detection
  let lastActivityTimestamp = Date.now();
  let isIdle = false;

  function registerActivity() {
    lastActivityTimestamp = Date.now();
    if (isIdle) {
      isIdle = false;
      renderPill();
      const modal = document.getElementById('kidobitsTimerModalBackdrop');
      if (modal && modal.classList.contains('open')) renderModalContent();
    }
  }

  ['touchstart', 'touchmove', 'mousedown', 'keydown', 'scroll', 'click'].forEach(evt => {
    window.addEventListener(evt, registerActivity, { passive: true });
  });

  // Chime
  function playChime(success = false) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      if (success) {
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.1);
        osc.frequency.setValueAtTime(783.99, now + 0.2);
        osc.frequency.setValueAtTime(1046.50, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);
      } else {
        osc.frequency.setValueAtTime(480, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      }
    } catch(e) {}
  }

  // Confetti
  function triggerConfetti() {
    const canvas = document.createElement('canvas');
    canvas.id = 'islandConfettiCanvas';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '9999999';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = [];
    const colors = ['#FF7AB8', '#8B7CFF', '#FFD166', '#06D6A0', '#118AB2', '#FF6B6B'];
    for (let i = 0; i < 70; i++) {
      pieces.push({
        x: canvas.width / 2,
        y: canvas.height * 0.3,
        r: Math.random() * 6 + 4,
        dx: (Math.random() - 0.5) * 12,
        dy: (Math.random() - 0.7) * 14,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.random() * 10,
        tiltAngle: 0,
        tiltAngleInc: (Math.random() * 0.07) + 0.05
      });
    }

    let frame = 0;
    function animate() {
      if (frame > 90) {
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.tiltAngle += p.tiltAngleInc;
        p.y += (Math.cos(p.tiltAngle) + 1 + p.r / 2) / 2 + 3;
        p.x += Math.sin(p.tiltAngle) * 2 + p.dx * 0.95;
        p.dx *= 0.98;
        ctx.beginPath();
        ctx.lineWidth = p.r / 2;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 4, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4);
        ctx.stroke();
      });
      frame++;
      requestAnimationFrame(animate);
    }
    animate();
  }

  // Inject Styles
  function injectStyles() {
    if (document.getElementById('kidobitsIslandStyles')) return;
    const style = document.createElement('style');
    style.id = 'kidobitsIslandStyles';
    style.textContent = `
      #kidobitsDynamicPill {
        position: fixed;
        top: 6px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 99990;
        width: 126px;
        height: 26px;
        background: #0E0D14;
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
        border-radius: 9999px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 8px;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        transition: transform 0.15s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        font-family: 'Prompt', 'Noto Sans Thai', sans-serif;
      }
      #kidobitsDynamicPill:active {
        transform: translateX(-50%) scale(0.95);
      }
      .island-dot {
        width: 6px;
        height: 6px;
        background-color: #10B981;
        border-radius: 50%;
        animation: islandPulse 1.8s infinite;
      }
      .island-dot-paused {
        width: 6px;
        height: 6px;
        background-color: #F59E0B;
        border-radius: 50%;
      }
      .island-dot-idle {
        width: 6px;
        height: 6px;
        background-color: #94A3B8;
        border-radius: 50%;
      }
      @keyframes islandPulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.35; transform: scale(1.3); }
      }
      .pill-gold {
        border-color: #FBBF24 !important;
        box-shadow: 0 0 16px rgba(251, 191, 36, 0.4) !important;
      }

      /* Large Modal Backdrop */
      #kidobitsTimerModalBackdrop {
        position: fixed;
        inset: 0;
        background: rgba(10, 8, 18, 0.75);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1);
        font-family: 'Prompt', 'Noto Sans Thai', sans-serif;
      }
      #kidobitsTimerModalBackdrop.open {
        opacity: 1;
        pointer-events: auto;
      }

      /* Large Modal Box */
      #kidobitsTimerModalBox {
        width: 100%;
        max-width: 420px;
        background: #151322;
        border: 1.5px solid rgba(255, 255, 255, 0.15);
        border-radius: 32px;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.05);
        color: white;
        overflow: hidden;
        transform: scale(0.92) translateY(20px);
        transition: transform 0.32s cubic-bezier(0.34, 1.45, 0.64, 1);
      }
      #kidobitsTimerModalBackdrop.open #kidobitsTimerModalBox {
        transform: scale(1) translateY(0);
      }
    `;
    document.head.appendChild(style);
  }

  // Render Dynamic Island Pill
  function renderPill() {
    let pill = document.getElementById('kidobitsDynamicPill');
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'kidobitsDynamicPill';
      pill.onclick = openLargeModal;
      document.body.appendChild(pill);
    }

    const targetSec = getTargetSeconds();
    const pct = Math.min(100, Math.round((state.seconds / targetSec) * 100));
    const inExercise = isExercisePage();

    if (state.isCompleted) {
      pill.className = 'pill-gold';
      pill.innerHTML = `
        <div class="flex items-center gap-1.5">
          <span class="text-xs">⭐</span>
          <span class="text-[10px] font-black tracking-tight text-amber-300 font-mono">15M FINISH</span>
        </div>
        <span class="text-xs">🐼</span>
      `;
    } else if (!inExercise) {
      // Outside Exercise Page (Home / Lobby / Profile) -> Standby
      pill.className = '';
      pill.innerHTML = `
        <div class="flex items-center gap-1.5">
          <span class="island-dot-idle" title="นอกห้องเรียน"></span>
          <span class="text-[10.5px] font-bold text-slate-300 font-mono leading-none tracking-tight">
            ${formatTime(state.seconds)}
          </span>
        </div>
        <div class="flex items-center gap-1">
          <span class="text-[8.5px] font-bold text-slate-400 bg-white/10 px-1 py-0.2 rounded-full font-mono">
            พัก
          </span>
          <span class="text-[10px]">🏠</span>
        </div>
      `;
    } else if (isIdle) {
      // Inside Exercise Page, but Idle / Paused (>30s no touch)
      pill.className = '';
      pill.style.borderColor = 'rgba(245, 158, 11, 0.5)';
      pill.innerHTML = `
        <div class="flex items-center gap-1.5">
          <span class="island-dot-paused" title="หยุดชั่วคราว (ไม่มีการสัมผัส)"></span>
          <span class="text-[10.5px] font-black text-amber-300 font-mono leading-none tracking-tight">
            ${formatTime(state.seconds)}
          </span>
        </div>
        <div class="flex items-center gap-1">
          <span class="text-[8.5px] font-black text-amber-400 bg-amber-500/20 px-1 py-0.2 rounded-full font-mono">
            หยุด
          </span>
          <span class="text-[10px]">⏸️</span>
        </div>
      `;
    } else {
      // Inside Exercise Page & Actively Learning!
      pill.className = '';
      pill.style.borderColor = 'rgba(16, 185, 129, 0.6)';
      pill.innerHTML = `
        <div class="flex items-center gap-1.5">
          <span class="island-dot" title="กำลังเรียน"></span>
          <span class="text-[10.5px] font-extrabold text-white font-mono leading-none tracking-tight">
            ${formatTime(state.seconds)}
          </span>
        </div>
        <div class="flex items-center gap-1">
          <span class="text-[9px] font-black text-emerald-300 bg-emerald-500/20 px-1 py-0.2 rounded-full font-mono">
            ${pct}%
          </span>
          <span class="text-[10.5px]">🐼</span>
        </div>
      `;
    }
  }

  // Open Large Modal
  function openLargeModal() {
    let backdrop = document.getElementById('kidobitsTimerModalBackdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'kidobitsTimerModalBackdrop';
      backdrop.innerHTML = `<div id="kidobitsTimerModalBox"></div>`;
      backdrop.onclick = (e) => {
        if (e.target === backdrop) closeLargeModal();
      };
      document.body.appendChild(backdrop);
    }

    renderModalContent();
    backdrop.classList.add('open');
    playChime(false);
  }

  function closeLargeModal() {
    const backdrop = document.getElementById('kidobitsTimerModalBackdrop');
    if (backdrop) backdrop.classList.remove('open');
  }

  // Render Modal Content
  function renderModalContent() {
    const box = document.getElementById('kidobitsTimerModalBox');
    if (!box) return;

    const targetSec = getTargetSeconds();
    const remainSec = Math.max(0, targetSec - state.seconds);
    const pct = Math.min(100, Math.round((state.seconds / targetSec) * 100));
    const inExercise = isExercisePage();
    const isTeacherBypass = window.KidobitsLock ? KidobitsLock.isBypass() : false;

    // Determine current live activity state
    let statusBadgeHtml = '';
    if (state.isCompleted) {
      statusBadgeHtml = `<span class="bg-amber-400/20 text-amber-300 border border-amber-400/30 px-3 py-1 rounded-full text-xs font-black">🏆 บรรลุเป้าหมายประจำวัน</span>`;
    } else if (!inExercise) {
      statusBadgeHtml = `<span class="bg-slate-500/20 text-slate-300 border border-slate-500/30 px-3 py-1 rounded-full text-xs font-extrabold flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-slate-400"></span>อยู่นอกห้องเรียน (จะเริ่มนับเมื่อเข้าสู่แบบฝึกหัด)</span>`;
    } else if (isIdle) {
      statusBadgeHtml = `<span class="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>หยุดเวลาชั่วคราว (ไม่มีการสัมผัสหน้าจอเกิน 30 วิ)</span>`;
    } else {
      statusBadgeHtml = `<span class="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>กำลังเรียน (นับเวลาต่อเนื่อง)</span>`;
    }

    box.innerHTML = `
      <!-- Modal Header -->
      <div class="p-6 pb-4 border-b border-white/10 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 grid place-items-center text-2xl shadow-md text-white">
            ${state.isCompleted ? '🏆' : '⏱️'}
          </div>
          <div>
            <h3 class="text-xl font-black text-white leading-tight">
              ${state.isCompleted ? 'สำเร็จเป้าหมายประจำวัน!' : 'นาฬิกาจับเวลาเรียน'}
            </h3>
            <p class="text-xs font-bold text-slate-300 mt-0.5">
              เป้าหมาย ${settings.targetMinutes} นาที • สะสมดาวโบนัส
            </p>
          </div>
        </div>
        <button id="modalCloseBtn" class="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 grid place-items-center text-white text-lg font-bold transition cursor-pointer">
          ✕
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-6 space-y-4 max-h-[75vh] overflow-y-auto">

        <!-- Live Activity Status Bar -->
        <div class="flex justify-center">
          ${statusBadgeHtml}
        </div>

        <!-- Giant Timer Display -->
        <div class="bg-white/5 border border-white/10 rounded-3xl p-5 text-center relative overflow-hidden">
          <p class="text-xs font-black uppercase tracking-wider text-slate-400 mb-1">
            ${state.isCompleted ? '🎉 เรียนครบเวลาแล้ว' : 'เวลาเรียนสะสมวันนี้'}
          </p>

          <div class="text-5xl font-black font-mono tracking-tight my-2 ${state.isCompleted ? 'text-amber-300' : 'text-white'} drop-shadow-sm">
            ${formatTime(state.seconds)}
          </div>

          <p class="text-sm font-bold text-slate-300">
            ${state.isCompleted ? 'ยอดเยี่ยมมาก! รับโบนัสได้ทันที' : `เหลืออีก <span class="text-amber-300 font-extrabold font-mono">${formatTime(remainSec)}</span> นาที`}
          </p>

          <!-- Large Progress Bar -->
          <div class="mt-4 w-full h-3.5 bg-black/40 rounded-full overflow-hidden p-0.5 border border-white/10">
            <div class="h-full rounded-full transition-all duration-500 ${state.isCompleted ? 'bg-gradient-to-r from-amber-400 to-yellow-300' : 'bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500'}" style="width: ${pct}%"></div>
          </div>
          <div class="flex justify-between text-xs font-extrabold text-slate-400 mt-1.5 px-1">
            <span>เริ่มต้น</span>
            <span>${pct}% สำเร็จ</span>
            <span>${settings.targetMinutes} นาที</span>
          </div>
        </div>

        <!-- Reward Banner -->
        <div class="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-3xl">🌟</span>
            <div>
              <h4 class="text-sm font-black text-amber-200">
                ${state.isCompleted ? 'รับดาวโบนัสความสำเร็จ!' : 'รางวัลเรียนครบเวลา (+50 ดาว)'}
              </h4>
              <p class="text-xs font-medium text-amber-300/80">
                ${state.isCompleted ? 'สะสมเข้ากระเป๋าของคุณแล้ว' : 'แม้ตอบถูกไม่หมด ก็ได้ดาวความพยายาม'}
              </p>
            </div>
          </div>
          ${state.isCompleted && !state.rewardClaimed ? `
            <button id="modalClaimBtn" class="px-4 py-2 bg-gradient-to-r from-amber-400 to-yellow-400 text-black font-black text-sm rounded-xl shadow-md active:scale-95 transition cursor-pointer">
              รับ 50 ⭐
            </button>
          ` : `
            <span class="text-xs font-black px-3 py-1.5 rounded-xl ${state.isCompleted ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/10 text-white/70'}">
              ${state.isCompleted ? '✅ รับแล้ว' : '+50 ⭐'}
            </span>
          `}
        </div>

        <!-- Settings Section -->
        <div class="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-4">
          <h4 class="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <span>⚙️</span> การตั้งค่าเวลา & สิทธิ์ผู้ปกครอง
          </h4>

          <!-- 1. Target Time Selector -->
          <div>
            <label class="block text-xs font-extrabold text-slate-200 mb-2">
              เลือกเวลาเรียนเป้าหมายต่อวัน:
            </label>
            <div class="grid grid-cols-4 gap-2">
              ${[10, 15, 20, 30].map(min => `
                <button onclick="setTargetTime(${min})" 
                        class="py-2.5 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer ${settings.targetMinutes === min ? 'bg-amber-400 text-black shadow-md shadow-amber-400/20' : 'bg-white/10 text-white hover:bg-white/15'}">
                  ${min} นาที
                </button>
              `).join('')}
            </div>
          </div>

          <!-- 2. Teacher / Parent Unlock All Switch -->
          <div class="pt-3 border-t border-white/10 flex items-center justify-between">
            <div>
              <p class="text-xs font-extrabold text-slate-200 flex items-center gap-1">
                <span>🔓</span> ปลดล็อคทุกบทเรียน (Parent Mode)
              </p>
              <p class="text-[11px] text-slate-400">สำหรับครูและผู้ปกครองทดสอบบทเรียน</p>
            </div>
            <button onclick="toggleParentBypass()" 
                    class="px-3.5 py-1.5 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer ${isTeacherBypass ? 'bg-emerald-500 text-white' : 'bg-white/10 text-slate-300'}">
              ${isTeacherBypass ? 'เปิดอยู่ (ทุกบท)' : 'ปิด (ล็อคปกติ)'}
            </button>
          </div>

          <!-- 3. Smart Pause Info -->
          <div class="pt-3 border-t border-white/10 text-[11px] text-slate-400 space-y-1">
            <p class="flex items-center gap-1 text-slate-300 font-bold">
              <span>🛡️</span> ระบบตรวจจับการนิ่ง (Smart Idle Detection):
            </p>
            <p>• จับเวลาเฉพาะขณะอยู่ในหน้าแบบฝึกหัดจริงเท่านั้น</p>
            <p>• หากวางเครื่องทิ้งไว้เกิน 30 วินาที ระบบจะหยุดเวลาให้อัตโนมัติ</p>
          </div>

          <!-- 4. Fast Test / Reset -->
          <div class="pt-3 border-t border-white/10 flex items-center justify-between">
            <span class="text-xs font-bold text-slate-400">การทดสอบระบบ:</span>
            <div class="flex gap-2 flex-wrap">
              <button onclick="simulateCompleteTimer()" class="px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 text-xs font-extrabold rounded-xl transition cursor-pointer">
                ⚡ เติมครบเวลา
              </button>
              <button onclick="resetTimer()" class="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-extrabold rounded-xl transition cursor-pointer">
                🔄 รีเซ็ตเวลา
              </button>
              <button onclick="resetLockProgression()" class="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-extrabold rounded-xl transition cursor-pointer" title="ล็อคบทที่ 2-12 ใหม่ทั้งหมด">
                🔒 รีเซ็ตล็อคบทเรียน
              </button>
            </div>
          </div>
        </div>

      </div>
    `;

    // Event Bindings
    const closeBtn = document.getElementById('modalCloseBtn');
    if (closeBtn) closeBtn.onclick = closeLargeModal;

    const claimBtn = document.getElementById('modalClaimBtn');
    if (claimBtn) {
      claimBtn.onclick = () => {
        state.rewardClaimed = true;
        saveState();
        if (window.KidobitsWallet && KidobitsWallet.addStars) {
          KidobitsWallet.addStars(50);
        }
        playChime(true);
        triggerConfetti();
        renderModalContent();
        renderPill();
      };
    }
  }

  // Global helper actions
  window.setTargetTime = function(min) {
    settings.targetMinutes = min;
    saveSettings();
    if (state.seconds >= getTargetSeconds()) {
      state.isCompleted = true;
    } else {
      state.isCompleted = false;
    }
    saveState();
    renderModalContent();
    renderPill();
  };

  window.toggleParentBypass = function() {
    if (!window.KidobitsLock) return;
    const current = KidobitsLock.isBypass();
    KidobitsLock.setBypass(!current);
    renderModalContent();
    setTimeout(() => location.reload(), 300);
  };

  window.resetLockProgression = function() {
    if (window.KidobitsLock && confirm('ต้องการรีเซ็ตสถานะบทเรียนกลับไปล็อคเหมือนเริ่มต้น (เปิดเฉพาะบทที่ 1) ใช่หรือไม่?')) {
      KidobitsLock.reset();
      location.reload();
    }
  };

  window.simulateCompleteTimer = function() {
    state.seconds = getTargetSeconds();
    state.isCompleted = true;
    saveState();
    playChime(true);
    triggerConfetti();
    renderModalContent();
    renderPill();
  };

  window.resetTimer = function() {
    state.seconds = 0;
    state.isCompleted = false;
    state.rewardClaimed = false;
    saveState();
    renderModalContent();
    renderPill();
  };

  // Timer Tick (Runs every second)
  function tick() {
    if (document.hidden) return;
    if (state.isCompleted) return;

    // Check 1: Is this an active exercise page?
    const inExercise = isExercisePage();
    if (!inExercise) {
      // Outside exercise: DO NOT INCREMENT TIME! Just update pill to standby
      renderPill();
      const backdrop = document.getElementById('kidobitsTimerModalBackdrop');
      if (backdrop && backdrop.classList.contains('open')) {
        renderModalContent();
      }
      return;
    }

    // Check 2: Check idle / inactivity duration
    const idleSeconds = Math.floor((Date.now() - lastActivityTimestamp) / 1000);
    if (idleSeconds >= IDLE_THRESHOLD_SECONDS) {
      // Idle detected! Pause timer, do not increment!
      isIdle = true;
      renderPill();
      const backdrop = document.getElementById('kidobitsTimerModalBackdrop');
      if (backdrop && backdrop.classList.contains('open')) {
        renderModalContent();
      }
      return;
    }

    // Actively learning in an exercise page!
    isIdle = false;
    state.seconds++;
    saveState();

    if (state.seconds >= getTargetSeconds()) {
      state.isCompleted = true;
      saveState();
      playChime(true);
      triggerConfetti();
      openLargeModal();
    } else {
      renderPill();
      const backdrop = document.getElementById('kidobitsTimerModalBackdrop');
      if (backdrop && backdrop.classList.contains('open')) {
        renderModalContent();
      }
    }
  }

  // Init
  document.addEventListener('DOMContentLoaded', () => {
    injectStyles();
    renderPill();
    setInterval(tick, 1000);
  });

  window.KidobitsTimerModal = {
    open: openLargeModal,
    close: closeLargeModal,
    getState: () => state,
    registerActivity: registerActivity
  };
})();
