# IMPLEMENTATION_PLAN

Baseline: existing Express+Mongoose API + React/Vite SPA + Firebase Hosting/Render/Atlas (see `PROJECT_AUDIT.md`).  
Principle: **inspect -> plan -> implement -> test**; additive/safe schema evolution; no data loss, no production reset, preserve URLs/features unless a documented limitation requires change.

## Release 0 — Audit & safe foundation (Critical) — IN PROGRESS

Status 2026-11-12: **Phase Zero docs done** — all six documents are in this repository
(`PROJECT_AUDIT.md`, `IMPLEMENTATION_PLAN.md`, `DATA_MODEL.md`, `ENVIRONMENT_VARIABLES.md`,
`DEPLOYMENT_PLAN.md`, `OWNER_ACTIONS.md`), and `PROJECT_AUDIT.md` is the gap list the rows
below are checked against. **Prod hardening done** — production refuses to start without a
real `JWT_SECRET` (algorithm pinned to HS256), `mongodb-memory-server` is a devDependency,
the upload disk mirror is written asynchronously, and no test credential remains in the seed
or the docs. Rate limits, stored-text cleaning, non-leaking error responses and a
`Content-Security-Policy` header are also in. Remaining here: collaboration scaffolding, and
branch protection/CI, which needs owner GitHub settings.

| Work item | Existing | Change | Dependencies | DB impact | Security impact | Acceptance criteria | Test/deploy notes |
|---|---|---|---|---|---|---|---|
| Phase Zero docs | Partial (DEPLOYMENT.md) | Add/maintain PROJECT_AUDIT, IMPLEMENTATION_PLAN, DATA_MODEL, ENVIRONMENT_VARIABLES, DEPLOYMENT_PLAN, OWNER_ACTIONS | None | None | None | Docs reflect repo reality, gaps, and owner inputs | Doc review; no deploy required |
| Collaboration scaffolding | Missing | Root README, CONTRIBUTING, LICENSE decision, `.github` PR/issue templates, CODEOWNERS, CI | Owner GitHub settings | None | Improves process | PRs run checks; contribution flow documented | Configure branch protection in GitHub |
| Prod hardening (quick wins) | Gaps noted | Require real JWT secrets in prod; move `mongodb-memory-server` to devDeps; async upload disk cache; remove committed test creds from seeds/docs | Code changes + env validation | None (behavioral) | High improvement | App fails fast on bad prod config; uploads non-blocking | Run backend tests; staged deploy |

## Release 1 — Publisher foundation & AdSense readiness (Critical) — IN PROGRESS

Status 2026-11-12: already in place — About, Contact, Privacy, Terms, Editorial Policy,
Corrections, Advertising, Cookie Policy and Disclaimer pages with footer links; `robots.txt`,
a sitemap index (pages/articles/categories/writers/news), `sitemap-news.xml`, `feed.xml`,
per-route canonical/OG/`NewsArticle` JSON-LD and the Search Console tag; config-driven
`ads.txt`, three reserved ad placements and a GA4 wrapper that reports nothing until an id
is built in; and a consent banner that holds both Google scripts back until the reader
answers yes, with the answer changeable on `/cookies`.
Open: custom domain and canonical redirects (owner), authors directory and Person data, image credits/captions and correction and
sponsored labels, server-side proof of the consent answer. Core Web
Vitals are measured rather than assumed now (see the Performance row: lab numbers from
2026-11-16); field data still waits on a real domain, because a Firebase default domain
collects nothing useful.

| Work item | Existing | Required changes | Dependencies | DB impact | Security/privacy impact | Acceptance criteria | Testing |
|---|---|---|---|---|---|---|---|
| Canonical domain/redirects | Firebase default domain live | Support custom domain, canonical host redirects, URL preservation, sitemap/meta/canonical alignment | Owner-registered domain, DNS, hosting config | None | TLS/redirect correctness | Single canonical domain; old URLs resolve/redirect correctly | Manual + crawl checks |
| Required publisher pages | 9 of the list live | Only the Authors/Journalists directory is left; the pages exist, are routed, translated and in the footer | Owner author data | Minimal (settings/content storage optional) | Legal/privacy accuracy depends on owner | Pages routable, linked in footer/header, accessible | Content review, responsive check |
| Contact form | Live | `POST /api/contact` with server-side validation, a honeypot field, 10 messages an hour per IP and an admin inbox at `/mugishaimekevin/messages` (open/answered/closed, delete is owner-only) | None | New `ContactMessage` collection (name, email, topic, message, status) | No IP/user-agent stored; PII is deletable by staff; spam never reaches the inbox | Submissions validated server-side; no private leakage | 4 API cases: reader submits, invalid input refused, honeypot stores nothing, staff transitions + owner-only delete |
| Author model/pages | Partial (User/WriterProfile) | Dedicated/public author records (or extend safely), author pages listing articles, Person schema, verified identities only | Owner author data | Additive fields/collection | Avoid fabricated identities | Author pages now render real profiles/articles and say so: `/user/:id` carries its own canonical, a `ProfilePage`/`Person` block built only from what the profile holds, and `noindex, follow` while it has nothing published — which is also why `/user/` could be taken out of `robots.txt` and put in the sitemap | Data migration-safe tests |
| Article template/SEO | Partial | Complete bylines/dates/image credits/captions/corrections label/sponsored label/related/share/bookmark, dynamic meta/OG/JSON-LD (NewsArticle/Org/Person/Breadcrumb), canonical | Frontend + API shape | Additive fields (e.g. image credit/caption/correction refs) | Accurate metadata only | Valid structured data; accessible layout | Rich Results/Schema validators, responsive |
| SEO endpoints | All of them live: `/robots.txt`, the `/sitemap.xml` index, `/sitemap-news.xml`, `/feed.xml`, and `/sitemap-images.xml` written on every build (88 of 92 stories had a photo the day it was generated; a credit becomes the caption, and nothing is captioned that nobody credited) | The image file is only usable by Google once the host of the pictures is recognised — `OWNER_ACTIONS.md` action 10, and it goes away with the custom domain's `/uploads` | Owner Search Console access | None | No private URL leakage | Valid XML/RSS; Search Console-ready | `node scripts/generate-sitemap.mjs`, then well-formedness + image URL fetch checks on the generated files |
| ads.txt & AdSense prep | Built, waiting on the owner id | `/ads.txt` from `VITE_ADSENSE_PUB_ID`, three consent-aware placements that render nothing without their own slot id | Owner AdSense publisher ID/approval | None | Policy/compliance | Correct file when configured; no fake ads | Verified in the browser with test ids |
| GA4 & consent | Built, waiting on the owner id | `page_view` per route plus share/copy_link/search events, no PII; a banner that asks once, keeps the answer in `localStorage`, and refuses to fetch either Google script until yes; `/cookies` shows the answer and resets it | Owner GA4 ID | None yet — the answer is browser-local, so there is no consent record to audit | High (privacy); default is refusal | Events fire once with consent; opt-out honored and reversible without support | Verified in the browser with a test id: decline loaded no script, accept reported the current path |
| Performance/CWV | Measured 2026-11-16 in the mobile lab (Lighthouse, default mobile emulation and throttling; one run before, three after, since the anonymous PageSpeed API is over its shared quota): score 38→38/42/41, FCP 2.0→~2.2s, LCP 6.7→6.1/6.4/6.5s, TBT 3,510→1,840/1,900/2,150ms, CLS 0.051 unchanged. The SPA is loaded in pieces now — every page is its own chunk except the home page and the story page, and React/router/axios/date-fns sit in one stable `vendor` file; a reader's first download went from 341 kB of JavaScript in one file to 183 kB in two, and the admin charts, the live socket client and the editor form are no longer on that path at all | The remaining LCP cost is not the bundle: the home banner paints only after `/api/articles?...` answers a cold Render free instance, and `index.html` still loads the ~100 kB Google sign-in script on every page | None | None | None — no new script, no new data, nothing a reader consents to | LCP explained rather than guessed; no regression in CLS; staff code never on the reader's path | Re-measure after any change to the banner's data path or the sign-in script; field data (CrUX) still needs a real domain |
| Search Console | Doc/process | Verification support (meta/DNS per hosting), sitemap submit instructions, monitoring checklist | Owner access | None | None | Documented and testable steps | Owner-verified externally |

## Release 2 — Global newsroom & editorial workflow (High) — STARTED

Status 2026-11-13: the pieces already running are writer applications that an admin
approves, the four roles with `authorize()` checks on every route, the
`draft/pending_review/approved/rejected/published/archived` states an editor moves a story
through, the section/sub-section hierarchy the header and `/sports/football` addresses are built
from, and the AI newsroom's own gate: a generated story is saved as a draft and only goes live
when an admin publishes it, even with auto-publish switched on. The admin portal now carries a
"Pending admin approval" queue where every AI story is previewed as a reader would see it —
including the search-result snippet and a warning when the meta description runs past 155
characters — then approved, rejected, re-opened, taken down or deleted. Gemini is reachable from
the admin portal only: `/api/admin/ai/*` and `/api/admin/trends` all carry `authorize('ADMIN')`,
the route is wrapped in `RequireAdmin`, and no writer, editor or reader sidebar, header menu or
page references an AI surface. Missing: granular
permissions and staff roles, `in_review`/`changes_requested` with feedback, revisions,
sources, corrections records, breaking news and scheduled publishing.

| Work item | Existing | Required changes | Dependencies | DB impact | Security impact | Acceptance criteria | Testing |
|---|---|---|---|---|---|---|---|
| Categories/regions/countries | Section tree (9 sections, 32 sub-sections) seeded idempotently at boot, `/section` and `/section/sub` pages, dropdown nav, legacy spellings collapsed at read time | Region/country entities and real content behind `/world/...`; indexability rules per page | Editorial taxonomy decisions | Additive collections/refs + safe migration | Public read filters | Pages show relevant published news; no thin auto-pages | URL/content tests |
| RBAC expansion | Coarse roles | Roles/permissions model (Super Admin, Managing/News Editor, Journalist, SEO Editor, Social Manager, Ad Manager) enforced server-side | Product decisions | Additive | Critical | Unauthorized actions blocked API-side | Permission tests |
| Weather desk (`/weather`) | Live since 2026-11-16, waiting on the owner's key | Reader page (now, next hours, three days, sun/moon, city search, °C/°F) fed only by `GET /api/weather` and `/api/weather/status`; WeatherAPI is called by the backend alone, one call per city per ten minutes, stored in `weatherreports` with `fetchedAt` so the page can say how old a reading is | `WEATHERAPI_KEY` in Render (`OWNER_ACTIONS.md` action 12) | New `weatherreports` collection (one row per city, additive) | Key never reaches a browser; rate limited per IP; nothing is printed the source did not say | Verified against a real Kigali payload offline and through the mounted routes locally (`configured: false` honestly, 404 with the last report attached, 400 on a pasted query); live `/weather` renders and is titled `Weather | RADAR` | Re-check `GET /api/weather?q=Kigali` after the key is in; page must then print measured numbers only |
| Editorial workflow | Basic statuses | Draft→Submitted→In Review→Approved/Changes Requested→Scheduled/Published→Updated/Correction/Archived, feedback, revision history, actor/timestamps | UI+API redesign | Additive (revisions/reviews) | Auditability | End-to-end flow; drafts private | Workflow tests |
| Source verification | Missing | Source records per important story, verification status/review metadata | Editorial process | Additive | Integrity | Sources stored and reviewable | CRUD/validation tests |
| Corrections | Missing | Correction records/notices, previous vs corrected info, approver/timestamps, visible notices | Policy + UI | Additive | Trust/transparency | Material changes recorded, not silent | Audit tests |
| Breaking news | Missing | Managed breaking items with priority/time window/approval/display | UI placement | Additive | Prevent misuse | Active items display correctly and expire | Scheduling/UI tests |
| Scheduled publishing | Missing | Reliable UTC scheduler, idempotent publish, failure handling/manual recovery, hidden until published | Job runner/cron/queue choice on Render | Additive job/state fields | Prevent premature exposure | Scheduled posts publish once and safely | Time-based tests |

## Release 3 — Global Trending Intelligence (High) — PARTIAL

Status 2026-11-13: one provider is live, and it is a real one. `backend/src/services/trendService.js`
fetches Google's own daily feed (`https://trends.google.com/trending/rss?geo=XX`) per region, keeps
exactly what Google printed — topic, traffic band as a label plus its number, the headline links
attached to it, the feed URL and the fetch time — in the `trendtopics` collection for 21 days, and
serves it to the admin radar with a per-region health reason (`NO_FEED_FOR_GEO`, `PROVIDER_ERROR`,
`UNREADABLE_FEED`, `TIMEOUT`, `UNREACHABLE`, `EMPTY`) and a dated stale fallback. Rwanda is listed
and reported honestly: Google serves no RSS for `RW`, so that chip says so instead of showing
anything invented. GDELT is deliberately not wired — its public API answers 429 from this network,
so there is no way to verify it here and no code pretending otherwise. The trend writer will only
write a topic the server itself fetched (`evidenceFor()` returns nothing else, and the route 400s),
so a story can never be seeded from a headline nobody saw. Search interest is an editorial input,
never an auto-publish source.
Status 2026-11-20: the reader shelf now answers to what readers are opening. `backend/src/services/trendingService.js`
computes a decaying heat per story — every `ArticleView` and `Like` in the last 30 days counted at
`exp(-age/3 days)`, completed reads weighted above bounces, likes above reads, plus a small recency
term — and writes it to `Article.trendingScore`, which every reader-facing `sort=trending` and
`/api/trending` sorts by. The refresh is lazy (at most once a minute, never awaited by the read that
triggered it), so the reader pays for one indexed sort instead of an aggregation. `sort=popular` keeps
the all-time career total, which is what that word means: the old stories did not stop being the most
read ever, they just stopped being what is trending today. `tests/trending.test.js` covers
today's reads beating a hundred times the lifetime views, nine-day decay, an unread story ordered by
publication date, section filters surviving the new sort, and the score being stored rather than
recomputed on every read.
Missing: topic clustering and history views.

| Work item | Existing | Required changes | Dependencies | DB impact | Security impact | Acceptance criteria | Testing |
|---|---|---|---|---|---|---|---|
| Provider architecture | `trendService` + `trendRss` parser + `TrendTopic` provenance for Google Trends RSS, cached, timed out, pruned, provenance stored | More adapters only when the owner supplies keys/terms (news APIs); per-provider health page | Owner API access/terms, compliant methods | Additive (`trendtopics`) | Key protection, server-side only | Integrations health-visible; no frontend secrets | `tests/trends.test.js` (parser, provenance, each failure reason) |
| Ranking/clustering/queue | Admin review queue for AI drafts (preview/edit/approve/reject/take down) and trending topics with evidence | Transparent versioned trend score, topic clusters, evidence, editorial review/assignment queue (no auto-publish) | Algorithm/product tuning | Additive | Prevent misinformation automation | Scores explainable; editors control outcomes | Data/logic tests |
| Dashboard | Admin-only TrendRadar: region chips, live/stale/unreachable states, Google's own headline links, refresh, attribution and cache note, "write this story" into the AI newsroom | Real-data trend filters/history on top of the stored sightings | Above integrations | Read models | None | No fake/sample prod data | UI/integration tests |

## Release 4 — International distribution (Medium–High) — PARTIAL

Every language Google Cloud Translation supports is selectable from the header globe
menu — labels and story text are translated server-side and cached — but content is
not routed by language: no `/en` `/rw` `/fr` prefixes, no hreflang, and the English
original is the only version the newsroom stores. Live video works but needs a TURN
relay to reach everyone. No podcast, radio, social distribution or reader-preference
controls yet.

Status 2026-11-20: the newsletter is no longer a browser-only capture. `POST /api/newsletter/subscribe`
stores the address and then hands the confirmation mail to `mailerService.answerWithin()`, which
answers the reader inside `MAIL_ANSWER_BUDGET_MS` (three seconds by default) and lets the SMTP
transaction finish behind the response — a relay that is slow, or a page that is pressed twice, can no
longer make the newsroom look unreachable, which is exactly what the "We could not reach the newsroom"
complaint was. The nodemailer transport also has hard `connectionTimeout`/`greetingTimeout`/`socketTimeout`
now, so a hung relay cannot occupy the request either. The API returns `delivered` and `queued`
separately and both UIs say "we are mailing you a link" rather than promising a mail that has not left
yet; `tests/email-alerts.test.js` pins that behaviour with a relay that takes 1.5 s to answer.
The remaining slowness is the host, not the mail: `/api/health` itself answers in 5-13 s because the
Render service sleeps when nobody is looking, so `apiClient.postWakingUp()` gives the Subscribe press a
short first attempt and repeats it exactly once, and only when nothing answered at all - a refusal the
server wrote back is never pressed twice.

| Work item | Existing | Required changes | Dependencies | DB impact | Security impact | Acceptance criteria | Testing |
|---|---|---|---|---|---|---|---|
| Multilingual publishing | Machine translation of UI labels and story text into any supported Google language, cached in `translations` keyed by source hash | `/en|/rw|/fr` routes, human translation records/workflow/review, hreflang, language-specific SEO/sitemaps/feeds | Editorial translation process | Additive (`translations`, shipped) | Content integrity | Correct language routing/metadata; no empty translations | i18n/SEO tests |
| Newsletter | Local-only capture | Subscriber model, consent/double opt-in, preferences, templates/campaigns, unsubscribe, delivery/bounce logs | Provider (e.g. ESP) decision | Additive (PII) | High (privacy/PII) | Consentful subscribe/unsubscribe; no public exposure | Flow + security tests |
| Radio (authorized) | Live video exists | Dedicated radio stream UI/schedule/status using owner-provided authorized URL; clear unconfigured state | Owner stream URL/license | Additive/config | Avoid unauthorized streams | Player reliable/accessible when configured | Device tests |
| Podcasts/video | Missing | Podcast series/episodes/RSS, managed video/captions/transcripts, authorized embeds | Media hosting choices | Additive | Rights/licensing | Valid feeds/pages; responsive | Feed/player tests |
| Social distribution | Share only | Draft/approve/schedule/log workflow; official APIs or manual-copy fallback | Platform approvals/tokens | Additive | Token security | Permission-based publishing; no password storage | Workflow tests |
| Reader accounts prefs | Partial | Verified accounts, preferences, privacy-compliant history, account deletion flow, private bookmarks | Policy decisions | Additive | PII/privacy | Secure self-service controls | Auth/privacy tests |

## Release 5 — Growth & monetization (Long-term, readiness-gated)

Status 2026-11-12: nothing here is ready to start, because the gate in front of it is not
open. AdSense has not been applied for and no publisher id, GA4 id or contact address has
been supplied, so no ad has ever been requested and no reader has ever been counted.

## Decisions the owner already made

Recorded here because they shape several rows above, and a future contributor cannot infer
them from the code:

- **AI writes, a human publishes.** The admin types a topic, Gemini writes the story inside
  the admin portal, and nothing generated reaches readers until an admin publishes it. A
  server-side auto-publish switch exists for the admin's own use; it changes who has to
  click, not whether the story is reviewed. The same panel now sits on every writer's own
  dashboard: it drafts into that author's shelf as `status: 'draft'`, and the queue is
  unchanged. A story generated that way carries no "written by AI" label for readers — the
  newsroom decided the label invited arguments it did not want to have in public, so the
  fact lives in the article record and the review trail instead.
- **RADAR AI answers readers from published stories only.** The home strip and the button
  under every story talk to `/api/ai`, which is grounded on `status: 'published'` rows in
  our own database plus the recent headline list. A reader's question never becomes model
  prompt text on its own, the conversation is kept in the browser tab and not stored
  server-side, and the Gemini key stays on the server behind per-address ceilings (12
  questions an hour for readers, 10 drafts an hour for writers).
- **Trend input is typed, not scraped.** The trend source for now is "admin types the
  topic", not an automatic feed of other publishers' headlines.
- **English is the source and the default.** A reader picks any language Google
  Translation supports and the whole site arrives in it; the English text stays the
  version the newsroom publishes. The old three-language menu was retired for this.
- **Advertising and analytics ids come from the owner.** They have not been provided, so
  the site loads no ad script, writes no `ads.txt` and reports nothing to GA4. Applying to
  AdSense is the owner's decision and will not be done on their behalf.
- **The authors directory is earned by publishing, not by a switch.** `/authors` lists
  anyone with at least one published story whose account is active, and the numbers on each
  card - stories, paid reads, followers, last published - are counted from live rows at
  request time rather than read from `WriterProfile.totalArticles`, which nothing keeps
  current. There is deliberately no "featured author" or "show in directory" flag: a field
  nobody maintains is how a directory starts lying about who writes here.

- **Who paid, who took the picture, and what we got wrong are the desk's signature, not
  the author's.** A story now carries `imageCredit`, `imageCaption` and `imageSourceUrl`,
  an `isSponsored`/`sponsor` pair, and an append-only `corrections[]`. The writer fills in
  the two lines about their own photograph when they attach it; the paid-content label and
  a new correction can only be recorded by an editor or admin through
  `PUT /api/editor/articles/:id/disclosure`, because a disclosure set by the person who
  sold the space is not a disclosure, and an author editing their own copy is not a
  correction of the record. A correction is appended with its date and never rewritten, and
  `/corrections` lists them all, read off the same stories. Sponsored copy is labelled on
  the page, described as an `Article` rather than a `NewsArticle` in the structured data,
  and kept out of the Google News sitemap - a News listing is a claim that the story is
  reporting, and paid copy should not make it.

- **Naming a source is the writer's job; saying it was checked is the desk's.** A story
  carries `sources[]` with a `verificationStatus` of `pending`, `verified` or `rejected`.
  An author files a source through `POST /api/writers/articles/:id/sources` - the status is
  forced to `pending` whatever the client sends, the list is capped at twenty, and a source
  the desk has already judged cannot be quietly withdrawn by the author. Only
  `PUT /api/editor/articles/:id/sources/:sourceId` moves a status, and it records who ruled
  and why in two `select: false` fields a reader, a writer response and any list never
  receive. The reader sees the source, the kind it is, and the verdict; the argument behind
  the verdict stays in the desk. Alongside it, the newest twenty versions of `title`,
  `summary` and `content` are written in the same save that replaces them - but only for a
  story that has already left its author's drafts, because a workshop is not a publication.
  A revision is the newsroom arguing with itself in public otherwise, so `select: false`
  keeps it to the desk, where `GET /api/editor/articles/:id` and `/history` ask for it by
  name.

- **One loader, and it holds the page.** The blue bar across the top
  (`RouteProgressBar`) is the only progress indicator on the site; every spinner in
  every component was deleted rather than hidden, including the splash. Navigation
  waits for its data: clicking a link starts the bar and the reader stays where
  they are until the new page's request has settled, then the route swaps in with
  content already on it. The hold applies to reader routes only, is skipped when
  the reader is mid-typing or mid-click in the page they are on, and releases
  itself after 1.2 seconds so a dead request cannot trap anyone. The bar that
  answers the press then finishes by itself: 1.6 seconds after the new page
  arrives (`NAVIGATION_MAX_MS`) and four seconds after the tap that asked for it
  (`NAVIGATION_TOTAL_MS`), whichever comes first, and nothing that began before
  that can bring it
  back — a picture still coming down under a story the reader is already reading
  is recorded in `settledAbove` and refused, because a loader that reappears
  mid-page is the fault the owner reported, not the answer. A page that holds
  progress is answered by the same rule, sorted by when the hold was taken: holds
  are stamped with the request number they opened under, and one taken below the
  `routeBase` the bar writes when the page appears is the page loading itself -
  already covered by the navigation - while one taken at or above it is somebody
  pressing something on the page in front of them (a city typed at the weather
  desk, a match opened on the scores board, a video uploaded) and keeps the long
  allowance - eight seconds of it - since there the bar is the answer. The scores
  page was the first test case: its own first-load hold used to inherit a twenty
  second allowance and kept the line crawling over a board that had already
  arrived. The second case was the click itself. `markReaderAction` remembers the
  last tap for two seconds, so every request the arriving page made - its
  comments, its scoreboard, its weather read - was flagged as something the
  reader was waiting an answer for, and a hold opened by that page work restarted
  the bar the navigation had just finished, this time with the long allowance. A
  page change now calls `clearReaderAction()` alongside the `routeBase` marker:
  the tap on the link is over, the reader is on the new page, and only a press
  made there (`actedRecently()`) can open a line again. Page work that answers
  nothing paints nothing. An upload is held the same way through `holdProgress()`
  because fetch is invisible to the request counter, and it still gets the long
  allowance because the press that chose the file is recent. The last piece was
  where the time is counted from: a bar capped at 1.6 seconds *from the page
  arriving* still crawled for six seconds after a tap when the chunk behind that
  page took four seconds to download, so a run now carries both an `openedAt`
  (the tap) and a `startedAt` (the arrival). A navigation that has not arrived
  yet - the hold `holdNavigation()` opened under the click - is a `pending` run
  capped at four seconds from the tap (`NAVIGATION_TOTAL_MS`); the moment the
  page appears the same run becomes an arrival-capped one. `isNavigationHoldOpen`
  is what tells the two apart, so a click is never mistaken for a reader waiting
  between two pages they already have. The press stamp is taken from a `click`
  as well as a `pointerdown`, because a control fired by keyboard or by a script
  produces no pointer event and its request still deserves an answer. The fade
  was cut to 300ms with no delay so a finished bar is gone, not half-there. The
  corollary is
  that a page never paints a spinner next to a skeleton next to a bar, and a slow
  network looks like a slow phone, not like a broken site. (Owner request,
  batches #170 and #176; "the loder is not finished it continue running when we
  change the pages".)
- **A dropped connection is announced, not thrown.** Losing the network is normal,
  so it gets a sentence rather than a stack: `utils/offline.ts` watches the
  browser's own connection state and `OfflineBanner` says so above the page, a hard
  failure shows a retry panel that re-runs the real request, and `AppErrorBoundary`
  was added behind everything so any unmapped React crash lands on a "reload" page
  instead of a white screen. (Batch #167.)
- **Video on TV and in stories.** A TV broadcast or a story clip can come from
  three places: YouTube, Vimeo, or a file uploaded to the newsroom. Both live
  screens read the source through `getLiveStream()`, so a YouTube link handed to
  the admin panel plays in the reader's embed instead of waiting for a WebRTC peer
  connection that no camera will ever make; the server resolves a pasted URL into a
  provider-verified embed (`videoService.describe`) rather than putting the author's
  text into an `iframe src`, and an address that is not an address at all is refused
  on save with a readable reason instead of a broken player. A link pasted without its scheme - what a
  phone's share sheet and a chat app both hand over (`youtube.com/watch?v=…`,
  `//youtu.be/…`) - is completed to https by `urlGuard.withHttpsScheme` before any
  guard reads it, so a working link is never refused for the way it arrived; a
  `/uploads/...` path is left exactly as it is, and a private or port-bearing host
  is still refused after the scheme is added. The writer's box now previews what
  was typed and says in one line when an address is not one the site can show,
  rather than saving a blank nothing. (Batch #175.) A story can also carry up to twelve extra
  attachments (`Article.media`), image or clip, each with its own caption and credit,
  and the reader's page shows them in the order the author filed them. Uploaded
  video is capped at 12MB because the bytes live inside one Mongo document; longer
  or larger material goes on YouTube and gets pasted as a link, which is the same
  path the newsroom already uses for broadcast material. (Owner request, batch
  #171 and #173; live TV verified on the hosted site 2026-11-19.)
- **Every clip the newsroom attaches has to appear in the news and on TV.** A
  refusal was not enough: the owner pastes links from Facebook, Instagram and
  TikTok as well as YouTube, and a paste that the save quietly rejected looked
  exactly like a site that would not show videos. `videoService.describe` now
  rebuilds an embed for Facebook (`plugins/video.php`, from the `watch/?v=`,
  `story.php?video_id=` or `/videos/`, `/reel/` number), Instagram
  (`/p/`, `/reel/`, `/tv/` code + `/embed/`) and TikTok (`embed/v2/<number>`), and
  `Article.videoSource`, `Article.media[].source` and `Live.source` carry those
  names plus `link`. Anything from a platform with no public player - a shared
  `fb.watch` or `vm.tiktok` short link, an X post, a WhatsApp channel - is stored
  as `source: 'link'` and drawn on the story as one honest card that opens the
  clip where it lives (`rel="noopener nofollow"`), so a video an author attached
  is never simply missing. Only text that is not an address at all is still
  refused, and it is refused where it was typed. TV reads the same resolver, so a
  clip uploaded to the newsroom (`/uploads/*.mp4`) can now be put on air as well
  as a link, and `liveRoutes` refuses a `link`-only address with a sentence naming
  what on air can play. The writer's boxes preview all seven shapes, including
  the card. `firebase.json`'s `frame-src` list grew to the three new players,
  which is what makes the embeds load instead of showing a blocked frame.
  (Owner request, batches #175 and #176; resolver verified against the paste
  shapes above, hosted bundle `radar-v37`.)
- **A story must be readable on the phone it is read on.** The article page had
  zero horizontal padding at every ancestor, so body text touched both edges of a
  335px screen; it now carries `px-4 sm:px-6` at every breakpoint, prose is set in
  ink (`--color-text-body`) instead of the muted grey reserved for timestamps, a
  paragraph is a 40rem measure with 1.8 leading, and long addresses break anywhere
  instead of widening the page. The same gutter now belongs to every page that
  is not the home page - the section front door (`SectionPage`), the category
  page, the news list while it loads, and the shared shell behind About, Privacy,
  Terms, Editorial Policy, Disclaimer, Contact, Corrections and Advertising -
  because the layout only offsets the fixed header and leaves the padding to the
  page, and a rounded bordered card pressed against the edge of a phone reads as
  a screen that failed to load. The masthead's icon cluster and Login/Register
  pair are hidden below `sm` - both actions already exist in the drawer, the
  section line and the bottom bar - because at phone width they ran 82px off the
  screen and took the hamburger with them. (Batch #172.)
- **A forgotten password is recovered by a code sent to the account's email.**
  `POST /api/auth/forgot-password` answers the same neutral sentence whether the
  address is a reader, a writer, an admin, a deactivated account, or nobody, and
  never says whether a mail went out - the enumeration guard the newsletter routes
  already follow. A six-digit code comes from `crypto.randomInt`, is stored only as
  a SHA-256 hash, and dies when it is used; the mail is sent before the new code is
  written, so a refusal cannot lock out the code the reader still has. Resending is
  capped by ten minutes of real time rather than a row count, because the rows
  deleted by the resend are exactly the evidence the counter would need. Mail is
  sent through the site's SMTP provider - currently Mailjet (`in-v3.mailjet.com`,
  port 587, STARTTLS) - configured entirely by Render environment variables named
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM_EMAIL` and
  `MAIL_FROM_NAME`; the from address has to be a sender validated in that provider
  or the provider refuses the message, and no key is ever stored in this repository.
  Resetting ends every session of that account, the same rule the change-password
  route already followed. The mail itself is built by `sendSignInCode` in the
  mailer, not by the route: a text-only body was arriving as one unbroken block in
  which the number could not be found, so the message now goes out as a real HTML
  document (table layout, inline styles, no images and nothing that phones home),
  with the code repeated three ways - in the first line of the plain text
  alternative, in the hidden preview line an inbox prints under the subject, and in
  a large monospaced box of its own - plus the expiry and the "we never ask for
  this code" warning. The newsroom name at the top of the mail is a button that
  opens the hosted site, because a reader who arrived there from a forward should
  have one thing to press rather than an address to type. Every other mail the
  site sends goes through the same shell,
  so a confirmation or an alert reads as one newsroom rather than three formats.
  (Owner request, batch #164; verified live 2026-11-19 -
  neutral answer for an unknown address, 429 on the resend window, no leaked codes.)

- AdSense readiness checklist/report (owner-reviewed), consent-aware ad management, SEO editorial tooling, contributor/partnership workflows, audience metrics (privacy-compliant). Mobile app only after stable audience/product evidence. **No guarantees of approval/ranking/inclusion.**

## Cross-cutting execution rules (every phase)

- Preserve production data/URLs/auth/admin capabilities; safe migrations with backup/rollback notes.
- Server-side permission enforcement, input validation, secure uploads/headers/rate limits, no secrets in frontend/git.
- Add/update tests, run builds/tests actually available, document changed files/migrations/env/deploy steps, and record limitations/owner actions.
- No fake data/metrics, no auto-publishing external/unverified content, no unapproved submissions/deploys.

## Suggested implementation order (next steps)

1. Land Release 0 docs + collaboration/CI + quick security hardening.  
2. Implement Release 1 pages, SEO endpoints, consent/analytics config, and article/author metadata improvements.  
3. Evolve data model and permissions for Release 2 workflow, then scheduling/corrections/sources.  
4. Add provider adapters and trending queue (Release 3) behind configured integrations. —
   Google Trends adapter, its provenance store and the admin radar/queue landed 2026-11-13; the
   remaining adapters wait on owner-supplied keys, and the trend score is still open.
5. Expand to multilingual/newsletter/media/distribution (Release 4) with owner-provided services/credentials.  
6. Execute readiness/growth items (Release 5) only after quality, policy, and technical gates pass.
