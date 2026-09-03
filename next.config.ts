import type { NextConfig } from 'next';

const githubPages = process.env.GITHUB_PAGES === 'true';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/MovieCompanion';

const nextConfig: NextConfig = {
  agentRules: false,
  output: githubPages ? 'export' : undefined,
  basePath: githubPages ? basePath : undefined,
  assetPrefix: githubPages ? basePath : undefined,
  trailingSlash: githubPages,
  images: githubPages ? { unoptimized: true } : undefined,
};

export default nextConfig;
