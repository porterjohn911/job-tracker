const CONFIG_KEYS = [
  ['apiKey', 'FIREBASE_API_KEY'],
  ['authDomain', 'FIREBASE_AUTH_DOMAIN'],
  ['databaseURL', 'FIREBASE_DB_URL'],
  ['projectId', 'FIREBASE_PROJECT_ID'],
  ['storageBucket', 'FIREBASE_STORAGE_BUCKET'],
  ['messagingSenderId', 'FIREBASE_MESSAGING_SENDER_ID'],
  ['appId', 'FIREBASE_APP_ID'],
  ['measurementId', 'FIREBASE_MEASUREMENT_ID'],
];

exports.handler = async () => {
  const config = {};
  for (const [clientKey, envKey] of CONFIG_KEYS) {
    const value = process.env[envKey];
    if (value) config[clientKey] = value;
  }

  if (!config.apiKey || !config.projectId) {
    return {
      statusCode: 204,
      headers: { 'Cache-Control': 'no-store' },
      body: '',
    };
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
