/** Public Firebase values are read at server runtime, so Docker images need no embedded credentials. */
export function getPushConfig() {
  const config = {
    apiKey: process.env.FIREBASE_WEB_API_KEY?.trim(),
    projectId: process.env.FIREBASE_PROJECT_ID?.trim(),
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID?.trim(),
    appId: process.env.FIREBASE_WEB_APP_ID?.trim(),
  };
  const vapidKey = process.env.FIREBASE_WEB_VAPID_KEY?.trim() || '';
  return { config: Object.values(config).every(Boolean) && vapidKey ? config : null, vapidKey };
}
