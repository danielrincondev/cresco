// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const modules = import.meta.glob(["./interaccion.ts", "./migraciones.ts", "./push.ts", "./_generated/*.js"]);

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
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

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
    // Dos filas y no una: la del reclamo y la de la **accion**. Esta prueba
    // afirmaba antes una sola, o sea que fijaba como correcto justo el hueco
    // -- la accion cambiaba y nadie lo registraba sobre ella.
    expect(estado.auditoria).toHaveLength(2);
    expect(estado.auditoria).toContainEqual(expect.objectContaining({
      accion: "ACTUALIZAR", entidadTipo: "accionRegistrada", entidadId: accionId,
    }));
  });

  /**
   * El camino de anulacion mas importante del producto: un docente retira una
   * sancion despues de que la familia la reclamo. DP-006 audita ANULAR sobre
   * la accion, y por esta via no quedaba ninguno.
   */
  it("resolver como ANULADA registra ANULAR sobre la accion, no solo sobre el reclamo", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const accionId = await sembrarAccion(t, e);
    const inconformidadId = await e.representante.mutation(api.interaccion.abrirInconformidad, {
      accionRegistradaId: accionId, motivo: "NO_OCURRIO", mensaje: "No estuvo ese día",
    });

    await e.docente.mutation(api.interaccion.resolverInconformidad, {
      inconformidadId, desenlace: "ANULADA",
      respuestaDocente: "Revisé la lista y tiene razón",
    });

    const auditoria = await t.run((ctx) => ctx.db.query("auditoria").collect());
    const anular = auditoria.find((a) => a.accion === "ANULAR");
    expect(anular).toMatchObject({
      entidadTipo: "accionRegistrada",
      entidadId: accionId,
      datosAntes: { estado: "VIGENTE" },
      datosDespues: { estado: "ANULADA", puntosAplicados: 0, porReclamo: inconformidadId },
    });
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

describe("interaccion — enganche con el envio push", () => {
  it("crear una notificacion programa su entrega al telefono", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const accionId = await sembrarAccion(t, e);

    await e.representante.mutation(api.interaccion.abrirInconformidad, {
      accionRegistradaId: accionId, motivo: "NO_OCURRIO", mensaje: "No ocurrio",
    });

    const programadas = await t.run(async (ctx) =>
      await ctx.db.system.query("_scheduled_functions").collect(),
    );
    // abrirInconformidad programa tanto el vencimiento (F3) como el push (F8)
    expect(programadas.some((p) => p.name.includes("push"))).toBe(true);
  });
});

const DIA = 24 * 60 * 60 * 1000;

/** Abre un reclamo sobre una accion negativa recien sembrada. */
async function abrirReclamo(
  t: ReturnType<typeof convexTest>,
  e: Awaited<ReturnType<typeof sembrarEscenario>>,
  mensaje = "No ocurrio asi",
): Promise<Id<"inconformidad">> {
  const accionId = await sembrarAccion(t, e);
  return await e.representante.mutation(api.interaccion.abrirInconformidad, {
    accionRegistradaId: accionId, motivo: "NO_OCURRIO", mensaje,
  });
}

const vencer = (t: ReturnType<typeof convexTest>, inconformidadId: Id<"inconformidad">) =>
  t.mutation(internal.interaccion.vencerInconformidad, { inconformidadId });

const terminarTareas = (t: ReturnType<typeof convexTest>) =>
  t.finishAllScheduledFunctions(vi.runAllTimers);

async function sembrarReclamoAnterior(
  t: ReturnType<typeof convexTest>,
  e: Awaited<ReturnType<typeof sembrarEscenario>>,
  estado: "ABIERTA" | "EN_REVISION" | "RESUELTA_MANTENIDA" = "ABIERTA",
  venceEn = AHORA.getTime() - DIA,
) {
  const accionRegistradaId = await sembrarAccion(t, e);
  return await t.run(ctx => ctx.db.insert("inconformidad", {
    accionRegistradaId, representanteId: e.representanteId,
    motivo: "NO_OCURRIO", mensaje: "Reclamo anterior al despliegue", estado, venceEn,
    ...(estado === "RESUELTA_MANTENIDA" ? {
      respuestaDocente: "Respondido", resueltaEn: AHORA.getTime(), resueltaPorDocenteId: e.docenteId,
    } : {}),
    actualizadoEn: AHORA.getTime(),
  }));
}

describe("interaccion — vencimiento programado de reclamos (F3)", () => {
  it("crea una tarea para venceEn junto al reclamo", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const id = await abrirReclamo(t, e);
    const { reclamo, tarea } = await t.run(async ctx => {
      const reclamo = (await ctx.db.get(id))!;
      return { reclamo, tarea: await ctx.db.system.get(reclamo.vencimientoProgramadoId!) };
    });
    expect(reclamo.venceEn).toBe(AHORA.getTime() + 30 * DIA);
    expect(tarea).toMatchObject({
      name: "interaccion:vencerInconformidad",
      args: [{ inconformidadId: id }],
      scheduledTime: reclamo.venceEn,
      state: { kind: "pending" },
    });
  });

  it.each(["ABIERTA", "EN_REVISION"] as const)("no vence antes del plazo y ejecuta la tarea para %s", async estado => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const id = await abrirReclamo(t, e);
    await t.run(ctx => ctx.db.patch(id, { estado }));
    vi.setSystemTime(AHORA.getTime() + 30 * DIA - 1);
    expect(await vencer(t, id)).toBe(false);
    expect(await e.representante.query(api.interaccion.misNotificaciones)).toHaveLength(0);

    vi.setSystemTime(AHORA.getTime() + 30 * DIA);
    await terminarTareas(t);
    expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ estado: "VENCIDA" });
    expect(await e.docente.query(api.interaccion.misNotificaciones)).toHaveLength(2);
    const avisos = await e.representante.query(api.interaccion.misNotificaciones);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].titulo).toContain("venció sin respuesta");
  });

  it.each(["MANTENIDA", "MODIFICADA", "ANULADA"] as const)("resolver como %s antes del plazo deja la tarea sin efecto", async desenlace => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const id = await abrirReclamo(t, e);
    await e.docente.mutation(api.interaccion.resolverInconformidad, {
      inconformidadId: id, desenlace, respuestaDocente: "Revisé el reclamo",
    });
    vi.setSystemTime(AHORA.getTime() + 30 * DIA);
    await terminarTareas(t);
    expect(await t.run(ctx => ctx.db.get(id))).toMatchObject({ estado: `RESUELTA_${desenlace}` });
    const avisos = await e.representante.query(api.interaccion.misNotificaciones);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].titulo).toBe("El docente respondió tu reclamo");
    expect(await e.docente.query(api.interaccion.misNotificaciones)).toHaveLength(1);
  });

  it("repetir una tarea no duplica las notificaciones", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const id = await abrirReclamo(t, e);
    vi.setSystemTime(AHORA.getTime() + 30 * DIA);
    expect(await vencer(t, id)).toBe(true);
    await terminarTareas(t);
    expect(await vencer(t, id)).toBe(false);
    expect(await e.representante.query(api.interaccion.misNotificaciones)).toHaveLength(1);
  });

  it("no falla si el reclamo fue eliminado antes del vencimiento", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const id = await abrirReclamo(t, e);
    await t.run(ctx => ctx.db.delete(id));
    vi.setSystemTime(AHORA.getTime() + 30 * DIA);
    await terminarTareas(t);
    expect(await vencer(t, id)).toBe(false);
    expect(await e.representante.query(api.interaccion.misNotificaciones)).toHaveLength(0);
  });

  it("el vencido queda primero en la bandeja y todavía se puede responder", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const viejo = await abrirReclamo(t, e, "El primero");
    vi.setSystemTime(AHORA.getTime() + 20 * DIA);
    const reciente = await abrirReclamo(t, e, "El segundo");
    vi.setSystemTime(AHORA.getTime() + 30 * DIA);
    await vencer(t, viejo);
    const bandeja = await e.docente.query(api.interaccion.inconformidadesDelDocente);
    expect(bandeja[0]).toMatchObject({ id: viejo, estado: "VENCIDA" });
    expect(bandeja[1]).toMatchObject({ id: reciente, estado: "ABIERTA" });
    await e.docente.mutation(api.interaccion.resolverInconformidad, {
      inconformidadId: viejo, desenlace: "ANULADA", respuestaDocente: "Tienes razón, la anulo",
    });
    expect(await t.run(ctx => ctx.db.get(viejo))).toMatchObject({ estado: "RESUELTA_ANULADA" });
  });

  it("la migración programa fechas futuras y omite tareas ya creadas y reclamos resueltos", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const nuevo = await abrirReclamo(t, e);
    const previo = await sembrarReclamoAnterior(t, e, "ABIERTA", AHORA.getTime() + DIA);
    const resuelto = await sembrarReclamoAnterior(t, e, "RESUELTA_MANTENIDA");
    expect(await t.mutation(internal.interaccion.programarVencimientosExistentes, {})).toMatchObject({ programadas: 1 });
    expect(await t.mutation(internal.interaccion.programarVencimientosExistentes, {})).toMatchObject({ programadas: 0 });
    const estado = await t.run(async ctx => {
      const reclamo = (await ctx.db.get(previo))!;
      return {
        reclamo,
        tarea: await ctx.db.system.get(reclamo.vencimientoProgramadoId!),
        resuelto: await ctx.db.get(resuelto),
        nuevo: await ctx.db.get(nuevo),
        tareas: await ctx.db.system.query("_scheduled_functions").collect(),
      };
    });
    expect(estado.reclamo.estado).toBe("ABIERTA");
    expect(estado.tarea?.scheduledTime).toBe(AHORA.getTime() + DIA);
    expect(estado.resuelto?.vencimientoProgramadoId).toBeUndefined();
    expect(estado.nuevo?.vencimientoProgramadoId).toBeDefined();
    expect(estado.tareas.filter(tarea => tarea.name === "interaccion:vencerInconformidad")).toHaveLength(2);
  });

  it("la migración encadena más de 100 reclamos de ambos estados sin esperar otro día", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    for (let i = 0; i < 103; i++) {
      await sembrarReclamoAnterior(t, e, i < 101 ? "ABIERTA" : "EN_REVISION");
    }
    await t.mutation(internal.interaccion.programarVencimientosExistentes, {});
    await terminarTareas(t);
    const estado = await t.run(async ctx => ({
      reclamos: await ctx.db.query("inconformidad").collect(),
      avisos: await ctx.db.query("notificacion").collect(),
      tareas: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(estado.reclamos).toHaveLength(103);
    expect(estado.reclamos.every(r => r.estado === "VENCIDA" && r.vencimientoProgramadoId)).toBe(true);
    expect(estado.avisos).toHaveLength(206);
    expect(estado.tareas.every(tarea => tarea.state.kind === "success")).toBe(true);
    await t.mutation(internal.interaccion.programarVencimientosExistentes, {});
    await terminarTareas(t);
    expect(await t.run(async ctx => (await ctx.db.query("notificacion").collect()).length)).toBe(206);
  });
});

/**
 * Un segundo docente completo -- su curso, su estudiante y el representante de
 * ese estudiante -- para poder comprobar que las bandejas no se mezclan.
 */
async function sembrarSegundoDocente(
  t: ReturnType<typeof convexTest>,
  e: Awaited<ReturnType<typeof sembrarEscenario>>,
) {
  const ids = await t.run(async (ctx) => {
    const ahora = Date.now();
    const perfilDocente = await ctx.db.insert("perfilUsuario", {
      authSubject: "https://convex.test|docente_2", tipoDocumento: "CEDULA", numeroDocumento: "0900000007",
      actualizadoEn: ahora,
    });
    const docenteId = await ctx.db.insert("docente", {
      perfilUsuarioId: perfilDocente, actualizadoEn: ahora,
    });
    const perfilRep = await ctx.db.insert("perfilUsuario", {
      authSubject: "https://convex.test|rep_2", tipoDocumento: "CEDULA", numeroDocumento: "0900000008",
      actualizadoEn: ahora,
    });
    const representanteId = await ctx.db.insert("representante", {
      perfilUsuarioId: perfilRep, actualizadoEn: ahora,
    });

    const curso = await ctx.db.get(e.cursoId);
    const cursoId = await ctx.db.insert("curso", {
      anioLectivoId: curso!.anioLectivoId, nombre: "Sexto B", nivel: "6to", paralelo: "B",
      jornada: "MATUTINA", estado: "ACTIVO", actualizadoEn: ahora,
    });
    await ctx.db.insert("asignacionDocente", {
      cursoId, docenteId, rol: "TITULAR", vigenteDesde: "2026-05-04", actualizadoEn: ahora,
    });
    const estudianteId = await ctx.db.insert("estudiante", {
      institucionId: e.institucionId, nombres: "Luis", apellidos: "Mora",
      tipoDocumento: "CEDULA", numeroDocumento: "0922222222",
      origenRegistro: "REPRESENTANTE", estadoVerificacion: "APROBADO", estado: "ACTIVO",
      actualizadoEn: ahora,
    });
    const matriculaId = await ctx.db.insert("matricula", {
      estudianteId, cursoId, fechaIngreso: "2026-05-04", estado: "CURSANDO",
      actualizadoEn: ahora,
    });
    await ctx.db.insert("vinculoRepresentacion", {
      representanteId, estudianteId, parentesco: "PADRE",
      estado: "ACTIVO", vigenteDesde: "2026-05-04", actualizadoEn: ahora,
    });

    // Una accion negativa suya, para que su representante pueda reclamarla.
    const categoriaAccionId = await ctx.db.insert("categoriaAccion", {
      institucionId: e.institucionId, codigo: "DISCIPLINA", nombre: "Indisciplina",
      aplicaA: "ESTUDIANTE", orden: 1, activa: true, actualizadoEn: ahora,
    });
    const tipoAccionId = await ctx.db.insert("tipoAccion", {
      institucionId: e.institucionId, categoriaAccionId, codigo: "NEG_ATRASO",
      nombre: "Atrasos", signo: "NEGATIVA",
      puntosDefecto: -1, puntosMin: -3, puntosMax: -1,
      requiereDescripcion: true, admiteInconformidad: true,
      cuentaEnBitacora: true, activa: true, actualizadoEn: ahora,
    });
    const accionId = await ctx.db.insert("accionRegistrada", {
      matriculaId, periodoAcademicoId: e.periodoAcademicoId,
      tipoAccionId, categoriaAccionId,
      signo: "NEGATIVA", puntosAplicados: -2, cuentaEnBitacora: true,
      descripcion: "Llego tarde tres veces", fechaOcurrencia: "2026-09-07",
      registradaPorDocenteId: docenteId, estado: "VIGENTE", actualizadoEn: ahora,
    });
    return { docenteId, estudianteId, accionId };
  });
  return {
    ...ids,
    docente: t.withIdentity({ subject: "docente_2" }),
    representante: t.withIdentity({ subject: "rep_2" }),
  };
}

describe("interaccion — la bandeja lee solo lo del docente que la abre (#48)", () => {
  it("cada docente ve sus reclamos y ninguno de los del otro", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const otro = await sembrarSegundoDocente(t, e);

    const mio = await abrirReclamo(t, e, "Esto no ocurrio");
    await otro.representante.mutation(api.interaccion.abrirInconformidad, {
      accionRegistradaId: otro.accionId, motivo: "OTRO", mensaje: "Quisiera conversarlo",
    });

    const bandejaUno = await e.docente.query(api.interaccion.inconformidadesDelDocente);
    const bandejaDos = await otro.docente.query(api.interaccion.inconformidadesDelDocente);

    expect(bandejaUno).toHaveLength(1);
    expect(bandejaUno[0].id).toBe(mio);
    expect(bandejaDos).toHaveLength(1);
    expect(bandejaDos[0].mensaje).toBe("Quisiera conversarlo");
    // Y sobre todo: ninguno aparece en la lista del otro.
    expect(bandejaDos.some((r) => r.id === mio)).toBe(false);
  });

  /**
   * Esta es la que distingue el arreglo del codigo anterior: el viejo filtraba
   * por estado y descartaba en memoria, asi que un reclamo sin `docenteId`
   * habria aparecido igual. Con el indice `por_docente_estado` no aparece --
   * que es exactamente la consecuencia de dejar de leer el sistema entero.
   *
   * Tambien deja escrito el limite de la migracion: los reclamos que ya
   * existan en un despliegue de desarrollo salen de la bandeja. No hay datos
   * reales de ninguna institucion, asi que es aceptable.
   */
  it("un reclamo sin docenteId no entra en ninguna bandeja", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const id = await abrirReclamo(t, e);
    await t.run(async (ctx) => {
      await ctx.db.patch(id, { docenteId: undefined });
    });

    expect(await e.docente.query(api.interaccion.inconformidadesDelDocente)).toHaveLength(0);
  });

  it("abrir un reclamo guarda el docente de la accion reclamada", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const id = await abrirReclamo(t, e);

    const reclamo = await t.run(async (ctx) => await ctx.db.get(id));
    expect(reclamo?.docenteId).toBe(e.docenteId);
  });

  it("un reclamo vencido sigue en la bandeja de su docente, y primero", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const otro = await sembrarSegundoDocente(t, e);
    const viejo = await abrirReclamo(t, e, "El primero");
    vi.setSystemTime(AHORA.getTime() + 20 * DIA);
    const reciente = await abrirReclamo(t, e, "El segundo");

    vi.setSystemTime(AHORA.getTime() + 31 * DIA);
    // El vencimiento ahora se programa reclamo por reclamo, asi que se dispara
    // el del que ya cumplio el plazo -- no un barrido de todos.
    await vencer(t, viejo);

    const bandeja = await e.docente.query(api.interaccion.inconformidadesDelDocente);
    expect(bandeja.map((r) => r.id)).toEqual([viejo, reciente]);
    expect(bandeja[0].estado).toBe("VENCIDA");
    // El otro docente no hereda nada del vencimiento ajeno.
    expect(await otro.docente.query(api.interaccion.inconformidadesDelDocente)).toHaveLength(0);
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

describe("interaccion — quien es el docente de mi hijo (P9, #52)", () => {
  /** Pone nombre y ficha profesional al docente sembrado. */
  async function darleNombreAlDocente(
    t: ReturnType<typeof convexTest>,
    docenteId: Id<"docente">,
  ) {
    await t.run(async (ctx) => {
      const docente = (await ctx.db.get(docenteId))!;
      await ctx.db.patch(docente.perfilUsuarioId, { nombres: "María", apellidos: "Loor" });
      await ctx.db.patch(docenteId, {
        tituloProfesional: "Licenciada en Educación Básica",
        correoContacto: "mloor@colegio.edu.ec",
        horarioAtencion: "Martes de 10:00 a 11:00",
      });
    });
  }

  it("el representante ve el nombre y la ficha del titular de su hijo", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    await darleNombreAlDocente(t, e.docenteId);

    expect(
      await e.representante.query(api.interaccion.docenteACargo, { estudianteId: e.estudianteId }),
    ).toMatchObject({
      nombre: "María Loor",
      curso: "Quinto A",
      tituloProfesional: "Licenciada en Educación Básica",
      correoContacto: "mloor@colegio.edu.ec",
      telefonoContacto: null,
    });
  });

  /**
   * La razon por la que esta consulta empieza por `exigirVinculo`: sin eso,
   * cualquiera con una cuenta podria sacar el correo y el telefono de
   * cualquier docente del sistema probando ids de estudiante.
   */
  it("no la puede consultar un representante sin vinculo con ese estudiante", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);

    await t.run(async (ctx) => {
      const perfil = await ctx.db.insert("perfilUsuario", {
        authSubject: "https://convex.test|rep_9", tipoDocumento: "CEDULA",
        numeroDocumento: "0900000019", actualizadoEn: Date.now(),
      });
      await ctx.db.insert("representante", { perfilUsuarioId: perfil, actualizadoEn: Date.now() });
    });

    await expect(
      t.withIdentity({ subject: "rep_9" }).query(api.interaccion.docenteACargo, {
        estudianteId: e.estudianteId,
      }),
    ).rejects.toThrow("No tienes acceso");
  });

  /**
   * Un perfil creado antes de #52 no tiene nombres. La pantalla tiene que
   * poder distinguir "todavia no lo sabemos" de una cadena vacia con espacios.
   */
  it("devuelve nombre null si el perfil del docente es anterior a los nombres", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);

    const ficha = await e.representante.query(api.interaccion.docenteACargo, {
      estudianteId: e.estudianteId,
    });
    expect(ficha?.nombre).toBeNull();
    expect(ficha?.docenteId).toBe(e.docenteId);
  });

  it("devuelve null cuando el curso no tiene titular vigente", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    await t.run(async (ctx) => {
      const asignacion = (await ctx.db.query("asignacionDocente").unique())!;
      await ctx.db.patch(asignacion._id, { vigenteHasta: "2026-06-30" });
    });

    expect(
      await e.representante.query(api.interaccion.docenteACargo, { estudianteId: e.estudianteId }),
    ).toBeNull();
  });
});

describe("interaccion — la bandeja dice de quien se habla (#52)", () => {
  /**
   * Antes la bandeja daba motivo, mensaje y la anotacion, pero **no el
   * estudiante**. En esa pantalla el docente puede anular una sancion: con
   * dos reclamos abiertos a la vez, decidir cual anula era cuestion de suerte.
   */
  it("trae el nombre del estudiante y el del representante que reclama", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const accionRegistradaId = await sembrarAccion(t, e);

    await t.run(async (ctx) => {
      const representante = (await ctx.db.get(e.representanteId))!;
      await ctx.db.patch(representante.perfilUsuarioId, {
        nombres: "Rosa", apellidos: "Pérez",
      });
    });

    await e.representante.mutation(api.interaccion.abrirInconformidad, {
      accionRegistradaId, motivo: "NO_OCURRIO", mensaje: "Mi hija no estuvo ese día.",
    });

    const [reclamo] = await e.docente.query(api.interaccion.inconformidadesDelDocente);
    expect(reclamo.estudiante?.nombre).toBe("Ana Pérez");
    expect(reclamo.representante).toBe("Rosa Pérez");
  });

  /**
   * Un perfil creado antes de #52 no tiene nombres. Devolver `null` deja que
   * la pantalla lo diga con palabras ("lo abrió su representante") en vez de
   * pintar un hueco o, peor, la cadena "undefined undefined".
   */
  it("devuelve null en el representante sin nombres, no una cadena a medias", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const accionRegistradaId = await sembrarAccion(t, e);

    await e.representante.mutation(api.interaccion.abrirInconformidad, {
      accionRegistradaId, motivo: "NO_OCURRIO", mensaje: "No fue así",
    });

    const [reclamo] = await e.docente.query(api.interaccion.inconformidadesDelDocente);
    expect(reclamo.representante).toBeNull();
    expect(reclamo.estudiante?.nombre).toBe("Ana Pérez");
  });
});

describe("interaccion — la bandeja no crece sin freno", () => {
  /** Siembra `cuantas` notificaciones para el perfil del representante. */
  async function sembrarNotificaciones(
    t: ReturnType<typeof convexTest>,
    representanteId: Id<"representante">,
    cuantas: number,
  ) {
    await t.run(async (ctx) => {
      const representante = (await ctx.db.get(representanteId))!;
      for (let n = 0; n < cuantas; n++) {
        await ctx.db.insert("notificacion", {
          perfilUsuarioId: representante.perfilUsuarioId,
          tipo: "REPORTE_DIARIO",
          titulo: `Reporte ${n}`,
          cuerpo: "El reporte de hoy ya está disponible.",
        });
      }
    });
  }

  /**
   * Una bandeja no encoge nunca: el reporte diario son ~200 notificaciones por
   * año lectivo. Antes se leian todas para pintar las diez de arriba.
   */
  it("devuelve como mucho las cien mas recientes", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    await sembrarNotificaciones(t, e.representanteId, 130);

    const bandeja = await e.representante.query(api.interaccion.misNotificaciones);
    expect(bandeja).toHaveLength(100);
    // La mas nueva primero: la 129 es la ultima que se inserto.
    expect(bandeja[0].titulo).toBe("Reporte 129");
    expect(bandeja.at(-1)?.titulo).toBe("Reporte 30");
  });

  it("con pocas las devuelve todas, de la mas nueva a la mas vieja", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    await sembrarNotificaciones(t, e.representanteId, 3);

    expect(
      (await e.representante.query(api.interaccion.misNotificaciones)).map((n) => n.titulo),
    ).toEqual(["Reporte 2", "Reporte 1", "Reporte 0"]);
  });

  it("no ensena las notificaciones de otra persona", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    await sembrarNotificaciones(t, e.representanteId, 2);

    expect(await e.docente.query(api.interaccion.misNotificaciones)).toHaveLength(0);
  });
});
