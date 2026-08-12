import { eq } from "drizzle-orm";
import { periodoAcademico } from "../schema";
import { ErrorDominio } from "./errores";
import { rangosSeSolapan } from "./fechas";
import { exigirCursoDelDocente } from "./permisos";
import { conUsuario } from "./transaccion";

export interface PeriodoEntrada {
  nombre: string;
  orden: number;
  fechaInicio: string;
  fechaFin: string;
}

export interface PeriodoApi {
  id: string;
  nombre: string;
  orden: number;
  fecha_inicio: string;
  fecha_fin: string;
  estado: string;
}

export async function definirPeriodosCurso(
  userId: string,
  cursoId: string,
  periodos: PeriodoEntrada[],
): Promise<PeriodoApi[]> {
  return conUsuario(userId, async (tx) => {
    const acceso = await exigirCursoDelDocente(tx, userId, cursoId);
    const ordenes = new Set<number>();

    for (const periodo of periodos) {
      if (ordenes.has(periodo.orden)) {
        throw new ErrorDominio("VALIDACION", "El orden de cada período debe ser único.");
      }
      ordenes.add(periodo.orden);
      if (periodo.fechaFin <= periodo.fechaInicio) {
        throw new ErrorDominio("FECHAS_INVALIDAS", "La fecha final debe ser posterior a la inicial.");
      }
      if (
        periodo.fechaInicio < acceso.fechaInicioAnio ||
        periodo.fechaFin > acceso.fechaFinAnio
      ) {
        throw new ErrorDominio(
          "FECHAS_INVALIDAS",
          "Las fechas de los períodos deben estar dentro del año lectivo.",
        );
      }
    }

    for (let indice = 0; indice < periodos.length; indice += 1) {
      for (let otro = indice + 1; otro < periodos.length; otro += 1) {
        if (
          rangosSeSolapan(
            periodos[indice].fechaInicio,
            periodos[indice].fechaFin,
            periodos[otro].fechaInicio,
            periodos[otro].fechaFin,
          )
        ) {
          throw new ErrorDominio("CONFLICTO", "Las fechas se solapan con otro período.");
        }
      }
    }

    const existentes = await tx
      .select()
      .from(periodoAcademico)
      .where(eq(periodoAcademico.anioLectivoId, acceso.anioLectivoId));

    for (const periodo of periodos) {
      if (
        existentes.some(
          (existente) =>
            existente.orden === periodo.orden ||
            rangosSeSolapan(
              existente.fechaInicio,
              existente.fechaFin,
              periodo.fechaInicio,
              periodo.fechaFin,
            ),
        )
      ) {
        throw new ErrorDominio("CONFLICTO", "Las fechas se solapan con otro período.");
      }
    }

    const creados = await tx
      .insert(periodoAcademico)
      .values(
        periodos.map((periodo) => ({
          anioLectivoId: acceso.anioLectivoId,
          nombre: periodo.nombre,
          orden: periodo.orden,
          fechaInicio: periodo.fechaInicio,
          fechaFin: periodo.fechaFin,
        })),
      )
      .returning();

    return creados
      .sort((a, b) => a.orden - b.orden)
      .map((periodo) => ({
        id: periodo.id,
        nombre: periodo.nombre,
        orden: periodo.orden,
        fecha_inicio: periodo.fechaInicio,
        fecha_fin: periodo.fechaFin,
        estado: periodo.estado,
      }));
  });
}
