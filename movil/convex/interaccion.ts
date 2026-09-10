/**
 * Módulo de interacción — citas, inconformidades, alertas y notificaciones.
 *
 * Dueño: Persona C. Consume `lib/permisos.ts` y `lib/guardas.ts`; no duplica
 * ninguna regla que ya viva ahí.
 *
 * Nota de seguridad que aplica a todo este archivo: con Convex no hay RLS.
 * Si se olvida una comprobación de permisos, la consulta **devuelve los
 * datos** en vez de fallar — lo contrario de lo que hacía PostgreSQL. Por eso
 * cada función pública empieza llamando a `permisos.ts`, sin excepción.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  ALCANCE_ALERTA,
  MODALIDAD,
  MOTIVO_INCONFORMIDAD,
  PLATAFORMA,
  REGLAS,
  TIPO_ALERTA,
} from "./lib/enums";
import {
  ErrorDominio,
  exigirAlcanceCoherente,
  exigirRangoHoras,
  exigirResolucionInconformidad,
  hoyEnGuayaquil,
} from "./lib/guardas";
import {
  auditar,
  exigirDocente,
  exigirPerfil,
  exigirRepresentante,
  exigirTitularDelCurso,
  exigirVinculo,
} from "./lib/permisos";

const modalidad = v.union(...MODALIDAD.map((x) => v.literal(x)));
const motivoInconformidad = v.union(...MOTIVO_INCONFORMIDAD.map((x) => v.literal(x)));
const tipoAlerta = v.union(...TIPO_ALERTA.map((x) => v.literal(x)));
const alcanceAlerta = v.union(...ALCANCE_ALERTA.map((x) => v.literal(x)));
const plataforma = v.union(...PLATAFORMA.map((x) => v.literal(x)));

const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;

/** Los estados en los que una cita todavía ocupa el bloque de horario. */
const CITA_VIVA = ["SOLICITADA", "CONFIRMADA"] as const;

function exigirTexto(valor: string, campo: string): string {
  const limpio = valor.trim();
  if (!limpio) throw new ErrorDominio("VALIDACION", `${campo} es obligatorio.`);
  return limpio;
}

function exigirFormatoHora(hora: string, campo: string): void {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
    throw new ErrorDominio("VALIDACION", `${campo} debe tener el formato HH:MM.`);
  }
}

/** Crea una notificación en bandeja. El envío push real es un paso aparte. */
async function notificar(
  ctx: MutationCtx,
  perfilUsuarioId: Id<"perfilUsuario">,
  tipo: Doc<"notificacion">["tipo"],
  titulo: string,
  cuerpo: string,
  entidadTipo?: string,
  entidadId?: string,
): Promise<Id<"notificacion">> {
  return await ctx.db.insert("notificacion", {
    perfilUsuarioId,
    tipo,
    titulo,
    cuerpo,
    entidadTipo,
    entidadId,
  });
}

/* ------------------------------------------------------------------ *
 *  DISPONIBILIDAD Y CITAS  (F1, F2)
 * ------------------------------------------------------------------ */

/**
 * El docente publica un bloque de atención.
 *
 * El docente **no elige libremente su horario**: en un plantel fiscal la
 * institución le asigna franjas fijas (p. ej. martes y jueves de 12:30 a
 * 13:00). Esto salió de las entrevistas del 1 de septiembre. Por eso la
 * función no impone un horario propio: publica lo que el docente declare.
 */
export const publicarDisponibilidad = mutation({
  args: {
    fecha: v.string(),
    horaInicio: v.string(),
    horaFin: v.string(),
    modalidad: v.optional(modalidad),
    cursoId: v.optional(v.id("curso")),
    lugarOEnlace: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const docente = await exigirDocente(ctx);
    exigirFormatoHora(args.horaInicio, "La hora de inicio");
    exigirFormatoHora(args.horaFin, "La hora de fin");
    exigirRangoHoras(args.horaInicio, args.horaFin);

    if (args.fecha < hoyEnGuayaquil()) {
      throw new ErrorDominio("FECHAS_INVALIDAS", "No se puede publicar un horario en el pasado.");
    }
    if (args.cursoId !== undefined) await exigirTitularDelCurso(ctx, args.cursoId);

    // Convex no tiene UNIQUE INDEX: la unicidad del bloque se comprueba aquí,
    // dentro de la misma mutation, que es serializable.
    const delDia = await ctx.db
      .query("disponibilidadDocente")
      .withIndex("por_docente_fecha", (q) => q.eq("docenteId", docente._id).eq("fecha", args.fecha))
      .collect();
    const solapa = delDia.some(
      (b) =>
        b.estado !== "CANCELADO" &&
        args.horaInicio < b.horaFin &&
        b.horaInicio < args.horaFin,
    );
    if (solapa) {
      throw new ErrorDominio("CONFLICTO", "Ya tienes un bloque publicado que se cruza con este.");
    }

    return await ctx.db.insert("disponibilidadDocente", {
      docenteId: docente._id,
      cursoId: args.cursoId,
      fecha: args.fecha,
      horaInicio: args.horaInicio,
      horaFin: args.horaFin,
      modalidad: args.modalidad ?? "PRESENCIAL",
      lugarOEnlace: args.lugarOEnlace?.trim() || undefined,
      estado: "DISPONIBLE",
      actualizadoEn: Date.now(),
    });
  },
});

/**
 * Bloques libres del docente titular de un estudiante, para que su
 * representante elija (P8).
 *
 * Recibe el estudiante, no el docente: así el permiso se comprueba contra un
 * vínculo real. Si recibiera `docenteId`, cualquier usuario autenticado
 * podría listar el horario de cualquier docente del sistema.
 */
export const bloquesDisponibles = query({
  args: { estudianteId: v.id("estudiante"), desde: v.string() },
  handler: async (ctx, args) => {
    await exigirVinculo(ctx, args.estudianteId);

    const matricula = await ctx.db
      .query("matricula")
      .withIndex("por_estudiante_estado", (q) =>
        q.eq("estudianteId", args.estudianteId).eq("estado", "CURSANDO"),
      )
      .unique();
    if (matricula === null) return [];

    const titulares = await ctx.db
      .query("asignacionDocente")
      .withIndex("por_curso_rol", (q) => q.eq("cursoId", matricula.cursoId).eq("rol", "TITULAR"))
      .collect();
    const titular = titulares.find((t) => t.vigenteHasta === undefined);
    if (titular === undefined) return [];

    const bloques = await ctx.db
      .query("disponibilidadDocente")
      .withIndex("por_docente_fecha", (q) =>
        q.eq("docenteId", titular.docenteId).gte("fecha", args.desde),
      )
      .collect();

    return bloques
      .filter((b) => b.estado === "DISPONIBLE")
      .map((b) => ({
        id: b._id,
        docenteId: b.docenteId,
        fecha: b.fecha,
        horaInicio: b.horaInicio,
        horaFin: b.horaFin,
        modalidad: b.modalidad,
        lugarOEnlace: b.lugarOEnlace,
        duracionMinutos: REGLAS.CITA_MINUTOS,
      }));
  },
});

/**
 * El representante reserva un bloque. Nace `SOLICITADA`: **requiere
 * confirmación del docente** (F2), no queda cerrada por reservar.
 */
export const solicitarCita = mutation({
  args: {
    disponibilidadDocenteId: v.id("disponibilidadDocente"),
    estudianteId: v.id("estudiante"),
    motivo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const representante = await exigirRepresentante(ctx);
    await exigirVinculo(ctx, args.estudianteId);

    const bloque = await ctx.db.get(args.disponibilidadDocenteId);
    if (bloque === null) throw new ErrorDominio("NO_ENCONTRADO", "Ese horario ya no existe.");
    if (bloque.estado !== "DISPONIBLE") {
      throw new ErrorDominio("CONFLICTO", "Ese horario ya no está disponible.");
    }

    // ux_cita_bloque_vivo: un bloque no admite dos reservas vivas a la vez.
    for (const estado of CITA_VIVA) {
      const ocupado = await ctx.db
        .query("cita")
        .withIndex("por_bloque_estado", (q) =>
          q.eq("disponibilidadDocenteId", args.disponibilidadDocenteId).eq("estado", estado),
        )
        .first();
      if (ocupado !== null) {
        throw new ErrorDominio("CONFLICTO", "Otro representante acaba de reservar ese horario.");
      }
    }

    const inicio = new Date(`${bloque.fecha}T${bloque.horaInicio}:00-05:00`).getTime();
    const fin = inicio + REGLAS.CITA_MINUTOS * MINUTO;
    const ahora = Date.now();

    const citaId = await ctx.db.insert("cita", {
      disponibilidadDocenteId: bloque._id,
      docenteId: bloque.docenteId,
      representanteId: representante._id,
      estudianteId: args.estudianteId,
      origen: "SOLICITADA_POR_REPRESENTANTE",
      motivo: args.motivo?.trim() || undefined,
      fechaHoraInicio: inicio,
      fechaHoraFin: fin,
      modalidad: bloque.modalidad,
      estado: "SOLICITADA",
      actualizadoEn: ahora,
    });

    await ctx.db.patch(bloque._id, { estado: "RESERVADO", actualizadoEn: ahora });

    const docente = await ctx.db.get(bloque.docenteId);
    if (docente !== null) {
      await notificar(
        ctx,
        docente.perfilUsuarioId,
        "CITACION",
        "Nueva solicitud de cita",
        `Un representante solicitó el bloque del ${bloque.fecha} a las ${bloque.horaInicio}.`,
        "cita",
        citaId,
      );
    }
    return citaId;
  },
});

/** El docente confirma o rechaza. Rechazar libera el bloque. */
export const responderCita = mutation({
  args: {
    citaId: v.id("cita"),
    aceptar: v.boolean(),
    notasDocente: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const docente = await exigirDocente(ctx);
    const cita = await ctx.db.get(args.citaId);
    if (cita === null) throw new ErrorDominio("NO_ENCONTRADO", "La cita no existe.");
    if (cita.docenteId !== docente._id) {
      throw new ErrorDominio("SIN_PERMISO", "Esa cita no es tuya.");
    }
    if (cita.estado !== "SOLICITADA") {
      throw new ErrorDominio("CONFLICTO", "Esa cita ya fue respondida.");
    }

    const ahora = Date.now();
    await ctx.db.patch(cita._id, {
      estado: args.aceptar ? "CONFIRMADA" : "RECHAZADA",
      notasDocente: args.notasDocente?.trim() || undefined,
      actualizadoEn: ahora,
    });

    if (!args.aceptar && cita.disponibilidadDocenteId !== undefined) {
      await ctx.db.patch(cita.disponibilidadDocenteId, {
        estado: "DISPONIBLE",
        actualizadoEn: ahora,
      });
    }

    const representante = await ctx.db.get(cita.representanteId);
    if (representante !== null) {
      await notificar(
        ctx,
        representante.perfilUsuarioId,
        "CITACION",
        args.aceptar ? "Tu cita fue confirmada" : "Tu cita no fue confirmada",
        args.notasDocente?.trim() ?? "",
        "cita",
        cita._id,
      );
    }
    return cita._id;
  },
});

/** Citas del representante autenticado (P8). */
export const misCitasRepresentante = query({
  args: {},
  handler: async (ctx) => {
    const representante = await exigirRepresentante(ctx);
    const citas = await ctx.db
      .query("cita")
      .withIndex("por_representante", (q) => q.eq("representanteId", representante._id))
      .collect();
    return citas.sort((a, b) => b.fechaHoraInicio - a.fechaHoraInicio);
  },
});

/** Citas del docente autenticado (D16). */
export const misCitasDocente = query({
  args: {},
  handler: async (ctx) => {
    const docente = await exigirDocente(ctx);
    const citas = await ctx.db
      .query("cita")
      .withIndex("por_docente", (q) => q.eq("docenteId", docente._id))
      .collect();
    return citas.sort((a, b) => a.fechaHoraInicio - b.fechaHoraInicio);
  },
});

/* ------------------------------------------------------------------ *
 *  INCONFORMIDADES  (F3, F4)
 * ------------------------------------------------------------------ */

async function estudianteDeAccion(
  ctx: QueryCtx,
  accion: Doc<"accionRegistrada">,
): Promise<Id<"estudiante">> {
  const matricula = await ctx.db.get(accion.matriculaId);
  if (matricula === null) {
    throw new ErrorDominio("NO_ENCONTRADO", "La matrícula de esa acción no existe.");
  }
  return matricula.estudianteId;
}

/**
 * El representante reclama una acción.
 *
 * Solo sobre **negativas vigentes** (C8): una acción positiva no se disputa,
 * y una ya anulada o modificada no tiene nada que reclamar.
 */
export const abrirInconformidad = mutation({
  args: {
    accionRegistradaId: v.id("accionRegistrada"),
    motivo: motivoInconformidad,
    mensaje: v.string(),
  },
  handler: async (ctx, args) => {
    const representante = await exigirRepresentante(ctx);

    const accion = await ctx.db.get(args.accionRegistradaId);
    if (accion === null) throw new ErrorDominio("NO_ENCONTRADO", "Esa acción no existe.");

    // El vínculo se comprueba contra el estudiante dueño de la acción, no
    // contra un id que venga por argumento: así nadie puede reclamar la
    // acción de un hijo ajeno pasando el estudianteId propio.
    await exigirVinculo(ctx, await estudianteDeAccion(ctx, accion));

    if (accion.signo !== "NEGATIVA") {
      throw new ErrorDominio("VALIDACION", "Solo se pueden reclamar las acciones negativas.");
    }
    if (accion.estado !== "VIGENTE") {
      throw new ErrorDominio("CONFLICTO", "Esa acción ya fue anulada o modificada.");
    }

    const previa = await ctx.db
      .query("inconformidad")
      .withIndex("por_accion_representante", (q) =>
        q
          .eq("accionRegistradaId", args.accionRegistradaId)
          .eq("representanteId", representante._id),
      )
      .first();
    if (previa !== null) {
      throw new ErrorDominio("CONFLICTO", "Ya abriste un reclamo sobre esta acción.");
    }

    const ahora = Date.now();
    const inconformidadId = await ctx.db.insert("inconformidad", {
      accionRegistradaId: args.accionRegistradaId,
      representanteId: representante._id,
      motivo: args.motivo,
      mensaje: exigirTexto(args.mensaje, "El mensaje del reclamo"),
      estado: "ABIERTA",
      // F3: el docente tiene 30 días. El plazo sale de REGLAS, no de un
      // número escrito aquí.
      venceEn: ahora + REGLAS.INCONFORMIDAD_DIAS_PLAZO * DIA,
      actualizadoEn: ahora,
    });

    const docente = await ctx.db.get(accion.registradaPorDocenteId);
    if (docente !== null) {
      await notificar(
        ctx,
        docente.perfilUsuarioId,
        "RESPUESTA_INCONFORMIDAD",
        "Un representante abrió un reclamo",
        args.mensaje.trim(),
        "inconformidad",
        inconformidadId,
      );
    }
    return inconformidadId;
  },
});

/**
 * Bandeja del docente (D15), con lo más próximo a vencer primero.
 *
 * No calcula "vencida" aquí: `Date.now()` dentro de un `query` rompe la
 * reactividad de Convex, porque el resultado dejaría de depender solo de los
 * datos. Por eso el estado lo escribe el cron `vencerInconformidades`.
 *
 * ⚠️ **Esta consulta lee todos los reclamos abiertos del sistema, no solo los
 * de este docente**, y filtra en memoria. El comentario anterior afirmaba lo
 * contrario y era falso: `por_estado_vence` empieza por `estado`, así que
 * `eq("estado", "ABIERTA")` selecciona los de todos los docentes de todas las
 * instituciones.
 *
 * No se arregla aquí porque `inconformidad` no tiene por dónde filtrar por
 * docente: el vínculo con él va por `accionRegistrada.registradaPorDocenteId`,
 * a un salto de distancia. La solución es un campo `docenteId` y un índice
 * `por_docente_estado`, que es superficie compartida y va en su propio PR
 * (issue #48). Para el piloto —una institución, pocos reclamos— no muerde;
 * a escala sí.
 */
export const inconformidadesDelDocente = query({
  args: {},
  handler: async (ctx) => {
    const docente = await exigirDocente(ctx);

    // `VENCIDA` sigue en la bandeja a proposito: el esquema dice que al vencer
    // "sube de prioridad", no que desaparezca. Como se ordena por `venceEn`
    // ascendente y las vencidas son las mas antiguas, quedan primeras solas.
    // Y `resolverInconformidad` las sigue aceptando: responder tarde es mejor
    // que no responder.
    const enCurso: Doc<"inconformidad">[] = [];
    for (const estado of ["ABIERTA", "EN_REVISION", "VENCIDA"] as const) {
      const lote = await ctx.db
        .query("inconformidad")
        .withIndex("por_estado_vence", (q) => q.eq("estado", estado))
        .collect();
      enCurso.push(...lote);
    }

    const mias = [];
    for (const i of enCurso) {
      const accion = await ctx.db.get(i.accionRegistradaId);
      if (accion === null || accion.registradaPorDocenteId !== docente._id) continue;
      mias.push({
        id: i._id,
        motivo: i.motivo,
        mensaje: i.mensaje,
        estado: i.estado,
        venceEn: i.venceEn,
        accion: {
          id: accion._id,
          descripcion: accion.descripcion,
          puntosAplicados: accion.puntosAplicados,
          fechaOcurrencia: accion.fechaOcurrencia,
          estado: accion.estado,
        },
      });
    }
    return mias.sort((a, b) => a.venceEn - b.venceEn);
  },
});

/**
 * El docente resuelve el reclamo.
 *
 * Tres desenlaces (F4):
 * - `MANTENIDA` — la acción queda como está.
 * - `MODIFICADA` — la acción pasa a `MODIFICADA`, vale 0 puntos.
 * - `ANULADA` — la acción pasa a `ANULADA`, vale 0 puntos.
 *
 * ⚠️ **Coordinación pendiente con Persona B (#9).** Poner la acción en 0 exige
 * recalcular `puntajePeriodo`, y ese recálculo es del módulo de conducta —
 * no se duplica aquí. Mientras `conducta.ts` no exponga esa función, esta
 * mutation deja la acción en su estado final correcto y **marca el puntaje
 * como pendiente de recálculo**; el día que exista, se llama desde aquí.
 * Ver el comentario `RECALCULO_PENDIENTE` más abajo.
 */
export const resolverInconformidad = mutation({
  args: {
    inconformidadId: v.id("inconformidad"),
    desenlace: v.union(
      v.literal("MANTENIDA"),
      v.literal("MODIFICADA"),
      v.literal("ANULADA"),
    ),
    respuestaDocente: v.string(),
  },
  handler: async (ctx, args) => {
    const docente = await exigirDocente(ctx);

    const inconformidad = await ctx.db.get(args.inconformidadId);
    if (inconformidad === null) {
      throw new ErrorDominio("NO_ENCONTRADO", "Ese reclamo no existe.");
    }
    const accion = await ctx.db.get(inconformidad.accionRegistradaId);
    if (accion === null) throw new ErrorDominio("NO_ENCONTRADO", "La acción ya no existe.");
    if (accion.registradaPorDocenteId !== docente._id) {
      throw new ErrorDominio("SIN_PERMISO", "Ese reclamo es sobre una acción que no registraste.");
    }
    if (inconformidad.estado.startsWith("RESUELTA_")) {
      throw new ErrorDominio("CONFLICTO", "Ese reclamo ya fue resuelto.");
    }

    const ahora = Date.now();
    const respuesta = exigirTexto(args.respuestaDocente, "La respuesta al representante");
    const estado = `RESUELTA_${args.desenlace}` as Doc<"inconformidad">["estado"];

    // La guarda exige que resolver traiga respuesta y fecha: no se puede
    // cerrar un reclamo en silencio.
    exigirResolucionInconformidad(estado, respuesta, ahora);

    await ctx.db.patch(inconformidad._id, {
      estado,
      respuestaDocente: respuesta,
      resueltaPorDocenteId: docente._id,
      resueltaEn: ahora,
      actualizadoEn: ahora,
    });

    if (args.desenlace !== "MANTENIDA") {
      // F4: la acción deja de sumar. El puntaje NUNCA se ajusta a mano
      // (ADR-005): se recalcula desde las acciones VIGENTES.
      await ctx.db.patch(accion._id, {
        estado: args.desenlace === "ANULADA" ? "ANULADA" : "MODIFICADA",
        puntosAplicados: 0,
        resueltaPorDocenteId: docente._id,
        resueltaEn: ahora,
        motivoResolucion: respuesta,
        actualizadoEn: ahora,
      });
      // RECALCULO_PENDIENTE (#9, Persona B): cuando `conducta.ts` exponga el
      // recálculo del período, se invoca aquí con accion.matriculaId y
      // accion.periodoAcademicoId.
    }

    await auditar(ctx, {
      accion: "ACTUALIZAR",
      entidadTipo: "inconformidad",
      entidadId: inconformidad._id,
      datosDespues: { desenlace: args.desenlace, accionRegistradaId: accion._id },
    });

    const representante = await ctx.db.get(inconformidad.representanteId);
    if (representante !== null) {
      await notificar(
        ctx,
        representante.perfilUsuarioId,
        "RESPUESTA_INCONFORMIDAD",
        "El docente respondió tu reclamo",
        respuesta,
        "inconformidad",
        inconformidad._id,
      );
    }
    return inconformidad._id;
  },
});

/**
 * F3: el reclamo que el docente dejo pasar 30 dias sin responder vence.
 *
 * Va en un cron y no en la consulta de la bandeja porque `Date.now()` dentro
 * de un `query` de Convex rompe la reactividad: el resultado dejaria de
 * depender solo de los datos. El estado tiene que quedar **escrito**.
 *
 * Interna a proposito: la dispara `crons.ts`, nunca el cliente. Un docente no
 * puede vencer su propio reclamo para quitarselo de encima.
 *
 * Idempotente: al pasar a `VENCIDA` el reclamo sale de los estados que este
 * lote recorre, asi que correrlo dos veces no vuelve a notificar.
 */
export const vencerInconformidades = internalMutation({
  args: { limite: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const ahora = Date.now();
    // El lote se acota para no pasarse de los limites de una transaccion de
    // Convex si un dia hay muchos atrasados. El cron del dia siguiente toma
    // los que hayan quedado; un reclamo ya vencido no empeora por esperar 24h.
    const limite = args.limite ?? 100;
    if (limite < 1) throw new ErrorDominio("VALIDACION", "El limite debe ser al menos 1.");

    let vencidas = 0;
    for (const estado of ["ABIERTA", "EN_REVISION"] as const) {
      if (vencidas >= limite) break;
      const lote = await ctx.db
        .query("inconformidad")
        .withIndex("por_estado_vence", (q) => q.eq("estado", estado).lte("venceEn", ahora))
        .take(limite - vencidas);

      for (const inconformidad of lote) {
        await ctx.db.patch(inconformidad._id, { estado: "VENCIDA", actualizadoEn: ahora });
        vencidas++;

        // Al representante se le avisa siempre: abrio un reclamo sobre su hijo
        // y nadie le respondio. Enterarse por silencio es justo lo que las
        // entrevistas del 1 de septiembre decian que rompe la confianza.
        const representante = await ctx.db.get(inconformidad.representanteId);
        if (representante !== null) {
          await notificar(
            ctx,
            representante.perfilUsuarioId,
            "RESPUESTA_INCONFORMIDAD",
            "Tu reclamo venció sin respuesta",
            "Pasaron 30 días sin que el docente respondiera. El reclamo sigue " +
              "registrado y el docente todavía puede responderlo.",
            "inconformidad",
            inconformidad._id,
          );
        }

        const accion = await ctx.db.get(inconformidad.accionRegistradaId);
        const docente = accion === null ? null : await ctx.db.get(accion.registradaPorDocenteId);
        if (docente !== null) {
          await notificar(
            ctx,
            docente.perfilUsuarioId,
            "RESPUESTA_INCONFORMIDAD",
            "Un reclamo venció sin tu respuesta",
            "Se cumplieron los 30 días. Sigue en tu bandeja y aún puedes responderlo.",
            "inconformidad",
            inconformidad._id,
          );
        }
      }
    }
    return { vencidas, revisadoEn: ahora };
  },
});

/* ------------------------------------------------------------------ *
 *  ALERTAS DE EMERGENCIA  (G1, G2, G3)
 * ------------------------------------------------------------------ */

/**
 * El docente activa una alerta.
 *
 * G1: exige **reautenticación reciente**. El cliente reautentica con Clerk y
 * pasa el momento en que ocurrió; aquí se comprueba que sea reciente y se
 * guarda como constancia. Sin esto la alerta se dispara por accidente.
 *
 * La app debe declarar **visiblemente que no sustituye al ECU 911**. Eso es
 * responsabilidad de la pantalla (D17), pero se repite aquí porque es una
 * regla del producto, no una decisión de interfaz.
 */
export const activarAlerta = mutation({
  args: {
    cursoId: v.id("curso"),
    alcance: alcanceAlerta,
    estudianteId: v.optional(v.id("estudiante")),
    tipo: tipoAlerta,
    titulo: v.string(),
    mensaje: v.string(),
    esSimulacro: v.boolean(),
    reautenticadoEn: v.number(),
  },
  handler: async (ctx, args) => {
    const docente = await exigirTitularDelCurso(ctx, args.cursoId);
    exigirAlcanceCoherente(args.alcance, args.estudianteId);

    const ahora = Date.now();
    // Una reautenticación de hace media hora no sirve: la gracia es que la
    // persona demuestre que es ella *en el momento* de activar la alerta.
    if (args.reautenticadoEn > ahora || ahora - args.reautenticadoEn > 5 * MINUTO) {
      throw new ErrorDominio(
        "REAUTENTICACION_REQUERIDA",
        "Vuelve a confirmar tu identidad para activar una alerta.",
      );
    }
    // Coherencia entre el tipo y la bandera: si el tipo es SIMULACRO pero no
    // se marca como simulacro, se entrena a los padres a ignorar las reales.
    if ((args.tipo === "SIMULACRO") !== args.esSimulacro) {
      throw new ErrorDominio(
        "VALIDACION",
        "Una alerta de tipo SIMULACRO debe marcarse como simulacro, y viceversa.",
      );
    }

    const curso = await ctx.db.get(args.cursoId);
    if (curso === null) throw new ErrorDominio("NO_ENCONTRADO", "El curso no existe.");
    const anioLectivo = await ctx.db.get(curso.anioLectivoId);
    if (anioLectivo === null) {
      throw new ErrorDominio("NO_ENCONTRADO", "El año lectivo del curso no existe.");
    }

    const alertaId = await ctx.db.insert("alertaEmergencia", {
      institucionId: anioLectivo.institucionId,
      cursoId: args.cursoId,
      alcance: args.alcance,
      estudianteId: args.estudianteId,
      activadaPorDocenteId: docente._id,
      tipo: args.tipo,
      titulo: exigirTexto(args.titulo, "El título de la alerta"),
      mensaje: exigirTexto(args.mensaje, "El mensaje de la alerta"),
      esSimulacro: args.esSimulacro,
      reautenticadoEn: args.reautenticadoEn,
      activadaEn: ahora,
    });

    // Una entrega por cada representante que corresponda al alcance.
    const matriculas = await ctx.db
      .query("matricula")
      .withIndex("por_curso_estado", (q) => q.eq("cursoId", args.cursoId).eq("estado", "CURSANDO"))
      .collect();

    let entregas = 0;
    for (const matricula of matriculas) {
      if (args.alcance === "ESTUDIANTE" && matricula.estudianteId !== args.estudianteId) continue;

      const vinculo = await ctx.db
        .query("vinculoRepresentacion")
        .withIndex("por_estudiante_estado", (q) =>
          q.eq("estudianteId", matricula.estudianteId).eq("estado", "ACTIVO"),
        )
        .unique();
      if (vinculo === null) continue;

      await ctx.db.insert("entregaAlerta", {
        alertaEmergenciaId: alertaId,
        representanteId: vinculo.representanteId,
        estudianteId: matricula.estudianteId,
        enviadoEn: ahora,
      });
      entregas++;

      const representante = await ctx.db.get(vinculo.representanteId);
      if (representante !== null) {
        await notificar(
          ctx,
          representante.perfilUsuarioId,
          "ALERTA_EMERGENCIA",
          args.esSimulacro ? `[SIMULACRO] ${args.titulo}` : args.titulo,
          args.mensaje,
          "alertaEmergencia",
          alertaId,
        );
      }
    }

    await auditar(ctx, {
      accion: "ALERTA",
      entidadTipo: "alertaEmergencia",
      entidadId: alertaId,
      institucionId: anioLectivo.institucionId,
      datosDespues: { alcance: args.alcance, esSimulacro: args.esSimulacro, entregas },
    });

    return { id: alertaId, entregas };
  },
});

/**
 * Alertas que le llegaron al representante autenticado (P10).
 *
 * Se recorre por índices desde sus vínculos —vínculo → matrícula → curso →
 * alertas del curso— en vez de leer la tabla `entregaAlerta` entera. El
 * índice de esa tabla empieza por `alertaEmergenciaId`, así que no se puede
 * consultar por representante directamente.
 */
export const misAlertas = query({
  args: {},
  handler: async (ctx) => {
    const representante = await exigirRepresentante(ctx);

    const vinculos = await ctx.db
      .query("vinculoRepresentacion")
      .withIndex("por_representante_estado", (q) =>
        q.eq("representanteId", representante._id).eq("estado", "ACTIVO"),
      )
      .collect();

    const mias = [];
    for (const vinculo of vinculos) {
      const matriculas = await ctx.db
        .query("matricula")
        .withIndex("por_estudiante_estado", (q) =>
          q.eq("estudianteId", vinculo.estudianteId).eq("estado", "CURSANDO"),
        )
        .collect();

      for (const matricula of matriculas) {
        const alertas = await ctx.db
          .query("alertaEmergencia")
          .withIndex("por_curso", (q) => q.eq("cursoId", matricula.cursoId))
          .collect();

        for (const alerta of alertas) {
          const entrega = await ctx.db
            .query("entregaAlerta")
            .withIndex("por_alerta", (q) =>
              q
                .eq("alertaEmergenciaId", alerta._id)
                .eq("representanteId", representante._id)
                .eq("estudianteId", vinculo.estudianteId),
            )
            .unique();
          if (entrega === null) continue; // alerta dirigida a otro estudiante

          mias.push({
            entregaId: entrega._id,
            titulo: alerta.titulo,
            mensaje: alerta.mensaje,
            tipo: alerta.tipo,
            esSimulacro: alerta.esSimulacro,
            activadaEn: alerta.activadaEn,
            confirmada: entrega.confirmadoEn !== undefined,
          });
        }
      }
    }
    return mias.sort((a, b) => b.activadaEn - a.activadaEn);
  },
});

/** G3: el representante confirma que la leyó. */
export const confirmarAlerta = mutation({
  args: { entregaAlertaId: v.id("entregaAlerta") },
  handler: async (ctx, args) => {
    const representante = await exigirRepresentante(ctx);
    const entrega = await ctx.db.get(args.entregaAlertaId);
    if (entrega === null) throw new ErrorDominio("NO_ENCONTRADO", "Esa alerta no existe.");
    if (entrega.representanteId !== representante._id) {
      throw new ErrorDominio("SIN_PERMISO", "Esa alerta no es tuya.");
    }
    if (entrega.confirmadoEn !== undefined) return entrega._id;

    const ahora = Date.now();
    await ctx.db.patch(entrega._id, { leidoEn: entrega.leidoEn ?? ahora, confirmadoEn: ahora });
    return entrega._id;
  },
});

/* ------------------------------------------------------------------ *
 *  NOTIFICACIONES Y DISPOSITIVOS
 * ------------------------------------------------------------------ */

/** Registra el token push del dispositivo, o lo reactiva si ya existía. */
export const registrarDispositivo = mutation({
  args: {
    tokenPush: v.string(),
    plataforma: v.optional(plataforma),
    versionApp: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const perfil = await exigirPerfil(ctx);
    const token = exigirTexto(args.tokenPush, "El token del dispositivo");
    const ahora = Date.now();

    // Sin UNIQUE INDEX: la unicidad del token se resuelve aquí.
    const existente = await ctx.db
      .query("dispositivo")
      .withIndex("por_token", (q) => q.eq("tokenPush", token))
      .unique();

    if (existente !== null) {
      await ctx.db.patch(existente._id, {
        perfilUsuarioId: perfil._id,
        plataforma: args.plataforma ?? existente.plataforma,
        versionApp: args.versionApp ?? existente.versionApp,
        activo: true,
        actualizadoEn: ahora,
      });
      return existente._id;
    }

    return await ctx.db.insert("dispositivo", {
      perfilUsuarioId: perfil._id,
      tokenPush: token,
      plataforma: args.plataforma ?? "ANDROID",
      versionApp: args.versionApp,
      activo: true,
      actualizadoEn: ahora,
    });
  },
});

/** Bandeja de notificaciones del usuario autenticado. */
export const misNotificaciones = query({
  args: {},
  handler: async (ctx) => {
    const perfil = await exigirPerfil(ctx);
    const notificaciones = await ctx.db
      .query("notificacion")
      .withIndex("por_usuario", (q) => q.eq("perfilUsuarioId", perfil._id))
      .collect();
    return notificaciones.sort((a, b) => b._creationTime - a._creationTime);
  },
});

/** Marca una notificación como leída. Solo el dueño puede. */
export const marcarNotificacionLeida = mutation({
  args: { notificacionId: v.id("notificacion") },
  handler: async (ctx, args) => {
    const perfil = await exigirPerfil(ctx);
    const notificacion = await ctx.db.get(args.notificacionId);
    if (notificacion === null) {
      throw new ErrorDominio("NO_ENCONTRADO", "Esa notificación no existe.");
    }
    if (notificacion.perfilUsuarioId !== perfil._id) {
      throw new ErrorDominio("SIN_PERMISO", "Esa notificación no es tuya.");
    }
    if (notificacion.leidaEn === undefined) {
      await ctx.db.patch(notificacion._id, { leidaEn: Date.now() });
    }
    return notificacion._id;
  },
});
