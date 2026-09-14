// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob(["./nucleo.ts", "./_generated/*.js"]);
const AHORA = new Date("2026-09-08T15:00:00Z").getTime();
const pagina = { numItems: 20, cursor: null };
const hijo = { tipoDocumento: "CEDULA" as const, numeroDocumento: "0900000010", nombres: "Ana", apellidos: "Prueba", fechaNacimiento: "2016-01-02" };
const periodos = [
  { nombre: "Primer parcial", orden: 1, fechaInicio: "2026-05-01", fechaFin: "2026-08-31" },
  { nombre: "Segundo parcial", orden: 2, fechaInicio: "2026-09-01", fechaFin: "2026-11-30" },
  { nombre: "Tercer parcial", orden: 3, fechaInicio: "2026-12-01", fechaFin: "2027-02-28" },
];

beforeEach(() => vi.useFakeTimers().setSystemTime(AHORA));
afterEach(() => vi.useRealTimers());

async function escenario() {
  const t = convexTest(schema, modules);
  const docente = t.withIdentity({ subject: "docente" });
  const representante = t.withIdentity({ subject: "representante" });
  const otro = t.withIdentity({ subject: "otro" });
  const perfilDocente = await docente.mutation(api.nucleo.completarPerfil, { nombres: "Jeremias", apellidos: "Poveda", tipoDocumento: "CEDULA", numeroDocumento: "0900000001", roles: ["DOCENTE"] });
  const perfilRepresentante = await representante.mutation(api.nucleo.completarPerfil, { nombres: "Daniel", apellidos: "Rincon", tipoDocumento: "CEDULA", numeroDocumento: "0900000002", roles: ["REPRESENTANTE"] });
  await otro.mutation(api.nucleo.completarPerfil, { nombres: "Kamila", apellidos: "Rivera", tipoDocumento: "CEDULA", numeroDocumento: "0900000003", roles: ["DOCENTE", "REPRESENTANTE"] });
  const curso = await docente.mutation(api.nucleo.crearCurso, {
    nombreInstitucion: "Escuela de prueba", nombreCurso: "Quinto A", nivel: "5", paralelo: "A", anioInicio: "2026-05-01", anioFin: "2027-02-28",
  });
  const periodoIds = await docente.mutation(api.nucleo.definirPeriodos, { cursoId: curso.id, periodos });
  const invitacion = await docente.mutation(api.nucleo.crearInvitacion, { cursoId: curso.id });
  const solicitud = { credencial: { codigo: invitacion.codigo }, solicitudId: "solicitud-prueba-0001", estudiante: hijo,
    parentesco: "MADRE" as const, aceptaTratamiento: true, declaraRepresentanteLegal: true, versionDocumento: "2026-09-v1" };
  return { t, docente, representante, otro, cursoId: curso.id, periodoIds, invitacion, solicitud, perfilDocente, perfilRepresentante };
}

async function registros(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => ({ estudiantes: await ctx.db.query("estudiante").collect(),
    vinculos: await ctx.db.query("vinculoRepresentacion").collect(), consentimientos: await ctx.db.query("consentimiento").collect(),
    matriculas: await ctx.db.query("matricula").collect(), puntajes: await ctx.db.query("puntajePeriodo").collect(), auditoria: await ctx.db.query("auditoria").collect() }));
}

async function canjear(s: Awaited<ReturnType<typeof escenario>>) {
  return await s.representante.mutation(api.nucleo.canjearInvitacion, s.solicitud);
}

async function aprobar(s: Awaited<ReturnType<typeof escenario>>, estudianteId: Id<"estudiante">) {
  return await s.docente.mutation(api.nucleo.aprobarEstudiante, { cursoId: s.cursoId, estudianteId });
}

describe("núcleo — invitaciones", () => {
  it("genera código y token reutilizables durante 30 días y reutiliza la emisión concurrente", async () => {
    const s = await escenario();
    const invitaciones = await Promise.all(Array.from({ length: 3 }, () => s.docente.mutation(api.nucleo.crearInvitacion, { cursoId: s.cursoId })));
    expect(invitaciones.every((i) => i.invitacionId === s.invitacion.invitacionId)).toBe(true);
    expect(s.invitacion.expiraEn).toBe(AHORA + 30 * 86_400_000);
    expect(s.invitacion.codigo).toHaveLength(12);
    expect(s.invitacion.token).toHaveLength(52);
    const preview = await s.representante.mutation(api.nucleo.consultarInvitacion, { credencial: { token: s.invitacion.token } });
    expect(preview).toMatchObject({ cursoId: s.cursoId, versionDocumento: "2026-09-v1", nombreCurso: "Quinto A" });
    expect(preview).not.toHaveProperty("token");
    expect(preview).not.toHaveProperty("estudiantes");
    const primera = await canjear(s);
    const segunda = await s.otro.mutation(api.nucleo.canjearInvitacion, { ...s.solicitud, estudiante: { ...hijo, numeroDocumento: "0900000011" } });
    expect(segunda.estudianteId).not.toBe(primera.estudianteId);
    expect((await s.t.run((ctx) => ctx.db.get("invitacionCurso", s.invitacion.invitacionId)))?.usosRealizados).toBe(2);
  });

  it("solo el titular puede emitir; solo representantes autenticados pueden canjear", async () => {
    const s = await escenario();
    await expect(s.otro.mutation(api.nucleo.crearInvitacion, { cursoId: s.cursoId })).rejects.toThrow("SIN_PERMISO");
    await expect(s.t.mutation(api.nucleo.canjearInvitacion, s.solicitud)).rejects.toThrow("NO_AUTENTICADO");
    await expect(s.docente.mutation(api.nucleo.canjearInvitacion, s.solicitud)).rejects.toThrow("SIN_PERMISO");
    await expect(s.t.withIdentity({ subject: "sin_perfil" }).mutation(api.nucleo.canjearInvitacion, s.solicitud)).rejects.toThrow("PERFIL_NO_ENCONTRADO");
    expect((await registros(s.t)).estudiantes).toHaveLength(0);
  });

  it.each(["EXPIRADA", "REVOCADA", "AGOTADA"] as const)("rechaza invitación %s sin escribir", async (estado) => {
    const s = await escenario();
    await s.t.run((ctx) => ctx.db.patch("invitacionCurso", s.invitacion.invitacionId, { estado }));
    await expect(canjear(s)).rejects.toThrow("INVITACION_INVALIDA");
    expect((await registros(s.t)).estudiantes).toHaveLength(0);
  });

  it("comprueba el vencimiento exacto y emite una nueva invitación", async () => {
    const s = await escenario();
    vi.setSystemTime(s.invitacion.expiraEn);
    await expect(canjear(s)).rejects.toThrow("INVITACION_INVALIDA");
    const nueva = await s.docente.mutation(api.nucleo.crearInvitacion, { cursoId: s.cursoId });
    expect(nueva.codigo).not.toBe(s.invitacion.codigo);
  });

  it("no permite canjear si el curso se archivó después de mostrar la invitación", async () => {
    const s = await escenario();
    await s.representante.mutation(api.nucleo.consultarInvitacion, { credencial: s.solicitud.credencial });
    await s.t.run((ctx) => ctx.db.patch("curso", s.cursoId, { estado: "ARCHIVADO" }));
    await expect(canjear(s)).rejects.toThrow("CURSO_INACTIVO");
    await expect(s.docente.mutation(api.nucleo.crearInvitacion, { cursoId: s.cursoId })).rejects.toThrow("CURSO_INACTIVO");
  });

  it("aplica un límite de usos sin sobrepasarlo con solicitudes simultáneas", async () => {
    const s = await escenario();
    await s.t.run((ctx) => ctx.db.patch("invitacionCurso", s.invitacion.invitacionId, { usosMaximos: 1 }));
    const resultados = await Promise.allSettled([canjear(s), s.otro.mutation(api.nucleo.canjearInvitacion, { ...s.solicitud, estudiante: { ...hijo, numeroDocumento: "0900000011" } })]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const invitacion = await s.t.run((ctx) => ctx.db.get("invitacionCurso", s.invitacion.invitacionId));
    expect(invitacion).toMatchObject({ estado: "AGOTADA", usosRealizados: 1 });
  });
});

describe("núcleo — registro y consentimiento", () => {
  it("crea estudiante pendiente, vínculo y consentimiento; aún no hay matrícula ni puntaje", async () => {
    const s = await escenario();
    const registro = await s.representante.mutation(api.nucleo.canjearInvitacion, { ...s.solicitud,
      credencial: { codigo: ` ${s.invitacion.codigo.toLowerCase()} ` }, estudiante: { ...hijo, nombres: " Ana " } });
    expect(registro.estadoVerificacion).toBe("PENDIENTE");
    const estado = await registros(s.t);
    expect(estado.estudiantes).toHaveLength(1);
    expect(estado.estudiantes[0]).toMatchObject({ nombres: "Ana", estadoVerificacion: "PENDIENTE", origenRegistro: "REPRESENTANTE" });
    expect(estado.vinculos[0]).toMatchObject({ estado: "ACTIVO", invitacionCursoId: s.invitacion.invitacionId });
    expect(estado.consentimientos[0]).toMatchObject({ estudianteId: registro.estudianteId, perfilUsuarioId: s.perfilRepresentante.perfilUsuarioId, versionDocumento: "2026-09-v1", otorgado: true, otorgadoEn: AHORA });
    expect(estado.matriculas).toHaveLength(0);
    expect(estado.puntajes).toHaveLength(0);
  });

  it.each([
    { aceptaTratamiento: false }, { declaraRepresentanteLegal: false }, { versionDocumento: "anterior" },
  ])("exige ambas declaraciones y versión vigente (%j)", async (cambio) => {
    const s = await escenario();
    await expect(s.representante.mutation(api.nucleo.canjearInvitacion, { ...s.solicitud, ...cambio })).rejects.toThrow("CONSENTIMIENTO_");
    const estado = await registros(s.t);
    expect(estado.estudiantes).toHaveLength(0);
    expect(estado.vinculos).toHaveLength(0);
    expect(estado.consentimientos).toHaveLength(0);
    expect((await s.t.run((ctx) => ctx.db.get("invitacionCurso", s.invitacion.invitacionId)))?.usosRealizados).toBe(0);
  });

  it("rechaza segundo representante y duplicado documental concurrente", async () => {
    const s = await escenario();
    const resultados = await Promise.allSettled([canjear(s), s.otro.mutation(api.nucleo.canjearInvitacion, s.solicitud)]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultados.filter((r) => r.status === "rejected")).toHaveLength(1);
    const estado = await registros(s.t);
    expect(estado.estudiantes).toHaveLength(1);
    expect(estado.vinculos).toHaveLength(1);
    expect(estado.consentimientos).toHaveLength(1);
  });

  it("admite dos hijos SIN_DOCUMENTO pero reintentar la misma solicitud no duplica al primero", async () => {
    const s = await escenario();
    const solicitud = { ...s.solicitud, estudiante: { ...hijo, tipoDocumento: "SIN_DOCUMENTO" as const, numeroDocumento: "" } };
    const respuestas = await Promise.all(Array.from({ length: 3 }, () => s.representante.mutation(api.nucleo.canjearInvitacion, solicitud)));
    expect(respuestas.every((r) => r.estudianteId === respuestas[0].estudianteId)).toBe(true);
    const segundo = await s.representante.mutation(api.nucleo.canjearInvitacion, { ...solicitud, solicitudId: "solicitud-prueba-0002" });
    expect(segundo.estudianteId).not.toBe(respuestas[0].estudianteId);
    const estado = await registros(s.t);
    expect(estado.estudiantes).toHaveLength(2);
    expect(estado.consentimientos).toHaveLength(2);
    expect((await s.t.run((ctx) => ctx.db.get("invitacionCurso", s.invitacion.invitacionId)))?.usosRealizados).toBe(2);
  });

  it("no reutiliza una clave de solicitud con datos distintos y permite recuperar tras caducar", async () => {
    const s = await escenario();
    const primero = await canjear(s);
    await expect(s.representante.mutation(api.nucleo.canjearInvitacion, { ...s.solicitud, estudiante: { ...hijo, nombres: "Otra" } })).rejects.toThrow("CONFLICTO");
    vi.setSystemTime(s.invitacion.expiraEn);
    expect(await canjear(s)).toEqual(primero);
    expect((await registros(s.t)).estudiantes).toHaveLength(1);
  });

  it.each([
    { ...hijo, numeroDocumento: "mal" }, { ...hijo, nombres: "  " },
    { ...hijo, fechaNacimiento: "2026-02-30" }, { ...hijo, fechaNacimiento: "2027-01-01" },
    { ...hijo, tipoDocumento: "SIN_DOCUMENTO" as const, numeroDocumento: "123" },
  ])("rechaza datos inválidos del estudiante (%j)", async (estudiante) => {
    const s = await escenario();
    await expect(s.representante.mutation(api.nucleo.canjearInvitacion, { ...s.solicitud, estudiante })).rejects.toThrow();
    expect((await registros(s.t)).estudiantes).toHaveLength(0);
  });
});

describe("núcleo — aprobación y listas", () => {
  it("completa el flujo público con correcciones, 60 por parcial aplicable y auditoría", async () => {
    const s = await escenario();
    const { estudianteId } = await canjear(s);
    expect((await s.docente.query(api.nucleo.listarPendientes, { cursoId: s.cursoId, paginationOpts: pagina })).page).toHaveLength(1);
    expect((await s.docente.query(api.nucleo.listarEstudiantes, { cursoId: s.cursoId, paginationOpts: pagina })).page).toHaveLength(0);
    const aprobado = await s.docente.mutation(api.nucleo.aprobarEstudiante, { cursoId: s.cursoId, estudianteId,
      correcciones: { nombres: "Ana María", numeroDocumento: "0900000012", tipoDocumento: "CEDULA" } });
    const estado = await registros(s.t);
    expect(estado.estudiantes[0]).toMatchObject({ nombres: "Ana María", numeroDocumento: "0900000012", estadoVerificacion: "APROBADO", aprobadoPorDocenteId: s.perfilDocente.docenteId });
    expect(estado.matriculas).toHaveLength(1);
    expect(estado.matriculas[0]).toMatchObject({ _id: aprobado.matriculaId, estado: "CURSANDO", fechaIngreso: "2026-09-08" });
    expect(estado.puntajes).toHaveLength(2);
    expect(estado.puntajes.every((p) => p.puntajeActual === 60 && p.puntosNegativos === 0 && p.puntosPositivos === 0)).toBe(true);
    expect(estado.puntajes.map((p) => p.periodoAcademicoId).sort()).toEqual(s.periodoIds.slice(1).sort());
    expect(estado.auditoria).toHaveLength(1);
    expect(estado.auditoria[0]).toMatchObject({ accion: "APROBAR", perfilUsuarioId: s.perfilDocente.perfilUsuarioId, entidadId: estudianteId });
    expect((await s.docente.query(api.nucleo.listarPendientes, { cursoId: s.cursoId, paginationOpts: pagina })).page).toHaveLength(0);
    expect((await s.docente.query(api.nucleo.listarEstudiantes, { cursoId: s.cursoId, paginationOpts: pagina })).page[0]).toMatchObject({ estudianteId, matriculaId: aprobado.matriculaId, nombres: "Ana María" });
  });

  it("repetir aprobación concurrentemente no duplica matrícula, puntaje o auditoría ni reinicia puntos", async () => {
    const s = await escenario();
    const { estudianteId } = await canjear(s);
    const respuestas = await Promise.all(Array.from({ length: 3 }, () => aprobar(s, estudianteId)));
    expect(respuestas.every((r) => r.matriculaId === respuestas[0].matriculaId)).toBe(true);
    const antes = await registros(s.t);
    await s.t.run((ctx) => ctx.db.patch("puntajePeriodo", antes.puntajes[0]._id, { puntajeActual: 58, puntosNegativos: -2 }));
    await aprobar(s, estudianteId);
    const despues = await registros(s.t);
    expect(despues.matriculas).toHaveLength(1);
    expect(despues.puntajes).toHaveLength(2);
    expect(despues.puntajes[0].puntajeActual).toBe(58);
    expect(despues.auditoria).toHaveLength(1);
    await expect(s.docente.mutation(api.nucleo.aprobarEstudiante, { cursoId: s.cursoId, estudianteId, correcciones: { nombres: "Cambio" } })).rejects.toThrow("CONFLICTO");
  });

  it("niega listas y aprobación a otro docente o representante", async () => {
    const s = await escenario();
    const { estudianteId } = await canjear(s);
    for (const cliente of [s.otro, s.representante]) {
      await expect(cliente.query(api.nucleo.listarPendientes, { cursoId: s.cursoId, paginationOpts: pagina })).rejects.toThrow("SIN_PERMISO");
      await expect(cliente.query(api.nucleo.listarEstudiantes, { cursoId: s.cursoId, paginationOpts: pagina })).rejects.toThrow("SIN_PERMISO");
      await expect(cliente.mutation(api.nucleo.aprobarEstudiante, { cursoId: s.cursoId, estudianteId })).rejects.toThrow("SIN_PERMISO");
    }
    expect((await registros(s.t)).matriculas).toHaveLength(0);
  });

  it("aísla pendientes por curso aunque compartan institución y pagina sin filtrar datos ajenos", async () => {
    const s = await escenario();
    const { estudianteId } = await canjear(s);
    const otroPerfil = await s.otro.query(api.nucleo.obtenerPerfil);
    const otroCursoId = await s.t.run(async (ctx) => {
      const curso = (await ctx.db.get("curso", s.cursoId))!;
      const id = await ctx.db.insert("curso", { anioLectivoId: curso.anioLectivoId, nombre: "Quinto B", nivel: "5", paralelo: "B", jornada: "MATUTINA", estado: "ACTIVO", actualizadoEn: AHORA });
      await ctx.db.insert("asignacionDocente", { cursoId: id, docenteId: otroPerfil!.docenteId!, rol: "TITULAR", vigenteDesde: "2026-05-01", actualizadoEn: AHORA });
      return id;
    });
    expect((await s.otro.query(api.nucleo.listarPendientes, { cursoId: otroCursoId, paginationOpts: pagina })).page).toHaveLength(0);
    await expect(s.otro.mutation(api.nucleo.aprobarEstudiante, { cursoId: otroCursoId, estudianteId })).rejects.toThrow("SIN_PERMISO");
    for (let i = 2; i <= 4; i++) await s.representante.mutation(api.nucleo.canjearInvitacion, { ...s.solicitud, solicitudId: `solicitud-prueba-000${i}`, estudiante: { ...hijo, numeroDocumento: `090000001${i}` } });
    const primera = await s.docente.query(api.nucleo.listarPendientes, { cursoId: s.cursoId, paginationOpts: { numItems: 2, cursor: null } });
    const segunda = await s.docente.query(api.nucleo.listarPendientes, { cursoId: s.cursoId, paginationOpts: { numItems: 2, cursor: primera.continueCursor } });
    expect(new Set([...primera.page, ...segunda.page].map((e) => e.estudianteId)).size).toBe(4);
  });

  it("rechaza corrección documental duplicada y revocación de consentimiento sin escrituras parciales", async () => {
    const s = await escenario();
    const primero = await canjear(s);
    const segundo = await s.representante.mutation(api.nucleo.canjearInvitacion, { ...s.solicitud, solicitudId: "solicitud-prueba-0002", estudiante: { ...hijo, numeroDocumento: "0900000011" } });
    await expect(s.docente.mutation(api.nucleo.aprobarEstudiante, { cursoId: s.cursoId, estudianteId: segundo.estudianteId, correcciones: { tipoDocumento: "CEDULA", numeroDocumento: hijo.numeroDocumento } })).rejects.toThrow("CONFLICTO");
    const estado = await registros(s.t);
    const consentimiento = estado.consentimientos.find((c) => c.estudianteId === primero.estudianteId)!;
    await s.t.run((ctx) => ctx.db.patch("consentimiento", consentimiento._id, { revocadoEn: AHORA }));
    await expect(aprobar(s, primero.estudianteId)).rejects.toThrow("CONSENTIMIENTO_REQUERIDO");
    const despues = await registros(s.t);
    expect(despues.matriculas).toHaveLength(0);
    expect(despues.puntajes).toHaveLength(0);
    expect(despues.auditoria).toHaveLength(0);
    expect(despues.estudiantes.every((e) => e.estadoVerificacion === "PENDIENTE")).toBe(true);
  });

  it("no crea puntajes en parciales cerrados ni aprueba sin parciales aplicables", async () => {
    const s = await escenario();
    const { estudianteId } = await canjear(s);
    await s.t.run(async (ctx) => { for (const id of s.periodoIds) await ctx.db.patch("periodoAcademico", id, { estado: "CERRADO" }); });
    await expect(aprobar(s, estudianteId)).rejects.toThrow("PERIODO_NO_VIGENTE");
    expect((await registros(s.t)).matriculas).toHaveLength(0);
  });

  it("fecha la matrícula con el día de Guayaquil, aunque UTC sea el siguiente", async () => {
    const s = await escenario();
    vi.setSystemTime(new Date("2026-09-09T02:00:00Z"));
    const { estudianteId } = await canjear(s);
    await aprobar(s, estudianteId);
    expect((await registros(s.t)).matriculas[0].fechaIngreso).toBe("2026-09-08");
  });

  it("aplica el cupo del plan dentro de la aprobación y respeta un PRO vigente", async () => {
    const s = await escenario();
    await s.t.run((ctx) => ctx.db.insert("plan", {
      codigo: "DOC_FREE", nombre: "Gratis", audiencia: "DOCENTE", periodicidad: "PERPETUO",
      sinPublicidad: false, limites: { estudiantesPorCurso: 1 }, activo: true, actualizadoEn: AHORA,
    }));
    const primero = await canjear(s);
    const segundo = await s.representante.mutation(api.nucleo.canjearInvitacion, { ...s.solicitud,
      solicitudId: "solicitud-prueba-0002", estudiante: { ...hijo, numeroDocumento: "0900000011" } });
    const resultados = await Promise.allSettled([aprobar(s, primero.estudianteId), aprobar(s, segundo.estudianteId)]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultados.filter((r) => r.status === "rejected")).toHaveLength(1);
    let estado = await registros(s.t);
    expect(estado.matriculas).toHaveLength(1);
    expect(estado.auditoria).toHaveLength(1);
    const pendiente = estado.estudiantes.find((e) => e.estadoVerificacion === "PENDIENTE")!;
    await expect(aprobar(s, pendiente._id)).rejects.toThrow("LIMITE_PLAN");
    const suscripcionId = await s.t.run(async (ctx) => {
      const planId = await ctx.db.insert("plan", { codigo: "DOC_PRO", nombre: "Pro", audiencia: "DOCENTE", periodicidad: "MENSUAL",
        sinPublicidad: false, limites: { estudiantesPorCurso: 2 }, activo: true, actualizadoEn: AHORA });
      return await ctx.db.insert("suscripcion", { perfilUsuarioId: s.perfilDocente.perfilUsuarioId, planId, origen: "GOOGLE_PLAY",
        estado: "CANCELADA", iniciaEn: AHORA - 1000, expiraEn: AHORA, renovacionAutomatica: true, actualizadoEn: AHORA });
    });
    await expect(aprobar(s, pendiente._id)).rejects.toThrow("LIMITE_PLAN");
    await s.t.run((ctx) => ctx.db.patch("suscripcion", suscripcionId, { expiraEn: AHORA + 86400000 }));
    await aprobar(s, pendiente._id);
    estado = await registros(s.t);
    expect(estado.matriculas).toHaveLength(2);
    expect(estado.auditoria).toHaveLength(2);
  });

  it("rechaza páginas sin límite razonable", async () => {
    const s = await escenario();
    for (const numItems of [0, 101, 1.5]) {
      await expect(s.docente.query(api.nucleo.listarPendientes, { cursoId: s.cursoId, paginationOpts: { numItems, cursor: null } })).rejects.toThrow("VALIDACION");
    }
  });

  it("impide aprobar y recuperar una solicitud si el vínculo se revocó", async () => {
    const s = await escenario();
    const { estudianteId } = await canjear(s);
    const vinculo = (await registros(s.t)).vinculos[0];
    await s.t.run((ctx) => ctx.db.patch("vinculoRepresentacion", vinculo._id, { estado: "REVOCADO" }));
    await expect(aprobar(s, estudianteId)).rejects.toThrow("SIN_PERMISO");
    await expect(canjear(s)).rejects.toThrow("SIN_VINCULO");
    expect((await s.docente.query(api.nucleo.listarPendientes, { cursoId: s.cursoId, paginationOpts: pagina })).page).toHaveLength(0);
  });


  it("cada representante solo recupera sus hijos y el estado cambia tras aprobar", async () => {
    const s = await escenario();
    const { estudianteId } = await canjear(s);
    const listar = () => s.representante.query(api.nucleo.listarMisEstudiantes, { paginationOpts: pagina });
    expect((await listar()).page[0]).toMatchObject({ estudianteId, cursoId: s.cursoId, matriculaId: null, estadoVerificacion: "PENDIENTE" });
    expect((await s.otro.query(api.nucleo.listarMisEstudiantes, { paginationOpts: pagina })).page).toHaveLength(0);
    const aprobado = await aprobar(s, estudianteId);
    expect((await listar()).page[0]).toMatchObject({ estadoVerificacion: "APROBADO", matriculaId: aprobado.matriculaId });
    const vinculo = (await registros(s.t)).vinculos[0];
    await s.t.run((ctx) => ctx.db.patch("vinculoRepresentacion", vinculo._id, { estado: "REVOCADO" }));
    expect((await listar()).page).toHaveLength(0);
    await expect(s.t.query(api.nucleo.listarMisEstudiantes, { paginationOpts: pagina })).rejects.toThrow("NO_AUTENTICADO");
  });

});

describe("núcleo — límites de acceso y calendario", () => {
  it("admite el último día en Guayaquil y rechaza al llegar la medianoche local", async () => {
    const s = await escenario();
    vi.setSystemTime(new Date("2027-03-01T04:59:59Z"));
    const invitacion = await s.docente.mutation(api.nucleo.crearInvitacion, { cursoId: s.cursoId });
    const solicitud = { ...s.solicitud, credencial: { codigo: invitacion.codigo } };
    const { estudianteId } = await s.representante.mutation(api.nucleo.canjearInvitacion, solicitud);
    await aprobar(s, estudianteId);
    vi.setSystemTime(new Date("2027-03-01T05:00:00Z"));
    await expect(s.representante.mutation(api.nucleo.canjearInvitacion, {
      ...solicitud, solicitudId: "solicitud-prueba-0002",
      estudiante: { ...hijo, numeroDocumento: "0900000011" },
    })).rejects.toThrow("CURSO_INACTIVO");
    expect((await registros(s.t)).estudiantes).toHaveLength(1);
  });

  it("permite preparar inscripciones antes del inicio del año", async () => {
    const s = await escenario();
    vi.setSystemTime(new Date("2026-04-20T15:00:00Z"));
    const invitacion = await s.docente.mutation(api.nucleo.crearInvitacion, { cursoId: s.cursoId });
    const { estudianteId } = await s.representante.mutation(api.nucleo.canjearInvitacion, {
      ...s.solicitud, credencial: { codigo: invitacion.codigo },
    });
    await aprobar(s, estudianteId);
    expect((await registros(s.t)).puntajes).toHaveLength(3);
  });

  it("conserva pendientes y matriculados al paginar entre matrículas terminadas", async () => {
    const s = await escenario();
    const primero = await canjear(s);
    const { matriculaId } = await aprobar(s, primero.estudianteId);
    await s.t.run((ctx) => ctx.db.patch("matricula", matriculaId, { estado: "FINALIZADA" }));
    const segundo = await s.representante.mutation(api.nucleo.canjearInvitacion, {
      ...s.solicitud, solicitudId: "solicitud-prueba-0002",
      estudiante: { ...hijo, numeroDocumento: "0900000011" },
    });
    const listar = (cursor: string | null) => s.representante.query(api.nucleo.listarMisEstudiantes, {
      paginationOpts: { numItems: 1, cursor },
    });
    const primeraPagina = await listar(null);
    expect(primeraPagina.page).toHaveLength(0);
    expect(primeraPagina.isDone).toBe(false);
    expect((await listar(primeraPagina.continueCursor)).page[0]).toMatchObject({
      estudianteId: segundo.estudianteId, estadoVerificacion: "PENDIENTE", matriculaId: null,
    });
    const aprobado = await aprobar(s, segundo.estudianteId);
    expect((await listar(primeraPagina.continueCursor)).page[0]).toMatchObject({
      estudianteId: segundo.estudianteId, estadoVerificacion: "APROBADO", matriculaId: aprobado.matriculaId,
    });
  });

  it.each(["FINALIZADA", "RETIRADA", "TRASLADADA"] as const)("no expone datos después de matrícula %s", async (estado) => {
    const s = await escenario();
    const { estudianteId } = await canjear(s);
    const { matriculaId } = await aprobar(s, estudianteId);
    await s.t.run((ctx) => ctx.db.patch("matricula", matriculaId, { estado }));
    const respuesta = await s.representante.query(api.nucleo.listarMisEstudiantes, { paginationOpts: pagina });
    expect(respuesta.page).toHaveLength(0);
  });

  it("rechaza canjes después del fin del año aunque el código siga vigente", async () => {
    const s = await escenario();
    vi.setSystemTime(new Date("2027-02-20T15:00:00Z"));
    const invitacion = await s.docente.mutation(api.nucleo.crearInvitacion, { cursoId: s.cursoId });
    vi.setSystemTime(new Date("2027-03-01T15:00:00Z"));
    await expect(s.representante.mutation(api.nucleo.canjearInvitacion, {
      ...s.solicitud, credencial: { codigo: invitacion.codigo },
    })).rejects.toThrow("CURSO_INACTIVO");
    await expect(s.representante.mutation(api.nucleo.consultarInvitacion, {
      credencial: { codigo: invitacion.codigo },
    })).rejects.toThrow("CURSO_INACTIVO");
    await expect(s.docente.mutation(api.nucleo.crearInvitacion, {
      cursoId: s.cursoId,
    })).rejects.toThrow("CURSO_INACTIVO");
    expect((await registros(s.t)).estudiantes).toHaveLength(0);
    expect((await s.t.run((ctx) => ctx.db.get("invitacionCurso", invitacion.invitacionId)))?.usosRealizados).toBe(0);
  });
});
