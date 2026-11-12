# RADAR — a newsroom on the web, from Rwanda to the world

Readers read, writers write, an editor approves, and the site pays approved
writers for the views people actually earn by reading. Stories are written here,
not scraped: the only automated writing is the admin's own AI draft box, and
nothing it produces goes live until a human publishes it.

| Piece | Where it runs | Config |
| --- | --- | --- |
| React SPA (readers, writers, editors, admin portal) | Firebase Hosting — `https://ijwi-ry--ukuri.web.app` | `frontend/firebase.json`, `frontend/.env.production` |
| Express API + Socket.IO | Render web service `studentnews-backend` (free plan) | Render dashboard env; `render.yaml` mirrors it as documentation |
| MongoDB | Atlas `cluster0.zzcgd1i`, database `ijwi` | `MONGODB_URI` |

The admin portal is at `/mugishaimekevin`. Uploads live in the database, not on
disk, because Render's free plan wipes the filesystem on every deploy.

## Run it on your machine

You need Node 20 (what Render runs) and a MongoDB. Either point at Atlas or run
one locally:

```
mongod --dbpath /some/writable/dir
```

```
cd backend
cp .env.example .env          # fill MONGODB_URI and CLIENT_URL, leave the rest
npm install
npm run dev                   # http://localhost:5000

cd ../frontend
cp .env.example .env          # VITE_API_URL=http://localhost:5000/api is the default
npm install
npm run dev                   # http://localhost:5173
```

Use `http://localhost:5173`, not `127.0.0.1:5173`: the API allowlist is an
origin list and the browser sends whatever you typed.

On a **new local database**, boot prints one line per role account with a
generated password — that is how you sign in as admin, editor, writer or reader.
Those accounts are never created when `NODE_ENV=production`, and no password for
them is committed to this repository. On production, the first admin comes from
`BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`.

## Check your work

```
cd backend && npm test        # 25 API tests against an in-memory MongoDB
cd frontend && npm run build  # tsc -b && vite build; also regenerates sitemaps
```

`npm run build` regenerates the sitemaps and `ads.txt` from the **live** API, so
it needs the backend reachable; `npx tsc -b` type-checks on its own.

## The documents that matter

| File | What it is for |
| --- | --- |
| `PROJECT_AUDIT.md` | What exists today, and the honest list of what is missing |
| `IMPLEMENTATION_PLAN.md` | The same gaps turned into releases, with status per release |
| `DATA_MODEL.md` | Every collection, and the additive evolution planned on top |
| `EDITORIAL_WORKFLOW.md` | How a story moves from a writer's draft to a correction |
| `ENVIRONMENT_VARIABLES.md` | Every variable, where it belongs, what breaks without it |
| `DEPLOYMENT.md` | The live setup, the keys still missing, and how to verify a deploy |
| `DEPLOYMENT_PLAN.md` | Pre-deploy checklist, release steps, rollback |
| `OWNER_ACTIONS.md` | The list only the site owner can tick off |

Start with `OWNER_ACTIONS.md` if you want to know what is blocking the site right
now: the push keys, the analytics and AdSense ids, the contact address and a
fresh Gemini key all have to come from outside this repository.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) first — it states the rules that protect
production data and real reader identities, and what a pull request has to show
before anyone reviews it. The code is under the MIT licence in `LICENSE`; the
stories, names and photographs on the site are not, and never are committed from
a third-party publisher.
