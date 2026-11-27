# RADAR unattended automation setup

RADAR's own scheduler runs every 15 minutes while the Node service is awake. Render's free web services can sleep while idle, so this repository also includes a GitHub Actions wake-up workflow at `.github/workflows/radar-autonomous.yml`.

## One-time configuration

### 1. Create a strong shared token

Generate a random token with at least 32 characters. Do not commit it to the repository or put it in frontend configuration.

### 2. Add it to Render

In the backend web service's Environment settings, add:

- `RADAR_AUTOMATION_TOKEN`: the generated token.
- Keep `ENABLE_SCHEDULER` unset or set it to `true`.
- Keep the existing MongoDB, Gemini and permitted news-feed configuration.

Save the environment changes and allow Render to redeploy.

### 3. Add GitHub Actions secrets

In the repository, open **Settings → Secrets and variables → Actions → New repository secret** and add:

- `RADAR_API_URL`: the backend base URL only, for example `https://your-service.onrender.com`. Do not append `/api` or a route.
- `RADAR_AUTOMATION_TOKEN`: exactly the same value configured on Render.

### 4. Enable RADAR Auto Manage

In the RADAR admin desk, turn on Auto Manage once. After that, the backend reads the saved setting and continues without an administrator remaining logged in.

## How it runs

- Render's in-process scheduler runs the job every 15 minutes while awake.
- GitHub Actions sends a signed server-to-server POST every 15 minutes. This wakes a sleeping Render service and invokes the same scheduler job.
- A MongoDB-backed lease prevents the two triggers or multiple backend instances from running the same pass concurrently.
- The Scheduler Desk records the trigger, result, failures and skipped overlapping runs.
- Use the workflow's **Run workflow** action to request an immediate wake-up.

## Editorial and media rules

- The AI needs Gemini configuration, active categories, fresh leads, at least two distinct publishers with extractable article text, and a complete article that passes the existing quality gate.
- High-impact political, legal, medical, violence and allegation-related stories remain held for human editorial review.
- A featured image must be a verified public HTTPS image with readable dimensions and at least 900 pixels on its shortest edge. Real UHD images are preferred and counted separately; the system never upscales a thumbnail or labels a smaller image as 4K.
- If no qualifying image can be verified, no permanently blocked article is created. The lead remains eligible for a later retry.
- A video is attached only if a publisher provides a valid video URL accepted by the existing media normalizer. Video is optional; RADAR never invents video URLs.
- Duplicate detection, source attribution, workflow transitions and publication audit events remain enabled.

## Troubleshooting

If the GitHub workflow fails, check that both secrets exist and match, that `RADAR_API_URL` points to the backend (not the Firebase frontend), and that the Render service has completed its cold start. A missing Gemini key, disabled Auto Manage setting, missing ADMIN identity, empty categories or insufficient source evidence will be reported as a skipped/held run rather than silently bypassed.
