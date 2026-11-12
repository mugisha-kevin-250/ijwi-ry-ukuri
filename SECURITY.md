# Reporting a security problem

This site holds real identities — names, emails, passwords, session tokens,
reading history, device subscriptions and what each writer is owed. A problem in
that area is not a public bug report.

## How to report it privately

Open the **Security** tab of
[github.com/mugisha-kevin-250/ijwi-ry-ukuri](https://github.com/mugisha-kevin-250/ijwi-ry-ukuri)
and use **Report a vulnerability**. That reaches the repository owner as a
private advisory, and the discussion, the fix and the disclosure stay private
until the owner publishes it.

If private vulnerability reporting is not switched on for this repository yet,
the owner has to enable it once: Settings -> Advanced Security ->
"Private vulnerability reporting". Until then, use whatever private channel you
have with the owner and say only "security issue in <area>" in public.

## What to include

- Which URL or endpoint, which role was signed in, and what you could see or
  change that you should not have been able to.
- The shortest set of steps that reproduces it.
- **No working credentials, no session tokens, no reader data.** Describe the
  shape of what leaked, never the contents of somebody's record.

## What we treat as in scope

Broken or guessable authentication, a permission that is only enforced in the
interface, a way to read another person's data, stored or reflected script
injection, upload handling that lets a file run, and anything that could send a
draft or an unpublished story to a reader, a feed or a sitemap.

## Please do not

Post the details in an issue, a pull request or a comment. Do not test against
production data: reproduce locally against your own MongoDB
(`README.md` shows the setup), and never run a scanner or a load test against
the live site — the backend is a free instance and other people's news depends
on it staying up.

## Timing

We aim to acknowledge a report within a few days, and we will tell you when a fix
is deployed. Credit is yours to ask for and ours to give.
