/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      'images.clerk.dev',
      's3.amazonaws.com',
    ],
  },
  // Strict mode for better development experience
  reactStrictMode: true,
  // Disable x-powered-by header for security
  poweredByHeader: false,
}

module.exports = nextConfig 