// 离线缓存：打开时直接用缓存里的页面（秒开、断网可用），同时在后台联网检查新版本，
// 有更新就存进缓存并通知页面，下次打开生效。
const CACHE = 'diet-tracker-v3';
const PAGE = new URL('./', self.registration.scope).href;
// 页面里带着这个标记才算是这个 App。校园 Wi-Fi 登录页、托管平台的错误页这类"看起来正常"的页面，
// 不会被当成新版本存进缓存
const MARK = 'name="app" content="diet-tracker"';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    try { await refresh(PAGE, null); } catch (err) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(openPage(e));
});

// 联网取页面；确认是这个 App、并且和缓存里的不一样时才存进缓存。返回是否有更新
async function refresh(url, cachedText){
  const res = await fetch(url, {cache: 'no-cache', credentials: 'same-origin'});
  if (!res.ok) return false;
  const text = await res.text();
  if (!text.includes(MARK) || text === cachedText) return false;
  // 重新包装成干净的响应：经过重定向的响应不能直接用于页面导航（Safari 会拒绝）
  const cache = await caches.open(CACHE);
  await cache.put(PAGE, new Response(text, {headers: {'Content-Type': 'text/html; charset=utf-8'}}));
  return true;
}

async function openPage(e){
  const cache = await caches.open(CACHE);
  const cached = await cache.match(PAGE);

  if (cached) {
    const cachedText = await cached.clone().text();
    e.waitUntil((async () => {
      try {
        if (await refresh(e.request.url, cachedText)) {
          const clients = await self.clients.matchAll({type: 'window'});
          clients.forEach(c => c.postMessage({type: 'updated'}));
        }
      } catch (err) {}
    })());
    return cached;
  }

  // 还没有缓存：正常联网打开，顺便把页面存起来
  try {
    const res = await fetch(e.request);
    if (res.ok) {
      const text = await res.clone().text();
      if (text.includes(MARK)) await cache.put(PAGE, new Response(text, {headers: {'Content-Type': 'text/html; charset=utf-8'}}));
    }
    return res;
  } catch (err) {
    return new Response('<meta charset="utf-8"><meta name="viewport" content="width=device-width"><p style="font:17px -apple-system,sans-serif;padding:40px 24px;color:#555">现在无法联网，请联网后再打开一次。</p>',
      {headers: {'Content-Type': 'text/html; charset=utf-8'}});
  }
}
