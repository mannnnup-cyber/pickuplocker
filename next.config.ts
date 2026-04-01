import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  
  // Performance optimizations for Vercel
  experimental: {
    // Enable optimized package imports - reduces bundle size
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },
  
  // Cache control headers for static assets
  async headers() {
    return [
      {
        source: '/:all*(svg|jpg|png|ico|webp|woff|woff2)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Cache API responses that are safe to cache
      {
        source: '/api/boxes/availability',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=30, stale-while-revalidate=60',
          },
        ],
      },
      {
        source: '/api/status',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=10, stale-while-revalidate=30',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
