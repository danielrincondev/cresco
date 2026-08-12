import { eq } from "drizzle-orm";
import { estudiante, matricula } from "../schema";
import { ErrorDominio } from "./errores";
import { fechaLocalActual } from "./fechas";
import { exigirEstudianteDelDocente } from "./permisos";
import { conUsuario } from "./transaccion";

export interface DecidirEstudianteEntrada {
  decision: "APROBAR" | "RECHAZAR";
  nombres?: string;
  apellidos?: string;
  numeroLista?: number;
  motivoRechazo?: string;
}

export interface DecidirEstudianteResultado {
  estudiante_id: string;
  estado_verificacion: "APROBADO" | "RECHAZADO";
}

export async function decidirEstudiantePendiente(
  userId: string,
  estudianteId: string,
  entrada: DecidirEstudianteEntrada,
): Promise<DecidirEstudianteResultado> {
  return conUsuario(userId, async (tx) => {
    const acceso = await exigirEstudianteDelDocente(tx, userId, estudianteId);
    const [actual] = await tx
      .select({
        id: estudiante.id,
        estadoVerificacion: estudiante.estadoVerificacion,
      })
      .from(estudiante)
      .where(eq(estudiante.id, estudianteId))
      .for("update");

    if (!actual || actual.estadoVerificacion !== "PENDIENTE") {
      throw new ErrorDominio("CONFLICTO", "El estudiante ya tiene una decisión aplicada.");
    }

    const estadoVerificacion = entrada.decision === "APROBAR" ? "APROBADO" : "RECHAZADO";
    await tx
      .update(estudiante)
      .set({
        ...(entrada.nombres === undefined ? {} : { nombres: entrada.nombres }),
        ...(entrada.apellidos === undefined ? {} : { apellidos: entrada.apellidos }),
        estadoVerificacion,
        aprobadoPorDocenteId: entrada.decision === "APROBAR" ? acceso.docenteId : null,
        aprobadoEn: entrada.decision === "APROBAR" ? new Date() : null,
        motivoRechazo: entrada.decision === "RECHAZAR" ? entrada.motivoRechazo : null,
        actualizadoEn: new Date(),
      })
      .where(eq(estudiante.id, estudianteId));

    if (entrada.decision === "APROBAR") {
      if (entrada.numeroLista !== undefined) {
        await tx
          .update(matricula)
          .set({ numeroLista: entrada.numeroLista, actualizadoEn: new Date() })
          .where(eq(matricula.id, acceso.matriculaId));
      }
    } else {
      await tx
        .update(matricula)
        .set({
          estado: "RETIRADA",
          fechaSalida: fechaLocalActual(),
          actualizadoEn: new Date(),
        })
        .where(eq(matricula.id, acceso.matriculaId));
    }

    return {
      estudiante_id: estudianteId,
      estado_verificacion: estadoVerificacion,
    };
  });
}
