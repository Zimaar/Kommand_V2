const apiOrigin =
  process.env.INTERNAL_API_URL ??
  (process.env.NODE_ENV === "development"
    ? "http://127.0.0.1:3000"
    : process.env.API_URL ?? "http://127.0.0.1:3000");

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["*.loca.lt", "localhost", "127.0.0.1"],
  transpilePackages: ["@kommand/shared"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
      {
        source: "/auth/:path*",
        destination: `${apiOrigin}/auth/:path*`,
      },
      {
        source: "/webhooks/:path*",
        destination: `${apiOrigin}/webhooks/:path*`,
      },
    ];
  },
};

export default nextConfig;
