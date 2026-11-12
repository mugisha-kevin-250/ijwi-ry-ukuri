# DEPLOYMENT_PLAN

Current deployment model (from `DEPLOYMENT.md`, `render.yaml`, `frontend/firebase.json`): **Firebase Hosting** (SPA) + **Render** (Express API, manual dashboard service currently authoritative) + **MongoDB Atlas**.  
No production deployment should be executed without owner authorization.  
Status 2026-11-12: **the hosts are behind `main`.** The security, SEO, AI-writer and
publisher-page work of the last several commits is committed and tested but not deployed, so
the live site is not yet the site described here; `OWNER_ACTIONS.md` item 7 has the release
commands. Two things every release now has to remember: bump `VERSION` in
`frontend/public/sw.js`, or returning readers keep the previous bundle forever, and add any
new third-party origin to the `Content-Security-Policy` in `frontend/firebase.json` in the
same deploy, or the browser blocks it with only a console error to show for it.

## 1. Current state (as documented/configured)

- **Frontend:** Vite build to `frontend/dist`, deployed via Firebase Hosting (`ijwi-ry--ukuri`), SPA rewrites to `/index.html`, cache headers for assets/index/sw/manifest.
- **Backend:** Render web service `studentnews-backend`, root `backend`, build `npm install --omit=dev`, start `npm start`, health check `/api/health`, env managed in dashboard (`render.yaml` mirrors intent).
- **Database:** MongoDB Atlas (`MONGODB_URI`), network access must allow Render egress (noted in docs).
- **Uploads/media:** Stored in Atlas `uploads` collection with disk cache; free-plan ephemeral disk considerations documented.
- **Realtime/live:** Socket.IO on same HTTP server as API.
- **Known constraints:** free-plan cold starts/ephemeral disk, `VITE_*` baked at build time, sitemap generation depends on live API at build, manual SW `VERSION` bump discipline.

## 2. Environments & configuration

| Concern | Recommendation |
|---|---|
| Environments | Use separate dev/staging/production configs where feasible (distinct API URLs, DBs, Firebase projects/sites or channels if adopted) |
| Secrets | Store in Render dashboard env / Firebase/CI secrets; never in git; keep `.env.example` non-secret |
| Config parity | Treat dashboard as source of truth when service not blueprint-managed; keep `render.yaml`/docs in sync but credential-free |

## 3. Pre-deploy checklist (every release)

1. **Scope & safety:** confirm no destructive schema/data changes; review migrations and rollback; back up production data if DB changes.
2. **Code quality:** run available checks/tests (`backend`: `npm test` where feasible; `frontend`: `npm run build` / typecheck) and fix regressions; do not claim unrun tests passed.
3. **Config/secrets:** verify correct `NODE_ENV`, `MONGODB_URI`, JWT secrets, `CLIENT_URL` origins, upload/push/google vars, and frontend `VITE_API_URL`/other `VITE_*` for target env.
4. **Security:** review auth/permissions for changed routes, CORS allowlist, rate limits, upload validation, and (if added later) Firebase rules/App Check as applicable.
5. **Build artifacts:** regenerate required assets (e.g. sitemap/icons) as needed; bump SW `VERSION` on frontend releases; ensure `index.html`/asset hashes will update.
6. **SEO/public endpoints:** verify canonical URLs, robots/sitemaps/feeds (as implemented), metadata, and redirects on target domain.

## 4. Deploy steps

### Backend (Render)
1. Merge approved changes; confirm Render service/env point to correct branch/commit and settings.
2. Apply env var changes in dashboard if required (no secret overwrite surprises).
3. Trigger deploy; monitor build/start logs.
4. Verify: `GET /api/health` returns success; logs show successful MongoDB connection to Atlas; critical API routes respond; Socket.IO/live and push status (if enabled) healthy.

### Frontend (Firebase Hosting)
1. Update `frontend/.env.production` (or target env) as needed.
2. `cd frontend && npm run build` (runs prebuild sitemap generation per current scripts).
3. Deploy: `npx firebase-tools deploy --only hosting` (correct project via `.firebaserc`/CLI login).
4. Verify: SPA routes load (including direct loads/rewrites), `robots.txt`, sitemap files, `site.webmanifest`, `sw.js` headers/availability, and API connectivity to correct backend origin.

### Database/migrations (when applicable)
1. Run additive/idempotent migration scripts against staging copy, validate counts/relationships/URLs.
2. Schedule production window if needed; take backup; apply; verify app behavior; keep rollback script/instructions ready.

## 5. Post-deploy verification

- Smoke test: home, article list/detail, category, search, auth (reader/writer/admin as applicable), publish flow, uploads/media rendering, live/push if enabled.
- Confirm canonical domain behavior and no mixed/incorrect API origins.
- Check Search Console/indexable endpoints when relevant (manual/external).
- Monitor logs/errors, latency/cold-start impact, and SW/client update propagation.

## 6. Rollback

- **Frontend:** redeploy previous known-good `dist`/commit to Firebase Hosting; confirm SW/cache updates reach clients.
- **Backend:** redeploy previous Render deploy/commit; revert env changes if implicated.
- **Database:** prefer forward-fix; if rollback needed, restore from backup or run tested reversal scripts (only when safe and approved). Document any irreversible steps before execution.

## 7. Open deployment dependencies / owner actions

- Canonical custom domain selection, DNS, and HTTPS/canonical redirect configuration.
- Render plan/disk decisions for persistent uploads (if required) vs Atlas-backed storage.
- Correct Atlas network access and production secrets/keys (JWT, VAPID, Google, future integrations).
- Firebase project access/permissions, authorized domains, and any required rule/index changes for future Firebase features.
- Approval gate for every staging/production deploy and for any migration affecting live data.
