/** @type {import('next').NextConfig} */
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:3010";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/api/web/:path*", destination: `${BACKEND_URL}/api/web/:path*` },
      { source: "/api/v1/:path*", destination: `${BACKEND_URL}/api/v1/:path*` },
      { source: "/login", destination: `${BACKEND_URL}/login` },
      { source: "/logout", destination: `${BACKEND_URL}/logout` },
      { source: "/oauth/callback", destination: `${BACKEND_URL}/oauth/callback` },
      { source: "/.well-known/:path*", destination: `${BACKEND_URL}/.well-known/:path*` },
      { source: "/docs/api", destination: `${BACKEND_URL}/docs/api` },
      { source: "/docs/api/raw", destination: `${BACKEND_URL}/docs/api/raw` },
    ];
  },
};

export default nextConfig;
