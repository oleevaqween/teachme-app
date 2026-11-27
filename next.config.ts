import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // The old Interview CV screen was retired in favour of CV Studio; temporary so browsers do not cache it forever.
  async redirects() {
    return [{ source: '/interview/cv', destination: '/cv-studio', permanent: false }];
  },
};

export default nextConfig;
