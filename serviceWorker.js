self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => caches.delete(cache))
            );
        }).then(() => {
            return self.registration.unregister();
        }).then(() => {
            return self.clients.matchAll();
        }).then((clients) => {
            clients.forEach((client) => {
                if (client.url) {
                    client.navigate(client.url);
                }
            });
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Return network directly
    event.respondWith(fetch(event.request));
});
