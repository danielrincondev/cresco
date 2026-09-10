// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { ErrorPermiso } from "./lib/permisos";
import schema from "./schema";

const modules = import.meta.glob(["./conducta.ts", "./nucleo.ts", "./semillas.ts", "./_generated/*.js"]);
beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-09-10T02:00:00Z")));
afterEach(() => vi.useRealTimers());
async function fixture() {
  const t = convexTest(schema, modules);
  await t.run(async ctx => {
    const perfilUsuarioId = await ctx.db.insert("perfilUsuario", {
      authSubject: "review_docente", tipoDocumento: "CEDULA", numeroDocumento: "0000000000", actualizadoEn: Date.now(),
    });
    await ctx.db.insert("docente", { perfilUsuarioId, actualizadoEn: Date.now() });
  });
  const cliente = t.withIdentity({ subject: "review_docente" });
  const curso = await cliente.mutation(api.nucleo.crearCurso, {
    nombreInstitucion: "Escuela prueba", nombreCurso: "Quinto A", nivel: "5to", paralelo: "A",
    anioInicio: "2026-05-04", anioFin: "2027-02-26",
  });
  await t.mutation(internal.semillas.cargar, {});
  const ids = await t.run(async ctx => {
    const c = (await ctx.db.get(curso.id))!;
    const a = (await ctx.db.get(c.anioLectivoId))!;
    const periodoId = await ctx.db.insert("periodoAcademico", {
      anioLectivoId: a._id, nombre: "Parcial", orden: 1, fechaInicio: "2026-09-01", fechaFin: "2026-09-30", estado: "EN_CURSO", actualizadoEn: Date.now(),
    });
    const estudianteId = await ctx.db.insert("estudiante", {
      institucionId: a.institucionId, tipoDocumento: "SIN_DOCUMENTO", numeroDocumento: "", nombres: "Prueba", apellidos: "Prueba",
      origenRegistro: "DOCENTE_MANUAL", estadoVerificacion: "APROBADO", estado: "ACTIVO", actualizadoEn: Date.now(),
    });
    await ctx.db.insert("matricula", { estudianteId, cursoId: c._id, fechaIngreso: "2026-09-01", estado: "CURSANDO", actualizadoEn: Date.now() });
    const tipo = (await ctx.db.query("tipoAccion").collect()).find(x => x.signo === "POSITIVA")!;
    return { estudianteId, tipoAccionId: tipo._id, periodoId, anioLectivoId: a._id, institucionId: a.institucionId };
  });
  const args = { estudianteId: ids.estudianteId, tipoAccionId: ids.tipoAccionId, descripcion: "Acción de prueba", puntosAplicados: 2, fechaOcurrencia: "2026-09-09" };
  return { t, cliente, ids, args };
}

it("control: registra, recalcula y rechaza superar +4", async () => {
  const { t, cliente, args } = await fixture();
  await cliente.mutation(api.conducta.registrarAccion, args);
  await cliente.mutation(api.conducta.registrarAccion, args);
  await expect(cliente.mutation(api.conducta.registrarAccion, args)).rejects.toThrow("tope");
  expect(await t.run(async ctx => (await ctx.db.query("puntajePeriodo").unique())!.puntajeActual)).toBe(64);
});

it.each(["1900-01-01", "2026-10-01"])("rechaza fecha fuera del período: %s", async fechaOcurrencia => {
  const { cliente, args } = await fixture();
  await expect(cliente.mutation(api.conducta.registrarAccion, { ...args, fechaOcurrencia })).rejects.toMatchObject({ codigo: "PERIODO_CERRADO" });
});

it("debe rechazar un día no lectivo", async () => {
  const { t, cliente, ids, args } = await fixture();
  await t.run(ctx => ctx.db.insert("diaNoLectivo", { anioLectivoId: ids.anioLectivoId, fecha: args.fechaOcurrencia, motivo: "Suspensión", actualizadoEn: Date.now() }));
  await expect(cliente.mutation(api.conducta.registrarAccion, args)).rejects.toMatchObject({ codigo: "DIA_NO_LECTIVO" });
});

it("debe rechazar un tipo de otra institución", async () => {
  const { t, cliente, ids, args } = await fixture();
  await t.run(async ctx => {
    const { _id, _creationTime, ...institucion } = (await ctx.db.get(ids.institucionId))!;
    const otraId = await ctx.db.insert("institucion", { ...institucion, nombreDeclarado: "Otra escuela" });
    await ctx.db.patch(ids.tipoAccionId, { institucionId: otraId });
  });
  await expect(cliente.mutation(api.conducta.registrarAccion, args)).rejects.toMatchObject({ codigo: "VALIDACION" });
});

it.each([1.5, NaN, Infinity, -Infinity, 0, 3, -1])("rechaza puntos inválidos: %s", async puntosAplicados => {
  const { cliente, args } = await fixture();
  await expect(cliente.mutation(api.conducta.registrarAccion, { ...args, puntosAplicados })).rejects.toMatchObject({ codigo: "VALIDACION" });
});

it.each(["", "basura", "2026-9-09", "2026-02-30", "2026-09-09T12:00:00Z"])("rechaza fecha inválida: %s", async fechaOcurrencia => {
  const { cliente, args } = await fixture();
  await expect(cliente.mutation(api.conducta.registrarAccion, { ...args, fechaOcurrencia })).rejects.toMatchObject({ codigo: "FECHAS_INVALIDAS" });
});

it.each(["2026-09-05", "2026-09-06"])("rechaza el fin de semana: %s", async fechaOcurrencia => {
  const { cliente, args } = await fixture();
  await expect(cliente.mutation(api.conducta.registrarAccion, { ...args, fechaOcurrencia })).rejects.toMatchObject({ codigo: "DIA_NO_LECTIVO" });
});

it("rechaza un docente ajeno con ErrorPermiso sin escribir acciones, puntajes ni auditoría", async () => {
  const { t, args } = await fixture();
  await t.run(async ctx => {
    const perfilUsuarioId = await ctx.db.insert("perfilUsuario", {
      authSubject: "docente_ajeno", tipoDocumento: "CEDULA", numeroDocumento: "0000000001", actualizadoEn: Date.now(),
    });
    await ctx.db.insert("docente", { perfilUsuarioId, actualizadoEn: Date.now() });
  });
  await expect(t.withIdentity({ subject: "docente_ajeno" }).mutation(api.conducta.registrarAccion, args)).rejects.toBeInstanceOf(ErrorPermiso);
  const estado = await t.run(async ctx => ({
    acciones: await ctx.db.query("accionRegistrada").collect(),
    puntajes: await ctx.db.query("puntajePeriodo").collect(),
    auditoria: await ctx.db.query("auditoria").filter(q => q.eq(q.field("entidadTipo"), "accionRegistrada")).collect(),
  }));
  expect(estado).toEqual({ acciones: [], puntajes: [], auditoria: [] });
});

it("rechaza solicitudes sin autenticar", async () => {
  const { t, args } = await fixture();
  await expect(t.mutation(api.conducta.registrarAccion, args)).rejects.toMatchObject({ codigo: "NO_AUTENTICADO" });
});

it("usa la fecha de Guayaquil y audita la creación", async () => {
  const { t, cliente, args, ids } = await fixture();
  const { fechaOcurrencia, ...sinFecha } = args;
  const id = await cliente.mutation(api.conducta.registrarAccion, sinFecha);
  const estado = await t.run(async ctx => ({
    accion: await ctx.db.get(id),
    auditoria: await ctx.db.query("auditoria").filter(q => q.eq(q.field("entidadId"), id)).unique(),
  }));
  expect(estado.accion).toMatchObject({ fechaOcurrencia: "2026-09-09", periodoAcademicoId: ids.periodoId });
  expect(estado.auditoria).toMatchObject({ accion: "CREAR", institucionId: ids.institucionId, entidadId: id });
  expect(estado.auditoria?.perfilUsuarioId).toBeDefined();
});

it("suma los signos por separado para el tope diario y excluye acciones anuladas al recalcular", async () => {
  const { t, cliente, args } = await fixture();
  const tipoAccionId = await t.run(async ctx => (await ctx.db.query("tipoAccion").collect()).find(x => x.codigo === "NEG_INDISCIPLINA")!._id);
  const negativa = { ...args, tipoAccionId, puntosAplicados: -3 };
  await cliente.mutation(api.conducta.registrarAccion, args);
  const anulada = await cliente.mutation(api.conducta.registrarAccion, negativa);
  await cliente.mutation(api.conducta.registrarAccion, { ...negativa, puntosAplicados: -2 });
  await expect(cliente.mutation(api.conducta.registrarAccion, { ...negativa, puntosAplicados: -1 })).rejects.toMatchObject({ codigo: "TOPE_DIARIO_ALCANZADO" });
  expect(await t.run(async ctx => (await ctx.db.query("puntajePeriodo").unique())!.puntajeActual)).toBe(57);
  await t.run(ctx => ctx.db.patch(anulada, { estado: "ANULADA", puntosAplicados: 0, resueltaEn: Date.now(), motivoResolucion: "Corrección" }));
  await cliente.mutation(api.conducta.registrarAccion, { ...args, fechaOcurrencia: "2026-09-10" });
  expect(await t.run(async ctx => (await ctx.db.query("puntajePeriodo").unique())!)).toMatchObject({ puntajeActual: 62, puntosPositivos: 4, puntosNegativos: -2 });
});

it.each(["congelado", "cerrado"])("no deja escrituras parciales con puntaje %s", async estado => {
  const { t, cliente, args, ids } = await fixture();
  await cliente.mutation(api.conducta.registrarAccion, args);
  await t.run(async ctx => {
    if (estado === "congelado") {
      const puntaje = (await ctx.db.query("puntajePeriodo").unique())!;
      await ctx.db.patch(puntaje._id, { congelado: true });
    } else {
      await ctx.db.patch(ids.periodoId, { estado: "CERRADO" });
    }
  });
  await expect(cliente.mutation(api.conducta.registrarAccion, args)).rejects.toMatchObject({ codigo: "PERIODO_CERRADO" });
  expect(await t.run(async ctx => (await ctx.db.query("accionRegistrada").collect()).length)).toBe(1);
  expect(await t.run(async ctx => (await ctx.db.query("puntajePeriodo").unique())!.puntajeActual)).toBe(62);
});

it.each(["propia", "ajena", "inactiva"])("valida categoría %s", async caso => {
  const { t, cliente, ids, args } = await fixture();
  await t.run(async ctx => {
    const tipo = (await ctx.db.get(ids.tipoAccionId))!;
    let institucionId = ids.institucionId;
    if (caso === "ajena") {
      const { _id, _creationTime, ...datos } = (await ctx.db.get(ids.institucionId))!;
      institucionId = await ctx.db.insert("institucion", datos);
    }
    await ctx.db.patch(tipo.categoriaAccionId, { institucionId, activa: caso !== "inactiva" });
    await ctx.db.patch(tipo._id, { institucionId: ids.institucionId });
  });
  if (caso === "propia") {
    await expect(cliente.mutation(api.conducta.registrarAccion, args)).resolves.toBeDefined();
  } else {
    await expect(cliente.mutation(api.conducta.registrarAccion, args)).rejects.toMatchObject({ codigo: "VALIDACION" });
  }
});
