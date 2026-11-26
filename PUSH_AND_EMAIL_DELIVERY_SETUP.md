# RADAR push and email delivery setup

Push and email are separate delivery channels. A successful browser subscription does not mean the backend has VAPID credentials, and a saved newsletter address does not receive story emails until it confirms ownership of that address.

## 1. Enable Web Push on Render

In the Render dashboard, open the studentnews-backend service and add these environment variables:

- VAPID_PUBLIC_KEY
- VAPID_PRIVATE_KEY
- VAPID_SUBJECT — use a contact address such as mailto:newsroom@example.com or the public HTTPS site URL.

Generate a matching key pair on a trusted local computer from the backend directory:

```bash
npx web-push generate-vapid-keys
```

Copy the public key into VAPID_PUBLIC_KEY and the private key into VAPID_PRIVATE_KEY. Keep the private key only in Render's secret environment settings. Never commit it, put it in a frontend VITE_* variable, or share it in screenshots.

Redeploy the Render service after saving the variables. Check:

- GET /api/push/status returns enabled: true.
- GET /api/push/public-key returns a public key.
- The user enables notifications from the website while signed in or signed out, and accepts the browser permission prompt.
- The phone/browser has not blocked notifications for the site.

The frontend reads the public VAPID key from the backend, so rotating the pair does not require exposing the private key or rebuilding the frontend.

### Phone behaviour and quiet alerts

RADAR's default for new subscriptions is now quiet: the phone can display the notification without a sound or vibration. The reader can change that device's quiet setting.

Web Push is not a hidden, invisible background messaging channel. Browsers require a user-visible notification for push events (userVisibleOnly). On supported phones the service worker can receive the event while the site is closed, but the notification still appears in the system notification area. On iPhone/iPad, web push requires a supported iOS/iPadOS version and the site to be installed on the Home Screen; the reader must enable notifications from that installed web app.

## 2. Enable newsletter and story emails

Use one provider path on the Render backend.

### Mailjet HTTPS API

Set:
- MAILJET_API_KEY
- MAILJET_SECRET
- MAIL_FROM_EMAIL — an address verified with Mailjet.
- MAIL_FROM_NAME — for example RADAR Newsroom.
- PUBLIC_URL — https://ijwi-ry--ukuri.web.app.
- CLIENT_URL — https://ijwi-ry--ukuri.web.app.

The Mailjet API path uses HTTPS and is preferred when outbound SMTP ports are restricted.

### SMTP alternative

If using another SMTP provider, set:
- SMTP_HOST
- SMTP_PORT — commonly 587 (STARTTLS) or 465 (implicit TLS).
- SMTP_USER
- SMTP_PASSWORD
- MAIL_FROM_EMAIL
- MAIL_FROM_NAME
- PUBLIC_URL and CLIENT_URL as above.

Do not put provider passwords or API secrets in GitHub source files.

## 3. Verify actual delivery

1. Open the admin Mail desk and refresh its diagnostics.
2. Send a test email to an inbox you can check.
3. Confirm that the mail desk records it as accepted by the provider. If it is rejected, use the recorded provider reason to correct the sender verification, credentials, or provider account.
4. A reader's newsletter row starts as pending. The reader must open the confirmation email and click its confirmation link before story alerts are sent.
5. Check the Mail desk again after a test subscription. A queued result means the provider had not answered before the site's short response budget; it is not proof of delivery. A rejected or not-configured result means no confirmation email was accepted.

Provider acceptance is not a guarantee that a message reached the inbox. Check spam/junk, provider delivery events, suppression/bounce lists, and sender-domain SPF/DKIM/DMARC when a provider accepts a message but the mailbox does not show it.