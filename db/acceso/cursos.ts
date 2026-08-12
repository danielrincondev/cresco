import {
  and,
  countDistinct,
  desc,
  eq,
  inArray,
  isNull,
} from "drizzle-orm";
import {
  anioLectivo,
  asignacionDocente,
  curso,
  docente,
  institucion,
  JORNADA,
  plan,
  REGLAS,
  suscripcion,
} from "../schema";
import type { Transaccion } from "./conexion";
import { ErrorDominio } from "./errores";
import { fechaLocalActual } from "./fechas";
import { exigirDocente } from "./perfiles";
import { conUsuario } from "./transaccion";

export type Jornada = (typeof JORNADA)[number];

export interface CrearCursoEntrada {
  organizationId: string;
  nombreInstitucion: string;
  nombreCurso: string;
  nivel: string;
  paralelo: string;
  jornada?: Jornada;
  anioInicio: string;
  anioFin: string;
}

export interface CursoApi {
  id: string;
  nombre: string;
  nivel: string;
  paralelo: string;
  jornada: string;
  institucion: string;
  total_estudiantes: number;
  periodo_vigente: null;
}

function limiteDesdePlan(limites: unknown): number | undefined {
  if (!limites || typeof limites !== "object" || Array.isArray(limites)) return undefined;
  const valor = (limites as Record<string, unknown>).cursos_activos;
  return typeof valor === "number" && Number.isInteger(valor) && valor > 0 ? valor : undefined;
}

async function obtenerLimiteCursos(tx: Transaccion, userId: string): Promise<number> {
  const [activa] = await tx
    .select({ expiraEn: suscripcion.expiraEn, limites: plan.limites })
    .from(suscripcion)
    .innerJoin(plan, eq(suscripcion.planId, plan.id))
    .where(
      and(
        eq(suscripcion.userId, userId),
        inArray(suscripcion.estado, ["ACTIVA", "EN_PERIODO_GRACIA"]),
        eq(plan.activo, true),
      ),
    )
    .orderBy(desc(suscripcion.iniciaEn))
    .limit(1);

  if (activa && (!activa.expiraEn || activa.expiraEn > new Date())) {
    return limiteDesdePlan(activa.limites) ?? REGLAS.CURSOS_DOCENTE_PRO;
  }
  return REGLAS.CURSOS_DOCENTE_FREE;
}

async function exigirCapacidadCurso(
  tx: Transaccion,
  userId: string,
  docenteId: string,
): Promise<void> {
  const [resultado] = await tx
    .select({ total: countDistinct(curso.id) })
    .from(asignacionDocente)
    .innerJoin(curso, eq(asignacionDocente.cursoId, curso.id))
    .where(
      and(
        eq(asignacionDocente.docenteId, docenteId),
        isNull(asignacionDocente.vigenteHasta),
        eq(curso.estado, "ACTIVO"),
      ),
    );
  const limite = await obtenerLimiteCursos(tx, userId);
  if (Number(resultado?.total ?? 0) >= limite) {
    throw new ErrorDominio("LIMITE_PLAN", `Su plan permite ${limite} curso${limite === 1 ? "" : "s"} activo${limite === 1 ? "" : "s"}.`, {
      limite,
    });
  }
}

export async function verificarCapacidadCurso(userId: string): Promise<void> {
  await conUsuario(userId, async (tx) => {
    const perfil = await exigirDocente(tx, userId);
    await tx.select({ id: docente.id }).from(docente).where(eq(docente.id, perfil.id)).for("update");
    await exigirCapacidadCurso(tx, userId, perfil.id);
  });
}

export async function crearCursoDocente(
  userId: string,
  entrada: CrearCursoEntrada,
): Promise<CursoApi> {
  return conUsuario(userId, async (tx) => {
    const perfil = await exigirDocente(tx, userId);
    await tx.select({ id: docente.id }).from(docente).where(eq(docente.id, perfil.id)).for("update");
    await exigirCapacidadCurso(tx, userId, perfil.id);

    await tx
      .insert(institucion)
      .values({
        organizationId: entrada.organizationId,
        nombreDeclarado: entrada.nombreInstitucion,
      })
      .onConflictDoNothing({ target: institucion.organizationId });

    const [escuela] = await tx
      .select()
      .from(institucion)
      .where(eq(institucion.organizationId, entrada.organizationId))
      .limit(1);
    if (!escuela) {
      throw new ErrorDominio("CONFLICTO", "No se pudo enlazar la institución de autenticación.");
    }

    const nombreAnio = `${entrada.anioInicio.slice(0, 4)}-${entrada.anioFin.slice(0, 4)}`;
    let [anio] = await tx
      .select()
      .from(anioLectivo)
      .where(and(eq(anioLectivo.institucionId, escuela.id), eq(anioLectivo.nombre, nombreAnio)))
      .limit(1);

    if (anio) {
      if (anio.fechaInicio !== entrada.anioInicio || anio.fechaFin !== entrada.anioFin) {
        throw new ErrorDominio("CONFLICTO", "El año lectivo existente usa fechas diferentes.");
      }
    } else {
      [anio] = await tx
        .insert(anioLectivo)
        .values({
          institucionId: escuela.id,
          nombre: nombreAnio,
          fechaInicio: entrada.anioInicio,
          fechaFin: entrada.anioFin,
        })
        .returning();
    }

    const [nuevoCurso] = await tx
      .insert(curso)
      .values({
        anioLectivoId: anio.id,
        nombre: entrada.nombreCurso,
        nivel: entrada.nivel,
        paralelo: entrada.paralelo,
        jornada: entrada.jornada ?? "MATUTINA",
      })
      .returning();

    await tx.insert(asignacionDocente).values({
      cursoId: nuevoCurso.id,
      docenteId: perfil.id,
      rol: "TITULAR",
      vigenteDesde: fechaLocalActual(),
    });

    return {
      id: nuevoCurso.id,
      nombre: nuevoCurso.nombre,
      nivel: nuevoCurso.nivel,
      paralelo: nuevoCurso.paralelo,
      jornada: nuevoCurso.jornada,
      institucion: escuela.nombreDeclarado,
      total_estudiantes: 0,
      periodo_vigente: null,
    };
  });
}
