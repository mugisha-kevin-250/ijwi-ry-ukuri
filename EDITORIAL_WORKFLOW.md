# EDITORIAL_WORKFLOW

Date: 2026-11-11 (baseline)

## Current workflow (implemented)

- **Roles:** READER, WRITER, EDITOR, ADMIN (`backend/src/models/User.js`, `middleware/auth.js`).
- **Article statuses:** `draft`, `pending_review`, `approved`, `rejected`, `published`, `archived` (`backend/src/models/Article.js`).
- **Writer actions:** apply for writer access (an ADMIN approves, rejects or suspends it —
  nothing is self-serve), then create, edit and submit their own stories. `PUT
  /api/writers/articles/:id` copies only its allowlist of story fields, so review status,
  view counts and the AI flag a writer sends are dropped rather than stored.
- **Editor/Admin actions:** view pending, approve, reject, request correction (currently maps to rejection), publish, unpublish/archive (`backend/src/routes/editorRoutes.js`, `adminRoutes.js`).
- **AI-written stories:** `services/geminiService.js` drafts on an admin's typed topic and
  the result is stored as a `draft`; publication stays a deliberate admin action.
- **Notifications:** in-app notifications and optional web push on publish-related events (service/routes present).

## Gaps vs target newsroom workflow

- No granular roles/permissions (Managing Editor, News Editor, Journalist, SEO Editor, Social/Ads managers) or server-side permission matrix.
- Missing states/transitions and controls: `SUBMITTED`/`IN_REVIEW` distinction, `CHANGES_REQUESTED` with feedback, explicit `SCHEDULED`, `UPDATED`/correction state handling, auditable unpublish reasons.
- No article revision history, inline editorial feedback, assignment system, or approval audit trail (actor/timestamps per transition).
- No source verification records or mandatory review gates for sensitive stories.
- No corrections entity/workflow with public correction notices and recorded previous/corrected facts.
- No breaking-news management module with approval, priority, and expiry.
- No reliable scheduled publishing job (UTC, idempotent, failure recovery, hidden until publish).
- Dashboard metrics and queues are basic; not a full editorial operations view.

## Target workflow (planned)

`DRAFT -> SUBMITTED -> IN_REVIEW -> (APPROVED -> SCHEDULED|PUBLISHED | CHANGES_REQUESTED -> DRAFT/SUBMITTED) -> UPDATED/CORRECTION_RECORDED -> ARCHIVED`

Requirements: drafts private, server-enforced permissions, reviewer feedback, revision retention, auditable publication/corrections, idempotent scheduling, and no automatic publication of unverified/external content.

## Immediate implementation priorities

1. Define permission matrix and enforce server-side checks.
2. Extend Article schema/state machine additively (transitions, scheduling, review metadata).
3. Add revisions, review comments/assignments, source records, and corrections models/routes/UI.
4. Implement scheduler with safe retries/idempotency and admin recovery.
5. Add audit logging and editorial dashboard queues backed by real data.

## Dependencies / owner decisions

- Editorial roles, approval authority, and publishing policy.
- Required fields for sources/corrections and legal/editorial review standards.
- Scheduling timezone/display conventions and operational ownership.
