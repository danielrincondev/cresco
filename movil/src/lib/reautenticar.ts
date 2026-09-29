import type { useSession } from "@clerk/expo";
import { ConvexError } from "convex/values";

type Sesion = NonNullable<ReturnType<typeof useSession>["session"]>;

/**
 * Vuelve a verificar la contraseña en este momento y devuelve un token de
 * sesión recién emitido, que el servidor comprueba con la firma de Clerk
 * (`convex/lib/reautenticacion.ts`). Lo usan las dos acciones que no se pueden
 * dejar a una sesión abierta en un teléfono ajeno: activar una alerta de
 * emergencia y eliminar un curso.
 *
 * Los errores llegan como `ConvexError` con un mensaje para la persona, igual
 * que los del servidor, así la pantalla los muestra con `useOperacion`.
 */
export async function tokenDeReautenticacion(sesion: Sesion, clave: string, para: string): Promise<string> {
  const fallo = (mensaje: string) => new ConvexError({ codigo: "REAUTENTICACION_REQUERIDA", mensaje });
  try {
    const inicio = await sesion.startVerification({ level: "first_factor" });
    if (!inicio.supportedFirstFactors?.some((f) => f.strategy === "password")) {
      throw fallo(`Tu cuenta necesita una contraseña para ${para}.`);
    }
    const verificacion = await sesion.attemptFirstFactorVerification({ strategy: "password", password: clave });
    if (verificacion.status !== "complete") throw fallo("No se completó la verificación de tu identidad.");
  } catch (error) {
    if (error instanceof ConvexError) throw error;
    throw fallo("No pudimos verificar tu contraseña. Revísala y vuelve a intentarlo.");
  }
  const token = await sesion.getToken({ skipCache: true });
  if (!token) throw fallo("Tu sesión ya no está disponible. Vuelve a iniciar sesión.");
  return token;
}
