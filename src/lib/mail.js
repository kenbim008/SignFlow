import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

let transporter = null;
let resendClient = null;

function getResend() {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  if (!resendClient) resendClient = new Resend(key);
  return resendClient;
}

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
  'SignProz <onboarding@resend.dev>';

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
  const client = getResend();
  if (!client) return null;

  const from = defaultFrom();
  const toList = Array.isArray(to) ? to : [to];
  const htmlBody =
    html || (text ? `<pre style="font-family:system-ui">${escapeHtml(text)}</pre>` : undefined);

  const { data, error } = await client.emails.send({
    from,
    to: toList,
    subject,
    text: text || undefined,
    html: htmlBody,
  });

  if (error) {
    throw new Error(
      `Resend: ${error.message || error.name || 'send failed'}${error.statusCode != null ? ` (${error.statusCode})` : ''}`
    );
  }
  return { ok: true, mode: 'resend', id: data?.id };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function sendMail({ to, subject, text, html: htmlIn }) {
  const html = htmlIn || (text ? `<pre style="font-family:system-ui">${escapeHtml(text)}</pre>` : undefined);

  try {
    if (process.env.RESEND_API_KEY?.trim()) {
      return await sendViaResend({ to, subject, text, html });
    }

    const tx = getTransporter();
    if (tx) {
      await tx.sendMail({ from: defaultFrom(), to, subject, text, html });
      return { ok: true, mode: 'smtp' };
    }
  } catch (e) {
    console.error('[email] send failed (signup/login will still succeed; check RESEND/SMTP):', e?.message || e);
  }

  console.log('[email:fallback-console]', { to, subject, text: text?.slice(0, 400) });
  return { ok: true, mode: 'console' };
}

export async function sendOtpEmail(email, code, purpose) {
  const subject =
    purpose === 'SIGNUP' ? 'Verify your SignProz account' : 'Your SignProz sign-in code';
  const text = `Your verification code is: ${code}\n\nIt expires in 10 minutes.\n\nIf you did not request this, ignore this email.`;
  return sendMail({ to: email, subject, text });
}

export async function sendWelcomeEmail(email, affiliateCode) {
  const base = process.env.APP_PUBLIC_URL || 'http://localhost:3000';
  const text = `Welcome to SignProz!\n\nYour affiliate code: ${affiliateCode}\nShare: ${base}/?ref=${encodeURIComponent(affiliateCode)}\n`;
  return sendMail({ to: email, subject: 'Welcome to SignProz', text });
}

export async function sendDocumentNotificationEmail(to, subject, text) {
  return sendMail({ to, subject, text });
}
