# Contributing

This is a live news site with real readers, real writers and money attached to
their views. Most of the rules below exist because a careless change costs one of
those three, not because they are good manners.

## Before you change anything

1. Read `PROJECT_AUDIT.md` (what is actually built) and the relevant row of
   `IMPLEMENTATION_PLAN.md` (what it is supposed to become). They disagree with
   the code more often than you would expect, and the code wins.
2. Run the site locally once before editing: `README.md` has the two commands.
3. Check `git status` and the branch. Work on a branch, open a pull request,
   never push to `main` directly.

## The rules that are not style preferences

- **No production data is destroyed.** No `dropDatabase`, no `deleteMany`, no
  dropping collections or indexes, no renaming a field an existing document
  uses. Schema changes are additive: new optional field, new collection, backfill
  with an idempotent script, keep the old read path working. If a change cannot
  be reversed, say so in the pull request and wait for the owner.
- **No fabricated content or numbers.** No sample articles, fake visitor counts,
  invented trending scores or placeholder "editor's picks" shipped to production.
  A feature that is not configured says so in the interface instead of showing a
  demo — see how the AI writer, push alerts, ads and analytics each behave with
  their key missing.
- **Nothing scraped or AI-generated is published automatically.** An external
  headline can be queued for a human; only a person makes it live.
- **No secrets in git, and no secrets in the frontend.** Backend credentials go in
  the gitignored env files or the Render dashboard. Anything named `VITE_*` is
  inlined into the published bundle, so only values that are meant to be public
  (an API base URL, a GA4 measurement id) belong there. Never print a secret
  value into a log, a test output or a document.
- **Permissions are enforced on the server.** A hidden button is not a check.
  Every new route says who may call it (`protect`, `authorize(...)`, or an
  ownership comparison), and a test proves that the role above it still works and
  the role below it is refused.
- **Validate and clean text at the boundary.** Anything that reaches the database
  goes through `backend/src/utils/textFields.js`; anything that renders in the
  browser goes through `frontend/src/utils/sanitizeHtml.ts`. Do not add a new
  write path that skips this.
- **A new third-party script needs a CSP entry.** `frontend/firebase.json` carries
  the `Content-Security-Policy` header for every hosted file. Add the origin in
  the same pull request, or the browser blocks it and the failure looks like a bug
  in the feature.
- **Preserve URLs.** Slugs, canonicals and existing routes are what Google and
  other sites already point at. Changing one needs a redirect and a reason.

## Making the change

- Backend is CommonJS Express + Mongoose; frontend is React 19 + TypeScript strict
  (`noUnusedLocals` will fail the build on an unused import, on purpose).
- Match the file you are editing. The comments in this project explain *why* a
  constraint exists; a comment that only restates the code will be removed.
- User-visible strings are the English dictionary in
  `frontend/src/context/I18nContext.tsx`, served through `t('key')`. English is the
  only source text: a reader's other ~190 languages come from the Cloud Translation
  endpoint at request time, so a new key needs English copy and nothing else.
- Bump `VERSION` in `frontend/public/sw.js` in any frontend release, otherwise
  returning readers keep the previous bundle forever.

## Proving it works

```
cd backend && npm test          # must pass, and add a case for what you changed
cd frontend && npm run build    # type check + bundle
```

Then run the feature in a browser against a **local** MongoDB. Never point a QA
session at Atlas: `MONGODB_URI=mongodb://127.0.0.1:27017/<your_qa_db>`.

A pull request states what it changes, what it does not change, how it was
verified, and any migration or environment variable it needs. Say plainly when
something was not tested — an unverified claim is worse than a gap.

## Deploying

Nothing here deploys by itself, and no pull request should try. `render.yaml` is
documentation: the Render service was created from the dashboard, so env changes
happen there. Releasing is the owner's call; the steps and the checklist are in
`DEPLOYMENT.md` and `DEPLOYMENT_PLAN.md`.
