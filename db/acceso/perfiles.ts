import { eq } from "drizzle-orm";
import { docente, perfilUsuario, representante, TIPO_DOCUMENTO } from "../schema";
import { ErrorDominio } from "./errores";
import type { Transaccion } from "./conexion";
import { conUsuario } from "./transaccion";

export type TipoDocumento = (typeof TIPO_DOCUMENTO)[number];
export type RolPerfil = "DOCENTE" | "REPRESENTANTE";

export interface DatosPerfilUsuario {
  tipoDocumento?: TipoDocumento;
  numeroDocumento: string;
  telefono?: string | null;
  rol?: RolPerfil;
}

export async function guardarPerfilUsuario(
  userId: string,
  datos: DatosPerfilUsuario,
): Promise<void> {
  await conUsuario(userId, async (tx) => {
    await tx
      .insert(perfilUsuario)
      .values({
        userId,
        tipoDocumento: datos.tipoDocumento ?? "CEDULA",
        numeroDocumento: datos.numeroDocumento,
        telefono: datos.telefono ?? null,
      })
      .onConflictDoUpdate({
        target: perfilUsuario.userId,
        set: {
          tipoDocumento: datos.tipoDocumento ?? "CEDULA",
          numeroDocumento: datos.numeroDocumento,
          telefono: datos.telefono ?? null,
          actualizadoEn: new Date(),
        },
      });
    if (datos.rol === "DOCENTE") {
      await tx
        .insert(docente)
        .values({ userId })
        .onConflictDoNothing({ target: docente.userId });
    } else if (datos.rol === "REPRESENTANTE") {
      await tx
        .insert(representante)
        .values({ userId })
        .onConflictDoNothing({ target: representante.userId });
    }
  });
}

export async function exigirDocente(
  tx: Transaccion,
  userId: string,
): Promise<typeof docente.$inferSelect> {
  const [perfil] = await tx.select().from(docente).where(eq(docente.userId, userId)).limit(1);
  if (!perfil) {
    throw new ErrorDominio("PERFIL_NO_ENCONTRADO", "El usuario no tiene perfil de docente.");
  }
  return perfil;
}

export async function exigirRepresentante(
  tx: Transaccion,
  userId: string,
): Promise<typeof representante.$inferSelect> {
  const [perfil] = await tx
    .select()
    .from(representante)
    .where(eq(representante.userId, userId))
    .limit(1);
  if (!perfil) {
    throw new ErrorDominio("PERFIL_NO_ENCONTRADO", "El usuario no tiene perfil de representante.");
  }
  return perfil;
}
