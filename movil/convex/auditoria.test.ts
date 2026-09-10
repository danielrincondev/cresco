// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./auditoria.ts", "./_generated/*.js"]);

const AHORA = new Date("2026-09-09T15:00:00Z");
const MINUTO = 60_000;

/**
 * Un curso con su docente titular, un estudiante matriculado y el
 * representante vinculado. Aparte, un docente y un representante ajenos: son
 * los que prueban que auditar no sirve para sondear estudiantes de otros.
 */
async function sembrarEscenario(t: ReturnType<typeof convexTest>) {
  const ids = await t.run(async (ctx) => {
    const ahora = Date.now();

    const perfil = async (subject: string, documento: string) =>
      await ctx.db.insert("perfilUsuario", {
        authSubject: subject, tipoDocumento: "CEDULA", numeroDocumento: documento,
        actualizadoEn: ahora,
      });

    const perfilDocente = await perfil("docente_1", "0900000001");
    const docenteId = await ctx.db.insert("docente", {
      perfilUsuarioId: perfilDocente, actualizadoEn: ahora,
    });
    const perfilOtroDocente = await perfil("docente_2", "0900000004");
    const otroDocenteId = await ctx.db.insert("docente", {
      perfilUsuarioId: perfilOtroDocente, actualizadoEn: ahora,
    });

    const perfilRep = await perfil("rep_1", "0900000002");
    const representanteId = await ctx.db.insert("representante", {
      perfilUsuarioId: perfilRep, actualizadoEn: ahora,
    });
    const perfilOtroRep = await perfil("rep_2", "0900000003");
    await ctx.db.insert("representante", {
      perfilUsuarioId: perfilOtroRep, actualizadoEn: ahora,
    });

    const institucionId = await ctx.db.insert("institucion", {
      nombreDeclarado: "Unidad Educativa Piloto", verificada: false,
      regimen: "COSTA_INSULAR", ciudad: "Guayaquil", zonaHoraria: "America/Guayaquil",
      puntajeBase: 60, puntajeMinimo: 0, puntajeMaximo: 100,
      topeDiarioPositivo: 4, topeDiarioNegativo: 5,
      estado: "ACTIVA", actualizadoEn: ahora,
    });
    const anioLectivoId = await ctx.db.insert("anioLectivo", {
      institucionId, nombre: "2026-2027", fechaInicio: "2026-05-04", fechaFin: "2027-02-26",
      estado: "EN_CURSO", actualizadoEn: ahora,
    });
    const cursoId = await ctx.db.insert("curso", {
      anioLectivoId, nombre: "Quinto A", nivel: "5to", paralelo: "A",
      jornada: "MATUTINA", estado: "ACTIVO", actualizadoEn: ahora,
    });
    await ctx.db.insert("asignacionDocente", {
      cursoId, docenteId, rol: "TITULAR", vigenteDesde: "2026-05-04", actualizadoEn: ahora,
    });
    const otroCursoId = await ctx.db.insert("curso", {
      anioLectivoId, nombre: "Sexto B", nivel: "6to", paralelo: "B",
      jornada: "MATUTINA", estado: "ACTIVO", actualizadoEn: ahora,
    });
    await ctx.db.insert("asignacionDocente", {
      cursoId: otroCursoId, docenteId: otroDocenteId, rol: "TITULAR",
      vigenteDesde: "2026-05-04", actualizadoEn: ahora,
    });

    const estudianteId = await ctx.db.insert("estudiante", {
      institucionId, nombres: "Ana", apellidos: "Perez",
      tipoDocumento: "CEDULA", numeroDocumento: "0911111111",
      origenRegistro: "REPRESENTANTE", estadoVerificacion: "APROBADO", estado: "ACTIVO",
      actualizadoEn: ahora,
    });
    await ctx.db.insert("matricula", {
      estudianteId, cursoId, fechaIngreso: "2026-05-04",
      estado: "CURSANDO", actualizadoEn: ahora,
    });
    await ctx.db.insert("vinculoRepresentacion", {
      representanteId, estudianteId, parentesco: "MADRE",
      estado: "ACTIVO", vigenteDesde: "2026-05-04", actualizadoEn: ahora,
    });

    return { estudianteId, institucionId, perfilDocente, perfilRep };
  });

  return {
    ...ids,
    docente: t.withIdentity({ subject: "docente_1" }),
    otroDocente: t.withIdentity({ subject: "docente_2" }),
    representante: t.withIdentity({ subject: "rep_1" }),
    otroRepresentante: t.withIdentity({ subject: "rep_2" }),
  };
}

const bitacora = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => await ctx.db.query("auditoria").collect());

/**
 * convex-test firma las identidades con el emisor `https://convex.test`, y
 * `perfilActual` las resuelve por `tokenIdentifier` -- emisor + subject --,
 * con respaldo al subject a secas solo para el emisor que declare
 * `CLERK_JWT_ISSUER_DOMAIN`. Declararlo aqui hace que sembrar por
 * `authSubject` funcione igual antes y despues de ese cambio, sin que la
 * prueba fije el formato interno de la identidad, que no es asunto suyo.
 */
beforeEach(() => {
  vi.useFakeTimers().setSystemTime(AHORA);
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://convex.test");
});
afterEach(() => vi.unstubAllEnvs());

describe("auditoria - LOGIN", () => {
  it("exige sesion", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.auditoria.registrarInicioSesion, {})).rejects.toThrow(
      "Inicia sesión para continuar",
    );
    expect(await bitacora(t)).toHaveLength(0);
  });

  it("no escribe antes de completar el perfil", async () => {
    const t = convexTest(schema, modules);
    const respuesta = await t
      .withIdentity({ subject: "sin_perfil" })
      .mutation(api.auditoria.registrarInicioSesion, {});
    expect(respuesta).toEqual({ registrado: false, motivo: "SIN_PERFIL" });
    expect(await bitacora(t)).toHaveLength(0);
  });

  it("registra el inicio con el perfil y la plataforma", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);

    expect(
      await e.docente.mutation(api.auditoria.registrarInicioSesion, { plataforma: "ANDROID" }),
    ).toEqual({ registrado: true, motivo: null });

    const entradas = await bitacora(t);
    expect(entradas).toHaveLength(1);
    expect(entradas[0]).toMatchObject({
      accion: "LOGIN",
      entidadTipo: "perfilUsuario",
      entidadId: e.perfilDocente,
      perfilUsuarioId: e.perfilDocente,
      datosDespues: { plataforma: "ANDROID" },
    });
  });

  it("agrupa las llamadas repetidas de la misma sesion y vuelve a registrar despues", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);

    await e.representante.mutation(api.auditoria.registrarInicioSesion, {});
    expect(await e.representante.mutation(api.auditoria.registrarInicioSesion, {})).toEqual({
      registrado: false,
      motivo: "YA_REGISTRADO",
    });
    expect(await bitacora(t)).toHaveLength(1);

    vi.setSystemTime(AHORA.getTime() + 31 * MINUTO);
    expect(await e.representante.mutation(api.auditoria.registrarInicioSesion, {})).toEqual({
      registrado: true,
      motivo: null,
    });
    expect(await bitacora(t)).toHaveLength(2);
  });

  it("no confunde el inicio de sesion de dos personas", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);

    await e.docente.mutation(api.auditoria.registrarInicioSesion, {});
    await e.representante.mutation(api.auditoria.registrarInicioSesion, {});

    const entradas = await bitacora(t);
    expect(entradas).toHaveLength(2);
    expect(new Set(entradas.map((entrada) => entrada.perfilUsuarioId))).toEqual(
      new Set([e.perfilDocente, e.perfilRep]),
    );
  });
});

describe("auditoria - LEER_SENSIBLE", () => {
  it("registra la lectura del representante con la institucion del estudiante", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);

    expect(
      await e.representante.mutation(api.auditoria.registrarLecturaSensible, {
        estudianteId: e.estudianteId,
        recurso: "REPORTE_ESTUDIANTE",
      }),
    ).toEqual({ registrado: true });

    const entradas = await bitacora(t);
    expect(entradas).toHaveLength(1);
    expect(entradas[0]).toMatchObject({
      accion: "LEER_SENSIBLE",
      entidadTipo: "estudiante",
      entidadId: e.estudianteId,
      institucionId: e.institucionId,
      perfilUsuarioId: e.perfilRep,
      datosDespues: { recurso: "REPORTE_ESTUDIANTE", rol: "REPRESENTANTE" },
    });
  });

  it("registra al docente titular con su rol", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);

    await e.docente.mutation(api.auditoria.registrarLecturaSensible, {
      estudianteId: e.estudianteId,
      recurso: "BITACORA_ACCIONES",
    });

    expect((await bitacora(t))[0]).toMatchObject({
      perfilUsuarioId: e.perfilDocente,
      datosDespues: { recurso: "BITACORA_ACCIONES", rol: "DOCENTE" },
    });
  });

  it.each([
    ["otro representante", "otroRepresentante"],
    ["un docente de otro curso", "otroDocente"],
  ] as const)("niega la lectura a %s y no deja rastro", async (_caso, quien) => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);

    await expect(
      e[quien].mutation(api.auditoria.registrarLecturaSensible, {
        estudianteId: e.estudianteId,
        recurso: "FICHA_ESTUDIANTE",
      }),
    ).rejects.toThrow("No tienes acceso a la información de este estudiante");

    // Si escribiera antes de negar, la propia bitacora confirmaria que el
    // estudiante existe: seria el sondeo que las guardas evitan.
    expect(await bitacora(t)).toHaveLength(0);
  });

  it("exige perfil aunque la cuenta este autenticada", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);

    await expect(
      t.withIdentity({ subject: "sin_perfil" }).mutation(api.auditoria.registrarLecturaSensible, {
        estudianteId: e.estudianteId,
        recurso: "PUNTAJE_PERIODO",
      }),
    ).rejects.toThrow("aún no completaste tu perfil");
    expect(await bitacora(t)).toHaveLength(0);
  });

  it("agrupa el mismo recurso, separa recursos distintos y reabre pasada la ventana", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const abrir = (recurso: "REPORTE_ESTUDIANTE" | "PUNTAJE_PERIODO") =>
      e.representante.mutation(api.auditoria.registrarLecturaSensible, {
        estudianteId: e.estudianteId,
        recurso,
      });

    await abrir("REPORTE_ESTUDIANTE");
    expect(await abrir("REPORTE_ESTUDIANTE")).toEqual({ registrado: false });
    expect(await abrir("PUNTAJE_PERIODO")).toEqual({ registrado: true });
    expect(await bitacora(t)).toHaveLength(2);

    vi.setSystemTime(AHORA.getTime() + 6 * MINUTO);
    expect(await abrir("REPORTE_ESTUDIANTE")).toEqual({ registrado: true });
    expect(await bitacora(t)).toHaveLength(3);
  });

  it("deja de registrar cuando el vinculo se revoca", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    await e.representante.mutation(api.auditoria.registrarLecturaSensible, {
      estudianteId: e.estudianteId,
      recurso: "FICHA_ESTUDIANTE",
    });

    await t.run(async (ctx) => {
      const vinculo = (await ctx.db.query("vinculoRepresentacion").collect())[0];
      await ctx.db.patch(vinculo._id, { estado: "REVOCADO", actualizadoEn: Date.now() });
    });

    await expect(
      e.representante.mutation(api.auditoria.registrarLecturaSensible, {
        estudianteId: e.estudianteId,
        recurso: "FICHA_ESTUDIANTE",
      }),
    ).rejects.toThrow("No tienes acceso a la información de este estudiante");
    expect(await bitacora(t)).toHaveLength(1);
  });

  it("no distingue un estudiante ajeno de uno sin matricula", async () => {
    const t = convexTest(schema, modules);
    const e = await sembrarEscenario(t);
    const sinCurso = await t.run(async (ctx) =>
      ctx.db.insert("estudiante", {
        institucionId: e.institucionId,
        nombres: "Sin",
        apellidos: "Curso",
        tipoDocumento: "SIN_DOCUMENTO",
        numeroDocumento: "",
        origenRegistro: "DOCENTE_MANUAL",
        estadoVerificacion: "PENDIENTE",
        estado: "ACTIVO",
        actualizadoEn: Date.now(),
      }),
    );

    await expect(
      e.representante.mutation(api.auditoria.registrarLecturaSensible, {
        estudianteId: sinCurso,
        recurso: "FICHA_ESTUDIANTE",
      }),
    ).rejects.toThrow("No tienes acceso a la información de este estudiante");
    expect(await bitacora(t)).toHaveLength(0);
  });
});
