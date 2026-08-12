import type { NextConfig } from "next";
import { varlockNextConfigPlugin } from "@varlock/nextjs-integration/plugin";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg"],
};

export default varlockNextConfigPlugin()(nextConfig);
