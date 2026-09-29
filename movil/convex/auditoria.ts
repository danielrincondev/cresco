/**
 * Productores de la bitácora. Dueño: Persona C (interacción e infraestructura).
 *
 * `lib/permisos.ts` expone `auditar()` desde el primer día, pero hasta ahora
 * **ninguna función la llamaba**: la tabla `auditoria` existía sin productor
 * (Issue #19). DP-006 fijó los cuatro eventos de la v1; dos de ellos viven en
 * el módulo donde ocurren y dos no tienen módulo propio:
 *
 *   | Evento                  | Dónde vive                                |
 *   |-------------------------|-------------------------------------------|
 *   | `APROBAR` estudiante    | `nucleo.aprobarEstudiante` (#7, Persona A) |
 *   | `CREAR`/`ANULAR` acción | `conducta.ts` (#9, Persona B)              |
 *   | `LOGIN`                 | aquí                                       |
 *   | `LEER_SENSIBLE`         | aquí                                       |
 *
 * ── Por qué `LEER_SENSIBLE` necesita una mutation aparte ────────────────────
 *
 * Se audita una **lectura**, pero las `query` de Convex son de solo lectura y
 * cacheadas: no pueden escribir la bitácora desde dentro de la consulta que lee
 * el dato, como sí hacía la capa de acceso sobre Postgres. Así que la pantalla
 * llama a esta mutation al abrirse. Es una llamada de más, y es el precio de
 * haber perdido RLS: sin ella la tabla se queda vacía justo en la pregunta que
 * un colegio sí va a hacer — *"¿quién vio los datos de mi hijo?"*.
 *
 * Estas dos funciones **no** son el permiso: comprueban el acceso con las
 * mismas guardas de `permisos.ts` que usa la consulta real, para que auditar no
 * se convierta en una puerta lateral para sondear qué estudiantes existen.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { PLATAFORMA } from "./lib/enums";
import {
  ErrorPermiso,
  auditar,
  exigirAccesoDocenteAEstudiante,
  exigirPerfil,
  exigirTitularDelCurso,
  exigirVinculo,
  perfilActual,
} from "./lib/permisos";

const plataforma = v.union(...PLATAFORMA.map((x) => v.literal(x)));

/**
 * Qué se abrió. No son tablas: son las pantallas que muestran datos de un
 * menor, que es lo que se le explica a un representante o a un colegio.
 */
const RECURSO_SENSIBLE = [
  "FICHA_ESTUDIANTE",
  "BITACORA_ACCIONES",
  "REPORTE_ESTUDIANTE",
  "PUNTAJE_PERIODO",
] as const;
const recursoSensible = v.union(...RECURSO_SENSIBLE.map((x) => v.literal(x)));

const MINUTO = 60_000;

/**
 * Ventanas de agrupación. La app vuelve a montar una pantalla por motivos que
 * no son un acceso nuevo (rotar el teléfono, volver de segundo plano), y una
 * bitácora con cien filas iguales no responde mejor la pregunta del colegio:
 * la vuelve ilegible. Se agrupa, y se documenta que se agrupa.
 */
const VENTANA_LOGIN = 30 * MINUTO;
const VENTANA_LECTURA = 5 * MINUTO;

/** Las entradas del propio usuario dentro de la ventana. El índice las acota. */
async function eventosRecientes(
  ctx: MutationCtx,
  perfilUsuarioId: Id<"perfilUsuario">,
  desde: number,
): Promise<Doc<"auditoria">[]> {
  return await ctx.db
    .query("auditoria")
    .withIndex("por_usuario", (q) =>
      q.eq("perfilUsuarioId", perfilUsuarioId).gt("ocurridoEn", desde),
    )
    .collect();
}

/**
 * Registra el inicio de sesión.
 *
 * La pantalla la llama una vez cuando Clerk confirma la sesión. Antes de
 * completar el perfil no hay a quién atribuir el evento —la cuenta de Clerk no
 * es todavía una persona del dominio—, así que devuelve `SIN_PERFIL` sin
 * escribir y la pantalla vuelve a llamar en cuanto termina el alta (#42).
 */
export const registrarInicioSesion = mutation({
  args: { plataforma: v.optional(plataforma) },
  handler: async (ctx, args) => {
    if ((await ctx.auth.getUserIdentity()) === null) {
      throw new ErrorPermiso("NO_AUTENTICADO", "Inicia sesión para continuar.");
    }
    const perfil = await perfilActual(ctx);
    if (perfil === null) return { registrado: false, motivo: "SIN_PERFIL" as const };

    const ahora = Date.now();
    const recientes = await eventosRecientes(ctx, perfil._id, ahora - VENTANA_LOGIN);
    if (recientes.some((evento) => evento.accion === "LOGIN")) {
      return { registrado: false, motivo: "YA_REGISTRADO" as const };
    }

    await auditar(ctx, {
      accion: "LOGIN",
      entidadTipo: "perfilUsuario",
      entidadId: perfil._id,
      datosDespues: { plataforma: args.plataforma ?? null },
    });
    return { registrado: true, motivo: null };
  },
});

/**
 * Acceso legítimo a un estudiante, por cualquiera de los dos caminos.
 *
 * Se prueban los dos porque una misma persona puede ser docente y
 * representante a la vez (un profesor con hijos en el colegio). El error final
 * es siempre el mismo exista o no el estudiante: si distinguiera "no existe"
 * de "no es tuyo", esta mutation sería un buscador de estudiantes ajenos.
 */
async function exigirAccesoAlEstudiante(
  ctx: MutationCtx,
  estudianteId: Id<"estudiante">,
  recurso: string,
) {
  const perfil = await exigirPerfil(ctx);
  try {
    await exigirVinculo(ctx, estudianteId);
    return { perfil, rol: "REPRESENTANTE" as const };
  } catch (error) {
    if (!(error instanceof ErrorPermiso)) throw error;
  }
  try {
    await exigirAccesoDocenteAEstudiante(ctx, estudianteId);
    return { perfil, rol: "DOCENTE" as const };
  } catch (error) {
    if (!(error instanceof ErrorPermiso)) throw error;
  }

  // AprobarForm abre pendientes sin matrícula. Para su ficha se demuestra
  // el curso por el vínculo y la invitación, igual que en listarPendientes.
  // Este camino no concede acceso a reportes, puntajes ni bitácoras.
  if (recurso === "FICHA_ESTUDIANTE") {
    const estudiante = await ctx.db.get(estudianteId);
    if (estudiante?.estado === "ACTIVO" && estudiante.estadoVerificacion === "PENDIENTE") {
      const vinculo = await ctx.db.query("vinculoRepresentacion")
        .withIndex("por_estudiante_estado", (q) =>
          q.eq("estudianteId", estudianteId).eq("estado", "ACTIVO"))
        .unique();
      const invitacion = vinculo?.invitacionCursoId
        ? await ctx.db.get(vinculo.invitacionCursoId) : null;
      const curso = invitacion ? await ctx.db.get(invitacion.cursoId) : null;
      const anio = curso ? await ctx.db.get(curso.anioLectivoId) : null;
      if (curso && anio?.institucionId === estudiante.institucionId) {
        try {
          await exigirTitularDelCurso(ctx, curso._id);
          return { perfil, rol: "DOCENTE" as const };
        } catch (error) {
          if (!(error instanceof ErrorPermiso)) throw error;
        }
      }
    }
  }
  throw new ErrorPermiso("SIN_VINCULO", "No tienes acceso a la información de este estudiante.");
}

/**
 * Registra que alguien abrió datos de un estudiante.
 *
 * DP-006 nombra el caso del representante que abre el reporte de su hijo. Se
 * cubre también el del docente: es aditivo, no cambia la decisión, y es la
 * mitad de la respuesta cuando un colegio pregunta quién vio a un menor.
 */
export const registrarLecturaSensible = mutation({
  args: {
    estudianteId: v.id("estudiante"),
    recurso: recursoSensible,
    /**
     * Solo para REPORTE_ESTUDIANTE: el reporte concreto que se abrió. Con
     * esto se marca `entregaReporte.leidoEn` -- el dato que alimenta
     * `fraseDeLecturas` (QA del 27 de septiembre, "que la app sea un
     * motivador para que los padres estén acompañando"). Antes de este
     * cambio nada escribía ese campo: la columna existía desde DP-006 y se
     * quedaba siempre vacía.
     */
    reporteEstudianteId: v.optional(v.id("reporteEstudiante")),
  },
  handler: async (ctx, args) => {
    const { perfil, rol } = await exigirAccesoAlEstudiante(ctx, args.estudianteId, args.recurso);
    const estudiante = await ctx.db.get(args.estudianteId);
    if (estudiante === null) {
      // Las guardas de arriba ya lo leyeron; llegar aquí sería un bug.
      throw new ErrorPermiso("SIN_VINCULO", "No tienes acceso a la información de este estudiante.");
    }

    const ahora = Date.now();
    const recientes = await eventosRecientes(ctx, perfil._id, ahora - VENTANA_LECTURA);
    // El id del reporte entra en la comparación: sin esto, abrir el reporte
    // de ayer y luego el de hoy dentro de la misma ventana de 5 minutos
    // contaba como "ya registrada" la segunda vez, y `entregaReporte.leidoEn`
    // del segundo nunca se marcaba. Para el resto de los recursos (sin id)
    // `undefined === undefined` deja el agrupado de siempre intacto.
    const yaRegistrada = recientes.some((evento) => {
      if (evento.accion !== "LEER_SENSIBLE" || evento.entidadId !== args.estudianteId) return false;
      const datos = evento.datosDespues as { recurso?: string; reporteEstudianteId?: string } | undefined;
      return datos?.recurso === args.recurso && datos?.reporteEstudianteId === args.reporteEstudianteId;
    });
    if (yaRegistrada) return { registrado: false };

    await auditar(ctx, {
      accion: "LEER_SENSIBLE",
      entidadTipo: "estudiante",
      entidadId: args.estudianteId,
      institucionId: estudiante.institucionId,
      datosDespues: { recurso: args.recurso, rol, reporteEstudianteId: args.reporteEstudianteId },
    });

    if (args.recurso === "REPORTE_ESTUDIANTE" && rol === "REPRESENTANTE" && args.reporteEstudianteId) {
      const representante = await ctx.db.query("representante").withIndex("por_perfil", (q) => q.eq("perfilUsuarioId", perfil._id)).unique();
      const entrega = representante && await ctx.db.query("entregaReporte")
        .withIndex("por_reporte_representante", (q) => q.eq("reporteEstudianteId", args.reporteEstudianteId!).eq("representanteId", representante._id))
        .unique();
      if (entrega && entrega.leidoEn === undefined) {
        await ctx.db.patch(entrega._id, { leidoEn: ahora });
      }
    }

    return { registrado: true };
  },
});
