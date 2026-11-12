# Project audit — Ijwi ry'Ukuri

Audited 2026-11-12 from the working tree at `main`. Read the code, not the
previous summaries: every line below is something I opened and checked. This is
the baseline `IMPLEMENTATION_PLAN.md` builds on, and it is deliberately blunt
about what is missing — a news site being audited for ad approval and indexed
by Google cannot afford a flattering document.

Live topology: Firebase Hosting serves the SPA at
`https://ijwi-ry--ukuri.web.app`, Render runs the Express API at
`https://studentnews-backend.onrender.com`, Atlas `cluster0.zzcgd1i` holds the
`ijwi` database. Details and deploy commands are in `DEPLOYMENT.md`.

## 1. What is here

| Area | State | Where |
| --- | --- | --- |
| API | Express 4 + Mongoose 8, CommonJS, 11 route modules, 18 models, 6 services | `backend/src/` |
| SPA | React 19 + Vite 5 + TypeScript (strict, `noUnusedLocals`) + Tailwind 3.4, 29 page components across public, writer, editor and admin | `frontend/src/` |
| Auth | Email+password (bcrypt), Google ID-token sign-in, JWT HS256 with the algorithm pinned in code | `backend/src/routes/authRoutes.js`, `config/env.js` |
| Roles | `READER`, `WRITER`, `EDITOR`, `ADMIN` checked by `authorize(...)` per route | `backend/src/middleware/auth.js` |
| Editorial flow | Writer applies → admin approves → story moves through `draft / pending_review / approved / rejected / published / archived` | `models/Article.js`, `routes/editorRoutes.js` |
| Reader engagement | Views (with validity rules), likes, bookmarks, comments, reports, follows, in-app notifications | `services/engagementService.js`, `services/validViewService.js` |
| Writer rewards | Valid-view accounting, weekly stats, earnings, payout requests with admin rejection reasons | `services/rewardService.js`, `routes/adminRoutes.js` |
| Media | Images normalised client-side, stored as documents in Atlas, mirrored to disk as a cache, cap on collection size | `services/uploadStore.js`, `routes/uploadRoutes.js` |
| AI writer | Admin-only Gemini draft + save, per-IP call cap, server-side auto-publish switch that still requires a review step | `services/geminiService.js`, `pages/admin/AdminAiWriterPage.tsx` |
| Live video | One broadcast at a time, Socket.IO signalling, WebRTC with a JPEG relay fallback when no TURN is configured | `sockets/liveSocket.js`, `utils/liveMedia.ts` |
| Publishing/SEO | `robots.txt`, sitemap index with pages/articles/categories/writers/news children, RSS `feed.xml`, per-route canonical + OG + `NewsArticle` JSON-LD, Search Console tag | `frontend/public/`, `utils/useSeo.ts`, `scripts/generate-sitemap.mjs` |
| Monetisation plumbing | `ads.txt` generator, three reserved ad placements, GA4 wrapper, and both of them held behind a reader's answer to the consent question | `scripts/generate-ads-txt.mjs`, `components/ads/AdSlot.tsx`, `utils/analytics.ts`, `utils/consent.ts` |
| PWA | Manifest, generated icons, offline shell worker, install prompt, Web Push subscriptions | `frontend/public/sw.js`, `components/pwa/` |
| Publisher pages | About, Contact, Editorial Policy, Corrections, Advertising, Privacy, Cookie Policy, Disclaimer, Terms | `frontend/src/pages/public/` |
| Abuse limits | Rate limits on auth, password reset, uploads and AI calls, keyed on the real client IP; every stored string cleaned and length-capped; error responses no longer serialise an error object | `app.js`, `utils/textFields.js`, `middleware/errorHandler.js` |
| Transport security | `helmet` on the API, a `Content-Security-Policy` response header on every hosted file | `app.js`, `frontend/firebase.json` |
| Tests | 29 backend API tests, all passing | `backend/tests/api.test.js` |

## 2. What is missing, by how much it hurts

### Blocks an AdSense or Google News review

1. **Consent handling — closed 2026-11-12.** GA4 and the ad script now load only
   after the reader answers yes to a banner (`components/consent/ConsentBanner.tsx`),
   the answer is remembered in that browser, and the cookie page can take it back.
   What is still true: the answer lives only in the reader's browser, so there is no
   server-side proof of consent for an audit, and every reader is asked the same
   question regardless of where they are.
2. **No author identity beyond a username.** `/user/<id>` exists, but there is no
   authors directory, no `Person` structured data, no beat or credential, so a
   reviewer cannot see who stands behind a story.
3. **No contact route that works — closed 2026-11-12.** `/contact` now carries a
   validated form (`POST /api/contact`, honeypot + rate limit + server-side checks)
   that stores into `ContactMessage` and appears in the admin inbox at
   `/mugishaimekevin/messages`. What still remains: nothing forwards those messages
   to an email box, so a member of staff has to open the admin inbox to see them.
4. **Cookie policy and disclaimer — closed 2026-11-12.** `/cookies` and
   `/disclaimer` exist, are in the footer, the newsroom-page list and the sitemap,
   and the cookie page names the real storage keys rather than a generic list.
5. **No custom domain.** Everything is on the Firebase `web.app` origin, which
   AdSense treats as a shared host and Google News as a weak signal. Canonicals,
   sitemaps and feeds are all baked to that origin.

### Editorial credibility gaps

6. **No corrections records.** `/corrections` describes a policy the database
   cannot honour: nothing is stored, nothing is shown on a corrected story.
7. **No revision history or review trail.** An edit overwrites the previous text
   with no who/when/why, and a rejection is the only feedback channel.
8. **No source records.** A story carries no list of where its facts came from, so
   "verified" is a claim rather than a checkable field.
9. **No scheduled publishing.** `publishedAt` is set when an admin clicks publish,
   so an embargo needs someone awake at the time.
10. **No breaking-news handling.** Nothing can be flagged, prioritised or expired.
11. **Four coarse roles.** A person who can edit SEO cannot be separated from a
    person who can pay writers, so the admin portal has to be handed over whole.

### Audience and reach

12. **One language of content.** The interface switches between four languages, but
    a story is stored in one and the routes have no language prefix, so `/rw` and
    `/fr` do not exist and hreflang cannot be emitted.
13. **No newsletter, no podcast, no video library, no social distribution** — the
    reader either visits or does not.
14. **No trending intelligence.** The home carousel shows the newest 24 stories,
    which is a recency list, not a trend signal.

### Engineering hygiene

15. **No frontend tests at all.** `backend/tests/api.test.js` (29 cases) is the only
    automated check, and it now runs in CI (`Read the code, not the summary` is no longer
    the only defence). There is no test for a single React component, so a page that
    renders wrong reaches readers unnoticed — which is how the header search box shipped
    pointing at a query parameter the results page never read.
16. **Collaboration files exist as of 2026-11-12 but have never been exercised**: the CI
    workflow has not run on GitHub yet (nothing has been pushed), branch protection and
    private vulnerability reporting are owner settings that `CODEOWNERS` and `SECURITY.md`
    can only ask for, and `backend/package-lock.json` is still untracked, so CI installs
    the backend with `npm install` and gets whatever versions are current that day.
17. **Performance is unmeasured, and the first number is not reassuring.** The SPA builds
    to one JavaScript chunk of 1.27 MB (365 kB gzipped) that every reader downloads before
    the page shows anything, with Google Translate, GIS, GA4 and the ad script all asking
    for the main thread after that. No Lighthouse or Core Web Vitals figure exists for the
    live site, so LCP, INP and CLS are unknown rather than fine.
18. **`render.yaml` is documentation, not the deployment.** The Render service was
    created from the dashboard, so the file can drift from reality without any
    deploy noticing.

## 3. Known production damage that is not the code's fault

- Images uploaded before 2026-11-07 were lost when Render's free disk was wiped;
  the stories still reference them and show `/placeholder-article.svg`. Authors
  must re-attach. (`OWNER_ACTIONS.md`)
- Several credentials passed through chat windows and commits — Gemini key, Atlas
  password, JWT secret, the old admin password, VAPID pair, OAuth client secret.
  All need rotating; none can be fixed from inside the repository.
- Atlas may still hold the `editor`/`writer`/`reader` demo logins that the old seed
  created with committed passwords. The seed no longer runs in production, but the
  accounts stay until they are changed or deactivated.

## 4. What the plan does with this

`IMPLEMENTATION_PLAN.md` sequences the gaps above into releases: Release 0 finishes
the security and documentation foundation, Release 1 makes the site reviewable by
Google, Release 2 gives the newsroom a real workflow, Release 3 adds trending
intelligence, Release 4 multiplies reach, Release 5 is monetisation readiness.
`DATA_MODEL.md` is the schema map it builds on, `EDITORIAL_WORKFLOW.md` the process
target, `ENVIRONMENT_VARIABLES.md` the configuration surface, `DEPLOYMENT_PLAN.md`
the release procedure, and `OWNER_ACTIONS.md` the list of things only the owner can
do.
