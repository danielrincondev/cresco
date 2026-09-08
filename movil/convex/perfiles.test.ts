// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./nucleo.ts", "./_generated/*.js"]);
const datos = { tipoDocumento: "CEDULA" as const, numeroDocumento: "0900000001", roles: ["DOCENTE" as const] };

afterEach(() => vi.unstubAllEnvs());

describe("núcleo — perfiles", () => {
  it("exige autenticación y devuelve null antes del alta", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.nucleo.obtenerPerfil)).rejects.toThrow("NO_AUTENTICADO");
    await expect(t.mutation(api.nucleo.completarPerfil, datos)).rejects.toThrow("NO_AUTENTICADO");
    await expect(t.withIdentity({ subject: "a" }).query(api.nucleo.obtenerPerfil)).resolves.toBeNull();
  });

  it("da de alta una cuenta y permite crear su primer curso sin sembrar perfiles", async () => {
    const t = convexTest(schema, modules);
    const cliente = t.withIdentity({ subject: "a" });
    const perfil = await cliente.mutation(api.nucleo.completarPerfil, datos);
    expect(perfil.docenteId).not.toBeNull();
    expect(perfil.representanteId).toBeNull();
    expect(await cliente.query(api.nucleo.obtenerPerfil)).toEqual(perfil);
    const curso = await cliente.mutation(api.nucleo.crearCurso, {
      nombreInstitucion: "Escuela de prueba", nombreCurso: "Quinto A", nivel: "5", paralelo: "A",
      anioInicio: "2026-05-01", anioFin: "2027-02-28",
    });
    expect((await cliente.query(api.nucleo.listarCursos)).cursos[0].id).toBe(curso.id);
  });

  it("repetir el alta concurrentemente conserva un solo perfil y rol", async () => {
    const t = convexTest(schema, modules);
    const cliente = t.withIdentity({ subject: "a" });
    const respuestas = await Promise.all(Array.from({ length: 3 }, () => cliente.mutation(api.nucleo.completarPerfil, datos)));
    expect(respuestas.every((r) => r.perfilUsuarioId === respuestas[0].perfilUsuarioId)).toBe(true);
    const estado = await t.run(async (ctx) => ({ perfiles: await ctx.db.query("perfilUsuario").collect(), docentes: await ctx.db.query("docente").collect() }));
    expect(estado.perfiles).toHaveLength(1);
    expect(estado.docentes).toHaveLength(1);
  });

  it("añade representante sin borrar docente ni el teléfono anterior", async () => {
    const t = convexTest(schema, modules);
    const cliente = t.withIdentity({ subject: "a" });
    const primero = await cliente.mutation(api.nucleo.completarPerfil, { ...datos, telefono: "0990000000" });
    const ambos = await cliente.mutation(api.nucleo.completarPerfil, { ...datos, roles: ["REPRESENTANTE"] });
    expect(ambos).toMatchObject(primero.docenteId ? { perfilUsuarioId: primero.perfilUsuarioId, docenteId: primero.docenteId } : {});
    expect(ambos.representanteId).not.toBeNull();
    expect((await t.run((ctx) => ctx.db.get("perfilUsuario", ambos.perfilUsuarioId)))?.telefono).toBe("0990000000");
  });

  it("rechaza documento de otra cuenta incluso con solicitudes simultáneas", async () => {
    const t = convexTest(schema, modules);
    const resultados = await Promise.allSettled(["a", "b"].map((subject) => t.withIdentity({ subject }).mutation(api.nucleo.completarPerfil, datos)));
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultados.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("perfilUsuario").collect())).toHaveLength(1);
  });

  it("no permite cambiar identidad ni añadir roles si el documento no coincide", async () => {
    const t = convexTest(schema, modules);
    const cliente = t.withIdentity({ subject: "a" });
    await cliente.mutation(api.nucleo.completarPerfil, datos);
    await expect(cliente.mutation(api.nucleo.completarPerfil, { ...datos, numeroDocumento: "0900000002", roles: ["REPRESENTANTE"] })).rejects.toThrow("CONFLICTO");
    expect((await cliente.query(api.nucleo.obtenerPerfil))?.representanteId).toBeNull();
  });

  it("aísla subjects iguales de emisores distintos", async () => {
    const t = convexTest(schema, modules);
    const a = t.withIdentity({ subject: "a", issuer: "https://issuer-a.test" });
    const b = t.withIdentity({ subject: "a", issuer: "https://issuer-b.test" });
    await a.mutation(api.nucleo.completarPerfil, datos);
    expect(await b.query(api.nucleo.obtenerPerfil)).toBeNull();
    await expect(b.mutation(api.nucleo.completarPerfil, datos)).rejects.toThrow("CONFLICTO");
  });

  it("migra perfiles legados solo para el emisor configurado, conservando ids", async () => {
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://clerk.test");
    const t = convexTest(schema, modules);
    const legado = await t.run(async (ctx) => {
      const perfilUsuarioId = await ctx.db.insert("perfilUsuario", { authSubject: "a", tipoDocumento: "CEDULA", numeroDocumento: datos.numeroDocumento, actualizadoEn: 1 });
      const docenteId = await ctx.db.insert("docente", { perfilUsuarioId, actualizadoEn: 1 });
      return { perfilUsuarioId, docenteId };
    });
    expect(await t.withIdentity({ subject: "a", issuer: "https://otro.test" }).query(api.nucleo.obtenerPerfil)).toBeNull();
    const cliente = t.withIdentity({ subject: "a", issuer: "https://clerk.test" });
    expect(await cliente.mutation(api.nucleo.completarPerfil, datos)).toMatchObject(legado);
    expect((await t.run((ctx) => ctx.db.get("perfilUsuario", legado.perfilUsuarioId)))?.authSubject).toBe("https://clerk.test|a");
  });

  it.each([
    { ...datos, roles: [] },
    { ...datos, roles: ["DOCENTE" as const, "DOCENTE" as const] },
    { ...datos, numeroDocumento: "incorrecto" },
    { ...datos, telefono: "" },
  ])("rechaza datos inválidos sin crear registros (%j)", async (args) => {
    const t = convexTest(schema, modules);
    await expect(t.withIdentity({ subject: "a" }).mutation(api.nucleo.completarPerfil, args)).rejects.toThrow("VALIDACION");
    expect(await t.run((ctx) => ctx.db.query("perfilUsuario").collect())).toHaveLength(0);
  });
});
