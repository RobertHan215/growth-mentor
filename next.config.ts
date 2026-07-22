import type { NextConfig } from 'next';

// Keep in sync with NEXT_PUBLIC_BASE_PATH so asset('/logos/...') resolves under the same prefix.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, '') || undefined;

const nextConfig: NextConfig = {
  basePath,
  output: process.env.VERCEL ? undefined : 'standalone',
  transpilePackages: ['mathml2omml', 'pptxgenjs'],
  serverExternalPackages: [],
  experimental: {
    proxyClientMaxBodySize: '200mb',
  },
};

export default nextConfig;
