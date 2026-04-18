/**
 * Fail fast on Vercel when DATABASE_URL is missing or still points at localhost.
 */
const url = (process.env.DATABASE_URL || '').trim();
const isVercel = process.env.VERCEL === '1';

if (!isVercel) process.exit(0);

if (!url) {
  console.error(
    '\n[build] DATABASE_URL is required on Vercel.\n' +
      'Add it under Project → Settings → Environment Variables (Production & Preview).\n' +
      'Use a hosted PostgreSQL URL (Neon, Supabase “Connection string”, Vercel Postgres, etc.).\n'
  );
  process.exit(1);
}

if (!url.startsWith('postgres')) {
  console.error('\n[build] DATABASE_URL must be a postgresql:// or postgres:// connection string on Vercel.\n');
  process.exit(1);
}

if (url.includes('127.0.0.1') || url.includes('localhost')) {
  console.error(
    '\n[build] DATABASE_URL must not use localhost on Vercel.\n' +
      'Use your cloud provider’s connection host (e.g. *.neon.tech, *.supabase.co).\n'
  );
  process.exit(1);
}
