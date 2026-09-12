/**
 * Módulo núcleo — cursos, calendario y vinculación.
 *
 * Perfil, cursos, parciales, invitaciones y aprobación. Cada operación conserva
 * sus comprobaciones y escrituras en una mutation para mantener la atomicidad.
 */

import { ConvexError, v } from "convex/values";

import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { JORNADA, PARENTESCO, REGLAS, TIPO_DOCUMENTO } from "./lib/enums";
import { ErrorDominio, exigirRangoFechas, hoyEnGuayaquil } from "./lib/guardas";
import { auditar, ErrorPermiso, exigirDocente, exigirRepresentante, exigirTitularDelCurso, exigirVinculo, perfilActual } from "./lib/permisos";
import { tieneAccesoVigente } from "./lib/revenuecat";

const jornada = v.union(...JORNADA.map((valor) => v.literal(valor)));

/** Los errores esperados conservan código y mensaje al llegar al cliente. */
async function conErroresPublicos<T>(operacion: () => Promise<T>): Promise<T> {
  try {
    return await operacion();
  } catch (error) {
    if (error instanceof ErrorDominio || error instanceof ErrorPermiso) {
      throw new ConvexError({ codigo: error.codigo, mensaje: error.message });
    }
    throw error;
  }
}

function normalizarDocumento(tipo: "CEDULA" | "PASAPORTE" | "SIN_DOCUMENTO", valor: string) {
  const numero = valor.trim().toUpperCase();
  if (tipo === "SIN_DOCUMENTO") {
    if (numero !== "") throw new ErrorDominio("VALIDACION", "Sin documento, deja el número vacío.");
    return "";
  }
  if (tipo === "CEDULA" ? !/^\d{10}$/.test(numero) : !/^[A-Z0-9-]{3,30}$/.test(numero)) {
    throw new ErrorDominio("VALIDACION", "Revisa el formato del documento de identidad.");
  }
  return numero;
}

async function presentarPerfil(ctx: QueryCtx, perfil: Doc<"perfilUsuario">) {
  const docente = await ctx.db.query("docente")
    .withIndex("por_perfil", (q) => q.eq("perfilUsuarioId", perfil._id)).unique();
  const representante = await ctx.db.query("representante")
    .withIndex("por_perfil", (q) => q.eq("perfilUsuarioId", perfil._id)).unique();
  return {
    perfilUsuarioId: perfil._id,
    docenteId: docente?._id ?? null,
    representanteId: representante?._id ?? null,
  };
}

/** null significa que falta completar el perfil, no que haya que cerrar sesión. */
export const obtenerPerfil = query({
  args: {},
  handler: (ctx) => conErroresPublicos(async () => {
    if (!(await ctx.auth.getUserIdentity())) {
      throw new ErrorPermiso("NO_AUTENTICADO", "Inicia sesión para continuar.");
    }
    const perfil = await perfilActual(ctx);
    return perfil ? await presentarPerfil(ctx, perfil) : null;
  }),
});

/** Alta idempotente. Añadir un rol nunca elimina el otro ni reasigna una cuenta. */
export const completarPerfil = mutation({
  args: {
    tipoDocumento: v.union(v.literal("CEDULA"), v.literal("PASAPORTE")),
    numeroDocumento: v.string(),
    telefono: v.optional(v.string()),
    roles: v.array(v.union(v.literal("DOCENTE"), v.literal("REPRESENTANTE"))),
  },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const identidad = await ctx.auth.getUserIdentity();
    if (!identidad) throw new ErrorPermiso("NO_AUTENTICADO", "Inicia sesión para continuar.");
    if (args.roles.length < 1 || args.roles.length > 2 || new Set(args.roles).size !== args.roles.length) {
      throw new ErrorDominio("VALIDACION", "Selecciona uno o ambos roles, sin repetirlos.");
    }
    const numeroDocumento = normalizarDocumento(args.tipoDocumento, args.numeroDocumento);
    const telefono = args.telefono?.trim();
    if (telefono !== undefined && !/^\+?[0-9 ()-]{7,25}$/.test(telefono)) {
      throw new ErrorDominio("VALIDACION", "Revisa el número de teléfono.");
    }
    let perfil = await perfilActual(ctx);
    const duplicado = await ctx.db.query("perfilUsuario")
      .withIndex("por_documento", (q) => q.eq("tipoDocumento", args.tipoDocumento).eq("numeroDocumento", numeroDocumento))
      .unique();
    if (duplicado && duplicado._id !== perfil?._id) {
      throw new ErrorDominio("CONFLICTO", "No se puede registrar este documento con esta cuenta.");
    }
    if (perfil && (perfil.tipoDocumento !== args.tipoDocumento || perfil.numeroDocumento !== numeroDocumento)) {
      throw new ErrorDominio("CONFLICTO", "El perfil ya tiene otro documento. El alta no modifica la identidad.");
    }
    const actualizadoEn = Date.now();
    if (!perfil) {
      const id = await ctx.db.insert("perfilUsuario", {
        authSubject: identidad.tokenIdentifier,
        tipoDocumento: args.tipoDocumento,
        numeroDocumento,
        telefono,
        actualizadoEn,
      });
      perfil = (await ctx.db.get("perfilUsuario", id))!;
    } else {
      // Migra en el lugar: conserva el _id que usan suscripciones y permisos.
      await ctx.db.patch("perfilUsuario", perfil._id, {
        authSubject: identidad.tokenIdentifier,
        ...(telefono === undefined ? {} : { telefono }),
        actualizadoEn,
      });
    }
    for (const rol of args.roles) {
      const tabla = rol === "DOCENTE" ? "docente" : "representante";
      const existente = await ctx.db.query(tabla)
        .withIndex("por_perfil", (q) => q.eq("perfilUsuarioId", perfil._id)).unique();
      if (!existente) await ctx.db.insert(tabla, { perfilUsuarioId: perfil._id, actualizadoEn });
    }
    return await presentarPerfil(ctx, perfil);
  }),
});

const periodo = v.object({
  nombre: v.string(),
  orden: v.number(),
  fechaInicio: v.string(),
  fechaFin: v.string(),
});

function textoRequerido(valor: string, campo: string): string {
  const limpio = valor.trim();
  if (!limpio) {
    throw new ErrorDominio("VALIDACION", `${campo} es obligatorio.`);
  }
  return limpio;
}

function exigirFechaISO(fecha: string, campo: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new ErrorDominio("FECHAS_INVALIDAS", `${campo} debe usar el formato YYYY-MM-DD.`);
  }
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const normalizada = new Date(Date.UTC(anio, mes - 1, dia)).toISOString().slice(0, 10);
  if (normalizada !== fecha) {
    throw new ErrorDominio("FECHAS_INVALIDAS", `${campo} no es una fecha válida.`);
  }
}

function nombreAnioLectivo(fechaInicio: string, fechaFin: string): string {
  return `${fechaInicio.slice(0, 4)}–${fechaFin.slice(0, 4)}`;
}

function limiteConfigurado(plan: Doc<"plan">, limitePorDefecto: number, campo: "cursosActivos" | "estudiantesPorCurso"): number {
  if (typeof plan.limites !== "object" || plan.limites === null) return limitePorDefecto;
  const limite = (plan.limites as Record<string, unknown>)[campo];
  return typeof limite === "number" && Number.isInteger(limite) && limite > 0
    ? limite
    : limitePorDefecto;
}

async function limiteDelDocente(
  ctx: QueryCtx,
  perfilUsuarioId: Doc<"perfilUsuario">["_id"],
  ahora: number = Date.now(),
  campo: "cursosActivos" | "estudiantesPorCurso" = "cursosActivos",
): Promise<number> {
  const limiteFree = campo === "cursosActivos" ? REGLAS.CURSOS_DOCENTE_FREE : REGLAS.ESTUDIANTES_POR_CURSO_FREE;
  const limitePro = campo === "cursosActivos" ? REGLAS.CURSOS_DOCENTE_PRO : REGLAS.ESTUDIANTES_POR_CURSO_PRO;
  const suscripciones = await ctx.db
    .query("suscripcion")
    .withIndex("por_usuario", (q) => q.eq("perfilUsuarioId", perfilUsuarioId))
    .collect();

  for (const suscripcion of suscripciones) {
    if (
      !tieneAccesoVigente(
        { estado: suscripcion.estado, expiraEn: suscripcion.expiraEn },
        ahora,
      )
    ) {
      continue;
    }

    const plan = await ctx.db.get("plan", suscripcion.planId);
    if (plan?.codigo === "DOC_PRO" && plan.audiencia === "DOCENTE" && plan.activo) {
      return limiteConfigurado(plan, limitePro, campo);
    }
  }

  const planGratuito = await ctx.db
    .query("plan")
    .withIndex("por_codigo", (q) => q.eq("codigo", "DOC_FREE"))
    .unique();
  if (planGratuito?.audiencia === "DOCENTE" && planGratuito.activo) {
    return limiteConfigurado(planGratuito, limiteFree, campo);
  }
  return limiteFree;
}

async function cursosActivosDelDocente(ctx: QueryCtx, docenteId: Doc<"docente">["_id"]) {
  const asignaciones = await ctx.db
    .query("asignacionDocente")
    .withIndex("por_docente", (q) => q.eq("docenteId", docenteId))
    .collect();

  const cursos = new Map<Doc<"curso">["_id"], Doc<"curso">>();
  for (const asignacion of asignaciones) {
    if (asignacion.vigenteHasta !== undefined) continue;
    const curso = await ctx.db.get("curso", asignacion.cursoId);
    if (curso?.estado === "ACTIVO") cursos.set(curso._id, curso);
  }
  return [...cursos.values()];
}

async function presentarCurso(ctx: QueryCtx, curso: Doc<"curso">) {
  const anioLectivo = await ctx.db.get("anioLectivo", curso.anioLectivoId);
  const institucion = anioLectivo
    ? await ctx.db.get("institucion", anioLectivo.institucionId)
    : null;
  const matriculas = await ctx.db
    .query("matricula")
    .withIndex("por_curso_estado", (q) =>
      q.eq("cursoId", curso._id).eq("estado", "CURSANDO"),
    )
    .collect();
  const periodos = anioLectivo
    ? await ctx.db
        .query("periodoAcademico")
        .withIndex("por_anio_orden", (q) => q.eq("anioLectivoId", anioLectivo._id))
        .collect()
    : [];
  const periodoVigente = periodos.find((p) => p.estado === "EN_CURSO");

  return {
    id: curso._id,
    nombre: curso.nombre,
    nivel: curso.nivel,
    paralelo: curso.paralelo,
    jornada: curso.jornada,
    institucion: institucion?.nombreDeclarado ?? "",
    totalEstudiantes: matriculas.length,
    periodoVigente: periodoVigente
      ? {
          id: periodoVigente._id,
          nombre: periodoVigente.nombre,
          orden: periodoVigente.orden,
          fechaInicio: periodoVigente.fechaInicio,
          fechaFin: periodoVigente.fechaFin,
          estado: periodoVigente.estado,
        }
      : null,
  };
}

/** Cursos del docente autenticado y límite que le concede su plan actual. */
export const listarCursos = query({
  args: {},
  handler: async (ctx) => {
    const docente = await exigirDocente(ctx);
    const cursos = await cursosActivosDelDocente(ctx, docente._id);
    const limitePlan = await limiteDelDocente(ctx, docente.perfilUsuarioId);

    return {
      cursos: await Promise.all(cursos.map(async (curso) => await presentarCurso(ctx, curso))),
      limitePlan,
    };
  },
});

/** Crea institución declarada, año lectivo, curso y asignación titular. */
export const crearCurso = mutation({
  args: {
    nombreInstitucion: v.string(),
    nombreCurso: v.string(),
    nivel: v.string(),
    paralelo: v.string(),
    jornada: v.optional(jornada),
    aula: v.optional(v.string()),
    anioInicio: v.string(),
    anioFin: v.string(),
  },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const docente = await exigirDocente(ctx);
    const cursosActivos = await cursosActivosDelDocente(ctx, docente._id);
    const limitePlan = await limiteDelDocente(ctx, docente.perfilUsuarioId);
    if (cursosActivos.length >= limitePlan) {
      throw new ErrorDominio(
        "LIMITE_PLAN",
        `Tu plan permite hasta ${limitePlan} curso${limitePlan === 1 ? "" : "s"} activo${limitePlan === 1 ? "" : "s"}.`,
      );
    }

    exigirFechaISO(args.anioInicio, "La fecha de inicio del año lectivo");
    exigirFechaISO(args.anioFin, "La fecha de fin del año lectivo");
    exigirRangoFechas(args.anioInicio, args.anioFin, "el año lectivo");
    const nombreInstitucion = textoRequerido(args.nombreInstitucion, "El nombre de la institución");
    if (nombreInstitucion.length > 160) {
      throw new ErrorDominio("VALIDACION", "El nombre de la institución no puede superar 160 caracteres.");
    }
    const nombreCurso = textoRequerido(args.nombreCurso, "El nombre del curso");
    const nivel = textoRequerido(args.nivel, "El nivel");
    const paralelo = textoRequerido(args.paralelo, "El paralelo");
    const jornadaCurso = args.jornada ?? "MATUTINA";
    const ahora = Date.now();

    /**
     * B1: cada curso nace con su propio agregado institución/año/calendario.
     * Dos nombres declarados iguales no implican que una institución no
     * verificada sea la misma entidad; esa consolidación queda para la v2.
     */
    const institucionId = await ctx.db.insert("institucion", {
      nombreDeclarado: nombreInstitucion,
      verificada: false,
      regimen: "COSTA_INSULAR",
      ciudad: "Guayaquil",
      zonaHoraria: REGLAS.ZONA_HORARIA,
      puntajeBase: REGLAS.PUNTAJE_BASE,
      puntajeMinimo: REGLAS.PUNTAJE_MINIMO,
      puntajeMaximo: REGLAS.PUNTAJE_MAXIMO,
      topeDiarioPositivo: REGLAS.TOPE_DIARIO_POSITIVO,
      topeDiarioNegativo: REGLAS.TOPE_DIARIO_NEGATIVO,
      estado: "ACTIVA",
      actualizadoEn: ahora,
    });

    const anioLectivoId = await ctx.db.insert("anioLectivo", {
      institucionId,
      nombre: nombreAnioLectivo(args.anioInicio, args.anioFin),
      fechaInicio: args.anioInicio,
      fechaFin: args.anioFin,
      estado: "PLANIFICADO",
      actualizadoEn: ahora,
    });

    const duplicado = await ctx.db
      .query("curso")
      .withIndex("por_anio_nivel_paralelo", (q) =>
        q
          .eq("anioLectivoId", anioLectivoId)
          .eq("nivel", nivel)
          .eq("paralelo", paralelo)
          .eq("jornada", jornadaCurso),
      )
      .unique();
    if (duplicado !== null) {
      throw new ErrorDominio("CONFLICTO", "Ya existe ese curso en el año lectivo.");
    }

    const cursoId = await ctx.db.insert("curso", {
      anioLectivoId,
      nombre: nombreCurso,
      nivel,
      paralelo,
      jornada: jornadaCurso,
      aula: args.aula?.trim() || undefined,
      estado: "ACTIVO",
      actualizadoEn: ahora,
    });

    await ctx.db.insert("asignacionDocente", {
      cursoId,
      docenteId: docente._id,
      rol: "TITULAR",
      vigenteDesde: hoyEnGuayaquil(ahora),
      actualizadoEn: ahora,
    });

    const curso = await ctx.db.get("curso", cursoId);
    if (curso === null) throw new Error("Convex no devolvió el curso recién creado.");
    return await presentarCurso(ctx, curso);
  }),
});

/** Define de dos a tres parciales no solapados dentro del año lectivo. */
export const definirPeriodos = mutation({
  args: {
    cursoId: v.id("curso"),
    periodos: v.array(periodo),
  },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const docente = await exigirTitularDelCurso(ctx, args.cursoId);
    if (args.periodos.length < 2 || args.periodos.length > 3) {
      throw new ErrorDominio("VALIDACION", "Debes definir entre 2 y 3 parciales.");
    }

    const curso = await ctx.db.get("curso", args.cursoId);
    if (curso === null) {
      throw new ErrorDominio("NO_ENCONTRADO", "El curso no existe.");
    }
    const anioLectivo = await ctx.db.get("anioLectivo", curso.anioLectivoId);
    if (anioLectivo === null) {
      throw new ErrorDominio("NO_ENCONTRADO", "El año lectivo del curso no existe.");
    }

    const cursosDelAnio = await ctx.db
      .query("curso")
      .withIndex("por_anio", (q) => q.eq("anioLectivoId", anioLectivo._id))
      .collect();
    for (const cursoDelAnio of cursosDelAnio) {
      const titulares = await ctx.db
        .query("asignacionDocente")
        .withIndex("por_curso_rol", (q) =>
          q.eq("cursoId", cursoDelAnio._id).eq("rol", "TITULAR"),
        )
        .collect();
      const puedeModificar = titulares.some(
        (titular) => titular.docenteId === docente._id && titular.vigenteHasta === undefined,
      );
      if (!puedeModificar) {
        throw new ErrorDominio(
          "CONFLICTO",
          "El año lectivo está compartido con un curso que no administras.",
        );
      }
    }

    const existentes = await ctx.db
      .query("periodoAcademico")
      .withIndex("por_anio_orden", (q) => q.eq("anioLectivoId", anioLectivo._id))
      .collect();
    if (existentes.length > 0) {
      throw new ErrorDominio("CONFLICTO", "Los parciales de este año lectivo ya fueron definidos.");
    }

    const ordenes = new Set<number>();
    const normalizados = args.periodos.map((p) => {
      if (!Number.isInteger(p.orden) || p.orden < 1 || p.orden > args.periodos.length) {
        throw new ErrorDominio("VALIDACION", "El orden de cada parcial debe ser consecutivo desde 1.");
      }
      if (ordenes.has(p.orden)) {
        throw new ErrorDominio("CONFLICTO", "Dos parciales no pueden tener el mismo orden.");
      }
      ordenes.add(p.orden);
      exigirFechaISO(p.fechaInicio, `La fecha de inicio de ${p.nombre}`);
      exigirFechaISO(p.fechaFin, `La fecha de fin de ${p.nombre}`);
      exigirRangoFechas(p.fechaInicio, p.fechaFin, `el parcial ${p.nombre}`);
      if (p.fechaInicio < anioLectivo.fechaInicio || p.fechaFin > anioLectivo.fechaFin) {
        throw new ErrorDominio("FECHAS_INVALIDAS", "Los parciales deben estar dentro del año lectivo.");
      }
      return { ...p, nombre: textoRequerido(p.nombre, "El nombre del parcial") };
    });

    const porFecha = [...normalizados].sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
    for (let i = 1; i < porFecha.length; i++) {
      if (porFecha[i].fechaInicio <= porFecha[i - 1].fechaFin) {
        throw new ErrorDominio("CONFLICTO", "Las fechas de los parciales no pueden solaparse.");
      }
    }
    if (porFecha.some((p, indice) => p.orden !== indice + 1)) {
      throw new ErrorDominio(
        "FECHAS_INVALIDAS",
        "El orden de los parciales debe coincidir con sus fechas.",
      );
    }

    const ahora = Date.now();
    const ids = [];
    for (const p of normalizados.sort((a, b) => a.orden - b.orden)) {
      ids.push(
        await ctx.db.insert("periodoAcademico", {
          anioLectivoId: anioLectivo._id,
          nombre: p.nombre,
          orden: p.orden,
          fechaInicio: p.fechaInicio,
          fechaFin: p.fechaFin,
          estado: "PLANIFICADO",
          actualizadoEn: ahora,
        }),
      );
    }
    return ids;
  }),
});

// Invitaciones y alta de estudiantes — #7.
const VERSION_CONSENTIMIENTO = "2026-09-v2";
const tipoDocumentoEstudiante = v.union(...TIPO_DOCUMENTO.map((tipo) => v.literal(tipo)));
const credencialInvitacion = v.union(
  v.object({ codigo: v.string() }),
  v.object({ token: v.string() }),
);
const datosEstudiante = v.object({
  tipoDocumento: tipoDocumentoEstudiante,
  numeroDocumento: v.string(),
  nombres: v.string(),
  apellidos: v.string(),
  fechaNacimiento: v.optional(v.string()),
});

async function contextoCurso(ctx: QueryCtx, cursoId: Id<"curso">) {
  const curso = await ctx.db.get("curso", cursoId);
  const anio = curso ? await ctx.db.get("anioLectivo", curso.anioLectivoId) : null;
  const institucion = anio ? await ctx.db.get("institucion", anio.institucionId) : null;
  if (!curso || !anio || !institucion) throw new ErrorDominio("NO_ENCONTRADO", "El curso no está disponible.");
  return { curso, anio, institucion };
}

function exigirCursoActivo(contexto: Awaited<ReturnType<typeof contextoCurso>>) {
  if (contexto.curso.estado !== "ACTIVO" || contexto.anio.estado === "CERRADO" ||
    contexto.institucion.estado !== "ACTIVA" || contexto.anio.fechaFin < hoyEnGuayaquil()) {
    throw new ErrorDominio("CURSO_INACTIVO", "El curso no admite nuevos estudiantes.");
  }
}

function invitacionVigente(invitacion: Doc<"invitacionCurso">, ahora: number) {
  return invitacion.estado === "PENDIENTE" && invitacion.expiraEn > ahora &&
    (invitacion.usosMaximos === undefined || invitacion.usosRealizados < invitacion.usosMaximos);
}

function normalizarCredencial(credencial: { codigo: string } | { token: string }) {
  return "codigo" in credencial
    ? { codigo: credencial.codigo.replace(/[\s-]/g, "").toUpperCase() }
    : { token: credencial.token.trim() };
}

async function buscarInvitacion(ctx: QueryCtx, credencial: { codigo: string } | { token: string }) {
  const normalizada = normalizarCredencial(credencial);
  const invitacion = "codigo" in normalizada
    ? await ctx.db.query("invitacionCurso").withIndex("por_codigo", (q) => q.eq("codigoCorto", normalizada.codigo!)).unique()
    : await ctx.db.query("invitacionCurso").withIndex("por_token", (q) => q.eq("token", normalizada.token!)).unique();
  if (!invitacion || !invitacionVigente(invitacion, Date.now())) {
    throw new ErrorDominio("INVITACION_INVALIDA", "La invitación no está disponible. Pide un código vigente al docente.");
  }
  const contexto = await contextoCurso(ctx, invitacion.cursoId);
  exigirCursoActivo(contexto);
  return { invitacion, ...contexto };
}

function presentarInvitacion(invitacion: Doc<"invitacionCurso">) {
  return { invitacionId: invitacion._id, cursoId: invitacion.cursoId,
    codigo: invitacion.codigoCorto, token: invitacion.token, expiraEn: invitacion.expiraEn };
}

/** Math.random usa el generador fuerte y reproducible del runtime Convex. */
function secretoAleatorio(longitud: number) {
  const alfabeto = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from({ length: longitud }, () => alfabeto[Math.floor(Math.random() * alfabeto.length)]).join("");
}

/** Reutiliza la última invitación vigente; el código se comparte con todo el curso. */
export const crearInvitacion = mutation({
  args: { cursoId: v.id("curso") },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const docente = await exigirTitularDelCurso(ctx, args.cursoId);
    exigirCursoActivo(await contextoCurso(ctx, args.cursoId));
    const ultima = await ctx.db.query("invitacionCurso")
      .withIndex("por_curso", (q) => q.eq("cursoId", args.cursoId)).order("desc").first();
    const ahora = Date.now();
    if (ultima && invitacionVigente(ultima, ahora)) return presentarInvitacion(ultima);
    for (let intento = 0; intento < 5; intento++) {
      const codigoCorto = secretoAleatorio(12);
      const token = secretoAleatorio(52);
      const codigoExistente = await ctx.db.query("invitacionCurso").withIndex("por_codigo", (q) => q.eq("codigoCorto", codigoCorto)).first();
      const tokenExistente = await ctx.db.query("invitacionCurso").withIndex("por_token", (q) => q.eq("token", token)).first();
      if (codigoExistente || tokenExistente) continue;
      const id = await ctx.db.insert("invitacionCurso", {
        cursoId: args.cursoId, emitidaPorDocenteId: docente._id, codigoCorto, token,
        usosRealizados: 0, estado: "PENDIENTE",
        expiraEn: ahora + REGLAS.INVITACION_DIAS_VIGENCIA * 86_400_000, actualizadoEn: ahora,
      });
      return presentarInvitacion((await ctx.db.get("invitacionCurso", id))!);
    }
    throw new ErrorDominio("CONFLICTO", "No se pudo generar un código. Inténtalo de nuevo.");
  }),
});

/** Validación al enviar P2; mutation para evaluar caducidad con el reloj del servidor. */
export const consultarInvitacion = mutation({
  args: { credencial: credencialInvitacion },
  handler: (ctx, args) => conErroresPublicos(async () => {
    await exigirRepresentante(ctx);
    const { invitacion, curso, institucion } = await buscarInvitacion(ctx, args.credencial);
    return { cursoId: curso._id, nombreCurso: curso.nombre, institucion: institucion.nombreDeclarado,
      expiraEn: invitacion.expiraEn, versionDocumento: VERSION_CONSENTIMIENTO };
  }),
});

function validarNombre(valor: string, campo: string) {
  const nombre = textoRequerido(valor, campo);
  if (nombre.length > 160) throw new ErrorDominio("VALIDACION", `${campo} no puede superar 160 caracteres.`);
  return nombre;
}

function validarNacimiento(fecha: string | undefined) {
  if (fecha === undefined) return undefined;
  exigirFechaISO(fecha, "La fecha de nacimiento");
  if (fecha > hoyEnGuayaquil()) throw new ErrorDominio("VALIDACION", "La fecha de nacimiento no puede estar en el futuro.");
  return fecha;
}

async function huellaDeSolicitud(datos: unknown) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(datos)));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Lectura indexada dentro de la misma transacción que crea o corrige al estudiante. */
async function exigirDocumentoEstudianteDisponible(ctx: QueryCtx, institucionId: Id<"institucion">,
  tipoDocumento: Doc<"estudiante">["tipoDocumento"], numeroDocumento: string, propioId?: Id<"estudiante">) {
  if (tipoDocumento === "SIN_DOCUMENTO") return;
  const existente = await ctx.db.query("estudiante").withIndex("por_documento", (q) =>
    q.eq("institucionId", institucionId).eq("tipoDocumento", tipoDocumento).eq("numeroDocumento", numeroDocumento)).unique();
  if (existente && existente._id !== propioId) {
    throw new ErrorDominio("CONFLICTO", "No se puede registrar este documento en este curso. Consulta al docente.");
  }
}

export const canjearInvitacion = mutation({
  args: {
    credencial: credencialInvitacion,
    solicitudId: v.string(),
    estudiante: datosEstudiante,
    parentesco: v.union(...PARENTESCO.map((parentesco) => v.literal(parentesco))),
    aceptaTratamiento: v.boolean(),
    declaraRepresentanteLegal: v.boolean(),
    versionDocumento: v.string(),
  },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const representante = await exigirRepresentante(ctx);
    if (!/^[a-zA-Z0-9_-]{16,128}$/.test(args.solicitudId)) {
      throw new ErrorDominio("VALIDACION", "Falta un identificador válido para la solicitud.");
    }
    if (!args.aceptaTratamiento || !args.declaraRepresentanteLegal) {
      throw new ErrorDominio("CONSENTIMIENTO_REQUERIDO", "Acepta el tratamiento de datos y confirma que eres representante legal.");
    }
    const datos = { tipoDocumento: args.estudiante.tipoDocumento,
      numeroDocumento: normalizarDocumento(args.estudiante.tipoDocumento, args.estudiante.numeroDocumento),
      nombres: validarNombre(args.estudiante.nombres, "Los nombres"),
      apellidos: validarNombre(args.estudiante.apellidos, "Los apellidos"),
      fechaNacimiento: validarNacimiento(args.estudiante.fechaNacimiento) };
    const huellaSolicitud = await huellaDeSolicitud({ credencial: normalizarCredencial(args.credencial), datos,
      parentesco: args.parentesco, versionDocumento: args.versionDocumento });
    const anterior = await ctx.db.query("vinculoRepresentacion")
      .withIndex("por_representante_solicitud", (q) => q.eq("representanteId", representante._id).eq("solicitudId", args.solicitudId)).unique();
    if (anterior) {
      if (anterior.huellaSolicitud !== huellaSolicitud) throw new ErrorDominio("CONFLICTO", "Esta solicitud ya se usó con otros datos.");
      await exigirVinculo(ctx, anterior.estudianteId);
      const estudiante = await ctx.db.get("estudiante", anterior.estudianteId);
      if (!estudiante) throw new ErrorDominio("NO_ENCONTRADO", "El registro ya no está disponible.");
      return { estudianteId: estudiante._id, estadoVerificacion: estudiante.estadoVerificacion };
    }
    if (args.versionDocumento !== VERSION_CONSENTIMIENTO) {
      throw new ErrorDominio("CONSENTIMIENTO_DESACTUALIZADO", "Lee y acepta la versión vigente del consentimiento.");
    }
    const { invitacion, institucion } = await buscarInvitacion(ctx, args.credencial);
    await exigirDocumentoEstudianteDisponible(ctx, institucion._id, datos.tipoDocumento, datos.numeroDocumento);
    const ahora = Date.now();
    const estudianteId = await ctx.db.insert("estudiante", {
      ...datos, institucionId: institucion._id, origenRegistro: "REPRESENTANTE",
      estadoVerificacion: "PENDIENTE", estado: "ACTIVO", actualizadoEn: ahora,
    });
    // El estudiante acaba de crearse en esta misma mutation: no puede tener otro vínculo.
    await ctx.db.insert("vinculoRepresentacion", {
      representanteId: representante._id, estudianteId, parentesco: args.parentesco,
      invitacionCursoId: invitacion._id, solicitudId: args.solicitudId, huellaSolicitud,
      estado: "ACTIVO", vigenteDesde: hoyEnGuayaquil(ahora), actualizadoEn: ahora,
    });
    await ctx.db.insert("consentimiento", {
      perfilUsuarioId: representante.perfilUsuarioId, estudianteId, tipo: "TRATAMIENTO_DATOS_MENOR",
      versionDocumento: args.versionDocumento, otorgado: true, otorgadoEn: ahora,
    });
    const usosRealizados = invitacion.usosRealizados + 1;
    await ctx.db.patch("invitacionCurso", invitacion._id, { usosRealizados, actualizadoEn: ahora,
      estado: invitacion.usosMaximos !== undefined && usosRealizados >= invitacion.usosMaximos ? "AGOTADA" : "PENDIENTE" });
    return { estudianteId, estadoVerificacion: "PENDIENTE" as const };
  }),
});

async function vinculoDelCurso(ctx: QueryCtx, estudianteId: Id<"estudiante">, cursoId: Id<"curso">) {
  const vinculo = await ctx.db.query("vinculoRepresentacion").withIndex("por_estudiante_estado", (q) =>
    q.eq("estudianteId", estudianteId).eq("estado", "ACTIVO")).unique();
  const invitacion = vinculo?.invitacionCursoId ? await ctx.db.get("invitacionCurso", vinculo.invitacionCursoId) : null;
  return invitacion?.cursoId === cursoId ? vinculo : null;
}

function exigirTamanoPagina(numItems: number) {
  if (!Number.isInteger(numItems) || numItems < 1 || numItems > 100) {
    throw new ErrorDominio("VALIDACION", "Solicita entre 1 y 100 estudiantes por página.");
  }
}

function presentarEstudiante(estudiante: Doc<"estudiante">) {
  return { estudianteId: estudiante._id, nombres: estudiante.nombres, apellidos: estudiante.apellidos,
    tipoDocumento: estudiante.tipoDocumento, numeroDocumento: estudiante.numeroDocumento,
    fechaNacimiento: estudiante.fechaNacimiento ?? null, estadoVerificacion: estudiante.estadoVerificacion };
}

/** La página puede quedar vacía al filtrar otro curso de la misma institución: seguir el cursor. */
export const listarPendientes = query({
  args: { cursoId: v.id("curso"), paginationOpts: paginationOptsValidator },
  handler: (ctx, args) => conErroresPublicos(async () => {
    await exigirTitularDelCurso(ctx, args.cursoId);
    exigirTamanoPagina(args.paginationOpts.numItems);
    const { institucion } = await contextoCurso(ctx, args.cursoId);
    const resultado = await ctx.db.query("estudiante").withIndex("por_verificacion", (q) =>
      q.eq("institucionId", institucion._id).eq("estadoVerificacion", "PENDIENTE")).paginate(args.paginationOpts);
    const page = [];
    for (const estudiante of resultado.page) {
      if (estudiante.estado === "ACTIVO" && await vinculoDelCurso(ctx, estudiante._id, args.cursoId)) {
        page.push(presentarEstudiante(estudiante));
      }
    }
    return { ...resultado, page };
  }),
});

export const listarEstudiantes = query({
  args: { cursoId: v.id("curso"), paginationOpts: paginationOptsValidator },
  handler: (ctx, args) => conErroresPublicos(async () => {
    await exigirTitularDelCurso(ctx, args.cursoId);
    exigirTamanoPagina(args.paginationOpts.numItems);
    const { institucion } = await contextoCurso(ctx, args.cursoId);
    const resultado = await ctx.db.query("matricula").withIndex("por_curso_estado", (q) =>
      q.eq("cursoId", args.cursoId).eq("estado", "CURSANDO")).paginate(args.paginationOpts);
    const page = [];
    for (const matricula of resultado.page) {
      const estudiante = await ctx.db.get("estudiante", matricula.estudianteId);
      if (estudiante && estudiante.institucionId === institucion._id && estudiante.estado === "ACTIVO" && estudiante.estadoVerificacion === "APROBADO") {
        page.push({ ...presentarEstudiante(estudiante), matriculaId: matricula._id, numeroLista: matricula.numeroLista ?? null });
      }
    }
    return { ...resultado, page };
  }),
});

export const aprobarEstudiante = mutation({
  args: {
    cursoId: v.id("curso"), estudianteId: v.id("estudiante"),
    correcciones: v.optional(v.object({
      nombres: v.optional(v.string()), apellidos: v.optional(v.string()),
      tipoDocumento: v.optional(tipoDocumentoEstudiante), numeroDocumento: v.optional(v.string()),
      fechaNacimiento: v.optional(v.union(v.string(), v.null())),
    })),
  },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const docente = await exigirTitularDelCurso(ctx, args.cursoId);
    const contexto = await contextoCurso(ctx, args.cursoId);
    exigirCursoActivo(contexto);
    // Un pendiente aún no tiene matrícula: el curso se demuestra por su invitación.
    const vinculo = await vinculoDelCurso(ctx, args.estudianteId, args.cursoId);
    if (!vinculo) throw new ErrorPermiso("SIN_PERMISO", "Este estudiante no está vinculado a este curso.");
    const estudiante = await ctx.db.get("estudiante", args.estudianteId);
    if (!estudiante || estudiante.institucionId !== contexto.institucion._id || estudiante.estado !== "ACTIVO") {
      throw new ErrorPermiso("SIN_PERMISO", "Este estudiante no está vinculado a este curso.");
    }
    const correcciones = args.correcciones ?? {};
    if ((correcciones.tipoDocumento === undefined) !== (correcciones.numeroDocumento === undefined)) {
      throw new ErrorDominio("VALIDACION", "Para corregir el documento, envía tipo y número juntos.");
    }
    const cambios = {
      nombres: correcciones.nombres === undefined ? estudiante.nombres : validarNombre(correcciones.nombres, "Los nombres"),
      apellidos: correcciones.apellidos === undefined ? estudiante.apellidos : validarNombre(correcciones.apellidos, "Los apellidos"),
      tipoDocumento: correcciones.tipoDocumento ?? estudiante.tipoDocumento,
      numeroDocumento: correcciones.tipoDocumento === undefined ? estudiante.numeroDocumento : normalizarDocumento(correcciones.tipoDocumento, correcciones.numeroDocumento!),
      fechaNacimiento: correcciones.fechaNacimiento === null ? undefined : correcciones.fechaNacimiento === undefined ? estudiante.fechaNacimiento : validarNacimiento(correcciones.fechaNacimiento),
    };
    const vigente = await ctx.db.query("matricula").withIndex("por_estudiante_estado", (q) =>
      q.eq("estudianteId", estudiante._id).eq("estado", "CURSANDO")).unique();
    if (estudiante.estadoVerificacion === "APROBADO") {
      if (vigente?.cursoId === args.cursoId && Object.entries(cambios).every(([clave, valor]) => estudiante[clave as keyof typeof cambios] === valor)) {
        return { estudianteId: estudiante._id, matriculaId: vigente._id };
      }
      throw new ErrorDominio("CONFLICTO", "El estudiante ya fue aprobado. No se modifica mediante otra aprobación.");
    }
    if (estudiante.estadoVerificacion !== "PENDIENTE" || vigente) throw new ErrorDominio("CONFLICTO", "El estudiante ya no está pendiente de aprobación.");
    const historica = await ctx.db.query("matricula").withIndex("por_estudiante_curso", (q) =>
      q.eq("estudianteId", estudiante._id).eq("cursoId", args.cursoId)).unique();
    if (historica) throw new ErrorDominio("CONFLICTO", "Ya existe una matrícula para este estudiante y curso.");
    await exigirDocumentoEstudianteDisponible(ctx, estudiante.institucionId, cambios.tipoDocumento, cambios.numeroDocumento, estudiante._id);
    const representante = await ctx.db.get("representante", vinculo.representanteId);
    const consentimiento = representante ? await ctx.db.query("consentimiento").withIndex("por_usuario_tipo", (q) =>
      q.eq("perfilUsuarioId", representante.perfilUsuarioId).eq("tipo", "TRATAMIENTO_DATOS_MENOR"))
      .filter((q) => q.eq(q.field("estudianteId"), estudiante._id)).order("desc").first() : null;
    if (!consentimiento?.otorgado || consentimiento.revocadoEn !== undefined) {
      throw new ErrorDominio("CONSENTIMIENTO_REQUERIDO", "El estudiante necesita consentimiento vigente.");
    }
    const hoy = hoyEnGuayaquil();
    const periodos = await ctx.db.query("periodoAcademico").withIndex("por_anio_orden", (q) => q.eq("anioLectivoId", contexto.anio._id)).take(4);
    const aplicables = periodos.filter((p) => p.estado !== "CERRADO" && p.fechaFin >= hoy);
    if (periodos.length > 3 || aplicables.length === 0) {
      throw new ErrorDominio("PERIODO_NO_VIGENTE", "Define los parciales vigentes o próximos antes de aprobar estudiantes.");
    }
    const limite = await limiteDelDocente(ctx, docente.perfilUsuarioId, Date.now(), "estudiantesPorCurso");
    const matriculados = await ctx.db.query("matricula").withIndex("por_curso_estado", (q) =>
      q.eq("cursoId", args.cursoId).eq("estado", "CURSANDO")).take(limite);
    if (matriculados.length >= limite) throw new ErrorDominio("LIMITE_PLAN", `Tu plan permite hasta ${limite} estudiantes por curso.`);
    const ahora = Date.now();
    const matriculaId = await ctx.db.insert("matricula", { estudianteId: estudiante._id, cursoId: args.cursoId,
      fechaIngreso: hoy, estado: "CURSANDO", actualizadoEn: ahora });
    // Cada parcial aplicable empieza en 60; no se crea historia en parciales ya terminados.
    for (const periodo of aplicables) {
      await ctx.db.insert("puntajePeriodo", { matriculaId, periodoAcademicoId: periodo._id,
        puntajeBase: REGLAS.PUNTAJE_BASE, puntosPositivos: 0, puntosNegativos: 0,
        puntajeActual: REGLAS.PUNTAJE_BASE, congelado: false, recalculadoEn: ahora });
    }
    await ctx.db.patch("estudiante", estudiante._id, { ...cambios, estadoVerificacion: "APROBADO",
      aprobadoPorDocenteId: docente._id, aprobadoEn: ahora, actualizadoEn: ahora });
    await auditar(ctx, { accion: "APROBAR", entidadTipo: "estudiante", entidadId: estudiante._id,
      institucionId: estudiante.institucionId,
      datosAntes: { estadoVerificacion: estudiante.estadoVerificacion },
      datosDespues: { estadoVerificacion: "APROBADO", cursoId: args.cursoId, matriculaId } });
    return { estudianteId: estudiante._id, matriculaId };
  }),
});

/** El representante recupera sus hijos y su estado después de cerrar la app. */
export const listarMisEstudiantes = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const representante = await exigirRepresentante(ctx);
    exigirTamanoPagina(args.paginationOpts.numItems);
    const resultado = await ctx.db.query("vinculoRepresentacion").withIndex("por_representante_estado", (q) =>
      q.eq("representanteId", representante._id).eq("estado", "ACTIVO")).paginate(args.paginationOpts);
    const page = [];
    for (const vinculo of resultado.page) {
      await exigirVinculo(ctx, vinculo.estudianteId);
      const estudiante = await ctx.db.get("estudiante", vinculo.estudianteId);
      if (!estudiante || estudiante.estado !== "ACTIVO") continue;
      const matricula = await ctx.db.query("matricula").withIndex("por_estudiante_estado", (q) =>
        q.eq("estudianteId", estudiante._id).eq("estado", "CURSANDO")).unique();
      // Un pendiente aún no tiene matrícula. Un aprobado sin matrícula vigente
      // ya no es legible por el representante, aunque conserve un vínculo activo.
      if (!matricula && estudiante.estadoVerificacion !== "PENDIENTE") continue;
      const invitacion = vinculo.invitacionCursoId ? await ctx.db.get("invitacionCurso", vinculo.invitacionCursoId) : null;
      page.push({ ...presentarEstudiante(estudiante), matriculaId: matricula?._id ?? null,
        cursoId: matricula?.cursoId ?? invitacion?.cursoId ?? null });
    }
    return { ...resultado, page };
  }),
});

/** Calendario del curso para mostrar parciales definidos aunque aún estén planificados. */
export const obtenerCalendarioCurso = query({
  args: { cursoId: v.id("curso") },
  handler: (ctx, args) => conErroresPublicos(async () => {
    await exigirTitularDelCurso(ctx, args.cursoId);
    const { anio } = await contextoCurso(ctx, args.cursoId);
    const periodos = await ctx.db.query("periodoAcademico")
      .withIndex("por_anio_orden", (q) => q.eq("anioLectivoId", anio._id)).take(4);
    return { fechaInicio: anio.fechaInicio, fechaFin: anio.fechaFin, periodos: periodos.map((p) => ({
      id: p._id, nombre: p.nombre, orden: p.orden, fechaInicio: p.fechaInicio, fechaFin: p.fechaFin, estado: p.estado,
    })) };
  }),
});
