import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@clerk/nextjs', '@clerk/shared'],
  /* config options here */
  
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/js/:path*',
          destination: '/404',
        },
      ],
    }
  },
};

export default nextConfig;