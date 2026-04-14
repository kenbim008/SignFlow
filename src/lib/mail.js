import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
  return transporter;
}

/** From header for SMTP and fallback when using Resend without RESEND_FROM */
const defaultFrom = () =>
  process.env.RESEND_FROM?.trim() ||
  process.env.SMTP_FROM?.trim() ||
  'SignFlow <onboarding@resend.dev>';

/**
 * How outbound mail is configured (for startup logs).
 * @returns {'resend' | 'smtp' | 'console'}
 */
export function getMailTransport() {
  if (process.env.RESEND_API_KEY?.trim()) return 'resend';
  if (process.env.SMTP_HOST?.trim()) return 'smtp';
  return 'console';
}

async function sendViaResend({ to, subject, text, html }) {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;

  const from = defaultFrom();
  const toList = Array.isArray(to) ? to : [to];
  const htmlBody =
    html || (text ? `<pre style="font-family:system-ui">${escapeHtml(text)}</pre>` : undefined);

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: toList,
      subject,
      text: text || undefined,
      html: htmlBody,
    }),
  });

  if (!r.ok) {
    const errBody = await r.text();
    throw new Error(`Resend API error (${r.status}): ${errBody.slice(0, 500)}`);
  }
  return { ok: true, mode: 'resend' };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function sendMail({ to, subject, text, html: htmlIn }) {
  const html = htmlIn || (text ? `<pre style="font-family:system-ui">${escapeHtml(text)}</pre>` : undefined);

  if (process.env.RESEND_API_KEY?.trim()) {
    return sendViaResend({ to, subject, text, html });
  }

  const tx = getTransporter();
  if (tx) {
    await tx.sendMail({ from: defaultFrom(), to, subject, text, html });
    return { ok: true, mode: 'smtp' };
  }

  console.log('[email:not-configured]', { to, subject, text: text?.slice(0, 200) });
  return { ok: true, mode: 'console' };
}

export async function sendOtpEmail(email, code, purpose) {
  const subject =
    purpose === 'SIGNUP' ? 'Verify your SignFlow account' : 'Your SignFlow sign-in code';
  const text = `Your verification code is: ${code}\n\nIt expires in 10 minutes.\n\nIf you did not request this, ignore this email.`;
  return sendMail({ to: email, subject, text });
}

export async function sendWelcomeEmail(email, affiliateCode) {
  const base = process.env.APP_PUBLIC_URL || 'http://localhost:3000';
  const text = `Welcome to SignFlow!\n\nYour affiliate code: ${affiliateCode}\nShare: ${base}/?ref=${encodeURIComponent(affiliateCode)}\n`;
  return sendMail({ to: email, subject: 'Welcome to SignFlow', text });
}

export async function sendDocumentNotificationEmail(to, subject, text) {
  return sendMail({ to, subject, text });
}
