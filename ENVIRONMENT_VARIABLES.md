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
| `GOOGLE_TRANSLATE_API_KEY` | empty | The reader-language translator. The browser never receives it; every translation is asked for by the server and stored, so a sentence is bought once for all readers. See "Reader languages" below. | The site is English for everyone, the language picker still lists every language, and every page says plainly that translation is not available. No story is ever lost to it. |
| `TRANSLATE_TIMEOUT_MS` | `12000` | How long one Google call may take before it is abandoned. | A slow answer is dropped and the reader gets the English original with the reason. |
| `TRANSLATE_CHUNK_CHARS` | `4000` | How much text goes into one Google call. | — |
| `TRANSLATE_MAX_CHARS` | `60000` | The most text one request may translate. | — |
| `TREND_GEOS` | `RW,UG,KE,TZ,NG,ZA,US` | The regions the trending radar asks Google for. Each one is a `https://trends.google.com/trending/rss?geo=XX` feed. | The radar shows no regions; the portal says so instead of inventing topics. |
| `TREND_CACHE_MINUTES` | `15` | How long one region's fetched list is kept, so the admin portal does not hammer Google on every page open. | — |
| `TREND_TIMEOUT_MS` | `15000` | How long one region's feed may take before that region is marked unreachable. | — |
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

### Email alerts

The newsletter mailer is the only code that sends mail, and it reads these six
names. Nothing here is secret except `SMTP_PASSWORD`.

| Variable | Default | What it does | Without it |
| --- | --- | --- | --- |
| `SMTP_HOST` | empty | The relay the newsletter mailer sends through. Also the switch: no host means no mail is attempted anywhere. | `GET /api/newsletter/status` reports `configured: false`, the subscribe box says the alerts are not live, and publishing a story mails nobody. Nothing fails. |
| `SMTP_PORT` | `587` | Port for that relay. | — |
| `SMTP_USER` / `SMTP_PASSWORD` | empty | Login for a relay that needs one. A host that allows anonymous sending works with both empty. | The relay refuses the mail and the send is reported as failed, one redacted line in the log. |
| `SMTP_SECURE` | `false` | `true` only for an implicit-TLS port (465). Leave `false` for 587, which upgrades with STARTTLS. | A 465 relay never completes its handshake. |
| `MAIL_FROM_EMAIL` | empty | The address the alert mail comes from; a second switch, because a mail with no sender cannot be sent. | Same honest "not configured" answer as a missing host. |
| `MAIL_FROM_NAME` | empty | Display name readers see before that address. | The address alone is the display name. |

Email is the second alert channel and it is confirm-first: an address is stored
as `pending`, the confirmation link in the mail is what makes it `confirmed`,
and only confirmed addresses receive a story. The link a mail points at is built
from `PUBLIC_URL` (then the first entry of `CLIENT_URL`), so on Render set
`PUBLIC_URL` to the site address or the mailed links go to `localhost`. A story
that goes live is announced once — republishing a story that was taken down does
not mail anybody again. Confirmation and unsubscribe links are the same token,
stored only as a sha256 hash, and `GET /api/newsletter/unsubscribe?token=…` is
what the link inside a mail opens.

Owner action: add `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
`MAIL_FROM_EMAIL`, `MAIL_FROM_NAME` to the Render service (and to `.env.render`
for local runs against production data) with the credentials from whichever relay
is in use, then restart. `render.yaml` deliberately does not declare them: adding
a Blueprint variable nobody filled in would publish an empty `SMTP_HOST`, which
counts as configured to nothing but is still a value to clear by hand.

The relay in use is Mailjet's SMTP credentials, which need exactly these values —
`SMTP_HOST=in-v3.mailjet.com`, `SMTP_PORT=587`, `SMTP_SECURE` absent or `false`
(587 upgrades with STARTTLS; `true` there means the connection is waited for
forever and no mail leaves), `SMTP_USER` and `SMTP_PASS` from the SMTP panel, and
`MAIL_FROM_EMAIL` set to a sender Mailjet has actually validated, because a
refused sender looks like a bug in the site. Only the key is secret, and putting a
key in this file would be the mistake this table exists to prevent. `GET
/api/health` answers `wired.email` and, when it is false, names the variable that
is missing.

`JWT_REFRESH_SECRET` no longer exists anywhere — there is no refresh endpoint, so
the value in the Render dashboard is dead. Delete it there when convenient;
`render.yaml` was left alone on purpose, because removing a Blueprint variable
would delete it from the live service the next time the Blueprint is applied.

### Reader languages

A reader picks any language and the news, the section names and the site's own
labels arrive in it. Everything below is read by `src/services/translateService.js`
and nothing here reaches the browser — the key never leaves the server, and the
translation is asked for by the server on the reader's behalf.

| Variable | Default | What it does | Without it |
| --- | --- | --- | --- |
| `GOOGLE_TRANSLATE_API_KEY` | empty | The Cloud Translation v2 key. Also the switch: no key means no Google call is attempted. | `GET /api/translate/languages` reports `configured: false`, every story is served in English, and the site says so on the page instead of pretending. |
| `TRANSLATE_TIMEOUT_MS` | `12000` | How long one Google call may take before it is abandoned. | A slow Google answer is dropped; the reader gets the English original with the reason printed. |
| `TRANSLATE_CHUNK_CHARS` | `4000` | How much text goes into one call. Paragraphs are kept apart, so a long story is cut between sentences and rebuilt exactly. | — |
| `TRANSLATE_MAX_CHARS` | `60000` | The most text one request may translate. | A request over the ceiling is refused and the page stays English. |

The cost rule is that a sentence is bought once. Every translation is stored in
the `translations` collection under its language and its English hash, so the
second reader to open that story in Luganda pays nothing, and a newsroom
correction changes the hash and forces a fresh call rather than serving a stale
sentence. `GET /api/articles?lang=…` and `GET /api/articles/:slug?lang=…`
translate the story fields; `POST /api/translate/chrome` translates the site's
own labels as one set, which the reader's browser then mirrors.

A request with no `lang` is answered exactly as it always was, which is what
keeps the crawler, the RSS feed and every editor and writer screen on the
English original. `render.yaml` deliberately does not declare these four names:
an empty Blueprint `GOOGLE_TRANSLATE_API_KEY` is a value to clear by hand, and
the site already behaves honestly without the key.

Owner action: add `GOOGLE_TRANSLATE_API_KEY` to the Render service (and to
`.env.render` for local runs against production data) with a key from Cloud
Console restricted to the Cloud Translation API, then restart.
`TRANSLATE_TIMEOUT_MS`, `TRANSLATE_CHUNK_CHARS` and `TRANSLATE_MAX_CHARS` are
fine at their defaults.

### Live scores

The scores desk at `/live-sports` is served entirely by this API. A reader never
contacts a sports site: `src/services/liveScoreService.js` asks the upstream once
per competition per day, keeps the answer in the `sportscoreboards`, `sportmatches`
and `sportstandings` collections, and every reader after that is answered from our
own database. That is what lets a thousand people watch the same Saturday without
anybody's address being blocked. No key, no account and no quota is involved, and
none of these four names has to be set for the page to work — they are here so a
change of feed, of league list or of polling rate is a Render edit rather than a
rebuild of the site.

| Variable | Default | What it does | Without it |
| --- | --- | --- | --- |
| `ESPN_BASE_URL` | `https://site.api.espn.com/apis` | Where the scoreboard, summary and table documents are read from. Only the server ever sees this address. | The built-in ESPN address is used, which is the working case. |
| `LIVESCORE_LEAGUES` | empty | The comma-separated competition codes the page offers, in the order a reader sees them (`eng.1, esp.1, uefa.champions, …`). | The thirteen competitions built into the service are followed: the five big European leagues, the Champions and Europa Leagues, the CAF Champions League, the Championship, and Portugal, the Netherlands, Turkey and Scotland. |
| `LIVESCORE_TIMEOUT_MS` | `12000` | How long one upstream call may take before it is abandoned. | — |
| `LIVESCORE_REFRESH_SECONDS` | `60` | How old a stored day may get before the cron re-reads it, and how long a scoreboard stays fresh enough to serve without asking again. | — |

Two things about the schedule are worth knowing before changing any of them. The
cron wakes once a minute and fetches only what a reader has actually looked at
recently — a day nobody opened is not fetched, which is why the first visitor to a
matchday waits a second or two while the rest are answered from the database. And
the whole process shares four upstream slots plus a six-second request budget, so
a cold page is answered with the leagues that did arrive and the rest keep
fetching in the background; the page says which ones are still loading instead of
showing an empty day.

A free Render instance that is asleep runs no cron at all. That is a cost of the
plan rather than of this feature: the first request after a wake-up pays for the
fetch, and every request after it is served from Atlas.

`render.yaml` does not declare these four names, for the same reason it does not
declare the translation settings: a value written in the Blueprint is a value the
Blueprint enforces on every later sync, and the defaults in `src/config/env.js`
are already the ones we want. Add one in the dashboard only when it actually has
to differ.

## Frontend

Vite only inlines names starting with `VITE_`. Anything unset falls back to the
behaviour in the right-hand column rather than breaking the page.

| Variable | Set today? | What it does | Without it |
| --- | --- | --- | --- |
| `VITE_API_URL` | yes | Where the SPA sends every request. | `src/services/apiClient.ts` falls back to `http://localhost:5000/api`, which is right on a laptop and wrong on the internet. |
| `VITE_GOOGLE_CLIENT_ID` | yes | Renders the "Continue with Google" button. Must match the backend's `GOOGLE_CLIENT_ID`, since that is the audience the server verifies. | No Google button at all. |
| `VITE_VAPID_PUBLIC_KEY` | yes | Build-time copy of the push key. It wins over the key the API serves, so **after rotating VAPID on Render, either rebuild the frontend or clear this value** — leaving a stale key here silently breaks new subscriptions. | The app fetches `GET /api/push/public-key` instead, which is the arrangement that survives a key rotation. |
| `VITE_GA_MEASUREMENT_ID` | no | Turns on Google Analytics: the `gtag` script and a `page_view` per route change, but only for a reader who has answered yes to the consent banner. | Nothing is loaded and nothing is sent, no banner is shown (there would be nothing to ask about), and the Advertising page says so rather than inventing audience numbers. |
| `VITE_ADSENSE_CLIENT` | no | The publisher id Google loads the ad script with (`ca-pub-…`), behind the same consent answer. | No ad script is fetched and the ad slots render no box at all. |
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
