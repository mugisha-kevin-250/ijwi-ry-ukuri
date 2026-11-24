# RADAR production operations runbook

This runbook covers recovery steps that cannot safely be completed by a code
change alone. Keep production credentials in Render, MongoDB Atlas, Firebase,
and the approved secret manager. Never commit credentials, database dumps,
private keys, or real reader data.

## 1. Scheduler safety across backend instances

The backend now coordinates each scheduled job with a MongoDB lease in the
`schedulerlocks` collection. All Render instances must use the **same**
MongoDB database. The lock is renewed while a job runs and expires after the
configured lease if the owning process dies.

- `SCHEDULER_LOCK_LEASE_MS` defaults to 600000 (10 minutes).
- Do not set it below 60000 (1 minute).
- Leave `ENABLE_SCHEDULER=true` on the intended scheduler-enabled service.
- If you run a separate API-only service, set `ENABLE_SCHEDULER=false` there.
- The lock is not a replacement for idempotent business operations. Keep payout
  generation and publishing idempotent, and inspect the scheduler run board after
  a deploy or outage.

Health endpoints:
- `GET /api/health/live` answers whether the Node process is alive.
- `GET /api/health/ready` returns HTTP 200 only when MongoDB answers a ping;
  otherwise it returns HTTP 503.
- `GET /api/health` remains the compatibility/configuration endpoint.

Use the readiness endpoint for load-balancer readiness checks and the liveness
endpoint for process restart checks. Do not use the legacy health endpoint as
proof that the database is writable.

## 2. MongoDB backup policy

A running database is not a backup. Before production traffic is treated as
recoverable, the owner must select and configure one of these options:

1. Enable MongoDB Atlas automated/continuous backups if the selected cluster
   tier and Atlas project support them; confirm retention and point-in-time
   recovery settings in Atlas.
2. If the current cluster tier does not include managed backups, run scheduled
   encrypted `mongodump` exports to private object storage or another
   independently administered location. Do not store dumps in this repository,
   Firebase Hosting, a public bucket, or an unencrypted laptop folder.

Recommended minimum operational policy: daily backup, 30-day retention, one
monthly archive, encryption at rest, least-privilege backup credentials, and a
backup-failure alert. Confirm legal/privacy retention requirements before
choosing retention periods. Atlas backup availability varies by cluster tier;
verify it in the actual Atlas project rather than assuming it is enabled.

### Create a manual compressed backup

Install MongoDB Database Tools on a trusted operator machine. Obtain the URI
from a password manager/secret manager and place it in the current shell's
environment without pasting it into GitHub or a chat.

Windows CMD:

```bat
set "MONGODB_URI=your-private-mongodb-connection-string"
mongodump --uri="%MONGODB_URI%" --archive="radar-backup.archive.gz" --gzip
```

PowerShell:

```powershell
$env:MONGODB_URI = Read-Host "Paste the database URI from your password manager"
mongodump --uri="$env:MONGODB_URI" --archive="radar-backup.archive.gz" --gzip
```

Move the archive immediately to encrypted private storage. Restrict access and
remove the temporary local copy after confirming the stored copy's checksum and
upload. A backup file can contain private reader and newsroom information.

### Restore test (use a separate staging database only)

Never run `--drop` against the live production URI. Create a fresh isolated
staging database and restore into that URI:

```bat
mongorestore --uri="%RADAR_RESTORE_URI%" --archive="radar-backup.archive.gz" --gzip --drop
```

After restoring, verify at least:
- users and role assignments;
- published and scheduled articles;
- categories, comments, bookmarks and reader preferences;
- writer earnings and payout records;
- global news source leads and editorial decisions;
- media documents and references;
- indexes and unique constraints.

Record the backup timestamp, restore duration, operator, and any missing
collections. Perform a restore drill at least monthly and after major schema
migrations. A backup that has never been restored is not a proven recovery plan.

## 3. Credential and account response

The owner must rotate any credentials that were ever pasted into chats, issue
comments, screenshots, or other shared places. Do not copy the old values into
this runbook.

- Rotate MongoDB database user password; update Render's `MONGODB_URI`.
- Rotate JWT signing secret; deploy and invalidate existing sessions/tokens.
- Rotate Gemini, mail, VAPID, OAuth and any other exposed provider credentials.
- Review Firebase service-account and GitHub Actions secrets; revoke unused keys.
- Review administrator accounts and disable old demo/test accounts.
- Require unique passwords and MFA on GitHub, Firebase, Render and Atlas operator
  accounts. The application-level MFA work remains a separate release item.
- Verify production origins, CORS allowlist, OAuth callback/origin allowlists,
  and mail sender domains after rotation.

Do not put secrets in issue descriptions, screenshots, frontend environment
variables with private values, or client-side bundles.

## 4. Monitoring and incident response

At minimum, monitor:
- `/api/health/live` and `/api/health/ready`;
- Render deploy status and restart history;
- MongoDB connection errors, storage use, connection count and backup status;
- scheduler failures and repeated skipped/expired jobs in the admin scheduler
  desk;
- email, push, translation and global-news provider failures;
- Firebase deployment status and the deployed commit SHA.

Alert on repeated readiness failures, repeated scheduler failures, a missed
scheduled publication, a backup that did not complete, high database storage,
and unexpected admin-account changes. Never include passwords, access tokens,
full email addresses, or article drafts in alerts.

For an incident: preserve relevant logs, disable the affected integration if
necessary, rotate compromised credentials, restore only into an isolated
environment first, validate data, then coordinate production recovery. Do not
run load tests or destructive restore commands against the live site.

## 5. Release checklist

- CI passes on the exact commit being released.
- Firebase deployment succeeds and the live hosting commit is checked.
- Render deploy succeeds and `/api/health/ready` returns 200.
- MongoDB backup is recent and the latest restore drill is recorded.
- Scheduler desk shows the expected jobs and no unexplained failures.
- Mobile and desktop smoke tests pass for home, article, search, sign-in,
  admin, global news, radio and live pages.
- No new credentials, data exports, or private media have entered Git.
