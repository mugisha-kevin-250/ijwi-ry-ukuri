# Deployment Guide — StudentNews (Render + Firebase Hosting + MongoDB Atlas)

Target architecture:

| Piece | Host | Config file |
| --- | --- | --- |
| Backend API (Express 4 + Mongoose 8) | **Render** web service | `render.yaml` (repo root) |
| Frontend SPA (React 19 + Vite 5 + TS) | **Firebase Hosting** | `frontend/firebase.json`, `frontend/.firebaserc` |
| Database | **MongoDB Atlas** (M0 free) | connection string via `MONGODB_URI` |

Files created for you: `render.yaml`, `frontend/firebase.json`, `frontend/.firebaserc`,
`frontend/.env.example`, and this `DEPLOYMENT.md`. **No source files were edited** —
anything that needs a code change is listed under **"Known deploy blockers"** at the
bottom for you to apply.

> Do not commit real secrets. `render.yaml` uses `generateValue: true` for the JWT
> secrets and obvious `REPLACE_WITH_...` placeholders (with `sync: false`) for the
> rest. Real values are pasted only into the Render dashboard.

---

## 0. Prerequisites
- A GitHub account + repo (Render deploys **only** from a Git VCS. `D:\story` is **not**
  a git repo yet — you must `git init`, commit, and push there first).
- A MongoDB Atlas account (free) and a Google/Firebase account.
- Node.js 20 locally (for the frontend build) and the Firebase CLI
  (`npm i -g firebase-tools`) — **you** run these; this guide never ran them for you.

---

## 1. Create the MongoDB Atlas free cluster
1. Atlas Dashboard -> **Build a new cluster** -> choose the **M0 (free)** tier.
2. Pick a cloud provider/region near your Render region (`oregon`), create.
3. **Database Security -> Users & Roles -> Add New Database User**: create a
   password-auth user (e.g. `studentnews_app`). Note the username + password.
4. **Network Access -> IP Access List**: allow your clients (see next step for the
   Render egress IP). Easiest-but-broad option: add `0.0.0.0/0` ("Access From
   Anywhere") to start, then lock it down.
5. **Connect -> Drivers -> Copy** the SRV connection string, e.g.
   `mongodb+srv://studentnews_app:<password>@cluster0.xxxxx.mongodb.net/studentnews?retryWrites=true&w=majority`.
   Replace `<password>` with the real one. Keep this — it becomes `MONGODB_URI`.

## 2. Create the Render backend service from `render.yaml`
1. Push the repo to GitHub.
2. Render -> **New -> Blueprint** -> connect the repo. Render auto-detects
   `render.yaml` at the root and creates the `studentnews-backend` web service
   (`rootDir: backend`).
3. When prompted for the `sync: false` env vars, paste the real values
   (see the table in step 3). `JWT_SECRET`/`JWT_REFRESH_SECRET` are auto-generated.
4. **Get Render's egress IP for the Atlas allow-list**: after the service is
   created, open **Service -> Information**; paid services (starter) show a
   **static outbound IP**. Add that exact IP to Atlas **Network Access**.
   (The first deploy may fail its health check because Atlas hasn't allowed Render
   yet — that's expected. Add the IP, then click **Manual Deploy -> Deploy latest
   commit** again, or temporarily use `0.0.0.0/0`.)

## 3. Backend environment variables (set in the Render dashboard)

| Key | Purpose | Notes |
| --- | --- | --- |
| `NODE_ENV` | `production` | Set in blueprint. In production `server.js` **awaits** DB connect + `seedDefaults()` before listening — good (no serving until DB is up). |
| `NODE_VERSION` | pins Node 20 buildpack | reproducibility |
| `MONGODB_URI` | Atlas SRV connection string | **See the warning box below.** |
| `JWT_SECRET` | signs access tokens | `generateValue: true` |
| `JWT_REFRESH_SECRET` | signs refresh tokens | `generateValue: true` |
| `CLIENT_URL` | the frontend origin | set to your Firebase URL (step 5). |
| `UPLOAD_DIR` | `/var/uploads` | only effective after the upload source fix (blocker #1). |

> **THE IN-MEMORY DB TRAP (most dangerous gotcha).**
> `backend/src/config/database.js` does: `const uri = env.MONGODB_URI || await startMemoryDatabase()`.
> If `MONGODB_URI` is empty/missing/unreachable-but-misparsed, the backend **silently
> starts a throwaway `MongoMemoryServer`**. The health check still returns 200 and the
> app "works", but **every article, user and upload record is lost on each restart or
> redeploy**. After deploying, open the Render **Logs** and confirm you see
> `MongoDB connected: cluster0.xxxxx.mongodb.net` — **not** `localhost`/`127.0.0.1`.
> If it shows a local host, `MONGODB_URI` did not take effect.

## 4. Verify the seeded admin account
On the first successful production boot, `server.js` runs `seedDefaults()` ->
`seedUsers()`, which creates four demo accounts. The **ADMIN** is:
- email `kevin@example.com`, username `kevin`, password `eeettt123`
  (plus EDITOR/WRITER/READER demo users with the passwords in
  `backend/src/utils/seedUsers.js`).

Actions:
1. Confirm `/api/health` returns `{"success":true,...}` (see checklist).
2. Log in as `kevin@example.com` / `eeettt123` through the app.
3. **Change that admin password immediately** (it is hardcoded in the seed).
   Consider removing/gating the demo EDITOR/WRITER/READER seeds in production —
   they are weak, public credentials (blocker #6).

## 5. Point the backend at the frontend origin
Set `CLIENT_URL` in Render to your Firebase Hosting URL, e.g.
`https://<your-project-id>.web.app` (and/or your custom domain). This is the value
`env.js` uses wherever the app references the client origin.

## 6. Build & deploy the frontend to Firebase Hosting
1. In Firebase Console, **create a project**. Copy its project id.
2. Edit `frontend/.firebaserc`: replace `REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID`
   with the real project id.
3. Set the production API URL **before building** — Vite inlines env vars at build
   time. Create `frontend/.env.production` containing:
   ```
   VITE_API_URL=https://REPLACE_WITH_YOUR_RENDER_SERVICE_URL.onrender.com/api
   ```
   (Use the API URL **without** the trailing `/api` only if your Render URL already
   ends differently; the app expects `.../api` because `apiClient.ts` uses it as the
   axios `baseURL`.) Alternatively export it in your build environment:
   `VITE_API_URL=... npm run build` (on Windows PowerShell use `$env:VITE_API_URL=...`).
4. From `frontend/`:
   ```
   npm install
   npm run build          # runs `tsc -b && vite build`, outputs dist/
   firebase login
   firebase deploy --only hosting
   ```
   `firebase.json` already serves `dist/`, adds the SPA rewrite and cache headers,
   and is scoped to `hosting` only (no functions/firestore).

### > VITE env is baked at BUILD time (the #1 gotcha)
`import.meta.env.VITE_API_URL` is **string-replaced into the bundle** during
`npm run build`. After you change the Render URL, `.env.production`, or `VITE_API_URL`,
you **must rebuild AND redeploy** — a `firebase deploy` without `npm run build` ships
the old (localhost) URL. Symptom of forgetting: the deployed site calls
`http://localhost:5000` and shows a network error.

## 7. Post-deploy smoke checklist
- [ ] `GET https://<render-url>/api/health` -> `{"success":true,"message":"StudentNews API is running"}`.
- [ ] Render **Logs** show `MongoDB connected: <atlas host>` (real Atlas, not 127.0.0.1) and `Server running on port 10000`.
- [ ] Load the Firebase home page; assets load from `/assets/*` with `immutable` caching.
- [ ] **Deep-route rewrite works**: open `https://<firebase-url>/article/<some-slug>`
      **directly** (paste into a new tab / hard refresh). It must render the article,
      not a 404. Same for `/category/<slug>`, `/user/<id>`, `/writer/dashboard`.
      (This proves the `{"source":"**","destination":"/index.html"}` rewrite.)
- [ ] **Login as admin** (`kevin@example.com`) succeeds against Atlas data.
- [ ] **Upload persistence**: in the writer editor, upload a featured image; create
      the article; then in Render click **Manual Deploy -> Deploy latest commit** and
      reload the article. The image must still be present. (Requires blocker #1 fix +
      the `/var/uploads` disk; on the free plan with no disk this WILL fail — that's
      the documented tradeoff.)
- [ ] API docs reachable if you want them: `https://<render-url>/api-docs`
      (consider hiding/guarding in prod — see notes).

---

## CORS — currently reflects ANY origin (needs tightening)
`backend/src/app.js` uses `cors({ origin: true, credentials: true })`. `origin: true`
**reflects whatever `Origin` the browser sends** and allows credentialed cross-origin
requests from *any* site. That is fine for local dev but is a security hole in
production (any malicious site can issue credentialed requests).

Fix (blocker #4 — source change): restrict to your known origins, e.g.
```js
const allowed = (process.env.CLIENT_URL || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: allowed.length ? allowed : false, credentials: true }));
```
Then set `CLIENT_URL` to your Firebase URL(s) (comma-separate multiple, e.g.
the `*.web.app` and your custom domain). With the frontend and API on **different
origins** (Firebase vs Render) CORS **must** stay enabled, but pinned to the frontend
origin(s). Note the backend does **not** serve the SPA, so there is no same-origin
fallback — the built app always calls the absolute Render URL.

---

## How uploaded images are served (cross-origin problem)
- The upload endpoint (`POST /api/upload/image`, multer) saves the file and returns a
  **relative** URL: `{ url: "/uploads/<timestamp>.<ext>" }`.
- The backend serves that folder at `app.use('/uploads', express.static('uploads'))`
  on the **Render** origin only.
- The frontend stores that relative string in `featuredImage` / `profileImage` /
  `avatar` and renders it directly: e.g. `<img src={article.featuredImage} />`
  (`ArticleDetailPage.tsx`, `WriterArticlesPage.tsx`, `WriterCard.tsx`).

**Why this breaks on split hosting:** on Firebase Hosting, `src="/uploads/123.jpg"`
resolves to `https://<firebase-url>/uploads/123.jpg`. Firebase has **no `/uploads`**
(static files don't exist) so the SPA rewrite returns **`index.html`**, and the browser
tries to render an HTML page as an image -> broken image. Firebase cannot proxy to
Render. (Blocker #2.)

Two ways to fix (choose one — both are source changes):
- **Frontend (preferred, no backend change):** build absolute URLs from the API origin.
  Derive the origin from `apiClient.baseURL` (strip the trailing `/api`) and prefix any
  `/uploads/...` path, e.g. via a small `resolveAssetUrl(url)` helper used at every
  `<img src>` for uploads/avatars. Store relative in the DB, render absolute.
- **Backend:** return an absolute URL from the upload route (prefix
  `API_PUBLIC_URL`/`req.origin`) and/or store absolute URLs. Requires another env var
  (`API_PUBLIC_URL`) pointing at the Render origin.

---

## Known deploy blockers (NOT fixed — apply these)
These are source-level issues found while wiring up the config. I did **not** edit
them per the scope rules; fix before/after deploying as noted.

1. **Uploads are written inside the source tree, so they can't persist on Render.**
   `backend/src/routes/uploadRoutes.js` computes `uploadDir = path.join(__dirname, '../../uploads')`
   = `<repo>/backend/uploads`, which lives under Render's `/opt/render/project/src`
   (wiped every deploy, and a disk **cannot** be mounted there). `backend/src/app.js`
   serves `express.static('uploads')` (relative to cwd).
   **Fix:** add `UPLOAD_DIR` to `backend/src/config/env.js` (default
   `path.join(__dirname, '../uploads')` for local dev) and use it in both
   `uploadRoutes.js` (multer `destination`) and `app.js`
   (`express.static(env.UPLOAD_DIR)`). Then `UPLOAD_DIR=/var/uploads` (already set in
   `render.yaml`) makes the persistent disk work. Without this, the disk at
   `/var/uploads` is unused and uploads vanish on redeploy.

2. **Relative `/uploads/...` image URLs break on the Firebase origin.** See the "How
   uploaded images are served" section. Add a `resolveAssetUrl()` helper in the
   frontend (or return absolute URLs from the backend) so `<img src>` for
   `featuredImage` / `profileImage` / `avatar` points at the Render origin.

3. **Logo 404 / case-sensitivity.** `frontend/src/components/layout/Header.tsx:123`
   requests `/logo.png` (lowercase), but the only logo file is `frontend/Logo.png`
   (capital L) located at the **frontend root**, not in `public/`. Vite only copies
   `public/` into `dist/`, so `/logo.png` is **never in the build output** — the header
   image 404s and silently falls back to `/favicon.svg` (its `onError`). Firebase
   Hosting is case-sensitive. **Fix:** copy the asset to `frontend/public/logo.png`
   (all lowercase) so it ships in `dist/` and matches the requested path.

4. **CORS reflects any origin with credentials** (`app.js`) — tighten to the
   `CLIENT_URL` allow-list before going public (see CORS section).

5. **`frontend/.gitignore` does not ignore `.env`.** Today `frontend/.env` only holds a
   localhost URL (no secret), so it's low risk, but add `.env` (and `.env.*` except
   `.env.example`/`.env.production` you intend to keep) to avoid accidentally
   committing future build-time values. The root `.gitignore` is off-limits to me —
   add these ignores yourself.

6. **Hardcoded weak seed credentials in production.** `seedUsers.js` creates an ADMIN
   `kevin@example.com` / `eeettt123` plus EDITOR/WRITER/READER demo accounts with
   known passwords, and `seedDefaults()` runs automatically on every production boot
   (idempotent, but still). **Fix:** change the admin password immediately after the
   first login, and gate the demo users behind `NODE_ENV !== 'production'` (or a
   `SEED_DEMO_USERS` flag).

7. **`mongodb-memory-server` is a production dependency** (`backend/package.json`) — it
   downloads a `mongod` binary during install, adding build weight/time even though
   Atlas is used. Optional cleanup: move it to `devDependencies` once the in-memory
   fallback is no longer relied upon in prod (pairs with blocker #1 / the DB warning).

8. **Swagger is public** at `/api-docs` in all environments. Consider disabling it when
   `NODE_ENV === 'production'` so the API surface isn't advertised.

### Plan/disk tradeoff reminder
`render.yaml` uses **`plan: starter`** because Render's **`free`** tier **cannot mount
persistent disks**. To stay free, set `plan: free` and delete the `disks:` block and
`UPLOAD_DIR` — but then uploaded images are deleted on every redeploy/restart.

---

## Handy references
- Backend env vars actually read: `backend/src/config/env.js` (`PORT`,
  `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CLIENT_URL`,
  `RATE_PER_1000_VIEWS`, `MINIMUM_PAYOUT`, `NODE_ENV`). Optional extras seen in
  `backend/.env.example` (`SMTP_*`) are not read by `env.js`.
- Frontend API base: `frontend/src/services/apiClient.ts`
  (`import.meta.env.VITE_API_URL || 'http://localhost:5000/api'`).
- Vite dev proxy (`/api`, `/uploads` -> :5000) is **dev-only** (`vite.config.js`);
  a static host ignores it, hence the absolute-URL requirements above.
