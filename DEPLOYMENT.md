# Deployment — IJWI R'UKURI (Render + Firebase Hosting + MongoDB Atlas)

| Piece | Host | Config |
| --- | --- | --- |
| Frontend SPA (React 19 + Vite 5 + TS) | **Firebase Hosting** — https://ijwi-ry--ukuri.web.app | `frontend/firebase.json`, `frontend/.firebaserc` |
| Backend API (Express 4 + Mongoose 8) | **Render** web service | `render.yaml` (repo root) |
| Database | **MongoDB Atlas** cluster `cluster0.zzcgd1i`, database `ijwi` | `MONGODB_URI` |
| Source | https://github.com/mugisha-kevin-250/ijwi-ry-ukuri (branch `main`) | — |

## What is already done
- Local content migrated into Atlas (`backend/scripts/migrate-local-to-atlas.js`), and the
  dev backend runs against Atlas.
- Frontend built with `frontend/.env.production` and deployed to Firebase Hosting.
- Uploads resolve through `UPLOAD_DIR` (`config/env.js` -> `uploadRoutes.js` + `app.js`
  `express.static`), so Render's `/var/uploads` disk is actually used.
- `/uploads/...` paths in API responses are rewritten to the Render origin at runtime
  (`frontend/src/services/apiClient.ts`), so images render on the Firebase origin.
- CORS is pinned to the `CLIENT_URL` allowlist; `/api-docs` is disabled in production.
- Admin portal lives at `/mugishaimekevin` (login with username + password).
- Secrets are gitignored: `.env.render` (Render values), `backend/.env`, `frontend/.env`.
  Only `.env.example` and the credential-free `.env.production` are tracked.

## Remaining step: create the Render service
1. Render -> **New +** -> **Blueprint** -> connect `mugisha-kevin-250/ijwi-ry-ukuri`.
   Render reads `render.yaml` and creates the `studentnews-backend` service.
2. Paste the env values from `.env.render` (Settings -> Environment Variables).
   `JWT_SECRET` / `JWT_REFRESH_SECRET` are `generateValue: true` in the blueprint, so
   Render fills them itself — leave those two alone.
3. **Atlas Network Access**: allow Render to reach the cluster. On the `starter` plan
   Render shows a **static outbound IP** under Service -> Information; add that IP.
   To move faster, add `0.0.0.0/0` ("Access From Anywhere") and tighten later.
   Skipping this is the most common cause of a deploy that builds but never goes healthy.
4. The service URL will be `https://studentnews-backend.onrender.com` — which is what
   `frontend/.env.production` is already built against. **If Render renames the service**
   (the name is taken, or you rename it), update `.env.production`, re-run `npm run build`
   in `frontend/`, and `npx firebase-tools deploy --only hosting`.

## Verifying a deploy
- `GET https://studentnews-backend.onrender.com/api/health` -> `{"success":true,...}`.
- Render logs must show `MongoDB connected: ac-...mongodb.net`, **not** `127.0.0.1`.
  A local host means `MONGODB_URI` did not take effect. (`database.js` throws in
  production when `MONGODB_URI` is unset, so a silent in-memory DB is no longer possible.)
- Home page, `/article/<slug>` and `/category/<slug>` opened **directly** must render, not
  404 — that proves the SPA rewrite in `firebase.json`.

## Releasing a frontend change
```
cd frontend
npm run build                              # tsc -b && vite build -> dist/
npx firebase-tools deploy --only hosting   # uses .firebaserc (ijwi-ry--ukuri)
```
Vite inlines `VITE_*` at **build** time: editing `.env.production` without rebuilding
redeploys the old API URL.

## Admin account
`bootstrapAdmin()` in `backend/src/utils/seedUsers.js` promotes/creates the ADMIN once,
guarded by the `adminBootstrapped` PlatformSetting flag, so later credential edits are not
reverted on restart.
- Login at `/mugishaimekevin/login`: username `kevin`, password `eeettt123`.
- **That password is a test credential and is committed in the seed.** Change it from
  Admin -> Settings (it also rotates the JWT), and treat `eeettt123` as public.

## Notes
- `plan: starter` is required for the persistent disk; Render's `free` tier cannot mount
  one, so uploads would disappear on every redeploy.
- The QA test article `Qa Test Inkuru Y'igagerageza` is still in Atlas — delete it from
  Admin -> News if you do not want it live.
- Category artwork in `frontend/public/images/` ships in the build. `backend/uploads/`
  (user uploads) is tracked so Render's empty disk can be seeded from it: on boot
  `server.js` copies any missing file from `SEED_UPLOADS_DIR` into `UPLOAD_DIR`, never
  overwriting what production already wrote.
