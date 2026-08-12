import { dirname, relative, resolve } from "node:path";
import { defineConfig } from "drizzle-kit";
import { fileURLToPath } from "node:url";

const raiz = dirname(fileURLToPath(import.meta.url));

const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_MIGRATION_URL o DATABASE_URL es obligatoria");
}

export default defineConfig({
  schema: relative(process.cwd(), resolve(raiz, "db/schema/index.ts")),
  out: relative(process.cwd(), resolve(raiz, "db/migrations")),
  dialect: "postgresql",
  dbCredentials: { url },
});
