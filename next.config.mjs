/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // sql.js loads its wasm via fetch at runtime; mark it external so Next
  // doesn't try to bundle the wasm file.
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
    return config;
  },
};

export default nextConfig;
