import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // Allow cross-origin requests from network IP during development
  ...(process.env.NODE_ENV === 'development' && {
    allowedDevOrigins: [
      'http://172.168.226.128:3000',
      'http://localhost:3000',
      'ws://172.168.226.128:3000',
      'ws://localhost:3000',
    ],
  }),
};

export default nextConfig;
