/**
 * Kidobits Academy - Central Auth & OAuth Integration (Google & LINE)
 * Seamlessly connects Kidobits to Central ERP Auth (/api/v1/auth/*)
 */
(function() {
  const TOKEN_KEY = 'kidobits_jwt_token';
  const PROFILE_CACHE_KEY = 'kidobits_auth_user';

  const KidobitsAuth = {
    user: null,

    getToken() {
      return localStorage.getItem(TOKEN_KEY) || null;
    },

    setToken(token) {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    },

    isLoggedIn() {
      return Boolean(this.getToken());
    },

    getProfile() { return this.getUser(); },
    getUser() {
      if (this.user) return this.user;
      try {
        const raw = localStorage.getItem(PROFILE_CACHE_KEY);
        if (raw) {
          this.user = JSON.parse(raw);
          return this.user;
        }
      } catch (e) {}
      return null;
    },

    saveCachedUser(u) {
      this.user = u;
      if (u) {
        localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(u));
      } else {
        localStorage.removeItem(PROFILE_CACHE_KEY);
      }
      this.updateUI();
    },

    loginWithLine(returnTo) {
      const target = returnTo || window.location.href.split('#')[0];
      window.location.href = `/api/v1/auth/line/login?return_to=${encodeURIComponent(target)}`;
    },

    loginWithGoogle(returnTo) {
      const target = returnTo || window.location.href.split('#')[0];
      window.location.href = `/api/v1/auth/google/login?return_to=${encodeURIComponent(target)}`;
    },

    logout() {
      this.setToken(null);
      this.saveCachedUser(null);
      if (window.KidobitsWallet) {
        const wUser = window.KidobitsWallet.getUser();
        wUser.userId = 'guest';
        wUser.isLoggedIn = false;
        window.KidobitsWallet.saveUser(wUser);
      }
      window.location.reload();
    },

    async fetchProfile() {
      const token = this.getToken();
      if (!token) {
        this.saveCachedUser(null);
        return null;
      }
      try {
        const res = await fetch('/api/v1/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (res.status === 401 || res.status === 403) {
          console.warn('KidobitsAuth: Token expired or invalid');
          this.setToken(null);
          this.saveCachedUser(null);
          return null;
        }
        const data = await res.json();
        if (data && (data.ok || data.user)) {
          const userObj = data.user || data;
          this.saveCachedUser(userObj);

          // Sync to KidobitsWallet
          if (window.KidobitsWallet) {
            const wUser = window.KidobitsWallet.getUser();
            wUser.userId = userObj.id || wUser.userId;
            wUser.name = userObj.name || wUser.name;
            wUser.avatarUrl = userObj.avatar_url || '';
            wUser.email = userObj.email || '';
            wUser.memberTier = userObj.member_tier || 'Explorer';
            wUser.isLoggedIn = true;
            window.KidobitsWallet.saveUser(wUser);
          }
          return userObj;
        }
      } catch (err) {
        console.warn('KidobitsAuth: Fetch profile error', err);
      }
      return this.getUser();
    },

    // Check URL parameters for OAuth redirect callback token
    checkUrlToken() {
      try {
        const urlObj = new URL(window.location.href);
        let token = urlObj.searchParams.get('token');
        if (!token && window.location.hash.includes('token=')) {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          token = hashParams.get('token');
        }

        if (token) {
          console.log('KidobitsAuth: OAuth token received from URL');
          this.setToken(token);
          
          // Remove token from URL to keep clean address bar
          urlObj.searchParams.delete('token');
          const cleanUrl = urlObj.pathname + (urlObj.searchParams.toString() ? '?' + urlObj.searchParams.toString() : '') + urlObj.hash;
          window.history.replaceState({}, document.title, cleanUrl);

          // Show pleasant toast
          this.showToast('เข้าสู่ระบบสำเร็จแล้ว! ยินดีต้อนรับสู่ Kidobits ✨');
          return token;
        }
      } catch (e) {
        console.warn('KidobitsAuth: checkUrlToken error', e);
      }
      return null;
    },

    showToast(message) {
      const toast = document.createElement('div');
      toast.className = 'fixed top-5 left-1/2 -translate-x-1/2 z-[9999] bg-[#2C2623] text-white px-5 py-3 rounded-full shadow-2xl font-bold text-sm flex items-center gap-2 border border-white/20 animate-bounce';
      toast.innerHTML = `<span>🎉</span> <span>${message}</span>`;
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, -20px)';
        setTimeout(() => toast.remove(), 400);
      }, 3500);
    },

    showLoginModal() {
      let modal = document.getElementById('kidobitsAuthModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'kidobitsAuthModal';
        modal.className = 'fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity';
        modal.innerHTML = `
          <div class="bg-white rounded-[32px] p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl border-4 border-amber-100 relative transform transition-all scale-100 animate-pop">
            <button onclick="KidobitsAuth.closeLoginModal()" class="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center transition">
              ✕
            </button>
            
            <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-400 to-orange-400 mx-auto flex items-center justify-center text-3xl shadow-md border-2 border-white mb-3">
              🦁
            </div>
            
            <h3 class="font-serif text-2xl font-black text-[#2C2623]">Kidobits Academy</h3>
            <p class="text-xs text-[#7B7488] font-bold mt-1 mb-5">
              เข้าสู่ระบบเพื่อสะสมดาว ปลดล็อกเหรียญ<br>และเรียนต่อได้ทุกเครื่องอย่างราบรื่น
            </p>

            <div class="space-y-3">
              <!-- LINE Login Button -->
              <button onclick="KidobitsAuth.loginWithLine()" class="w-full py-3.5 px-4 rounded-2xl bg-[#06C755] hover:bg-[#05b34c] text-white font-extrabold text-sm flex items-center justify-center gap-2.5 shadow-md active:scale-95 transition-all">
                <svg class="w-6 h-6 fill-current" viewBox="0 0 24 24">
                  <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 4.269 8.846 10.035 9.608.391.084.922.258 1.057.592.121.303.079.778.039 1.085l-.171 1.027c-.053.303-.242 1.186 1.039.646 1.281-.54 6.911-4.069 9.428-6.967 1.739-1.907 2.573-3.844 2.573-5.993z"/>
                </svg>
                <span>เข้าสู่ระบบด้วย LINE</span>
              </button>

              <!-- Google Login Button -->
              <button onclick="KidobitsAuth.loginWithGoogle()" class="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-50 text-slate-700 font-extrabold text-sm flex items-center justify-center gap-2.5 border-2 border-slate-200 shadow-sm active:scale-95 transition-all">
                <svg class="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>เข้าสู่ระบบด้วย Google</span>
              </button>
            </div>

            <div class="mt-4 pt-3 border-t border-slate-100">
              <button onclick="KidobitsAuth.closeLoginModal()" class="text-xs text-[#9A8FA8] hover:text-slate-600 font-bold transition">
                เล่นต่อแบบไม่เข้าสู่ระบบ (Guest Mode)
              </button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
      }
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    },

    closeLoginModal() {
      const modal = document.getElementById('kidobitsAuthModal');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    },

    showProfileModal() {
      const u = this.getUser() || {};
      const walletUser = window.KidobitsWallet ? window.KidobitsWallet.getUser() : {};
      const name = u.name || walletUser.name || 'น้องเอ็มม่า';
      const email = u.email || 'guest@kidobits.com';
      const tier = u.member_tier || walletUser.memberTier || 'Explorer';
      const avatarUrl = u.avatar_url || walletUser.avatarUrl || '';
      const stars = walletUser.stars || 0;
      const coins = walletUser.coins || 0;

      let modal = document.getElementById('kidobitsProfileModal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'kidobitsProfileModal';
        modal.className = 'fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity';
        document.body.appendChild(modal);
      }

      modal.innerHTML = `
        <div class="bg-white rounded-[32px] p-6 max-w-sm w-full text-center shadow-2xl border-4 border-purple-100 relative animate-pop">
          <button onclick="KidobitsAuth.closeProfileModal()" class="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center transition">
            ✕
          </button>
          
          <div class="relative w-20 h-20 mx-auto mb-3">
            ${avatarUrl 
              ? `<img src="${avatarUrl}" class="w-20 h-20 rounded-full object-cover border-4 border-purple-200 shadow-md">`
              : `<div class="w-20 h-20 rounded-full bg-[#EAF0F4] border-4 border-purple-200 shadow-md flex items-center justify-center text-4xl">👦🏻</div>`
            }
            <span class="absolute -bottom-1 -right-1 bg-amber-400 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded-full border border-white shadow">
              ⭐ ${tier}
            </span>
          </div>

          <h3 class="font-serif text-xl font-black text-[#2C2623]">${name}</h3>
          <p class="text-xs text-[#7B7488] font-bold mt-0.5">${email}</p>

          <div class="grid grid-cols-2 gap-2 my-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
            <div class="text-center">
              <span class="text-xs font-bold text-slate-400 block">ดาวสะสม</span>
              <span class="text-lg font-black text-amber-600">⭐ ${stars}</span>
            </div>
            <div class="text-center">
              <span class="text-xs font-bold text-slate-400 block">เหรียญทอง</span>
              <span class="text-lg font-black text-sky-600">⚙️ ${coins}</span>
            </div>
          </div>

          <button onclick="KidobitsAuth.logout()" class="w-full py-3 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-extrabold text-sm border border-rose-200 transition">
            ออกจากระบบ (Log out)
          </button>
        </div>
      `;

      modal.classList.remove('hidden');
      modal.classList.add('flex');
    },

    closeProfileModal() {
      const modal = document.getElementById('kidobitsProfileModal');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    },

    updateUI() {
      const loggedIn = this.isLoggedIn();
      const u = this.getUser();
      const walletUser = window.KidobitsWallet ? window.KidobitsWallet.getUser() : {};
      const name = (u && u.name) || walletUser.name || 'Guest';
      const avatarUrl = (u && u.avatar_url) || walletUser.avatarUrl || '';

      // Update any element with data-kidobits-auth
      document.querySelectorAll('[data-kidobits-auth="login-btn"]').forEach(el => {
        el.style.display = loggedIn ? 'none' : 'inline-flex';
      });

      document.querySelectorAll('[data-kidobits-auth="user-pill"]').forEach(el => {
        el.style.display = loggedIn ? '' : 'none';
      });

      // Update avatar icons with user photo or click listener
      document.querySelectorAll('[data-kidobits-auth="avatar-trigger"]').forEach(el => {
        if (avatarUrl) {
          el.innerHTML = `<img src="${avatarUrl}" class="w-full h-full rounded-full object-cover">`;
        } else {
          el.innerHTML = '👦🏻';
        }
        el.onclick = () => {
          if (KidobitsAuth.isLoggedIn()) {
            KidobitsAuth.showProfileModal();
          } else {
            KidobitsAuth.showLoginModal();
          }
        };
      });

      // Render rewards card if container exists
      this.renderRewardsCard();

      // Dispatch event
      window.dispatchEvent(new CustomEvent('kidobits_auth_updated', {
        detail: { isLoggedIn: loggedIn, user: u }
      }));
    },

    renderRewardsCard() {
      const card = document.getElementById('rewardsAuthCard');
      if (!card) return;
      const loggedIn = this.isLoggedIn();
      const u = this.getUser();

      if (loggedIn && u) {
        card.className = "bg-gradient-to-br from-purple-50 via-indigo-50 to-white rounded-[26px] p-5 border-2 border-purple-200/80 shadow-sm";
        card.innerHTML = `
          <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div class="flex items-center gap-3 w-full sm:w-auto">
              <div class="w-14 h-14 rounded-2xl overflow-hidden border-2 border-purple-300 shadow-sm shrink-0 flex items-center justify-center bg-white text-3xl">
                ${u.avatar_url ? `<img src="${u.avatar_url}" class="w-full h-full object-cover">` : '👦🏻'}
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="font-black text-base text-slate-800">${u.name || 'Member'}</h3>
                  <span class="bg-purple-100 text-purple-700 text-[10px] font-black px-2 py-0.5 rounded-full border border-purple-200">
                    ⭐ ${u.member_tier || 'Explorer'}
                  </span>
                </div>
                <p class="text-xs text-slate-500 font-medium">${u.email || ''}</p>
                <p class="text-[11px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1">
                  <span class="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span> เชื่อมต่อบัญชีแล้ว บันทึกข้อมูลอัตโนมัติ
                </p>
              </div>
            </div>
            <button onclick="KidobitsAuth.logout()" class="w-full sm:w-auto px-4 py-2 rounded-full bg-white hover:bg-rose-50 text-rose-600 font-bold text-xs border border-rose-200 shadow-sm transition active:scale-95">
              ออกจากระบบ (Logout)
            </button>
          </div>
        `;
      } else {
        card.className = "bg-gradient-to-br from-amber-50 via-orange-50 to-white rounded-[26px] p-5 border-2 border-amber-200/80 shadow-sm";
        card.innerHTML = `
          <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div class="flex items-center gap-3.5">
              <div class="w-12 h-12 rounded-2xl bg-amber-400/20 border border-amber-300 flex items-center justify-center text-2xl shrink-0">
                ⭐
              </div>
              <div>
                <h3 class="font-extrabold text-base text-slate-800">เชื่อมต่อบัญชีนักเรียน (Member Login)</h3>
                <p class="text-xs text-slate-500 font-medium">เข้าสู่ระบบเพื่อสะสมดาว ปลดล็อกเหรียญ และเรียนต่อได้ทุกอุปกรณ์</p>
              </div>
            </div>
            <div class="flex items-center gap-2 w-full sm:w-auto">
              <button onclick="KidobitsAuth.loginWithLine()" class="flex-1 sm:flex-none px-4 py-2.5 rounded-full bg-[#06C755] hover:bg-[#05b34c] text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm transition active:scale-95">
                <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 4.269 8.846 10.035 9.608.391.084.922.258 1.057.592.121.303.079.778.039 1.085l-.171 1.027c-.053.303-.242 1.186 1.039.646 1.281-.54 6.911-4.069 9.428-6.967 1.739-1.907 2.573-3.844 2.573-5.993z"/></svg>
                <span>LINE Login</span>
              </button>
              <button onclick="KidobitsAuth.loginWithGoogle()" class="flex-1 sm:flex-none px-4 py-2.5 rounded-full bg-white hover:bg-slate-50 text-slate-700 font-extrabold text-xs border border-slate-200 flex items-center justify-center gap-2 shadow-sm transition active:scale-95">
                <svg class="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
                <span>Google</span>
              </button>
            </div>
          </div>
        `;
      }
    },

    async init() {
      // 1. Check if token returned in URL query
      this.checkUrlToken();

      // 2. If token present, fetch profile from Central Auth
      if (this.isLoggedIn()) {
        await this.fetchProfile();
      }

      // 3. Update DOM
      this.updateUI();
    }
  };

  window.KidobitsAuth = KidobitsAuth;

  // Auto init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => KidobitsAuth.init());
  } else {
    KidobitsAuth.init();
  }
})();
