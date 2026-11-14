/* Kidobits Phonics — Service Worker
   กลยุทธ์: HTML = network-first (ได้ของใหม่ก่อน), static = stale-while-revalidate
   ต้องมี 캐ชต์ 이름 바꿀 때마다 버전 올리기 */
const VERSION = 'kido-v2-1';
const SHELL = VERSION + '-shell';
const RUNTIME = VERSION + '-rt';

const SHELL_FILES = [
  './index.html',
  './level.html',
  './lesson.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // add แบบทีละไฟล์ กัน pluck ทั้งชุดล้มเพราะไฟล์เดียวพัง
    await Promise.all(SHELL_FILES.map(async f => {
      try { await c.add(new Request(f, { cache: 'reload' })); }
      catch (err) { console.warn('[sw] precache skip', f, err.message); }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isHtml(req) {
  if (req.mode === 'navigate') return true;
  const accept = req.headers.get('accept') || '';
  return accept.includes('text/html');
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // ข้าม third-party
  if (url.pathname.startsWith('/kidobits/stt')) return;  // STT ต้องออนไลน์เท่านั้น
  if (url.pathname.includes('/kidobits/api/')) return;

  // ---- HTML: network-first, ตกไป cache เมื่อออฟไลน์ ----
  if (isHtml(req)) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(SHELL);
        c.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        const hit = await caches.match(req, { ignoreSearch: true });
        if (hit) return hit;
        return (await caches.match('./index.html')) ||
               new Response('<h1>ออฟไลน์</h1>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // ---- static (audio/img/js/css/manifest): stale-while-revalidate ----
  e.respondWith((async () => {
    const c = await caches.open(RUNTIME);
    const hit = await c.match(req);
    const net = fetch(req).then(res => {
      if (res && res.status === 200 && res.type === 'basic') c.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { net; return hit; }
    const res = await net;
    if (res) return res;
    return new Response('', { status: 504, statusText: 'offline' });
  })());
});
