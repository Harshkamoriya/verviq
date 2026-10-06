import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  outputFileTracingRoot: __dirname,
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  eslint: {
    // Warning: This allows production builds with lint issues
    ignoreDuringBuilds: true,
  },
  typescript:{
    ignoreBuildErrors:true,
  },
};

export default nextConfig;
