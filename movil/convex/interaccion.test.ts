// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const modules = import.meta.glob(["./interaccion.ts", "./migraciones.ts", "./_generated/*.js"]);

const AHORA = new Date("2026-09-07T15:00:00Z");

/** Arma un docente con su curso, y un representante vinculado a un estudiante. */
async function sembrarEscenario(t: ReturnType<typeof convexTest>) {
  const ids = await t.run(async (ctx) => {
    const ahora = Date.now();

    const perfilDocente = await ctx.db.insert("perfilUsuario", {
      authSubject: "https://convex.test|docente_1", tipoDocumento: "CEDULA", numeroDocumento: "0900000001",
      actualizadoEn: ahora,
    });
    const docenteId = await ctx.db.insert("docente", {
      perfilUsuarioId: perfilDocente, actualizadoEn: ahora,
    });

    const perfilRep = await ctx.db.insert("perfilUsuario", {
      authSubject: "https://convex.test|rep_1", tipoDocumento: "CEDULA", numeroDocumento: "0900000002",
      actualizadoEn: ahora,
    });
    const representanteId = await ctx.db.insert("representante", {
      perfilUsuarioId: perfilRep, actualizadoEn: ahora,
    });

    const institucionId = await ctx.db.insert("institucion", {
      nombreDeclarado: "Unidad Educativa Piloto", verificada: false,
      regimen: "COSTA_INSULAR", ciudad: "Guayaquil", zonaHoraria: "America/Guayaquil",
      puntajeBase: 60, puntajeMinimo: 0, puntajeMaximo: 100,
      topeDiarioPositivo: 4, topeDiarioNegativo: 5,
      estado: "ACTIVA", actualizadoEn: ahora,
    });
    const anioLectivoId = await ctx.db.insert("anioLectivo", {
      institucionId, nombre: "2026–2027", fechaInicio: "2026-05-04", fechaFin: "2027-02-26",
      estado: "EN_CURSO", actualizadoEn: ahora,
    });
    const periodoAcademicoId = await ctx.db.insert("periodoAcademico", {
      anioLectivoId, nombre: "Primer parcial", orden: 1,
      fechaInicio: "2026-05-04", fechaFin: "2026-07-10",
      estado: "EN_CURSO", actualizadoEn: ahora,
    });
    const cursoId = await ctx.db.insert("curso", {
      anioLectivoId, nombre: "Quinto A", nivel: "5to", paralelo: "A",
      jornada: "MATUTINA", estado: "ACTIVO", actualizadoEn: ahora,
    });
    await ctx.db.insert("asignacionDocente", {
      cursoId, docenteId, rol: "TITULAR", vigenteDesde: "2026-05-04", actualizadoEn: ahora,
    });

    const estudianteId = await ctx.db.insert("estudiante", {
      institucionId, nombres: "Ana", apellidos: "Pérez",
      tipoDocumento: "CEDULA", numeroDocumento: "0911111111",
      origenRegistro: "REPRESENTANTE", estadoVerificacion: "APROBADO", estado: "ACTIVO",
      actualizadoEn: ahora,
    });
    const matriculaId = await ctx.db.insert("matricula", {
      estudianteId, cursoId, fechaIngreso: "2026-05-04",
      estado: "CURSANDO", actualizadoEn: ahora,
    });
    await ctx.db.insert("vinculoRepresentacion", {
      representanteId, estudianteId, parentesco: "MADRE",
      estado: "ACTIVO", vigenteDesde: "2026-05-04", actualizadoEn: ahora,
    });

    return {
      docenteId, representanteId, estudianteId, cursoId, matriculaId,
      periodoAcademicoId, institucionId,
    };
  });

  return {
    ...ids,
    docente: t.withIdentity({ subject: "docente_1", sid: "sesion_docente" }),
    representante: t.withIdentity({ subject: "rep_1" }),
  };
}

/** Inserta una acción negativa vigente, que es lo único reclamable. */
async function sembrarAccion(
  t: ReturnType<typeof convexTest>,
  e: Awaited<ReturnType<typeof sembrarEscenario>>,
  signo: "POSITIVA" | "NEGATIVA" = "NEGATIVA",
  estado: "VIGENTE" | "ANULADA" = "VIGENTE",
): Promise<Id<"accionRegistrada">> {
  return await t.run(async (ctx) => {
    const ahora = Date.now();
    const categoriaAccionId = await ctx.db.insert("categoriaAccion", {
      institucionId: e.institucionId, codigo: "DISCIPLINA", nombre: "Indisciplina",
      aplicaA: "ESTUDIANTE", orden: 1, activa: true, actualizadoEn: ahora,
    });
    const negativa = signo === "NEGATIVA";
    const tipoAccionId = await ctx.db.insert("tipoAccion", {
      institucionId: e.institucionId, categoriaAccionId, codigo: "NEG_INDISCIPLINA",
      nombre: "Indisciplina", signo,
      puntosDefecto: negativa ? -1 : 1,
      puntosMin: negativa ? -3 : 1,
      puntosMax: negativa ? -1 : 2,
      requiereDescripcion: true,
      admiteInconformidad: negativa,
      cuentaEnBitacora: true, activa: true, actualizadoEn: ahora,
    });
    return await ctx.db.insert("accionRegistrada", {
      matriculaId: e.matriculaId, periodoAcademicoId: e.periodoAcademicoId,
      tipoAccionId, categoriaAccionId, signo,
      puntosAplicados: signo === "NEGATIVA" ? -2 : 1,
      cuentaEnBitacora: true, descripcion: "Interrumpió la clase varias veces",
      fechaOcurrencia: "2026-09-07", registradaPorDocenteId: e.docenteId,
      estado, actualizadoEn: ahora,
    });
  });
}

beforeEach(() => vi.useFakeTimers().setSystemTime(AHORA));

describe("interaccion — citas", () => {
  it("rechaza publicar disponibilidad sin autenticar", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.interaccion.publicarDisponibilidad, {
        fecha: "2026-09-10", horaInicio: "12:30", horaFin: "13:00",
      }),
    ).rejects.toThrow("Inicia sesión para continuar");
  });

  it("no permite publicar un horario en el pasado", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    await expect(
      e.docente.mutation(api.interaccion.publicarDisponibilidad, {
        fecha: "2026-01-01", horaInicio: "12:30", horaFin: "13:00",
      }),
    ).rejects.toThrow("en el pasado");
  });

  it("no permite dos bloques que se cruzan el mismo día", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    await e.docente.mutation(api.interaccion.publicarDisponibilidad, {
      fecha: "2026-09-10", horaInicio: "12:30", horaFin: "13:30",
    });
    await expect(
      e.docente.mutation(api.interaccion.publicarDisponibilidad, {
        fecha: "2026-09-10", horaInicio: "13:00", horaFin: "14:00",
      }),
    ).rejects.toThrow("se cruza");
  });

  it("la cita nace SOLICITADA y ocupa el bloque", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const bloqueId = await e.docente.mutation(api.interaccion.publicarDisponibilidad, {
      fecha: "2026-09-10", horaInicio: "12:30", horaFin: "13:00",
    });

    await e.representante.mutation(api.interaccion.solicitarCita, {
      disponibilidadDocenteId: bloqueId, estudianteId: e.estudianteId,
    });

    const estado = await t.run(async (ctx) => ({
      cita: (await ctx.db.query("cita").collect())[0],
      bloque: await ctx.db.get(bloqueId),
    }));
    expect(estado.cita.estado).toBe("SOLICITADA");
    expect(estado.cita.origen).toBe("SOLICITADA_POR_REPRESENTANTE");
    expect(estado.bloque?.estado).toBe("RESERVADO");
  });

  it("un representante sin vinculo no puede reservar para ese estudiante", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const bloqueId = await e.docente.mutation(api.interaccion.publicarDisponibilidad, {
      fecha: "2026-09-10", horaInicio: "12:30", horaFin: "13:00",
    });

    const ajeno = await t.run(async (ctx) => {
      const perfil = await ctx.db.insert("perfilUsuario", {
        authSubject: "https://convex.test|rep_2", tipoDocumento: "CEDULA", numeroDocumento: "0900000003",
        actualizadoEn: Date.now(),
      });
      await ctx.db.insert("representante", { perfilUsuarioId: perfil, actualizadoEn: Date.now() });
    });
    void ajeno;

    await expect(
      t.withIdentity({ subject: "rep_2" }).mutation(api.interaccion.solicitarCita, {
        disponibilidadDocenteId: bloqueId, estudianteId: e.estudianteId,
      }),
    ).rejects.toThrow("No tienes acceso");
  });

  it("no se puede ver el horario del docente de un estudiante ajeno", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    await e.docente.mutation(api.interaccion.publicarDisponibilidad, {
      fecha: "2026-09-10", horaInicio: "12:30", horaFin: "13:00",
    });

    await t.run(async (ctx) => {
      const perfil = await ctx.db.insert("perfilUsuario", {
        authSubject: "https://convex.test|rep_2", tipoDocumento: "CEDULA", numeroDocumento: "0900000003",
        actualizadoEn: Date.now(),
      });
      await ctx.db.insert("representante", { perfilUsuarioId: perfil, actualizadoEn: Date.now() });
    });

    await expect(
      t.withIdentity({ subject: "rep_2" }).query(api.interaccion.bloquesDisponibles, {
        estudianteId: e.estudianteId, desde: "2026-09-01",
      }),
    ).rejects.toThrow("No tienes acceso");

    // Y el representante que sí tiene vínculo lo ve sin problema.
    const suyos = await e.representante.query(api.interaccion.bloquesDisponibles, {
      estudianteId: e.estudianteId, desde: "2026-09-01",
    });
    expect(suyos).toHaveLength(2);
    expect(suyos[0].duracionMinutos).toBe(15);
  });

  it("rechazar la cita libera el bloque", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const bloqueId = await e.docente.mutation(api.interaccion.publicarDisponibilidad, {
      fecha: "2026-09-10", horaInicio: "12:30", horaFin: "13:00",
    });
    const citaId = await e.representante.mutation(api.interaccion.solicitarCita, {
      disponibilidadDocenteId: bloqueId, estudianteId: e.estudianteId,
    });

    await e.docente.mutation(api.interaccion.responderCita, {
      citaId, aceptar: false, notasDocente: "Ese día tengo consejo de curso",
    });

    const estado = await t.run(async (ctx) => ({
      cita: await ctx.db.get(citaId),
      bloque: await ctx.db.get(bloqueId),
    }));
    expect(estado.cita?.estado).toBe("RECHAZADA");
    expect(estado.bloque?.estado).toBe("DISPONIBLE");
  });
});

describe("interaccion — inconformidades", () => {
  it("no se puede reclamar una accion positiva", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const accionId = await sembrarAccion(t, e, "POSITIVA");

    await expect(
      e.representante.mutation(api.interaccion.abrirInconformidad, {
        accionRegistradaId: accionId, motivo: "NO_OCURRIO", mensaje: "No fue así",
      }),
    ).rejects.toThrow("Solo se pueden reclamar las acciones negativas");
  });

  it("no se puede reclamar una accion ya anulada", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const accionId = await sembrarAccion(t, e, "NEGATIVA", "ANULADA");

    await expect(
      e.representante.mutation(api.interaccion.abrirInconformidad, {
        accionRegistradaId: accionId, motivo: "NO_OCURRIO", mensaje: "No fue así",
      }),
    ).rejects.toThrow("ya fue anulada");
  });

  it("un representante sin vinculo no puede reclamar la accion de otro estudiante", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const accionId = await sembrarAccion(t, e);

    await t.run(async (ctx) => {
      const perfil = await ctx.db.insert("perfilUsuario", {
        authSubject: "https://convex.test|rep_2", tipoDocumento: "CEDULA", numeroDocumento: "0900000003",
        actualizadoEn: Date.now(),
      });
      await ctx.db.insert("representante", { perfilUsuarioId: perfil, actualizadoEn: Date.now() });
    });

    await expect(
      t.withIdentity({ subject: "rep_2" }).mutation(api.interaccion.abrirInconformidad, {
        accionRegistradaId: accionId, motivo: "NO_OCURRIO", mensaje: "No fue así",
      }),
    ).rejects.toThrow("No tienes acceso");
  });

  it("el plazo de vencimiento sale de REGLAS, no escrito a mano", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const accionId = await sembrarAccion(t, e);

    const id = await e.representante.mutation(api.interaccion.abrirInconformidad, {
      accionRegistradaId: accionId, motivo: "CONTEXTO_INCOMPLETO",
      mensaje: "Mi hija dice que fue otro compañero",
    });

    const inconformidad = await t.run(async (ctx) => await ctx.db.get(id));
    const dias = (inconformidad!.venceEn - AHORA.getTime()) / (24 * 60 * 60 * 1000);
    expect(dias).toBe(30);
    expect(inconformidad!.estado).toBe("ABIERTA");
  });

  it("no se puede abrir dos reclamos sobre la misma accion", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const accionId = await sembrarAccion(t, e);

    await e.representante.mutation(api.interaccion.abrirInconformidad, {
      accionRegistradaId: accionId, motivo: "NO_OCURRIO", mensaje: "No ocurrió",
    });
    await expect(
      e.representante.mutation(api.interaccion.abrirInconformidad, {
        accionRegistradaId: accionId, motivo: "OTRO", mensaje: "Insisto",
      }),
    ).rejects.toThrow("Ya abriste un reclamo");
  });

  it("resolver como MODIFICADA deja la accion en 0 puntos", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const accionId = await sembrarAccion(t, e);
    const inconformidadId = await e.representante.mutation(api.interaccion.abrirInconformidad, {
      accionRegistradaId: accionId, motivo: "SANCION_DESPROPORCIONADA", mensaje: "Fue excesivo",
    });

    await e.docente.mutation(api.interaccion.resolverInconformidad, {
      inconformidadId, desenlace: "MODIFICADA",
      respuestaDocente: "Tiene razón, lo dejo sin efecto",
    });

    const estado = await t.run(async (ctx) => ({
      accion: await ctx.db.get(accionId),
      inconformidad: await ctx.db.get(inconformidadId),
      auditoria: await ctx.db.query("auditoria").collect(),
    }));
    expect(estado.accion?.estado).toBe("MODIFICADA");
    expect(estado.accion?.puntosAplicados).toBe(0);
    expect(estado.inconformidad?.estado).toBe("RESUELTA_MODIFICADA");
    expect(estado.auditoria).toHaveLength(1);
  });

  it("resolver como MANTENIDA no toca la accion", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const accionId = await sembrarAccion(t, e);
    const inconformidadId = await e.representante.mutation(api.interaccion.abrirInconformidad, {
      accionRegistradaId: accionId, motivo: "NO_OCURRIO", mensaje: "No pasó",
    });

    await e.docente.mutation(api.interaccion.resolverInconformidad, {
      inconformidadId, desenlace: "MANTENIDA",
      respuestaDocente: "Lo vi personalmente, mantengo el registro",
    });

    const accion = await t.run(async (ctx) => await ctx.db.get(accionId));
    expect(accion?.estado).toBe("VIGENTE");
    expect(accion?.puntosAplicados).toBe(-2);
  });

  it("un docente ajeno no puede resolver el reclamo", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const accionId = await sembrarAccion(t, e);
    const inconformidadId = await e.representante.mutation(api.interaccion.abrirInconformidad, {
      accionRegistradaId: accionId, motivo: "NO_OCURRIO", mensaje: "No pasó",
    });

    await t.run(async (ctx) => {
      const perfil = await ctx.db.insert("perfilUsuario", {
        authSubject: "https://convex.test|docente_2", tipoDocumento: "CEDULA", numeroDocumento: "0900000004",
        actualizadoEn: Date.now(),
      });
      await ctx.db.insert("docente", { perfilUsuarioId: perfil, actualizadoEn: Date.now() });
    });

    await expect(
      t.withIdentity({ subject: "docente_2" }).mutation(api.interaccion.resolverInconformidad, {
        inconformidadId, desenlace: "ANULADA", respuestaDocente: "La anulo",
      }),
    ).rejects.toThrow("que no registraste");
  });
});

describe("interaccion — alertas de emergencia", () => {
  it("exige reautenticacion reciente", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);

    await expect(
      e.docente.mutation(internal.interaccion.activarAlertaVerificada, {
        cursoId: e.cursoId, alcance: "CURSO", tipo: "EVACUACION",
        titulo: "Evacuación", mensaje: "Vengan por sus hijos",
        esSimulacro: false,
        reautenticadoEn: AHORA.getTime() - 30 * 60_000, // media hora antes
      }),
    ).rejects.toThrow("Vuelve a confirmar tu identidad");
  });

  it("un tipo SIMULACRO tiene que marcarse como simulacro", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);

    await expect(
      e.docente.mutation(internal.interaccion.activarAlertaVerificada, {
        cursoId: e.cursoId, alcance: "CURSO", tipo: "SIMULACRO",
        titulo: "Simulacro", mensaje: "Es una práctica",
        esSimulacro: false, reautenticadoEn: AHORA.getTime(),
      }),
    ).rejects.toThrow("debe marcarse como simulacro");
  });

  it("alcance CURSO no admite estudiante", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);

    await expect(
      e.docente.mutation(internal.interaccion.activarAlertaVerificada, {
        cursoId: e.cursoId, alcance: "CURSO", estudianteId: e.estudianteId,
        tipo: "ACCIDENTE", titulo: "Accidente", mensaje: "Vengan",
        esSimulacro: false, reautenticadoEn: AHORA.getTime(),
      }),
    ).rejects.toThrow("no lleva estudiante");
  });

  it("genera una entrega por representante y queda auditada", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);

    const r = await e.docente.mutation(internal.interaccion.activarAlertaVerificada, {
      cursoId: e.cursoId, alcance: "CURSO", tipo: "SUSPENSION_CLASES",
      titulo: "Se suspenden las clases", mensaje: "No hay agua en el plantel",
      esSimulacro: false, reautenticadoEn: AHORA.getTime(),
    });

    expect(r.entregas).toBe(1);
    const estado = await t.run(async (ctx) => ({
      entregas: await ctx.db.query("entregaAlerta").collect(),
      auditoria: await ctx.db.query("auditoria").collect(),
      notificaciones: await ctx.db.query("notificacion").collect(),
    }));
    expect(estado.entregas).toHaveLength(1);
    expect(estado.auditoria[0].accion).toBe("ALERTA");
    expect(estado.notificaciones[0].tipo).toBe("ALERTA_EMERGENCIA");
  });

  it("el representante confirma la lectura y no puede confirmar la de otro", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    await e.docente.mutation(internal.interaccion.activarAlertaVerificada, {
      cursoId: e.cursoId, alcance: "CURSO", tipo: "RETIRO_ANTICIPADO",
      titulo: "Salida anticipada", mensaje: "Hoy salen a las 11:00",
      esSimulacro: false, reautenticadoEn: AHORA.getTime(),
    });

    const mias = await e.representante.query(api.interaccion.misAlertas);
    expect(mias).toHaveLength(1);
    expect(mias[0].confirmada).toBe(false);

    await e.representante.mutation(api.interaccion.confirmarAlerta, {
      entregaAlertaId: mias[0].entregaId,
    });
    const despues = await e.representante.query(api.interaccion.misAlertas);
    expect(despues[0].confirmada).toBe(true);

    await expect(
      e.docente.mutation(api.interaccion.confirmarAlerta, {
        entregaAlertaId: mias[0].entregaId,
      }),
    ).rejects.toThrow();
  });
});

describe("interaccion — dispositivos y notificaciones", () => {
  it("registrar el mismo token dos veces no duplica el dispositivo", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);

    await e.representante.mutation(api.interaccion.registrarDispositivo, {
      tokenPush: "ExponentPushToken[abc]", plataforma: "ANDROID",
    });
    await e.representante.mutation(api.interaccion.registrarDispositivo, {
      tokenPush: "ExponentPushToken[abc]", plataforma: "ANDROID", versionApp: "1.1.0",
    });

    const dispositivos = await t.run(async (ctx) => await ctx.db.query("dispositivo").collect());
    expect(dispositivos).toHaveLength(1);
    expect(dispositivos[0].versionApp).toBe("1.1.0");
  });

  it("nadie puede marcar como leida la notificacion de otro", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const accionId = await sembrarAccion(t, e);
    await e.representante.mutation(api.interaccion.abrirInconformidad, {
      accionRegistradaId: accionId, motivo: "OTRO", mensaje: "Quisiera conversarlo",
    });

    // La notificacion del reclamo es del docente.
    const delDocente = await e.docente.query(api.interaccion.misNotificaciones);
    expect(delDocente).toHaveLength(1);

    await expect(
      e.representante.mutation(api.interaccion.marcarNotificacionLeida, {
        notificacionId: delDocente[0]._id,
      }),
    ).rejects.toThrow("no es tuya");
  });
});

describe("interaccion — los errores llegan utiles a la pantalla", () => {
  /**
   * Sin envolverlos, un `ErrorDominio` cruza la frontera de Convex como un
   * fallo generico y la unica frase que la pantalla puede mostrar es "no
   * pudimos completar la solicitud". El representante que reserva un horario
   * que acaban de tomar merece leer por que.
   */
  async function capturar(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (error) {
      return error;
    }
    throw new Error("se esperaba un error y no hubo ninguno");
  }

  it("un choque de reglas viaja con su codigo y su mensaje", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const bloque = { fecha: "2026-09-10", horaInicio: "12:30", horaFin: "13:30" };
    await e.docente.mutation(api.interaccion.publicarDisponibilidad, bloque);

    const error = await capturar(() =>
      e.docente.mutation(api.interaccion.publicarDisponibilidad, {
        ...bloque, horaInicio: "13:00", horaFin: "14:00",
      }),
    );

    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<{ codigo: string; mensaje: string }>).data).toMatchObject({
      codigo: "CONFLICTO",
    });
    expect((error as ConvexError<{ mensaje: string }>).data.mensaje).toContain("se cruza");
  });

  it("una falta de permiso tambien, y sin filtrar detalles de mas", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);

    const error = await capturar(() =>
      e.representante.mutation(api.interaccion.publicarDisponibilidad, {
        fecha: "2026-09-10", horaInicio: "12:30", horaFin: "13:00",
      }),
    );

    expect((error as ConvexError<{ codigo: string; mensaje: string }>).data).toMatchObject({
      codigo: "SIN_PERMISO",
      mensaje: "Esta acción es solo para docentes.",
    });
  });

  it("las query tambien, no solo las mutation", async () => {
    const t = convexTest(schema, modules);
    const error = await capturar(() =>
      t.query(api.interaccion.inconformidadesDelDocente),
    );
    expect((error as ConvexError<{ codigo: string }>).data).toMatchObject({
      codigo: "NO_AUTENTICADO",
    });
  });
});


describe("interaccion — franjas de quince minutos", () => {
  it("reserva dos citas consecutivas y rechazar una solo libera su tramo", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const primerId = await e.docente.mutation(api.interaccion.publicarDisponibilidad, {
      cursoId: e.cursoId, fecha: "2026-09-10", horaInicio: "12:30", horaFin: "13:00",
      modalidad: "VIRTUAL", lugarOEnlace: "https://example.com/reunion",
    });
    const consultar = () => e.representante.query(api.interaccion.bloquesDisponibles, {
      estudianteId: e.estudianteId, desde: "2026-09-10",
    });
    const bloques = await consultar();
    expect(bloques.map(b => [b.horaInicio, b.horaFin])).toEqual([["12:30", "12:45"], ["12:45", "13:00"]]);
    expect(bloques[0].id).toBe(primerId);
    for (const b of bloques) expect(b).toMatchObject({ modalidad: "VIRTUAL", lugarOEnlace: "https://example.com/reunion" });
    const primera = await e.representante.mutation(api.interaccion.solicitarCita, {
      estudianteId: e.estudianteId, disponibilidadDocenteId: bloques[0].id,
    });
    expect((await consultar()).map(b => b.id)).toEqual([bloques[1].id]);
    await e.representante.mutation(api.interaccion.solicitarCita, {
      estudianteId: e.estudianteId, disponibilidadDocenteId: bloques[1].id,
    });
    expect(await consultar()).toEqual([]);
    const citas = await e.docente.query(api.interaccion.misCitasDocente, {});
    expect(citas.map(c => c.fechaHoraFin - c.fechaHoraInicio)).toEqual([900000, 900000]);
    await e.docente.mutation(api.interaccion.responderCita, { citaId: primera, aceptar: false });
    expect((await consultar()).map(b => b.id)).toEqual([bloques[0].id]);
  });

  it("no deja bloques parciales cuando una franja se solapa", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    await e.docente.mutation(api.interaccion.publicarDisponibilidad, { fecha: "2026-09-10", horaInicio: "12:45", horaFin: "13:00" });
    await expect(e.docente.mutation(api.interaccion.publicarDisponibilidad, {
      fecha: "2026-09-10", horaInicio: "12:30", horaFin: "13:15",
    })).rejects.toThrow("se cruza");
    expect(await t.run(ctx => ctx.db.query("disponibilidadDocente").collect())).toHaveLength(1);
  });

  it.each([
    { fecha: "2026-09-10", horaInicio: "12:30", horaFin: "12:40" },
    { fecha: "2026-09-10", horaInicio: "12:30", horaFin: "12:50" },
    { fecha: "2026-09-31", horaInicio: "12:30", horaFin: "13:00" },
  ])("rechaza la franja inválida $fecha $horaInicio–$horaFin sin escribir", async args => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    await expect(e.docente.mutation(api.interaccion.publicarDisponibilidad, args)).rejects.toThrow();
    expect(await t.run(ctx => ctx.db.query("disponibilidadDocente").collect())).toEqual([]);
  });
});

describe("interaccion — frontera pública de alertas", () => {
  let claves: Awaited<ReturnType<typeof generateKeyPair>>;
  beforeAll(async () => { claves = await generateKeyPair("RS256"); });
  beforeEach(async () => {
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://convex.test");
    const jwk = { ...await exportJWK(claves.publicKey), kid: "alertas", alg: "RS256", use: "sig" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  async function prueba(edad = 0, sub = "docente_1", sid = "sesion_docente") {
    return await new SignJWT({ sid, fva: [edad, -1] }).setProtectedHeader({ alg: "RS256", kid: "alertas" })
      .setIssuer("https://convex.test").setSubject(sub).setIssuedAt(AHORA.getTime() / 1000)
      .setExpirationTime(AHORA.getTime() / 1000 + 60).sign(claves.privateKey);
  }
  const datos = { alcance: "CURSO" as const, tipo: "EVACUACION" as const, titulo: "Evacuación", mensaje: "Estamos en el patio", esSimulacro: false };

  it("persiste solo la fecha calculada desde la prueba firmada", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const r = await e.docente.action(api.interaccion.activarAlerta, { ...datos, cursoId: e.cursoId, tokenReautenticacion: await prueba() });
    expect(r.entregas).toBe(1);
    const alerta = await t.run(ctx => ctx.db.get(r.id));
    expect(alerta?.reautenticadoEn).toBe(AHORA.getTime() - 60_000);
    expect(alerta).not.toHaveProperty("tokenReautenticacion");
  });

  it("rechaza la prueba vieja sin crear alertas, entregas ni notificaciones", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    await expect(e.docente.action(api.interaccion.activarAlerta, { ...datos, cursoId: e.cursoId, tokenReautenticacion: await prueba(30) }))
      .rejects.toThrow("Vuelve a confirmar");
    expect(await t.run(async ctx => [await ctx.db.query("alertaEmergencia").collect(), await ctx.db.query("entregaAlerta").collect(), await ctx.db.query("notificacion").collect()]))
      .toEqual([[], [], []]);
  });

  it("la reautenticación no concede titularidad del curso", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const rep = t.withIdentity({ subject: "rep_1", sid: "sesion_rep" });
    await expect(rep.action(api.interaccion.activarAlerta, { ...datos, cursoId: e.cursoId, tokenReautenticacion: await prueba(0, "rep_1", "sesion_rep") }))
      .rejects.toThrow();
    expect(await t.run(ctx => ctx.db.query("alertaEmergencia").collect())).toEqual([]);
  });
});

describe("interaccion — la bandeja del docente se lee por indice (#48)", () => {
  it("migra varios lotes, tolera huérfanos y puede repetirse", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const accionRegistradaId = await sembrarAccion(t, e);
    const accionHuerfana = await sembrarAccion(t, e);
    await t.run(async (ctx) => {
      for (let i = 0; i < 205; i++) {
        await ctx.db.insert("inconformidad", {
          accionRegistradaId: i === 110 ? accionHuerfana : accionRegistradaId,
          representanteId: e.representanteId, motivo: "NO_OCURRIO", mensaje: `Reclamo ${i}`,
          estado: "ABIERTA", venceEn: Date.now() + 86_400_000, actualizadoEn: Date.now(),
        });
      }
      await ctx.db.delete(accionHuerfana);
    });
    expect(await t.mutation(internal.migraciones.rellenarDocenteEnInconformidades, {}))
      .toMatchObject({ revisadas: 100, continuacionProgramada: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const antes = await t.run(ctx => ctx.db.query("inconformidad").collect());
    expect(antes.filter(i => i.docenteId === e.docenteId)).toHaveLength(204);
    expect(antes.filter(i => i.docenteId === undefined)).toHaveLength(1);
    expect(await t.mutation(internal.migraciones.rellenarDocenteEnInconformidades, {}))
      .toMatchObject({ rellenadas: 0 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run(ctx => ctx.db.query("inconformidad").collect())).toEqual(antes);
  });

  it("no expone una acción ajena aunque el docenteId copiado sea incorrecto", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const accionRegistradaId = await sembrarAccion(t, e);
    await t.run(async (ctx) => {
      const perfilUsuarioId = await ctx.db.insert("perfilUsuario", {
        authSubject: "https://convex.test|otro", tipoDocumento: "CEDULA",
        numeroDocumento: "0900000009", actualizadoEn: Date.now(),
      });
      const docenteId = await ctx.db.insert("docente", { perfilUsuarioId, actualizadoEn: Date.now() });
      await ctx.db.patch(accionRegistradaId, { registradaPorDocenteId: docenteId });
      await ctx.db.insert("inconformidad", {
        accionRegistradaId, docenteId: e.docenteId, representanteId: e.representanteId,
        motivo: "NO_OCURRIO", mensaje: "Detalle ajeno", estado: "ABIERTA",
        venceEn: Date.now() + 86_400_000, actualizadoEn: Date.now(),
      });
    });
    expect(await e.docente.query(api.interaccion.inconformidadesDelDocente)).toEqual([]);
  });

  /**
   * La consulta paso de recorrer todos los reclamos abiertos del sistema a
   * leer solo los suyos por `por_docente_estado`. El precio de esa mejora es
   * que un reclamo **sin** `docenteId` ya no esta en el indice y por tanto no
   * aparece — y los reclamos creados antes del campo no lo tienen.
   *
   * Esta prueba es el recordatorio de que la migracion no es opcional: fija
   * por escrito que sin correrla el docente deja de ver un reclamo que existe
   * y cuyo plazo de 30 dias sigue corriendo.
   */
  it("un reclamo anterior al campo no se ve hasta que corre la migracion", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const accionRegistradaId = await sembrarAccion(t, e);

    // Tal como quedo en la base antes del cambio de esquema: sin `docenteId`.
    await t.run(async (ctx) => {
      await ctx.db.insert("inconformidad", {
        accionRegistradaId,
        representanteId: e.representanteId,
        motivo: "NO_OCURRIO",
        mensaje: "Mi hijo no estuvo ese dia en clase.",
        estado: "ABIERTA",
        venceEn: Date.now() + 30 * 86_400_000,
        actualizadoEn: Date.now(),
      });
    });

    expect(await e.docente.query(api.interaccion.inconformidadesDelDocente)).toHaveLength(0);

    const resultado = await t.mutation(internal.migraciones.rellenarDocenteEnInconformidades, {});
    expect(resultado).toMatchObject({ rellenadas: 1, huerfanas: 0 });

    const bandeja = await e.docente.query(api.interaccion.inconformidadesDelDocente);
    expect(bandeja).toHaveLength(1);
    expect(bandeja[0].mensaje).toContain("no estuvo ese dia");
  });

  it("la migracion se puede correr dos veces sin tocar nada la segunda", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const accionRegistradaId = await sembrarAccion(t, e);

    await e.representante.mutation(api.interaccion.abrirInconformidad, {
      accionRegistradaId, motivo: "NO_OCURRIO", mensaje: "No fue así",
    });

    // El reclamo nuevo ya nace con `docenteId`, asi que no hay nada que llenar.
    expect(
      await t.mutation(internal.migraciones.rellenarDocenteEnInconformidades, {}),
    ).toMatchObject({ revisadas: 1, rellenadas: 0 });
    expect(
      await t.mutation(internal.migraciones.rellenarDocenteEnInconformidades, {}),
    ).toMatchObject({ revisadas: 1, rellenadas: 0 });
  });

  it("el docente no ve el reclamo de otro docente", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const accionRegistradaId = await sembrarAccion(t, e);

    // Un reclamo identico pero atribuido a otro docente: si la consulta
    // volviera a barrer la tabla, este entraria y habria que descartarlo a
    // mano. Con el indice no llega siquiera a leerse.
    await t.run(async (ctx) => {
      const perfil = await ctx.db.insert("perfilUsuario", {
        authSubject: "https://convex.test|docente_9", tipoDocumento: "CEDULA",
        numeroDocumento: "0900000009", actualizadoEn: Date.now(),
      });
      const otroDocenteId = await ctx.db.insert("docente", {
        perfilUsuarioId: perfil, actualizadoEn: Date.now(),
      });
      await ctx.db.insert("inconformidad", {
        accionRegistradaId,
        representanteId: e.representanteId,
        docenteId: otroDocenteId,
        motivo: "NO_OCURRIO",
        mensaje: "Reclamo de otro curso.",
        estado: "ABIERTA",
        venceEn: Date.now() + 30 * 86_400_000,
        actualizadoEn: Date.now(),
      });
    });

    expect(await e.docente.query(api.interaccion.inconformidadesDelDocente)).toHaveLength(0);
  });
});

describe("interaccion — las citas que ve el representante", () => {
  /**
   * Era la unica funcion publica del backend sin ninguna prueba. Y no es
   * cualquiera: es una lectura de la agenda de un menor, con un indice por
   * representante como toda la separacion entre una familia y otra.
   */
  it("solo devuelve las citas propias, nunca las de otra familia", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);

    await t.run(async (ctx) => {
      const ahora = Date.now();
      const perfilAjeno = await ctx.db.insert("perfilUsuario", {
        authSubject: "https://convex.test|rep_8", tipoDocumento: "CEDULA",
        numeroDocumento: "0900000018", actualizadoEn: ahora,
      });
      const representanteAjeno = await ctx.db.insert("representante", {
        perfilUsuarioId: perfilAjeno, actualizadoEn: ahora,
      });
      const base = {
        docenteId: e.docenteId, estudianteId: e.estudianteId, origen: "SOLICITADA_POR_REPRESENTANTE" as const,
        fechaHoraInicio: ahora, fechaHoraFin: ahora + 900_000,
        modalidad: "PRESENCIAL" as const, estado: "SOLICITADA" as const, actualizadoEn: ahora,
      };
      await ctx.db.insert("cita", { ...base, representanteId: e.representanteId, motivo: "La mia" });
      await ctx.db.insert("cita", { ...base, representanteId: representanteAjeno, motivo: "La de otra familia" });
    });

    const mias = await e.representante.query(api.interaccion.misCitasRepresentante);
    expect(mias).toHaveLength(1);
    expect(mias[0].motivo).toBe("La mia");
  });

  /**
   * Al representante se le enseñan primero las mas recientes -- lo contrario
   * que al docente, que necesita ver que tiene por delante. Son dos ordenes
   * opuestos a proposito y conviene que se rompa una prueba si alguien los
   * "uniforma".
   */
  it("las ordena de la mas reciente a la mas antigua", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);

    await t.run(async (ctx) => {
      const ahora = Date.now();
      for (const [i, motivo] of ["vieja", "media", "nueva"].entries()) {
        await ctx.db.insert("cita", {
          docenteId: e.docenteId, representanteId: e.representanteId,
          estudianteId: e.estudianteId, origen: "SOLICITADA_POR_REPRESENTANTE", motivo,
          fechaHoraInicio: ahora + i * 86_400_000,
          fechaHoraFin: ahora + i * 86_400_000 + 900_000,
          modalidad: "PRESENCIAL", estado: "SOLICITADA", actualizadoEn: ahora,
        });
      }
    });

    expect(
      (await e.representante.query(api.interaccion.misCitasRepresentante)).map((c) => c.motivo),
    ).toEqual(["nueva", "media", "vieja"]);
  });

  /**
   * `notasDocente` se llama como si fuera privado y **no lo es**: es el
   * mensaje que el docente escribe al rechazar o confirmar, y
   * `responderCita` ya lo manda dentro de la notificacion al representante.
   *
   * Esta prueba existe para que el nombre no engañe a nadie mas adelante. El
   * dia que alguien quiera guardar ahi una nota privada sobre una familia,
   * que se le rompa esto y lea por que.
   */
  it("el representante ve notasDocente, porque es un mensaje para el", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);

    const citaId = await t.run(async (ctx) => {
      const ahora = Date.now();
      return await ctx.db.insert("cita", {
        docenteId: e.docenteId, representanteId: e.representanteId,
        estudianteId: e.estudianteId, origen: "SOLICITADA_POR_REPRESENTANTE",
        fechaHoraInicio: ahora, fechaHoraFin: ahora + 900_000,
        modalidad: "PRESENCIAL", estado: "SOLICITADA", actualizadoEn: ahora,
      });
    });

    await e.docente.mutation(api.interaccion.responderCita, {
      citaId, aceptar: false, notasDocente: "Ese día tengo consejo de curso",
    });

    const [cita] = await e.representante.query(api.interaccion.misCitasRepresentante);
    expect(cita.notasDocente).toBe("Ese día tengo consejo de curso");
  });
});
