const crypto = require('crypto');
const nodemailer = require('nodemailer');
const env = require('../config/env');
const NewsletterSubscriber = require('../models/NewsletterSubscriber');
const MailAttempt = require('../models/MailAttempt');
const Category = require('../models/Category');

// A diagnostic, not an archive: a month is longer than any mail problem takes to
// be noticed, and the free cluster does not need 2019's bounces.
const KEEP_DAYS = 30;
const REASON_MAX_CHARS = 320;

// Mailjet's transactional send endpoint, and the patience allowed for it. The
// one thing this URL buys is that a mail leaves on the same 443 that already
// carries every other outbound call the server makes, instead of on an SMTP
// port that a hosting provider may quietly stall.
const MAILJET_SEND_URL = 'https://api.mailjet.com/v3.1/send';
const API_TIMEOUT_MS = 12000;

/**
 * What the relay itself said, in one line worth reading.
 *
 * Nodemailer puts the server's reply in `response` and its own classification in
 * `code`. Both matter: "535 5.7.1 Invalid credentials" and "ESMTP" together tell
 * an operator whether to fix the password or fix the sender address, and a
 * connection failure that never reached SMTP has no response at all.
 */
function providerReason(error) {
  if (!error) return '';
  const code = error.response || error.message || error.code || '';
  // An unwrappable multi-line protocol dump would only waste the screen, and a
  // stray password has no business being in anything we store.
  return String(code)
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, REASON_MAX_CHARS);
}

/** k••••@gmail.com — enough to group a failure by provider, never a reader's address. */
function maskAddress(address) {
  const [local = '', domain = ''] = String(address || '').split('@');
  if (!domain) return '';
  return `${local.slice(0, 1)}${'•'.repeat(Math.max(1, Math.min(6, local.length - 1)))}@${domain.toLowerCase()}`;
}

/**
 * Write one outcome down. Never throws: a database that is having a bad day must
 * not turn into "the newsroom cannot send email".
 */
async function record({ purpose, to, subject, delivered, outcome, reason, messageId, ms, via }) {
  try {
    await MailAttempt.create({
      purpose: String(purpose || 'mail').toLowerCase(),
      recipient: maskAddress(to),
      subject: String(subject || '').slice(0, 120),
      delivered: delivered === true,
      outcome,
      reason: reason || undefined,
      messageId: messageId || undefined,
      // Which door it went out of. A refusal means a different thing from the
      // send API ("your key is wrong") than it does from the relay ("I could
      // not open a socket"), and the desk should not have to guess.
      via: via ? String(via).slice(0, 24) : undefined,
      ms: Number.isFinite(ms) ? Math.round(ms) : undefined,
    });
    await MailAttempt.deleteMany({ createdAt: { $lt: new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000) } });
  } catch (error) {
    console.warn('could not store the mail outcome:', error.message);
  }
}

// Email is opt-in the way push is: with no SMTP credentials every route still
// answers, it just reports honestly that nothing will be delivered instead of
// pretending a mail was sent.
//
// The pair Mailjet's send API logs in with. Either the dedicated names carry it,
// or - when the SMTP host says mailjet - the SMTP user and password already are
// the API key and secret, which is how the provider documents the two. Nothing
// here reads a value into a log line; the keys stay in this function's return.
function mailjetKeys() {
  const hostIsMailjet = /mailjet/i.test(String(env.SMTP_HOST || ''));
  const user = env.MAILJET_API_KEY || (hostIsMailjet ? env.SMTP_USER : '');
  const secret = env.MAILJET_SECRET || (hostIsMailjet ? env.SMTP_PASSWORD : '');
  return user && secret ? { user, secret } : null;
}

function status() {
  const keys = mailjetKeys();
  if (!env.SMTP_HOST && !keys) {
    return { configured: false, reason: 'email alerts are not configured on this server (SMTP_HOST is not set)' };
  }
  if (!env.MAIL_FROM_EMAIL) {
    return { configured: false, reason: 'email alerts are not configured on this server (MAIL_FROM_EMAIL is not set)' };
  }
  // A missing login is reported, not treated as "not configured": a relay that
  // needs no credentials is a real setup, and turning one off because this file
  // expects a password would break mail that works. It is worth naming though,
  // because a half-pasted set of Render variables looks exactly like a relay
  // that has stopped answering - and it is only worth naming when the login is
  // the path being used, since the send API carries its own pair.
  const warning = (!keys && (!env.SMTP_USER || !env.SMTP_PASSWORD))
    ? 'SMTP_USER or the password (SMTP_PASSWORD / SMTP_PASS) is not set - a relay that requires a login will refuse every mail'
    : null;
  return {
    configured: true,
    // Which door the mail goes out of, in the words an operator reads on the
    // desk. An API path still names the SMTP endpoint it would fall back to,
    // because that is the one a "Connection timeout" line refers to.
    via: keys ? 'mailjet-api' : 'smtp',
    host: keys
      ? `${MAILJET_SEND_URL} (SMTP fallback at ${env.SMTP_HOST || 'not set'}:${env.SMTP_PORT})`
      : `${env.SMTP_HOST}:${env.SMTP_PORT}${env.SMTP_SECURE ? ' (implicit TLS)' : ' (STARTTLS)'}`,
    from: env.MAIL_FROM_NAME ? `${env.MAIL_FROM_NAME} <${env.MAIL_FROM_EMAIL}>` : env.MAIL_FROM_EMAIL,
    ...(warning ? { warning } : {}),
  };
}

let transport = null;
let transportKey = '';

function getTransport() {
  // Rebuilt when the host changes, so a credential swap needs no restart -
  // and so tests can stub createTransport before the first real call.
  const key = `${env.SMTP_HOST}:${env.SMTP_PORT}`;
  if (!transport || transportKey !== key) {
    transportKey = key;
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
      // A relay that stopped answering must not be allowed to hold a reader's
      // press open. Nodemailer's own defaults are two minutes for a connection
      // and three for a socket - a lifetime when somebody is standing on a
      // Subscribe button waiting to find out whether the site is alive.
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 15000,
    });
  }
  return transport;
}

/**
 * The provider's sentence, out of a v3.1 body.
 *
 * Mailjet reports a whole-call failure (`{"StatusCode":401,"ErrorMessage":"…"}`)
 * and a per-message one (`Messages[0].Errors[]`) in different places, and both
 * are worth more than the HTTP status: "invalid API key" and "sender address is
 * not verified" are different jobs for the owner, and the only way to tell them
 * apart without a mailbox is to read what came back.
 */
function apiRefusal(status, parsed, raw) {
  const message = parsed && Array.isArray(parsed.Messages) ? parsed.Messages[0] : null;
  const errors = message && Array.isArray(message.Errors)
    ? message.Errors.map((item) => item && item.ErrorMessage).filter(Boolean)
    : [];
  const parts = [
    `HTTP ${status}`,
    parsed && parsed.ErrorMessage ? String(parsed.ErrorMessage) : '',
    message && message.ErrorMessage ? String(message.ErrorMessage) : '',
    errors.join('; '),
    !parsed && raw ? String(raw).slice(0, 160) : '',
  ].filter(Boolean);
  return providerReason({ response: parts.join(' - ') });
}

/**
 * One mail through the provider's HTTPS endpoint. Never throws.
 *
 * `reachable` is the whole design: an answer with a status code is the
 * provider's considered refusal and is final, while a socket that never opened
 * is exactly the failure this path exists to step around, so it hands the mail
 * to the SMTP relay instead of reporting a second timeout.
 */
async function sendViaApi({ to, subject, text, html, keys, headers }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  // The pair is base64'd into one header and dropped; it is never logged, never
  // stored, and never part of a reason string.
  const token = Buffer.from(`${keys.user}:${keys.secret}`, 'utf8').toString('base64');
  try {
    const response = await fetch(MAILJET_SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${token}` },
      body: JSON.stringify({
        Messages: [{
          From: { Email: env.MAIL_FROM_EMAIL, ...(env.MAIL_FROM_NAME ? { Name: env.MAIL_FROM_NAME } : {}) },
          To: [{ Email: String(to) }],
          Subject: String(subject || ''),
          TextPart: String(text || ''),
          ...(html ? { HTMLPart: String(html) } : {}),
          // The unsubscribe header travels with the message rather than only
          // inside its body, which is the part a mail client's own button reads.
          ...(headers && Object.keys(headers).length ? { Headers: headers } : {}),
        }],
      }),
      signal: controller.signal,
    });
    const raw = await response.text().catch(() => '');
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { /* an error page is still readable as text */ }
    const message = parsed && Array.isArray(parsed.Messages) ? parsed.Messages[0] : null;
    const accepted = response.ok && (!message || String(message.Status || 'success').toLowerCase() === 'success');
    if (accepted) {
      return {
        reachable: true,
        ok: true,
        messageId: message && message.MessageID ? String(message.MessageID).slice(0, 120) : '',
        reason: `accepted by the send API (HTTP ${response.status})`,
      };
    }
    return { reachable: true, ok: false, messageId: '', reason: apiRefusal(response.status, parsed, raw) };
  } catch (error) {
    return {
      reachable: false,
      ok: false,
      messageId: '',
      reason: providerReason(error) || 'the send API could not be reached',
    };
  } finally {
    clearTimeout(timer);
  }
}

// Messages are plain text with a minimal HTML alternative: no images, no
// tracking pixels, nothing that phones home when a reader opens the mail.
async function send({ to, subject, text, html, purpose = 'mail', headers = null }) {
  const state = status();
  if (!state.configured) {
    await record({ purpose, to, subject, outcome: 'not-configured', reason: state.reason });
    return { delivered: false, skipped: 'NOT_CONFIGURED', reason: state.reason };
  }
  const startedAt = Date.now();

  // HTTPS first, when the account is set up for it. Whatever the API itself
  // says is final; only a connection that never opened falls through below.
  const keys = mailjetKeys();
  let apiNote = '';
  if (keys) {
    const api = await sendViaApi({ to, subject, text, html, keys, headers });
    if (api.reachable) {
      await record({
        purpose, to, subject,
        delivered: api.ok,
        outcome: api.ok ? 'sent' : 'rejected',
        messageId: api.messageId,
        reason: api.reason,
        ms: Date.now() - startedAt,
        via: 'mailjet-api',
      });
      return api.ok
        ? { delivered: true, messageId: api.messageId }
        : { delivered: false, error: 'SEND_FAILED', reason: api.reason };
    }
    apiNote = `${api.reason}; the SMTP relay was tried instead`;
  }

  try {
    const info = await getTransport().sendMail({
      from: state.from, to, subject, text, html,
      // nodemailer takes the extras as a plain object of header names, and writes
      // them into the message itself, so they survive a relay that rewrites
      // nothing but the envelope.
      ...(headers && Object.keys(headers).length ? { headers } : {}),
    });
    const messageId = info && info.messageId ? String(info.messageId).slice(0, 120) : '';
    await record({
      purpose, to, subject, delivered: true, outcome: 'sent',
      messageId, ms: Date.now() - startedAt, via: 'smtp',
      // The relay accepted the message. Whether it reached the inbox is the
      // provider's business, and this is the point where we can honestly stop.
      reason: [apiNote, info && info.response ? providerReason({ response: info.response }) : ''].filter(Boolean).join('; '),
    });
    return { delivered: true, messageId };
  } catch (error) {
    // One redacted line: the provider's own failure text, never an address,
    // never the password.
    console.warn('newsletter email send failed:', error.message);
    const reason = [apiNote, providerReason(error) || 'the mail relay could not be reached'].filter(Boolean).join('; ');
    await record({
      purpose, to, subject, delivered: false, outcome: 'rejected', reason,
      ms: Date.now() - startedAt, via: 'smtp',
    });
    // `reason` travels back to the caller as well. It is never shown to a
    // reader - it is what the admin's mail screen prints so that "email is not
    // coming" has an answer that is not a guess.
    return { delivered: false, error: 'SEND_FAILED', reason };
  }
}

/**
 * Do some mail work, but answer the caller inside the budget if the relay has
 * not had its say by then.
 *
 * A Subscribe press used to wait for the whole SMTP conversation - connect,
 * starttls, login, mail, quit - before the reader got a word back. Mailjet
 * taking twenty seconds was therefore what looked like "we could not reach the
 * newsroom": the site's own request budget ran out first, on a page that had
 * already stored the address perfectly well. Past the budget the send keeps
 * running, its result is logged, and the answer says a mail is on its way
 * rather than claiming one has landed.
 */
async function answerWithin(work, budgetMs, meta = {}) {
  const budget = Number(budgetMs || env.MAIL_ANSWER_BUDGET_MS || 3000);
  const sending = Promise.resolve().then(work);
  let timer = 0;
  // The losing promise is left unresolved on purpose: the timer below is
  // cleared, so nothing keeps the process alive waiting for it.
  const outcome = await Promise.race([
    sending,
    new Promise((resolve) => { timer = setTimeout(() => resolve(null), budget); }),
  ]);
  clearTimeout(timer);
  if (outcome) return outcome;
  // The reader has been told a mail is on its way, so the fact that the relay
  // had not answered yet is written down too. When the send finishes behind the
  // response it records its own row, and a reader who never got the mail leaves
  // both lines in the admin's log instead of leaving nothing.
  await record({
    purpose: meta.purpose || 'mail',
    to: meta.to,
    subject: meta.subject,
    outcome: 'queued',
    reason: `the relay had not answered within ${budget}ms; the send continued in the background`,
    ms: budget,
  });
  sending
    .then((result) => {
      if (!result || !result.delivered) {
        console.warn('mail did not go out after the reader was already answered:', (result && (result.skipped || result.error)) || 'no result');
      }
    })
    .catch((error) => console.warn('background mail failed:', error.message));
  return { delivered: false, queued: true };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function mintToken() {
  const token = crypto.randomBytes(24).toString('hex');
  return { token, tokenHash: hashToken(token) };
}

/**
 * The reader behind a link, found by the hash of the token in it.
 *
 * Two hashes are searched because the mail carries two links: the confirmation
 * one, which is minted again with every send, and the stop one, which stays put
 * so that the unsubscribe button a mail client shows still points at something
 * after the reader has confirmed and the first link has been superseded. A token
 * is only ever worth what it says it is worth - `findConfirmToken` will not
 * hand back a row on the strength of an unsubscribe token.
 */
async function findByToken(token, field = 'confirmTokenHash') {
  const raw = String(token || '');
  if (!/^[a-f0-9]{48}$/.test(raw)) return null;
  const hash = hashToken(raw);
  const subscriber = await NewsletterSubscriber.findOne({ [field]: hash });
  if (!subscriber) return null;
  const stored = Buffer.from(subscriber[field] || '', 'utf8');
  const wanted = Buffer.from(hash, 'utf8');
  if (stored.length !== wanted.length || !crypto.timingSafeEqual(stored, wanted)) return null;
  return subscriber;
}

/**
 * The two links every alert mail carries, made together and stored apart.
 *
 * A token only exists while the mail that printed it exists, because the row
 * keeps nothing but its hash - so both are minted at send time and the newest
 * mail is always the one with the working links. They are separate tokens
 * rather than one, so that the address in a mail client's unsubscribe button can
 * never be the credential that confirms a subscription, and a half-used
 * confirmation link can never be read as somebody asking to be left alone.
 */
async function mintLinks(subscriber) {
  const confirm = mintToken();
  const stop = mintToken();
  await NewsletterSubscriber.updateOne(
    { _id: subscriber._id },
    { $set: { confirmTokenHash: confirm.tokenHash, unsubscribeTokenHash: stop.tokenHash } },
  );
  const base = siteBase();
  return {
    confirm: `${base}/api/newsletter/confirm?token=${confirm.token}`,
    stop: `${base}/api/newsletter/unsubscribe?token=${stop.token}`,
  };
}

// Links point back at the newsletter routes themselves, so a mail works even
// when the frontend has no page for the click yet.
function siteBase() {
  const base = env.PUBLIC_URL || env.CLIENT_URL.split(',')[0].trim();
  return base.replace(/\/$/, '');
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

// An email client is not a browser. Styles have to sit on the cells themselves,
// the layout has to be a table, and everything has to read as one clean column
// on the phone screen where the code is going to be typed. No images and no
// external CSS - a mail that phones home when it opens is not something a
// newsroom sends, and a remote stylesheet is the first thing a blocked mail drops.
function shell({ title, preview, body }) {
  const brand = escapeHtml(env.MAIL_FROM_NAME || 'RADAR');
  const site = siteBase();
  const host = escapeHtml(site.replace(/^https?:\/\//, ''));
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title></head>`,
    '<body style="margin:0;padding:0;background:#eff2f6;">',
    // The line an inbox prints under the subject is built from the first words
    // of the mail. A code that only appears after the opening sentence is cut
    // off there, which is exactly what made the number invisible until the
    // reader opened the message - so it goes first, hidden inside the mail
    // itself and visible in the preview.
    `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;color:transparent;">${escapeHtml(preview)}</div>`,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eff2f6;">',
    '<tr><td align="center" style="padding:20px 10px;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">',
    // The newsroom's name is the one thing in a mail a reader can safely press:
    // it is a button, and it opens the site. A reader who got here from a
    // forward, or who no longer remembers the address, should not have to type it.
    `<tr><td style="padding:24px 28px 0;"><a href="${escapeHtml(site)}" style="display:inline-block;background:#1877F2;color:#ffffff;font-size:16px;font-weight:800;letter-spacing:3px;padding:12px 22px;border-radius:10px;text-decoration:none;">${brand}</a></td></tr>`,
    `<tr><td style="padding:16px 28px 0;font-size:19px;font-weight:700;line-height:1.35;color:#0d1b2a;">${escapeHtml(title)}</td></tr>`,
    `<tr><td style="padding:14px 28px 26px;font-size:15px;line-height:1.65;color:#2d3b4e;">${body}</td></tr>`,
    `<tr><td style="padding:16px 28px;background:#f6f8fb;font-size:12px;line-height:1.6;color:#6b7889;">`
      + `Sent by <a href="${escapeHtml(site)}" style="color:#41608a;text-decoration:none;">${host}</a>. `
      + 'A newsroom never asks for your code by phone, message or reply email.</td></tr>',
    '</table></td></tr></table></body></html>',
  ].join('\n');
}

// The number itself, in a box: large, spaced, monospaced and on a background of
// its own. A six-digit code that has to be picked out of a paragraph is the
// formatting complaint this answers.
function codeCard(code) {
  return [
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;">',
    '<tr><td align="center" style="padding:18px 10px;background:#f2f7ff;border:2px dashed #1877F2;border-radius:12px;">',
    '<div style="font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#41608a;">Your code</div>',
    `<div style="font-family:Consolas,Menlo,monospace;font-size:32px;font-weight:800;letter-spacing:8px;color:#0d1b2a;padding-top:10px;text-align:center;">${escapeHtml(code)}</div>`,
    '</td></tr></table>',
  ].join('\n');
}

/**
 * The recovery mail, built here rather than in the route: whoever asks for a
 * code should not also have to decide how it looks.
 *
 * The plain text alternative leads with the number too, because a reader on a
 * client that refuses HTML - or an inbox preview that only shows the first line
 * - still gets the code.
 */
function sendSignInCode({ to, code, subject = 'Your RADAR sign-in code', ttlMinutes = 10, maxAttempts = 5 }) {
  const digits = String(code);
  const text = [
    `Your RADAR sign-in code is ${digits}`,
    '',
    `It expires in ${ttlMinutes} minutes and stops working after ${maxAttempts} wrong tries.`,
    'Type it on the RADAR sign-in screen, then choose a new password.',
    '',
    'RADAR will never ask you for this code by phone, message or email.',
    'If you did not ask for it, ignore this mail and change your password the next time you sign in.',
  ].join('\n');
  const body = [
    '<p style="margin:0 0 14px;">Use this code to finish resetting your password.</p>',
    codeCard(digits),
    `<p style="margin:0 0 12px;"><strong>It expires in ${ttlMinutes} minutes</strong>, and it stops working after ${maxAttempts} wrong tries.</p>`,
    '<p style="margin:0 0 14px;">Type it on the RADAR sign-in screen, then choose a new password.</p>',
    '<p style="margin:0;color:#6b7889;font-size:14px;">If you did not ask for this, ignore the mail - nothing changes until a code is typed into the form.</p>',
  ].join('\n');
  return send({
    to,
    subject,
    text,
    purpose: 'signin-code',
    html: shell({ title: 'Your sign-in code', preview: `Your RADAR sign-in code is ${digits}`, body }),
  });
}

/**
 * The double opt-in mail.
 *
 * It mints its own two links rather than being handed one, because the address
 * is only half-recorded until this mail exists: the row is stored as pending,
 * and the token that turns it into a subscription is the thing in the reader's
 * inbox. The stop link is printed here too, so a subscription nobody asked for
 * can be refused before it is ever accepted.
 */
async function sendConfirmation(subscriber) {
  const { confirm, stop } = await mintLinks(subscriber);
  const text = [
    'Confirm your email alerts for the newsroom.',
    `Open this link to confirm: ${confirm}`,
    `Changed your mind? Stop it here: ${stop}`,
    'If you did not ask for this, just ignore the mail - nothing is sent until you confirm.',
  ].join('\n\n');
  const body = [
    '<p style="margin:0 0 16px;">One click and the newsroom can send you its alerts. Nothing arrives until you do it.</p>',
    `<p style="margin:0 0 20px;"><a href="${confirm}" style="display:inline-block;background:#1877F2;color:#ffffff;font-weight:700;padding:12px 20px;border-radius:8px;text-decoration:none;">Confirm my email address</a></p>`,
    `<p style="margin:0;color:#6b7889;font-size:14px;">Changed your mind? <a href="${stop}" style="color:#41608a;">Stop these alerts</a> before you ever start them.</p>`,
  ].join('\n');
  return send({
    to: subscriber.email,
    subject: 'Confirm your news alerts',
    text,
    purpose: 'newsletter-confirm',
    html: shell({ title: 'Confirm your news alerts', preview: 'One click and your RADAR alerts are on.', body }),
    headers: unsubscribeHeaders(stop),
  });
}

/**
 * The header a mail client reads instead of the reader.
 *
 * RFC 8058's one-click unsubscribe is a URL in the message and a POST the
 * client is allowed to make without asking anybody: which is the only version
 * of "stop mailing me" that works for a reader who cannot find the link at the
 * bottom of the mail. The same URL is still printed in the body, because plenty
 * of clients show the header to nobody.
 */
function unsubscribeHeaders(stopUrl) {
  return {
    'List-Unsubscribe': `<${stopUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/**
 * The words around a story, in the language the reader asked for.
 *
 * Only the wrapper is translated, and that is the honest limit: the headline and
 * the summary are the newsroom's, in the language it published them, and a mail
 * that claimed otherwise would be making a story say something its author did
 * not write. What a reader chose their language for is the sentence that tells
 * them what this mail is and how to stop it - the part that is ours.
 *
 * Anything not on this list is mailed in English, and the account screen only
 * offers these three, so a reader is never promised a language the newsroom has
 * no words for.
 */
const ALERT_WORDS = {
  en: {
    read: 'Read the story',
    stop: 'Stop these alerts',
    footer: 'one click, no questions asked.',
    because: 'You get these because you asked RADAR to tell you when the newsroom publishes.',
  },
  rw: {
    read: 'Soma inkuru',
    stop: 'Hagarika izi nkuru',
    footer: 'ijyi rimwe, nta bibazo.',
    because: 'Urabona izi nkuru kuko wasabye ko RADAR ikumenyesha iyo urubuga rwanditse inkuru nshya.',
  },
  fr: {
    read: "Lire l'article",
    stop: 'Arrêter ces alertes',
    footer: 'un clic, sans questions.',
    because: 'Vous recevez ces alertes parce que vous avez demandé à RADAR de vous prévenir des nouvelles publications.',
  },
};

function alertWords(language) {
  const key = String(language || '').toLowerCase().slice(0, 8);
  return ALERT_WORDS[key] || ALERT_WORDS.en;
}

// The preference screen asks this instead of keeping its own list, so the two
// sides cannot drift into promising a language the other has no words for.
function alertLanguages() {
  return Object.keys(ALERT_WORDS);
}

// The publish flow can call this without caring whether email works - the
// return value always says which of the two it was:
//   await announceByEmail('Headline', { text: 'A short intro', html: '<p>...</p>' })
// html is optional; the plain text body is always sent alongside it. `body` may
// also be a function of the reader's words, which is how a story alert writes
// itself into the language that address asked for.
async function announceByEmail(subject, body, options = {}) {
  const state = status();
  // The desks this story belongs to, newest filing first: the section it is
  // filed under and every desk above it. A reader who ticked "Sports" is asking
  // for the sports newsroom, which includes the football desk under it, so the
  // whole branch has to be checked rather than the leaf alone.
  const desks = (Array.isArray(options.sections) ? options.sections : [options.section])
    .map((desk) => String(desk || '').trim().toLowerCase())
    .filter((desk, index, list) => desk && list.indexOf(desk) === index);
  const section = desks[0] || '';
  // A reader who never picked a desk is not "nobody": they asked for the
  // newsroom, so an empty choice gets everything. Only somebody who did choose
  // is filtered, and only on the desks they did not choose.
  const query = desks.length
    ? { status: 'confirmed', $or: [{ 'sections.0': { $exists: false } }, { sections: { $in: desks } }] }
    : { status: 'confirmed' };
  const total = await NewsletterSubscriber.countDocuments(query);
  if (!state.configured) {
    return { delivered: false, skipped: 'NOT_CONFIGURED', sent: 0, failed: 0, total, section: section || null };
  }

  let sent = 0;
  let failed = 0;
  // Sequential on purpose: a free SMTP relay throttles hard, and a burst of
  // refusals is the fastest way to get the whole newsroom marked as spam. Each
  // mail also writes its own outcome row, which is what makes "half the list
  // never got it" a question with an answer.
  for (const subscriber of await NewsletterSubscriber.find(query).lean()) {
    const words = alertWords(subscriber.language);
    const built = typeof body === 'function' ? body(words) : (body || {});
    const text = typeof built === 'string' ? built : String((built && built.text) || '');
    const html = (built && built.html) ? String(built.html) : `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
    // Both links are minted again for this mail, so the newest message is the
    // one with the working links - which is the only message a reader still has
    // in front of them when they decide to stop.
    const links = await mintLinks(subscriber);
    const result = await send({
      to: subscriber.email,
      subject,
      text: `${text}\n\n--\n${words.stop}: ${links.stop}\n${words.because}`,
      purpose: 'story-alert',
      html: shell({
        title: subject,
        preview: text.slice(0, 140),
        body: `${html}<hr style="border:none;border-top:1px solid #e3e8ef;margin:22px 0 14px;">`
          + `<p style="margin:0 0 8px;font-size:14px;">${escapeHtml(words.because)}</p>`
          + `<p style="margin:0;font-size:14px;"><a href="${links.stop}" style="color:#41608a;">${escapeHtml(words.stop)}</a> - ${escapeHtml(words.footer)}</p>`,
      }),
      headers: unsubscribeHeaders(links.stop),
    });
    if (result.delivered) sent += 1;
    else failed += 1;
  }
  return { delivered: sent > 0 && failed === 0, sent, failed, total, section: section || null };
}

// A story, not a press release: the mail carries the headline, the summary the
// newsroom already wrote, one link, and the stop link. Nothing is tracked.
async function announceStory(article) {
  if (!article || !article.title) return { delivered: false, skipped: 'NO_STORY', sent: 0, failed: 0, total: 0 };
  const link = `${siteBase()}/article/${article.slug || article._id}`;
  const summary = String(article.summary || '').trim();
  const desks = await deskSlugsOf(article);
  const result = await announceByEmail(
    String(article.title).slice(0, 200),
    // Built per reader, so the button and the stop line are in the language
    // that address asked for while the story text stays exactly as written.
    (words) => ({
      text: [summary, `${words.read}: ${link}`].filter(Boolean).join('\n\n'),
      html: `<p style="margin:0 0 16px;">${escapeHtml(summary).replace(/\n/g, '<br>')}</p>`
        + `<p style="margin:0;"><a href="${escapeHtml(link)}" style="display:inline-block;background:#1877F2;color:#ffffff;font-weight:700;padding:12px 20px;border-radius:8px;text-decoration:none;">${escapeHtml(words.read)}</a></p>`,
    }),
    { sections: desks },
  );
  return { ...result, link, section: desks[0] || null };
}

/**
 * Which desks a story came from, in the spelling the reader's choice uses.
 *
 * The alert is filtered on the section slug rather than the category id because
 * the choice on the account screen has to survive a category being renamed, and
 * an id that a reader never saw is not something they can meaningfully tick.
 * The parent chain is walked from the database rather than trusted from the
 * story document, because a published article carries whichever fields the
 * query happened to project, and a missing `parent` would silently narrow a
 * reader's "Sports" choice to one sub-desk.
 */
async function deskSlugsOf(article) {
  const raw = article && article.category;
  const direct = raw && raw.slug ? String(raw.slug).toLowerCase() : '';
  const id = String((raw && (raw._id || raw)) || '');
  if (!/^[a-f0-9]{24}$/.test(id)) return direct ? [direct] : [];

  const slugs = [];
  let node = await Category.findById(id).select('slug parent').lean();
  // Three levels is the deepest the section tree goes; the guard is for a
  // mistyped parent that points back at its own child.
  for (let depth = 0; node && depth < 3; depth += 1) {
    if (node.slug) slugs.push(String(node.slug).toLowerCase());
    if (!node.parent) break;
    node = await Category.findById(String(node.parent)).select('slug parent').lean();
  }
  if (direct && !slugs.includes(direct)) slugs.unshift(direct);
  return slugs.filter((slug, index) => slug && slugs.indexOf(slug) === index);
}

/**
 * Everything the admin needs to answer "the emails are not coming".
 *
 * The config is read from the live environment rather than from a document,
 * because that is the only version of the truth that exists - Render's own
 * dashboard is the place where these values are set, and a copy kept in the
 * database would be a second answer to the same question. No value is returned,
 * only whether it is present: these are secrets.
 */
async function diagnostics(limit = 20) {
  const state = status();
  const attempts = await MailAttempt.find().sort({ createdAt: -1 }).limit(Math.max(1, Number(limit) || 20)).lean();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [delivered, refused] = await Promise.all([
    MailAttempt.countDocuments({ delivered: true, createdAt: { $gte: since } }),
    MailAttempt.countDocuments({ delivered: false, createdAt: { $gte: since } }),
  ]);
  return {
    configured: state.configured,
    // The names an operator has to get right, each reduced to set/not set. The
    // two Mailjet ones only matter when the API is the path; SMTP_USER and
    // SMTP_PASSWORD are the same pair when the host says mailjet, which is why
    // the desk is told which path this server is on rather than left to infer
    // it from five dots.
    keys: {
      SMTP_HOST: Boolean(env.SMTP_HOST),
      SMTP_PORT: Boolean(process.env.SMTP_PORT),
      SMTP_USER: Boolean(env.SMTP_USER),
      SMTP_PASSWORD: Boolean(env.SMTP_PASSWORD),
      MAIL_FROM_EMAIL: Boolean(env.MAIL_FROM_EMAIL),
      MAILJET_API_KEY: Boolean(env.MAILJET_API_KEY),
      MAILJET_SECRET: Boolean(env.MAILJET_SECRET),
    },
    via: state.via || null,
    host: state.host || null,
    from: state.from || null,
    reason: state.reason || null,
    warning: state.warning || null,
    last24Hours: { delivered, refused },
    last: attempts.map((doc) => ({
      at: doc.createdAt,
      purpose: doc.purpose,
      recipient: doc.recipient,
      outcome: doc.outcome,
      delivered: doc.delivered,
      reason: doc.reason || null,
      messageId: doc.messageId || null,
      via: doc.via || null,
      ms: doc.ms ?? null,
    })),
  };
}

/**
 * One mail, sent with the server's own settings, waited for in full.
 *
 * A reader's press is answered in three seconds and cannot tell the operator
 * anything about the twenty-fifth second. This is the opposite: no budget, no
 * background race, and whatever the relay says comes straight back - which is
 * the difference between "email is not coming" and "the relay rejected
 * 550 Sender address rejected: not owned by user".
 */
async function sendTestMail({ to }) {
  const state = status();
  if (!state.configured) {
    return { delivered: false, reason: state.reason, configured: false };
  }
  const subject = 'RADAR mail test';
  const text = [
    'This is the test mail from the RADAR admin mail screen.',
    '',
    `It was sent by ${state.from} through ${state.host}.`,
    'If it arrived, the newsroom can mail its readers.',
  ].join('\n');
  const html = shell({
    title: 'Mail test',
    preview: 'If you can read this, the newsroom can send email.',
    body: `<p style="margin:0 0 14px;">This mail was sent by the admin mail test, and it waited for the relay's full answer before reporting.</p>`
      + `<p style="margin:0;color:#6b7889;font-size:14px;">Sent by ${escapeHtml(state.from)} through ${escapeHtml(state.host)}.</p>`,
  });
  const result = await send({ to, subject, text, html, purpose: 'test' });
  return { ...result, configured: true, from: state.from, host: state.host, via: state.via || 'smtp' };
}

module.exports = {
  status,
  send,
  answerWithin,
  diagnostics,
  sendTestMail,
  mintToken,
  hashToken,
  findByToken,
  sendConfirmation,
  sendSignInCode,
  announceByEmail,
  announceStory,
  alertLanguages,
  alertWords,
  siteBase,
};
