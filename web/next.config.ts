import type { NextConfig } from 'next'

// The browser only ever talks to this site. /api/* is passed through to the C# API, so there
// is no CORS to configure and the FRED key never has a reason to be near the browser.
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:5195'

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }]
  },
}

export default nextConfig
