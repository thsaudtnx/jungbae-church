const CACHE_NAME = 'jb-church-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/css/style.css',
    '/js/main.js',
    '/images/main-logo.png',
    '/images/church-favicon.jpeg'
];

// Install Event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    // Only cache GET requests
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then((networkResponse) => {
                // Don't cache admin routes or large files
                if (event.request.url.includes('/admin') || networkResponse.status !== 200) {
                    return networkResponse;
                }

                // Optionally cache new successful GET requests
                // return caches.open(CACHE_NAME).then((cache) => {
                //   cache.put(event.request, networkResponse.clone());
                //   return networkResponse;
                // });

                return networkResponse;
            }).catch(() => {
                // Return a fallback page if offline and not in cache
                if (event.request.mode === 'navigate') {
                    return caches.match('/');
                }
            });
        })
    );
});
