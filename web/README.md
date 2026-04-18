# SignProz — Next.js + Supabase

This app uses [`@supabase/ssr`](https://supabase.com/docs/guides/auth/server-side/nextjs) for cookie-based sessions in the Next.js App Router.

## 1. Connection strings you need

### For the Supabase JavaScript client (this app — required)

| Variable | Where to find it |
|----------|------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | **Dashboard → Project Settings → API → Project URL** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Settings → API → API Keys → Publishable key** (`sb_publishable_…`) |
| *or* `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Settings → API → Project API keys → `anon` `public`** (legacy JWT) |

Set **either** the publishable key **or** the anon key (not both required).

Copy `.env.example` to `.env.local` and paste your values:

```bash
cp .env.example .env.local
```

### For raw Postgres (optional — only if you add Prisma/Drizzle here)

| Variable | Where to find it |
|----------|------------------|
| `DATABASE_URL` | **Settings → Database → Connection string → URI** |

Use the password you set when creating the project. Prefer **Session** or **Direct** for Prisma migrations; **Transaction** pooler is common for serverless with `?pgbouncer=true` and [Prisma + Supabase docs](https://supabase.com/docs/guides/database/connecting-to-postgres#connecting-with-prisma).

Never commit real `DATABASE_URL` values.

## 2. Local dev

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## 3. Vercel

In the Vercel project (root directory **`web`**), add the same `NEXT_PUBLIC_*` variables under **Settings → Environment Variables** for Production (and Preview if needed). `.env.local` is not deployed.

## 4. Create a table (example)

The home page reads `todos`. In **SQL Editor**:

```sql
create table public.todos (
  id uuid primary key default gen_random_uuid(),
  name text not null
);
```

Enable RLS and policies as needed for your security model.
