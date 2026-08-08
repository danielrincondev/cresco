import type { Config } from "drizzle-kit";
export default {
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
} satisfies Config;
