# RADAR AI Auto Manage setup

The manager switch is stored in MongoDB and defaults to OFF. When enabled, the backend researches configured Google Trends regions every 15 minutes and creates source-linked AI drafts in the editorial review queue.

## Keep scheduled runs working on a sleeping Render service

The backend has its own scheduler, but a free Render web service can sleep while it has no inbound traffic. This repository therefore includes a GitHub Actions wake-up workflow at `.github/workflows/radar-auto-manage.yml`.

Set these two values:

1. In the Render backend environment, add `RADAR_AUTOMATION_TOKEN` with a randomly generated secret of at least 32 characters.
2. In GitHub repository Settings -> Secrets and variables -> Actions -> New repository secret, add:
   - `RADAR_AUTOMATION_URL`: the backend base URL, for example `https://studentnews-backend.onrender.com` (no trailing path required).
   - `RADAR_AUTOMATION_TOKEN`: the exact same secret value set in Render.

Then deploy the backend. Use Actions -> RADAR AI scheduled wake-up -> Run workflow to test it. The schedule runs every 15 minutes; GitHub may delay scheduled jobs during busy periods.

Do not put the token in frontend variables, source code, or committed environment files. Rotate it in both places if it is exposed.

## Editorial safety

Auto Manage only creates AI-generated stories in `pending_review`. Source links are marked pending verification. It does not self-publish, approve/reject writer applications, change account roles, delete records, or edit existing content. Editors must verify the cited material and publish through the existing workflow.
