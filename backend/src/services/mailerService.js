const crypto = require('crypto');
const nodemailer = require('nodemailer');
const env = require('../config/env');
const NewsletterSubscriber = require('../models/NewsletterSubscriber');

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
  return {
    configured: true,
    from: env.MAIL_FROM_NAME ? `${env.MAIL_FROM_NAME} <${env.MAIL_FROM_EMAIL}>` : env.MAIL_FROM_EMAIL,
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
    });
  }
  return transport;
}

// Messages are plain text with a minimal HTML alternative: no images, no
// tracking pixels, nothing that phones home when a reader opens the mail.
async function send({ to, subject, text, html }) {
  const state = status();
  if (!state.configured) return { delivered: false, skipped: 'NOT_CONFIGURED' };
  try {
    await getTransport().sendMail({ from: state.from, to, subject, text, html });
    return { delivered: true };
  } catch (error) {
    // One redacted line: the provider's own failure text, never an address,
    // never the password.
    console.warn('newsletter email send failed:', error.message);
    return { delivered: false, error: 'SEND_FAILED' };
  }
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

function sendConfirmation(subscriber, token) {
  const confirm = `${siteBase()}/api/newsletter/confirm?token=${token}`;
  const off = `${siteBase()}/api/newsletter/unsubscribe?token=${token}`;
  const text = [
    'Confirm your email alerts for the newsroom.',
    `Open this link to confirm: ${confirm}`,
    `Changed your mind? Stop it here: ${off}`,
    'If you did not ask for this, just ignore the mail - nothing is sent until you confirm.',
  ].join('\n\n');
  const html = [
    '<p>Confirm your email alerts for the newsroom.</p>',
    `<p><a href="${confirm}">Confirm my email address</a></p>`,
    `<p><a href="${off}">Stop these alerts</a></p>`,
    '<p>If you did not ask for this, just ignore the mail - nothing is sent until you confirm.</p>',
  ].join('\n');
  return send({ to: subscriber.email, subject: 'Confirm your news alerts', text, html });
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
  // refusals is the fastest way to get the whole newsroom marked as spam.
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
      html: `${html}<hr><p><a href="${off}">Stop these alerts</a></p>`,
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
  const html = `<p>${escapeHtml(summary).replace(/\n/g, '<br>')}</p>`
    + `<p><a href="${escapeHtml(link)}">Read the story</a></p>`;
  const result = await announceByEmail(String(article.title).slice(0, 200), { text, html });
  return { ...result, link };
}

module.exports = {
  status,
  send,
  mintToken,
  hashToken,
  findByToken,
  sendConfirmation,
  announceByEmail,
  announceStory,
  siteBase,
};
