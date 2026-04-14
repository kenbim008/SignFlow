import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { tierFromCount } from '../lib/affiliate.js';

const router = Router();

router.get('/me', requireAuth, async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json({
    user: {
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
      tier: tierFromCount(u.referralCount),
    },
  });
});

/** Demo upgrade — in production hook to Stripe webhooks */
router.post('/upgrade', requireAuth, async (req, res) => {
  const { plan } = req.body || {};
  const p = plan === 'enterprise' ? 'enterprise' : plan === 'unlimited' || plan === 'pro' ? 'unlimited' : null;
  if (!p) return res.status(400).json({ error: 'Invalid plan' });

  const updates =
    p === 'enterprise'
      ? { planType: 'enterprise', docsRemaining: 999999, monthlyDocCount: 0 }
      : { planType: 'unlimited', docsRemaining: 200, monthlyDocCount: 0 };

  const user = await prisma.user.update({ where: { id: req.user.id }, data: updates });

  const ref = await prisma.referral.findUnique({ where: { referredId: user.id } });
  if (ref && ref.status === 'pending') {
    const referrer = await prisma.user.findUnique({ where: { id: ref.referrerId } });
    const tier = tierFromCount(referrer?.referralCount ?? 0);
    const mockMonthly = p === 'enterprise' ? 499 : 29;
    const earnings = (mockMonthly * tier.commission) / 100;
    await prisma.$transaction([
      prisma.referral.update({
        where: { id: ref.id },
        data: { status: 'active', plan: p, earnings },
      }),
      prisma.user.update({
        where: { id: ref.referrerId },
        data: {
          paidReferrals: { increment: 1 },
          referralEarnings: { increment: earnings },
        },
      }),
    ]);
  }

  res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      planType: user.planType,
      docsRemaining: user.docsRemaining,
      monthlyDocCount: user.monthlyDocCount,
      documentsSigned: user.documentsSigned,
      affiliateCode: user.affiliateCode,
      referralCount: user.referralCount,
      paidReferrals: user.paidReferrals,
      referralEarnings: user.referralEarnings,
    },
  });
});

/** After completing signatures — enforce limits server-side */
router.post('/usage/signed-document', requireAuth, async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!u) return res.status(404).json({ error: 'Not found' });

  if (u.planType === 'enterprise') {
    const user = await prisma.user.update({
      where: { id: u.id },
      data: { documentsSigned: { increment: 1 } },
    });
    return res.json({ ok: true, user: slice(user) });
  }
  if (u.planType === 'unlimited') {
    if (u.monthlyDocCount >= 200) return res.status(403).json({ error: 'Monthly limit reached' });
    const user = await prisma.user.update({
      where: { id: u.id },
      data: {
        monthlyDocCount: { increment: 1 },
        documentsSigned: { increment: 1 },
        docsRemaining: Math.max(0, 200 - (u.monthlyDocCount + 1)),
      },
    });
    return res.json({ ok: true, user: slice(user) });
  }
  if (u.docsRemaining <= 0) return res.status(403).json({ error: 'Free tier exhausted' });
  const user = await prisma.user.update({
    where: { id: u.id },
    data: {
      docsRemaining: { decrement: 1 },
      documentsSigned: { increment: 1 },
    },
  });
  return res.json({ ok: true, user: slice(user) });
});

function slice(u) {
  return {
    id: u.id,
    email: u.email,
    role: u.role || 'USER',
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
