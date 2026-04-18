import type { NextConfig } from 'next';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Monorepo: parent SignFlow has its own package-lock; trace from repo root. */
const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '..'),
};

export default nextConfig;
