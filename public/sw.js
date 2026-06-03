const CACHE_NAME = 'mimi-crm-v3'
const API_CACHE = 'mimi-api-v3'
const QUEUE_DB = 'mimi-offline-queue'
const QUEUE_STORE = 'actions'

const CACHEABLE_APIS = [
  '/api/clientes',
  '/api/productos',
  '/api/pipeline/stages',
]

// Static asset destinations that are safe to cache (no HTML documents)
const STATIC_DESTINATIONS = ['script', 'style', 'image', 'font', 'worker', 'manifest']

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB, 1)
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(QUEUE_STORE, {
        keyPath: 'id',
        autoIncrement: true,
      })
    }
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror = () => reject(req.error)
  })
}

async function enqueue(entry) {
  const db = await openQueueDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite')
    const req = tx.objectStore(QUEUE_STORE).add(entry)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function dequeue(id) {
  const db = await openQueueDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite')
    const req = tx.objectStore(QUEUE_STORE).delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function getAllQueued() {
  const db = await openQueueDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly')
    const req = tx.objectStore(QUEUE_STORE).getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ── Sync queued actions ───────────────────────────────────────────────────────

async function flushQueue() {
  const items = await getAllQueued()
  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      })
      if (res.ok) {
        await dequeue(item.id)
        // Notify all clients so they can invalidate queries
        const clients = await self.clients.matchAll()
        clients.forEach((c) =>
          c.postMessage({ type: 'OFFLINE_SYNC_DONE', url: item.url }),
        )
      }
    } catch {
      // Still offline — keep in queue
    }
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Purge all old caches (including v2 HTML caches)
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME && k !== API_CACHE)
            .map((k) => caches.delete(k)),
        ),
      ),
      flushQueue(),
      // Take immediate control of all open clients
      self.clients.claim(),
    ]),
  )
})

self.addEventListener('online', () => {
  void flushQueue()
})

// ── Fetch ─────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Repartidor API — always network-only, never cached or queued.
  // Delivery confirmations and fresh order lists must come from the network.
  if (url.pathname.startsWith('/api/repartidor/')) {
    return // SW does not intercept; browser sends directly to server
  }

  // Queue offline POST/PATCH mutations for key API endpoints
  if (
    ['POST', 'PATCH'].includes(request.method) &&
    (url.pathname.startsWith('/api/pedidos') || url.pathname.startsWith('/api/clientes'))
  ) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request.clone())
        } catch {
          // Offline — queue the action
          const body = await request.clone().text()
          await enqueue({
            url: request.url,
            method: request.method,
            headers: Object.fromEntries(request.headers.entries()),
            body,
            queuedAt: Date.now(),
          })
          return new Response(
            JSON.stringify({ queued: true, offline: true }),
            {
              status: 202,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      })(),
    )
    return
  }

  if (request.method !== 'GET') return

  // GET API routes: network-first, stale fallback for cacheable APIs
  if (url.pathname.startsWith('/api/') && CACHEABLE_APIS.some((a) => url.pathname.startsWith(a))) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone()
          caches.open(API_CACHE).then((cache) => cache.put(request, clone))
          return res
        })
        .catch(() => caches.match(request)),
    )
    return
  }

  // NAVIGATIONS: ALWAYS network-first — never serve cached HTML.
  // Auth middleware must run on every page navigation to enforce session/role checks.
  // Serving a cached authenticated page for a different user is a privacy violation.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Sin conexión</title></head>' +
          '<body style="font-family:sans-serif;text-align:center;padding:4rem">' +
          '<h2>Sin conexión</h2><p>Revisá tu red e intentá de nuevo.</p>' +
          '<button onclick="location.reload()">Reintentar</button></body></html>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        ),
      ),
    )
    return
  }

  // STATIC ASSETS ONLY: stale-while-revalidate.
  // Restricted to scripts, styles, images, fonts — never documents.
  if (
    !url.pathname.startsWith('/api/') &&
    (STATIC_DESTINATIONS.includes(request.destination) ||
      url.pathname.startsWith('/_next/static/') ||
      /\.(js|css|woff2?|ttf|otf|eot|png|jpe?g|gif|webp|svg|ico)$/.test(url.pathname))
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return res
        })
        return cached ?? network
      }),
    )
  }
  // All other non-API, non-asset, non-navigation requests: pass through to network (no caching)
})

// Flush queue when back online via sync event (Background Sync API)
self.addEventListener('sync', (event) => {
  if (event.tag === 'mimi-offline-flush') {
    event.waitUntil(flushQueue())
  }
})

// Flush on message from client
self.addEventListener('message', (event) => {
  if (event.data?.type === 'FLUSH_QUEUE') {
    void flushQueue()
  }
})
