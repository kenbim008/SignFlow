import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { sendOtpEmail, sendWelcomeEmail } from '../lib/mail.js';
import { signUserToken } from '../lib/authTokens.js';
import { generateAffiliateCode } from '../lib/affiliate.js';

const router = Router();
const OTP_TTL_MS = 10 * 60 * 1000;
const bypassOtp = process.env.BYPASS_OTP !== 'false' && process.env.BYPASS_OTP !== '0';

function authErrorResponse(res, e) {
  console.error(e);
  const code = e?.code;
  if (code === 'P1001' || code === 'P1017') {
    return res.status(503).json({
      error:
        'Database is not reachable. Set DATABASE_URL to PostgreSQL (e.g. Neon) in your environment.',
    });
  }
  if (code === 'P2021' || code === 'P2022') {
    return res.status(503).json({
      error: 'Database schema is missing. Run: npx prisma migrate deploy (and ensure DATABASE_URL is set).',
    });
  }
  return res.status(500).json({ error: 'Server error' });
}

function randomOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function uniqueAffiliateCode() {
  for (let i = 0; i < 8; i++) {
    const code = generateAffiliateCode();
    const exists = await prisma.user.findUnique({ where: { affiliateCode: code } });
    if (!exists) return code;
  }
  throw new Error('Could not allocate affiliate code');
}

/** POST /signproz-api/auth/signup/request */
router.post('/signup/request', async (req, res) => {
  try {
    const { email, password, referralCode } = req.body || {};
    const em = String(email || '').trim().toLowerCase();
    if (!em || !password) return res.status(400).json({ error: 'Email and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password min 6 characters' });

    const existing = await prisma.user.findUnique({ where: { email: em } });
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    await prisma.emailOtp.deleteMany({ where: { email: em, purpose: 'SIGNUP' } });

    const passwordHash = await bcrypt.hash(password, 10);
    const otp = randomOtp();
    const codeHash = await bcrypt.hash(otp, 10);
    const meta = JSON.stringify({
      passwordHash,
      referralCode: referralCode ? String(referralCode).trim() : null,
    });

    await prisma.emailOtp.create({
      data: {
        email: em,
        purpose: 'SIGNUP',
        codeHash,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        meta,
      },
    });

    if (!bypassOtp) await sendOtpEmail(em, otp, 'SIGNUP');
    else console.log('[auth] BYPASS_OTP: signup email skipped for', em);
    res.json({ ok: true, message: 'Verification code sent', bypassOtp });
  } catch (e) {
    return authErrorResponse(res, e);
  }
});

/** POST /signproz-api/auth/signup/verify */
router.post('/signup/verify', async (req, res) => {
  try {
    const { email, code } = req.body || {};
    const em = String(email || '').trim().toLowerCase();
    if (!em || (!bypassOtp && !code)) return res.status(400).json({ error: 'Email and code required' });

    const row = await prisma.emailOtp.findFirst({
      where: { email: em, purpose: 'SIGNUP' },
      orderBy: { createdAt: 'desc' },
    });
    if (!row || row.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }
    const otpOk =
      bypassOtp || (code && (await bcrypt.compare(String(code), row.codeHash)));
    if (!otpOk) return res.status(400).json({ error: 'Invalid code' });

    let meta = {};
    try {
      meta = JSON.parse(row.meta || '{}');
    } catch {
      return res.status(400).json({ error: 'Invalid session' });
    }

    let referredById = null;
    if (meta.referralCode) {
      const ref = await prisma.user.findUnique({ where: { affiliateCode: meta.referralCode } });
      if (ref && ref.email !== em) referredById = ref.id;
    }

    const affiliateCode = await uniqueAffiliateCode();

    const user = await prisma.$transaction(async (tx) => {
      await tx.emailOtp.delete({ where: { id: row.id } });
      const u = await tx.user.create({
        data: {
          email: em,
          passwordHash: meta.passwordHash,
          affiliateCode,
          referredById,
          planType: 'free',
          docsRemaining: 3,
        },
      });
      if (referredById) {
        await tx.referral.create({
          data: {
            referrerId: referredById,
            referredId: u.id,
            status: 'pending',
          },
        });
        await tx.user.update({
          where: { id: referredById },
          data: { referralCount: { increment: 1 } },
        });
      }
      return u;
    });

    await sendWelcomeEmail(user.email, user.affiliateCode);
    const token = signUserToken(user);
    res.json({
      token,
      user: publicUser(user),
    });
  } catch (e) {
    return authErrorResponse(res, e);
  }
});

/** POST /signproz-api/auth/login/request */
router.post('/login/request', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const em = String(email || '').trim().toLowerCase();
    if (!em || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await prisma.user.findUnique({ where: { email: em } });
    if (!user) return res.status(400).json({ error: 'No account for this email' });

    const passOk = await bcrypt.compare(password, user.passwordHash);
    if (!passOk) return res.status(400).json({ error: 'Invalid password' });

    await prisma.emailOtp.deleteMany({ where: { email: em, purpose: 'LOGIN' } });

    const otp = randomOtp();
    const codeHash = await bcrypt.hash(otp, 10);
    await prisma.emailOtp.create({
      data: {
        email: em,
        purpose: 'LOGIN',
        codeHash,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    if (!bypassOtp) await sendOtpEmail(em, otp, 'LOGIN');
    else console.log('[auth] BYPASS_OTP: login email skipped for', em);
    res.json({ ok: true, message: 'Verification code sent', bypassOtp });
  } catch (e) {
    return authErrorResponse(res, e);
  }
});

/** POST /signproz-api/auth/login/verify */
router.post('/login/verify', async (req, res) => {
  try {
    const { email, code } = req.body || {};
    const em = String(email || '').trim().toLowerCase();
    if (!em || (!bypassOtp && !code)) return res.status(400).json({ error: 'Email and code required' });

    const row = await prisma.emailOtp.findFirst({
      where: { email: em, purpose: 'LOGIN' },
      orderBy: { createdAt: 'desc' },
    });
    if (!row || row.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }
    const otpOk =
      bypassOtp || (code && (await bcrypt.compare(String(code), row.codeHash)));
    if (!otpOk) return res.status(400).json({ error: 'Invalid code' });

    await prisma.emailOtp.delete({ where: { id: row.id } });

    const user = await prisma.user.findUnique({ where: { email: em } });
    if (!user) return res.status(400).json({ error: 'User missing' });

    const token = signUserToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (e) {
    return authErrorResponse(res, e);
  }
});

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    planType: u.planType,
    docsRemaining: u.docsRemaining,
    monthlyDocCount: u.monthlyDocCount,
    documentsSigned: u.documentsSigned,
    affiliateCode: u.affiliateCode,
    referralCount: u.referralCount,
    paidReferrals: u.paidReferrals,
    referralEarnings: u.referralEarnings,
  };
}

export default router;
