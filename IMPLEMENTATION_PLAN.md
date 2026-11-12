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
sponsored labels, `sitemap-images.xml`, server-side proof of the consent answer, and any measured
Core Web Vitals numbers.

| Work item | Existing | Required changes | Dependencies | DB impact | Security/privacy impact | Acceptance criteria | Testing |
|---|---|---|---|---|---|---|---|
| Canonical domain/redirects | Firebase default domain live | Support custom domain, canonical host redirects, URL preservation, sitemap/meta/canonical alignment | Owner-registered domain, DNS, hosting config | None | TLS/redirect correctness | Single canonical domain; old URLs resolve/redirect correctly | Manual + crawl checks |
| Required publisher pages | 9 of the list live | Only the Authors/Journalists directory is left; the pages exist, are routed, translated and in the footer | Owner author data | Minimal (settings/content storage optional) | Legal/privacy accuracy depends on owner | Pages routable, linked in footer/header, accessible | Content review, responsive check |
| Contact form | Live | `POST /api/contact` with server-side validation, a honeypot field, 10 messages an hour per IP and an admin inbox at `/mugishaimekevin/messages` (open/answered/closed, delete is owner-only) | None | New `ContactMessage` collection (name, email, topic, message, status) | No IP/user-agent stored; PII is deletable by staff; spam never reaches the inbox | Submissions validated server-side; no private leakage | 4 API cases: reader submits, invalid input refused, honeypot stores nothing, staff transitions + owner-only delete |
| Author model/pages | Partial (User/WriterProfile) | Dedicated/public author records (or extend safely), author pages listing articles, Person schema, verified identities only | Owner author data | Additive fields/collection | Avoid fabricated identities | Author pages render real profiles/articles | Data migration-safe tests |
| Article template/SEO | Partial | Complete bylines/dates/image credits/captions/corrections label/sponsored label/related/share/bookmark, dynamic meta/OG/JSON-LD (NewsArticle/Org/Person/Breadcrumb), canonical | Frontend + API shape | Additive fields (e.g. image credit/caption/correction refs) | Accurate metadata only | Valid structured data; accessible layout | Rich Results/Schema validators, responsive |
| SEO endpoints | Partial | `/robots.txt` correctness, `/sitemap.xml` index, `/sitemap-news.xml`, `/sitemap-images.xml` (if useful), `/feed.xml` RSS; exclude drafts/private/noindex; stable canonicals | API/public URL data | None | No private URL leakage | Valid XML/RSS; Search Console-ready | Fetch/validate endpoints |
| ads.txt & AdSense prep | Built, waiting on the owner id | `/ads.txt` from `VITE_ADSENSE_PUB_ID`, three consent-aware placements that render nothing without their own slot id | Owner AdSense publisher ID/approval | None | Policy/compliance | Correct file when configured; no fake ads | Verified in the browser with test ids |
| GA4 & consent | Built, waiting on the owner id | `page_view` per route plus share/copy_link/search events, no PII; a banner that asks once, keeps the answer in `localStorage`, and refuses to fetch either Google script until yes; `/cookies` shows the answer and resets it | Owner GA4 ID | None yet — the answer is browser-local, so there is no consent record to audit | High (privacy); default is refusal | Events fire once with consent; opt-out honored and reversible without support | Verified in the browser with a test id: decline loaded no script, accept reported the current path |
| Performance/CWV | Unknown | Image optimization, lazy-load, dimensions, font/code splitting/caching review; measure LCP/INP/CLS | Tooling/time | None | None | Meets reasonable targets; no regressions | PageSpeed Insights/field data |
| Search Console | Doc/process | Verification support (meta/DNS per hosting), sitemap submit instructions, monitoring checklist | Owner access | None | None | Documented and testable steps | Owner-verified externally |

## Release 2 — Global newsroom & editorial workflow (High) — STARTED

Status 2026-11-12: the pieces already running are writer applications that an admin
approves, the four roles with `authorize()` checks on every route, the
`draft/pending_review/approved/rejected/published/archived` states an editor moves a story
through, and the AI writer's own gate: a generated story is saved as a draft and only goes
live when an admin publishes it, even with auto-publish switched on. Missing: granular
permissions and staff roles, `in_review`/`changes_requested` with feedback, revisions,
sources, corrections records, breaking news and scheduled publishing.

| Work item | Existing | Required changes | Dependencies | DB impact | Security impact | Acceptance criteria | Testing |
|---|---|---|---|---|---|---|---|
| Categories/regions/countries | Basic categories | Hierarchy, reorder/activate, region/country entities and `/world/...` pages with real content/indexability rules | Editorial taxonomy decisions | Additive collections/refs + safe migration | Public read filters | Pages show relevant published news; no thin auto-pages | URL/content tests |
| RBAC expansion | Coarse roles | Roles/permissions model (Super Admin, Managing/News Editor, Journalist, SEO Editor, Social Manager, Ad Manager) enforced server-side | Product decisions | Additive | Critical | Unauthorized actions blocked API-side | Permission tests |
| Editorial workflow | Basic statuses | Draft→Submitted→In Review→Approved/Changes Requested→Scheduled/Published→Updated/Correction/Archived, feedback, revision history, actor/timestamps | UI+API redesign | Additive (revisions/reviews) | Auditability | End-to-end flow; drafts private | Workflow tests |
| Source verification | Missing | Source records per important story, verification status/review metadata | Editorial process | Additive | Integrity | Sources stored and reviewable | CRUD/validation tests |
| Corrections | Missing | Correction records/notices, previous vs corrected info, approver/timestamps, visible notices | Policy + UI | Additive | Trust/transparency | Material changes recorded, not silent | Audit tests |
| Breaking news | Missing | Managed breaking items with priority/time window/approval/display | UI placement | Additive | Prevent misuse | Active items display correctly and expire | Scheduling/UI tests |
| Scheduled publishing | Missing | Reliable UTC scheduler, idempotent publish, failure handling/manual recovery, hidden until published | Job runner/cron/queue choice on Render | Additive job/state fields | Prevent premature exposure | Scheduled posts publish once and safely | Time-based tests |

## Release 3 — Global Trending Intelligence (High) — NOT STARTED

Nothing here exists yet: no provider adapter, no trend score, no review queue, no
dashboard. The only "trending" surface today is the home carousel of the newest 24
published stories, which is recency, not a signal — and it is labelled as such.

| Work item | Existing | Required changes | Dependencies | DB impact | Security impact | Acceptance criteria | Testing |
|---|---|---|---|---|---|---|---|
| Provider architecture | None | Server-side adapters for Trends/GDELT/approved news APIs, config, secrets in env, caching, rate-limit/error handling, attribution/provenance | Owner API access/terms, compliant methods | Additive | Key protection | Integrations health-visible; no frontend secrets | Adapter/unit tests |
| Ranking/clustering/queue | None | Transparent versioned trend score, topic clusters, evidence, editorial review/assignment queue (no auto-publish) | Algorithm/product tuning | Additive | Prevent misinformation automation | Scores explainable; editors control outcomes | Data/logic tests |
| Dashboard | None | Real-data trend views/filters/history/refresh; honest unconfigured states | Above integrations | Read models | None | No fake/sample prod data | UI/integration tests |

## Release 4 — International distribution (Medium–High) — PARTIAL

The interface speaks English, Kinyarwanda, French and Kiswahili from the header flag menu
and a reader can choose their language in Settings, but content is not routed by language:
no `/en` `/rw` `/fr` prefixes, no translation records, no hreflang. The newsletter form
stores an address in the browser and sends it to nobody. Live video works but needs a TURN
relay to reach everyone. No podcast, radio, social distribution or reader-preference
controls yet.

| Work item | Existing | Required changes | Dependencies | DB impact | Security impact | Acceptance criteria | Testing |
|---|---|---|---|---|---|---|---|
| Multilingual publishing | UI labels only | `/en|/rw|/fr` routes/content, translation records/workflow/review, hreflang, language-specific SEO/sitemaps/feeds | Editorial translation process | Additive | Content integrity | Correct language routing/metadata; no empty translations | i18n/SEO tests |
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
  click, not whether the story is reviewed.
- **Trend input is typed, not scraped.** The trend source for now is "admin types the
  topic", not an automatic feed of other publishers' headlines.
- **English is the default**, with Kinyarwanda, French and Kiswahili still selectable.
- **Advertising and analytics ids come from the owner.** They have not been provided, so
  the site loads no ad script, writes no `ads.txt` and reports nothing to GA4. Applying to
  AdSense is the owner's decision and will not be done on their behalf.

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
4. Add provider adapters and trending queue (Release 3) behind configured integrations.  
5. Expand to multilingual/newsletter/media/distribution (Release 4) with owner-provided services/credentials.  
6. Execute readiness/growth items (Release 5) only after quality, policy, and technical gates pass.
