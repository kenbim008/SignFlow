import './env-bootstrap.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
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

if (process.env.VERCEL !== '1' && !fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

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

let initPromise;
async function ensureInit() {
  if (!initPromise) {
    initPromise = (async () => {
      await prisma.$connect();
      await ensureAdminUser();
    })();
  }
  await initPromise;
}

const app = express();

// Vercel rewrites /signproz-api/* → /api?__op=/signproz-api/... so POST hits this function.
// Restore the real path before routes run (otherwise req.url stays /api and all API routes 404).
app.use((req, _res, next) => {
  if (process.env.VERCEL !== '1') return next();
  try {
    const host = req.headers.host || 'localhost';
    const u = new URL(req.url, `http://${host}`);
    const op = u.searchParams.get('__op');
    if (op && op.startsWith('/signproz-api')) {
      u.searchParams.delete('__op');
      const q = u.searchParams.toString();
      req.url = op + (q ? `?${q}` : '');
    }
  } catch (e) {
    console.error('[vercel] url restore failed', e);
  }
  next();
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '12mb' }));

app.use(async (_req, res, next) => {
  try {
    await ensureInit();
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server failed to initialize' });
  }
});

app.use('/signproz-api/auth', authRoutes);
app.use('/signproz-api/user', userRoutes);
app.use('/signproz-api/affiliate', affiliateRoutes);
app.use('/signproz-api/documents', documentRoutes);
app.use('/signproz-api/admin', adminRoutes);

app.get('/signproz-api/health', (_req, res) => res.json({ ok: true, service: 'signproz' }));

// On Vercel, static HTML and assets are served by the CDN; only /api (this app) is invoked.
if (fs.existsSync(publicDir) && process.env.VERCEL !== '1') {
  const sendDemo = (_req, res) => {
    const demo = path.join(publicDir, 'demo.html');
    if (fs.existsSync(demo)) return res.sendFile(demo);
    res.status(404).type('text').send('demo.html missing');
  };
  app.get('/demo', sendDemo);
  app.get('/demo/', sendDemo);
  app.use(express.static(publicDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/signproz-api')) return next();
    const index = path.join(publicDir, 'index.html');
    if (fs.existsSync(index)) return res.sendFile(index);
    next();
  });
}

async function listenLocal() {
  await ensureInit();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`SignProz live at http://localhost:${port}`);
    const mail = getMailTransport();
    if (mail === 'console') {
      console.log('[email] No RESEND_API_KEY or SMTP_HOST — OTPs and mail are logged to the console only');
    } else {
      console.log(`[email] Outbound mail: ${mail}`);
    }
  });
}

const entryPath =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href;
const isMainModule = import.meta.url === entryPath;

if (isMainModule && process.env.VERCEL !== '1') {
  listenLocal().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export default app;
