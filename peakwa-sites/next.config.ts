import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Self-contained server build for the VPS pipeline only; Vercel builds are unchanged.
  output: process.env.NEXT_OUTPUT_STANDALONE === '1' ? 'standalone' : undefined,
  experimental: {
    optimizePackageImports: ['lucide-react'],
    inlineCss: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.pexels.com' },
      { protocol: 'https', hostname: '**.pexels.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
  },
};

export default nextConfig;
