import { NextRequest, NextResponse } from 'next/server'

/**
 * Serves the Firebase Cloud Messaging service worker script with env config injected.
 * Registered at /api/push/sw so that config can use NEXT_PUBLIC_* at runtime.
 */
export async function GET(request: NextRequest) {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
  }

  const script = `
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp(${JSON.stringify(config)});
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  var title = payload.notification && payload.notification.title ? payload.notification.title : 'Xcel CRM';
  var options = {
    body: (payload.notification && payload.notification.body) ? payload.notification.body : '',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    data: payload.data || {},
    tag: payload.data && payload.data.type ? payload.data.type : 'fcm',
    requireInteraction: false
  };
  if (payload.data && payload.data.click_action) {
    options.data = options.data || {};
    options.data.url = payload.data.click_action;
  }
  return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = event.notification.data && event.notification.data.url;
  if (url) {
    var fullUrl = url.startsWith('http') ? url : (self.location.origin + (url.startsWith('/') ? url : '/' + url));
    event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf(self.location.origin) === 0 && 'focus' in client) {
          client.navigate(fullUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(fullUrl);
      }
    }));
  }
});
`.trim()

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
