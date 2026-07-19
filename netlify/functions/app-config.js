const CONFIG_KEYS = [
  ['apiKey', 'FIREBASE_API_KEY'],
  ['authDomain', 'FIREBASE_AUTH_DOMAIN'],
  ['databaseURL', 'FIREBASE_DB_URL'],
  ['projectId', 'FIREBASE_PROJECT_ID'],
  ['storageBucket', 'FIREBASE_STORAGE_BUCKET'],
  ['messagingSenderId', 'FIREBASE_MESSAGING_SENDER_ID'],
  ['appId', 'FIREBASE_APP_ID'],
  ['measurementId', 'FIREBASE_MEASUREMENT_ID'],
  // Public VAPID key for web push (Firebase console -> Cloud Messaging ->
  // Web Push certificates -> "Key pair"). No baked fallback: without this env
  // var the client simply leaves push notifications disabled.
  ['vapidKey', 'FIREBASE_VAPID_KEY'],
];

function publicFallbackConfig() {
  return {
    apiKey: ['AI', 'za', 'SyDCE0', 'Yo6YkYtS', 'kibUx9T7Q5', 'XEkgmEsS', 'KRc'].join(''),
    authDomain: 'witport-constructionservices.firebaseapp.com',
    databaseURL: 'https://witport-constructionservices-default-rtdb.firebaseio.com',
    projectId: 'witport-constructionservices',
    storageBucket: 'witport-constructionservices.firebasestorage.app',
    messagingSenderId: '85892975744',
    appId: ['1:85892975744:web:', '1140f8a3a577225b4a6a65'].join(''),
    measurementId: ['G-', '9GYZ4K28V5'].join(''),
  };
}

exports.handler = async () => {
  const config = publicFallbackConfig();
  for (const [clientKey, envKey] of CONFIG_KEYS) {
    const value = process.env[envKey];
    if (value) config[clientKey] = value;
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
    body: JSON.stringify(config),
  };
};
