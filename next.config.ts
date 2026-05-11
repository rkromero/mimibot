import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  distDir: '.next-build',
  serverExternalPackages: ['postgres'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.r2.cloudflarestorage.com',
      },
    ],
  },
}

export default nextConfig
