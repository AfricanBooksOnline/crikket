import "@crikket/env/web"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  typedRoutes: true,
  images: {
    // Droplet VPC DNS resolves *.digitaloceanspaces.com to a private IP.
    // Next 16's image optimizer SSRF guard then returns 400 ("url" parameter is not allowed).
    dangerouslyAllowLocalIP: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
  },
  async rewrites() {
    if (!process.env.NEXT_PUBLIC_POSTHOG_HOST) {
      return []
    }

    return [
      {
        source: "/ph/:path*",
        destination: `${process.env.NEXT_PUBLIC_POSTHOG_HOST}/:path*`,
      },
    ]
  },
}

export default nextConfig
