# RADAR AI Auto Manage setup

The manager switch is stored in MongoDB and defaults to OFF. When enabled, the backend researches configured Google Trends regions every 15 minutes, writes source-linked articles, and publishes at most one article per pass only when the safeguards below pass. Stories that fail remain in the editorial review queue.

## Keep scheduled runs working on a sleeping Render service

The backend has its own scheduler, but a free Render web service can sleep while it has no inbound traffic. This repository therefore includes a GitHub Actions wake-up workflow at `.github/workflows/radar-auto-manage.yml`.

Set these two values:

1. In the Render backend environment, add `RADAR_AUTOMATION_TOKEN` with a randomly generated secret of at least 32 characters.
2. In GitHub repository Settings -> Secrets and variables -> Actions -> New repository secret, add:
   - `RADAR_AUTOMATION_URL`: the backend base URL, for example `https://studentnews-backend.onrender.com` (no trailing path required).
   - `RADAR_AUTOMATION_TOKEN`: the exact same secret value set in Render.

Then deploy the backend. Use Actions -> RADAR AI scheduled wake-up -> Run workflow to test it. The schedule runs every 15 minutes; GitHub may delay scheduled jobs during busy periods.

Do not put the token in frontend variables, source code, or committed environment files. Rotate it in both places if it is exposed.

## Automatic publishing safeguards

Auto Manage can publish without the manager being online, but it is deliberately conservative:

- At least two distinct HTTPS publisher domains must be present in the source feed.
- The generated article must have a meaningful headline and summary, at least five substantive paragraphs, and at least 1,200 body characters.
- Placeholder/AI-limitation copy is rejected and recent AI stories are checked for duplicate topics and source URLs.
- At most one story is published per 15-minute pass. Other eligible drafts wait for another pass; weak stories remain in `pending_review`.
- Publication uses the existing article lifecycle, so published timestamps, audit events and reader notifications are retained.
- Source links remain attributed and visibly marked `pending` for human verification. The automation does not claim a human verified them.
- A source-provided image is attached only when it has a named publisher, a source article URL and passes the site's media URL validation. No video is fabricated; video is attached only if a valid source video is available.

Every scheduler pass records counts and failures in the Scheduler Desk. Auto Manage does not approve/reject writer applications, change account roles, delete records, or edit existing content. No automated gate can guarantee factual accuracy: breaking, sensitive, legal, health, election and allegations-based reporting should remain under human editorial review.
