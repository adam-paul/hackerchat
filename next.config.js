/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      'images.clerk.dev',
      's3.amazonaws.com',
    ],
  },
  reactStrictMode: true,
  poweredByHeader: false,
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('ws');
    }
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });
    return config;
  },
}

module.exports = nextConfig 