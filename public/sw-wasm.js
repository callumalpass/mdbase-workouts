/*
 * Imported by the service worker ahead of Workbox's own handlers.
 *
 * GitHub Pages serves .wasm gzip-compressed with the compressed size in
 * Content-Length (the runtime is 3,981,261 bytes; the header says 1,615,888).
 * The mdbase SDK rejects an asset whose Content-Length differs from its
 * packaged size, so creating this browser's device failed every time and left
 * a half-made installation behind. Hand the SDK the same decoded bytes without
 * the encoded-size headers; it still checks their length and SHA-256.
 */
function withoutEncodedLength(response) {
  if (!response.ok || !response.headers.has("content-encoding")) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.endsWith(".wasm")) return;
  event.respondWith(fetch(event.request).then(withoutEncodedLength));
});
