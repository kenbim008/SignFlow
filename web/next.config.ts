import type { NextConfig } from 'next';

/**
 * Do not set outputFileTracingRoot to the parent repo here: when this app is
 * deployed with Vercel’s Root Directory = `web/`, that breaks file tracing
 * (duplicate path segments / missing routes-manifest).
 */
const nextConfig: NextConfig = {};

export default nextConfig;
