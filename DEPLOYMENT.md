# Deployment — IJWI R'UKURI (Render + Firebase Hosting + MongoDB Atlas)

| Piece | Host | Config |
| --- | --- | --- |
| Frontend SPA (React 19 + Vite 5 + TS) | **Firebase Hosting** — https://ijwi-ry--ukuri.web.app | `frontend/firebase.json`, `frontend/.firebaserc` |
| Backend API (Express 4 + Mongoose 8) | **Render** web service `studentnews-backend` (free plan, created manually from the dashboard) | env set in the dashboard; `render.yaml` mirrors it |
| Database | **MongoDB Atlas** cluster `cluster0.zzcgd1i`, database `ijwi` | `MONGODB_URI` |
| Source | https://github.com/mugisha-kevin-250/ijwi-ry-ukuri (branch `main`) | — |

## What is already done
- Light mode is the only startup state: `ThemeContext` ignores the device
  `prefers-color-scheme`, so a dark-mode phone still opens the site white. Dark turns
  on only from Settings -> Theme (stored as `theme=dark` in localStorage).
- PWA install: logo-derived icons (`frontend/scripts/generate-icons.mjs` ->
  `frontend/public/icons/` + `favicon-*.png`), `frontend/public/site.webmanifest`,
  and `frontend/public/sw.js` (offline shell/pages/public API reads; signed-in routes
  are never cached). `InstallPromptBanner` shows the blue/white install + alerts prompt.
- Turning alerts on is not limited to that prompt: `NewsAlertsCard`
  (`frontend/src/components/pwa/NewsAlertsCard.tsx`) is a permanent switch on the home
  page and on a reader's own profile, so alerts can be enabled inside the installed app
  (standalone windows included - the banner used to skip them) or re-enabled after the
  prompt was dismissed. Push is delivered by the operating system, so it still arrives
  while the phone sleeps or the browser is closed; the app itself never has to be open.
- Google sign-in: `frontend/index.html` loads `accounts.google.com/gsi/client?hl=en`
  while the page is still parsing, so `GoogleButton` finds the SDK already there instead
  of fetching it when the form opens. `hl=en` is what keeps the button label English -
  `locale: 'en'` alone is overridden by the reader's Google account language.
- Web Push: backend `web-push` with VAPID (`backend/src/routes/pushRoutes.js`),
  subscriptions in the `pushsubscriptions` Atlas collection, automatic alerts when a
  story is first published, plus a manual broadcast in Admin -> Settings.
- In-app inbox: `backend/src/services/notificationService.js` writes one `new_story`
  `Notification` per ADMIN and per follower the first time a story goes public, and the
  header bell polls `GET /api/notifications` (which also returns `unread`). This is the
  half that works without VAPID keys — push to installed devices still needs them.
- Search: `frontend/public/robots.txt`, a generated `frontend/public/sitemap.xml`
  (every article and category as its own URL), per-route canonical/OG/Twitter tags and
  `NewsArticle` JSON-LD (`frontend/src/utils/useSeo.ts`), and the Search Console
  verification `<meta name="google-site-verification">` in `frontend/index.html`
  (never remove that tag or ownership is lost).
- Publisher pages readers and reviewers ask for: `/about`, `/contact`,
  `/editorial-policy`, `/corrections`, `/advertising`, `/privacy`, `/cookies`,
  `/disclaimer`, `/terms`, each its
  own page under `frontend/src/pages/public/`, all in the footer and in
  `sitemap-pages.xml`. Their wording describes what this site really does; where a fact
  depends on the owner (the contact address), the page says so instead of inventing one.
- Analytics and advertising, off until configured and then off until the reader agrees:
  `frontend/src/utils/analytics.ts` loads GA4 only when `VITE_GA_MEASUREMENT_ID` is in
  the build and reports `page_view`
  per route plus share, copy_link and search — no names, emails or story drafts travel.
  `frontend/src/utils/adsense.ts` and `frontend/src/components/ads/AdSlot.tsx` reserve
  layout-stable slots and fetch nothing without `VITE_ADSENSE_CLIENT`, and `ads.txt` is
  generated from `VITE_ADSENSE_PUB_ID`. On top of that, `frontend/src/utils/consent.ts`
  and `components/consent/ConsentBanner.tsx` ask the reader once, store the answer in
  that browser under `ijwiryukuri-consent`, and hold both Google scripts back until the
  answer is yes — so turning on either id also turns on the banner. `/cookies` lists
  what is stored and lets the reader take the answer back.
- Gemini story writer, admin-only: `POST /api/admin/ai/generate` and
  `/api/admin/ai/articles` behind `authorize('ADMIN')`, a server-side kill switch in
  Admin -> AI Writer, and a review gate — a generated story is saved as a `draft` and
  only reaches readers when the admin publishes it, even with auto-publish on. The key
  never leaves the server (`GEMINI_API_KEY`), and the calls are capped per client IP.
- English is the default language, with Kinyarwanda, French and Kiswahili selectable
  from the flag menu in the header (`frontend/src/context/I18nContext.tsx`).
- Abuse limits and clean storage: rate limits on sign-in, uploads and the AI writer,
  all text through `backend/src/utils/textFields.js` before it is stored, and a
  `Content-Security-Policy` header on every hosted response. See "Security settings".

### Regenerating PWA + SEO assets
```
cd frontend
npm run icons       # Logo.png -> icons/ + favicons (needs jimp, a devDependency)
npm run sitemap     # live API -> public/sitemap*.xml (also runs automatically in prebuild)
npm run ads-txt     # VITE_ADSENSE_PUB_ID -> public/ads.txt (also runs in prebuild)
```
`npm run build` regenerates both first, so publishing new stories only needs a
rebuild + redeploy to grow the sitemaps. With no AdSense publisher id the `ads-txt`
script writes no file, which is what you want: an `ads.txt` with a placeholder record
is a policy problem, not a missing feature.

## Migration and pre-existing setup
- Local content migrated into Atlas (`backend/scripts/migrate-local-to-atlas.js`), and the
  dev backend runs against Atlas.
- Frontend built with `frontend/.env.production` and deployed to Firebase Hosting.
- Uploads resolve through `UPLOAD_DIR` (`config/env.js` -> `uploadRoutes.js` + `app.js`
  `express.static`), so the path is configurable per host instead of hardcoded.
- `/uploads/...` paths in API responses are rewritten to the Render origin at runtime
  (`frontend/src/services/apiClient.ts`), so images render on the Firebase origin.
- CORS is pinned to the `CLIENT_URL` allowlist; `/api-docs` is disabled in production.
- Admin portal lives at `/mugishaimekevin` (login with username + password).
- Secrets are gitignored: `.env.render` (Render values), `backend/.env`, `frontend/.env`.
  Only `.env.example` and the credential-free `.env.production` are tracked.

## Render service settings (as created from the dashboard)

The service was created as a plain **New Web Service**, not from the Blueprint, so
`render.yaml` is documentation only — the dashboard is the source of truth.

| Field | Value |
| --- | --- |
| Name | `studentnews-backend` (the URL is baked into the frontend bundle; renaming needs a frontend rebuild) |
| Root Directory | `backend` |
| Build Command | `npm install --omit=dev` (no lockfile, so not `npm ci`; not `yarn`) |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Plan | `free` |

Env vars: see the gitignored `.env.render`. Two things the free plan forces:

- `UPLOAD_DIR=/opt/render/project/src/backend/uploads`. `/var/uploads` cannot be
  created there (`EACCES: permission denied, mkdir '/var/uploads'` -> crash loop),
  because free instances have no persistent disk and `/var` is not writable.
- `NODE_VERSION=20`. Without it Render builds on its rolling default (Node 24 was
  used on the first attempt), which makes deploys non-reproducible.

**Push notifications need one more paste**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
and `VAPID_SUBJECT` (values in `.env.render`). Everything else works without them —
`GET /api/push/status` reports `enabled: false`, every alerts switch shows "not
switched on yet" instead of a button that would fail, and
`POST /api/push/broadcast` answers 503 instead of crashing.

To move uploads onto a real disk: upgrade to `starter`, uncomment the `disks:` block
in `render.yaml`, mount it at `/var/uploads`, and set `UPLOAD_DIR=/var/uploads`
(`SEED_UPLOADS_DIR` stays at the source path so the disk gets seeded on first boot).

**Atlas Network Access**: free instances have rotating egress IPs, so add `0.0.0.0/0`
("Access From Anywhere") in Atlas -> Network Access. Skipping this is the usual cause
of a deploy that builds but logs `MongoDB unavailable; retrying in 15 seconds` forever.

If Render renames the service (name taken), update `frontend/.env.production`, then
`npm run build` and `npx firebase-tools deploy --only hosting`.

## Keys to paste before the next deploy

Two values are missing from the Render dashboard and the frontend build. Nothing else
breaks without them — each feature switches itself off — but the app cannot deliver the
feature until the key is in.

| Paste into | Variable | Where the value comes from | Without it |
| --- | --- | --- | --- |
| Render env | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `.env.render`, generated with `npx web-push generate-vapid-keys` | `GET /api/push/status` -> `enabled: false`, the alerts switches fall back to a "not switched on yet" note, `/api/push/broadcast` answers 503. |
| Render env | `GOOGLE_CLIENT_ID` | `423361172120-8m17rtkmh91qc5b3r9o3qc3s5c2tvh9f.apps.googleusercontent.com` — Google Cloud -> Google Auth Platform -> Credentials -> OAuth client ID (Web application). Its **Authorized JavaScript origins** are `https://ijwi-ry--ukuri.web.app` and `http://localhost:5173`. The *client secret* is not used by this flow; never paste it anywhere. | `POST /api/auth/google` -> 503 "Google sign-in is not configured on this server". |
| `frontend/.env.production` (then rebuild) | `VITE_GOOGLE_CLIENT_ID` | the same Client ID, the public half — already set and deployed | the "Continue with Google" button is not rendered at all. |
| Render env | `GEMINI_API_KEY` | Google AI Studio -> API keys. **The key used earlier in this project appeared in a chat log, so create a new one and retire that.** `GEMINI_MODEL` (default `gemini-flash-lite-latest`) and `GEMINI_TIMEOUT_MS` are optional. | Admin -> AI Writer says the writer is not configured and hides the form; the `POST /api/admin/ai/*` endpoints answer 503. |
| `frontend/.env.production` (then rebuild) | `VITE_GA_MEASUREMENT_ID` | Google Analytics -> Admin -> Property details -> Measurement ID (`G-XXXXXXXXXX`). | No Google script is fetched and nothing at all is reported — the site behaves exactly as it did before analytics existed. Adding it also makes the consent banner appear, and GA only loads for readers who answer yes. |
| `frontend/.env.production` (then rebuild) | `VITE_ADSENSE_CLIENT`, `VITE_ADSENSE_PUB_ID`, `VITE_ADSENSE_SLOT_*` | AdSense -> By ad unit. The two ids are the same publisher number with different prefixes. | No ad script, empty ad boxes are never rendered, and `npm run ads-txt` writes no `ads.txt` file for Google to fetch. A placement only shows once it has its own `VITE_ADSENSE_SLOT_<NAME>` value, and only for readers who answered yes. |
| `frontend/.env.production` (then rebuild) | `VITE_CONTACT_EMAIL` | the address the newsroom actually reads. | `/contact`, `/corrections`, `/advertising`, `/terms` and the footer tell readers to comment under a story instead of printing an address that does not exist. |
| `frontend/.env.production` (then rebuild) | `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` | a TURN service (the free public relays are shut down). | Live video falls back to the slow JPEG relay through Render, and a viewer on a symmetric-NAT mobile network may get nothing. |

Anything that lives in `.env.production` is inlined into the published bundle, so it is
public by design: only ids meant to be public go there, and each one needs
`npm run build` before it takes effect.

## Security settings that are now part of the running site

- **JWT.** `JWT_SECRET` must be set in production or the API refuses to start; the
  default `dev-secret-key` is rejected on purpose. Tokens are always verified with
  `HS256` (`config/env.js` -> `JWT_ALGORITHM`), so a token that claims another algorithm
  is refused instead of being checked with it. `JWT_REFRESH_SECRET` no longer exists in
  the code — delete it from the Render dashboard when you are in there.
- **Rate limits** (`app.js`, keyed on the client IP from `X-Forwarded-For` because
  Render and Firebase both proxy): sign-in, registration and password-reset routes get
  20 attempts per 15 minutes (successful calls are not counted), `/api/upload` 60 per
  hour, and the two Gemini endpoints 10 per hour. Over the limit answers 429 with a
  readable sentence.
- **Stored text.** Every write path runs through `backend/src/utils/textFields.js`:
  control/zero-width/bidi characters are stripped, lengths are capped, markup is removed
  from titles, names and chat, `javascript:` and friends never reach the database, and
  an empty-after-cleaning title, summary or body is a 400 instead of a blank story.
  Article bodies keep their markup because the reader renders them through
  `frontend/src/utils/sanitizeHtml.ts`.
- **Error responses.** The handler logs `METHOD /path: message` (the stack only outside
  production) and never serialises a whole error object to the client.
- **Content-Security-Policy** ships as a Firebase Hosting response header for `/**`
  (`frontend/firebase.json`). It is the reason `pagead2.googlesyndication.com`,
  `www.googletagmanager.com`, `accounts.google.com` and the Google Translate origins are
  listed; **adding any other third-party script means adding its origin there first**, or
  the browser blocks it and the feature looks broken with no server-side error.
- `helmet` sets the rest of the protective headers, uploads are size- and type-checked,
  and `/api-docs` is disabled in production.

## Uploaded images live in the database

No key is needed. `POST /api/upload/image` hands the bytes to
`backend/src/services/uploadStore.js`, which writes an `uploads` document in Atlas and
mirrors the file onto the local disk as a cache. `/uploads/<name>` is served by
`express.static` first and by `GET /uploads/:filename` (the Atlas copy) when the disk has
been wiped, so an image a writer uploaded today is still there after the next redeploy.

`UPLOAD_STORE_LIMIT_MB` (default 400) caps the collection: Atlas M0 gives the whole
cluster 512MB, and a full cluster breaks every query, not just images. Uploads past the
cap answer 507 with "The image store is full".

Serving bytes from the database counts against Atlas' monthly egress, so the response
carries `Cache-Control: public, max-age=31536000, immutable` and the disk copy is kept
whenever it exists: a file is read from Atlas once per deploy per reader at most. If that
ever becomes the binding limit, the escape hatch is the `starter` plan plus the commented
`disks:` block in `render.yaml`.

Verify by uploading an image and reloading the page — the URL must come back
`200 image/jpeg` from `https://studentnews-backend.onrender.com/uploads/<name>`. Google
sign-in needs `npm run build` in `frontend/` afterwards, because Vite inlines the client
ID at build time.

## Verifying a deploy
- `GET https://studentnews-backend.onrender.com/api/health` -> `{"success":true,...}`.
- Render logs must show `MongoDB connected: ac-...mongodb.net`, **not** `127.0.0.1`.
  A local host means `MONGODB_URI` did not take effect. (`database.js` throws in
  production when `MONGODB_URI` is unset, so a silent in-memory DB is no longer possible.)
- Home page, `/article/<slug>` and `/category/<slug>` opened **directly** must render, not
  404 — that proves the SPA rewrite in `firebase.json`.
- `GET /robots.txt`, `/sitemap.xml`, `/site.webmanifest` and `/sw.js` must all return
  200 from Firebase Hosting (they are copied from `frontend/public/` into `dist/`).
  `/sw.js` must carry `Cache-Control: no-store` — otherwise an updated worker can take a
  whole day to reach installed devices.
- `GET /api/push/public-key` returns the VAPID key; `GET /api/push/status` returns
  `enabled: true`. The app fetches the key from the API, so a rotated pair needs no
  frontend rebuild.

## Getting indexed (Search Console)
1. Property `https://ijwi-ry--ukuri.web.app/` — verify with the **HTML tag** method. The
   tag is already in `frontend/index.html`; click Verify once the deploy is live.
2. Submit `https://ijwi-ry--ukuri.web.app/sitemap.xml` under Pages -> Sitemaps. It is an
   index of `sitemap-pages.xml` (home, articles, categories, search, the publisher
   pages), `sitemap-articles.xml`, `sitemap-categories.xml`, `sitemap-writers.xml` and
   `sitemap-news.xml`, so one submission covers everything; drafts, the admin portal and
   signed-in routes are never in it.
3. Submit `https://ijwi-ry--ukuri.web.app/sitemap-news.xml` too (or rely on it being
   listed in the index). Google News only honours the last two days of entries, which is
   why the generator keeps that file short.
4. Use URL Inspection -> Request indexing for the home page and a few articles. Google
   needs the pages to return content, which they do after JS runs; "soft 404" reports
   usually mean the article list was empty when crawled.
5. After each publishing session, `npm run build` regenerates the sitemaps from the live
   API and the deploy pushes them.
6. `https://ijwi-ry--ukuri.web.app/feed.xml` is the RSS 2.0 feed (also linked from every
   page as `<link rel="alternate">`). Register the site in Google Publisher Center with
   this feed and the news sitemap as its sources; that, not the sitemap alone, is what
   gets a site into Top Stories.

## Live video (admin -> everyone)
`POST /api/live` starts a broadcast (ADMIN only, one at a time) and `/live` on the frontend
carries it. The video itself is **peer-to-peer WebRTC**: the broadcaster holds one
`RTCPeerConnection` per viewer and only SDP/ICE, chat and the audience count travel through
socket.io (`backend/src/sockets/liveSocket.js`, attached to the same HTTP server as the API).

- Socket CORS reuses `CLIENT_URL`; the Firebase origin must stay in that list or every
  viewer is rejected at handshake.
- `ICE_SERVERS` is STUN-only until `VITE_TURN_URLS`, `VITE_TURN_USERNAME` and
  `VITE_TURN_CREDENTIAL` are set in `frontend/.env.production` and the frontend is rebuilt
  (the free public relays are all shut down now). Without a relay a viewer on a
  symmetric-NAT mobile network cannot be reached at all, so the broadcaster's tab also
  pumps the camera through Render as a JPEG every ~0.5s (`startFrameRelay` in
  `frontend/src/utils/liveMedia.ts`, relayed by `live:frame` to the room) and the viewer
  paints the newest frame in an `<img>` until the direct call starts working. That fallback
  is soft and slow, and it costs the free instance bandwidth: each frame is received once
  and re-sent once per viewer, so a busy broadcast is capped by Render's egress, not by the
  camera. A TURN relay is still the only path to real video for everyone.
  When neither the call nor the frames arrive the viewer sees "No video is arriving" with a
  retry button instead of a silent black box.
- The viewer's `<video>` starts **muted** and carries an "Unmute sound" button: a stream with
  an audio track is not allowed to autoplay unmuted without a user gesture, so an unmuted
  element simply never starts painting frames (this was the black screen viewers reported).
  The broadcaster's own preview is muted for the same reason.
- The free Render plan sleeps when idle, so the first joiner after a quiet period pays the
  cold start and the video may need a second attempt.
- `/live` is in the sitemap. On the public site the nav links and the red **Live** button have
  their own row under the logo/actions row (`Header`), because they were being clipped inside a
  scrollable strip; that row is 44px tall, which is why `PublicLayout` uses `md:pt-[108px]`.
  `LiveButton` polls `/api/live/current` every 20s and blinks only while a broadcast is active.

## Releasing a frontend change
```
cd frontend
# 1. bump VERSION in public/sw.js (see the comment there) — skipped, returning
#    readers keep the previous bundle from the service worker cache forever.
npm run build                              # tsc -b && vite build -> dist/
npx firebase-tools deploy --only hosting   # uses .firebaserc (ijwi-ry--ukuri)
```
Vite inlines `VITE_*` at **build** time: editing `.env.production` without rebuilding
redeploys the old API URL.

To confirm the swap actually reached a device: the served `index.html` and the running
page must reference the same `assets/index-*.js` hash (`curl -s https://ijwi-ry--ukuri.web.app/`
vs the browser's Network tab). A mismatch means the old service worker is still in charge.

## Admin account
`bootstrapAdmin()` in `backend/src/utils/seedUsers.js` creates or promotes the first
ADMIN once, guarded by the `adminBootstrapped` PlatformSetting flag, so later credential
edits are not reverted on restart.

- It only acts when `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_EMAIL` and
  `BOOTSTRAP_ADMIN_PASSWORD` are in the environment. Set them in Render, deploy once,
  sign in at `/mugishaimekevin/login`, change the password in Admin -> Settings, then
  delete the three variables. Without them production logs a warning and starts anyway
  with no new admin — which is correct for a database that already has one.
- **No admin password is committed any more.** The old seed created `kevin` with a
  fixed password and printed it in this file, so that credential is public: rotate it,
  and assume anyone who read the repository knew it.
- The four role accounts (`kevin`, `editor`, `writer`, `reader` at `@example.com`) are
  created only when `NODE_ENV` is not `production`, each with a freshly generated
  password printed once in the boot log. On a brand-new local database, read that line
  to know what to sign in with; an existing database keeps whatever you set there.
  **Check Admin -> Users on Atlas**: if `editor`/`writer`/`reader` exist from an earlier
  deploy, they were created with the committed passwords and must have their passwords
  changed or be deactivated.

## Notes
- Free plan limits: the instance sleeps when idle (first request pays a ~30-60s cold
  start) and has no persistent disk, so anything written at runtime disappears on the
  next redeploy. That is why uploaded images are stored in Atlas (see "Uploaded images
  live in the database") and the disk is only a cache. Rows that reference a file deleted
  before this change still point at nothing, which is why `backend/uploads` is committed —
  boot re-seeds `UPLOAD_DIR` from it and never overwrites newer files.
- The QA test article `Qa Test Inkuru Y'igagerageza` is still in Atlas — delete it from
  Admin -> News if you do not want it live.
- Category artwork in `frontend/public/images/` ships in the build. `backend/uploads/`
  (user uploads) is tracked so Render's empty disk can be seeded from it: on boot
  `server.js` copies any missing file from `SEED_UPLOADS_DIR` into `UPLOAD_DIR`, never
  overwriting what production already wrote.
