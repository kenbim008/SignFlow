import 'dotenv/config';

/**
 * Database: PostgreSQL only (Prisma). Required for Vercel serverless — SQLite is not viable there.
 * Use Neon (free), Supabase, or Vercel Postgres. Set DATABASE_URL in .env locally and in Vercel.
 */
if (!process.env.DATABASE_URL?.trim()) {
  console.warn(
    '[env] DATABASE_URL is not set. Set it to a PostgreSQL connection string (e.g. from neon.tech).'
  );
}
