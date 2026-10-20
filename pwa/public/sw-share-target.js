// Web Share Target Level 2 fetch interceptor for Img2FEN
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Check if request is a POST targeting our share handler
  if (url.pathname.includes('share-target') && event.request.method === 'POST') {
    event.respondWith((async () => {
      try {
        const formData = await event.request.formData();
        const file = formData.get('image');
        if (file) {
          const cache = await caches.open('img2fen-shared-data');
          await cache.put('shared-image', new Response(file, {
            headers: {
              'content-type': file.type || 'image/png',
              'x-file-name': file.name || 'shared-diagram.png',
              'x-shared-time': Date.now().toString(),
            },
          }));
        }
      } catch (err) {
        console.error('[SW Share Target] Error saving shared image:', err);
      }

      // Safe absolute redirect to root with ?shared=1
      const redirectUrl = new URL('./?shared=1', event.request.url).href;
      return Response.redirect(redirectUrl, 303);
    })());
  }
});
