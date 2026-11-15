/**
 * Kidobits Dynamic Island - 15-Minute Daily Learning Challenge
 * Micro-learning gamification for early childhood education (Ultra-Compact Edition)
 */
(function() {
  const TARGET_SECONDS = 15 * 60; // 900 seconds = 15 minutes
  const STORAGE_KEY = 'kidobits_daily_island';

  // Get or initialize daily progress
  const todayStr = new Date().toISOString().slice(0, 10);
  let state = {
    date: todayStr,
    seconds: 0,
    isCompleted: false,
    rewardClaimed: false,
    isPaused: false
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

  // Format seconds to mm:ss
  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // Play pleasant chime with Web Audio API
  function playChime(success = false) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      const now = ctx.currentTime;
      if (success) {
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.2); // G5
        osc.frequency.setValueAtTime(1046.50, now + 0.3); // C6
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);
      } else {
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
      }
    } catch(e) {}
  }

  // Trigger celebration confetti on canvas
  function triggerConfetti() {
    const canvas = document.createElement('canvas');
    canvas.id = 'islandConfettiCanvas';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '999999';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = [];
    const colors = ['#FF7AB8', '#8B7CFF', '#FFD166', '#06D6A0', '#118AB2', '#FF6B6B'];
    for (let i = 0; i < 60; i++) {
      pieces.push({
        x: canvas.width / 2,
        y: 40,
        r: Math.random() * 5 + 3,
        dx: (Math.random() - 0.5) * 8,
        dy: (Math.random() - 0.7) * 10,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.random() * 8,
        tiltAngle: 0,
        tiltAngleInc: (Math.random() * 0.07) + 0.05
      });
    }

    let frame = 0;
    function animate() {
      if (frame > 80) {
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

  // Create DOM Elements for Dynamic Island
  function createIslandUI() {
    if (document.getElementById('kidobitsDynamicIsland')) return;

    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
      #kidobitsDynamicIsland {
        position: fixed;
        top: 6px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 99999;
        font-family: 'Plus Jakarta Sans', 'Prompt', -apple-system, sans-serif;
        box-sizing: border-box;
        transition: all 0.32s cubic-bezier(0.34, 1.45, 0.64, 1);
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
      /* Compact Mode: Reduced by 50% in bulk, sleek native pill */
      .island-compact {
        width: 112px;
        height: 24px;
        background: #0B0A10;
        border: 1px solid rgba(255, 255, 255, 0.16);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(0,0,0,0.85);
        border-radius: 9999px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 7px;
        overflow: hidden;
      }
      .island-compact:active {
        transform: scale(0.95);
      }
      /* Expanded Mode: Sleek & Compact Card */
      .island-expanded {
        width: 88vw;
        max-width: 310px;
        height: auto;
        min-height: 140px;
        background: #0B0A10;
        border: 1px solid rgba(255, 255, 255, 0.18);
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0,0,0,0.9);
        border-radius: 22px;
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        cursor: default;
      }
      .island-pulse-dot {
        width: 5px;
        height: 5px;
        background-color: #10B981;
        border-radius: 50%;
        animation: islandPulseMini 1.8s infinite;
      }
      @keyframes islandPulseMini {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.35; transform: scale(1.4); }
      }
      .island-completed-glow {
        box-shadow: 0 0 16px rgba(255, 215, 0, 0.45), 0 4px 12px rgba(0,0,0,0.4) !important;
        border: 1px solid #FFD700 !important;
      }
    `;
    document.head.appendChild(style);

    const island = document.createElement('div');
    island.id = 'kidobitsDynamicIsland';
    island.className = 'island-compact';
    document.body.appendChild(island);

    // Click outside to collapse
    document.addEventListener('click', (e) => {
      if (island.classList.contains('island-expanded') && !island.contains(e.target)) {
        collapseIsland();
      }
    });

    renderIsland();
  }

  let isExpanded = false;

  function expandIsland() {
    const island = document.getElementById('kidobitsDynamicIsland');
    if (!island) return;
    isExpanded = true;
    island.className = 'island-expanded' + (state.isCompleted ? ' island-completed-glow' : '');
    renderIsland();
    playChime(false);
  }

  function collapseIsland() {
    const island = document.getElementById('kidobitsDynamicIsland');
    if (!island) return;
    isExpanded = false;
    island.className = 'island-compact' + (state.isCompleted ? ' island-completed-glow' : '');
    renderIsland();
  }

  function renderIsland() {
    const island = document.getElementById('kidobitsDynamicIsland');
    if (!island) return;

    const pct = Math.min(100, Math.round((state.seconds / TARGET_SECONDS) * 100));
    const remainSec = Math.max(0, TARGET_SECONDS - state.seconds);

    if (!isExpanded) {
      // ---------------- ULTRA-COMPACT PILL (Half-sized) ----------------
      island.onclick = expandIsland;
      island.innerHTML = `
        <div class="flex items-center gap-1.5 min-w-0">
          <span class="${state.isCompleted ? 'text-amber-400' : 'island-pulse-dot'} shrink-0 text-[10px]">
            ${state.isCompleted ? '⭐' : ''}
          </span>
          <span class="text-[9.5px] font-extrabold tracking-tight text-white font-mono leading-none">
            ${state.isCompleted ? '15M' : formatTime(state.seconds)}
          </span>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <span class="text-[8.5px] font-black px-1 py-0.2 rounded-full ${state.isCompleted ? 'bg-amber-400 text-black' : 'bg-white/20 text-white/90'} leading-none">
            ${state.isCompleted ? '✓' : pct + '%'}
          </span>
          <span class="text-[10px] leading-none">🐼</span>
        </div>
      `;
    } else {
      // ---------------- COMPACT EXPANDED ISLAND ----------------
      island.onclick = null; // Prevent re-trigger
      island.innerHTML = `
        <!-- Top Bar -->
        <div class="flex items-center justify-between pb-1.5 border-b border-white/10">
          <div class="flex items-center gap-1.5">
            <span class="w-5 h-5 rounded-full bg-white/10 grid place-items-center text-xs">
              ${state.isCompleted ? '🏆' : '🎯'}
            </span>
            <div>
              <h4 class="text-[11px] font-black text-white leading-tight">Daily 15-Min Challenge</h4>
              <p class="text-[8.5px] font-bold text-white/60">เป้าหมายเรียน 15 นาที</p>
            </div>
          </div>
          <button id="islandCollapseBtn" class="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center text-white/80 transition text-[10px] cursor-pointer">
            ✕
          </button>
        </div>

        <!-- Timer & Progress Bar -->
        <div class="py-2">
          <div class="flex items-baseline justify-between mb-1">
            <span class="text-[9.5px] font-bold text-white/70">
              ${state.isCompleted ? '🎉 บรรลุเป้าหมายแล้ว' : `เหลืออีก ${formatTime(remainSec)} นาที`}
            </span>
            <span class="text-xs font-black text-amber-400 font-mono">
              ${formatTime(state.seconds)} <span class="text-[9px] text-white/50">/ 15:00</span>
            </span>
          </div>

          <!-- Progress Bar -->
          <div class="w-full h-2 bg-white/10 rounded-full overflow-hidden p-0.5">
            <div class="h-full rounded-full transition-all duration-500 ${state.isCompleted ? 'bg-gradient-to-r from-amber-400 to-yellow-300' : 'bg-gradient-to-r from-pink-500 to-indigo-500'}" style="width: ${pct}%"></div>
          </div>
        </div>

        <!-- Rewards Info Box -->
        <div class="bg-white/5 border border-white/10 rounded-xl p-2 flex items-center justify-between text-[9px]">
          <div class="flex items-center gap-1.5">
            <span class="text-sm">${state.isCompleted ? '🌟' : '🎁'}</span>
            <div>
              <p class="font-extrabold text-white/90">
                ${state.isCompleted ? 'รับโบนัสสำเร็จประจำวันแล้ว!' : 'เรียนครบ 15 นาที รับ +50 ดาวพิเศษ'}
              </p>
              <p class="text-white/60 text-[8px]">
                ${state.isCompleted ? 'ได้ทั้งความรู้และของรางวัล' : 'แม้ตอบถูกไม่หมด ก็ได้ดาวความพยายาม +15 ⭐'}
              </p>
            </div>
          </div>
          ${state.isCompleted && !state.rewardClaimed ? `
            <button id="islandClaimRewardBtn" class="bg-gradient-to-r from-amber-400 to-yellow-400 text-black font-black px-2 py-0.5 rounded-md shadow-sm text-[9px] shrink-0 active:scale-95 transition">
              รับ 50 ⭐
            </button>
          ` : `
            <span class="font-black text-amber-300 shrink-0 text-[9px]">
              ${state.isCompleted ? '✅ รับแล้ว' : '+50 ⭐'}
            </span>
          `}
        </div>

        <!-- Debug / Fast Test Button -->
        <div class="mt-1.5 pt-1 flex items-center justify-between text-[8px] text-white/40">
          <span>📅 ${state.date}</span>
          <button id="islandSimulateFastBtn" class="text-white/50 hover:text-white underline cursor-pointer">
            ${state.isCompleted ? '🔄 รีเซ็ตเวลา' : '⚡ เติมครบ 15 นาที (ทดสอบ)'}
          </button>
        </div>
      `;

      // Bind events inside expanded island
      const closeBtn = document.getElementById('islandCollapseBtn');
      if (closeBtn) closeBtn.onclick = collapseIsland;

      const claimBtn = document.getElementById('islandClaimRewardBtn');
      if (claimBtn) {
        claimBtn.onclick = () => {
          state.rewardClaimed = true;
          saveState();
          if (window.KidobitsWallet && KidobitsWallet.addStars) {
            KidobitsWallet.addStars(50);
          }
          playChime(true);
          triggerConfetti();
          renderIsland();
        };
      }

      const simBtn = document.getElementById('islandSimulateFastBtn');
      if (simBtn) {
        simBtn.onclick = () => {
          if (state.isCompleted) {
            state.seconds = 0;
            state.isCompleted = false;
            state.rewardClaimed = false;
          } else {
            state.seconds = TARGET_SECONDS;
            state.isCompleted = true;
            playChime(true);
            triggerConfetti();
          }
          saveState();
          renderIsland();
        };
      }
    }
  }

  // Timer Tick Function
  function tick() {
    if (document.hidden) return;
    if (state.isCompleted) return;

    state.seconds++;
    saveState();

    if (state.seconds >= TARGET_SECONDS) {
      state.isCompleted = true;
      saveState();
      playChime(true);
      triggerConfetti();
      expandIsland();
    } else {
      if (isExpanded || state.seconds % 5 === 0) {
        renderIsland();
      }
    }
  }

  // Initialization
  document.addEventListener('DOMContentLoaded', () => {
    createIslandUI();
    setInterval(tick, 1000);
  });

  window.KidobitsIsland = {
    getState: () => state,
    addSeconds: (sec) => {
      state.seconds = Math.min(TARGET_SECONDS, state.seconds + sec);
      saveState();
      renderIsland();
    },
    expand: expandIsland,
    collapse: collapseIsland
  };
})();
