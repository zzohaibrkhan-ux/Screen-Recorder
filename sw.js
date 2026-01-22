// Service Worker for Screen Recorder Pro
const CACHE_NAME = 'screen-recorder-v1'
const urlsToCache = [
  '/',
  '/index.html',
  '/src/main.jsx',
  '/src/App.jsx',
  '/src/App.css',
  '/src/index.css',
  '/favicon.ico'
]

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...')
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files')
        return cache.addAll(urlsToCache)
      })
      .then(() => {
        console.log('Service Worker: Cached all files successfully')
        return self.skipWaiting()
      })
      .catch((error) => {
        console.error('Service Worker: Cache failed', error)
      })
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...')
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName)
            return caches.delete(cacheName)
          }
        })
      )
    }).then(() => {
      console.log('Service Worker: Activated')
      return self.clients.claim()
    })
  )
})

// Fetch event - serve cached content when offline
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return
  }

  // Skip chrome-extension and other non-http requests
  if (!event.request.url.startsWith('http')) {
    return
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        if (response) {
          console.log('Service Worker: Serving from cache', event.request.url)
          return response
        }

        console.log('Service Worker: Fetching from network', event.request.url)
        return fetch(event.request).then((response) => {
          // Don't cache if not a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response
          }

          // Clone the response
          const responseToCache = response.clone()

          // Add to cache for future use
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache)
            })

          return response
        }).catch(() => {
          // If network fails and no cache, return offline page
          if (event.request.destination === 'document') {
            return caches.match('/')
          }
        })
      })
  )
})

// Background sync for uploading recordings when online
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync triggered', event.tag)
  
  if (event.tag === 'upload-recordings') {
    event.waitUntil(uploadPendingRecordings())
  }
})

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  console.log('Service Worker: Received message', event.data)
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME })
  }
})

// Function to upload pending recordings
async function uploadPendingRecordings() {
  try {
    // This would typically connect to your backend API
    // For now, we'll just log that sync is working
    console.log('Service Worker: Uploading pending recordings...')
    
    // In a real implementation, you would:
    // 1. Get recordings from IndexedDB
    // 2. Upload them to your server
    // 3. Remove them from local storage after successful upload
    
    return Promise.resolve()
  } catch (error) {
    console.error('Service Worker: Failed to upload recordings', error)
    throw error
  }
}

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification clicked')
  event.notification.close()
  
  event.waitUntil(
    clients.openWindow('/')
  )
})

