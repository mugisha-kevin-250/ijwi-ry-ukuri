# Deployment — IJWI R'UKURI (Render + Firebase Hosting + MongoDB Atlas)

| Piece | Host | Config |
| --- | --- | --- |
| Frontend SPA (React 19 + Vite 5 + TS) | **Firebase Hosting** — https://ijwi-ry--ukuri.web.app | `frontend/firebase.json`, `frontend/.firebaserc` |
| Backend API (Express 4 + Mongoose 8) | **Render** web service `studentnews-backend` (free plan, created manually from the dashboard) | env set in the dashboard; `render.yaml` mirrors it |
| Database | **MongoDB Atlas** cluster `cluster0.zzcgd1i`, database `ijwi` | `MONGODB_URI` |
| Source | https://github.com/mugisha-kevin-250/ijwi-ry-ukuri (branch `main`) | — |

## What is already done
- Local content migrated into Atlas (`backend/scripts/migrate-local-to-atlas.js`), and the
  dev backend runs against Atlas.
- Frontend built with `frontend/.env.production` and deployed to Firebase Hosting.
- Uploads resolve through `UPLOAD_DIR` (`config/env.js` -> `uploadRoutes.js` + `app.js`
  `express.static`), so the path is configurable per host instead of hardcoded.
- `/uploads/...` paths in API responses are rewritten to the Render origin at runtime
  (`frontend/src/services/apiClient.ts`), so images render on the Firebase origin.
- CORS is pinned to the `CLIENT_URL` allowlist; `/api-docs` is disabled in production.
- Admin portal lives at `/mugishaimekevin` (login with username + password).
- Secrets are gitignored: `.env.render` (Render values), `backend/.env`, `frontend/.env`.
  Only `.env.example` and the credential-free `.env.production` are tracked.

## Render service settings (as created from the dashboard)

The service was created as a plain **New Web Service**, not from the Blueprint, so
`render.yaml` is documentation only — the dashboard is the source of truth.

| Field | Value |
| --- | --- |
| Name | `studentnews-backend` (the URL is baked into the frontend bundle; renaming needs a frontend rebuild) |
| Root Directory | `backend` |
| Build Command | `npm install --omit=dev` (no lockfile, so not `npm ci`; not `yarn`) |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Plan | `free` |

Env vars: see the gitignored `.env.render`. Two things the free plan forces:

- `UPLOAD_DIR=/opt/render/project/src/backend/uploads`. `/var/uploads` cannot be
  created there (`EACCES: permission denied, mkdir '/var/uploads'` -> crash loop),
  because free instances have no persistent disk and `/var` is not writable.
- `NODE_VERSION=20`. Without it Render builds on its rolling default (Node 24 was
  used on the first attempt), which makes deploys non-reproducible.

To move uploads onto a real disk: upgrade to `starter`, uncomment the `disks:` block
in `render.yaml`, mount it at `/var/uploads`, and set `UPLOAD_DIR=/var/uploads`
(`SEED_UPLOADS_DIR` stays at the source path so the disk gets seeded on first boot).

**Atlas Network Access**: free instances have rotating egress IPs, so add `0.0.0.0/0`
("Access From Anywhere") in Atlas -> Network Access. Skipping this is the usual cause
of a deploy that builds but logs `MongoDB unavailable; retrying in 15 seconds` forever.

If Render renames the service (name taken), update `frontend/.env.production`, then
`npm run build` and `npx firebase-tools deploy --only hosting`.

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
- Free plan limits: instance sleeps when idle (first request pays a ~30-60s cold
  start), no persistent disk, so **images uploaded through the app are deleted on every
  redeploy**. Database rows that reference them survive, which is why `backend/uploads`
  is committed — boot re-seeds `UPLOAD_DIR` from it and never overwrites newer files.
- The QA test article `Qa Test Inkuru Y'igagerageza` is still in Atlas — delete it from
  Admin -> News if you do not want it live.
- Category artwork in `frontend/public/images/` ships in the build. `backend/uploads/`
  (user uploads) is tracked so Render's empty disk can be seeded from it: on boot
  `server.js` copies any missing file from `SEED_UPLOADS_DIR` into `UPLOAD_DIR`, never
  overwriting what production already wrote.
