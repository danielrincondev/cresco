import { and, eq, isNull } from "drizzle-orm";
import {
  anioLectivo,
  asignacionDocente,
  curso,
  docente,
  estudiante,
  matricula,
} from "../schema";
import type { Transaccion } from "./conexion";
import { ErrorDominio } from "./errores";

export async function exigirCursoDelDocente(
  tx: Transaccion,
  userId: string,
  cursoId: string,
) {
  const [acceso] = await tx
    .select({
      anioLectivoId: anioLectivo.id,
      cursoId: curso.id,
      docenteId: docente.id,
      fechaInicioAnio: anioLectivo.fechaInicio,
      fechaFinAnio: anioLectivo.fechaFin,
    })
    .from(curso)
    .innerJoin(anioLectivo, eq(curso.anioLectivoId, anioLectivo.id))
    .innerJoin(asignacionDocente, eq(asignacionDocente.cursoId, curso.id))
    .innerJoin(docente, eq(asignacionDocente.docenteId, docente.id))
    .where(
      and(
        eq(curso.id, cursoId),
        eq(docente.userId, userId),
        isNull(asignacionDocente.vigenteHasta),
      ),
    )
    .limit(1);

  if (!acceso) {
    throw new ErrorDominio("CURSO_NO_ENCONTRADO", "El curso no existe o no pertenece al docente.");
  }
  return acceso;
}

export async function exigirEstudianteDelDocente(
  tx: Transaccion,
  userId: string,
  estudianteId: string,
) {
  const [acceso] = await tx
    .select({
      cursoId: curso.id,
      docenteId: docente.id,
      estudianteId: estudiante.id,
      estadoVerificacion: estudiante.estadoVerificacion,
      matriculaId: matricula.id,
    })
    .from(estudiante)
    .innerJoin(matricula, eq(matricula.estudianteId, estudiante.id))
    .innerJoin(curso, eq(matricula.cursoId, curso.id))
    .innerJoin(asignacionDocente, eq(asignacionDocente.cursoId, curso.id))
    .innerJoin(docente, eq(asignacionDocente.docenteId, docente.id))
    .where(
      and(
        eq(estudiante.id, estudianteId),
        eq(docente.userId, userId),
        eq(matricula.estado, "CURSANDO"),
        isNull(asignacionDocente.vigenteHasta),
      ),
    )
    .limit(1);

  if (!acceso) {
    throw new ErrorDominio(
      "ESTUDIANTE_NO_ENCONTRADO",
      "El estudiante no existe o no pertenece a un curso del docente.",
    );
  }
  return acceso;
}
