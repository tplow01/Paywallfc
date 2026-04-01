/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        aggregateTimeout: 300,
        // Fewer watched paths → avoids EMFILE on large workspaces / nested worktrees
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/.claude/**",
          "**/.next/**",
        ],
      };
    }
    return config;
  },
};

module.exports = nextConfig;
