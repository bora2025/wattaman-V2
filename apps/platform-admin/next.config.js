/** @type {import('next').NextConfig} */
const path = require('node:path');

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: path.resolve(__dirname, '../..') },
  async headers() {
    // The operator control plane is never embedded, never framed, and never referrer-leaks an
    // operator's location to a third party (plan §12: "security headers, and separate
    // admin/customer origins").
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
};

module.exports = nextConfig;
