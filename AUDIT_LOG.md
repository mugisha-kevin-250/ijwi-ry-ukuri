# Newsroom activity log

The Activity log is available in the admin portal at `/mugishaimekevin/audit-log`.

## What is recorded

The first release writes append-only MongoDB records for:
- article workflow state transitions (submission, approval, rejection, publication, archive and withdrawal when they pass through the shared workflow service);
- correction notices and article disclosure/media-credit changes;
- source-verification decisions;
- enabling and disabling the breaking-news flag;
- staff account role, activation and writer-status changes.

Each entry stores the actor (when known), action key, affected record type and ID, a short label and summary, timestamp, and a deliberately small set of event-specific details. Request IP and user-agent are captured for routes that provide request context.

## Access and retention

- The API requires the existing `viewNewsroomDesk` permission. The frontend uses the same permission gate.
- Results are newest-first, paginated (25 by default, 100 maximum), and searchable.
- There is no edit or delete endpoint for audit records.
- Article text, passwords, reset codes, bearer tokens, and full request bodies are not copied into the log.
- If an audit write fails after a business action has already been saved, the action remains successful and the failure is written to the server log. Operators should monitor Render logs and database health; this is not a transactional compliance ledger.

## Remaining work

Assignments and deadline changes, comment moderation, ad/payout changes, mail/scheduler operations, and full export/retention controls still need event coverage. The Activity log is an operational accountability feature, not a substitute for immutable external backups or a formal regulatory audit system.
