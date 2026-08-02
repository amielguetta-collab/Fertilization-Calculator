/**
 * הכלי החקלאי של פנורה — Service Worker
 * ============================================================
 * מעלים פעם אחת. אין צורך לגעת בו שוב — גם לא בפריסות עתידיות.
 *
 * למה: המסמך מוגש ב-network-first עם no-store, כלומר כשיש רשת
 * המגדל תמיד מקבל את ה-index.html העדכני מהשרת. המטמון הוא
 * גיבוי לאופליין בלבד, ונדרס בכל טעינה מוצלחת.
 * הנכסים הסטטיים מתרעננים ברקע (stale-while-revalidate).
 * לכן אין גרסה לקדם ואין מטמון לנקות ידנית.
 *
 * העלאה: לשורש הריפו, לצד index.html.
 */

var CACHE = 'panora';   // שם קבוע. לא לשנות.

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    // ניקוי מטמונים משמות אחרים (למשל של SW ישן שהיה כאן קודם)
    var keys = await caches.keys();
    await Promise.all(keys.map(function (k) {
      return (k === CACHE) ? null : caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  // דומיינים חיצוניים — תמיד ישירות לרשת.
  // מחירים, אימות ורישום ב-Apps Script לא עוברים דרך המטמון.
  if (url.origin !== self.location.origin) return;

  // ---- המסמך: network-first ----
  if (req.mode === 'navigate') {
    e.respondWith((async function () {
      try {
        var fresh = await fetch(req, { cache: 'no-store' });
        if (fresh && fresh.ok) {
          var c = await caches.open(CACHE);
          c.put(req, fresh.clone());
        }
        return fresh;
      } catch (err) {
        var hit = await caches.match(req);
        if (hit) return hit;
        var root = await caches.match('./');
        return root || new Response(
          '<meta charset="utf-8"><p style="font:16px Heebo,sans-serif;text-align:center;padding:40px">' +
          'אין חיבור לרשת ואין עותק שמור.</p>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })());
    return;
  }

  // ---- נכסים סטטיים: stale-while-revalidate ----
  e.respondWith((async function () {
    var cached = await caches.match(req);
    var network = fetch(req).then(function (res) {
      if (res && res.ok) {
        caches.open(CACHE).then(function (c) { c.put(req, res.clone()); });
      }
      return res;
    }).catch(function () { return null; });

    return cached || (await network) || Response.error();
  })());
});
