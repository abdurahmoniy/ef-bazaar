/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output — Docker uchun minimal runtime (next/server + .next + node_modules subset)
  output: 'standalone',
  // React strict — dev paytida double-render warning'lar
  reactStrictMode: true,
  // Telegram avatar va Google avatar uchun whitelist
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 't.me' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
    ],
  },
};
export default nextConfig;
