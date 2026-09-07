/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [],
  // Standalone tracing is enabled in the Linux production image. Keeping it
  // disabled locally avoids pnpm symlink limitations on Windows.
  output: process.env.NEXT_OUTPUT_STANDALONE === "true" ? "standalone" : undefined,
};

export default nextConfig;
