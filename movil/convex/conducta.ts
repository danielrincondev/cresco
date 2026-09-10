import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { ErrorDominio, exigirTopeDiario, calcularPuntaje, hoyEnGuayaquil } from "./lib/guardas";
import { ErrorPermiso, auditar, exigirAccesoDocenteAEstudiante } from "./lib/permisos";

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

export const registrarAccion = mutation({
  args: { estudianteId: v.id("estudiante"), tipoAccionId: v.id("tipoAccion"), descripcion: v.string(), puntosAplicados: v.number(), fechaOcurrencia: v.optional(v.string()) },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const { docente, matricula } = await exigirAccesoDocenteAEstudiante(ctx, args.estudianteId);
    const { curso, anio, institucion } = await institucionDeMatricula(ctx, matricula._id);
    const periodo = await ctx.db.query("periodoAcademico")
      .withIndex("por_anio_orden", (q) => q.eq("anioLectivoId", curso.anioLectivoId))
      .filter((q) => q.eq(q.field("estado"), "EN_CURSO")).first();
    if (periodo === null) throw new ErrorDominio("PERIODO_CERRADO", "No hay un período académico en curso para registrar acciones.");
    const descripcion = args.descripcion.trim();
    if (!descripcion) throw new ErrorDominio("VALIDACION", "La descripción de la acción es obligatoria.");
    const tipo = await ctx.db.get(args.tipoAccionId);
    if (tipo === null || !tipo.activa) throw new ErrorDominio("VALIDACION", "Tipo de acción inválido o inactivo.");
    if (args.puntosAplicados < tipo.puntosMin || args.puntosAplicados > tipo.puntosMax) throw new ErrorDominio("VALIDACION", `Los puntos aplicados deben estar entre ${tipo.puntosMin} y ${tipo.puntosMax}.`);
    const fecha = args.fechaOcurrencia ?? hoyEnGuayaquil();
    const hoy = await ctx.db.query("accionRegistrada").withIndex("por_matricula_fecha", (q) => q.eq("matriculaId", matricula._id).eq("fechaOcurrencia", fecha)).collect();
    exigirTopeDiario(hoy.filter((a) => a.estado === "VIGENTE" && a.signo === tipo.signo).reduce((s, a) => s + a.puntosAplicados, 0), args.puntosAplicados);
    const id = await ctx.db.insert("accionRegistrada", { matriculaId: matricula._id, periodoAcademicoId: periodo._id, tipoAccionId: tipo._id, categoriaAccionId: tipo.categoriaAccionId, signo: tipo.signo, puntosAplicados: args.puntosAplicados, cuentaEnBitacora: tipo.cuentaEnBitacora, descripcion, fechaOcurrencia: fecha, registradaPorDocenteId: docente._id, estado: "VIGENTE", actualizadoEn: Date.now() });
    const fila = await ctx.db.query("puntajePeriodo").withIndex("por_matricula_periodo", (q) => q.eq("matriculaId", matricula._id).eq("periodoAcademicoId", periodo._id)).unique();
    if (fila === null) {
      const actual = calcularPuntaje([args.puntosAplicados], institucion.puntajeBase, institucion.puntajeMinimo, institucion.puntajeMaximo);
      await ctx.db.insert("puntajePeriodo", { matriculaId: matricula._id, periodoAcademicoId: periodo._id, puntajeBase: institucion.puntajeBase, puntosPositivos: args.puntosAplicados > 0 ? args.puntosAplicados : 0, puntosNegativos: args.puntosAplicados < 0 ? args.puntosAplicados : 0, puntajeActual: actual, franjaConductaId: await franjaDe(ctx, actual), congelado: false, recalculadoEn: Date.now() });
    } else await recalcularPuntaje(ctx, matricula._id, periodo._id);
    await auditar(ctx, { accion: "CREAR", entidadTipo: "accionRegistrada", entidadId: id, institucionId: anio.institucionId, datosDespues: { matriculaId: matricula._id, tipoAccionId: tipo._id, puntosAplicados: args.puntosAplicados, fechaOcurrencia: fecha } });
    return id;
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
