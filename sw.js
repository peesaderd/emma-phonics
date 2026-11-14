/* Kidobits Service Worker
   กลยุทธ์หลัก: หน้า HTML = network-first (ได้ของใหม่เสมอเมื่อออนไลน์)
                   รูป/เสียง/ไอคอน = cache-first (ของหนัก ไม่เปลี่ยนบ่อย)
   ห้ามแคช: PDF (ใหญ่), request ที่ไม่ใช่ GET, โดเมนอื่น
*/
const VERSION = 'kidobits-v1';
const STATIC_CACHE = VERSION + '-static';
const PAGE_CACHE   = VERSION + '-pages';

/* ไฟล์ที่ต้องมีติดเครื่องไว้ตั้งแต่ติดตั้ง (เปิดแอปได้แม้เน็ตหลุดครั้งแรก) */
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png'
];

/* หน้าเรียน — แคชเมื่อเคยเปิด (ไม่ precache เพราะไฟล์ใหญ่) */
const LESSON_PAGES = [
  '/chinese.html',
  '/math.html',
  '/level2_cvc_hub.html',
  '/level3_digraph_hub.html',
  '/english.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

function isStaticAsset(url) {
  return /\.(png|jpg|jpeg|gif|svg|webp|ico|mp3|m4a|wav|ogg|woff2?|ttf)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* ข้ามโดเมนอื่น (CDN tailwind, fonts, confetti) — ปล่อยให้เบราว์เซอร์จัดการ */
  if (url.origin !== self.location.origin) return;

  /* ข้าม PDF — ใหญ่และไม่ต้องออฟไลน์ */
  if (/\.pdf$/i.test(url.pathname)) return;

  /* เสียงและรูป: cache-first */
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          if (res && res.ok && res.status === 200) {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => hit);
      })
    );
    return;
  }

  /* หน้า HTML: network-first, ตกไปแคชเมื่อออฟไลน์ */
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.status === 200) {
          const copy = res.clone();
          caches.open(PAGE_CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => {
        if (hit) return hit;
        /* fallback หน้าหลัก ถ้าไม่เคยเปิดหน้านั้นมาก่อน */
        return caches.match('/index.html');
      }))
  );
});
