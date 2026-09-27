import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { ALCANCE_COMUNICADO, ENTITLEMENTS, ESTADO_ASISTENCIA, REGLAS, TIPO_COMUNICADO } from "./lib/enums";
import { BANDERAS } from "./lib/flags";
import { ErrorDominio, esFinDeSemana, exigirAlcanceCoherente, exigirDuracionNota, exigirFechaEvento, exigirRangoEventoOpcional, exigirRangoTipoAccion, exigirSignoCoherente, exigirTopeDiario, exigirVentanaComunicado, calcularPuntaje, hoyEnGuayaquil, sumarDias } from "./lib/guardas";
import { consejoPorCategoria, fraseDeAliento, fraseDeLecturas } from "./lib/insights";
import { notificar } from "./lib/notificaciones";
import { ErrorPermiso, auditar, exigirAccesoDocenteAEstudiante, exigirDocente, exigirTitularDelCurso, exigirVinculo } from "./lib/permisos";
import { periodoVigentePorFecha } from "./lib/periodos";
import { tieneAccesoVigente } from "./lib/revenuecat";

/** El representante activo del estudiante, o `null` si no tiene ninguno. */
async function representanteDelEstudiante(ctx: MutationCtx, estudianteId: Id<"estudiante">) {
  const vinculo = await ctx.db.query("vinculoRepresentacion")
    .withIndex("por_estudiante_estado", (q) => q.eq("estudianteId", estudianteId).eq("estado", "ACTIVO")).unique();
  if (vinculo === null) return null;
  return await ctx.db.get(vinculo.representanteId);
}

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

async function franjaDe(ctx: QueryCtx | MutationCtx, puntaje: number): Promise<Id<"franjaConducta"> | undefined> {
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
    // **por la fecha**: tomar cualquiera vigente archivaba una accion fechada
    // en 1900 o en octubre dentro del parcial de hoy.
    const fecha = args.fechaOcurrencia ?? hoyEnGuayaquil();
    const dia = exigirFechaDeCalendario(fecha);

    const periodo = await periodoVigentePorFecha(ctx, curso.anioLectivoId, fecha);
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
    //
    // BANDERAS.PERMITIR_ANOTAR_FIN_DE_SEMANA (ver lib/flags.ts) solo salta la
    // mitad "es sabado o domingo" de esta guarda, para el QA del fin de
    // semana antes de la entrega. Un `diaNoLectivo` declarado a mano sigue
    // bloqueando igual: eso es la institucion diciendo "hoy no hay clase",
    // no el calendario, y la bandera no lo toca.
    const diaNoLectivo = await ctx.db
      .query("diaNoLectivo")
      .withIndex("por_anio_fecha", (q) => q.eq("anioLectivoId", curso.anioLectivoId).eq("fecha", fecha))
      .first();
    const esFinDeSemana = dia.getUTCDay() === 0 || dia.getUTCDay() === 6;
    if ((esFinDeSemana && !BANDERAS.PERMITIR_ANOTAR_FIN_DE_SEMANA) || diaNoLectivo) {
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

    // QA del 26 de septiembre: una acción no avisaba a nadie. El representante
    // solo se enteraba si abría la aplicación por su cuenta.
    const representante = await representanteDelEstudiante(ctx, matricula.estudianteId);
    if (representante !== null) {
      await notificar(
        ctx, representante.perfilUsuarioId,
        tipo.signo === "POSITIVA" ? "ACCION_POSITIVA" : "ACCION_NEGATIVA",
        tipo.signo === "POSITIVA" ? "Nueva anotación positiva" : "Nueva anotación de conducta",
        descripcion, "estudiante", matricula.estudianteId,
      );
    }
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

/**
 * Panorama del parcial vigente: a quién no se le ha anotado nada todavía, y
 * quiénes concentran más anotaciones negativas.
 *
 * QA del 27 de septiembre. Dos preguntas distintas y con un trato distinto en
 * la pantalla, a propósito:
 *
 *  - "Sin ninguna anotación" es un **conteo**, sin nombres: el silencio no es
 *    necesariamente bueno, puede ser un estudiante que nadie está mirando.
 *  - "Con más negativas" nombra a estudiantes concretos, así que va **detrás
 *    de un desplegable**: el docente elige verlo, no se lo confronta con un
 *    ranking cada vez que abre el curso.
 *
 * Nunca lanza `PERIODO_NO_VIGENTE` ni nada parecido -- es una lectura, igual
 * que `reporteAcumulado`, y "hoy no hay un parcial" o "el curso no tiene
 * estudiantes todavía" son estados normales, no errores. El QA que pidió esto
 * fue explícito: que la falta de datos nunca se lea como un fallo de
 * conexión.
 */
export const panoramaDelCurso = query({
  args: { cursoId: v.id("curso") },
  handler: (ctx, args) => conErroresPublicos(async () => {
    await exigirTitularDelCurso(ctx, args.cursoId);
    const curso = await ctx.db.get(args.cursoId);
    if (curso === null) throw new ErrorDominio("NO_ENCONTRADO", "El curso no existe.");

    const matriculas = await ctx.db.query("matricula")
      .withIndex("por_curso_estado", (q) => q.eq("cursoId", args.cursoId).eq("estado", "CURSANDO"))
      .collect();
    const periodo = await periodoVigentePorFecha(ctx, curso.anioLectivoId, hoyEnGuayaquil());
    const vacio = { hayPeriodo: periodo !== null, totalEstudiantes: matriculas.length, sinAnotaciones: 0, topNegativos: [] as { estudianteId: Id<"estudiante">; nombre: string; cantidad: number }[] };
    if (periodo === null || matriculas.length === 0) return vacio;

    let sinAnotaciones = 0;
    const conNegativas: typeof vacio.topNegativos = [];
    for (const matricula of matriculas) {
      const acciones = await ctx.db.query("accionRegistrada")
        .withIndex("por_matricula_periodo", (q) => q.eq("matriculaId", matricula._id).eq("periodoAcademicoId", periodo._id))
        .collect();
      const vigentes = acciones.filter((a) => a.estado === "VIGENTE");
      if (vigentes.length === 0) { sinAnotaciones++; continue; }
      const cantidad = vigentes.filter((a) => a.signo === "NEGATIVA").length;
      if (cantidad === 0) continue;
      const estudiante = await ctx.db.get(matricula.estudianteId);
      conNegativas.push({ estudianteId: matricula.estudianteId, nombre: estudiante ? `${estudiante.nombres} ${estudiante.apellidos}` : "Estudiante", cantidad });
    }
    return {
      hayPeriodo: true,
      totalEstudiantes: matriculas.length,
      sinAnotaciones,
      topNegativos: conNegativas.sort((a, b) => b.cantidad - a.cantidad).slice(0, 3),
    };
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
    const periodo = await periodoVigentePorFecha(ctx, curso.anioLectivoId, fecha);
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

async function periodoDelCurso(
  ctx: QueryCtx | MutationCtx,
  cursoId: Id<"curso">,
  fecha: string = hoyEnGuayaquil(),
) {
  const curso = await ctx.db.get(cursoId);
  if (curso === null) throw new ErrorDominio("NO_ENCONTRADO", "El curso no existe.");
  const periodo = await periodoVigentePorFecha(ctx, curso.anioLectivoId, fecha);
  if (periodo === null) throw new ErrorDominio("PERIODO_NO_VIGENTE", "No hay un parcial en curso.");
  return periodo;
}

export const guardarReporteGeneral = mutation({
  args: { cursoId: v.id("curso"), fecha: v.optional(v.string()), valores: v.array(v.object({ plantillaCampoId: v.id("plantillaCampo"), valorTexto: v.string() })) },
  handler: (ctx, args) => conErroresPublicos(async () => {
    await exigirTitularDelCurso(ctx, args.cursoId);
    const fecha = args.fecha ?? hoyEnGuayaquil();
    const periodo = await periodoDelCurso(ctx, args.cursoId, fecha);
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
    if (vinculo !== null) {
      await ctx.db.insert("entregaReporte", { reporteEstudianteId: reporteId, representanteId: vinculo.representanteId, entregadoEn: Date.now() });
      // Cubre las dos vías de publicación —manual y `cierreNocturno`—, porque
      // las dos pasan por aquí. Antes ninguna avisaba: el reporte se publicaba
      // y la familia solo lo veía si abría la aplicación por su cuenta.
      const representante = await ctx.db.get(vinculo.representanteId);
      if (representante !== null) {
        await notificar(
          ctx, representante.perfilUsuarioId, "REPORTE_DIARIO",
          "Reporte de hoy publicado",
          vigentes.length > 0 ? "Hay novedades de conducta de hoy." : "Sin novedades de conducta hoy.",
          "estudiante", matricula.estudianteId,
        );
      }
    }
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

/**
 * Cuando todavía no existe la fotografía del día (`reporteEstudiante`, que
 * solo nace al publicar el reporte general o en el cierre nocturno), arma la
 * misma forma en vivo desde lo que ya se registró.
 *
 * QA del 26 de septiembre: "deberían mostrarse las acciones que realiza el
 * estudiante en el reporte diario, si no hay reportes diarios solo debería
 * mostrarse las acciones". Antes de esto una acción registrada a las 8am no
 * se veía hasta que el docente publicaba el reporte general, horas después.
 *
 * La forma es deliberadamente igual a la de `presentarReporte`: cuando el
 * reporte real se publique más tarde, la pantalla no cambia de estructura,
 * solo dejan de faltar `general` e `id`.
 *
 * Devuelve `null` cuando de verdad no hay nada todavía: eso es lo que separa
 * "hoy no hubo novedades" de "el día ni ha empezado a registrarse".
 */
async function reporteEnVivo(ctx: QueryCtx, matricula: Doc<"matricula">, fecha: string) {
  const curso = await ctx.db.get(matricula.cursoId);
  if (curso === null) return null;
  const periodo = await periodoVigentePorFecha(ctx, curso.anioLectivoId, fecha);
  const acciones = periodo
    ? await ctx.db.query("accionRegistrada").withIndex("por_matricula_fecha", (q) => q.eq("matriculaId", matricula._id).eq("fechaOcurrencia", fecha)).collect()
    : [];
  const vigentes = acciones.filter((a) => a.estado === "VIGENTE");
  const asistencia = await ctx.db.query("registroAsistencia").withIndex("por_matricula_fecha", (q) => q.eq("matriculaId", matricula._id).eq("fecha", fecha)).unique();
  if (vigentes.length === 0 && asistencia === null) return null;

  const puntaje = periodo
    ? await ctx.db.query("puntajePeriodo").withIndex("por_matricula_periodo", (q) => q.eq("matriculaId", matricula._id).eq("periodoAcademicoId", periodo._id)).unique()
    : null;
  const puntajeEfectivo = puntaje?.puntajeActual ?? REGLAS.PUNTAJE_BASE;
  const franjaId = puntaje?.franjaConductaId ?? await franjaDe(ctx, puntajeEfectivo);
  const franja = franjaId === undefined ? null : await ctx.db.get(franjaId);
  const conCategoria = await Promise.all(vigentes.map(async (accion) => {
    const categoria = await ctx.db.get(accion.categoriaAccionId);
    return { id: accion._id, categoria: categoria?.nombre ?? "", signo: accion.signo, puntos: accion.puntosAplicados, descripcion: accion.descripcion, estado: accion.estado };
  }));
  return {
    id: null as Id<"reporteEstudiante"> | null,
    fecha,
    tieneNovedades: vigentes.length > 0,
    puntaje: puntajeEfectivo,
    franja: franja === null ? null : { nombre: franja.nombre, frase: franja.fraseRepresentante, color: franja.colorHex ?? null },
    asistencia: asistencia?.estado ?? null,
    acciones: conCategoria,
    general: [] as { etiqueta: string; texto: string }[],
  };
}

/**
 * QA del 27 de septiembre: un sábado o domingo, "Todavía no hay reporte de
 * hoy" no dice nada cierto -- no es que el docente no haya cerrado el día,
 * es que no hay clases. En vez de esa pantalla, un resumen de los últimos
 * siete días. Se calcula siempre por fecha, nunca por si hay un parcial
 * vigente: los sábados y domingos igual caen dentro del rango de un
 * parcial, así que exigir uno aquí solo repetiría el bug ya resuelto en
 * `reporteAcumulado`.
 *
 * Nunca devuelve `null`: ausencia de acciones esta semana es un resumen
 * válido y vacío ("sin novedades"), no un estado a manejar aparte.
 */
async function resumenDeLaSemana(ctx: QueryCtx, matricula: Doc<"matricula">, hoy: string) {
  const desde = sumarDias(hoy, -6);
  const acciones = await ctx.db.query("accionRegistrada")
    .withIndex("por_matricula_fecha", (q) => q.eq("matriculaId", matricula._id).gte("fechaOcurrencia", desde))
    .collect();
  const vigentes = acciones.filter((a) => a.estado === "VIGENTE" && a.fechaOcurrencia <= hoy);
  const conCategoria = await Promise.all(vigentes.map(async (a) => {
    const categoria = await ctx.db.get(a.categoriaAccionId);
    return { id: a._id, categoria: categoria?.nombre ?? "", signo: a.signo, puntos: a.puntosAplicados, descripcion: a.descripcion, estado: a.estado, fecha: a.fechaOcurrencia };
  }));
  return {
    desde,
    hasta: hoy,
    puntosPositivos: vigentes.filter((a) => a.signo === "POSITIVA").reduce((s, a) => s + a.puntosAplicados, 0),
    puntosNegativos: vigentes.filter((a) => a.signo === "NEGATIVA").reduce((s, a) => s + a.puntosAplicados, 0),
    acciones: conCategoria.sort((a, b) => b.fecha.localeCompare(a.fecha)),
  };
}

export const reporteDeHoy = query({
  args: { estudianteId: v.id("estudiante"), fecha: v.optional(v.string()) },
  handler: (ctx, args) => conErroresPublicos(async () => {
    await exigirVinculo(ctx, args.estudianteId);
    const fecha = args.fecha ?? hoyEnGuayaquil();
    const finDeSemana = esFinDeSemana(fecha);
    const matricula = await ctx.db.query("matricula").withIndex("por_estudiante_estado", (q) => q.eq("estudianteId", args.estudianteId).eq("estado", "CURSANDO")).unique();
    if (matricula === null) return { fecha, hay: false as const, reporte: null, finDeSemana, resumenSemana: null };
    const reporte = await ctx.db.query("reporteEstudiante").withIndex("por_matricula_fecha", (q) => q.eq("matriculaId", matricula._id).eq("fecha", fecha)).unique();
    if (reporte !== null) return { fecha, hay: true as const, reporte: await presentarReporte(ctx, reporte), finDeSemana, resumenSemana: null };
    const enVivo = await reporteEnVivo(ctx, matricula, fecha);
    if (enVivo !== null) return { fecha, hay: true as const, reporte: enVivo, finDeSemana, resumenSemana: null };
    // Solo se calcula el resumen cuando de verdad hace falta: entre semana,
    // "todavía no hay reporte de hoy" ya dice lo correcto, y una lectura de
    // siete días de más no le sirve a nadie.
    const resumenSemana = finDeSemana ? await resumenDeLaSemana(ctx, matricula, fecha) : null;
    return { fecha, hay: false as const, reporte: null, finDeSemana, resumenSemana };
  }),
});

export const reporteAcumulado = query({
  args: { estudianteId: v.id("estudiante") },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const vinculo = await exigirVinculo(ctx, args.estudianteId);
    const matricula = await ctx.db.query("matricula").withIndex("por_estudiante_estado", (q) => q.eq("estudianteId", args.estudianteId).eq("estado", "CURSANDO")).unique();
    if (matricula === null) throw new ErrorDominio("NO_ENCONTRADO", "El estudiante no tiene matrícula vigente.");
    const curso = await ctx.db.get(matricula.cursoId);
    if (curso === null) throw new ErrorDominio("NO_ENCONTRADO", "El curso no existe.");
    /**
     * A diferencia de `guardarReporteGeneral`/`tomarAsistencia` —que son
     * acciones del docente y con razón exigen un parcial vigente para
     * ejecutarse—, esta es una **lectura de la familia**. No tiene ninguna
     * acción que rechazar: si hoy cae entre dos parciales, o el docente
     * todavía no definió ninguno, la familia igual tiene que poder abrir la
     * pantalla y ver que su hijo arranca en el puntaje base, en vez de
     * llevarse un "no pudimos cargar esta vista" que no distingue "sin datos
     * todavía" de "la aplicación se rompió".
     */
    const periodo = await periodoVigentePorFecha(ctx, curso.anioLectivoId, hoyEnGuayaquil());
    const puntaje = periodo && await ctx.db.query("puntajePeriodo").withIndex("por_matricula_periodo", (q) => q.eq("matriculaId", matricula._id).eq("periodoAcademicoId", periodo._id)).unique();
    const acciones = periodo ? await ctx.db.query("accionRegistrada").withIndex("por_matricula_periodo", (q) => q.eq("matriculaId", matricula._id).eq("periodoAcademicoId", periodo._id)).collect() : [];
    const puntajeEfectivo = puntaje?.puntajeActual ?? REGLAS.PUNTAJE_BASE;
    /**
     * QA del 27 de septiembre: "que la app sea un motivador para que los
     * padres estén acompañando". `fraseDeAliento` es pura y se prueba sola
     * (`lib/insights.test.ts`); aquí solo se junta lo que ya se necesitaba
     * de todas formas para el resto de la pantalla, más el parcial anterior
     * -- la única lectura nueva.
     */
    const anterior = periodo
      ? await ctx.db.query("periodoAcademico").withIndex("por_anio_orden", (q) => q.eq("anioLectivoId", curso.anioLectivoId).eq("orden", periodo.orden - 1)).unique()
      : null;
    const puntajeAnterior = anterior
      ? await ctx.db.query("puntajePeriodo").withIndex("por_matricula_periodo", (q) => q.eq("matriculaId", matricula._id).eq("periodoAcademicoId", anterior._id)).unique()
      : null;
    const negativasVigentes = acciones.filter((a) => a.signo === "NEGATIVA" && a.estado === "VIGENTE");
    const ultimaNegativa = negativasVigentes
      .reduce<string | null>((ultima, a) => (ultima === null || a.fechaOcurrencia > ultima ? a.fechaOcurrencia : ultima), null);
    // Un consejo, no un sermón: solo cuando una misma categoría se repite
    // (ver `consejoPorCategoria`), nunca por un incidente aislado.
    const categoriasNegativas = await Promise.all(
      negativasVigentes.map(async (a) => (await ctx.db.get(a.categoriaAccionId))?.codigo),
    );
    // Cuántos reportes diarios *distintos* de este parcial ya abrió este
    // representante -- reconoce su propia presencia, no la del estudiante.
    // `entregaReporte` ya lo llevaba para DP-006; esto solo lo cuenta.
    const reportesDelPeriodo = periodo
      ? (await ctx.db.query("reporteEstudiante").withIndex("por_matricula_fecha", (q) => q.eq("matriculaId", matricula._id)).collect())
          .filter((r) => r.periodoAcademicoId === periodo._id)
      : [];
    const entregas = await Promise.all(reportesDelPeriodo.map((r) =>
      ctx.db.query("entregaReporte").withIndex("por_reporte_representante", (q) => q.eq("reporteEstudianteId", r._id).eq("representanteId", vinculo.representanteId)).unique(),
    ));
    const vecesLeido = entregas.filter((e) => e?.leidoEn !== undefined).length;
    // `puntaje?.franjaConductaId` solo existe despues de la primera
    // `recalcularPuntaje` (la dispara registrar una accion). Un estudiante
    // recien aprobado, sin ninguna accion todavia, tiene puntaje pero nunca
    // tuvo ese recalculo -- y sin este `??`, la barra de franjas no tendria
    // ni color ni frase que mostrar aunque el puntaje sea perfectamente
    // valido. Se calcula en el momento con el mismo puntaje efectivo.
    const franjaId = puntaje?.franjaConductaId ?? await franjaDe(ctx, puntajeEfectivo);
    const franja = franjaId === undefined ? null : await ctx.db.get(franjaId);
    return {
      periodo: periodo && { nombre: periodo.nombre, fechaInicio: periodo.fechaInicio, fechaFin: periodo.fechaFin },
      puntaje: puntajeEfectivo,
      puntosPositivos: puntaje?.puntosPositivos ?? 0,
      puntosNegativos: puntaje?.puntosNegativos ?? 0,
      congelado: puntaje?.congelado ?? false,
      franja: franja === null ? null : { nombre: franja.nombre, frase: franja.fraseRepresentante, color: franja.colorHex ?? null },
      bitacora: acciones.sort((a, b) => b.fechaOcurrencia.localeCompare(a.fechaOcurrencia)).map((a) => ({ id: a._id, fecha: a.fechaOcurrencia, signo: a.signo, puntos: a.estado === "VIGENTE" ? a.puntosAplicados : 0, descripcion: a.descripcion, estado: a.estado })),
      insight: periodo ? fraseDeAliento({
        puntajeActual: puntajeEfectivo,
        puntajeAnterior: puntajeAnterior?.puntajeActual ?? null,
        puntosPositivos: puntaje?.puntosPositivos ?? 0,
        puntosNegativos: puntaje?.puntosNegativos ?? 0,
        ultimaNegativa,
        inicioParcial: periodo.fechaInicio,
        hoy: hoyEnGuayaquil(),
      }) : null,
      consejo: consejoPorCategoria(categoriasNegativas.filter((c): c is NonNullable<typeof c> => c !== undefined)),
      reconocimiento: fraseDeLecturas(vecesLeido),
    };
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
    const periodo = await periodoDelCurso(ctx, args.cursoId, fecha);
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
    fechaEvento: v.optional(v.string()), fechaEventoFin: v.optional(v.string()), horaEvento: v.optional(v.string()),
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
      // Un evento puede ser de un solo día o de un plazo — las dos formas
      // están disponibles (QA del 26 de septiembre). `fechaEvento` sigue
      // siendo el inicio; `fechaEventoFin` es el fin del plazo si lo hay.
      exigirFechaEvento(args.tipo, args.fechaEvento);
      exigirRangoEventoOpcional(args.fechaEvento, args.fechaEventoFin);
    }
    const visibleDesde = args.visibleDesde ?? hoyEnGuayaquil();
    /**
     * QA del 26 de septiembre: "cuando se intenta enviar una nota sale que no
     * hay conexión a internet". La causa real: cuando el docente no manda
     * `diasVisible` —que es el caso normal, la pantalla de "Avisar al curso"
     * nunca lo envía para una nota— esto hacía `sumarDias(fecha, undefined)`,
     * que revienta con un `RangeError` crudo. Al no ser un `ErrorDominio`,
     * `conErroresPublicos` no lo traduce y el cliente se queda sin mensaje
     * útil, cayendo en el aviso genérico de conexión. El valor por defecto ya
     * se usaba arriba para *validar* (`exigirDuracionNota`); faltaba usarlo
     * también aquí, para calcular.
     */
    const diasVisible = args.diasVisible ?? REGLAS.NOTA_PROFESOR_DIAS_MIN;
    const visibleHasta = args.tipo === "EVENTO"
      ? (args.fechaEventoFin ?? args.fechaEvento!)
      : sumarDias(visibleDesde, diasVisible);
    exigirVentanaComunicado(visibleDesde, visibleHasta);

    const curso = await ctx.db.get(args.cursoId);
    if (curso === null) throw new ErrorDominio("NO_ENCONTRADO", "El curso no existe.");
    /**
     * Un comunicado no es una acción de conducta: es informativo, y no hay
     * ninguna escritura que rechazar si hoy cae entre dos parciales o en fin
     * de semana. Antes pasaba por `periodoDelCurso`, que revienta con
     * PERIODO_NO_VIGENTE exactamente en esos casos — para una operación sin
     * relación real con el parcial académico (QA del 26 de septiembre:
     * "cuando se intenta enviar una nota sale que no hay conexión a
     * internet"). `periodoAcademicoId` queda como referencia de cuándo se
     * publicó, no como permiso para publicar.
     */
    const periodo = await periodoVigentePorFecha(ctx, curso.anioLectivoId, hoyEnGuayaquil());
    const comunicadoId = await ctx.db.insert("comunicadoCurso", {
      cursoId: args.cursoId, periodoAcademicoId: periodo?._id, tipo: args.tipo, alcance: args.alcance,
      estudianteId: args.estudianteId, titulo, contenido, fechaEvento: args.fechaEvento,
      fechaEventoFin: args.fechaEventoFin, horaEvento: args.horaEvento,
      visibleDesde, visibleHasta, creadoPorDocenteId: docente._id, activo: true, actualizadoEn: Date.now(),
    });

    // A cada representante alcanzado, para que "los eventos no se reflejan en
    // el reporte diario" (QA) tenga también su aviso, no solo su lectura.
    const matriculas = args.alcance === "CURSO"
      ? await ctx.db.query("matricula").withIndex("por_curso_estado", (q) => q.eq("cursoId", args.cursoId).eq("estado", "CURSANDO")).collect()
      : await ctx.db.query("matricula").withIndex("por_estudiante_estado", (q) => q.eq("estudianteId", args.estudianteId!).eq("estado", "CURSANDO")).collect();
    for (const m of matriculas) {
      const vinculo = await ctx.db.query("vinculoRepresentacion").withIndex("por_estudiante_estado", (q) => q.eq("estudianteId", m.estudianteId).eq("estado", "ACTIVO")).unique();
      if (vinculo === null) continue;
      const representante = await ctx.db.get(vinculo.representanteId);
      if (representante === null) continue;
      await notificar(
        ctx, representante.perfilUsuarioId,
        args.tipo === "EVENTO" ? "COMUNICADO" : "NOTA_DOCENTE",
        titulo, contenido, "estudiante", m.estudianteId,
      );
    }
    return comunicadoId;
  }),
});

/**
 * Los comunicados vigentes hoy para el curso de un estudiante — notas y
 * eventos, sin importar si ya se publicó el reporte general del día.
 *
 * QA del 26 de septiembre: "los eventos no se reflejan en el reporte diario".
 * No lo hacían porque nada leía `comunicadoCurso` del lado de la familia — se
 * escribía y nunca se consultaba. `visibleHasta` decide la expiración, no la
 * fecha del evento: un evento sigue visible durante su plazo aunque el día
 * del evento ya haya pasado, tal como pide la ventana que el propio docente
 * definió al publicarlo.
 */
export const comunicadosVigentes = query({
  args: { estudianteId: v.id("estudiante") },
  handler: (ctx, args) => conErroresPublicos(async () => {
    await exigirVinculo(ctx, args.estudianteId);
    const matricula = await ctx.db.query("matricula").withIndex("por_estudiante_estado", (q) => q.eq("estudianteId", args.estudianteId).eq("estado", "CURSANDO")).unique();
    if (matricula === null) return [];
    const hoy = hoyEnGuayaquil();
    const delCurso = await ctx.db.query("comunicadoCurso")
      .withIndex("por_curso_ventana", (q) => q.eq("cursoId", matricula.cursoId).eq("activo", true).gte("visibleHasta", hoy))
      .collect();
    return delCurso
      .filter((c) => c.visibleDesde <= hoy && (c.alcance === "CURSO" || c.estudianteId === args.estudianteId))
      .sort((a, b) => (a.fechaEvento ?? a.visibleDesde).localeCompare(b.fechaEvento ?? b.visibleDesde))
      .map((c) => ({
        id: c._id, tipo: c.tipo, titulo: c.titulo, contenido: c.contenido,
        fechaEvento: c.fechaEvento ?? null, fechaEventoFin: c.fechaEventoFin ?? null, horaEvento: c.horaEvento ?? null,
      }));
  }),
});

/** Un reporte muestra pocos comunicados a la vez; más que esto no es una pantalla real. */
const VISTOS_POR_LLAMADA = 50;
/** Lo que el docente ve de su historial de avisos: los más recientes. */
const PUBLICADOS_VISIBLES = 15;

/**
 * La familia tuvo estos comunicados en pantalla, en el reporte de este hijo.
 * Lo llama la pantalla al mostrarlos: una `query` no puede escribir, el mismo
 * motivo por el que existe `registrarLecturaSensible`.
 *
 * Solo cuenta lo que de verdad le llega a este hijo hoy — del curso en que
 * está matriculado, dirigido al curso o a él, y dentro de su ventana de
 * visibilidad. Sin esas comprobaciones, cualquier representante podría dejar
 * "visto" el comunicado de otro curso. Repetir la llamada no duplica nada.
 */
export const marcarComunicadosVistos = mutation({
  args: { estudianteId: v.id("estudiante"), comunicadoIds: v.array(v.id("comunicadoCurso")) },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const vinculo = await exigirVinculo(ctx, args.estudianteId);
    if (args.comunicadoIds.length > VISTOS_POR_LLAMADA) {
      throw new ErrorDominio("VALIDACION", "Son demasiados comunicados de una sola vez.");
    }
    const matricula = await ctx.db.query("matricula").withIndex("por_estudiante_estado", (q) => q.eq("estudianteId", args.estudianteId).eq("estado", "CURSANDO")).unique();
    if (matricula === null) return 0;
    const hoy = hoyEnGuayaquil();
    let nuevas = 0;
    for (const comunicadoId of new Set(args.comunicadoIds)) {
      const c = await ctx.db.get(comunicadoId);
      const leLlega = c !== null && c.activo && c.cursoId === matricula.cursoId &&
        (c.alcance === "CURSO" || c.estudianteId === args.estudianteId) &&
        c.visibleDesde <= hoy && hoy <= c.visibleHasta;
      if (!leLlega) continue;
      const yaVisto = await ctx.db.query("vistaComunicado")
        .withIndex("por_comunicado_representante", (q) => q.eq("comunicadoCursoId", comunicadoId).eq("representanteId", vinculo.representanteId))
        .first();
      if (yaVisto !== null) continue;
      await ctx.db.insert("vistaComunicado", {
        comunicadoCursoId: comunicadoId, representanteId: vinculo.representanteId,
        estudianteId: args.estudianteId, vistoEn: Date.now(),
      });
      nuevas++;
    }
    return nuevas;
  }),
});

/**
 * Lo que el docente publicó en el curso, del más reciente al más antiguo, con
 * cuántas familias lo vieron y quiénes faltan.
 *
 * De las entrevistas del 1 de septiembre: "ya no vale que yo le avisé por
 * WhatsApp". Esto es lo que el docente puede mostrar en su lugar. Se incluyen
 * también los que ya no se muestran: la constancia importa justo después,
 * cuando alguien pregunta si la familia estaba avisada.
 *
 * Una familia es un estudiante del curso con representante vinculado (D2: uno
 * por estudiante). Cuenta como que lo vio si su representante lo vio **desde
 * el reporte de cualquiera de sus hijos**: dos hermanos en el mismo paralelo
 * no obligan a la misma madre a abrirlo dos veces para quedar al día.
 */
export const comunicadosPublicados = query({
  args: { cursoId: v.id("curso") },
  handler: (ctx, args) => conErroresPublicos(async () => {
    await exigirTitularDelCurso(ctx, args.cursoId);
    const comunicados = (await ctx.db.query("comunicadoCurso")
      .withIndex("por_curso_ventana", (q) => q.eq("cursoId", args.cursoId).eq("activo", true))
      .collect())
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, PUBLICADOS_VISIBLES);
    if (comunicados.length === 0) return [];

    const matriculas = await ctx.db.query("matricula")
      .withIndex("por_curso_estado", (q) => q.eq("cursoId", args.cursoId).eq("estado", "CURSANDO")).collect();
    const familias: { estudianteId: Id<"estudiante">; nombre: string; representanteId: Id<"representante"> }[] = [];
    for (const matricula of matriculas) {
      const vinculo = await ctx.db.query("vinculoRepresentacion")
        .withIndex("por_estudiante_estado", (q) => q.eq("estudianteId", matricula.estudianteId).eq("estado", "ACTIVO")).unique();
      const estudiante = await ctx.db.get(matricula.estudianteId);
      if (vinculo === null || estudiante === null) continue;
      familias.push({ estudianteId: estudiante._id, nombre: `${estudiante.nombres} ${estudiante.apellidos}`, representanteId: vinculo.representanteId });
    }
    familias.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    return await Promise.all(comunicados.map(async (c) => {
      const vistas = await ctx.db.query("vistaComunicado")
        .withIndex("por_comunicado_representante", (q) => q.eq("comunicadoCursoId", c._id)).collect();
      const loVieron = new Set(vistas.map((vista) => vista.representanteId));
      const alcanzadas = c.alcance === "CURSO" ? familias : familias.filter((f) => f.estudianteId === c.estudianteId);
      const faltan = alcanzadas.filter((f) => !loVieron.has(f.representanteId));
      return {
        id: c._id, tipo: c.tipo, titulo: c.titulo, publicadoEn: c._creationTime, visibleHasta: c.visibleHasta,
        familias: alcanzadas.length, vistos: alcanzadas.length - faltan.length,
        faltan: faltan.map((f) => f.nombre),
      };
    }));
  }),
});

/** Los días de reporte que ve el docente: una semana de clases. */
const DIAS_DE_LECTURAS = 5;
/** "Reportes anteriores" muestra a lo sumo siete (premium); esto deja margen. */
const REPORTES_VISTOS_POR_LLAMADA = 20;

/**
 * Quién abrió el reporte de cada uno de los últimos días, y quién falta.
 *
 * Lo mismo que `comunicadosPublicados`, para lo que más se usa: el reporte del
 * día. Una familia es una entrega (`entregaReporte`): el reporte de un
 * estudiante enviado a su representante. Si un estudiante no tuvo reporte ese
 * día —el cierre nocturno solo lo genera cuando hubo anotaciones—, ese día no
 * lo cuenta. "Abrió", no "leyó": se registra cuando la familia tiene el reporte
 * en pantalla, el del día (`registrarLecturaSensible`) o después, en "Reportes
 * anteriores" (`marcarReportesVistos`).
 */
export const lecturasDeReportes = query({
  args: { cursoId: v.id("curso") },
  handler: (ctx, args) => conErroresPublicos(async () => {
    await exigirTitularDelCurso(ctx, args.cursoId);
    const matriculas = await ctx.db.query("matricula")
      .withIndex("por_curso_estado", (q) => q.eq("cursoId", args.cursoId).eq("estado", "CURSANDO")).collect();
    const porFecha = new Map<string, { fecha: string; familias: number; abiertos: number; faltan: string[] }>();
    for (const matricula of matriculas) {
      const estudiante = await ctx.db.get(matricula.estudianteId);
      const nombre = estudiante === null ? "Estudiante" : `${estudiante.nombres} ${estudiante.apellidos}`;
      // Los días más recientes del curso están entre los últimos de cada
      // estudiante: si alguien tuviera cinco reportes más nuevos que un día,
      // ese día ya no sería de los cinco más recientes del curso.
      const reportes = await ctx.db.query("reporteEstudiante")
        .withIndex("por_matricula_fecha", (q) => q.eq("matriculaId", matricula._id))
        .order("desc").take(DIAS_DE_LECTURAS);
      for (const reporte of reportes) {
        const entrega = await ctx.db.query("entregaReporte")
          .withIndex("por_reporte_representante", (q) => q.eq("reporteEstudianteId", reporte._id)).first();
        if (entrega === null) continue;
        const dia = porFecha.get(reporte.fecha) ?? { fecha: reporte.fecha, familias: 0, abiertos: 0, faltan: [] };
        dia.familias++;
        if (entrega.leidoEn !== undefined) dia.abiertos++;
        else dia.faltan.push(nombre);
        porFecha.set(reporte.fecha, dia);
      }
    }
    return [...porFecha.values()]
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, DIAS_DE_LECTURAS)
      .map((dia) => ({ ...dia, faltan: dia.faltan.sort((a, b) => a.localeCompare(b, "es")) }));
  }),
});

/**
 * La familia tuvo estos reportes en pantalla, en "Reportes anteriores".
 *
 * Sin esto, un reporte publicado a las 22:00 por el cierre nocturno y leído a
 * la mañana siguiente nunca contaba como abierto: `registrarLecturaSensible`
 * solo lo marca desde el reporte del día, y a la mañana siguiente ese ya es
 * otro. Solo marca reportes de este hijo, entregados a este representante, y
 * nunca pisa la primera vez que se abrió.
 */
export const marcarReportesVistos = mutation({
  args: { estudianteId: v.id("estudiante"), reporteEstudianteIds: v.array(v.id("reporteEstudiante")) },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const vinculo = await exigirVinculo(ctx, args.estudianteId);
    if (args.reporteEstudianteIds.length > REPORTES_VISTOS_POR_LLAMADA) {
      throw new ErrorDominio("VALIDACION", "Son demasiados reportes de una sola vez.");
    }
    let marcados = 0;
    for (const reporteId of new Set(args.reporteEstudianteIds)) {
      const reporte = await ctx.db.get(reporteId);
      const matricula = reporte === null ? null : await ctx.db.get(reporte.matriculaId);
      if (matricula === null || matricula.estudianteId !== args.estudianteId) continue;
      const entrega = await ctx.db.query("entregaReporte")
        .withIndex("por_reporte_representante", (q) => q.eq("reporteEstudianteId", reporteId).eq("representanteId", vinculo.representanteId))
        .unique();
      if (entrega === null || entrega.leidoEn !== undefined) continue;
      await ctx.db.patch(entrega._id, { leidoEn: Date.now() });
      marcados++;
    }
    return marcados;
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
      const periodo = await periodoVigentePorFecha(ctx, curso.anioLectivoId, fecha);
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

/**
 * Resumen de la semana por push, sábado 09:00 de Guayaquil (cron en
 * `crons.ts`). Sin esto el resumen de `resumenDeLaSemana` solo existía para
 * la familia que abría la aplicación un fin de semana por su cuenta.
 *
 * Sábado por la mañana y no viernes por la tarde, por dos razones: el viernes
 * el `cierreNocturno` todavía no ha corrido y lo que el docente anote esa
 * tarde quedaría fuera; y la notificación abre el reporte de hoy, que un
 * sábado **ya muestra este mismo resumen** — un viernes mostraría el reporte
 * del viernes y el aviso hablaría de algo que no está en pantalla.
 *
 * Reparte un curso por transacción: con todos juntos, un colegio grande
 * pasaría de los límites de una sola mutación.
 */
export const enviarResumenesSemanales = internalMutation({
  args: { fecha: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const fecha = args.fecha ?? hoyEnGuayaquil();
    const cursos = await ctx.db.query("curso")
      .filter((q) => q.eq(q.field("estado"), "ACTIVO")).collect();
    for (const curso of cursos) {
      await ctx.scheduler.runAfter(0, internal.conducta.resumenSemanalDelCurso, { cursoId: curso._id, fecha });
    }
    return cursos.length;
  },
});

/**
 * Hubo al menos un día de clases en los siete días que cubre el resumen. En
 * vacaciones o entre parciales "sin novedades esta semana" sería tan falso
 * como lo era "todavía no hay reporte de hoy" un sábado: no hubo semana.
 */
async function huboClasesEnLaSemana(ctx: MutationCtx, anioLectivoId: Id<"anioLectivo">, hasta: string) {
  for (let atras = 6; atras >= 0; atras--) {
    const dia = sumarDias(hasta, -atras);
    if (esFinDeSemana(dia)) continue;
    if (await periodoVigentePorFecha(ctx, anioLectivoId, dia) === null) continue;
    const noLectivo = await ctx.db.query("diaNoLectivo")
      .withIndex("por_anio_fecha", (q) => q.eq("anioLectivoId", anioLectivoId).eq("fecha", dia)).first();
    if (noLectivo === null) return true;
  }
  return false;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** El texto de la bandeja. El push que llega al teléfono es genérico (ver `push.ts`). */
export function textoResumenSemanal(positivas: number, negativas: number): string {
  if (positivas === 0 && negativas === 0) return "Semana sin anotaciones de conducta.";
  const buenas = plural(positivas, "anotación positiva", "anotaciones positivas");
  if (negativas === 0) return `Esta semana: ${buenas}.`;
  if (positivas === 0) return `Esta semana: ${plural(negativas, "anotación", "anotaciones")} por mejorar.`;
  return `Esta semana: ${buenas} y ${negativas} por mejorar.`;
}

export const resumenSemanalDelCurso = internalMutation({
  args: { cursoId: v.id("curso"), fecha: v.string() },
  handler: async (ctx, args) => {
    const curso = await ctx.db.get(args.cursoId);
    if (curso === null || curso.estado !== "ACTIVO") return 0;
    if (!await huboClasesEnLaSemana(ctx, curso.anioLectivoId, args.fecha)) return 0;
    const matriculas = await ctx.db.query("matricula")
      .withIndex("por_curso_estado", (q) => q.eq("cursoId", curso._id).eq("estado", "CURSANDO"))
      .collect();
    let enviados = 0;
    for (const matricula of matriculas) {
      const estudiante = await ctx.db.get(matricula.estudianteId);
      if (estudiante === null) continue;
      const vinculos = await ctx.db.query("vinculoRepresentacion")
        .withIndex("por_estudiante_estado", (q) => q.eq("estudianteId", matricula.estudianteId).eq("estado", "ACTIVO"))
        .collect();
      if (vinculos.length === 0) continue;
      const resumen = await resumenDeLaSemana(ctx, matricula, args.fecha);
      const cuerpo = textoResumenSemanal(
        resumen.acciones.filter((a) => a.signo === "POSITIVA").length,
        resumen.acciones.filter((a) => a.signo === "NEGATIVA").length,
      );
      for (const vinculo of vinculos) {
        const representante = await ctx.db.get(vinculo.representanteId);
        if (representante === null) continue;
        await notificar(
          ctx, representante.perfilUsuarioId, "RESUMEN_SEMANAL",
          `La semana de ${estudiante.nombres}`, cuerpo, "estudiante", estudiante._id,
        );
        enviados++;
      }
    }
    return enviados;
  },
});
