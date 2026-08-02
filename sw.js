/**
 * הכלי החקלאי של פנורה — Service Worker
 * ============================================================
 * אסטרטגיה: network-first על המסמך.
 *   • יש רשת  → תמיד הגרסה העדכנית מהשרת
 *   • אין רשת → הגרסה האחרונה שנשמרה (עבודה בשדה)
 *
 * מחליף SW ישן שעבד ב-cache-first והחזיק מגדלים על גרסה ישנה
 * בלי שידעו. skipWaiting + clients.claim משתלטים מיד.
 *
 * העלאה: לשורש הריפו, לצד index.html ו-logo.png.
 * בכל פריסה חדשה — הגדל את CACHE_V. זה מנקה מטמונים ישנים.
 */

var CACHE_V = 'panora-2026-08-02';

// ---- התקנה: משתלטים מיד, בלי להמתין לסגירת טאבים ----
self.addEventListener('install', function (e) {
  self.skipWaiting();
});

// ---- הפעלה: מנקים כל מטמון שאינו הגרסה הנוכחית ----
self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.map(function (k) {
      return (k === CACHE_V) ? null : caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

// ---- שליפה ----
self.addEventListener('fetch', function (e) {
  var req = e.request;

  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  // לא נוגעים בקריאות ל-Apps Script או לכל דומיין חיצוני —
  // מחירים, אימות ורישום חייבים תמיד ללכת לרשת.
  if (url.origin !== self.location.origin) return;

  // ---- המסמך: network-first ----
  if (req.mode === 'navigate') {
    e.respondWith((async function () {
      try {
        // no-store: עוקף גם את מטמון ה-HTTP של הדפדפן
        var fresh = await fetch(req, { cache: 'no-store' });
        if (fresh && fresh.ok) {
          var c = await caches.open(CACHE_V);
          c.put(req, fresh.clone());
        }
        return fresh;
      } catch (err) {
        var hit = await caches.match(req);
        if (hit) return hit;
        // גיבוי אחרון — אולי נשמר תחת נתיב השורש
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

  // ---- נכסים סטטיים (לוגו, מניפסט): stale-while-revalidate ----
  e.respondWith((async function () {
    var cached = await caches.match(req);
    var network = fetch(req).then(function (res) {
      if (res && res.ok) {
        caches.open(CACHE_V).then(function (c) { c.put(req, res.clone()); });
      }
      return res;
    }).catch(function () { return null; });

    return cached || (await network) || Response.error();
  })());
});
