import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { exigirAccesoDocenteAEstudiante, auditar } from "./lib/permisos";
import { ErrorDominio, exigirTopeDiario, calcularPuntaje, hoyEnGuayaquil } from "./lib/guardas";

export const registrarAccion = mutation({
  args: {
    estudianteId: v.id("estudiante"),
    tipoAccionId: v.id("tipoAccion"),
    descripcion: v.string(),
    puntosAplicados: v.number(),
    fechaOcurrencia: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Verificaciones de acceso y contexto
    const { docente, matricula } = await exigirAccesoDocenteAEstudiante(ctx, args.estudianteId);
    
    const curso = await ctx.db.get(matricula.cursoId);
    if (!curso) throw new Error("Curso no encontrado");

    const periodo = await ctx.db
      .query("periodoAcademico")
      .withIndex("por_anio_orden", (q) => q.eq("anioLectivoId", curso.anioLectivoId))
      .filter((q) => q.eq(q.field("estado"), "EN_CURSO"))
      .first();

    if (!periodo) {
      throw new ErrorDominio("PERIODO_CERRADO", "No hay un periodo académico en curso para registrar acciones.");
    }

    const descripcionLimpia = args.descripcion.trim();
    if (!descripcionLimpia) {
      throw new ErrorDominio("VALIDACION", "La descripción de la acción es obligatoria.");
    }

    // 2. Verificar tipo de acción
    const tipo = await ctx.db.get(args.tipoAccionId);
    if (!tipo || !tipo.activa) {
      throw new ErrorDominio("VALIDACION", "Tipo de acción inválido o inactivo.");
    }

    if (args.puntosAplicados < tipo.puntosMin || args.puntosAplicados > tipo.puntosMax) {
       throw new ErrorDominio("VALIDACION", `Los puntos aplicados deben estar entre ${tipo.puntosMin} y ${tipo.puntosMax}.`);
    }

    const fecha = args.fechaOcurrencia ?? hoyEnGuayaquil();

    // 3. Validar el tope diario
    const accionesDeHoy = await ctx.db
      .query("accionRegistrada")
      .withIndex("por_matricula_fecha", (q) => q.eq("matriculaId", matricula._id).eq("fechaOcurrencia", fecha))
      .filter(q => q.eq(q.field("estado"), "VIGENTE"))
      .collect();

    // Sumar los puntos previos DEL MISMO SIGNO para aplicar el tope correspondiente
    const puntosPrevios = accionesDeHoy
        .filter(a => a.signo === tipo.signo)
        .reduce((sum, a) => sum + a.puntosAplicados, 0);

    exigirTopeDiario(puntosPrevios, args.puntosAplicados);

    // 4. Registrar la acción
    const idAccion = await ctx.db.insert("accionRegistrada", {
      matriculaId: matricula._id,
      periodoAcademicoId: periodo._id,
      tipoAccionId: tipo._id,
      categoriaAccionId: tipo.categoriaAccionId,
      signo: tipo.signo,
      puntosAplicados: args.puntosAplicados,
      cuentaEnBitacora: tipo.cuentaEnBitacora,
      descripcion: descripcionLimpia,
      fechaOcurrencia: fecha,
      registradaPorDocenteId: docente._id,
      estado: "VIGENTE",
      actualizadoEn: Date.now(),
    });

    // 5. Recalcular puntajePeriodo
    const anioLectivo = await ctx.db.get(curso.anioLectivoId);
    if (!anioLectivo) throw new Error("Año lectivo no encontrado");
    
    const institucion = await ctx.db.get(anioLectivo.institucionId);
    if (!institucion) throw new Error("Institución no encontrada");

    // Recolectar todas las acciones vigentes del estudiante en el periodo actual
    const accionesVigentes = await ctx.db
        .query("accionRegistrada")
        .withIndex("por_matricula_periodo", q => 
            q.eq("matriculaId", matricula._id)
             .eq("periodoAcademicoId", periodo._id)
             .eq("estado", "VIGENTE")
        )
        .collect();

    const puntosVigentes = accionesVigentes.map(a => a.puntosAplicados);
    const nuevoPuntaje = calcularPuntaje(
        puntosVigentes, 
        institucion.puntajeBase, 
        institucion.puntajeMinimo, 
        institucion.puntajeMaximo
    );

    const puntosPositivos = accionesVigentes
        .filter(a => a.signo === "POSITIVA")
        .reduce((s, a) => s + a.puntosAplicados, 0);
        
    const puntosNegativos = accionesVigentes
        .filter(a => a.signo === "NEGATIVA")
        .reduce((s, a) => s + a.puntosAplicados, 0);

    const puntajePeriodo = await ctx.db
        .query("puntajePeriodo")
        .withIndex("por_matricula_periodo", q => 
            q.eq("matriculaId", matricula._id)
             .eq("periodoAcademicoId", periodo._id)
        )
        .unique();

    if (puntajePeriodo) {
        if (!puntajePeriodo.congelado) {
             await ctx.db.patch(puntajePeriodo._id, {
                puntosPositivos,
                puntosNegativos,
                puntajeActual: nuevoPuntaje,
                recalculadoEn: Date.now()
             });
        }
    } else {
        await ctx.db.insert("puntajePeriodo", {
            matriculaId: matricula._id,
            periodoAcademicoId: periodo._id,
            puntajeBase: institucion.puntajeBase,
            puntosPositivos,
            puntosNegativos,
            puntajeActual: nuevoPuntaje,
            congelado: false,
            recalculadoEn: Date.now(),
        });
    }

    // 6. Auditoría
    await auditar(ctx, {
      accion: "CREAR",
      entidadTipo: "accionRegistrada",
      entidadId: idAccion,
      institucionId: anioLectivo.institucionId,
      datosDespues: {
        tipoAccionId: args.tipoAccionId,
        puntosAplicados: args.puntosAplicados,
        fechaOcurrencia: fecha
      }
    });

    return idAccion;
  }
});
