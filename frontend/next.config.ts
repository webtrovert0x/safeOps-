import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
  serverExternalPackages: [
    "@coinbase/cdp-sdk",
    "@x402/core",
    "@x402/evm",
    "@x402/svm",
    "pino-pretty",
    "lokijs",
    "encoding",
  ],
  webpack: (config, { webpack }) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "@x402/core": false,
      "@x402/core/client": false,
      "@x402/evm": false,
      "@x402/evm/exact/client": false,
      "@x402/evm/upto/client": false,
      "@x402/svm": false,
      "@x402/svm/exact/client": false,
    };
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^@x402\//,
      })
    );
    return config;
  },
};

export default nextConfig;
