import { sql } from "drizzle-orm";
import { obtenerBaseDatos, type Transaccion } from "./conexion";

export async function conUsuario<T>(
  userId: string,
  operacion: (tx: Transaccion) => Promise<T>,
): Promise<T> {
  if (!userId.trim()) {
    throw new Error("El identificador de usuario no puede estar vacío");
  }

  return obtenerBaseDatos().transaction(async (tx) => {
    // set_config(..., true) is the parameter-safe equivalent of
    // SET LOCAL app.user_id = '<BetterAuth user.id>'. PostgreSQL resets it at
    // transaction end, so pooled connections cannot leak one user into another.
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return operacion(tx);
  });
}
