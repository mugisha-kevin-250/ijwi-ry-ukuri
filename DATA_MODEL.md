# DATA_MODEL

Status: current-state inventory + target evolution plan.  
Sources inspected: `backend/src/models/*.js`, route/service usage. **No direct production DB inspection performed.**  
Migration rule: safe, additive evolution only; back up before changes; preserve stable IDs/URLs/relationships; no destructive resets.  
Status 2026-11-12: this inventory was checked against `backend/src/models/*.js` and still
matches, except that `Article` now also carries `aiGenerated`. Nothing in section 3 has been
created yet, and no collection has been dropped or renamed.

## 1. Current entities (as implemented)

| Entity (collection/model) | Key fields (observed) | Relationships | Notes |
|---|---|---|---|
| User (`User`) | fullName, username, email, password(select:false), googleId, role[READER/WRITER/EDITOR/ADMIN], isActive, avatar, country, language, bio, writerStatus[pending/approved/rejected/suspended], writerProfile ref, lastLoginAt, timestamps | -> WriterProfile; authored Articles; engagement refs | Coarse RBAC; no permissions table |
| WriterProfile (`WriterProfile`) | user(unique), fullName, username, bio, profileImage, country, language, reasonForWriting, status, totalArticles, totalValidViews, timestamps | <- User; target of Follow | Separate from User identity |
| Category (`Category`) | name, slug(unique), description, isActive, parent ref, order, aliases[], labelKey, timestamps | <- Article.category; parent -> Category | Seeded from `backend/src/utils/categoryTree.js` at boot (`seedSections()`), one document per section and sub-section; duplicates from before are collapsed at read time, never deleted |
| Article (`Article`) | title, slug(unique), summary, metaDescription, content, featuredImage, author ref, category ref, tags[], status[draft/pending_review/approved/rejected/published/archived], views/validViews/uniqueViews/likes/commentsCount, readingTime, language, country, aiGenerated, publishedAt, timestamps | -> User(author), Category; -> Comment/Like/Bookmark/ArticleView/Report | No image credit/caption, no revisions, sources, corrections, translations or scheduling metadata |
| Comment (`Comment`) | article/user refs, content/status/metadata (per model/routes) | -> Article, User | Moderation basic |
| Like (`Like`) | article, user (uniqueness via upsert pattern) | -> Article, User | Denormalized count on Article |
| Bookmark (`Bookmark`) | article, user | -> Article, User | Reader save |
| Follow (`Follow`) | follower, writer (WriterProfile ref) | -> User, WriterProfile | Writer-follow semantics |
| ArticleView (`ArticleView`) | article, user/session/IP-hash/validity signals, timestamps | -> Article | Valid-view/anti-fraud tracking |
| Report (`Report`) | article, reporter, reason/details/status | -> Article, User | Content reporting |
| Notification (`Notification`) | user, type, message, isRead, relatedEntity/relatedModel, timestamps | -> User (+ polymorphic related) | In-app inbox |
| PushSubscription (`PushSubscription`) | user/endpoint/keys/subscription data | -> User/device | Web push delivery |
| Upload (`Upload`) | filename, contentType, size, data(buffer), uploadedBy, timestamps | -> User | DB-backed media store + disk cache |
| WriterEarning / WriterWeeklyStat | writer/period/views/amount/status fields | -> User/WriterProfile | Rewards accounting |
| Payout | writer/amount/status/period/payment refs | -> User/WriterProfile | Payout workflow |
| PlatformSetting (`PlatformSetting`) | key(unique), value(mixed), description, timestamps | global | Rates/limits/flags/bootstrap markers |
| Live / LiveComment | broadcast session/chat state | -> User/Live | Live video feature |
| TrendTopic (`TrendTopic`) | provider, geo, topic, day (unique together), trafficLabel, approxTraffic, seenAt, newsItems[{title,url,source}], sourceUrl, sightings, firstSeenAt, lastSeenAt | feeds the admin radar; seeds one AI story | One document per topic per region per day. Stores only what the provider printed — the band label and its number, never a count of our own. Pruned after 21 days |

## 2. Gaps relative to target product

Missing or incomplete for planned releases: granular roles/permissions, article revisions/translations/scheduling records, sources and corrections, author-as-journalist rich entity, regions/countries, breaking news records, editorial assignments/reviews/feedback, trend scores/clusters (the raw provider observations are stored since 2026-11-13, nothing derives a score from them yet), newsletter subscribers/campaigns/consent logs, podcasts/episodes, videos, radio stations/programs, social post drafts/logs, ad placements/ads config, consent records, audit logs, integration settings/health, reader preferences/deletion workflows.

## 3. Target logical entities (planned, additive)

Design to fit current stack (Mongoose/Mongo) and adapt names/types to existing conventions. Add indexes and access rules per entity.

| Entity | Purpose | Core fields (planned) | Key relationships | Migration notes |
|---|---|---|---|---|
| roles / permissions / role_permissions | Fine-grained RBAC | name, slug, description, permission keys/scopes | users/assignments | Map existing 4 roles first; do not break auth |
| author_profiles (or extend WriterProfile/User) | Public journalist identity | displayName, slug, photo, bio, role/title, beats, languages, contacts/social (approved), user ref, active, timestamps | articles, user | Never fabricate; preserve current author display |
| article_revisions | Edit history | article, editor, diff/snapshot, status, note, timestamps | article, user | Append-only |
| article_translations | Language variants | sourceArticle, language, slug, title/summary/content, status, reviewer, timestamps | article, user | Link to original; no auto-publish |
| article_sources | Verification | article, title/org/url/type, accessedAt, quote/ref, verificationStatus, notes, addedBy/reviewedBy | article, users | Required workflow for important stories |
| corrections | Transparency | article, reason, previous/corrected fields, approver, publicNotice, timestamps | article, user | Immutable/auditable records |
| categories (evolve) | Taxonomy | add parent, order, locale names/descriptions, active flags | self, articles | Preserve existing slugs/assignments |
| regions / countries | World pages | name, slug, ISO code, region ref, active, intro | hierarchy, articles | Create only useful/indexable pages |
| breaking_news | Alerts | headline, summary, article ref, priority, startsAt/expiresAt, active, approvedBy | article, user | Time-windowed display |
| scheduled_publications | Reliable scheduling | article, runAt(UTC), status, attempts/result, actor | article, job logs | Idempotent execution |
| trending_topics / trend_observations / topic_clusters / trend_sources | Intelligence research | topic/terms/region/timeframe, source/provider ids, normalized metrics, component scores, formulaVersion, cluster links, timestamps | providers, assignments | Provenance required; no auto-publish |
| editorial_assignments / editorial_reviews | Workflow | article/topic, assignee, role, status, feedback, dueAt, timestamps | users, articles/topics | Enforce permissions |
| newsletter_subscribers / consent_records / newsletter_campaigns | Email | email(hash/secure), status, preferences, language, tokens, consent proof, timestamps; campaign content/logs | users(optional) | PII minimization; double opt-in/unsubscribe |
| podcasts / podcast_episodes | Audio | series metadata, episode media/url, duration, publish info, feed fields | authors/media | Authorized media only |
| radio_stations / radio_programs | Radio | stream URL(config), schedule, metadata, active state | none/config | Unconfigured-safe |
| videos | Video library | title, embed/source, captions/transcript refs, rights/attribution, publish state | authors/articles | No unauthorized copies |
| social_posts | Distribution | platform, draft content, asset refs, approval, status, delivery logs | article, user | No credential storage |
| advertising_placements / integration_settings | Monetization/integrations | slot ids/pages/rules, enabled flags, provider config refs (non-secret), health | pages | Consent-aware |
| audit_logs | Accountability | actor, action, entity, before/after summary, reason, ip/context(min), timestamp | users/entities | Protect/read-restrict; retention policy |

## 4. Indexing & integrity guidance

- Preserve unique slugs and stable public IDs; add compound indexes for public queries (status+publishedAt, category/region/country/language filters, author pages, schedules, trend freshness).
- Validate enums/state transitions in application layer; enforce referential consistency and safe cascades/soft-delete where needed.
- Exclude drafts/unpublished/private records from public endpoints, feeds, and sitemaps by query constraints.

## 5. Migration strategy (per change set)

1. **Backup & staging:** snapshot/backup production data; run migration in dev/staging copy first.
2. **Additive first:** add collections/fields/indexes with defaults; backfill in idempotent scripts; keep old read paths working.
3. **Dual-read/write where needed:** deploy compatible code before tightening constraints or removing deprecated fields.
4. **Validation:** compare record counts, spot-check relationships/media/URLs, verify public routes and auth.
5. **Rollback:** keep reversible scripts/feature flags; avoid dropping/renaming in production without a verified fallback.
6. **Documentation:** record schema version/change, scripts run, and results in `CHANGELOG.md`/`TEST_REPORT.md`.

## 6. Data handling & privacy

- Store minimum necessary PII (especially subscribers/contact/consent); encrypt/protect sensitive fields where appropriate; restrict access by role.
- Do not persist full third-party licensed content unless terms explicitly allow and it is necessary; keep provenance/attribution and cache per terms.
- Define retention for logs, analytics-related records, and contact/subscriber data consistent with policy and law.
