# Environment variables

Every value the code reads, where it belongs, and what the site does without it.
Nothing here is a secret: the real values live in files that git ignores
(`.env.render`, `backend/.env`, `frontend/.env`) and in the Render dashboard.
The only tracked env file is `frontend/.env.production`, and it holds build-time
values that are public by design — a URL a browser can already see.

## How the two halves differ

| | Backend | Frontend |
| --- | --- | --- |
| Read at | every request, from the live process | **build time only**, inlined into `dist/assets/index-*.js` |
| Set in | Render dashboard -> Environment (mirrored in `render.yaml`, which is documentation: the service was created from the dashboard, not the Blueprint) | `frontend/.env.production` (tracked) or a shell variable, then `npm run build` |
| Changing it needs | a Render restart | a frontend rebuild **and** redeploy — editing the file alone ships the old bundle |

## Backend

`backend/src/config/env.js` is the only place that reads `process.env`, so this
table and that file cannot drift apart. `backend/.env.example` lists all of it.

| Variable | Default | What it does | Without it |
| --- | --- | --- | --- |
| `PORT` | `5000` | HTTP port. In development a busy port walks upward until one is free. | — |
| `NODE_ENV` | `development` | `production` turns on the strict rules below, hides `/api-docs`, and stops the error log printing stack traces. | development behaviour |
| `MONGODB_URI` | empty | The Atlas connection string. | Production refuses to boot; development retries every 15s and falls back to a local database. |
| `JWT_SECRET` | development only (`dev-secret-key`) | Signs and verifies every session token, and the live-socket handshake uses the same check. Always HMAC-SHA256; the algorithm is pinned in code so a token cannot claim its own. | **Production refuses to start.** It is not optional and not replaceable by a default. |
| `CLIENT_URL` | `http://localhost:5173` | Comma-separated CORS allowlist for the API and for socket.io. | A browser from any other origin is rejected: the site loads but every request fails. |
| `GOOGLE_CLIENT_ID` | empty | The audience `POST /api/auth/google` requires on the ID token Google handed over. | Sign-in answers 503 "Google sign-in is not configured on this server"; password sign-in still works. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | subject defaults to the hosted origin | Web Push credentials. `GET /api/push/public-key` serves the public half so a rotation needs no frontend build. | `GET /api/push/status` reports `enabled: false`, every alerts switch shows "not switched on yet", and `/api/push/broadcast` answers 503. |
| `GEMINI_API_KEY` | empty | The only place this key exists. The browser never receives it; the admin portal calls the model through the server. | The AI writer stays hidden in Admin and `/api/admin/ai/generate` answers 503. |
| `GEMINI_MODEL` | `gemini-flash-lite-latest` | Which Gemini text model writes a draft. | — |
| `GEMINI_TIMEOUT_MS` | `90000` | How long the server waits for a draft before giving up. | — |
| `UPLOAD_DIR` | `backend/uploads` | Where uploaded images are mirrored on disk. Render's free plan has no disk, so this is a cache and MongoDB is the copy that survives. | — |
| `SEED_UPLOADS_DIR` | same as `UPLOAD_DIR` | Boot copies any missing file from here into `UPLOAD_DIR`, never overwriting a newer one. | — |
| `UPLOAD_STORE_LIMIT_MB` | `400` | Caps the `uploads` collection: Atlas M0 gives the cluster 512MB and a full cluster breaks every query. | Uploads past the cap answer 507. |
| `PUBLIC_URL` | empty | Absolute prefix for links built outside a browser request (worker or crawler reads). | Links stay relative, which is what the API normally returns. |
| `RATE_PER_1000_VIEWS` | `5000` | What a writer is paid per 1000 valid views. | — |
| `MINIMUM_PAYOUT` | `10000` | The smallest payout a writer can request. | — |
| `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | empty | Creates (or promotes) the first admin, but only until the `adminBootstrapped` setting exists. Set all three, deploy once, sign in, change the password, then delete them. | On a database with no admin, production logs one warning line and starts anyway with nobody able to sign in to `/mugishaimekevin`. On an existing site nothing changes. Development never needs them — see the next paragraph. |

Outside production, boot also creates four role logins (`kevin`, `editor`, `writer`,
`reader` at `@example.com`) so every part of the app can be clicked through. Their
passwords are generated on the spot and printed once in the boot log; none of them are
created when `NODE_ENV=production`, and no password for any of them is in the repository.

`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` are listed in
`backend/.env.example` and read by **no code**: this project has no mailer, so a
correction, a rejection or a payout notice is an in-app notification. They are in
the example only because email is the obvious next step.

`JWT_REFRESH_SECRET` no longer exists anywhere — there is no refresh endpoint, so
the value in the Render dashboard is dead. Delete it there when convenient;
`render.yaml` was left alone on purpose, because removing a Blueprint variable
would delete it from the live service the next time the Blueprint is applied.

## Frontend

Vite only inlines names starting with `VITE_`. Anything unset falls back to the
behaviour in the right-hand column rather than breaking the page.

| Variable | Set today? | What it does | Without it |
| --- | --- | --- | --- |
| `VITE_API_URL` | yes | Where the SPA sends every request. | `src/services/apiClient.ts` falls back to `http://localhost:5000/api`, which is right on a laptop and wrong on the internet. |
| `VITE_GOOGLE_CLIENT_ID` | yes | Renders the "Continue with Google" button. Must match the backend's `GOOGLE_CLIENT_ID`, since that is the audience the server verifies. | No Google button at all. |
| `VITE_VAPID_PUBLIC_KEY` | yes | Build-time copy of the push key. It wins over the key the API serves, so **after rotating VAPID on Render, either rebuild the frontend or clear this value** — leaving a stale key here silently breaks new subscriptions. | The app fetches `GET /api/push/public-key` instead, which is the arrangement that survives a key rotation. |
| `VITE_GA_MEASUREMENT_ID` | no | Turns on Google Analytics: the `gtag` script and a `page_view` per route change. | Nothing is loaded and nothing is sent, and the Advertising page says so rather than inventing audience numbers. |
| `VITE_ADSENSE_CLIENT` | no | The publisher id Google loads the ad script with (`ca-pub-…`). | No ad script is fetched and the ad slots render no box at all. |
| `VITE_ADSENSE_PUB_ID` | no | The id written into `ads.txt` by `npm run ads-txt` (which `prebuild` runs) — the file Google requires on the domain before it will serve ads. | No `ads.txt` is written and a previous one is deleted, because a file naming someone else's publisher is a policy problem, not a missing feature. |
| `VITE_ADSENSE_SLOT_ARTICLEINLINE`, `VITE_ADSENSE_SLOT_ARTICLESIDEBAR`, `VITE_ADSENSE_SLOT_LIST` | no | The ad unit id for each placement, created in AdSense -> By ad unit. A placement with no id stays empty, so they can be switched on one at a time. | That placement renders nothing. |
| `VITE_CONTACT_EMAIL` | no | The address printed on the Contact, Corrections and Advertising pages and in the footer. | Those pages tell a reader to use the comments under a story instead, because the site will not print an address that does not exist. |
| `VITE_TURN_URLS` / `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL` | no | A TURN relay for live video, so viewers behind symmetric-NAT mobile networks can be reached. | Live falls back to STUN plus a slow JPEG relay through Render, and `/live` says "No media relay is set up". |

## Adding one

1. Backend: read it in `backend/src/config/env.js` (never `process.env` deeper in
   the code), list it in `backend/.env.example` with a comment, and paste the real
   value into the Render dashboard.
2. Frontend: read it through `src/utils/siteConfig.ts` or the feature's own module,
   add it to `frontend/.env.example`, then `npm run build` to prove it reached the
   bundle.
3. If it lets a new third-party origin into the page, add that origin to the
   `Content-Security-Policy` in `frontend/firebase.json` **before** deploying, or
   the browser will block the new script silently and the only clue is a console
   error.
