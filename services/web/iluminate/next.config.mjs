/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@iluminate/lighting-core"],
  serverExternalPackages: ["paper"],
  experimental: {
    externalDir: true
  }
};

export default nextConfig;
