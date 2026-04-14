import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { tierFromCount } from '../lib/affiliate.js';

const router = Router();

router.get('/summary', requireAuth, async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json({
    affiliateCode: u.affiliateCode,
    referralCount: u.referralCount,
    paidReferrals: u.paidReferrals,
    referralEarnings: u.referralEarnings,
    tier: tierFromCount(u.referralCount),
  });
});

router.get('/referrals', requireAuth, async (req, res) => {
  const rows = await prisma.referral.findMany({
    where: { referrerId: req.user.id },
    include: { referred: { select: { email: true, planType: true, createdAt: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({
    referrals: rows.map((r) => ({
      email: r.referred.email,
      status: r.status,
      plan: r.plan || r.referred.planType,
      date: r.createdAt.toISOString().slice(0, 10),
      earnings: r.earnings,
    })),
  });
});

export default router;
