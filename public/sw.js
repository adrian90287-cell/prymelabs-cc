// Pryme Labs Service Worker — handles push notifications and PWA caching
const CACHE_NAME = 'prymelabs-v1'

// Install: cache nothing critical, just activate immediately
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// Push event — show notification
self.addEventListener('push', function (event) {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Pryme Labs', body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'Pryme Labs'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/admin' },
    requireInteraction: false,
    silent: false,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// Notification click — open/focus the admin page
self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/admin'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clients) {
        // If admin page already open, focus it
        for (const client of clients) {
          if (client.url.includes('/admin') && 'focus' in client) {
            return client.focus()
          }
        }
        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl)
        }
      })
  )
})
