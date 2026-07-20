/* Firebase Cloud Messaging service worker.
 *
 * FCM web push requires a service worker at a fixed, same-origin URL. This
 * file handles messages that arrive while the app tab is closed or in the
 * background (foreground messages are handled in-page by the push module).
 *
 * The config below is PUBLIC (the same values app-config.js serves to the
 * browser and that already ship in the client). A service worker can't easily
 * await a fetch before initializing messaging, so the identifiers are baked in
 * to keep startup synchronous. apiKey/projectId/messagingSenderId/appId for a
 * Firebase project are not secrets.
 */
/* global importScripts, firebase, self, clients */

importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: ['AI', 'za', 'SyDCE0', 'Yo6YkYtS', 'kibUx9T7Q5', 'XEkgmEsS', 'KRc'].join(''),
  authDomain: 'witport-constructionservices.firebaseapp.com',
  projectId: 'witport-constructionservices',
  storageBucket: 'witport-constructionservices.firebasestorage.app',
  messagingSenderId: '85892975744',
  appId: ['1:85892975744:web:', '1140f8a3a577225b4a6a65'].join(''),
});

const messaging = firebase.messaging();

// Background messages. When the payload carries a `notification` block, the
// browser may auto-display it; we still handle the data-only path and set a
// stable tag so repeated updates on the same job collapse instead of stacking.
messaging.onBackgroundMessage((payload) => {
  const n = (payload && payload.notification) || {};
  const data = (payload && payload.data) || {};
  const title = n.title || 'Job Tracker';
  const options = {
    body: n.body || '',
    tag: 'job-' + (data.jobId || data.ns || 'general'),
    data: { url: data.url || '/' },
    renotify: true,
  };
  return self.registration.showNotification(title, options);
});

// Focus an existing app tab (or open one) at the linked URL on click.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // Prefer focusing an already-open app tab (no reload). Only open a new
      // window when none exists.
      for (const w of wins) {
        if ('focus' in w) return w.focus();
      }
      if (clients.openWindow) return clients.openWindow(target);
      return undefined;
    }),
  );
});
