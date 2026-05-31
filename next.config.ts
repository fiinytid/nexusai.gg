import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@clerk/nextjs', '@clerk/shared'],
  /* config options here */
};

export default nextConfig;
