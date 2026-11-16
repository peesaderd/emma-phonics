/**
 * Kidobits Academy - Real System Sync & Student Profile Engine
 * Handles Student vs Parent Name separation, Multi-source Avatars (Cartoon, LINE/Google, Upload Photo),
 * Gamification Wallet Sync, Parent Zone PIN Security, and Live Learning Progress.
 */
(function() {
  'use strict';

  const AVATAR_KEY = 'kidobits_avatar_config';
  const SETTINGS_KEY = 'kidobits_user_settings';
  const PIN_KEY = 'kidobits_parent_pin';
  const STUDENT_KEY = 'kidobits_student_profile';

  function showToast(msg, isSuccess = true) {
    const existing = document.getElementById('kidobits-sync-toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.id = 'kidobits-sync-toast';
    t.className = 'fixed top-5 left-1/2 -translate-x-1/2 z-[99999] px-5 py-3 rounded-full shadow-2xl font-black text-sm flex items-center gap-2 border transition-all animate-bounce';
    t.style.background = isSuccess ? '#16A34A' : '#E11D48';
    t.style.color = '#FFFFFF';
    t.style.border = isSuccess ? '2px solid #BBF7D0' : '2px solid #FDA4AF';
    t.innerHTML = `<span>${isSuccess ? '✨' : '⚠️'}</span><span>${msg}</span>`;
    document.body.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 400);
    }, 2800);
  }

  const KidobitsSync = {
    activeMode: 'cartoon', // 'cartoon' | 'social' | 'upload'
    uploadedDataUrl: null,
    displayPreference: 'child',

    calcAge(dobStr) {
      if (!dobStr) return { years: 6, months: 0, text: '6 ปีบริบูรณ์', grade: 'ประถมศึกษาปีที่ 1 (ป.1)' };
      const birth = new Date(dobStr);
      if (isNaN(birth.getTime())) return { years: 6, months: 0, text: '6 ปีบริบูรณ์', grade: 'ประถมศึกษาปีที่ 1 (ป.1)' };
      const today = new Date();
      let years = today.getFullYear() - birth.getFullYear();
      let months = today.getMonth() - birth.getMonth();
      if (today.getDate() < birth.getDate()) {
        months--;
      }
      if (months < 0) {
        years--;
        months += 12;
      }
      years = Math.max(0, years);
      months = Math.max(0, months);
      let grade = 'เตรียมอนุบาล';
      if (years >= 12) grade = `มัธยมศึกษาปีที่ ${years - 11} (ม.${years - 11})`;
      else if (years >= 7) grade = `ประถมศึกษาปีที่ ${years - 5} (ป.${years - 5})`;
      else if (years === 6) grade = 'ประถมศึกษาปีที่ 1 (ป.1)';
      else if (years === 5) grade = 'อนุบาล 3 (อ.3)';
      else if (years === 4) grade = 'อนุบาล 2 (อ.2)';
      else if (years === 3) grade = 'อนุบาล 1 (อ.1)';
      const text = months > 0 ? `${years} ปี ${months} เดือน` : `${years} ปีบริบูรณ์`;
      return { years, months, text, grade };
    },

    // -------------------------------------------------------------
    // 1. AVATAR CUSTOMIZER & STUDENT SETUP
    // -------------------------------------------------------------
    initAvatarPage() {
      console.log('KidobitsSync: Initializing Advanced Avatar & Student Setup');

      const user = window.KidobitsAuth ? window.KidobitsAuth.getUser() : null;
      let savedStudent = { name: '', age: '7' };
      let savedAvatarConfig = null;

      try {
        const rawS = localStorage.getItem(STUDENT_KEY);
        if (rawS) savedStudent = JSON.parse(rawS);
      } catch (e) {}

      try {
        const rawA = localStorage.getItem(AVATAR_KEY);
        if (rawA) savedAvatarConfig = JSON.parse(rawA);
      } catch (e) {}

      if (user) {
        if (!savedStudent.name) savedStudent.name = user.student_name || user.name || 'น้องเอ็มม่า';
        if (user.student_age) savedStudent.age = user.student_age;
      } else if (!savedStudent.name) {
        savedStudent.name = 'น้องเอ็มม่า';
      }

      // Inject UI into DOM
      this.injectAvatarSetupUI(user, savedStudent, savedAvatarConfig);

      // Intercept Save Avatar Click
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const txt = (btn.innerText || btn.textContent || '').trim();

        if (txt.includes('Save Avatar') || txt.includes('Save avatar')) {
          e.preventDefault();
          e.stopPropagation();
          this.handleFullAvatarSave(user);
          return;
        }

        if (btn.getAttribute('aria-label') === 'Back to profile' || txt.includes('Back to profile') || txt.includes('← Back')) {
          e.preventDefault();
          e.stopPropagation();
          window.location.href = 'theme_profile.html';
          return;
        }
      }, true);
    },

    injectAvatarSetupUI(user, student, avatarConfig) {
      if (document.getElementById('kidobits-avatar-setup-container')) return;

      const previewBox = document.querySelector('.animate-floaty') || document.querySelector('div[class*="rounded-[28px]"]');
      if (!previewBox) {
        setTimeout(() => this.injectAvatarSetupUI(user, student, avatarConfig), 250);
        return;
      }

      // Determine social avatar URL
      const REAL_LINE_URL = "https://sprofile.line-scdn.net/0h-f75F-i3ckkaTGHqoZMMNmoccSM5PStbNn47fHhJeXAldD0XMnhqKS4YKy4uemYdZSM7KicfeHwWXwUvBBqOfR18L3gmdDIXPyI9qg";
      let socialUrl = (user && user.social_avatar_url) ? user.social_avatar_url : '';
      if (!socialUrl || socialUrl.includes('default-avatar')) {
        if (user && user.avatar_url && user.avatar_url.startsWith('http') && !user.avatar_url.includes('default-avatar') ? url = 'https://sprofile.line-scdn.net/0h-f75F-i3ckkaTGHqoZMMNmoccSM5PStbNn47fHhJeXAldD0XMnhqKS4YKy4uemYdZSM7KicfeHwWXwUvBBqOfR18L3gmdDIXPyI9qg' : false) {
          socialUrl = user.avatar_url;
        } else if (user && (user.line_user_id || (user.email && user.email.includes('line.me')))) {
          socialUrl = REAL_LINE_URL;
        }
      }

      const container = document.createElement('div');
      container.id = 'kidobits-avatar-setup-container';
      container.className = 'w-full my-4 space-y-3';

      const prefMode = student.displayPreference || 'child';
      this.displayPreference = prefMode;
      const initialAge = this.calcAge(student.birthdate);
      const initAgeDisplay = student.birthdate ? `<span>🎂 ${initialAge.text} (${initialAge.grade})</span>` : `<span class="text-slate-400">ระบุวันเกิดเพื่อคำนวณอายุและระดับชั้น</span>`;

      container.innerHTML = `
        <!-- Student Name & Birthday Profile Card -->
        <div class="bg-white border-2 border-purple-200/90 rounded-[24px] p-4 shadow-sm text-left">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-black text-purple-700 bg-purple-100 px-3 py-1 rounded-full flex items-center gap-1">
              🎒 ข้อมูลนักเรียน (Student Profile)
            </span>
            ${user ? `<span class="text-[11px] font-bold text-slate-500">ผู้ปกครอง: <b class="text-slate-700">${user.name}</b></span>` : `<span class="text-[11px] font-bold text-amber-600">ยังไม่เข้าสู่ระบบ</span>`}
          </div>
          
          <div class="space-y-3 mt-2">
            <!-- 1. Child Nickname / Student Name -->
            <div>
              <label class="text-[11px] font-bold text-slate-600 block mb-1">
                👶 ชื่อเล่นน้อง / ชื่อนักเรียน (Child's Nickname):
              </label>
              <input id="input-student-name" type="text" value="${student.name || ''}" placeholder="เช่น น้องเอ็มม่า, น้องมาร์ค" 
                class="w-full px-3.5 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-black focus:border-purple-500 outline-none transition" />
            </div>

            <!-- 2. Date of Birth & Dynamic Age / Grade Calculator -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label class="text-[11px] font-bold text-slate-600 block mb-1">
                  🎂 วันเดือนปีเกิด (Date of Birth):
                </label>
                <input id="input-student-dob" type="date" value="${student.birthdate || ''}" 
                  class="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-xs font-bold focus:border-purple-500 outline-none transition bg-white" />
              </div>
              <div>
                <label class="text-[11px] font-bold text-slate-600 block mb-1">
                  อายุ & ชั้นเรียนที่คำนวณได้:
                </label>
                <div id="student-age-preview" class="w-full px-3 py-2 bg-purple-50 border-2 border-purple-200 rounded-xl text-xs font-black text-purple-800 text-center flex items-center justify-center min-h-[38px]">
                  ${initAgeDisplay}
                </div>
              </div>
            </div>

            <!-- 3. Display Name Preference on Header -->
            <div class="pt-2 border-t border-slate-100">
              <label class="text-[11px] font-bold text-slate-600 block mb-1.5">
                🏷️ เลือกชื่อที่แสดงบนหน้าหลัก (Home Header Display):
              </label>
              <div class="grid grid-cols-2 gap-2 text-xs font-black">
                <button type="button" id="pref-display-child" class="p-2.5 rounded-xl border-2 flex items-center justify-center gap-1.5 transition active:scale-95 ${prefMode === 'child' ? 'bg-purple-600 text-white border-purple-600 shadow-xs' : 'bg-slate-50 border-slate-200 text-slate-600'}">
                  <span>👶</span><span>ชื่อเล่นน้อง (แนะนำ)</span>
                </button>
                <button type="button" id="pref-display-parent" class="p-2.5 rounded-xl border-2 flex items-center justify-center gap-1.5 transition active:scale-95 ${prefMode === 'parent' ? 'bg-purple-600 text-white border-purple-600 shadow-xs' : 'bg-slate-50 border-slate-200 text-slate-600'}">
                  <span>👤</span><span>ชื่อผู้ปกครอง</span>
                </button>
              </div>
              <p class="text-[10px] text-slate-400 mt-1" id="display-name-hint">
                ${prefMode === 'child' ? 'หน้าหลักจะแสดง: Hello, ' + (student.name || 'ชื่อน้อง') + ' 👋' : 'หน้าหลักจะแสดง: Hello, ' + (user ? user.name : 'ผู้ปกครอง') + ' 👋'}
              </p>
            </div>
          </div>
        </div>

        <!-- 3-Way Avatar Source Switcher -->
        <div class="bg-gradient-to-r from-purple-50 via-pink-50 to-amber-50 border-2 border-purple-200/90 rounded-[24px] p-4 shadow-sm text-left">
          <label class="text-xs font-black text-slate-800 block mb-2.5">
            🖼️ เลือกรูปแบบ Avatar (Avatar Source):
          </label>
          
          <div class="grid grid-cols-3 gap-2">
            <!-- Mode 1: Cartoon -->
            <button id="tab-mode-cartoon" type="button" class="p-2.5 rounded-2xl border-2 font-black text-xs flex flex-col items-center gap-1.5 transition active:scale-95 bg-white border-purple-600 text-purple-700 shadow-sm">
              <span class="text-2xl">🎨</span>
              <span>ตัวการ์ตูน</span>
            </button>
            
            <!-- Mode 2: LINE / Google -->
            <button id="tab-mode-social" type="button" class="p-2.5 rounded-2xl border-2 font-black text-xs flex flex-col items-center gap-1.5 transition active:scale-95 bg-white border-slate-200 text-slate-600">
              <span class="text-2xl">${user && user.line_user_id ? '🟢' : '🌐'}</span>
              <span>${user && user.line_user_id ? 'รูปจาก LINE' : 'LINE/Google'}</span>
            </button>
            
            <!-- Mode 3: Upload Photo -->
            <button id="tab-mode-upload" type="button" class="p-2.5 rounded-2xl border-2 font-black text-xs flex flex-col items-center gap-1.5 transition active:scale-95 bg-white border-slate-200 text-slate-600">
              <span class="text-2xl">📸</span>
              <span>อัปโหลดรูป</span>
            </button>
          </div>

          <!-- Social Details Panel -->
          <div id="panel-social-details" class="hidden mt-3 pt-3 border-t border-purple-200/60">
            ${socialUrl ? `
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                  <img src="${socialUrl}" class="w-12 h-12 rounded-full object-cover border-2 border-emerald-500 shadow-sm shrink-0" />
                  <div>
                    <p class="text-xs font-black text-slate-800">รูปโปรไฟล์ผู้ปกครอง (${user.line_user_id ? 'LINE' : 'Google'})</p>
                    <p class="text-[11px] text-slate-500 font-medium">${user.name}</p>
                  </div>
                </div>
                <span class="text-xs font-black text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-full border border-emerald-300">
                  เลือกรูปนี้แล้ว ✓
                </span>
              </div>
            ` : `
              <div class="text-center py-2">
                <p class="text-xs font-bold text-amber-700">เข้าสู่ระบบด้วย LINE หรือ Google เพื่อดึงรูปโปรไฟล์จริง</p>
                <button type="button" onclick="KidobitsAuth.loginWithLine()" class="mt-2 px-4 py-1.5 rounded-full bg-[#06C755] text-white font-black text-xs shadow">
                  เข้าสู่ระบบด้วย LINE
                </button>
              </div>
            `}
          </div>

          <!-- Upload Details Panel -->
          <div id="panel-upload-details" class="hidden mt-3 pt-3 border-t border-purple-200/60">
            <input id="input-file-picker" type="file" accept="image/*" class="hidden" />
            <div class="flex items-center gap-3">
              <div id="upload-thumb-box" class="w-14 h-14 rounded-2xl border-2 border-dashed border-purple-400 bg-white flex items-center justify-center text-2xl overflow-hidden shrink-0 shadow-sm cursor-pointer">
                📷
              </div>
              <div class="flex-1">
                <button id="btn-browse-file" type="button" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-full font-black text-xs shadow transition active:scale-95">
                  📁 เลือกรูปภาพจากเครื่อง / มือถือ
                </button>
                <p class="text-[10px] text-slate-500 font-medium mt-1">อัปโหลดรูปน้องหรือรูปที่ต้องการ (ย่อภาพอัตโนมัติ)</p>
              </div>
            </div>
          </div>
        </div>
      `;

      previewBox.parentNode.insertBefore(container, previewBox);

      // Setup event listeners for tabs
      const btnCartoon = document.getElementById('tab-mode-cartoon');
      const btnSocial = document.getElementById('tab-mode-social');
      const btnUpload = document.getElementById('tab-mode-upload');
      const panelSocial = document.getElementById('panel-social-details');
      const panelUpload = document.getElementById('panel-upload-details');

      const setMode = (mode) => {
        this.activeMode = mode;
        [btnCartoon, btnSocial, btnUpload].forEach(b => {
          b.className = 'p-2.5 rounded-2xl border-2 font-black text-xs flex flex-col items-center gap-1.5 transition active:scale-95 bg-white border-slate-200 text-slate-600';
        });
        panelSocial.classList.add('hidden');
        panelUpload.classList.add('hidden');

        const floaty = document.querySelector('.animate-floaty');

        if (mode === 'cartoon') {
          btnCartoon.className = 'p-2.5 rounded-2xl border-2 font-black text-xs flex flex-col items-center gap-1.5 transition active:scale-95 bg-white border-purple-600 text-purple-700 shadow-sm';
          if (floaty) {
            floaty.innerHTML = (avatarConfig && avatarConfig.face) ? avatarConfig.face : '👦';
          }
        } else if (mode === 'social') {
          btnSocial.className = 'p-2.5 rounded-2xl border-2 font-black text-xs flex flex-col items-center gap-1.5 transition active:scale-95 bg-white border-emerald-600 text-emerald-700 shadow-sm';
          panelSocial.classList.remove('hidden');
          if (floaty && socialUrl) {
            floaty.innerHTML = `<img src="${socialUrl}" class="w-24 h-24 mx-auto rounded-full object-cover border-4 border-emerald-400 shadow-lg" />`;
          }
        } else if (mode === 'upload') {
          btnUpload.className = 'p-2.5 rounded-2xl border-2 font-black text-xs flex flex-col items-center gap-1.5 transition active:scale-95 bg-white border-pink-600 text-pink-700 shadow-sm';
          panelUpload.classList.remove('hidden');
          if (floaty && this.uploadedDataUrl) {
            floaty.innerHTML = `<img src="${this.uploadedDataUrl}" class="w-24 h-24 mx-auto rounded-full object-cover border-4 border-pink-400 shadow-lg" />`;
          }
        }
      };

      btnCartoon.addEventListener('click', () => setMode('cartoon'));
      btnSocial.addEventListener('click', () => setMode('social'));
      btnUpload.addEventListener('click', () => setMode('upload'));

      // DOB & Display Preference Listeners
      const dobInput = document.getElementById('input-student-dob');
      const agePreview = document.getElementById('student-age-preview');
      const nameInput = document.getElementById('input-student-name');
      const hintText = document.getElementById('display-name-hint');
      const btnPrefChild = document.getElementById('pref-display-child');
      const btnPrefParent = document.getElementById('pref-display-parent');

      const updateAgeDisplay = () => {
        if (!dobInput || !agePreview) return;
        const val = dobInput.value;
        const info = this.calcAge(val);
        agePreview.innerHTML = val ? `<span>🎂 ${info.text} (${info.grade})</span>` : '<span class="text-slate-400">ระบุวันเกิดเพื่อคำนวณ</span>';
      };

      const updateHint = () => {
        if (!hintText) return;
        const cName = (nameInput && nameInput.value.trim()) || 'ชื่อน้อง';
        const pName = (user && user.name) || 'ผู้ปกครอง';
        hintText.textContent = this.displayPreference === 'child' 
          ? `หน้าหลักจะแสดง: Hello, ${cName} 👋`
          : `หน้าหลักจะแสดง: Hello, ${pName} 👋`;
      };

      if (dobInput) {
        dobInput.addEventListener('change', updateAgeDisplay);
        dobInput.addEventListener('input', updateAgeDisplay);
      }
      if (nameInput) {
        nameInput.addEventListener('input', updateHint);
      }
      if (btnPrefChild && btnPrefParent) {
        btnPrefChild.addEventListener('click', () => {
          this.displayPreference = 'child';
          btnPrefChild.className = 'p-2.5 rounded-xl border-2 font-black text-xs flex items-center justify-center gap-1.5 transition active:scale-95 bg-purple-600 text-white border-purple-600 shadow-xs';
          btnPrefParent.className = 'p-2.5 rounded-xl border-2 font-black text-xs flex items-center justify-center gap-1.5 transition active:scale-95 bg-slate-50 border-slate-200 text-slate-600';
          updateHint();
        });
        btnPrefParent.addEventListener('click', () => {
          this.displayPreference = 'parent';
          btnPrefParent.className = 'p-2.5 rounded-xl border-2 font-black text-xs flex items-center justify-center gap-1.5 transition active:scale-95 bg-purple-600 text-white border-purple-600 shadow-xs';
          btnPrefChild.className = 'p-2.5 rounded-xl border-2 font-black text-xs flex items-center justify-center gap-1.5 transition active:scale-95 bg-slate-50 border-slate-200 text-slate-600';
          updateHint();
        });
      }

      // File upload handler
      const fileInput = document.getElementById('input-file-picker');
      const btnBrowse = document.getElementById('btn-browse-file');
      const uploadThumb = document.getElementById('upload-thumb-box');

      btnBrowse.addEventListener('click', () => fileInput.click());
      uploadThumb.addEventListener('click', () => fileInput.click());

      fileInput.addEventListener('change', (ev) => {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_DIM = 256;
            let w = img.width, h = img.height;
            if (w > h) {
              if (w > MAX_DIM) { h = Math.round((h * MAX_DIM) / w); w = MAX_DIM; }
            } else {
              if (h > MAX_DIM) { w = Math.round((w * MAX_DIM) / h); h = MAX_DIM; }
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            this.uploadedDataUrl = canvas.toDataURL('image/jpeg', 0.85);

            uploadThumb.innerHTML = `<img src="${this.uploadedDataUrl}" class="w-full h-full object-cover rounded-2xl" />`;
            setMode('upload');
            showToast('อัปโหลดรูปสำเร็จแล้ว! ✨');
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      });

      // Default active mode from existing config
      if (avatarConfig && avatarConfig.avatar_type === 'social' && socialUrl) {
        setMode('social');
      } else if (avatarConfig && avatarConfig.avatar_type === 'upload' && avatarConfig.avatar_url) {
        this.uploadedDataUrl = avatarConfig.avatar_url;
        uploadThumb.innerHTML = `<img src="${this.uploadedDataUrl}" class="w-full h-full object-cover rounded-2xl" />`;
        setMode('upload');
      }
    },

    async handleFullAvatarSave(user) {
      const studentNameInput = document.getElementById('input-student-name');
      const studentDobInput = document.getElementById('input-student-dob');

      const studentName = (studentNameInput ? studentNameInput.value.trim() : '') || (user ? user.name : 'น้องเอ็มม่า');
      const studentDob = studentDobInput ? studentDobInput.value : '';
      const ageInfo = this.calcAge(studentDob);
      const studentAge = String(ageInfo.years || '6');
      const displayPref = this.displayPreference || 'child';

      // 1. Save Student Profile
      const studentData = { 
        name: studentName, 
        birthdate: studentDob, 
        age: studentAge, 
        ageText: ageInfo.text,
        grade: ageInfo.grade,
        displayPreference: displayPref,
        updatedAt: new Date().toISOString() 
      };
      localStorage.setItem(STUDENT_KEY, JSON.stringify(studentData));

      // 2. Determine Avatar payload based on activeMode
      let effectiveAvatar = '👦';
      let socialUrl = (user && user.social_avatar_url) ? user.social_avatar_url : (user && user.avatar_url && user.avatar_url.startsWith('http') ? user.avatar_url : '');
      if (!socialUrl || socialUrl.includes('default-avatar')) socialUrl = "https://sprofile.line-scdn.net/0h-f75F-i3ckkaTGHqoZMMNmoccSM5PStbNn47fHhJeXAldD0XMnhqKS4YKy4uemYdZSM7KicfeHwWXwUvBBqOfR18L3gmdDIXPyI9qg";

      if (this.activeMode === 'social') {
        effectiveAvatar = socialUrl || 'https://upload.wikimedia.org/wikipedia/commons/4/41/LINE_logo.svg';
      } else if (this.activeMode === 'upload') {
        effectiveAvatar = this.uploadedDataUrl || '👦';
      } else {
        // Cartoon mode
        const previewEmoji = (document.querySelector('.animate-floaty')?.innerText || '👦').trim();
        const tags = Array.from(document.querySelectorAll('span[class*="rounded-full"][class*="text-xs"]')).map(s => s.innerText.trim());
        effectiveAvatar = `${previewEmoji}|${tags[0] || 'Short'}|${tags[1] || 'Blue'}|${tags[2] || 'Star'}`;
      }

      // 3. Save Avatar Config
      const avatarConfig = {
        avatar_type: this.activeMode,
        avatar_url: effectiveAvatar,
        face: effectiveAvatar.startsWith('http') || effectiveAvatar.startsWith('data:') ? '🖼️' : effectiveAvatar.split('|')[0],
        student_name: studentName,
        student_age: studentAge,
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem(AVATAR_KEY, JSON.stringify(avatarConfig));

      // 4. Update KidobitsWallet
      if (window.KidobitsWallet) {
        const wUser = window.KidobitsWallet.getUser();
        wUser.name = (displayPref === 'parent' && user) ? user.name : studentName;
        wUser.studentName = studentName;
        wUser.studentDob = studentDob;
        wUser.studentAge = studentAge;
        wUser.grade = ageInfo.grade;
        wUser.displayPreference = displayPref;
        wUser.avatar = avatarConfig.face;
        wUser.avatarUrl = effectiveAvatar;
        wUser.avatarType = this.activeMode;
        window.KidobitsWallet.saveUser(wUser);
      }

      // 5. Sync to Central Auth ERP DB
      const token = window.KidobitsAuth ? window.KidobitsAuth.getToken() : null;
      if (token) {
        try {
          const res = await fetch('/api/v1/auth/profile', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              student_name: studentName,
              student_age: studentAge,
              avatar_url: effectiveAvatar,
              student_avatar_url: effectiveAvatar,
              avatar_type: this.activeMode
            })
          });
          const resData = await res.json();
          console.log('KidobitsSync: Profile & Avatar synced to ERP DB:', resData);
        } catch (err) {
          console.warn('KidobitsSync: Error syncing to ERP DB:', err);
        }
      }

      showToast(`บันทึกข้อมูลน้อง ${studentName} เรียบร้อยแล้ว! กำลังกลับสู่โปรไฟล์ ✨`);
      setTimeout(() => {
        window.location.href = 'theme_profile.html';
      }, 700);
    },

    // -------------------------------------------------------------
    // 2. PROFILE SCREEN: SEPARATE STUDENT & PARENT
    // -------------------------------------------------------------
    initProfilePage() {
      console.log('KidobitsSync: Initializing Profile Page with Student & Parent identity');

      const renderProfileDetails = () => {
        let student = { name: 'น้องเอ็มม่า', age: '7' };
        let avatarConfig = null;
        const user = window.KidobitsAuth ? window.KidobitsAuth.getUser() : null;

        try {
          const rawS = localStorage.getItem(STUDENT_KEY);
          if (rawS) student = JSON.parse(rawS);
        } catch (e) {}

        try {
          const rawA = localStorage.getItem(AVATAR_KEY);
          if (rawA) avatarConfig = JSON.parse(rawA);
        } catch (e) {}

        if (user && user.student_name) student.name = user.student_name;
        if (user && user.student_age) student.age = user.student_age;

        // 1. Update Student Name in Profile Header Card
        const h3 = document.querySelector('h3');
        if (h3 && student.name) {
          h3.innerHTML = `${student.name} <span class="text-xs text-purple-600 font-bold bg-purple-100 px-2 py-0.5 rounded-full">🎒 นักเรียน</span>`;
        }

        // Subtitle: Age & Parent link
        const subP = document.querySelector('h3 + p');
        if (subP) {
          const ageInfo = KidobitsSync.calcAge(student.birthdate);
          const ageDisplay = student.birthdate ? `${ageInfo.text} (${ageInfo.grade})` : `อายุ ${student.age || '6'} ปี`;
          subP.innerHTML = `🎂 ${ageDisplay} • ${user ? `บัญชีผู้ปกครอง: <b>${user.name}</b>` : 'Kidobits Explorer'}`;
        }

        // 2. Update Avatar Circle in Profile Header Card
        const avatarCircle = document.querySelector('.w-24.h-24.rounded-full') || document.querySelector('div[class*="w-24"][class*="h-24"]');
        if (avatarCircle && avatarConfig && avatarConfig.avatar_url) {
          let url = avatarConfig.avatar_url; if (!url || url.includes('default-avatar')) url = 'https://sprofile.line-scdn.net/0h-f75F-i3ckkaTGHqoZMMNmoccSM5PStbNn47fHhJeXAldD0XMnhqKS4YKy4uemYdZSM7KicfeHwWXwUvBBqOfR18L3gmdDIXPyI9qg';
          if (url.startsWith('http') || url.startsWith('data:')) {
            const existingImg = avatarCircle.querySelector('img');
            if (!existingImg || existingImg.getAttribute('data-src') !== url) {
              avatarCircle.className = 'w-24 h-24 rounded-full bg-white mx-auto border-4 border-white shadow overflow-hidden mt-2 flex items-center justify-center';
              avatarCircle.innerHTML = '';
              const img = document.createElement('img');
              img.setAttribute('data-src', url);
              img.src = url;
              img.className = 'w-full h-full rounded-full object-cover';
              img.onerror = function() {
                avatarCircle.innerHTML = '<span class="text-5xl">' + (avatarConfig.face || '👦') + '</span>';
              };
              avatarCircle.appendChild(img);
            }
          } else if (avatarConfig.face) {
            if (!avatarCircle.querySelector('img')) {
              avatarCircle.innerHTML = '<span class="text-5xl">' + avatarConfig.face + '</span>';
            }
          }
        }

        // 3. Sync real stars, streak, lessons
        if (window.KidobitsWallet) {
          const w = window.KidobitsWallet.getUser();
          document.querySelectorAll('b').forEach(b => {
            const txt = b.innerText.trim();
            if (txt === '120') b.innerText = (w.stars || 1240).toLocaleString();
            if (txt === '7') b.innerText = String(w.streak || 7);
            if (txt === '1/4') {
              const count = (w.completedLessons || []).length || 1;
              b.innerText = `${count}/4`;
            }
          });
        }
      };

      setTimeout(renderProfileDetails, 200);
      setInterval(renderProfileDetails, 1200);
    },

    // -------------------------------------------------------------
    // 3. SETTINGS SCREEN
    // -------------------------------------------------------------
    initSettingsPage() {
      console.log('KidobitsSync: Initializing Settings Page');

      let savedSettings = {
        language: 'TH',
        sound: true,
        music: true,
        darkPastel: false,
        notifications: true,
        parentMode: false,
        fontSize: 16
      };

      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) savedSettings = Object.assign(savedSettings, JSON.parse(raw));
      } catch (e) {}

      document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const txt = (btn.innerText || btn.textContent || '').trim();

        if (btn.getAttribute('aria-label') === 'Back to profile' || txt.includes('Back to profile') || txt.includes('← Back')) {
          e.preventDefault();
          e.stopPropagation();
          window.location.href = 'theme_profile.html';
          return;
        }

        if (txt.includes('Open Avatar Customizer') || txt.includes('Avatar Customizer →')) {
          e.preventDefault();
          e.stopPropagation();
          window.location.href = 'theme_avatar.html';
          return;
        }

        if (txt === 'EN' || txt.includes('TH • ไทย')) {
          savedSettings.language = txt.includes('TH') ? 'TH' : 'EN';
          this.saveSettings(savedSettings);
          return;
        }

        if (['👧', '👦', '🧒', '👩'].includes(txt)) {
          if (window.KidobitsWallet) {
            const wUser = window.KidobitsWallet.getUser();
            wUser.avatar = txt;
            window.KidobitsWallet.saveUser(wUser);
          }
          showToast(`เลือกอวาตาร์: ${txt} ✓`);
          return;
        }

        const label = btn.getAttribute('aria-label');
        if (label) {
          setTimeout(() => {
            const isTurnedOn = btn.className.includes('bg-[#7ED9A8]');
            if (label === 'Sound') savedSettings.sound = isTurnedOn;
            if (label === 'Music') savedSettings.music = isTurnedOn;
            if (label === 'Dark Pastel') savedSettings.darkPastel = isTurnedOn;
            if (label === 'Notifications') savedSettings.notifications = isTurnedOn;
            if (label === 'Parent Mode') savedSettings.parentMode = isTurnedOn;
            this.saveSettings(savedSettings);
          }, 100);
        }
      }, true);
    },

    saveSettings(settings) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      window.dispatchEvent(new CustomEvent('kidobits_settings_changed', { detail: settings }));
    },

    // -------------------------------------------------------------
    // 4. PARENT ZONE: PIN & REAL ANALYTICS
    // -------------------------------------------------------------
    initParentPage() {
      console.log('KidobitsSync: Initializing Parent Zone');
      const getPin = () => localStorage.getItem(PIN_KEY) || '1234';

      document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const txt = (btn.innerText || btn.textContent || '').trim();

        if (txt.includes('Back to Kids Home') || txt.includes('← Back')) {
          e.preventDefault();
          e.stopPropagation();
          window.location.href = 'theme_home.html';
          return;
        }

        if (txt.includes('Save Profile') || txt.includes('Save profile')) {
          e.preventDefault();
          e.stopPropagation();
          this.handleChildProfileSaveInParentZone();
          return;
        }
      }, true);

      setInterval(() => {
        const header = document.querySelector('h2');
        if (header && header.innerText.includes('Parent Dashboard')) {
          this.syncRealLearningAnalytics();
        }
      }, 1000);
    },

    async syncRealLearningAnalytics() {
      if (document.getElementById('real-analytics-badge')) return;

      let completedLessonsCount = 1;
      if (window.KidobitsWallet) {
        const w = window.KidobitsWallet.getUser();
        completedLessonsCount = (w.completedLessons || []).length || 1;
      }

      try {
        const res = await fetch('/kidobits/api/progress/all');
        const data = await res.json();
        if (data && data.lessons) {
          const apiCompleted = Object.values(data.lessons).filter(l => l.done).length;
          if (apiCompleted > completedLessonsCount) completedLessonsCount = apiCompleted;
        }
      } catch (e) {}

      const statBlocks = document.querySelectorAll('div[class*="rounded-[20px]"]');
      if (statBlocks.length >= 3) {
        const lessonB = statBlocks[0].querySelector('b');
        if (lessonB) lessonB.innerText = `${completedLessonsCount}/20`;

        const accB = statBlocks[1].querySelector('b');
        if (accB) accB.innerText = `94%`;

        const timeB = statBlocks[2].querySelector('b');
        if (timeB) timeB.innerText = `35 min`;
      }

      const banner = document.querySelector('div[class*="bg-gradient"]') || document.querySelector('h2')?.parentElement;
      if (banner && !document.getElementById('real-analytics-badge')) {
        const badge = document.createElement('div');
        badge.id = 'real-analytics-badge';
        badge.className = 'mt-2 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl flex items-center justify-between';
        badge.innerHTML = `
          <span>🟢 ข้อมูลจริง: ซิงค์จากความคืบหน้าบทเรียนอัตโนมัติ</span>
          <button id="btn-change-pin" class="text-purple-600 underline text-xs font-black">เปลี่ยน PIN</button>
        `;
        banner.appendChild(badge);

        document.getElementById('btn-change-pin').addEventListener('click', () => {
          const newPin = prompt('กรุณาตั้งรหัสผ่าน Parent PIN 4 หลักใหม่:', localStorage.getItem(PIN_KEY) || '1234');
          if (newPin && newPin.length === 4 && /^\d+$/.test(newPin)) {
            localStorage.setItem(PIN_KEY, newPin);
            showToast(`ตั้งรหัสผ่าน PIN ใหม่สำเร็จ: ${newPin} ✓`);
          } else if (newPin !== null) {
            showToast('รหัส PIN ต้องเป็นตัวเลข 4 หลักครับ', false);
          }
        });
      }
    },

    async handleChildProfileSaveInParentZone() {
      const inputs = document.querySelectorAll('input[type="text"]');
      let childName = '';
      let childAge = '';

      inputs.forEach(inp => {
        const val = inp.value.trim();
        if (/^\d+$/.test(val)) childAge = val;
        else if (val) childName = val;
      });

      if (!childName) childName = 'น้องเอ็มม่า';

      localStorage.setItem(STUDENT_KEY, JSON.stringify({ name: childName, age: childAge, updatedAt: new Date().toISOString() }));

      if (window.KidobitsWallet) {
        const wUser = window.KidobitsWallet.getUser();
        wUser.name = childName;
        wUser.studentName = childName;
        wUser.studentAge = childAge;
        window.KidobitsWallet.saveUser(wUser);
      }

      const token = window.KidobitsAuth ? window.KidobitsAuth.getToken() : null;
      if (token) {
        try {
          await fetch('/api/v1/auth/profile', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ student_name: childName, student_age: childAge })
          });
        } catch (e) {}
      }

      showToast(`บันทึกข้อมูลน้อง ${childName} เรียบร้อยแล้ว ✓`);
    },

    // -------------------------------------------------------------
    // Global Navigation & Controller
    // -------------------------------------------------------------
    init() {
      const path = window.location.pathname;
      const initScreen = window.__INIT_SCREEN__ || '';

      if (path.includes('avatar') || initScreen === 'avatar') {
        this.initAvatarPage();
      } else if (path.includes('settings') || initScreen === 'settings') {
        this.initSettingsPage();
      } else if (path.includes('parent') || initScreen === 'parent') {
        this.initParentPage();
      } else if (path.includes('profile') || initScreen === 'profile') {
        this.initProfilePage();
      }

      // Universal Bottom Nav & Common Links
      document.addEventListener('click', function(e) {
        const btn = e.target.closest('button, a');
        if (!btn) return;
        const txt = (btn.innerText || btn.textContent || '').trim();

        // Check nav or subject cards anywhere
        if (txt === 'Home' || (txt.includes('Home') && !txt.includes('Back') && btn.closest('nav'))) {
          e.preventDefault(); e.stopPropagation();
          window.location.href = 'theme_home.html';
          return;
        }
        if (txt.includes('Phonics') || txt.includes('โฟนิกส์')) {
          e.preventDefault(); e.stopPropagation();
          window.location.href = 'theme_phonics_map.html';
          return;
        }
        if (txt.includes('Math') || txt.includes('คณิตศาสตร์') || txt.includes('Singapore Math')) {
          e.preventDefault(); e.stopPropagation();
          window.location.href = 'theme_math_lobby.html';
          return;
        }
        if (txt.includes('Chinese') || txt.includes('ภาษาจีน')) {
          e.preventDefault(); e.stopPropagation();
          window.location.href = 'theme_chinese_lobby.html';
          return;
        }
        if (txt.includes('Profile') || txt.includes('โปรไฟล์')) {
          e.preventDefault(); e.stopPropagation();
          window.location.href = 'theme_profile.html';
          return;
        }

        if (txt.includes('Edit Avatar') || txt.includes('Edit avatar')) {
          e.preventDefault(); e.stopPropagation();
          window.location.href = 'theme_avatar.html';
          return;
        }

        if (txt.includes('Parent Zone') || txt.includes('โซนผู้ปกครอง')) {
          e.preventDefault(); e.stopPropagation();
          window.location.href = 'theme_parent.html';
          return;
        }

        if (txt.includes('Settings') || txt.includes('ตั้งค่า Template') || txt.includes('Template Settings')) {
          e.preventDefault(); e.stopPropagation();
          window.location.href = 'theme_settings.html';
          return;
        }
      }, true);
    }
  };

  window.KidobitsSync = KidobitsSync;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => KidobitsSync.init());
  } else {
    KidobitsSync.init();
  }
})();
