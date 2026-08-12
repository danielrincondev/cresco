import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../schema";

export type BaseDatos = NodePgDatabase<typeof schema>;
export type Transaccion = Parameters<Parameters<BaseDatos["transaction"]>[0]>[0];

let pool: Pool | undefined;
let baseDatos: BaseDatos | undefined;

export function obtenerBaseDatos(): BaseDatos {
  if (baseDatos) return baseDatos;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL es obligatoria");
  }

  pool = new Pool({ connectionString: url });
  baseDatos = drizzle(pool, { schema });
  return baseDatos;
}

export async function cerrarBaseDatos(): Promise<void> {
  await pool?.end();
  pool = undefined;
  baseDatos = undefined;
}
