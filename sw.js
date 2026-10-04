// ใช้งานออฟไลน์ได้: เก็บไฟล์ของเว็บไว้ในเครื่อง (ส่วน AI ยังต้องต่อเน็ต) · สร้างโดย web/build.py
const CACHE = "cea-4b785dfd2b";
const FILES = ["./", "apple-touch-icon.png", "backend.js", "cfg.js", "data.json", "engine.js", "favicon.svg", "how-it-works.txt", "i18n.js", "icon-192.png", "icon-512.png", "icon.svg", "index.html", "manifest.webmanifest", "panels.js"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE)
  .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;     // Gemini/ตัวกลาง/รูป ไม่ผ่าน cache นี้
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match("./"))));
});
