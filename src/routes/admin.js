import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/stats', async (_req, res) => {
  const [users, documents, referrals] = await Promise.all([
    prisma.user.count(),
    prisma.document.count(),
    prisma.referral.count(),
  ]);
  res.json({ users, documents, referrals });
});

router.get('/users', async (req, res) => {
  const take = Math.min(Number(req.query.limit) || 50, 200);
  const users = await prisma.user.findMany({
    take,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      role: true,
      planType: true,
      affiliateCode: true,
      referralCount: true,
      paidReferrals: true,
      referralEarnings: true,
      createdAt: true,
    },
  });
  res.json({ users });
});

router.patch('/users/:id', async (req, res) => {
  const { role, planType } = req.body || {};
  const data = {};
  if (role === 'ADMIN' || role === 'USER') data.role = role;
  if (planType) data.planType = String(planType);
  if (!Object.keys(data).length) return res.status(400).json({ error: 'No updates' });
  const u = await prisma.user.update({ where: { id: req.params.id }, data });
  res.json({
    user: {
      id: u.id,
      email: u.email,
      role: u.role,
      planType: u.planType,
    },
  });
});

router.get('/documents', async (req, res) => {
  const take = Math.min(Number(req.query.limit) || 100, 500);
  const docs = await prisma.document.findMany({
    take,
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { email: true } } },
  });
  res.json({
    documents: docs.map((d) => ({
      id: d.id,
      title: d.title,
      filename: d.filename,
      userEmail: d.user?.email ?? '(guest)',
      sizeBytes: d.sizeBytes,
      createdAt: d.createdAt,
    })),
  });
});

export default router;
