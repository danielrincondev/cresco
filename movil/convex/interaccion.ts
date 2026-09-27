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

import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import { recalcularPuntaje } from "./conducta";
import { internal } from "./_generated/api";


import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { verificarReautenticacion } from "./lib/reautenticacion";
import { notificar } from "./lib/notificaciones";
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
  ErrorPermiso,
  auditar,
  exigirAccesoDocenteAEstudiante,
  exigirDocente,
  exigirPerfil,
  exigirRepresentante,
  exigirTitularDelCurso,
  exigirVinculo,
  perfilActual,
} from "./lib/permisos";

/**
 * Los errores esperados conservan codigo y mensaje al llegar al cliente.
 *
 * Sin esto, un `ErrorDominio` cruza la frontera de Convex como un fallo
 * generico y la pantalla solo puede decir "no pudimos completar la solicitud":
 * el representante que reserva un horario que acaban de tomar merece leer
 * *"ese horario ya no esta disponible"*, no una disculpa sin informacion.
 *
 * Es gemela de la de `nucleo.ts`. Se duplica a proposito: moverla a `lib/`
 * convertiria diez lineas de traduccion de errores en superficie compartida,
 * que pide el acuerdo de los tres para cambiarse.
 */
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
  handler: (ctx, args) => conErroresPublicos(async () => {
    const docente = await exigirDocente(ctx);
    exigirFormatoHora(args.horaInicio, "La hora de inicio");
    exigirFormatoHora(args.horaFin, "La hora de fin");
    exigirRangoHoras(args.horaInicio, args.horaFin);

    const fecha = new Date(`${args.fecha}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.fecha) || !Number.isFinite(fecha.getTime()) ||
        fecha.toISOString().slice(0, 10) !== args.fecha) {
      throw new ErrorDominio("FECHAS_INVALIDAS", "Ingresa una fecha válida.");
    }
    const minutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3));
    const inicio = minutos(args.horaInicio);
    const fin = minutos(args.horaFin);
    if ((fin - inicio) % REGLAS.CITA_MINUTOS !== 0) {
      throw new ErrorDominio("VALIDACION", `La franja debe contener bloques completos de ${REGLAS.CITA_MINUTOS} minutos.`);
    }
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

    const hora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    let primero: Id<"disponibilidadDocente"> | undefined;
    // Toda la franja se publica en la misma transacción: un solapamiento no
    // puede dejar medio horario publicado ni dos reservas para un mismo tramo.
    for (let m = inicio; m < fin; m += REGLAS.CITA_MINUTOS) {
      const id = await ctx.db.insert("disponibilidadDocente", {
        docenteId: docente._id, cursoId: args.cursoId, fecha: args.fecha,
        horaInicio: hora(m), horaFin: hora(m + REGLAS.CITA_MINUTOS),
        modalidad: args.modalidad ?? "PRESENCIAL",
        lugarOEnlace: args.lugarOEnlace?.trim() || undefined,
        estado: "DISPONIBLE", actualizadoEn: Date.now(),
      });
      primero ??= id;
    }
    // Conserva el contrato existente; el resto se obtiene con bloquesDisponibles.
    return primero!;
  }),
});

/**
 * Bloques libres del docente titular de un estudiante, para que su
 * representante elija (P8).
 *
 * Recibe el estudiante, no el docente: así el permiso se comprueba contra un
 * vínculo real. Si recibiera `docenteId`, cualquier usuario autenticado
 * podría listar el horario de cualquier docente del sistema.
 */
/**
 * P9: quien es el docente a cargo del hijo, con nombre y datos de contacto.
 *
 * Recorre el mismo camino que `bloquesDisponibles` -- estudiante, matricula
 * CURSANDO, asignacion TITULAR vigente -- y por la misma razon empieza por
 * `exigirVinculo`: sin eso, cualquier representante podria consultar los datos
 * de contacto de cualquier docente del sistema pasando un `estudianteId` ajeno.
 *
 * Devuelve `null` cuando no hay titular asignado, que es un estado normal al
 * principio del año lectivo y no un error que valga la pena mostrarle a nadie.
 */
export const docenteACargo = query({
  args: { estudianteId: v.id("estudiante") },
  handler: (ctx, args) => conErroresPublicos(async () => {
    await exigirVinculo(ctx, args.estudianteId);

    const matricula = await ctx.db
      .query("matricula")
      .withIndex("por_estudiante_estado", (q) =>
        q.eq("estudianteId", args.estudianteId).eq("estado", "CURSANDO"),
      )
      .unique();
    if (matricula === null) return null;

    const titulares = await ctx.db
      .query("asignacionDocente")
      .withIndex("por_curso_rol", (q) => q.eq("cursoId", matricula.cursoId).eq("rol", "TITULAR"))
      .collect();
    const titular = titulares.find((t) => t.vigenteHasta === undefined);
    if (titular === undefined) return null;

    const docente = await ctx.db.get(titular.docenteId);
    if (docente === null) return null;
    const perfil = await ctx.db.get(docente.perfilUsuarioId);
    const curso = await ctx.db.get(matricula.cursoId);

    return {
      docenteId: docente._id,
      // Se entrega el nombre ya compuesto: la pantalla no tiene por que saber
      // en que orden se escriben los apellidos aqui, y un perfil anterior a
      // #52 todavia puede no tener ninguno de los dos.
      nombre:
        perfil && (perfil.nombres || perfil.apellidos)
          ? `${perfil.nombres ?? ""} ${perfil.apellidos ?? ""}`.trim()
          : null,
      curso: curso?.nombre ?? null,
      tituloProfesional: docente.tituloProfesional ?? null,
      correoContacto: docente.correoContacto ?? null,
      telefonoContacto: docente.telefonoContacto ?? null,
      horarioAtencion: docente.horarioAtencion ?? null,
    };
  }),
});

export const bloquesDisponibles = query({
  args: { estudianteId: v.id("estudiante"), desde: v.string() },
  handler: (ctx, args) => conErroresPublicos(async () => {
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
  }),
});

/** ux_cita_bloque_vivo: un bloque no admite dos reservas vivas a la vez. */
async function bloqueOcupado(
  ctx: QueryCtx,
  disponibilidadDocenteId: Id<"disponibilidadDocente">,
): Promise<boolean> {
  for (const estado of CITA_VIVA) {
    const ocupado = await ctx.db
      .query("cita")
      .withIndex("por_bloque_estado", (q) =>
        q.eq("disponibilidadDocenteId", disponibilidadDocenteId).eq("estado", estado),
      )
      .first();
    if (ocupado !== null) return true;
  }
  return false;
}

const inicioDelBloque = (bloque: Doc<"disponibilidadDocente">) =>
  new Date(`${bloque.fecha}T${bloque.horaInicio}:00-05:00`).getTime();

/**
 * Devuelve el bloque de una cita que se cae. `estado` lo decide quien llama:
 * ver `cancelarCita` para por qué no siempre vuelve a quedar DISPONIBLE.
 */
async function liberarBloque(
  ctx: MutationCtx,
  cita: Doc<"cita">,
  estado: "DISPONIBLE" | "CANCELADO",
): Promise<void> {
  if (cita.disponibilidadDocenteId === undefined) return;
  const bloque = await ctx.db.get(cita.disponibilidadDocenteId);
  if (bloque?.estado === "RESERVADO") {
    await ctx.db.patch(bloque._id, { estado, actualizadoEn: Date.now() });
  }
}

async function nombreDelEstudiante(
  ctx: QueryCtx,
  estudianteId: Id<"estudiante">,
): Promise<string | null> {
  const estudiante = await ctx.db.get(estudianteId);
  return estudiante === null ? null : `${estudiante.nombres} ${estudiante.apellidos}`;
}

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
  handler: (ctx, args) => conErroresPublicos(async () => {
    const representante = await exigirRepresentante(ctx);
    await exigirVinculo(ctx, args.estudianteId);

    const bloque = await ctx.db.get(args.disponibilidadDocenteId);
    if (bloque === null) throw new ErrorDominio("NO_ENCONTRADO", "Ese horario ya no existe.");
    if (bloque.estado !== "DISPONIBLE") {
      throw new ErrorDominio("CONFLICTO", "Ese horario ya no está disponible.");
    }

    if (await bloqueOcupado(ctx, bloque._id)) {
      throw new ErrorDominio("CONFLICTO", "Otro representante acaba de reservar ese horario.");
    }

    const inicio = inicioDelBloque(bloque);
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
        `La familia de ${(await nombreDelEstudiante(ctx, args.estudianteId)) ?? "un estudiante"} ` +
          `pidió una cita para el ${cuandoEnTexto(inicio)}.`,
        "cita",
        citaId,
      );
    }
    return citaId;
  }),
});

/** El docente confirma o rechaza la cita que pidió una familia. Rechazar libera el bloque. */
export const responderCita = mutation({
  args: {
    citaId: v.id("cita"),
    aceptar: v.boolean(),
    notasDocente: v.optional(v.string()),
  },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const docente = await exigirDocente(ctx);
    const cita = await ctx.db.get(args.citaId);
    if (cita === null) throw new ErrorDominio("NO_ENCONTRADO", "La cita no existe.");
    if (cita.docenteId !== docente._id) {
      throw new ErrorDominio("SIN_PERMISO", "Esa cita no es tuya.");
    }
    // Una citación la confirma la familia, no quien la envió: sin esto el
    // docente podría darla por aceptada en nombre de la familia.
    if (cita.origen !== "SOLICITADA_POR_REPRESENTANTE") {
      throw new ErrorDominio("CONFLICTO", "Esa citación la confirma la familia.");
    }
    if (cita.estado !== "SOLICITADA") {
      throw new ErrorDominio("CONFLICTO", "Esa cita ya fue respondida.");
    }

    const ahora = Date.now();
    if (args.aceptar && cita.fechaHoraInicio <= ahora) {
      throw new ErrorDominio(
        "CONFLICTO",
        "Esa cita ya pasó. La familia puede reservar otro horario.",
      );
    }
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

    if (args.aceptar) await programarRecordatorios(ctx, cita);

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
  }),
});

/**
 * El docente cita a la familia de un estudiante (`origen: CITACION_DOCENTE`).
 *
 * De las entrevistas del 1 de septiembre: cuando un alumno pierde el año, el
 * distrito le pide al docente "una carpeta de todas las citaciones". Hasta
 * aquí solo la familia podía pedir una cita, y el docente no tenía cómo dejar
 * constancia de que la llamó.
 *
 * Usa uno de **sus propios bloques de atención**, no una hora cualquiera: en
 * un plantel fiscal la institución le asigna esas franjas (ver
 * `publicarDisponibilidad`) y es ahí donde recibe a las familias. Así la
 * citación reserva el bloque igual que una solicitud, y nadie más puede
 * tomarlo mientras la familia responde.
 *
 * Nace SOLICITADA y la confirma **la familia** (`responderCitacion`). El
 * motivo es obligatorio: una citación sin motivo no le dice a la familia a
 * qué viene, y en una carpeta no prueba nada.
 */
export const citarFamilia = mutation({
  args: {
    disponibilidadDocenteId: v.id("disponibilidadDocente"),
    estudianteId: v.id("estudiante"),
    motivo: v.string(),
  },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const { docente } = await exigirAccesoDocenteAEstudiante(ctx, args.estudianteId);
    const motivo = exigirTexto(args.motivo, "El motivo de la citación");

    const bloque = await ctx.db.get(args.disponibilidadDocenteId);
    if (bloque === null || bloque.docenteId !== docente._id) {
      throw new ErrorDominio("NO_ENCONTRADO", "Ese horario no es uno de tus bloques de atención.");
    }
    if (bloque.estado !== "DISPONIBLE" || await bloqueOcupado(ctx, bloque._id)) {
      throw new ErrorDominio("CONFLICTO", "Ese horario ya no está libre.");
    }
    const inicio = inicioDelBloque(bloque);
    const ahora = Date.now();
    if (inicio <= ahora) {
      throw new ErrorDominio("FECHAS_INVALIDAS", "Ese horario ya pasó. Elige uno que todavía no empiece.");
    }

    // D2: un solo representante legal por estudiante en la v1.
    const vinculo = await ctx.db
      .query("vinculoRepresentacion")
      .withIndex("por_estudiante_estado", (q) =>
        q.eq("estudianteId", args.estudianteId).eq("estado", "ACTIVO"),
      )
      .unique();
    const representante = vinculo === null ? null : await ctx.db.get(vinculo.representanteId);
    if (representante === null) {
      throw new ErrorDominio(
        "SIN_REPRESENTANTE",
        "Este estudiante todavía no tiene un representante en Cresco. Tendrás que citarlo por otra vía.",
      );
    }

    const citaId = await ctx.db.insert("cita", {
      disponibilidadDocenteId: bloque._id,
      docenteId: docente._id,
      representanteId: representante._id,
      estudianteId: args.estudianteId,
      origen: "CITACION_DOCENTE",
      motivo,
      fechaHoraInicio: inicio,
      fechaHoraFin: inicio + REGLAS.CITA_MINUTOS * MINUTO,
      modalidad: bloque.modalidad,
      estado: "SOLICITADA",
      actualizadoEn: ahora,
    });
    await ctx.db.patch(bloque._id, { estado: "RESERVADO", actualizadoEn: ahora });

    const nombre = (await nombreDelEstudiante(ctx, args.estudianteId)) ?? "tu representado";
    await notificar(
      ctx,
      representante.perfilUsuarioId,
      "CITACION",
      "El docente te citó",
      `Por ${nombre}: ${cuandoEnTexto(inicio)}, ${MODALIDAD_EN_TEXTO[bloque.modalidad]}. ` +
        `Motivo: ${motivo}. Confírmale en Cresco si puedes asistir.`,
      "cita",
      citaId,
    );
    const recordar = momentoRecordatorioCitacion(inicio, ahora);
    if (recordar !== null) {
      await ctx.scheduler.runAt(recordar, internal.interaccion.recordarCitacionSinRespuesta, {
        citaId,
        fechaHoraInicio: inicio,
      });
    }
    return citaId;
  }),
});

/**
 * La familia responde a una citación del docente. Decir que no puede asistir
 * libera el bloque y **exige un mensaje**: el docente necesita saber por qué
 * para volver a citar, y una citación declinada sin explicación es justo lo
 * que después no se puede sostener en ninguna carpeta.
 */
export const responderCitacion = mutation({
  args: {
    citaId: v.id("cita"),
    asistira: v.boolean(),
    mensaje: v.optional(v.string()),
  },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const representante = await exigirRepresentante(ctx);
    const cita = await ctx.db.get(args.citaId);
    if (cita === null) throw new ErrorDominio("NO_ENCONTRADO", "La cita no existe.");
    if (cita.representanteId !== representante._id) {
      throw new ErrorDominio("SIN_PERMISO", "Esa cita no es tuya.");
    }
    if (cita.origen !== "CITACION_DOCENTE") {
      throw new ErrorDominio("CONFLICTO", "Esa cita la confirma el docente.");
    }
    if (cita.estado !== "SOLICITADA") {
      throw new ErrorDominio("CONFLICTO", "Ya respondiste esta citación.");
    }
    const ahora = Date.now();
    if (cita.fechaHoraInicio <= ahora) {
      throw new ErrorDominio("CONFLICTO", "Esa citación ya pasó.");
    }
    const mensaje = args.asistira
      ? args.mensaje?.trim() || undefined
      : exigirTexto(args.mensaje ?? "", "El mensaje para el docente");

    await ctx.db.patch(cita._id, {
      estado: args.asistira ? "CONFIRMADA" : "RECHAZADA",
      mensajeRepresentante: mensaje,
      actualizadoEn: ahora,
    });
    if (args.asistira) await programarRecordatorios(ctx, cita);
    else await liberarBloque(ctx, cita, "DISPONIBLE");

    const docente = await ctx.db.get(cita.docenteId);
    if (docente !== null) {
      const nombre = (await nombreDelEstudiante(ctx, cita.estudianteId)) ?? "Un estudiante";
      await notificar(
        ctx,
        docente.perfilUsuarioId,
        "CITACION",
        args.asistira ? "La familia confirmó la citación" : "La familia no puede asistir a la citación",
        `${nombre}, ${cuandoEnTexto(cita.fechaHoraInicio)}.` +
          (mensaje ? ` Escribió: "${mensaje}"` : ""),
        "cita",
        cita._id,
      );
    }
    return cita._id;
  }),
});

/**
 * Cualquiera de las dos partes cancela una cita que todavía no empieza, con
 * motivo: la otra parte lo recibe, y queda en el historial de las dos.
 *
 * `como` dice en nombre de quién se cancela. Hace falta porque una misma
 * persona puede ser docente y representante a la vez, y sin él no habría
 * cómo saber si la cancelación sale de su agenda de docente o de sus citas de
 * familia.
 *
 * El bloque no corre la misma suerte en los dos casos. Si cancela la familia,
 * el docente sigue libre a esa hora y el bloque vuelve a ofrecerse. Si cancela
 * el docente, lo normal es que sea él quien no puede, y reabrirlo le mandaría
 * otra familia a una hora en la que no va a estar: queda CANCELADO, que
 * tampoco le impide volver a publicar esa franja (`publicarDisponibilidad`
 * ignora los bloques cancelados al buscar cruces).
 */
export const cancelarCita = mutation({
  args: {
    citaId: v.id("cita"),
    como: v.union(v.literal("DOCENTE"), v.literal("REPRESENTANTE")),
    motivo: v.string(),
  },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const cita = await ctx.db.get(args.citaId);
    if (cita === null) throw new ErrorDominio("NO_ENCONTRADO", "La cita no existe.");
    const propia = args.como === "DOCENTE"
      ? cita.docenteId === (await exigirDocente(ctx))._id
      : cita.representanteId === (await exigirRepresentante(ctx))._id;
    if (!propia) throw new ErrorDominio("SIN_PERMISO", "Esa cita no es tuya.");
    if (cita.estado !== "SOLICITADA" && cita.estado !== "CONFIRMADA") {
      throw new ErrorDominio("CONFLICTO", "Esa cita ya no se puede cancelar.");
    }
    const ahora = Date.now();
    if (cita.fechaHoraInicio <= ahora) {
      throw new ErrorDominio(
        "CONFLICTO",
        args.como === "DOCENTE"
          ? "Esa cita ya empezó. Registra si la familia asistió."
          : "Esa cita ya empezó y no se puede cancelar.",
      );
    }
    const motivo = exigirTexto(args.motivo, "El motivo de la cancelación");

    await ctx.db.patch(cita._id, {
      estado: "CANCELADA",
      canceladaPor: args.como,
      motivoCancelacion: motivo,
      actualizadoEn: ahora,
    });
    await liberarBloque(ctx, cita, args.como === "DOCENTE" ? "CANCELADO" : "DISPONIBLE");

    const destinatario = args.como === "DOCENTE"
      ? await ctx.db.get(cita.representanteId)
      : await ctx.db.get(cita.docenteId);
    if (destinatario !== null) {
      const nombre = (await nombreDelEstudiante(ctx, cita.estudianteId)) ?? "Un estudiante";
      await notificar(
        ctx,
        destinatario.perfilUsuarioId,
        "CITACION",
        args.como === "DOCENTE" ? "El docente canceló la cita" : "La familia canceló la cita",
        `${nombre}, ${cuandoEnTexto(cita.fechaHoraInicio)}. Motivo: ${motivo}`,
        "cita",
        cita._id,
      );
    }
    return cita._id;
  }),
});

/**
 * El docente registra, desde la hora de la cita, si la familia asistió.
 *
 * Antes de la hora no hay nada que registrar: un "no asistió" anotado por
 * adelantado sería un dato falso sobre una familia.
 *
 * Un "no asistió" **se le avisa a la familia**. Es un registro sobre ella que
 * puede terminar en una carpeta del distrito, y enterarse por otro lado iría
 * contra lo mismo que pide `notasDocente`: nada que no se le pueda decir a la
 * familia a la cara.
 */
export const registrarAsistenciaCita = mutation({
  args: { citaId: v.id("cita"), asistio: v.boolean() },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const docente = await exigirDocente(ctx);
    const cita = await ctx.db.get(args.citaId);
    if (cita === null) throw new ErrorDominio("NO_ENCONTRADO", "La cita no existe.");
    if (cita.docenteId !== docente._id) {
      throw new ErrorDominio("SIN_PERMISO", "Esa cita no es tuya.");
    }
    if (cita.estado === "ATENDIDA" || cita.estado === "NO_ASISTIO") {
      throw new ErrorDominio("CONFLICTO", "Ya registraste esta cita.");
    }
    if (cita.estado !== "CONFIRMADA") {
      throw new ErrorDominio("CONFLICTO", "Solo se registra la asistencia de una cita confirmada.");
    }
    const ahora = Date.now();
    if (cita.fechaHoraInicio > ahora) {
      throw new ErrorDominio("CONFLICTO", "Esa cita todavía no empieza.");
    }

    await ctx.db.patch(cita._id, {
      estado: args.asistio ? "ATENDIDA" : "NO_ASISTIO",
      actualizadoEn: ahora,
    });

    if (!args.asistio) {
      const representante = await ctx.db.get(cita.representanteId);
      if (representante !== null) {
        const nombre = (await nombreDelEstudiante(ctx, cita.estudianteId)) ?? "tu representado";
        await notificar(
          ctx,
          representante.perfilUsuarioId,
          "CITACION",
          "Quedó registrado que no asististe",
          `A la cita por ${nombre} del ${cuandoEnTexto(cita.fechaHoraInicio)}. ` +
            "Si hubo un error, conversa con el docente.",
          "cita",
          cita._id,
        );
      }
    }
    return cita._id;
  }),
});

/** Unas líneas, no un informe: es lo que se acordó, no la reunión entera. */
const ACUERDOS_MAX = 1000;

/**
 * El docente deja escrito lo que se acordó en una reunión a la que la familia
 * asistió, y la familia lo recibe.
 *
 * De las entrevistas del 1 de septiembre: lo que pide el distrito es "una
 * carpeta de todas las citaciones, informes... lo que más vale es el informe
 * escrito". Una cita marcada como atendida prueba que hubo reunión; esto
 * prueba **qué se habló**. Es también lo que un informe imprimible (DP-009)
 * tendría que imprimir.
 *
 * Una sola vez: ver `acuerdos` en el esquema.
 */
export const anotarAcuerdos = mutation({
  args: { citaId: v.id("cita"), acuerdos: v.string() },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const docente = await exigirDocente(ctx);
    const cita = await ctx.db.get(args.citaId);
    if (cita === null) throw new ErrorDominio("NO_ENCONTRADO", "La cita no existe.");
    if (cita.docenteId !== docente._id) {
      throw new ErrorDominio("SIN_PERMISO", "Esa cita no es tuya.");
    }
    if (cita.estado !== "ATENDIDA") {
      throw new ErrorDominio("CONFLICTO", "Solo se anotan acuerdos de una reunión a la que la familia asistió.");
    }
    if (cita.acuerdos !== undefined) {
      throw new ErrorDominio("CONFLICTO", "Los acuerdos de esta reunión ya quedaron registrados.");
    }
    const acuerdos = exigirTexto(args.acuerdos, "Lo que acordaron");
    if (acuerdos.length > ACUERDOS_MAX) {
      throw new ErrorDominio("VALIDACION", `Los acuerdos no pueden pasar de ${ACUERDOS_MAX} caracteres.`);
    }

    await ctx.db.patch(cita._id, { acuerdos, actualizadoEn: Date.now() });

    const representante = await ctx.db.get(cita.representanteId);
    if (representante !== null) {
      const nombre = (await nombreDelEstudiante(ctx, cita.estudianteId)) ?? "tu representado";
      await notificar(
        ctx,
        representante.perfilUsuarioId,
        "CITACION",
        "Acuerdos de la reunión",
        `Reunión por ${nombre} del ${cuandoEnTexto(cita.fechaHoraInicio)}: ${acuerdos}`,
        "cita",
        cita._id,
      );
    }
    return cita._id;
  }),
});

/**
 * Los bloques libres del propio docente, para elegir uno al citar a una
 * familia. `desde` lo manda la pantalla y no sale del reloj del servidor: una
 * query no se vuelve a ejecutar solo porque pase el tiempo.
 */
export const misBloquesLibres = query({
  args: { desde: v.string() },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const docente = await exigirDocente(ctx);
    const bloques = await ctx.db
      .query("disponibilidadDocente")
      .withIndex("por_docente_fecha", (q) =>
        q.eq("docenteId", docente._id).gte("fecha", args.desde),
      )
      .collect();
    return bloques
      .filter((b) => b.estado === "DISPONIBLE")
      .map((b) => ({
        id: b._id,
        fecha: b.fecha,
        horaInicio: b.horaInicio,
        horaFin: b.horaFin,
        modalidad: b.modalidad,
        lugarOEnlace: b.lugarOEnlace,
      }));
  }),
});

/* ------------------------------------------------------------------ *
 *  RECORDATORIOS DE CITA
 * ------------------------------------------------------------------ */

/**
 * Ecuador continental no tiene horario de verano desde 1993: el desfase es
 * fijo, y por eso aquí se hace aritmética en vez de pedirle la zona a `Intl`.
 * Es la misma suposición que ya hace `solicitarCita` al armar `-05:00`.
 */
const DESFASE_GUAYAQUIL = 5 * 60 * MINUTO;
const HORA = 60 * MINUTO;
/** La víspera se avisa a las 19:00, no 24 h antes: a las 12:30 nadie planifica mañana. */
const HORA_VISPERA = 19;

type MomentoRecordatorio = "VISPERA" | "UNA_HORA";
const momentoRecordatorio = v.union(v.literal("VISPERA"), v.literal("UNA_HORA"));

/**
 * Cuándo avisar de una cita que empieza en `inicio`: la noche anterior y una
 * hora antes. Los momentos que ya pasaron se omiten — una cita confirmada a
 * las 21:00 para mañana temprano recibe solo el aviso de una hora antes, y la
 * confirmación misma ya hizo de víspera.
 */
export function momentosDeRecordatorio(
  inicio: number,
  ahora: number,
): { momento: MomentoRecordatorio; en: number }[] {
  const candidatos = [
    { momento: "VISPERA" as const, en: visperaDe(inicio) },
    { momento: "UNA_HORA" as const, en: inicio - HORA },
  ];
  return candidatos.filter((c) => c.en > ahora);
}

/** Medianoche de Guayaquil del día en que cae `instante`. */
const medianocheLocal = (instante: number) =>
  Math.floor((instante - DESFASE_GUAYAQUIL) / DIA) * DIA + DESFASE_GUAYAQUIL;

/** Las 19:00 del día anterior a `inicio`, en hora de Guayaquil. */
const visperaDe = (inicio: number) => medianocheLocal(inicio) - DIA + HORA_VISPERA * HORA;

/** Con menos margen que esto, recordar una citación ya no le sirve a nadie. */
const MARGEN_CITACION = 2 * HORA;

/**
 * Cuándo recordar una citación que la familia no ha respondido: la víspera a
 * las 19:00, igual que una cita confirmada. Si la citación salió después de
 * esa hora, dos horas antes; con menos margen que eso, nunca.
 */
export function momentoRecordatorioCitacion(inicio: number, ahora: number): number | null {
  const vispera = visperaDe(inicio);
  if (vispera > ahora) return vispera;
  const antes = inicio - MARGEN_CITACION;
  return antes > ahora ? antes : null;
}

/** "hoy a las 12:30", "mañana a las 12:30" o "el jueves 10 de septiembre a las 12:30". */
function cuandoDesde(instante: number, ahora: number): string {
  const dias = Math.round((medianocheLocal(instante) - medianocheLocal(ahora)) / DIA);
  if (dias === 0) return `hoy a las ${horaLocal(instante)}`;
  if (dias === 1) return `mañana a las ${horaLocal(instante)}`;
  return `el ${cuandoEnTexto(instante)}`;
}

/** Al quedar confirmada una cita, por cualquiera de las dos partes. */
async function programarRecordatorios(ctx: MutationCtx, cita: Doc<"cita">): Promise<void> {
  for (const { momento, en } of momentosDeRecordatorio(cita.fechaHoraInicio, Date.now())) {
    await ctx.scheduler.runAt(en, internal.interaccion.recordarCita, {
      citaId: cita._id,
      fechaHoraInicio: cita.fechaHoraInicio,
      momento,
    });
  }
}

/** "12:30" en hora de Guayaquil. */
function horaLocal(instante: number): string {
  return new Date(instante - DESFASE_GUAYAQUIL).toISOString().slice(11, 16);
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * "jueves 10 de septiembre a las 12:30", en hora de Guayaquil. El mismo
 * formato que `fechaHoraLegible` en la aplicación: la notificación y la
 * pantalla que abre tienen que nombrar la cita igual.
 */
function cuandoEnTexto(instante: number): string {
  const local = new Date(instante - DESFASE_GUAYAQUIL);
  const dia = `${DIAS_SEMANA[local.getUTCDay()]} ${local.getUTCDate()} de ${MESES[local.getUTCMonth()]}`;
  return `${dia} a las ${horaLocal(instante)}`;
}

const MODALIDAD_EN_TEXTO: Record<Doc<"cita">["modalidad"], string> = {
  PRESENCIAL: "presencial",
  VIRTUAL: "virtual",
  TELEFONICA: "por teléfono",
};

/**
 * Tarea programada por `programarRecordatorios`. No guarda el id de la tarea
 * ni hay que cancelarla: **relee la cita al dispararse** y solo avisa si sigue
 * CONFIRMADA y a la misma hora. Una cita cancelada, marcada como atendida o
 * reprogramada deja estas tareas sin efecto por sí sola — el mismo criterio
 * que `vencerInconformidad`.
 */
export const recordarCita = internalMutation({
  args: {
    citaId: v.id("cita"),
    fechaHoraInicio: v.number(),
    momento: momentoRecordatorio,
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const cita = await ctx.db.get(args.citaId);
    if (cita === null || cita.estado !== "CONFIRMADA" ||
        cita.fechaHoraInicio !== args.fechaHoraInicio ||
        cita.fechaHoraInicio <= Date.now()) {
      return false;
    }

    const nombre = (await nombreDelEstudiante(ctx, cita.estudianteId)) ?? "tu representado";
    const bloque = cita.disponibilidadDocenteId === undefined
      ? null
      : await ctx.db.get(cita.disponibilidadDocenteId);
    const titulo = args.momento === "VISPERA" ? "Tu cita es mañana" : "Tu cita es en una hora";
    const detalle =
      `A las ${horaLocal(cita.fechaHoraInicio)}, ${MODALIDAD_EN_TEXTO[cita.modalidad]}` +
      (bloque?.lugarOEnlace ? `. Lugar o enlace: ${bloque.lugarOEnlace}.` : ".");

    const representante = await ctx.db.get(cita.representanteId);
    if (representante !== null) {
      await notificar(
        ctx, representante.perfilUsuarioId, "RECORDATORIO_CITA", titulo,
        `Con el docente de ${nombre}. ${detalle}`, "cita", cita._id,
      );
    }
    const docente = await ctx.db.get(cita.docenteId);
    if (docente !== null) {
      await notificar(
        ctx, docente.perfilUsuarioId, "RECORDATORIO_CITA", titulo,
        `Con el representante de ${nombre}. ${detalle}`, "cita", cita._id,
      );
    }
    return true;
  },
});

/**
 * Cada cita con el nombre del estudiante y el lugar o enlace de su bloque.
 *
 * Sin el nombre, la agenda del docente decía solo fecha y modalidad: con
 * treinta familias no había forma de saber de quién era cada cita, y ahora
 * que el docente cita él mismo a las familias hace falta todavía más. El
 * lugar vive en el bloque, no en la cita; sin traerlo, una cita virtual no
 * mostraba el enlace en ninguna pantalla.
 */
async function presentarCitas(ctx: QueryCtx, citas: Doc<"cita">[]) {
  const presentadas = await Promise.all(citas.map(async (cita) => {
    const bloque = cita.disponibilidadDocenteId === undefined
      ? null
      : await ctx.db.get(cita.disponibilidadDocenteId);
    return {
      ...cita,
      estudianteNombre: await nombreDelEstudiante(ctx, cita.estudianteId),
      lugarOEnlace: bloque?.lugarOEnlace ?? null,
    };
  }));
  return presentadas.sort((a, b) => b.fechaHoraInicio - a.fechaHoraInicio);
}

/**
 * La familia no respondió una citación y ya es la víspera (o faltan dos
 * horas): se le recuerda a ella, y se le avisa al docente, que así sabe con
 * tiempo que quizá nadie llegue y puede volver a citar.
 *
 * Programada por `citarFamilia`. Como `recordarCita`, relee la cita al
 * dispararse: si la familia ya respondió, o la citación se retiró o cambió de
 * hora, no hace nada.
 */
export const recordarCitacionSinRespuesta = internalMutation({
  args: { citaId: v.id("cita"), fechaHoraInicio: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const cita = await ctx.db.get(args.citaId);
    const ahora = Date.now();
    if (cita === null || cita.origen !== "CITACION_DOCENTE" || cita.estado !== "SOLICITADA" ||
        cita.fechaHoraInicio !== args.fechaHoraInicio || cita.fechaHoraInicio <= ahora) {
      return false;
    }

    const nombre = (await nombreDelEstudiante(ctx, cita.estudianteId)) ?? "tu representado";
    const cuando = cuandoDesde(cita.fechaHoraInicio, ahora);
    const representante = await ctx.db.get(cita.representanteId);
    if (representante !== null) {
      await notificar(
        ctx, representante.perfilUsuarioId, "RECORDATORIO_CITA",
        "Tienes una citación sin responder",
        `El docente de ${nombre} te citó para ${cuando}. Confírmale si puedes asistir.`,
        "cita", cita._id,
      );
    }
    const docente = await ctx.db.get(cita.docenteId);
    if (docente !== null) {
      await notificar(
        ctx, docente.perfilUsuarioId, "CITACION",
        "La familia todavía no responde",
        `${nombre}: citación de ${cuando}, sin respuesta. Se lo recordamos a la familia.`,
        "cita", cita._id,
      );
    }
    return true;
  },
});

/** Citas del representante autenticado (P8). */
export const misCitasRepresentante = query({
  args: {},
  handler: (ctx) => conErroresPublicos(async () => {
    const representante = await exigirRepresentante(ctx);
    const citas = await ctx.db
      .query("cita")
      .withIndex("por_representante", (q) => q.eq("representanteId", representante._id))
      .collect();
    return await presentarCitas(ctx, citas);
  }),
});

/** Citas del docente autenticado (D16). */
export const misCitasDocente = query({
  args: {},
  handler: (ctx) => conErroresPublicos(async () => {
    const docente = await exigirDocente(ctx);
    const citas = await ctx.db
      .query("cita")
      .withIndex("por_docente", (q) => q.eq("docenteId", docente._id))
      .collect();
    return await presentarCitas(ctx, citas);
  }),
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
  handler: (ctx, args) => conErroresPublicos(async () => {
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
    const venceEn = ahora + REGLAS.INCONFORMIDAD_DIAS_PLAZO * DIA;
    const inconformidadId = await ctx.db.insert("inconformidad", {
      accionRegistradaId: args.accionRegistradaId,
      representanteId: representante._id,
      motivo: args.motivo,
      mensaje: exigirTexto(args.mensaje, "El mensaje del reclamo"),
      estado: "ABIERTA",
      // Se copia el docente de la accion reclamada: es lo que permite que su
      // bandeja lea solo lo suyo. La accion ya esta leida aqui arriba, asi que
      // no cuesta una lectura de mas (#48).
      docenteId: accion.registradaPorDocenteId,
      // F3: el docente tiene 30 días. El plazo sale de REGLAS, no de un
      // número escrito aquí.
      venceEn,
      actualizadoEn: ahora,
    });

    await programarVencimiento(ctx, inconformidadId, venceEn);

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
  }),
});

/**
 * Bandeja del docente (D15), con lo más próximo a vencer primero.
 *
 * Lee **solo los reclamos de este docente**, por el índice `por_docente_estado`
 * que empieza por `docenteId`. Antes filtraba por estado y descartaba en
 * memoria, lo que significaba leer todos los reclamos abiertos de todas las
 * instituciones para pintar la bandeja de una persona — y una `query` de
 * Convex que llega a su límite de lectura no se degrada: falla (#48).
 *
 * No calcula "vencida" aquí: `Date.now()` dentro de un `query` rompe la
 * reactividad de Convex, porque el resultado dejaría de depender solo de los
 * datos. Por eso el estado lo escribe la tarea `vencerInconformidad`.
 *
 * `VENCIDA` sigue en la lista a propósito: el esquema dice que al vencer "sube
 * de prioridad", no que desaparezca. Como se ordena por `venceEn` ascendente y
 * las vencidas son las más antiguas, quedan primeras solas. Y
 * `resolverInconformidad` las sigue aceptando: responder tarde es mejor que no
 * responder.
 */
export const inconformidadesDelDocente = query({
  args: {},
  handler: (ctx) => conErroresPublicos(async () => {
    const docente = await exigirDocente(ctx);

    // Antes esto recorria **todos** los reclamos abiertos del sistema y se
    // quedaba con los suyos en memoria: el trabajo de cada docente crecia con
    // los reclamos de todos los demas (#48). Ahora el indice entrega
    // directamente los de este docente.
    //
    // `VENCIDA` entra en la lista porque un reclamo que se le paso al docente
    // no deja de existir: esconderlo seria dejar de responderle a la familia.
    const mias = [];
    for (const estado of ["ABIERTA", "EN_REVISION", "VENCIDA"] as const) {
      const lote = await ctx.db
        .query("inconformidad")
        .withIndex("por_docente_estado", (q) =>
          q.eq("docenteId", docente._id).eq("estado", estado),
        )
        .collect();

      for (const i of lote) {
        const accion = await ctx.db.get(i.accionRegistradaId);
        if (accion === null || accion.registradaPorDocenteId !== docente._id) continue;

        // De quien se habla y quien reclama (#71). Hasta que #52 guardo los
        // nombres esto no se podia decir, y la bandeja pedia al docente que
        // decidiera si anula una sancion **sin saber de que estudiante es**.
        const matricula = await ctx.db.get(accion.matriculaId);
        const estudiante = matricula ? await ctx.db.get(matricula.estudianteId) : null;
        const representante = await ctx.db.get(i.representanteId);
        const perfil = representante ? await ctx.db.get(representante.perfilUsuarioId) : null;

        mias.push({
          id: i._id,
          motivo: i.motivo,
          mensaje: i.mensaje,
          estado: i.estado,
          venceEn: i.venceEn,
          estudiante: estudiante
            ? { id: estudiante._id, nombre: `${estudiante.nombres} ${estudiante.apellidos}` }
            : null,
          // `null` cuando el perfil es anterior a los nombres. La pantalla lo
          // dice con palabras en vez de enseñar un hueco.
          representante:
            perfil && (perfil.nombres || perfil.apellidos)
              ? `${perfil.nombres ?? ""} ${perfil.apellidos ?? ""}`.trim()
              : null,
          accion: {
            id: accion._id,
            descripcion: accion.descripcion,
            puntosAplicados: accion.puntosAplicados,
            fechaOcurrencia: accion.fechaOcurrencia,
            estado: accion.estado,
          },
        });
      }
    }
    return mias.sort((a, b) => a.venceEn - b.venceEn);
  }),
});

/**
 * El docente resuelve el reclamo.
 *
 * Tres desenlaces (F4):
 * - `MANTENIDA` — la acción queda como está.
 * - `MODIFICADA` — la acción pasa a `MODIFICADA`, vale 0 puntos.
 * - `ANULADA` — la acción pasa a `ANULADA`, vale 0 puntos.
 *
 * Poner la acción en 0 exige recalcular `puntajePeriodo`, y ese recálculo es
 * del módulo de conducta — no se duplica aquí. Desde #77 existe
 * `conducta.recalcularPuntaje` y **se llama desde esta mutation**: el puntaje
 * queda correcto en la misma transacción, no pendiente de nada.
 *
 * ADR-005: el puntaje no se ajusta a mano nunca. Se deriva de las acciones
 * VIGENTES, así que anular una no "resta puntos": la acción deja de contar y
 * el total se vuelve a calcular.
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
  handler: (ctx, args) => conErroresPublicos(async () => {
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
      await recalcularPuntaje(ctx, accion.matriculaId, accion.periodoAcademicoId);

      // DP-006 audita ANULAR sobre la **accion**, y este es el camino de
      // anulacion mas importante del producto: un docente retira una sancion
      // despues de que la familia la reclamo. Hasta aqui solo quedaba un
      // ACTUALIZAR sobre el reclamo, asi que quien auditara "que sanciones se
      // anularon" no veia ninguna de estas. Se registra con el mismo formato
      // que `conducta.anularAccion`, para que las dos vias se lean igual.
      await auditar(ctx, {
        accion: args.desenlace === "ANULADA" ? "ANULAR" : "ACTUALIZAR",
        entidadTipo: "accionRegistrada",
        entidadId: accion._id,
        datosAntes: { estado: accion.estado, puntosAplicados: accion.puntosAplicados },
        datosDespues: {
          estado: args.desenlace === "ANULADA" ? "ANULADA" : "MODIFICADA",
          puntosAplicados: 0,
          motivo: respuesta,
          porReclamo: inconformidad._id,
        },
      });
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
  }),
});

/** Programa el vencimiento y guarda su id en la misma transacción. */
async function programarVencimiento(
  ctx: MutationCtx,
  inconformidadId: Id<"inconformidad">,
  venceEn: number,
): Promise<void> {
  const vencimientoProgramadoId = await ctx.scheduler.runAt(
    venceEn,
    internal.interaccion.vencerInconformidad,
    { inconformidadId },
  );
  await ctx.db.patch(inconformidadId, { vencimientoProgramadoId });
}

/**
 * F3: tarea individual programada para `venceEn` al abrir el reclamo.
 * Relee el estado: resolver antes del plazo deja esta tarea sin efecto.
 * La transición y las notificaciones son atómicas e idempotentes.
 */
export const vencerInconformidad = internalMutation({
  args: { inconformidadId: v.id("inconformidad") },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const inconformidad = await ctx.db.get(args.inconformidadId);
    const ahora = Date.now();
    if (inconformidad === null ||
        (inconformidad.estado !== "ABIERTA" && inconformidad.estado !== "EN_REVISION") ||
        inconformidad.venceEn > ahora) {
      return false;
    }

    await ctx.db.patch(inconformidad._id, { estado: "VENCIDA", actualizadoEn: ahora });

    const representante = await ctx.db.get(inconformidad.representanteId);
    if (representante !== null) {
      await notificar(
        ctx,
        representante.perfilUsuarioId,
        "RESPUESTA_INCONFORMIDAD",
        "Tu reclamo venció sin respuesta",
        "Pasó el plazo para que el docente respondiera. El reclamo sigue " +
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
        "Se cumplió el plazo. Sigue en tu bandeja y aún puedes responderlo.",
        "inconformidad",
        inconformidad._id,
      );
    }
    return true;
  },
});

/**
 * Migración inicial tras desplegar: programa los reclamos anteriores al cambio.
 * Recorre ABIERTA y EN_REVISION en páginas, encadenadas sin esperar al otro día.
 * El id guardado evita duplicar tareas al repetir o ejecutar en paralelo la migración.
 * Si `venceEn` quedó en el pasado, runAt deja la tarea lista para ejecutarse.
 */
export const programarVencimientosExistentes = internalMutation({
  args: {
    estado: v.optional(v.union(v.literal("ABIERTA"), v.literal("EN_REVISION"))),
    paginationOpts: v.optional(paginationOptsValidator),
  },
  returns: v.object({ programadas: v.number(), continuacion: v.boolean() }),
  handler: async (ctx, args): Promise<{ programadas: number; continuacion: boolean }> => {
    const estado = args.estado ?? "ABIERTA";
    const paginationOpts = args.paginationOpts ?? { numItems: 100, cursor: null };
    if (!Number.isInteger(paginationOpts.numItems) ||
        paginationOpts.numItems < 1 || paginationOpts.numItems > 100) {
      throw new ErrorDominio("VALIDACION", "El lote debe tener entre 1 y 100 reclamos.");
    }
    const lote = await ctx.db
      .query("inconformidad")
      .withIndex("por_estado_vence", (q) => q.eq("estado", estado))
      .paginate(paginationOpts);

    let programadas = 0;
    for (const inconformidad of lote.page) {
      if (inconformidad.vencimientoProgramadoId !== undefined) continue;
      await programarVencimiento(ctx, inconformidad._id, inconformidad.venceEn);
      programadas++;
    }

    if (!lote.isDone) {
      await ctx.scheduler.runAfter(0, internal.interaccion.programarVencimientosExistentes, {
        estado,
        paginationOpts: { ...paginationOpts, cursor: lote.continueCursor },
      });
    } else if (estado === "ABIERTA") {
      await ctx.scheduler.runAfter(0, internal.interaccion.programarVencimientosExistentes, {
        estado: "EN_REVISION",
        paginationOpts: { numItems: paginationOpts.numItems, cursor: null },
      });
    }
    return { programadas, continuacion: !lote.isDone || estado === "ABIERTA" };
  },
});

/* ------------------------------------------------------------------ *
 *  ALERTAS DE EMERGENCIA  (G1, G2, G3)
 * ------------------------------------------------------------------ */

/**
 * El docente activa una alerta.
 *
 * G1: exige **reautenticación reciente**. El cliente reautentica con Clerk y
 * envía una prueba firmada de su sesión. La action comprueba su firma y
 * vigencia; solo la mutation interna recibe la fecha verificada.
 *
 * La app debe declarar **visiblemente que no sustituye al ECU 911**. Eso es
 * responsabilidad de la pantalla (D17), pero se repite aquí porque es una
 * regla del producto, no una decisión de interfaz.
 */
const datosAlerta = {
  cursoId: v.id("curso"),
  alcance: alcanceAlerta,
  estudianteId: v.optional(v.id("estudiante")),
  tipo: tipoAlerta,
  titulo: v.string(),
  mensaje: v.string(),
  esSimulacro: v.boolean(),
};

/** La prueba firmada solo se comprueba en el servidor; no se guarda el token. */
export const activarAlerta = action({
  args: { ...datosAlerta, tokenReautenticacion: v.string() },
  handler: (ctx, { tokenReautenticacion, ...datos }): Promise<{ id: Id<"alertaEmergencia">; entregas: number }> =>
    conErroresPublicos(async () => {
      const reautenticadoEn = await verificarReautenticacion(tokenReautenticacion, await ctx.auth.getUserIdentity());
      return await ctx.runMutation(internal.interaccion.activarAlertaVerificada, { ...datos, reautenticadoEn });
    }),
});

/** Privada: la titularidad y todas las escrituras se comprueban atómicamente. */
export const activarAlertaVerificada = internalMutation({
  args: { ...datosAlerta, reautenticadoEn: v.number() },
  handler: (ctx, args) => conErroresPublicos(async () => {
    const docente = await exigirTitularDelCurso(ctx, args.cursoId);
    exigirAlcanceCoherente(args.alcance, args.estudianteId);

    const ahora = Date.now();
    // Una reautenticación de hace media hora no sirve: la gracia es que la
    // persona demuestre que es ella *en el momento* de activar la alerta.
    if (!Number.isFinite(args.reautenticadoEn) || args.reautenticadoEn > ahora || ahora - args.reautenticadoEn > 5 * MINUTO) {
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
  }),
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
  handler: (ctx) => conErroresPublicos(async () => {
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
  }),
});

/** G3: el representante confirma que la leyó. */
export const confirmarAlerta = mutation({
  args: { entregaAlertaId: v.id("entregaAlerta") },
  handler: (ctx, args) => conErroresPublicos(async () => {
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
  }),
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
  handler: (ctx, args) => conErroresPublicos(async () => {
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
  }),
});

/**
 * Las ultimas notificaciones del usuario autenticado.
 *
 * Antes leia **todas** las suyas desde siempre y las ordenaba en memoria. Una
 * bandeja no encoge nunca: un representante recibe el reporte diario de su
 * hijo, y a lo largo de un año lectivo eso son unas doscientas, mas las
 * respuestas a reclamos y el estado de sus citas. Cada apertura de la campana
 * leia la pila entera para pintar las diez de arriba.
 *
 * Convex añade `_creationTime` al final de todo indice, asi que `por_usuario`
 * ya sabe ordenar por fecha: `.order("desc").take(...)` trae las mas recientes
 * sin leer el resto y sin ordenar nada a mano.
 *
 * El tope es generoso a proposito. La pantalla no tiene paginacion todavia, y
 * un tope corto convertiria una mejora de lectura en perdida de informacion
 * visible. El dia que la bandeja necesite historial, esto pasa a
 * `paginationOpts` como `listarMisEstudiantes`.
 */
const NOTIFICACIONES_EN_BANDEJA = 100;

export const misNotificaciones = query({
  args: {},
  handler: (ctx) => conErroresPublicos(async () => {
    // Sin perfil **no es un error**: es el estado normal entre registrarse y
    // completar el alta, y en ese momento la bandeja esta vacia por
    // definicion. Lanzar aqui tumbaba la pantalla entera del usuario nuevo.
    const perfil = await perfilActual(ctx);
    if (perfil === null) return [];

    const notificaciones = await ctx.db
      .query("notificacion")
      .withIndex("por_usuario", (q) => q.eq("perfilUsuarioId", perfil._id))
      .order("desc")
      .take(NOTIFICACIONES_EN_BANDEJA);
    return await Promise.all(notificaciones.map(async (n) => ({
      ...n,
      cursoId: n.entidadTipo === "cita" && n.entidadId ? await cursoDeLaCita(ctx, n.entidadId) : null,
    })));
  }),
});

/**
 * El curso de una cita, para que tocar su aviso lleve al docente a la agenda
 * correcta: esa pantalla vive dentro de un curso (D16), y con varios no hay
 * cómo adivinar cuál. Primero el curso para el que se publicó la franja; si
 * no lo dice, el curso en el que está matriculado el estudiante.
 */
async function cursoDeLaCita(ctx: QueryCtx, entidadId: string): Promise<Id<"curso"> | null> {
  const citaId = ctx.db.normalizeId("cita", entidadId);
  const cita = citaId === null ? null : await ctx.db.get(citaId);
  if (cita === null) return null;
  const bloque = cita.disponibilidadDocenteId === undefined
    ? null
    : await ctx.db.get(cita.disponibilidadDocenteId);
  if (bloque?.cursoId !== undefined) return bloque.cursoId;
  const matricula = await ctx.db
    .query("matricula")
    .withIndex("por_estudiante_estado", (q) =>
      q.eq("estudianteId", cita.estudianteId).eq("estado", "CURSANDO"),
    )
    .unique();
  return matricula?.cursoId ?? null;
}

/** Marca una notificación como leída. Solo el dueño puede. */
export const marcarNotificacionLeida = mutation({
  args: { notificacionId: v.id("notificacion") },
  handler: (ctx, args) => conErroresPublicos(async () => {
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
  }),
});
