// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./conducta.ts", "./nucleo.ts", "./semillas.ts", "./_generated/*.js"]);
/**
 * convex-test firma las identidades con el emisor `https://convex.test`, y
 * desde el PR #42 `perfilActual` las resuelve por `tokenIdentifier` -- emisor
 * + subject --, con respaldo al subject a secas solo para el emisor que
 * declare `CLERK_JWT_ISSUER_DOMAIN`. Declararlo aqui hace que sembrar por
 * `authSubject` siga funcionando, sin que la prueba fije el formato interno de
 * la identidad, que no es asunto suyo.
 */
beforeEach(() => {
  vi.useFakeTimers().setSystemTime(new Date("2026-09-10T02:00:00Z"));
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://convex.test");
});
afterEach(() => vi.unstubAllEnvs());
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
  await expect(cliente.mutation(api.conducta.registrarAccion, { ...args, fechaOcurrencia })).rejects.toMatchObject({ data: { codigo: "PERIODO_CERRADO" } });
});

it("debe rechazar un día no lectivo", async () => {
  const { t, cliente, ids, args } = await fixture();
  await t.run(ctx => ctx.db.insert("diaNoLectivo", { anioLectivoId: ids.anioLectivoId, fecha: args.fechaOcurrencia, motivo: "Suspensión", actualizadoEn: Date.now() }));
  await expect(cliente.mutation(api.conducta.registrarAccion, args)).rejects.toMatchObject({ data: { codigo: "DIA_NO_LECTIVO" } });
});

it("debe rechazar un tipo de otra institución", async () => {
  const { t, cliente, ids, args } = await fixture();
  await t.run(async ctx => {
    const { _id, _creationTime, ...institucion } = (await ctx.db.get(ids.institucionId))!;
    const otraId = await ctx.db.insert("institucion", { ...institucion, nombreDeclarado: "Otra escuela" });
    await ctx.db.patch(ids.tipoAccionId, { institucionId: otraId });
  });
  await expect(cliente.mutation(api.conducta.registrarAccion, args)).rejects.toMatchObject({ data: { codigo: "VALIDACION" } });
});

it.each([1.5, NaN, Infinity, -Infinity, 0, 3, -1])("rechaza puntos inválidos: %s", async puntosAplicados => {
  const { cliente, args } = await fixture();
  await expect(cliente.mutation(api.conducta.registrarAccion, { ...args, puntosAplicados })).rejects.toMatchObject({ data: { codigo: "VALIDACION" } });
});

it.each(["", "basura", "2026-9-09", "2026-02-30", "2026-09-09T12:00:00Z"])("rechaza fecha inválida: %s", async fechaOcurrencia => {
  const { cliente, args } = await fixture();
  await expect(cliente.mutation(api.conducta.registrarAccion, { ...args, fechaOcurrencia })).rejects.toMatchObject({ data: { codigo: "FECHAS_INVALIDAS" } });
});

it.each(["2026-09-05", "2026-09-06"])("rechaza el fin de semana: %s", async fechaOcurrencia => {
  const { cliente, args } = await fixture();
  await expect(cliente.mutation(api.conducta.registrarAccion, { ...args, fechaOcurrencia })).rejects.toMatchObject({ data: { codigo: "DIA_NO_LECTIVO" } });
});

it("rechaza un docente ajeno con ErrorPermiso sin escribir acciones, puntajes ni auditoría", async () => {
  const { t, args } = await fixture();
  await t.run(async ctx => {
    const perfilUsuarioId = await ctx.db.insert("perfilUsuario", {
      authSubject: "docente_ajeno", tipoDocumento: "CEDULA", numeroDocumento: "0000000001", actualizadoEn: Date.now(),
    });
    await ctx.db.insert("docente", { perfilUsuarioId, actualizadoEn: Date.now() });
  });
  // El codigo viaja en `.data`, no como clase cruda: `conErroresPublicos`
  // envuelve en `ConvexError` y esa es la convencion del resto del proyecto
  // (`interaccion`, `nucleo`). La version de #39 era la que se salia.
  await expect(t.withIdentity({ subject: "docente_ajeno" }).mutation(api.conducta.registrarAccion, args))
    .rejects.toMatchObject({ data: { codigo: "SIN_PERMISO" } });
  const estado = await t.run(async ctx => ({
    acciones: await ctx.db.query("accionRegistrada").collect(),
    puntajes: await ctx.db.query("puntajePeriodo").collect(),
    auditoria: await ctx.db.query("auditoria").filter(q => q.eq(q.field("entidadTipo"), "accionRegistrada")).collect(),
  }));
  expect(estado).toEqual({ acciones: [], puntajes: [], auditoria: [] });
});

it("rechaza solicitudes sin autenticar", async () => {
  const { t, args } = await fixture();
  await expect(t.mutation(api.conducta.registrarAccion, args)).rejects.toMatchObject({ data: { codigo: "NO_AUTENTICADO" } });
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
  await expect(cliente.mutation(api.conducta.registrarAccion, { ...negativa, puntosAplicados: -1 })).rejects.toMatchObject({ data: { codigo: "TOPE_DIARIO_ALCANZADO" } });
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
  await expect(cliente.mutation(api.conducta.registrarAccion, args)).rejects.toMatchObject({ data: { codigo: "PERIODO_CERRADO" } });
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
    await expect(cliente.mutation(api.conducta.registrarAccion, args)).rejects.toMatchObject({ data: { codigo: "VALIDACION" } });
  }
});

/* =======================================================================
 * Asistencia, reportes y cierre nocturno (#10)
 *
 * Vienen de `feat/asistencia-reportes-cron`. Se conservan enteras junto a
 * las de arriba: las de main cubren `registrarAccion` (#39) y estas cubren
 * todo lo demas del modulo. El ayudante se llama `sembrar` y el de arriba
 * `fixture`, asi que no chocan.
 * ======================================================================= */

async function sembrar(t: ReturnType<typeof convexTest>) {
  const ids = await t.run(async (ctx) => {
    const ahora = Date.now();
    const perfil = await ctx.db.insert("perfilUsuario", { authSubject: "docente_1", tipoDocumento: "CEDULA", numeroDocumento: "1", actualizadoEn: ahora });
    const docenteId = await ctx.db.insert("docente", { perfilUsuarioId: perfil, actualizadoEn: ahora });
    const institucionId = await ctx.db.insert("institucion", { nombreDeclarado: "Piloto", verificada: false, regimen: "COSTA_INSULAR", ciudad: "GYE", zonaHoraria: "America/Guayaquil", puntajeBase: 60, puntajeMinimo: 0, puntajeMaximo: 100, topeDiarioPositivo: 4, topeDiarioNegativo: 5, estado: "ACTIVA", actualizadoEn: ahora });
    const anio = await ctx.db.insert("anioLectivo", { institucionId, nombre: "2026", fechaInicio: "2026-01-01", fechaFin: "2026-12-31", estado: "EN_CURSO", actualizadoEn: ahora });
    const periodoAcademicoId = await ctx.db.insert("periodoAcademico", { anioLectivoId: anio, nombre: "P1", orden: 1, fechaInicio: "2026-01-01", fechaFin: "2026-12-31", estado: "EN_CURSO", actualizadoEn: ahora });
    const cursoId = await ctx.db.insert("curso", { anioLectivoId: anio, nombre: "5A", nivel: "5", paralelo: "A", jornada: "MATUTINA", estado: "ACTIVO", actualizadoEn: ahora });
    await ctx.db.insert("asignacionDocente", { cursoId, docenteId, rol: "TITULAR", vigenteDesde: "2026-01-01", actualizadoEn: ahora });
    const estudianteId = await ctx.db.insert("estudiante", { institucionId, nombres: "Ana", apellidos: "Pérez", tipoDocumento: "CEDULA", numeroDocumento: "2", origenRegistro: "REPRESENTANTE", estadoVerificacion: "APROBADO", estado: "ACTIVO", actualizadoEn: ahora });
    const matriculaId = await ctx.db.insert("matricula", { estudianteId, cursoId, fechaIngreso: "2026-01-01", estado: "CURSANDO", actualizadoEn: ahora });
    await ctx.db.insert("puntajePeriodo", { matriculaId, periodoAcademicoId, puntajeBase: 60, puntosPositivos: 0, puntosNegativos: 0, puntajeActual: 60, congelado: false, recalculadoEn: ahora });
    const categoria = await ctx.db.insert("categoriaAccion", { institucionId, codigo: "DISCIPLINA", nombre: "Disciplina", aplicaA: "ESTUDIANTE", orden: 1, activa: true, actualizadoEn: ahora });
    const negativaId = await ctx.db.insert("tipoAccion", { institucionId, categoriaAccionId: categoria, codigo: "NEG", nombre: "Neg", signo: "NEGATIVA", puntosDefecto: -1, puntosMin: -3, puntosMax: -1, requiereDescripcion: true, admiteInconformidad: true, cuentaEnBitacora: true, activa: true, actualizadoEn: ahora });
    const positivaId = await ctx.db.insert("tipoAccion", { institucionId, categoriaAccionId: categoria, codigo: "POS", nombre: "Pos", signo: "POSITIVA", puntosDefecto: 1, puntosMin: 1, puntosMax: 2, requiereDescripcion: true, admiteInconformidad: false, cuentaEnBitacora: true, activa: true, actualizadoEn: ahora });
    const plantillaReporteId = await ctx.db.insert("plantillaReporte", { nombre: "Diario", version: 1, activa: true, actualizadoEn: ahora });
    const plantillaCampoId = await ctx.db.insert("plantillaCampo", { plantillaReporteId, codigo: "ANUNCIOS", etiqueta: "Anuncios", tipoDato: "TEXTO_LARGO", orden: 1, activo: true });
    return { estudianteId, matriculaId, periodoAcademicoId, cursoId, negativaId, positivaId, plantillaCampoId };
  });
  return { ...ids, docente: t.withIdentity({ subject: "docente_1" }) };
}

describe("conducta — asistencia, reportes y cierre nocturno (#10)", () => {
  // Dentro del `describe` y no en el nivel superior: un `beforeEach` suelto se
  // aplica a **todas** las pruebas del archivo, y este fijaba el reloj al 15
  // de septiembre por encima del que usan las pruebas de #39, que esperan el
  // 9. Al juntar los dos archivos eso rompia cinco pruebas ajenas.
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-09-15T15:00:00Z")));

  it("rechaza a un docente ajeno", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await t.run(async (ctx) => { const p = await ctx.db.insert("perfilUsuario", { authSubject: "docente_2", tipoDocumento: "CEDULA", numeroDocumento: "9", actualizadoEn: Date.now() }); await ctx.db.insert("docente", { perfilUsuarioId: p, actualizadoEn: Date.now() }); });
    await expect(t.withIdentity({ subject: "docente_2" }).mutation(api.conducta.registrarAccion, { estudianteId: e.estudianteId, tipoAccionId: e.negativaId, descripcion: "Interrumpe", puntosAplicados: -1 })).rejects.toThrow("no pertenece a un curso tuyo");
  });
  it("no deja escribir más allá del tope negativo", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t); const accion = (puntos: number) => e.docente.mutation(api.conducta.registrarAccion, { estudianteId: e.estudianteId, tipoAccionId: e.negativaId, descripcion: "Interrumpe", puntosAplicados: puntos });
    await accion(-3); await accion(-2); await expect(accion(-1)).rejects.toThrow("tope");
    expect(await t.run((ctx) => ctx.db.query("accionRegistrada").collect())).toHaveLength(2);
  });
  it("recalcula desde todas las acciones vigentes", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await e.docente.mutation(api.conducta.registrarAccion, { estudianteId: e.estudianteId, tipoAccionId: e.negativaId, descripcion: "Interrumpe", puntosAplicados: -3 });
    await e.docente.mutation(api.conducta.registrarAccion, { estudianteId: e.estudianteId, tipoAccionId: e.positivaId, descripcion: "Ayuda", puntosAplicados: 2 });
    const puntaje = await t.run((ctx) => ctx.db.query("puntajePeriodo").withIndex("por_matricula_periodo", (q) => q.eq("matriculaId", e.matriculaId).eq("periodoAcademicoId", e.periodoAcademicoId)).unique());
    expect(puntaje?.puntajeActual).toBe(59);
  });
  it("corrige la asistencia del día sin crear una segunda fila", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await e.docente.mutation(api.conducta.tomarAsistencia, { cursoId: e.cursoId, marcas: [{ estudianteId: e.estudianteId, estado: "AUSENTE" }] });
    const resultado = await e.docente.mutation(api.conducta.tomarAsistencia, { cursoId: e.cursoId, marcas: [{ estudianteId: e.estudianteId, estado: "PRESENTE", observacion: "Llegó" }] });
    expect(resultado).toMatchObject({ creadas: 0, actualizadas: 1 });
    const filas = await t.run((ctx) => ctx.db.query("registroAsistencia").collect());
    expect(filas).toHaveLength(1); expect(filas[0]).toMatchObject({ estado: "PRESENTE", observacion: "Llegó" });
  });
  it("muestra a los estudiantes cursando sin marca como pendientes", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    const respuesta = await e.docente.query(api.conducta.asistenciaDelDia, { cursoId: e.cursoId });
    expect(respuesta.estudiantes).toEqual([expect.objectContaining({ estudianteId: e.estudianteId, estado: null, observacion: null })]);
  });
  it("guarda un borrador y publica una fotografía por estudiante", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await e.docente.mutation(api.conducta.guardarReporteGeneral, { cursoId: e.cursoId, valores: [{ plantillaCampoId: e.plantillaCampoId, valorTexto: "Mañana hay evaluación" }] });
    const publicado = await e.docente.mutation(api.conducta.publicarReporteGeneral, { cursoId: e.cursoId });
    expect(publicado.generados).toBe(1);
    expect(await t.run((ctx) => ctx.db.query("reporteEstudiante").collect())).toHaveLength(1);
  });
  it("rechaza notas que superan siete días", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await expect(e.docente.mutation(api.conducta.publicarComunicado, { cursoId: e.cursoId, tipo: "NOTA_PROFESOR", alcance: "CURSO", titulo: "Aviso", contenido: "Texto", diasVisible: 8 })).rejects.toThrow("entre 1 y 7");
  });
  it("el cierre nocturno genera el reporte de una acción sin borrador", async () => {
    const t = convexTest(schema, modules); const e = await sembrar(t);
    await e.docente.mutation(api.conducta.registrarAccion, { estudianteId: e.estudianteId, tipoAccionId: e.negativaId, descripcion: "Interrumpe", puntosAplicados: -1 });
    const primero = await t.mutation(internal.conducta.cierreNocturno, { fecha: "2026-09-15" });
    const segundo = await t.mutation(internal.conducta.cierreNocturno, { fecha: "2026-09-15" });
    expect(primero.generados).toBe(1); expect(segundo.generados).toBe(0);
  });
});
