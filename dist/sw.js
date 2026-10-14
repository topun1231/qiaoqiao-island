// Retire the old root worker without changing browser saves.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) {
    if (key.startsWith('qiaoqiao-island-four-') || key.startsWith('qiaoqiao-variety-preview-')) await caches.delete(key);
  }
  await self.registration.unregister();
})()));
