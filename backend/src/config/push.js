const webpush = require('web-push');
const env = require('./env');

// Push is opt-in: without a VAPID pair the API still answers the public routes,
// it just reports that delivery is not configured instead of crashing on boot.
const configured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

if (configured) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
}

module.exports = { webpush, configured };
