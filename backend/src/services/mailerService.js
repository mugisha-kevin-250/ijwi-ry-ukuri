const crypto = require('crypto');
const nodemailer = require('nodemailer');
const env = require('../config/env');
const NewsletterSubscriber = require('../models/NewsletterSubscriber');
const MailAttempt = require('../models/MailAttempt');

// A diagnostic, not an archive: a month is longer than any mail problem takes to
// be noticed, and the free cluster does not need 2019's bounces.
const KEEP_DAYS = 30;
const REASON_MAX_CHARS = 320;

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
async function record({ purpose, to, subject, delivered, outcome, reason, messageId, ms }) {
  try {
    await MailAttempt.create({
      purpose: String(purpose || 'mail').toLowerCase(),
      recipient: maskAddress(to),
      subject: String(subject || '').slice(0, 120),
      delivered: delivered === true,
      outcome,
      reason: reason || undefined,
      messageId: messageId || undefined,
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
function status() {
  if (!env.SMTP_HOST) {
    return { configured: false, reason: 'email alerts are not configured on this server (SMTP_HOST is not set)' };
  }
  if (!env.MAIL_FROM_EMAIL) {
    return { configured: false, reason: 'email alerts are not configured on this server (MAIL_FROM_EMAIL is not set)' };
  }
  // A missing login is reported, not treated as "not configured": a relay that
  // needs no credentials is a real setup, and turning one off because this file
  // expects a password would break mail that works. It is worth naming though,
  // because a half-pasted set of Render variables looks exactly like a relay
  // that has stopped answering.
  const warning = (!env.SMTP_USER || !env.SMTP_PASSWORD)
    ? 'SMTP_USER or the password (SMTP_PASSWORD / SMTP_PASS) is not set - a relay that requires a login will refuse every mail'
    : null;
  return {
    configured: true,
    host: `${env.SMTP_HOST}:${env.SMTP_PORT}${env.SMTP_SECURE ? ' (implicit TLS)' : ' (STARTTLS)'}`,
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

// Messages are plain text with a minimal HTML alternative: no images, no
// tracking pixels, nothing that phones home when a reader opens the mail.
async function send({ to, subject, text, html, purpose = 'mail' }) {
  const state = status();
  if (!state.configured) {
    await record({ purpose, to, subject, outcome: 'not-configured', reason: state.reason });
    return { delivered: false, skipped: 'NOT_CONFIGURED', reason: state.reason };
  }
  const startedAt = Date.now();
  try {
    const info = await getTransport().sendMail({ from: state.from, to, subject, text, html });
    const messageId = info && info.messageId ? String(info.messageId).slice(0, 120) : '';
    await record({
      purpose, to, subject, delivered: true, outcome: 'sent',
      messageId, ms: Date.now() - startedAt,
      // The relay accepted the message. Whether it reached the inbox is the
      // provider's business, and this is the point where we can honestly stop.
      reason: info && info.response ? providerReason({ response: info.response }) : '',
    });
    return { delivered: true, messageId };
  } catch (error) {
    // One redacted line: the provider's own failure text, never an address,
    // never the password.
    console.warn('newsletter email send failed:', error.message);
    const reason = providerReason(error) || 'the mail relay could not be reached';
    await record({
      purpose, to, subject, delivered: false, outcome: 'rejected', reason,
      ms: Date.now() - startedAt,
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

// The lookup is by hash, so the only thing an attacker's timing can measure is
// the index; timingSafeEqual on top stops an operator-bearing query against
// the hash field from being read back as a match.
async function findByToken(token) {
  const raw = String(token || '');
  if (!/^[a-f0-9]{48}$/.test(raw)) return null;
  const hash = hashToken(raw);
  const subscriber = await NewsletterSubscriber.findOne({ confirmTokenHash: hash });
  if (!subscriber) return null;
  const stored = Buffer.from(subscriber.confirmTokenHash || '', 'utf8');
  const wanted = Buffer.from(hash, 'utf8');
  if (stored.length !== wanted.length || !crypto.timingSafeEqual(stored, wanted)) return null;
  return subscriber;
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

function sendConfirmation(subscriber, token) {
  const confirm = `${siteBase()}/api/newsletter/confirm?token=${token}`;
  const off = `${siteBase()}/api/newsletter/unsubscribe?token=${token}`;
  const text = [
    'Confirm your email alerts for the newsroom.',
    `Open this link to confirm: ${confirm}`,
    `Changed your mind? Stop it here: ${off}`,
    'If you did not ask for this, just ignore the mail - nothing is sent until you confirm.',
  ].join('\n\n');
  const body = [
    '<p style="margin:0 0 16px;">One click and the newsroom can send you its alerts. Nothing arrives until you do it.</p>',
    `<p style="margin:0 0 20px;"><a href="${confirm}" style="display:inline-block;background:#1877F2;color:#ffffff;font-weight:700;padding:12px 20px;border-radius:8px;text-decoration:none;">Confirm my email address</a></p>`,
    `<p style="margin:0;color:#6b7889;font-size:14px;">Changed your mind? <a href="${off}" style="color:#41608a;">Stop these alerts</a> before you ever start them.</p>`,
  ].join('\n');
  return send({
    to: subscriber.email,
    subject: 'Confirm your news alerts',
    text,
    purpose: 'newsletter-confirm',
    html: shell({ title: 'Confirm your news alerts', preview: 'One click and your RADAR alerts are on.', body }),
  });
}

// The publish flow can call this without caring whether email works - the
// return value always says which of the two it was:
//   await announceByEmail('Headline', { text: 'A short intro', html: '<p>...</p>' })
// html is optional; the plain text body is always sent alongside it.
async function announceByEmail(subject, body) {
  const state = status();
  const total = await NewsletterSubscriber.countDocuments({ status: 'confirmed' });
  if (!state.configured) return { delivered: false, skipped: 'NOT_CONFIGURED', sent: 0, failed: 0, total };

  const text = typeof body === 'string' ? body : String((body && body.text) || '');
  const html = (body && body.html) ? String(body.html) : `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;

  let sent = 0;
  let failed = 0;
  // Sequential on purpose: a free SMTP relay throttles hard, and a burst of
  // refusals is the fastest way to get the whole newsroom marked as spam. Each
  // mail also writes its own outcome row, which is what makes "half the list
  // never got it" a question with an answer.
  for (const subscriber of await NewsletterSubscriber.find({ status: 'confirmed' }).lean()) {
    // A fresh token per mail keeps the unsubscribe link of the newest message
    // live, which is the one a reader actually clicks.
    const { token, tokenHash } = mintToken();
    await NewsletterSubscriber.updateOne({ _id: subscriber._id }, { $set: { confirmTokenHash: tokenHash } });
    const off = `${siteBase()}/api/newsletter/unsubscribe?token=${token}`;
    const result = await send({
      to: subscriber.email,
      subject,
      text: `${text}\n\n--\nStop these alerts: ${off}`,
      purpose: 'story-alert',
      html: shell({
        title: subject,
        preview: text.slice(0, 140),
        body: `${html}<hr style="border:none;border-top:1px solid #e3e8ef;margin:22px 0 14px;">`
          + `<p style="margin:0;font-size:14px;"><a href="${off}" style="color:#41608a;">Stop these alerts</a> - one click, no questions asked.</p>`,
      }),
    });
    if (result.delivered) sent += 1;
    else failed += 1;
  }
  return { delivered: sent > 0 && failed === 0, sent, failed, total };
}

// A story, not a press release: the mail carries the headline, the summary the
// newsroom already wrote, one link, and the stop link. Nothing is tracked.
async function announceStory(article) {
  if (!article || !article.title) return { delivered: false, skipped: 'NO_STORY', sent: 0, failed: 0, total: 0 };
  const link = `${siteBase()}/article/${article.slug || article._id}`;
  const summary = String(article.summary || '').trim();
  const text = [summary, `Read it here: ${link}`].filter(Boolean).join('\n\n');
  const html = `<p style="margin:0 0 16px;">${escapeHtml(summary).replace(/\n/g, '<br>')}</p>`
    + `<p style="margin:0;"><a href="${escapeHtml(link)}" style="display:inline-block;background:#1877F2;color:#ffffff;font-weight:700;padding:12px 20px;border-radius:8px;text-decoration:none;">Read the story</a></p>`;
  const result = await announceByEmail(String(article.title).slice(0, 200), { text, html });
  return { ...result, link };
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
    // The four names an operator has to get right, each reduced to set/not set.
    keys: {
      SMTP_HOST: Boolean(env.SMTP_HOST),
      SMTP_PORT: Boolean(process.env.SMTP_PORT),
      SMTP_USER: Boolean(env.SMTP_USER),
      SMTP_PASSWORD: Boolean(env.SMTP_PASSWORD),
      MAIL_FROM_EMAIL: Boolean(env.MAIL_FROM_EMAIL),
    },
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
  return { ...result, configured: true, from: state.from, host: state.host };
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
  siteBase,
};
