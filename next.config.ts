import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
       // Add other allowed image hostnames if needed from scraping sources
       {
        protocol: 'https',
        hostname: 'www.bbc.com', // Example if BBC uses this
       },
       {
        protocol: 'https',
        hostname: 'static01.nyt.com', // Example for NYT images
       },
       {
        protocol: 'https',
        hostname: '**.reutersmedia.net', // Example for Reuters (wildcard)
       },
        {
         protocol: 'https',
         hostname: 'storage.googleapis.com', // Example if AP uses GCP
       },
        {
         protocol: 'https',
         hostname: 'www.aljazeera.com',
       },
    ],
  },
};

export default nextConfig;
