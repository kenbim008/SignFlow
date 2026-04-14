import 'dotenv/config';

// Vercel serverless: project dir is read-only; SQLite and uploads must use /tmp.
if (process.env.VERCEL === '1') {
  const d = (process.env.DATABASE_URL || '').trim();
  if (!d || d.startsWith('file:./') || d.includes('/data/')) {
    process.env.DATABASE_URL = 'file:/tmp/signproz.db';
  }
}
