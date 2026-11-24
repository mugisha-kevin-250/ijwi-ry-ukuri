# RADAR newsroom implementation roadmap

Updated: 2026-11-24
Repository: mugisha-kevin-250/ijwi-ry-ukuri
Production frontend: https://www.radartimes.2bd.net

## Guardrails
- Preserve the React/Vite frontend, Express API, MongoDB, Firebase Hosting and Render topology.
- Extend existing routes, services, models and staff permissions; do not replace authentication, article records, public URLs or deployment configuration.
- Enforce every administrative mutation on the backend.
- Keep provider credentials server-side. External AI output and external media metadata are not editorial approval.
- Run backend tests and frontend TypeScript/build checks before production deployment.

## Release 1 — Radio and audience audio
- [x] Audius catalogue search and an admin-curated playlist integrated into the existing radio settings.
- [x] Store Audius IDs and metadata in MongoDB; proxy playback through Express, preserving byte-range requests.
- [x] Keep existing scheduled news bulletins and browser speech playback intact.
- [x] Add a separate responsive /music Music & Showbiz discovery page with catalogue search and official provider hand-off.
- [x] Add animated, reduced-motion-aware Music & Showbiz entry point from /radio.
- [x] Keep curated RADAR tracks playable in-page while catalogue search results link to official artist listening pages.
- [ ] Configure optional AUDIUS_API_KEY in Render for higher rate limits.
- [ ] Verify playback on desktop/mobile and confirm selected tracks remain available.
- [ ] Build artist rights/licence records and an approval/takedown workflow before hosting or distributing third-party downloads.

## Current implementation update — 2026-11-24

- [x] Newsroom activity-log foundation: append-only MongoDB records for article workflow transitions, corrections/disclosures, breaking-news decisions and staff account access changes; staff-only paginated/searchable API and admin Activity log screen.
- [ ] Extend audit coverage to assignments, corrections/disclosures, staff permission changes, moderation and operational actions. The first slice is not a complete compliance audit trail.
- [x] Add assignment ownership, due dates, priority and desk-level queues. See `RADAR_MUSIC_SHOWBIZ_AUDIT.md` for the implementation and security boundaries.

## Release 2 — Editorial operations
- [x] Story assignments with journalist, desk, deadline, priority and status.
- [x] Dedicated reporter workspace for assigned work and progress updates; editor workspace for creating and tracking assignments.
- [x] Assignment creation, updates and status changes recorded in the existing append-only audit log.
- [ ] Dedicated IN_REVIEW and CHANGES_REQUESTED transitions with editor feedback.
- [x] Reporter allocation and assignment event history stored with each assignment.
- [ ] Complete searchable audit coverage for assignment, source-verification, moderation, ad/payout and operational changes (the first slice now records article workflow transitions, corrections/disclosures, breaking flags and staff account access changes; see `AUDIT_LOG.md`).
- [ ] Editorial calendar, overdue queue, source verification and public correction notices.

## Release 3 — Journalist and newsroom management
- [ ] Verified journalist profiles, beats, biographies and credentials.
- [ ] Music artist onboarding, verification, licence evidence and takedown workflow (planned as the next implementation batch).
- [ ] Desk/department directory and staff status.
- [ ] Role-specific dashboards for managing editor, news editor, journalist, SEO and advertising teams.
- [ ] Performance reports built from existing article and engagement records.

## Release 4 — Multilingual publishing
- [ ] Language-specific article records and editorial approval.
- [ ] Translation assignment, review and revision history.
- [ ] Stable /en/, /rw/ and /fr/ URLs, canonical and hreflang.
- [ ] Language-aware sitemap and publication controls.

## Release 5 — Distribution and media
- [ ] Newsletter campaigns, delivery and engagement reporting.
- [ ] Podcast episodes, feeds and archive.
- [ ] Video archive and live broadcast reliability (TURN monitoring).
- [ ] Approved social publishing integrations and delivery logs.
- [ ] Push delivery monitoring and retry handling.

## Release 6 — RADAR intelligence
- [ ] Trend clustering, historical movement and geographic comparison.
- [ ] Research reports with source references and saved investigations.
- [ ] AI fact-checking and headline/SEO assistance with human approval.
- [ ] AI must never publish unverified content automatically.

## Release 7 — Production quality
- [ ] Complete API permission/security review and account/session controls.
- [ ] Database backup and restore drills; media backup strategy.
- [ ] Distributed scheduler/job claims and retry recovery for multiple instances.
- [ ] Frontend component and end-to-end tests.
- [ ] Lighthouse/Core Web Vitals, broken-media and sitemap monitoring.
- [ ] Server-rendered/prerendered public articles and genuine HTTP 404 responses.

## Deployment boundary
Firebase Hosting deploys the frontend only. The Express API and MongoDB models run on Render/Atlas. A frontend deployment cannot deploy backend changes. Backend changes require the existing Render auto-deploy or a manual Render deploy. Verify each host independently.
