/**
 * Módulo núcleo — cursos, calendario y vinculación.
 *
 * Este primer bloque implementa la creación del curso y la definición de sus
 * parciales. Todas las comprobaciones y escrituras ocurren en una sola mutation
 * para conservar las garantías transaccionales de Convex.
 */

import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { JORNADA, REGLAS } from "./lib/enums";
import { ErrorDominio, exigirRangoFechas, hoyEnGuayaquil } from "./lib/guardas";
import { ErrorPermiso, exigirDocente, exigirTitularDelCurso, perfilActual } from "./lib/permisos";
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

function limiteConfigurado(plan: Doc<"plan">, limitePorDefecto: number): number {
  if (typeof plan.limites !== "object" || plan.limites === null) return limitePorDefecto;
  const cursosActivos = (plan.limites as Record<string, unknown>).cursosActivos;
  return typeof cursosActivos === "number" && Number.isInteger(cursosActivos) && cursosActivos > 0
    ? cursosActivos
    : limitePorDefecto;
}

async function limiteCursosDelDocente(
  ctx: QueryCtx,
  perfilUsuarioId: Doc<"perfilUsuario">["_id"],
  ahora: number = Date.now(),
): Promise<number> {
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
      return limiteConfigurado(plan, REGLAS.CURSOS_DOCENTE_PRO);
    }
  }

  const planGratuito = await ctx.db
    .query("plan")
    .withIndex("por_codigo", (q) => q.eq("codigo", "DOC_FREE"))
    .unique();
  if (planGratuito?.audiencia === "DOCENTE" && planGratuito.activo) {
    return limiteConfigurado(planGratuito, REGLAS.CURSOS_DOCENTE_FREE);
  }
  return REGLAS.CURSOS_DOCENTE_FREE;
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
    const limitePlan = await limiteCursosDelDocente(ctx, docente.perfilUsuarioId);

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
  handler: async (ctx, args) => {
    const docente = await exigirDocente(ctx);
    const cursosActivos = await cursosActivosDelDocente(ctx, docente._id);
    const limitePlan = await limiteCursosDelDocente(ctx, docente.perfilUsuarioId);
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
  },
});

/** Define de dos a tres parciales no solapados dentro del año lectivo. */
export const definirPeriodos = mutation({
  args: {
    cursoId: v.id("curso"),
    periodos: v.array(periodo),
  },
  handler: async (ctx, args) => {
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
  },
});
