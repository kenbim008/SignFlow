import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { prisma } from './lib/prisma.js';
import { generateAffiliateCode } from './lib/affiliate.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import affiliateRoutes from './routes/affiliate.js';
import documentRoutes from './routes/documents.js';
import adminRoutes from './routes/admin.js';
import { getMailTransport } from './lib/mail.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const dataDir = path.join(root, 'data');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

async function ensureAdminUser() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || !password) return;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return;

  let code = generateAffiliateCode();
  for (let i = 0; i < 10; i++) {
    const clash = await prisma.user.findUnique({ where: { affiliateCode: code } });
    if (!clash) break;
    code = generateAffiliateCode();
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'ADMIN',
      affiliateCode: code,
      planType: 'enterprise',
      docsRemaining: 999999,
    },
  });
  console.log('[bootstrap] Admin user created:', email);
}

async function main() {
  await prisma.$connect();
  await ensureAdminUser();

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '12mb' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/user', userRoutes);
  app.use('/api/affiliate', affiliateRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/admin', adminRoutes);

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'signflow' }));

  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      const index = path.join(publicDir, 'index.html');
      if (fs.existsSync(index)) return res.sendFile(index);
      next();
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`SignFlow live at http://localhost:${port}`);
    const mail = getMailTransport();
    if (mail === 'console') {
      console.log('[email] No RESEND_API_KEY or SMTP_HOST — OTPs and mail are logged to the console only');
    } else {
      console.log(`[email] Outbound mail: ${mail}`);
    }
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
