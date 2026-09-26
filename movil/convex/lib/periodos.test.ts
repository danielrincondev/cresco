// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { esVigentePorFecha, periodoVigentePorFecha } from "./periodos";

const modules = import.meta.glob(["../nucleo.ts", "../_generated/*.js"]);

// `crearCurso` resuelve la identidad por `tokenIdentifier` (emisor + subject);
// declarar el emisor de convex-test permite sembrar cuentas por `authSubject`
// a secas, igual que hace `conducta.test.ts`.
beforeEach(() => vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://convex.test"));
afterEach(() => vi.unstubAllEnvs());

type ParcialMinimo = Parameters<typeof esVigentePorFecha>[0];

const PARCIAL: ParcialMinimo = {
  estado: "PLANIFICADO",
  fechaInicio: "2026-09-09",
  fechaFin: "2026-09-30",
};

describe("esVigentePorFecha", () => {
  it("una fecha dentro del rango es vigente, sea cual sea `estado` (salvo cerrado)", () => {
    for (const estado of ["PLANIFICADO", "EN_CURSO"] as const) {
      expect(esVigentePorFecha({ ...PARCIAL, estado }, "2026-09-09")).toBe(true);
      expect(esVigentePorFecha({ ...PARCIAL, estado }, "2026-09-30")).toBe(true);
      expect(esVigentePorFecha({ ...PARCIAL, estado }, "2026-09-20")).toBe(true);
    }
  });

  it("fuera del rango no es vigente", () => {
    expect(esVigentePorFecha(PARCIAL, "2026-09-08")).toBe(false);
    expect(esVigentePorFecha(PARCIAL, "2026-10-01")).toBe(false);
  });

  /**
   * El único caso donde `estado` sí importa: un parcial cerrado no vuelve a
   * abrirse solo porque hoy caiga dentro de sus fechas. Es la única excepción
   * deliberada a "todo se decide por fecha".
   */
  it("cerrado nunca es vigente, aunque la fecha esté dentro de su rango", () => {
    expect(esVigentePorFecha({ ...PARCIAL, estado: "CERRADO" }, "2026-09-15")).toBe(false);
  });
});

/**
 * El escenario se monta con la mutation real (`crearCurso` + `definirPeriodos`
 * en el archivo que sí las ejercita end-to-end, `conducta.test.ts`); aquí
 * basta con `crearCurso` para tener una institución y un año lectivo válidos,
 * y los parciales se insertan directo — es lo único que este módulo necesita
 * probar, sin repetir la validación completa de `definirPeriodos`.
 */
async function anioLectivoDePrueba() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const perfilUsuarioId = await ctx.db.insert("perfilUsuario", {
      authSubject: "docente_periodos", tipoDocumento: "CEDULA", numeroDocumento: "0000000002", actualizadoEn: Date.now(),
    });
    await ctx.db.insert("docente", { perfilUsuarioId, actualizadoEn: Date.now() });
  });
  const curso = await t.withIdentity({ subject: "docente_periodos" }).mutation(api.nucleo.crearCurso, {
    nombreInstitucion: "Escuela de prueba", nombreCurso: "Séptimo A", nivel: "7mo", paralelo: "A",
    anioInicio: "2026-05-04", anioFin: "2027-02-26",
  });
  const anioLectivoId = await t.run(async (ctx) => (await ctx.db.get(curso.id))!.anioLectivoId);
  return { t, anioLectivoId };
}

describe("periodoVigentePorFecha", () => {
  /**
   * La prueba que le faltaba a todo el proyecto: un parcial creado como lo
   * deja `definirPeriodos` (`estado: "PLANIFICADO"`, nunca `"EN_CURSO"` —
   * nada lo transiciona, ver la cabecera de `periodos.ts`) tiene que
   * encontrarse igual que si dijera "EN_CURSO".
   */
  it("encuentra un parcial PLANIFICADO cuya fecha ya llegó", async () => {
    const { t, anioLectivoId } = await anioLectivoDePrueba();
    const id = await t.run(async (ctx) => {
      await ctx.db.insert("periodoAcademico", {
        anioLectivoId, nombre: "Segundo parcial", orden: 2,
        fechaInicio: "2026-10-01", fechaFin: "2026-11-30",
        estado: "PLANIFICADO", actualizadoEn: Date.now(),
      });
      return await ctx.db.insert("periodoAcademico", {
        anioLectivoId, nombre: "Primer parcial", orden: 1,
        fechaInicio: "2026-09-09", fechaFin: "2026-09-30",
        estado: "PLANIFICADO", actualizadoEn: Date.now(),
      });
    });

    const vigente = await t.run((ctx) => periodoVigentePorFecha(ctx, anioLectivoId, "2026-09-15"));
    expect(vigente?._id).toBe(id);
    expect(vigente?.estado).toBe("PLANIFICADO");
  });

  it("sin ningún parcial cubriendo la fecha, devuelve null", async () => {
    const { t, anioLectivoId } = await anioLectivoDePrueba();
    expect(await t.run((ctx) => periodoVigentePorFecha(ctx, anioLectivoId, "2026-09-15"))).toBeNull();
  });

  it("un parcial cerrado no se devuelve, aunque la fecha caiga dentro", async () => {
    const { t, anioLectivoId } = await anioLectivoDePrueba();
    await t.run((ctx) => ctx.db.insert("periodoAcademico", {
      anioLectivoId, nombre: "Primer parcial", orden: 1,
      fechaInicio: "2026-09-01", fechaFin: "2026-09-30",
      estado: "CERRADO", actualizadoEn: Date.now(),
    }));
    expect(await t.run((ctx) => periodoVigentePorFecha(ctx, anioLectivoId, "2026-09-15"))).toBeNull();
  });
});
