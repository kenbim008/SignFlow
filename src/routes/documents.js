import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { sendDocumentNotificationEmail } from '../lib/mail.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.join(__dirname, '../../uploads');

const router = Router();

if (!fs.existsSync(uploadRoot)) fs.mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.get('/', requireAuth, async (req, res) => {
  const docs = await prisma.document.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      filename: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
    },
  });
  res.json({ documents: docs });
});

router.post('/workspace', requireAuth, async (req, res) => {
  const { title, fieldData, signerEmails } = req.body || {};
  const t = String(title || 'Workspace').slice(0, 200);
  const fd = typeof fieldData === 'string' ? fieldData : JSON.stringify(fieldData ?? {});
  const doc = await prisma.document.create({
    data: {
      userId: req.user.id,
      title: t,
      filename: 'workspace.json',
      fieldData: fd,
      mimeType: 'application/json',
    },
  });

  const emails = Array.isArray(signerEmails) ? signerEmails.filter(Boolean) : [];
  for (const to of emails) {
    await sendDocumentNotificationEmail(
      to,
      'SignFlow document update',
      `A document workspace "${t}" was saved. Log in to SignFlow to review.`
    );
  }

  res.json({ document: { id: doc.id, title: doc.title, createdAt: doc.createdAt } });
});

router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const title = String(req.body.title || req.file.originalname).slice(0, 200);
  const fieldData = req.body.fieldData
    ? String(req.body.fieldData)
    : JSON.stringify({ note: 'Upload metadata only' });

  const doc = await prisma.document.create({
    data: {
      userId: req.user.id,
      title,
      filename: req.file.originalname,
      storedPath: req.file.filename,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      fieldData,
    },
  });
  res.json({
    document: {
      id: doc.id,
      title: doc.title,
      filename: doc.filename,
      sizeBytes: doc.sizeBytes,
      createdAt: doc.createdAt,
    },
  });
});

router.get('/:id/download', requireAuth, async (req, res) => {
  const doc = await prisma.document.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (!doc.storedPath) {
    res.setHeader('Content-Type', 'application/json');
    return res.send(doc.fieldData);
  }
  const fp = path.join(uploadRoot, doc.storedPath);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File missing' });
  res.download(fp, doc.filename);
});

router.get('/:id/meta', requireAuth, async (req, res) => {
  const doc = await prisma.document.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!doc) return res.status(404).json({ error: 'Not found' });
  let parsed;
  try {
    parsed = JSON.parse(doc.fieldData);
  } catch {
    parsed = doc.fieldData;
  }
  res.json({ document: { ...doc, fieldData: parsed } });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const doc = await prisma.document.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!doc) return res.status(404).json({ error: 'Not found' });
  if (doc.storedPath) {
    const fp = path.join(uploadRoot, doc.storedPath);
    try {
      fs.unlinkSync(fp);
    } catch {
      /* ignore */
    }
  }
  await prisma.document.delete({ where: { id: doc.id } });
  res.json({ ok: true });
});

export default router;
