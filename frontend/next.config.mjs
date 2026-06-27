/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output — Docker uchun minimal runtime (next/server + .next + node_modules subset)
  output: 'standalone',

  // Reactstrict — dev paytida double-render warning'lar
  reactStrictMode: true,

  // Telegram avatar va Google avatar uchun whitelist
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 't.me' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
    ],
  },

  // Prod build paytida ESLint errorlari ham fail qilsin
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
