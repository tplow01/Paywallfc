/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
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
