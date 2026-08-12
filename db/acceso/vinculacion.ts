import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  anioLectivo,
  consentimiento,
  curso,
  estudiante,
  invitacionCurso,
  matricula,
  TIPO_DOCUMENTO,
  PARENTESCO,
  vinculoRepresentacion,
} from "../schema";
import { ErrorDominio } from "./errores";
import { fechaLocalActual } from "./fechas";
import { exigirRepresentante } from "./perfiles";
import { conUsuario } from "./transaccion";

export type Parentesco = (typeof PARENTESCO)[number];
export type TipoDocumentoEstudiante = (typeof TIPO_DOCUMENTO)[number];

export interface ReclamarInvitacionEntrada {
  codigoCorto: string;
  parentesco: Parentesco;
  estudiante: {
    tipoDocumento?: TipoDocumentoEstudiante;
    numeroDocumento: string;
    nombres: string;
    apellidos: string;
    fechaNacimiento?: string;
  };
  consentimiento: {
    versionDocumento: string;
    otorgado: true;
  };
}

export interface ReclamarInvitacionResultado {
  estudiante_id: string;
  estado_verificacion: string;
}

export async function reclamarInvitacionCurso(
  userId: string,
  entrada: ReclamarInvitacionEntrada,
): Promise<ReclamarInvitacionResultado> {
  return conUsuario(userId, async (tx) => {
    const perfil = await exigirRepresentante(tx, userId);
    const codigo = entrada.codigoCorto.trim().toUpperCase();
    const [invitacion] = await tx
      .select()
      .from(invitacionCurso)
      .where(eq(invitacionCurso.codigoCorto, codigo))
      .orderBy(desc(invitacionCurso.creadoEn))
      .limit(1)
      .for("update");

    if (!invitacion) {
      throw new ErrorDominio("INVITACION_NO_ENCONTRADA", "El código de invitación no existe.");
    }
    if (invitacion.estado !== "PENDIENTE" || invitacion.expiraEn <= new Date()) {
      throw new ErrorDominio("INVITACION_EXPIRADA", "La invitación expiró o fue revocada.");
    }
    if (
      invitacion.usosMaximos !== null &&
      invitacion.usosRealizados >= invitacion.usosMaximos
    ) {
      throw new ErrorDominio("INVITACION_AGOTADA", "La invitación ya alcanzó su límite de usos.");
    }

    const [destino] = await tx
      .select({
        cursoId: curso.id,
        institucionId: anioLectivo.institucionId,
      })
      .from(curso)
      .innerJoin(anioLectivo, eq(curso.anioLectivoId, anioLectivo.id))
      .where(and(eq(curso.id, invitacion.cursoId), eq(curso.estado, "ACTIVO")))
      .limit(1);
    if (!destino) {
      throw new ErrorDominio("CURSO_NO_ENCONTRADO", "El curso de la invitación ya no está activo.");
    }

    const tipoDocumento = entrada.estudiante.tipoDocumento ?? "CEDULA";
    let alumno = tipoDocumento === "SIN_DOCUMENTO"
      ? undefined
      : (
          await tx
            .select({
              id: estudiante.id,
              estadoVerificacion: estudiante.estadoVerificacion,
            })
            .from(estudiante)
            .where(
              and(
                eq(estudiante.institucionId, destino.institucionId),
                eq(estudiante.tipoDocumento, tipoDocumento),
                eq(estudiante.numeroDocumento, entrada.estudiante.numeroDocumento),
              ),
            )
            .limit(1)
            .for("update")
        )[0];

    if (alumno) {
      const [vinculoActivo] = await tx
        .select({ id: vinculoRepresentacion.id })
        .from(vinculoRepresentacion)
        .where(
          and(
            eq(vinculoRepresentacion.estudianteId, alumno.id),
            eq(vinculoRepresentacion.estado, "ACTIVO"),
          ),
        )
        .limit(1);
      if (vinculoActivo) {
        throw new ErrorDominio("CONFLICTO", "Ese estudiante ya tiene un representante activo.");
      }
    } else {
      const nuevoAlumno = {
        id: randomUUID(),
        estadoVerificacion: "PENDIENTE" as const,
      };
      try {
        await tx.insert(estudiante).values({
          id: nuevoAlumno.id,
          institucionId: destino.institucionId,
          tipoDocumento,
          numeroDocumento: entrada.estudiante.numeroDocumento,
          nombres: entrada.estudiante.nombres,
          apellidos: entrada.estudiante.apellidos,
          fechaNacimiento: entrada.estudiante.fechaNacimiento,
          origenRegistro: "REPRESENTANTE",
          estadoVerificacion: nuevoAlumno.estadoVerificacion,
        });
      } catch (error) {
        if (typeof error === "object" && error !== null) {
          const dbError = error as { code?: string; cause?: { code?: string } };
          if (dbError.code === "23505" || dbError.cause?.code === "23505") {
            throw new ErrorDominio(
              "CONFLICTO",
              "Ese estudiante ya está registrado en la institución.",
            );
          }
        }
        throw error;
      }
      alumno = nuevoAlumno;
    }


    await tx.insert(vinculoRepresentacion).values({
      representanteId: perfil.id,
      estudianteId: alumno.id,
      parentesco: entrada.parentesco,
      invitacionCursoId: invitacion.id,
      vigenteDesde: fechaLocalActual(),
    });

    const [matriculaExistente] = await tx
      .select({ id: matricula.id })
      .from(matricula)
      .where(
        and(
          eq(matricula.estudianteId, alumno.id),
          eq(matricula.estado, "CURSANDO"),
        ),
      )
      .limit(1);
    if (matriculaExistente) {
      throw new ErrorDominio("CONFLICTO", "El estudiante ya tiene una matrícula vigente.");
    }

    await tx.insert(matricula).values({
      estudianteId: alumno.id,
      cursoId: destino.cursoId,
      fechaIngreso: fechaLocalActual(),
    });

    await tx.insert(consentimiento).values({
      userId,
      estudianteId: alumno.id,
      tipo: "TRATAMIENTO_DATOS_MENOR",
      versionDocumento: entrada.consentimiento.versionDocumento,
      otorgado: entrada.consentimiento.otorgado,
    });

    const usosRealizados = invitacion.usosRealizados + 1;
    await tx
      .update(invitacionCurso)
      .set({
        usosRealizados,
        estado:
          invitacion.usosMaximos !== null && usosRealizados >= invitacion.usosMaximos
            ? "AGOTADA"
            : "PENDIENTE",
        actualizadoEn: new Date(),
      })
      .where(eq(invitacionCurso.id, invitacion.id));

    return {
      estudiante_id: alumno.id,
      estado_verificacion: alumno.estadoVerificacion,
    };
  });
}
