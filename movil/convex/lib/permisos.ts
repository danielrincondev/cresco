/**
 * Capa de autorización. Dueño: Persona A (identidad y permisos).
 *
 * ── Por qué este archivo importa más que antes ──────────────────────────────
 *
 * ADR-004 definía **dos** capas de defensa sobre los datos de menores: la capa
 * obligatoria `db/acceso/` y, debajo, las políticas RLS de PostgreSQL. La razón
 * escrita era: *"un bug de la aplicación no debe bastar para filtrar datos de
 * un menor"*.
 *
 * Con Convex la segunda capa no existe: no hay RLS. Así que **esta es la única
 * capa**, y de ahí salen dos consecuencias que no son negociables:
 *
 *   1. Ninguna función toca `ctx.db` sobre estudiante, matrícula,
 *      accionRegistrada, reporteEstudiante o puntajePeriodo sin pasar por aquí.
 *      Es la regla 3 del proyecto, y ahora nada más la respalda.
 *
 *   2. La bitácora de `auditoria` deja de ser un adorno y pasa a ser el control
 *      compensatorio: es lo que demuestra ante un colegio que nadie vio lo que
 *      no le tocaba.
 *
 * Estas funciones son la traducción de `db/acceso/permisos.ts` del commit
 * cf65f89, adaptadas a Convex.
 */

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { AccionAuditoria } from "./enums";

/** Error de permiso. Los códigos son los que ya declaraba `openapi.yaml`. */
export class ErrorPermiso extends Error {
  constructor(
    readonly codigo: "NO_AUTENTICADO" | "PERFIL_NO_ENCONTRADO" | "SIN_VINCULO" | "SIN_PERMISO",
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorPermiso";
  }
}

type Ctx = QueryCtx | MutationCtx;

// ---------------------------------------------------------------------------
// Identidad
// ---------------------------------------------------------------------------

/**
 * Resuelve la identidad de Clerk al perfil del dominio.
 *
 * `identity.subject` es el id de Clerk. Se busca por `authSubject`, **nunca se
 * usa como clave** en ninguna otra tabla: el identificador canónico del sistema
 * es `perfilUsuario._id`. Esa separación es lo que hace que cambiar de
 * proveedor de autenticación algún día cueste actualizar un campo por usuario
 * y nada más — en particular, no rompe las suscripciones de RevenueCat, que
 * cuelgan del id interno.
 */
export async function perfilActual(ctx: Ctx): Promise<Doc<"perfilUsuario"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;

  return await ctx.db
    .query("perfilUsuario")
    .withIndex("por_auth_subject", (q) => q.eq("authSubject", identity.subject))
    .unique();
}

/** Igual que `perfilActual`, pero falla en vez de devolver null. */
export async function exigirPerfil(ctx: Ctx): Promise<Doc<"perfilUsuario">> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ErrorPermiso("NO_AUTENTICADO", "Inicia sesión para continuar.");
  }
  const perfil = await perfilActual(ctx);
  if (perfil === null) {
    throw new ErrorPermiso(
      "PERFIL_NO_ENCONTRADO",
      "Tu cuenta existe pero aún no completaste tu perfil.",
    );
  }
  return perfil;
}

/**
 * Una misma persona puede ser docente y representante a la vez (un profesor
 * con hijos en el mismo colegio) — por eso son dos tablas y no un campo `rol`.
 */
export async function exigirDocente(ctx: Ctx): Promise<Doc<"docente">> {
  const perfil = await exigirPerfil(ctx);
  const docente = await ctx.db
    .query("docente")
    .withIndex("por_perfil", (q) => q.eq("perfilUsuarioId", perfil._id))
    .unique();

  if (docente === null) {
    throw new ErrorPermiso("SIN_PERMISO", "Esta acción es solo para docentes.");
  }
  return docente;
}

export async function exigirRepresentante(ctx: Ctx): Promise<Doc<"representante">> {
  const perfil = await exigirPerfil(ctx);
  const representante = await ctx.db
    .query("representante")
    .withIndex("por_perfil", (q) => q.eq("perfilUsuarioId", perfil._id))
    .unique();

  if (representante === null) {
    throw new ErrorPermiso("SIN_PERMISO", "Esta acción es solo para representantes.");
  }
  return representante;
}

// ---------------------------------------------------------------------------
// Acceso a datos de estudiantes — el corazón del asunto
// ---------------------------------------------------------------------------

/**
 * D2: un solo representante legal por estudiante en la v1.
 *
 * Esta es la comprobación que sostiene la prueba S-1 de la matriz de permisos
 * (*"el Padre A no puede ver la bitácora del Hijo B"*) y el punto 3 de la
 * definición de "terminado". Si falla, devuelve `SIN_VINCULO`.
 */
export async function exigirVinculo(
  ctx: Ctx,
  estudianteId: Id<"estudiante">,
): Promise<Doc<"vinculoRepresentacion">> {
  const representante = await exigirRepresentante(ctx);

  const vinculo = await ctx.db
    .query("vinculoRepresentacion")
    .withIndex("por_estudiante_estado", (q) =>
      q.eq("estudianteId", estudianteId).eq("estado", "ACTIVO"),
    )
    .unique();

  if (vinculo === null || vinculo.representanteId !== representante._id) {
    // Mismo mensaje exista o no el estudiante: si dijéramos "no existe" vs.
    // "no es tuyo", cualquiera podría sondear qué estudiantes hay.
    throw new ErrorPermiso("SIN_VINCULO", "No tienes acceso a la información de este estudiante.");
  }
  return vinculo;
}

/** El docente titular vigente del curso (asignación sin `vigenteHasta`). */
export async function exigirTitularDelCurso(
  ctx: Ctx,
  cursoId: Id<"curso">,
): Promise<Doc<"docente">> {
  const docente = await exigirDocente(ctx);

  const asignaciones = await ctx.db
    .query("asignacionDocente")
    .withIndex("por_curso_rol", (q) => q.eq("cursoId", cursoId).eq("rol", "TITULAR"))
    .collect();

  const esTitular = asignaciones.some(
    (a) => a.docenteId === docente._id && a.vigenteHasta === undefined,
  );

  if (!esTitular) {
    throw new ErrorPermiso("SIN_PERMISO", "No eres el docente titular de este curso.");
  }
  return docente;
}

/**
 * El docente accede a un estudiante a través de la matrícula vigente en un
 * curso suyo. Es el equivalente de la prueba S-2: *"el profesor de 1.º no ve a
 * los alumnos de 5.º"*.
 */
export async function exigirAccesoDocenteAEstudiante(
  ctx: Ctx,
  estudianteId: Id<"estudiante">,
): Promise<{ docente: Doc<"docente">; matricula: Doc<"matricula"> }> {
  const docente = await exigirDocente(ctx);

  const matricula = await ctx.db
    .query("matricula")
    .withIndex("por_estudiante_estado", (q) =>
      q.eq("estudianteId", estudianteId).eq("estado", "CURSANDO"),
    )
    .unique();

  if (matricula === null) {
    throw new ErrorPermiso("SIN_PERMISO", "El estudiante no tiene una matrícula vigente.");
  }

  const asignaciones = await ctx.db
    .query("asignacionDocente")
    .withIndex("por_docente", (q) => q.eq("docenteId", docente._id))
    .collect();

  const tieneElCurso = asignaciones.some(
    (a) => a.cursoId === matricula.cursoId && a.vigenteHasta === undefined,
  );

  if (!tieneElCurso) {
    throw new ErrorPermiso("SIN_PERMISO", "Este estudiante no pertenece a un curso tuyo.");
  }
  return { docente, matricula };
}

// ---------------------------------------------------------------------------
// Auditoría
// ---------------------------------------------------------------------------

/**
 * Escribe una entrada en la bitácora.
 *
 * ⚠️ **Solo desde una `mutation`.** Las `query` de Convex son de solo lectura y
 * cacheadas, así que no pueden escribir — y por eso `LEER_SENSIBLE` no se puede
 * registrar dentro de la propia consulta que lee el dato, como sí hacía la capa
 * de acceso sobre Postgres.
 *
 * La forma de auditar una lectura es que la pantalla llame a una mutation
 * explícita al abrirse (por ejemplo `auditoria.registrarLecturaDeReporte`).
 * Es una llamada de más, pero mantiene la constancia — que con Convex es el
 * único control compensatorio que queda tras perder RLS.
 *
 * Alcance acordado el 14 de agosto para la v1: LOGIN, LEER_SENSIBLE, CREAR y
 * ANULAR acción, APROBAR estudiante. Se difieren a la v2: EXPORTAR y ALERTA.
 */
export async function auditar(
  ctx: MutationCtx,
  datos: {
    accion: AccionAuditoria;
    entidadTipo: string;
    entidadId?: string;
    institucionId?: Id<"institucion">;
    datosAntes?: unknown;
    datosDespues?: unknown;
  },
): Promise<void> {
  const perfil = await perfilActual(ctx);

  await ctx.db.insert("auditoria", {
    perfilUsuarioId: perfil?._id,
    institucionId: datos.institucionId,
    accion: datos.accion,
    entidadTipo: datos.entidadTipo,
    entidadId: datos.entidadId,
    datosAntes: datos.datosAntes,
    datosDespues: datos.datosDespues,
    ocurridoEn: Date.now(),
  });
}
