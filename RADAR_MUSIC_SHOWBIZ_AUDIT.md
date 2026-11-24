# RADAR Music, Showbiz and newsroom audit

Updated: 2026-11-24
Repository: mugisha-kevin-250/ijwi-ry-ukuri
Production frontend: https://www.radartimes.2bd.net
Stack: React 19 + Vite + TypeScript, Express API, MongoDB Atlas, Firebase Hosting, Render API

## Executive summary

RADAR already has a radio timetable, scheduled newsroom bulletins, browser speech playback, a live-broadcast hand-off, Audius catalogue search, an admin-curated Audius station playlist, and a protected stream relay. This release adds a separate Music & Showbiz discovery page at /music, links to it from /radio, and keeps the public search experience responsive on phones.

The implementation does not turn the backend into an unrestricted third-party audio proxy. Tracks selected by the newsroom can play inside RADAR. Catalogue search results link to the artist's official Audius listening page for full playback, artist/release information, and downloads only where the rights holder has enabled them.

## Existing system audit — verified in source

| Area | Current state | Notes |
|---|---|---|
| Newsroom frontend | React 19, Vite, TypeScript, Tailwind | Public, writer, editor and admin surfaces |
| Backend | Express + Mongoose | API runs separately from Firebase Hosting |
| Data | MongoDB Atlas | Article, user, engagement and radio records |
| Reader authentication | Implemented | Email/password and Google sign-in; role checks on API |
| Editorial workflow | Implemented baseline | Draft, review, approval, publication and archive states |
| Reader engagement | Implemented baseline | Views, likes, bookmarks, comments, reports, follows, notifications |
| Radio schedule | Implemented | Timetable and current/next programme |
| News audio | Implemented | Browser speech bulletin and story queue |
| Live broadcast | Implemented baseline | WebRTC/socket signalling with relay fallback |
| Audius discovery | Implemented in backend | GET /api/radio/audius/search?q=... |
| Curated music | Implemented | Admin-selected tracks stored in MongoDB |
| Curated music streaming | Implemented | Express relay checks active station tracks and supports byte ranges |
| Music & Showbiz page | Added in this release | /music, searchable catalogue, curated player, provider hand-off |
| SEO | Implemented baseline | Canonicals, metadata, structured data, robots and generated sitemaps |
| PWA | Implemented baseline | Manifest, service worker, install and push subscription plumbing |
| Deployment | Split by service | Firebase deploys frontend; Render deploys API |
| Backend tests | Existing automated suite | CI runs backend tests |
| Frontend tests | Still missing | TypeScript and Vite build checks are not component/end-to-end tests |

## This release — implemented

- Added frontend/src/pages/public/MusicShowbizPage.tsx.
- Added the /music route to the route prefetch registry. The page remains lazy-loaded.
- Added an animated, reduced-motion-aware Music & Showbiz destination on the Radio page. It opens /music in a separate tab.
- Added Audius catalogue search by song, artist or genre.
- Added track artwork, artist name, duration and official provider links to search results.
- Added in-page audio controls for the administrator-curated RADAR playlist.
- Added a rights-aware download hand-off: download availability remains on the official Audius track page and is controlled by the artist/provider.
- Added page title, description and canonical SEO path through the existing useSeo utility.
- Used responsive grid/flex layouts, fluid inputs, touch-sized buttons, wrapping controls and lazy-loaded artwork.
- Kept existing news speech, radio timetable, live broadcast, authentication, APIs, sitemap generator and deployment configuration intact.

## Music product gaps still requiring a later release

1. A RADAR-owned music catalogue with artist-submitted releases and verified artist profiles.
2. Artist consent, rights/licence records, takedown workflow and territory restrictions before RADAR hosts or redistributes any music files.
3. Download management only for files with explicit rights-holder permission and auditable licence metadata.
4. Playlists, favourites and listening history saved to reader accounts.
5. Genre, language, mood and regional filters; pagination and search analytics.
6. Music editorial desk for approving artist profiles, track metadata, featured releases and showbiz stories.
7. Music charts based on transparent, abuse-resistant listening/engagement signals.
8. Podcast and interview episodes, RSS feeds and episode transcripts.
9. Optional station schedule automation and live DJ/show host controls.
10. Accessibility checks for player labels, keyboard use, captions/transcripts and reduced-motion behavior.

## Full newsroom roadmap — outstanding work

Priority 1 — Editorial accountability:
- Assignments with reporter, desk, due date, priority, ownership and history.
- Explicit IN_REVIEW and CHANGES_REQUESTED transitions with editor feedback.
- Searchable audit coverage for assignment, moderation, source verification, payout, ad and operational changes.
- Source records and verification status attached to stories.
- Revision history and public correction records.

Priority 2 — Audience and reach:
- Human-reviewed journalist profiles, beats and credentials.
- Newsletter subscriptions, consent, campaigns and unsubscribe handling.
- Podcast/video archive and approved social distribution.
- Multilingual editorial records with human review and stable /en/, /rw/, /fr/ URLs.
- Push delivery retries and monitoring.

Priority 3 — Reliability and trust:
- Frontend component and end-to-end tests.
- Database backup and restore drills; durable media storage and restore strategy.
- Distributed scheduler locks, retries and recovery.
- Lighthouse/Core Web Vitals monitoring and image/media health checks.
- Server-rendered or prerendered article pages and genuine HTTP 404 behavior.
- Rotate credentials previously exposed in chat or commits; do not place secrets in frontend code or repository files.

## Mobile and responsive review

The existing code already includes responsive masthead/header behavior, a collapsible mobile navigation, compact radio controls and responsive article layouts. The new Music & Showbiz page is built mobile-first. The remaining whole-site work should be verified on real devices and at 320px, 360px, 390px, 768px and desktop widths.

Test these specific behaviors:
- Header never covers page content and its measured height updates after rotation.
- Search and music controls remain usable with touch and keyboard.
- Audio controls fit the viewport without horizontal scrolling.
- Article tables, long URLs, headlines and images do not cause page overflow.
- Admin/editor forms remain usable on narrow screens, not only public pages.
- Reduced-motion preferences disable decorative animations.
- Offline shell and slow-network states are understandable.
- Validate contrast, focus visibility, screen-reader labels and tap targets.

## Security and licensing boundaries

- Do not remove the active-station check from /radio/audius/stream/:trackId. It prevents an unrestricted public proxy.
- Do not expose AUDIUS_API_KEY or other provider credentials in Vite environment variables.
- Do not present third-party catalogue tracks as RADAR-owned content.
- Do not provide a direct download unless the rights holder has expressly made the file downloadable and RADAR has a documented right to distribute it.
- Treat search metadata as unverified third-party data; it is not newsroom approval.
- Keep Firebase Hosting and Render deployment responsibilities separate.

## Deployment and verification

- Frontend: cd frontend && npm ci && npm run build, then Firebase Hosting deploy.
- Backend: changes under backend/ require Render deployment; Firebase Hosting does not deploy the API.
- GitHub CI validates backend tests, frontend TypeScript/build and tracked-secret checks.
- Verify the deployed /radio and /music pages, catalogue search, curated playback, mobile layouts and canonical metadata after release.
- Previous Firebase deployment attempts had a Google Cloud authentication/secret issue. The expected GitHub Actions secret is FIREBASE_SERVICE_ACCOUNT_IJWI_RY_UKURI. A successful GitHub push or CI run alone does not prove Firebase production deployment succeeded.


## Release 2 — newsroom assignments implemented

- Added a MongoDB-backed NewsroomAssignment model with reporter, creator, desk, brief, priority, deadline, status, linked article, submission note and event history.
- Added protected /api/assignments endpoints to list assignments, list eligible assignees, create assignments, update assignment details and progress statuses.
- Editors/managing editors/admins with the existing review permission can create and manage assignments.
- Writers can see only assignments assigned to their own account and can move them through accepted, in progress and submitted.
- Assignment creation, edits and status changes write safe append-only entries to the existing AuditLog service.
- Added a responsive shared assignment workspace at /writer/assignments and /editor/assignments.
- Added sidebar links for reporters and editors and a shortcut card on the editor dashboard.
- No new role or database migration is required; Mongoose creates the collection and indexes when first used.

## Next release plan — not yet implemented

1. **Music artist onboarding and rights desk:** artist applications, verified profiles, release metadata, explicit rights declarations, evidence/contract reference, editorial approval, takedown requests and a licence-aware download policy. Do not accept or host copyrighted audio until permission and storage controls exist.
2. **Reader engagement:** account-saved playlists, music favourites, listening history and privacy controls; add abuse-resistant charts only after event deduplication and bot filtering.
3. **Newsletter operations:** confirmation double opt-in, unsubscribe tokens, consent timestamp/source, bounce and complaint handling, campaign segmentation and delivery retry monitoring.
4. **Podcast and video desk:** episode records, show/host profiles, RSS feed generation, transcript/caption support, chapters and provider-hosted audio/video.
5. **Platform quality:** frontend unit and end-to-end tests, API integration tests for assignment permission boundaries, accessibility checks, responsive browser testing, Core Web Vitals, backup/restore drills and monitoring.
6. **Editorial verification improvements:** structured source evidence, corrections workflow review, revision diff display and an audit-log search/export experience.

Acceptance checks for the assignment release:
- A reader cannot read or create assignments.
- A writer can only see and update their own assigned records.
- A writer cannot assign a story to another user, approve it or cancel it.
- A reviewer can create and manage assignments.
- Invalid user IDs, invalid deadlines, empty briefs and unsupported status values are rejected.
- Assignment actions appear in the audit log.
- Verify the new pages on narrow mobile widths and run backend tests plus frontend typecheck/build before production rollout.


## Release 3 — Artist onboarding and rights workflow implemented

- Added MongoDB artist and music-release records without changing existing radio playlist records or user accounts.
- Authenticated readers can apply for one artist profile. Only the administrator's new manageMusic permission can verify, reject or suspend applications.
- Verified artists can submit music metadata, artwork URLs and official listening URLs. A rights declaration and rights basis are required; a written permission/licence submission also requires a supporting evidence URL.
- Submitted releases remain pending. Only approved releases linked to verified artists appear in the public Music & Showbiz catalogue.
- The artist workspace displays application status, release status and lets the submitting artist request takedown.
- The administrator queue supports artist decisions, release approval/rejection and takedown resolution.
- All application, submission, review and takedown actions are recorded through the existing safe audit-log service.
- Radio's Explore Music entry now navigates within the app to /music.

Release 4 extension: the public /music route is registered in the actual router; the dedicated /mugishaimekevin/music admin page is linked in staff navigation and protected by manageMusic. Artist profile editing, approved-release charts, rate-limited play counting, private playlists and personal listening history are implemented. Playlists can only contain approved releases.

Safety and remaining work: no third-party audio is uploaded or copied; listening opens the official provider. The music desk always forces direct downloads off. The existing newsroom has story video and live broadcast functionality, but a separate podcast publishing workflow has not yet been added. Private rights-document upload/retention, evidence verification, secure licensed-audio storage/download delivery, artist appeals and a full moderation-history timeline remain outstanding.
