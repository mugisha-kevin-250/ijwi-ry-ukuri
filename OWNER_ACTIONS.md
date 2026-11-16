# Owner actions

Things the code cannot do for itself: keys only you can issue, accounts only you
can open, and clicks only you can make. Each entry says what is broken until you
do it and how to confirm it worked. Ordered by what costs the site most.

## 1. Rotate every credential that was ever pasted into a chat window

**Why.** A secret that appeared in a conversation, a screenshot or a commit is
public from that moment. These four are the ones I have actually seen, and none
of them can be fixed from inside the repository.

| Credential | Where to change it | Then |
| --- | --- | --- |
| Gemini API key | https://aistudio.google.com/apikey -> delete the old key, create a new one | Paste as `GEMINI_API_KEY` in Render -> Environment. The old key stops working immediately. |
| Atlas database password | Atlas -> Security -> Database Access -> `user` -> Edit -> Rotate Password | Update `MONGODB_URI` in Render, restart the service. |
| `JWT_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | Paste into Render. **Everyone is signed out** — that is the point, it also invalidates any token forged with the old value. |
| Admin password | Sign in at `/mugishaimekevin/login` -> Admin -> Settings | The password the old seed created is committed to git history and printed in this project's earlier docs, so treat it as public. The seed runs once per database, so changing it from the dashboard sticks. Nothing creates that password any more: a new admin now comes from `BOOTSTRAP_ADMIN_USERNAME` / `_EMAIL` / `_PASSWORD`. |
| Test logins on Atlas | Admin -> Users, or Atlas -> Data Explorer -> `users` | `seedUsers.js` used to create `kevin`, `editor`, `writer` and `reader` at `@example.com` with committed passwords, and it ran on every boot — including production. Those accounts are gone from the seed, but any that were already created in Atlas stay until you change their password or switch them off. |
| VAPID pair | `cd backend && npx web-push generate-vapid-keys` | Paste all three values into Render (this also completes action 2). Leave `frontend/.env.production`'s `VITE_VAPID_PUBLIC_KEY` empty or set it to the *new* key — the build-time value wins over the one the API serves, so a stale copy silently breaks subscriptions. |
| Google OAuth client secret | Google Cloud -> Credentials -> your client -> Reset secret | Nothing to paste: this project uses the ID-token flow, which never needs the secret. If the secret was ever shared, resetting it is still the right move. |

**Check.** Render logs show `MongoDB connected`, the admin logs in once with the
new password, and `GET /api/admin/ai/status` stops reporting the writer as
unconfigured.

## 2. Turn on device notifications

**Status: blocked, and it is the only thing blocking it.** `GET
https://studentnews-backend.onrender.com/api/push/status` answers
`enabled: false`, so every "get news alerts" switch on the site shows *not
switched on yet* instead of a button.

1. Generate a pair: `cd backend && npx web-push generate-vapid-keys`.
2. In Render -> studentnews-backend -> Environment add `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (subject as `mailto:you@example.com`
   or the site origin) and restart.
3. In an installed tab, turn alerts on and publish a draft story.

**Check.** `/api/push/status` -> `enabled: true`, `/api/push/subscribers` counts
the device, and the notification arrives with the phone's screen off. No frontend
rebuild is needed: the app reads the public key from `GET /api/push/public-key`.

## 3. Give the Analytics and AdSense ids, then rebuild

Both are still empty, so the site reports nothing and serves no ads — deliberately,
because inventing audience numbers on the Advertising page would be a lie to an
advertiser.

1. Analytics: property id `G-XXXXXXXXXX` -> `VITE_GA_MEASUREMENT_ID`.
2. AdSense: `ca-pub-…` -> `VITE_ADSENSE_CLIENT`, `pub-…` -> `VITE_ADSENSE_PUB_ID`,
   plus one ad unit id per placement you want live
   (`VITE_ADSENSE_SLOT_ARTICLEINLINE`, `…_ARTICLESIDEBAR`, `…_LIST`).
3. `cd frontend && npm run build && npx firebase-tools deploy --only hosting`.

**Check.** `curl -s https://ijwi-ry--ukuri.web.app/ads.txt` returns
`google.com, pub-…, DIRECT, f08c47fec0942fa0` — today that URL 404s, because the
generator deletes the file rather than publish one naming a publisher nobody owns.
Analytics -> Realtime shows your own visit within
a minute; the article page paints an ad frame. Until step 3 the AdSense and
Analytics reviews will fail, because Google crawls the live domain, not your
laptop.

**One thing to expect on the first visit after this.** Putting either id in the build
also turns on the consent banner at the bottom of every page, and neither Google
script loads for a reader who declines — so Realtime stays empty until you press
Accept yourself, and an ad frame only appears in a browser that has accepted. That is
the behaviour Google's own EU consent policy asks for; if you would rather run a full
consent management platform, say so before applying for AdSense, because switching
later means replacing this banner.

## 4. Apply for the AdSense account — after 3, not before

Google rejects news sites that lack the pages an advertiser expects. Those pages
are now real and live-tied (/advertising, /corrections, /editorial-policy,
/about, /contact, /privacy, /cookies, /disclaimer, /terms), and `ads.txt` is
generated from the id.
Submitting an application before the id is deployed wastes the review.

## 5. Publish the newsroom contact address

`/contact` now has a working form: a reader's message is stored and appears in the
admin inbox at `/mugishaimekevin/messages`, where staff can mark it answered or
close it. `frontend/.env.production` still has no `VITE_CONTACT_EMAIL`, so the two
mailto links on the Contact, Corrections and Advertising pages and the footer mail
link stay hidden until you set it to an inbox someone actually reads. The form is
the route that works today; the address is the faster one, and it is yours to add.

## 6. Re-attach the images that are gone for good

Every image uploaded before 2026-11-07 was written to Render's ephemeral disk and
was lost when that disk was wiped. The stories survived; their pictures did not.
Uploads now go into MongoDB first, so this does not happen again, but the old
gaps have to be filled by hand from Admin -> News -> edit a story.

**Check.** On the articles list, a story showing `/placeholder-article.svg`
instead of a picture is one still missing its image.

## 7. Deploy (and why the security header is not live yet)

Nothing in the last few commits has been pushed to the hosts. A release is:

```
git push                                        # Render redeploys the backend
cd frontend
# 1. bump VERSION in public/sw.js (radar-v16 -> radar-v17) or returning readers
#    keep the previous bundle forever
npm run build                                   # regenerates sitemaps + ads.txt, then builds
npx firebase-tools deploy --only hosting
```

The new `Content-Security-Policy` in `frontend/firebase.json` reaches readers on
this deploy and on no earlier one — it is a response header, not code. If a third
party stops working after it lands, the browser console names the exact origin
that was refused; add that origin to the header rather than removing the header.

## 8. Tell Google about the news feed

The site now emits `/feed.xml` (30 latest stories) and `/sitemap-news.xml`
(stories from the last two days, the only window Google News reads), both listed
in `/robots.txt` and in the page head.

1. Search Console -> `https://ijwi-ry--ukuri.web.app/` (the verification tag is
   already in `frontend/index.html`; never delete it).
2. Sitemaps: submit `sitemap.xml` **and** `sitemap-news.xml`.
3. For Google News, register the publication at
   https://publishercenter.google.com and point it at the site. Approval needs a
   real contact address (action 5) and original reporting on the front page.

## 9. Put the Google Translate key in Render

**Status: the feature is shipped and waiting.** A reader can pick any of the ~190
languages Google Cloud Translation supports, from the globe menu in the header or
the alert on a first visit. Without the key the picker still lists them all, but
every story stays English and the site says so plainly instead of pretending.

1. Google Cloud Console -> create or reuse a project -> APIs -> enable **Cloud
   Translation API**. Restrict the key to that API only; a browser-visible key is
   not a risk here because it never reaches a browser — the backend uses it.
2. Copy the API key value into Render -> `studentnews-backend` -> Environment as
   `GOOGLE_TRANSLATE_API_KEY`, and add the same line to your local
   `.env.render`. Nothing to change in the frontend build.
3. Restart the service.

**Check.** `GET https://studentnews-backend.onrender.com/api/translate/languages`
answers `configured: true`; open a story with `?lang=fr` in the address bar and the
headline arrives in French. On the site itself, choose a language in the header and
the page reloads in it. Translating costs one Google request per *new* English text
per language — a re-read is served from the database, and editing a story is what
makes the site pay again. Roughly $20 per million characters; the site's own labels
are a few hundred per language, and a full story is a few thousand.

**What it does not do.** The English text remains the version the newsroom stands
behind: writers, editors and the database always see English, `/api/articles` with
no `?lang` is byte-for-byte what it was before (so crawlers, RSS and the sitemaps
are unaffected), and the spoken news and the radio desk still read English copy.

## 10. Let Google Image Search find the pictures

`/sitemap-images.xml` is generated on every build and is listed in `/sitemap.xml`, so
Google discovers it without being told. It carries one entry per story that has a photo
(88 of 92 today) and, when someone recorded one, the image credit as the caption. Nothing
is written for a photo nobody credited — a description invented by the build is how an
image search starts lying about what a photograph shows.

**The one thing that is yours to do.** The pictures themselves are served by the API
origin (`studentnews-backend.onrender.com/uploads/...`), not by the site's domain, and
Google only reads image entries from a host it recognises. So either:

1. Search Console -> Add property -> verify
   `https://studentnews-backend.onrender.com` as a **Domain** or **URL-prefix** property
   with the same Google account that holds the site property. That is the whole fix; the
   sitemap is already correct, and Render's free service has no place to put a
   verification file, so use the DNS/TXT or tag method that the URL-prefix option allows.
2. Or, when the custom domain arrives (action 1), put `/uploads` behind it — a
   same-origin image URL needs no verification at all, and the file keeps being written
   by the API.

**Check.** After either, Search Console -> Pages -> Image (or Sitemaps -> open
`sitemap-images.xml`) reports the file as read with zero errors. Until then the site
still works exactly as it does now: the images are indexed by Google crawling the pages
themselves, the sitemap just cannot be used yet. Nothing on the site depends on it.

## 11. Housekeeping

- Delete `JWT_REFRESH_SECRET` from the Render dashboard: there is no refresh
  endpoint and the code no longer reads it. `render.yaml` keeps its entry on
  purpose, since removing a Blueprint variable would delete it from the live
  service the next time the Blueprint is applied.
- Delete the QA test article (`Qa Test Inkuru Y'igagerageza`) from Admin -> News
  if you do not want it indexed.
- `backend/package-lock.json` exists locally but is untracked while the Render
  build command stays `npm install --omit=dev`. Committing it only pays off if
  the build command changes to `npm ci`; say the word and I will do that swap in
  one commit.
- Before any push, `git status` must not list `.env.render`, `backend/.env`,
  `frontend/.env` or `frontend/.env.local`. `frontend/.env.production` **is**
  tracked, so keep secrets out of it.

## 12. Put the weather key in Render

**Status: the page is shipped and waiting.** `https://ijwi-ry--ukuri.web.app/weather`
is live, linked as **Weather** on the nav bar, and right now it says, in those
words, that the weather desk is not connected. That is the intended behaviour
while the key is missing: the page would rather show nothing than show a
temperature nobody measured.

1. Sign in at https://www.weatherapi.com (free plan is enough: it answers three
   days ahead and a current reading, which is exactly what the page asks for).
2. Copy the account's API key into Render -> `studentnews-backend` -> Environment
   as `WEATHERAPI_KEY`, and add the same line to your local `.env.render`.
3. Restart the service. Nothing to rebuild in the frontend — the key never goes
   into the bundle, and the browser never calls WeatherAPI at all.

Optional, both already have working defaults: `WEATHER_DEFAULT_CITY` (the city
the page opens on, `Kigali` today) and `WEATHER_REFRESH_SECONDS` (how long a
stored reading is trusted, 600 today).

**Check.** `GET https://studentnews-backend.onrender.com/api/weather/status`
answers `configured: true`, then open `/weather` and the numbers appear. From
then on a city costs one upstream call per ten minutes however many readers look
at it, because the answer is stored in Atlas and served from there; the page
prints how old a reading is whenever it is not the freshest one.

**Indexing is yours.** `/weather` is reachable, is not in any sitemap and is not
referenced by the sitemaps the build writes, so whatever you decide about putting
it into Google Search is a decision you make in Search Console and nothing in the
build will undo it.
