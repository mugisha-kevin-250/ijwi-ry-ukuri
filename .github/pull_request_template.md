<!--
Keep this honest. The reviewer reads "not tested" far more willingly than a
claim that turns out to be wrong, and this site holds real stories, real reader
data and writer payouts.
-->

## What this changes

One or two sentences on the behaviour that is different afterwards.

## Why it is needed

The problem being solved, with the issue number if there is one.

## What it deliberately does not change

URLs, fields, roles or features that look related and were left alone, and why.

## Data and schema

- [ ] No collection or index is dropped or renamed
- [ ] No existing field is removed or given a different meaning
- [ ] New fields are optional, and old records still read correctly
- [ ] Any backfill script is idempotent, and its output is pasted below

If a migration is needed, say how it is rolled back. If production data is at
risk, stop and get the owner's approval before merging.

## Permissions and privacy

- [ ] Every new or changed route states who may call it, server-side
- [ ] A reader cannot reach another reader's data through it
- [ ] No new PII is stored without saying what it is for and how it is deleted

## Verified by

How this was actually checked, against which database, and what was seen.
`npm test` in `backend/` must pass; add a case for what you changed.

```
paste the command and the real output
```

## Environment and deployment

- [ ] New variables are listed in the matching `.env.example`, with no value
- [ ] `ENVIRONMENT_VARIABLES.md` and `DEPLOYMENT.md` say what happens without them
- [ ] New third-party origins are added to the CSP in `frontend/firebase.json`
- [ ] Frontend release bumps `VERSION` in `frontend/public/sw.js`
- [ ] Nothing here deploys anything: no push to production, no AdSense or
      Search Console submission, no live traffic

## Screenshots

Only for a reader-visible change, and only of the real thing.
