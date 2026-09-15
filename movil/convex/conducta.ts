import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { ALCANCE_COMUNICADO, ENTITLEMENTS, ESTADO_ASISTENCIA, REGLAS, TIPO_COMUNICADO } from "./lib/enums";
import { ErrorDominio, exigirAlcanceCoherente, exigirDuracionNota, exigirFechaEvento, exigirRangoTipoAccion, exigirSignoCoherente, exigirTopeDiario, exigirVentanaComunicado, calcularPuntaje, hoyEnGuayaquil, sumarDias } from "./lib/guardas";
import { ErrorPermiso, auditar, exigirAccesoDocenteAEstudiante, exigirDocente, exigirTitularDelCurso, exigirVinculo } from "./lib/permisos";
import { tieneAccesoVigente } from "./lib/revenuecat";

const estadoAsistencia = v.union(...ESTADO_ASISTENCIA.map((estado) => v.literal(estado)));
const tipoComunicado = v.union(...TIPO_COMUNICADO.map((tipo) => v.literal(tipo)));
const alcanceComunicado = v.union(...ALCANCE_COMUNICADO.map((alcance) => v.literal(alcance)));

/** Traduce fallos esperados al formato que entiende el cliente. */
async function conErroresPublicos<T>(operacion: () => Promise<T>): Promise<T> {
  try { return await operacion(); }
  catch (error) {
    if (error instanceof ErrorDominio || error instanceof ErrorPermiso) {
      throw new ConvexError({ codigo: error.codigo, mensaje: error.message });
    }
    throw error;
  }
}

async function franjaDe(ctx: MutationCtx, puntaje: number): Promise<Id<"franjaConducta"> | undefined> {
  const franjas = await ctx.db.query("franjaConducta").collect();
  return franjas.find((f) => puntaje >= f.puntajeDesde && puntaje <= f.puntajeHasta)?._id;
}

/** ADR-005: el puntaje es una caché que siempre se reconstruye desde acciones VIGENTES. */
export async function recalcularPuntaje(
  ctx: MutationCtx,
  matriculaId: Id<"matricula">,
  periodoAcademicoId: Id<"periodoAcademico">,
): Promise<number | null> {
  const fila = await ctx.db.query("puntajePeriodo")
    .withIndex("por_matricula_periodo", (q) => q.eq("matriculaId", matriculaId).eq("periodoAcademicoId", periodoAcademicoId))
    .unique();
  if (fila === null || fila.congelado) return fila?.puntajeActual ?? null;
  const acciones = await ctx.db.query("accionRegistrada")
    .withIndex("por_matricula_periodo", (q) => q.eq("matriculaId", matriculaId).eq("periodoAcademicoId", periodoAcademicoId).eq("estado", "VIGENTE"))
    .collect();
  const puntos = acciones.map((a) => a.puntosAplicados);
  const { institucion } = await institucionDeMatricula(ctx, matriculaId);
  const puntajeActual = calcularPuntaje(
    puntos,
    fila.puntajeBase,
    institucion.puntajeMinimo,
    institucion.puntajeMaximo,
  );
  await ctx.db.patch(fila._id, {
    puntosPositivos: puntos.filter((p) => p > 0).reduce((a, b) => a + b, 0),
    puntosNegativos: puntos.filter((p) => p < 0).reduce((a, b) => a + b, 0),
    puntajeActual,
    franjaConductaId: await franjaDe(ctx, puntajeActual),
    recalculadoEn: Date.now(),
  });
  return puntajeActual;
}

async function institucionDeMatricula(ctx: MutationCtx, matriculaId: Id<"matricula">) {
  const matricula = await ctx.db.get(matriculaId);
  if (matricula === null) throw new ErrorDominio("NO_ENCONTRADO", "La matrícula no existe.");
  const curso = await ctx.db.get(matricula.cursoId);
  if (curso === null) throw new ErrorDominio("NO_ENCONTRADO", "El curso no existe.");
  const anio = await ctx.db.get(curso.anioLectivoId);
  if (anio === null) throw new ErrorDominio("NO_ENCONTRADO", "El año lectivo no existe.");
  const institucion = await ctx.db.get(anio.institucionId);
  if (institucion === null) throw new ErrorDominio("NO_ENCONTRADO", "La institución no existe.");
  return { matricula, curso, anio, institucion };
}

/**
 * Rescatada de la version que #39 dejo en `main`: sin esto `fechaOcurrencia`
 * entra sin validar y `"2026-02-31"` o `"hola"` se guardan tal cual, y ademas
 * van al indice `por_matricula_fecha`. La rama de conducta nacio antes de que
 * #39 se fusionara, asi que la perdio.
 */
function exigirFechaDeCalendario(fecha: string): Date {
  const dia = new Date(`${fecha}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
      !Number.isFinite(dia.getTime()) || dia.toISOString().slice(0, 10) !== fecha) {
    throw new ErrorDominio("FECHAS_INVALIDAS", "La fecha de ocurrencia debe ser una fecha válida con formato YYYY-MM-DD.");
  }
  return dia;
}

export const registrarAccion = mutation({
  args: { estudianteId: v.id("estudiante"), tipoAccionId: v.id("tipoAccion"), descripcion: v.string(), puntosAplicados: v.number(), fechaOcurrencia: v.optional(v.string()) },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const { docente, matricula } = await exigirAccesoDocenteAEstudiante(ctx, args.estudianteId);
    const { curso, anio, institucion } = await institucionDeMatricula(ctx, matricula._id);
    // La fecha se resuelve antes que el periodo, porque el periodo se elige
    // **por la fecha**: tomar cualquiera EN_CURSO archivaba una accion fechada
    // en 1900 o en octubre dentro del parcial de hoy.
    const fecha = args.fechaOcurrencia ?? hoyEnGuayaquil();
    const dia = exigirFechaDeCalendario(fecha);

    const periodo = await ctx.db.query("periodoAcademico")
      .withIndex("por_anio_orden", (q) => q.eq("anioLectivoId", curso.anioLectivoId))
      .filter((q) => q.and(
        q.eq(q.field("estado"), "EN_CURSO"),
        q.lte(q.field("fechaInicio"), fecha),
        q.gte(q.field("fechaFin"), fecha),
      )).first();
    if (periodo === null) throw new ErrorDominio("PERIODO_CERRADO", "No hay un período académico en curso para registrar acciones.");
    const descripcion = args.descripcion.trim();
    if (!descripcion) throw new ErrorDominio("VALIDACION", "La descripción de la acción es obligatoria.");
    // El tipo tiene que ser de esta institucion, no solo existir: sin esa
    // comprobacion un docente puede aplicar el catalogo de otro plantel.
    const tipo = await ctx.db.get(args.tipoAccionId);
    if (
      tipo === null || !tipo.activa ||
      (tipo.institucionId !== undefined && tipo.institucionId !== institucion._id)
    ) {
      throw new ErrorDominio("VALIDACION", "Tipo de acción inválido o inactivo.");
    }

    const categoria = await ctx.db.get(tipo.categoriaAccionId);
    if (
      !categoria || !categoria.activa ||
      (categoria.institucionId !== undefined && categoria.institucionId !== institucion._id)
    ) {
      throw new ErrorDominio("VALIDACION", "Categoría de acción inválida o inactiva.");
    }

    // `Number.isInteger` primero, y no la comparacion de rango: con `NaN`
    // **las dos comparaciones son falsas**, asi que un NaN atravesaba el
    // rango entero y se guardaba como puntaje. Un solo NaN envenena el
    // puntaje derivado del periodo para siempre, porque `calcularPuntaje`
    // suma sobre las acciones vigentes. Vale para 1.5 e Infinity igual.
    if (!Number.isInteger(args.puntosAplicados)) {
      throw new ErrorDominio("VALIDACION", "Los puntos aplicados deben ser un número entero.");
    }
    exigirSignoCoherente(tipo.signo, tipo.puntosMin, tipo.puntosMax);
    exigirRangoTipoAccion(tipo.puntosMin, args.puntosAplicados, tipo.puntosMax);

    // Fin de semana o dia marcado como no lectivo: no se anota conducta un
    // dia en que el estudiante no estuvo en clase.
    const diaNoLectivo = await ctx.db
      .query("diaNoLectivo")
      .withIndex("por_anio_fecha", (q) => q.eq("anioLectivoId", curso.anioLectivoId).eq("fecha", fecha))
      .first();
    if (dia.getUTCDay() === 0 || dia.getUTCDay() === 6 || diaNoLectivo) {
      throw new ErrorDominio("DIA_NO_LECTIVO", "Solo se pueden registrar acciones en días de clase.");
    }
    const hoy = await ctx.db.query("accionRegistrada").withIndex("por_matricula_fecha", (q) => q.eq("matriculaId", matricula._id).eq("fechaOcurrencia", fecha)).collect();
    exigirTopeDiario(hoy.filter((a) => a.estado === "VIGENTE" && a.signo === tipo.signo).reduce((s, a) => s + a.puntosAplicados, 0), args.puntosAplicados);

    // El puntaje congelado se comprueba **antes** de escribir nada. `congelado`
    // existe para que un parcial cerrado no se pueda mover, y leerlo despues
    // del insert dejaba la accion guardada contra un puntaje que ya no
    // admitia cambios: el total decia una cosa y la bitacora otra.
    const fila = await ctx.db.query("puntajePeriodo").withIndex("por_matricula_periodo", (q) => q.eq("matriculaId", matricula._id).eq("periodoAcademicoId", periodo._id)).unique();
    if (fila?.congelado) {
      throw new ErrorDominio("PERIODO_CERRADO", "El puntaje de este período ya está cerrado.");
    }

    const id = await ctx.db.insert("accionRegistrada", { matriculaId: matricula._id, periodoAcademicoId: periodo._id, tipoAccionId: tipo._id, categoriaAccionId: tipo.categoriaAccionId, signo: tipo.signo, puntosAplicados: args.puntosAplicados, cuentaEnBitacora: tipo.cuentaEnBitacora, descripcion, fechaOcurrencia: fecha, registradaPorDocenteId: docente._id, estado: "VIGENTE", actualizadoEn: Date.now() });
    if (fila === null) {
      const actual = calcularPuntaje([args.puntosAplicados], institucion.puntajeBase, institucion.puntajeMinimo, institucion.puntajeMaximo);
      await ctx.db.insert("puntajePeriodo", { matriculaId: matricula._id, periodoAcademicoId: periodo._id, puntajeBase: institucion.puntajeBase, puntosPositivos: args.puntosAplicados > 0 ? args.puntosAplicados : 0, puntosNegativos: args.puntosAplicados < 0 ? args.puntosAplicados : 0, puntajeActual: actual, franjaConductaId: await franjaDe(ctx, actual), congelado: false, recalculadoEn: Date.now() });
    } else await recalcularPuntaje(ctx, matricula._id, periodo._id);
    await auditar(ctx, { accion: "CREAR", entidadTipo: "accionRegistrada", entidadId: id, institucionId: anio.institucionId, datosDespues: { matriculaId: matricula._id, tipoAccionId: tipo._id, puntosAplicados: args.puntosAplicados, fechaOcurrencia: fecha } });
    return id;
  }),
});

/** Cuantos dias hacia atras enseña la lista de anotaciones recientes. */
const DIAS_ANOTACIONES_RECIENTES = 7;

/**
 * Las anotaciones del curso de los ultimos dias, para que el docente pueda
 * revisarlas y deshacer las que puso por error.
 *
 * ## Por que existe
 *
 * `anularAccion` estaba escrita, probada y auditando ANULAR, y **ninguna
 * pantalla la llamaba**: no habia ninguna consulta con la que un docente
 * viera las anotaciones que ya puso. Un docente que anotaba al estudiante
 * equivocado no tenia forma de verlo ni de corregirlo. El error se quedaba en
 * el expediente de un menor hasta que la familia reclamara.
 *
 * ## Por que no hace falta un indice nuevo
 *
 * `accionRegistrada` solo esta indexada por matricula. En vez de añadir un
 * indice por docente -- que tocaria `schema.ts` y pediria tres firmas -- se
 * recorren las matriculas vigentes del curso con `por_matricula_fecha` y una
 * ventana de siete dias. Con un curso de cuarenta son cuarenta lecturas
 * acotadas por fecha, que es lo mismo que ya hace `asistenciaDelDia`.
 */
export const anotacionesRecientesDelCurso = query({
  args: { cursoId: v.id("curso") },
  handler: (ctx, args) => conErroresPublicos(async () => {
    await exigirTitularDelCurso(ctx, args.cursoId);
    const desde = sumarDias(hoyEnGuayaquil(), -DIAS_ANOTACIONES_RECIENTES);

    const matriculas = await ctx.db.query("matricula")
      .withIndex("por_curso_estado", (q) => q.eq("cursoId", args.cursoId).eq("estado", "CURSANDO"))
      .collect();

    const filas = [];
    for (const matricula of matriculas) {
      const acciones = await ctx.db.query("accionRegistrada")
        .withIndex("por_matricula_fecha", (q) => q.eq("matriculaId", matricula._id).gte("fechaOcurrencia", desde))
        .collect();
      if (acciones.length === 0) continue;
      const estudiante = await ctx.db.get(matricula.estudianteId);
      for (const accion of acciones) {
        const tipo = await ctx.db.get(accion.tipoAccionId);
        filas.push({
          id: accion._id,
          estudiante: estudiante ? `${estudiante.nombres} ${estudiante.apellidos}` : "Estudiante",
          tipo: tipo?.nombre ?? "Anotación",
          signo: accion.signo,
          puntos: accion.puntosAplicados,
          descripcion: accion.descripcion,
          fecha: accion.fechaOcurrencia,
          estado: accion.estado,
          // Lo decide el servidor con la misma regla que `anularAccion`, para
          // que la pantalla no ofrezca un boton que despues se rechaza.
          anulable: accion.signo === "NEGATIVA" && accion.estado === "VIGENTE",
          creadaEn: accion._creationTime,
        });
      }
    }
    // Lo ultimo que se anoto primero: es lo que un docente revisa justo
    // despues de equivocarse.
    return filas.sort((a, b) => b.creadaEn - a.creadaEn);
  }),
});

export const anularAccion = mutation({
  args: { accionRegistradaId: v.id("accionRegistrada"), motivo: v.string() },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const accion = await ctx.db.get(args.accionRegistradaId);
    if (accion === null) throw new ErrorDominio("NO_ENCONTRADO", "Esa anotación no existe.");
    const { matricula, institucion } = await institucionDeMatricula(ctx, accion.matriculaId);
    const { docente } = await exigirAccesoDocenteAEstudiante(ctx, matricula.estudianteId);
    const motivo = args.motivo.trim();
    if (!motivo) throw new ErrorDominio("VALIDACION", "Debes indicar el motivo de la anulación.");
    if (accion.signo !== "NEGATIVA") throw new ErrorDominio("VALIDACION", "Solo se pueden anular las anotaciones negativas.");
    if (accion.estado !== "VIGENTE") throw new ErrorDominio("CONFLICTO", "Esa anotación ya fue anulada o modificada.");
    const ahora = Date.now();
    await ctx.db.patch(accion._id, { estado: "ANULADA", resueltaPorDocenteId: docente._id, resueltaEn: ahora, motivoResolucion: motivo, actualizadoEn: ahora });
    await recalcularPuntaje(ctx, matricula._id, accion.periodoAcademicoId);
    await auditar(ctx, { accion: "ANULAR", entidadTipo: "accionRegistrada", entidadId: accion._id, institucionId: institucion._id, datosAntes: { estado: "VIGENTE", puntosAplicados: accion.puntosAplicados }, datosDespues: { estado: "ANULADA", motivo } });
    return accion._id;
  }),
});

/** Registra el curso completo en una sola transacción; repetir el día corrige, no duplica. */
export const tomarAsistencia = mutation({
  args: {
    cursoId: v.id("curso"),
    fecha: v.optional(v.string()),
    marcas: v.array(v.object({
      estudianteId: v.id("estudiante"),
      estado: estadoAsistencia,
      observacion: v.optional(v.string()),
    })),
  },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const docente = await exigirTitularDelCurso(ctx, args.cursoId);
    const fecha = args.fecha ?? hoyEnGuayaquil();
    if (fecha > hoyEnGuayaquil()) {
      throw new ErrorDominio("FECHAS_INVALIDAS", "No se puede tomar asistencia de un día futuro.");
    }
    if (new Set(args.marcas.map((marca) => marca.estudianteId)).size !== args.marcas.length) {
      throw new ErrorDominio("VALIDACION", "Un estudiante solo puede tener una marca por día.");
    }
    const curso = await ctx.db.get(args.cursoId);
    if (curso === null) throw new ErrorDominio("NO_ENCONTRADO", "El curso no existe.");
    const periodo = await ctx.db.query("periodoAcademico")
      .withIndex("por_anio_orden", (q) => q.eq("anioLectivoId", curso.anioLectivoId))
      .filter((q) => q.eq(q.field("estado"), "EN_CURSO"))
      .first();
    if (periodo === null) throw new ErrorDominio("PERIODO_NO_VIGENTE", "No hay un parcial en curso.");

    let creadas = 0;
    let actualizadas = 0;
    const ahora = Date.now();
    for (const marca of args.marcas) {
      const { matricula } = await exigirAccesoDocenteAEstudiante(ctx, marca.estudianteId);
      if (matricula.cursoId !== args.cursoId) {
        throw new ErrorDominio("VALIDACION", "Ese estudiante no pertenece a este curso.");
      }
      const previa = await ctx.db.query("registroAsistencia")
        .withIndex("por_matricula_fecha", (q) => q.eq("matriculaId", matricula._id).eq("fecha", fecha))
        .unique();
      const datos = {
        estado: marca.estado,
        observacion: marca.observacion?.trim() || undefined,
        registradoPorDocenteId: docente._id,
        actualizadoEn: ahora,
      };
      if (previa === null) {
        await ctx.db.insert("registroAsistencia", {
          matriculaId: matricula._id,
          periodoAcademicoId: periodo._id,
          fecha,
          ...datos,
        });
        creadas++;
      } else {
        await ctx.db.patch(previa._id, datos);
        actualizadas++;
      }
    }
    return { creadas, actualizadas, fecha };
  }),
});

export const asistenciaDelDia = query({
  args: { cursoId: v.id("curso"), fecha: v.optional(v.string()) },
  handler: (ctx, args) => conErroresPublicos(async () => {
    await exigirTitularDelCurso(ctx, args.cursoId);
    const fecha = args.fecha ?? hoyEnGuayaquil();
    const matriculas = await ctx.db.query("matricula")
      .withIndex("por_curso_estado", (q) => q.eq("cursoId", args.cursoId).eq("estado", "CURSANDO"))
      .collect();
    const estudiantes = await Promise.all(matriculas.map(async (matricula) => {
      const estudiante = await ctx.db.get(matricula.estudianteId);
      if (estudiante === null) return null;
      const marca = await ctx.db.query("registroAsistencia")
        .withIndex("por_matricula_fecha", (q) => q.eq("matriculaId", matricula._id).eq("fecha", fecha))
        .unique();
      return {
        estudianteId: estudiante._id,
        nombres: estudiante.nombres,
        apellidos: estudiante.apellidos,
        estado: marca?.estado ?? null,
        observacion: marca?.observacion ?? null,
      };
    }));
    return {
      fecha,
      estudiantes: estudiantes.filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => a.apellidos.localeCompare(b.apellidos)),
    };
  }),
});

async function plantillaActiva(ctx: QueryCtx | MutationCtx) {
  const plantilla = await ctx.db.query("plantillaReporte")
    .withIndex("por_institucion", (q) => q.eq("institucionId", undefined).eq("activa", true))
    .first();
  if (plantilla === null) throw new ErrorDominio("NO_ENCONTRADO", "No hay plantilla de reporte.");
  return plantilla;
}

export const camposDelReporte = query({
  args: {},
  handler: (ctx) => conErroresPublicos(async () => {
    await exigirDocente(ctx);
    // No se acepta una plantilla desde el cliente: la vigente es la fuente de verdad.
    const plantilla = await plantillaActiva(ctx);
    const campos = await ctx.db.query("plantillaCampo")
      .withIndex("por_plantilla_codigo", (q) => q.eq("plantillaReporteId", plantilla._id)).collect();
    return { plantillaReporteId: plantilla._id, campos: campos.filter((c) => c.activo).sort((a, b) => a.orden - b.orden)
      .map((c) => ({ id: c._id, codigo: c.codigo, etiqueta: c.etiqueta, tipoDato: c.tipoDato, textoAyuda: c.textoAyuda ?? null, longitudMaxima: c.longitudMaxima ?? null })) };
  }),
});

async function periodoDelCurso(ctx: QueryCtx | MutationCtx, cursoId: Id<"curso">) {
  const curso = await ctx.db.get(cursoId);
  if (curso === null) throw new ErrorDominio("NO_ENCONTRADO", "El curso no existe.");
  const periodo = await ctx.db.query("periodoAcademico")
    .withIndex("por_anio_orden", (q) => q.eq("anioLectivoId", curso.anioLectivoId))
    .filter((q) => q.eq(q.field("estado"), "EN_CURSO")).first();
  if (periodo === null) throw new ErrorDominio("PERIODO_NO_VIGENTE", "No hay un parcial en curso.");
  return periodo;
}

export const guardarReporteGeneral = mutation({
  args: { cursoId: v.id("curso"), fecha: v.optional(v.string()), valores: v.array(v.object({ plantillaCampoId: v.id("plantillaCampo"), valorTexto: v.string() })) },
  handler: (ctx, args) => conErroresPublicos(async () => {
    await exigirTitularDelCurso(ctx, args.cursoId);
    const fecha = args.fecha ?? hoyEnGuayaquil();
    const periodo = await periodoDelCurso(ctx, args.cursoId);
    let reporte = await ctx.db.query("reporteGeneral")
      .withIndex("por_curso_fecha", (q) => q.eq("cursoId", args.cursoId).eq("fecha", fecha)).unique();
    if (reporte !== null && reporte.estado !== "BORRADOR") {
      throw new ErrorDominio("CONFLICTO", "El reporte de ese día ya fue publicado.");
    }
    if (reporte === null) {
      const plantilla = await plantillaActiva(ctx);
      const id = await ctx.db.insert("reporteGeneral", { cursoId: args.cursoId, periodoAcademicoId: periodo._id, plantillaReporteId: plantilla._id, fecha, estado: "BORRADOR", actualizadoEn: Date.now() });
      reporte = (await ctx.db.get(id))!;
    }
    for (const valor of args.valores) {
      const campo = await ctx.db.get(valor.plantillaCampoId);
      if (campo === null || campo.plantillaReporteId !== reporte.plantillaReporteId || !campo.activo) {
        throw new ErrorDominio("VALIDACION", "El campo no pertenece a la plantilla activa.");
      }
      const texto = valor.valorTexto.trim();
      if (campo.longitudMaxima !== undefined && texto.length > campo.longitudMaxima) {
        throw new ErrorDominio("VALIDACION", "El valor supera la longitud permitida.");
      }
      const previo = await ctx.db.query("reporteGeneralValor")
        .withIndex("por_reporte_campo", (q) => q.eq("reporteGeneralId", reporte._id).eq("plantillaCampoId", campo._id)).unique();
      if (previo === null) await ctx.db.insert("reporteGeneralValor", { reporteGeneralId: reporte._id, plantillaCampoId: campo._id, valorTexto: texto || undefined });
      else await ctx.db.patch(previo._id, { valorTexto: texto || undefined });
    }
    return reporte._id;
  }),
});

async function generarReportesDelCurso(ctx: MutationCtx, cursoId: Id<"curso">, periodoId: Id<"periodoAcademico">, fecha: string, general: Doc<"reporteGeneral"> | null) {
  const matriculas = await ctx.db.query("matricula").withIndex("por_curso_estado", (q) => q.eq("cursoId", cursoId).eq("estado", "CURSANDO")).collect();
  let generados = 0;
  for (const matricula of matriculas) {
    const existe = await ctx.db.query("reporteEstudiante").withIndex("por_matricula_fecha", (q) => q.eq("matriculaId", matricula._id).eq("fecha", fecha)).unique();
    if (existe !== null) continue;
    const acciones = await ctx.db.query("accionRegistrada").withIndex("por_matricula_fecha", (q) => q.eq("matriculaId", matricula._id).eq("fechaOcurrencia", fecha)).collect();
    const vigentes = acciones.filter((a) => a.estado === "VIGENTE");
    const asistencia = await ctx.db.query("registroAsistencia").withIndex("por_matricula_fecha", (q) => q.eq("matriculaId", matricula._id).eq("fecha", fecha)).unique();
    const puntaje = await ctx.db.query("puntajePeriodo").withIndex("por_matricula_periodo", (q) => q.eq("matriculaId", matricula._id).eq("periodoAcademicoId", periodoId)).unique();
    const actual = puntaje?.puntajeActual ?? 60;
    const reporteId = await ctx.db.insert("reporteEstudiante", { matriculaId: matricula._id, periodoAcademicoId: periodoId, reporteGeneralId: general?._id, fecha, tieneNovedades: vigentes.length > 0, puntajeAlCierre: actual, franjaConductaId: await franjaDe(ctx, actual), estadoAsistencia: asistencia?.estado, generadoEn: Date.now() });
    let orden = 0;
    for (const accion of vigentes) await ctx.db.insert("reporteEstudianteItem", { reporteEstudianteId: reporteId, tipoItem: "ACCION", accionRegistradaId: accion._id, orden: orden++ });
    if (asistencia !== null) await ctx.db.insert("reporteEstudianteItem", { reporteEstudianteId: reporteId, tipoItem: "ASISTENCIA", registroAsistenciaId: asistencia._id, orden });
    const vinculo = await ctx.db.query("vinculoRepresentacion").withIndex("por_estudiante_estado", (q) => q.eq("estudianteId", matricula.estudianteId).eq("estado", "ACTIVO")).unique();
    if (vinculo !== null) await ctx.db.insert("entregaReporte", { reporteEstudianteId: reporteId, representanteId: vinculo.representanteId, entregadoEn: Date.now() });
    generados++;
  }
  return generados;
}

async function presentarReporte(ctx: QueryCtx, reporte: Doc<"reporteEstudiante">) {
  const items = await ctx.db.query("reporteEstudianteItem").withIndex("por_reporte", (q) => q.eq("reporteEstudianteId", reporte._id)).collect();
  const acciones = [] as { id: Id<"accionRegistrada">; categoria: string; signo: Doc<"accionRegistrada">["signo"]; puntos: number; descripcion: string; estado: Doc<"accionRegistrada">["estado"] }[];
  for (const item of items) {
    if (item.tipoItem !== "ACCION" || item.accionRegistradaId === undefined) continue;
    const accion = await ctx.db.get(item.accionRegistradaId);
    if (accion === null) continue;
    const categoria = await ctx.db.get(accion.categoriaAccionId);
    acciones.push({ id: accion._id, categoria: categoria?.nombre ?? "", signo: accion.signo, puntos: accion.puntosAplicados, descripcion: accion.descripcion, estado: accion.estado });
  }
  const franja = reporte.franjaConductaId === undefined ? null : await ctx.db.get(reporte.franjaConductaId);
  const general: { etiqueta: string; texto: string; orden: number }[] = [];
  if (reporte.reporteGeneralId !== undefined) {
    const valores = await ctx.db.query("reporteGeneralValor").withIndex("por_reporte_campo", (q) => q.eq("reporteGeneralId", reporte.reporteGeneralId!)).collect();
    for (const valor of valores) {
      if (!valor.valorTexto) continue;
      const campo = await ctx.db.get(valor.plantillaCampoId);
      if (campo !== null) general.push({ etiqueta: campo.etiqueta, texto: valor.valorTexto, orden: campo.orden });
    }
  }
  return { id: reporte._id, fecha: reporte.fecha, tieneNovedades: reporte.tieneNovedades, puntaje: reporte.puntajeAlCierre, franja: franja === null ? null : { nombre: franja.nombre, frase: franja.fraseRepresentante, color: franja.colorHex ?? null }, asistencia: reporte.estadoAsistencia ?? null, acciones, general: general.sort((a, b) => a.orden - b.orden).map(({ etiqueta, texto }) => ({ etiqueta, texto })) };
}

export const reporteDeHoy = query({
  args: { estudianteId: v.id("estudiante"), fecha: v.optional(v.string()) },
  handler: (ctx, args) => conErroresPublicos(async () => {
    await exigirVinculo(ctx, args.estudianteId);
    const fecha = args.fecha ?? hoyEnGuayaquil();
    const matricula = await ctx.db.query("matricula").withIndex("por_estudiante_estado", (q) => q.eq("estudianteId", args.estudianteId).eq("estado", "CURSANDO")).unique();
    if (matricula === null) return { fecha, hay: false as const, reporte: null };
    const reporte = await ctx.db.query("reporteEstudiante").withIndex("por_matricula_fecha", (q) => q.eq("matriculaId", matricula._id).eq("fecha", fecha)).unique();
    return reporte === null ? { fecha, hay: false as const, reporte: null } : { fecha, hay: true as const, reporte: await presentarReporte(ctx, reporte) };
  }),
});

export const reporteAcumulado = query({
  args: { estudianteId: v.id("estudiante") },
  handler: (ctx, args) => conErroresPublicos(async () => {
    await exigirVinculo(ctx, args.estudianteId);
    const matricula = await ctx.db.query("matricula").withIndex("por_estudiante_estado", (q) => q.eq("estudianteId", args.estudianteId).eq("estado", "CURSANDO")).unique();
    if (matricula === null) throw new ErrorDominio("NO_ENCONTRADO", "El estudiante no tiene matrícula vigente.");
    const periodo = await periodoDelCurso(ctx, matricula.cursoId);
    const puntaje = await ctx.db.query("puntajePeriodo").withIndex("por_matricula_periodo", (q) => q.eq("matriculaId", matricula._id).eq("periodoAcademicoId", periodo._id)).unique();
    const acciones = await ctx.db.query("accionRegistrada").withIndex("por_matricula_periodo", (q) => q.eq("matriculaId", matricula._id).eq("periodoAcademicoId", periodo._id)).collect();
    const franja = puntaje?.franjaConductaId === undefined ? null : await ctx.db.get(puntaje.franjaConductaId);
    return { periodo: { nombre: periodo.nombre, fechaInicio: periodo.fechaInicio, fechaFin: periodo.fechaFin }, puntaje: puntaje?.puntajeActual ?? 60, puntosPositivos: puntaje?.puntosPositivos ?? 0, puntosNegativos: puntaje?.puntosNegativos ?? 0, congelado: puntaje?.congelado ?? false, franja: franja === null ? null : { nombre: franja.nombre, frase: franja.fraseRepresentante, color: franja.colorHex ?? null }, bitacora: acciones.sort((a, b) => b.fechaOcurrencia.localeCompare(a.fechaOcurrencia)).map((a) => ({ id: a._id, fecha: a.fechaOcurrencia, signo: a.signo, puntos: a.estado === "VIGENTE" ? a.puntosAplicados : 0, descripcion: a.descripcion, estado: a.estado })) };
  }),
});

export const reportesAnteriores = query({
  args: { estudianteId: v.id("estudiante") },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const vinculo = await exigirVinculo(ctx, args.estudianteId);
    const representante = await ctx.db.get(vinculo.representanteId);
    const suscripciones = representante === null ? [] : await ctx.db.query("suscripcion")
      .withIndex("por_usuario", (q) => q.eq("perfilUsuarioId", representante.perfilUsuarioId))
      .collect();
    let premium = false;
    for (const suscripcion of suscripciones) {
      if (!tieneAccesoVigente({ estado: suscripcion.estado, expiraEn: suscripcion.expiraEn })) continue;
      const plan = await ctx.db.get(suscripcion.planId);
      if (plan?.entitlementRevenuecat === ENTITLEMENTS.REPRESENTANTE) premium = true;
    }
    const limite = premium ? REGLAS.REPORTES_PREVIOS_PREMIUM : REGLAS.REPORTES_PREVIOS_FREE;
    const matricula = await ctx.db.query("matricula").withIndex("por_estudiante_estado", (q) => q.eq("estudianteId", args.estudianteId).eq("estado", "CURSANDO")).unique();
    if (matricula === null) return { limite, premium, reportes: [] };
    const reportes = await ctx.db.query("reporteEstudiante").withIndex("por_matricula_fecha", (q) => q.eq("matriculaId", matricula._id)).order("desc").take(limite + 1);
    return { limite, premium, reportes: await Promise.all(reportes.filter((r) => r.fecha < hoyEnGuayaquil()).slice(0, limite).map((r) => presentarReporte(ctx, r))) };
  }),
});

export const publicarReporteGeneral = mutation({
  args: { cursoId: v.id("curso"), fecha: v.optional(v.string()) },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const docente = await exigirTitularDelCurso(ctx, args.cursoId);
    const fecha = args.fecha ?? hoyEnGuayaquil();
    const periodo = await periodoDelCurso(ctx, args.cursoId);
    let general = await ctx.db.query("reporteGeneral").withIndex("por_curso_fecha", (q) => q.eq("cursoId", args.cursoId).eq("fecha", fecha)).unique();
    if (general?.estado === "PUBLICADO") throw new ErrorDominio("CONFLICTO", "Ese reporte ya fue publicado.");
    if (general !== null) {
      await ctx.db.patch(general._id, { estado: "PUBLICADO", publicadoEn: Date.now(), publicadoPorDocenteId: docente._id, actualizadoEn: Date.now() });
      general = (await ctx.db.get(general._id))!;
    }
    return { fecha, generados: await generarReportesDelCurso(ctx, args.cursoId, periodo._id, fecha, general) };
  }),
});

/** Publica una nota o evento; los anuncios no alteran conducta ni puntaje. */
export const publicarComunicado = mutation({
  args: {
    cursoId: v.id("curso"), tipo: tipoComunicado, alcance: alcanceComunicado,
    estudianteId: v.optional(v.id("estudiante")), titulo: v.string(), contenido: v.string(),
    fechaEvento: v.optional(v.string()), horaEvento: v.optional(v.string()),
    visibleDesde: v.optional(v.string()), diasVisible: v.optional(v.number()),
  },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const docente = await exigirTitularDelCurso(ctx, args.cursoId);
    const titulo = args.titulo.trim(); const contenido = args.contenido.trim();
    if (!titulo || !contenido) throw new ErrorDominio("VALIDACION", "El título y el contenido son obligatorios.");
    exigirAlcanceCoherente(args.alcance, args.estudianteId);
    if (args.alcance === "ESTUDIANTE") {
      const { matricula } = await exigirAccesoDocenteAEstudiante(ctx, args.estudianteId!);
      if (matricula.cursoId !== args.cursoId) throw new ErrorDominio("VALIDACION", "El estudiante no pertenece a este curso.");
    }
    if (args.tipo === "NOTA_PROFESOR") {
      if (args.fechaEvento !== undefined) throw new ErrorDominio("VALIDACION", "Una nota no puede tener fecha de evento.");
      exigirDuracionNota(args.diasVisible ?? REGLAS.NOTA_PROFESOR_DIAS_MIN);
    } else {
      exigirFechaEvento(args.tipo, args.fechaEvento);
    }
    const visibleDesde = args.visibleDesde ?? hoyEnGuayaquil();
    const visibleHasta = args.tipo === "EVENTO" ? args.fechaEvento! : sumarDias(visibleDesde, args.diasVisible!);
    exigirVentanaComunicado(visibleDesde, visibleHasta);
    const periodo = await periodoDelCurso(ctx, args.cursoId);
    return await ctx.db.insert("comunicadoCurso", {
      cursoId: args.cursoId, periodoAcademicoId: periodo._id, tipo: args.tipo, alcance: args.alcance,
      estudianteId: args.estudianteId, titulo, contenido, fechaEvento: args.fechaEvento, horaEvento: args.horaEvento,
      visibleDesde, visibleHasta, creadoPorDocenteId: docente._id, activo: true, actualizadoEn: Date.now(),
    });
  }),
});

/** Solo invocable por cron. Publica borradores de la fecha y evita duplicar reportes. */
export const cierreNocturno = internalMutation({
  args: { fecha: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const fecha = args.fecha ?? hoyEnGuayaquil();
    const borradores = await ctx.db.query("reporteGeneral")
      .filter((q) => q.and(q.eq(q.field("fecha"), fecha), q.eq(q.field("estado"), "BORRADOR"))).take(50);
    let publicados = 0; let generados = 0;
    for (const reporte of borradores) {
      await ctx.db.patch(reporte._id, { estado: "PUBLICADO", publicadoEn: Date.now(), actualizadoEn: Date.now() });
      const actualizado = (await ctx.db.get(reporte._id))!;
      generados += await generarReportesDelCurso(ctx, reporte.cursoId, reporte.periodoAcademicoId, fecha, actualizado);
      publicados++;
    }
    // Un docente puede omitir el texto general; una acción nunca debe quedar
    // invisible por eso. Solo se generan las matrículas que sí tuvieron acción.
    const cursos = await ctx.db.query("curso")
      .filter((q) => q.eq(q.field("estado"), "ACTIVO")).take(50);
    for (const curso of cursos) {
      const periodo = await ctx.db.query("periodoAcademico")
        .withIndex("por_anio_orden", (q) => q.eq("anioLectivoId", curso.anioLectivoId))
        .filter((q) => q.eq(q.field("estado"), "EN_CURSO")).first();
      if (periodo === null) continue;
      const matriculas = await ctx.db.query("matricula")
        .withIndex("por_curso_estado", (q) => q.eq("cursoId", curso._id).eq("estado", "CURSANDO"))
        .collect();
      for (const matricula of matriculas) {
        const existe = await ctx.db.query("reporteEstudiante")
          .withIndex("por_matricula_fecha", (q) => q.eq("matriculaId", matricula._id).eq("fecha", fecha)).unique();
        if (existe !== null) continue;
        const acciones = await ctx.db.query("accionRegistrada")
          .withIndex("por_matricula_fecha", (q) => q.eq("matriculaId", matricula._id).eq("fechaOcurrencia", fecha)).collect();
        const vigentes = acciones.filter((accion) => accion.estado === "VIGENTE");
        if (vigentes.length === 0) continue;
        const puntaje = await ctx.db.query("puntajePeriodo")
          .withIndex("por_matricula_periodo", (q) => q.eq("matriculaId", matricula._id).eq("periodoAcademicoId", periodo._id)).unique();
        const actual = puntaje?.puntajeActual ?? REGLAS.PUNTAJE_BASE;
        const reporteId = await ctx.db.insert("reporteEstudiante", {
          matriculaId: matricula._id, periodoAcademicoId: periodo._id, fecha,
          tieneNovedades: true, puntajeAlCierre: actual, franjaConductaId: await franjaDe(ctx, actual),
          generadoEn: Date.now(),
        });
        let orden = 0;
        for (const accion of vigentes) await ctx.db.insert("reporteEstudianteItem", {
          reporteEstudianteId: reporteId, tipoItem: "ACCION", accionRegistradaId: accion._id, orden: orden++,
        });
        const vinculo = await ctx.db.query("vinculoRepresentacion")
          .withIndex("por_estudiante_estado", (q) => q.eq("estudianteId", matricula.estudianteId).eq("estado", "ACTIVO")).unique();
        if (vinculo !== null) await ctx.db.insert("entregaReporte", {
          reporteEstudianteId: reporteId, representanteId: vinculo.representanteId, entregadoEn: Date.now(),
        });
        generados++;
      }
    }
    return { publicados, generados };
  },
});
