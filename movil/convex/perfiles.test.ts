// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./nucleo.ts", "./_generated/*.js"]);
const datos = { nombres: "Kenny", apellidos: "Chung", tipoDocumento: "CEDULA" as const, numeroDocumento: "0900000001", roles: ["DOCENTE" as const] };

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
    // #52: sin esto, el representante recibe anotaciones sobre su hijo
    // firmadas por alguien sin nombre.
    expect(perfil).toMatchObject({ nombres: "Kenny", apellidos: "Chung" });
    expect(perfil.docenteId).not.toBeNull();
    expect(perfil.representanteId).toBeNull();
    expect(await cliente.query(api.nucleo.obtenerPerfil)).toEqual(perfil);
    const curso = await cliente.mutation(api.nucleo.crearCurso, {
      nombreInstitucion: "Escuela de prueba", nombreCurso: "Quinto A", nivel: "5", paralelo: "A",
      anioInicio: "2026-05-01", anioFin: "2027-02-28",
    });
    expect((await cliente.query(api.nucleo.listarCursos)).cursos[0].id).toBe(curso.id);
  });

  it("acepta nombres de una letra y permite corregirlos sin cambiar la identidad", async () => {
    const t = convexTest(schema, modules);
    const cliente = t.withIdentity({ subject: "a" });
    const perfil = await cliente.mutation(api.nucleo.completarPerfil, {
      ...datos, nombres: "  A  ", apellidos: "  O  ",
    });
    expect(perfil).toMatchObject({ nombres: "A", apellidos: "O" });
    const corregido = await cliente.mutation(api.nucleo.completarPerfil, {
      ...datos, nombres: "Ana", apellidos: "O'Connor",
    });
    expect(corregido).toMatchObject({
      perfilUsuarioId: perfil.perfilUsuarioId, docenteId: perfil.docenteId,
      nombres: "Ana", apellidos: "O'Connor",
    });
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
    { ...datos, nombres: " " },
    { ...datos, apellidos: " " },
  ])("rechaza datos inválidos sin crear registros (%j)", async (args) => {
    const t = convexTest(schema, modules);
    await expect(t.withIdentity({ subject: "a" }).mutation(api.nucleo.completarPerfil, args)).rejects.toThrow("VALIDACION");
    expect(await t.run((ctx) => ctx.db.query("perfilUsuario").collect())).toHaveLength(0);
  });
});

describe("núcleo — datos profesionales del docente (#52)", () => {
  const alta = async (t: ReturnType<typeof convexTest>) => {
    const cliente = t.withIdentity({ subject: "a" });
    await cliente.mutation(api.nucleo.completarPerfil, datos);
    return cliente;
  };

  /**
   * Estos cuatro campos existian en la tabla `docente` desde el primer esquema
   * y ninguna mutation los escribia: P9 mostraba una ficha vacia porque no
   * habia forma de llenarla.
   */
  it("guarda el título y el horario", async () => {
    const t = convexTest(schema, modules);
    const cliente = await alta(t);
    await cliente.mutation(api.nucleo.actualizarDatosDocente, {
      tituloProfesional: "  Licenciado en Educación Básica  ",
      horarioAtencion: "Martes de 10:00 a 11:00",
    });
    const docente = await t.run((ctx) => ctx.db.query("docente").unique());
    expect(docente).toMatchObject({
      tituloProfesional: "Licenciado en Educación Básica",
      horarioAtencion: "Martes de 10:00 a 11:00",
    });
  });

  /**
   * DP-016: Cresco no guarda ni publica un medio de contacto personal del
   * docente. Una build 1.0.0 todavía manda correo y teléfono: se aceptan para
   * que su formulario no falle, pero se descartan sin validarlos.
   */
  it("descarta el correo y el teléfono que manda una build anterior, sin rechazar el guardado", async () => {
    const t = convexTest(schema, modules);
    const cliente = await alta(t);
    await cliente.mutation(api.nucleo.actualizarDatosDocente, {
      tituloProfesional: "Licenciado",
      correoContacto: "esto-ni-siquiera-es-un-correo",
      telefonoContacto: "0990000000",
    });
    const docente = await t.run((ctx) => ctx.db.query("docente").unique());
    expect(docente?.tituloProfesional).toBe("Licenciado");
    expect(docente?.correoContacto).toBeUndefined();
    expect(docente?.telefonoContacto).toBeUndefined();
  });

  it("un correo o un teléfono guardados antes de DP-016 se borran en el siguiente guardado", async () => {
    const t = convexTest(schema, modules);
    const cliente = await alta(t);
    await t.run(async (ctx) => {
      const docente = (await ctx.db.query("docente").unique())!;
      await ctx.db.patch(docente._id, { correoContacto: "viejo@colegio.edu.ec", telefonoContacto: "0990000000" });
    });
    await cliente.mutation(api.nucleo.actualizarDatosDocente, { horarioAtencion: "Lunes" });
    const docente = await t.run((ctx) => ctx.db.query("docente").unique());
    expect(docente?.correoContacto).toBeUndefined();
    expect(docente?.telefonoContacto).toBeUndefined();
    expect(docente?.horarioAtencion).toBe("Lunes");
  });

  /**
   * Un docente que publicó algo y se arrepiente tiene que poder quitarlo.
   * Cadena vacía lo borra; `undefined` significa "no lo toques", que es lo
   * que manda un formulario que no edita ese campo.
   */
  it("la cadena vacia borra el campo, y no mandarlo lo conserva", async () => {
    const t = convexTest(schema, modules);
    const cliente = await alta(t);
    await cliente.mutation(api.nucleo.actualizarDatosDocente, {
      horarioAtencion: "Martes de 10:00 a 11:00", tituloProfesional: "Licenciado",
    });
    await cliente.mutation(api.nucleo.actualizarDatosDocente, { horarioAtencion: "" });

    const docente = await t.run((ctx) => ctx.db.query("docente").unique());
    expect(docente?.horarioAtencion).toBeUndefined();
    expect(docente?.tituloProfesional).toBe("Licenciado");
  });

  it("un representante no puede editar la ficha de un docente", async () => {
    const t = convexTest(schema, modules);
    const cliente = t.withIdentity({ subject: "b" });
    await cliente.mutation(api.nucleo.completarPerfil, {
      ...datos, numeroDocumento: "0900000002", roles: ["REPRESENTANTE"],
    });
    await expect(
      cliente.mutation(api.nucleo.actualizarDatosDocente, { tituloProfesional: "Doctor" }),
    ).rejects.toThrow();
  });
});
