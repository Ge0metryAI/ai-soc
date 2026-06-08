import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // libSQL 客户端按外部依赖处理,避免被打包导致的兼容问题
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
