// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./demo.ts", "./conducta.ts", "./nucleo.ts", "./interaccion.ts", "./semillas.ts",
  "./suscripciones.ts", "./auditoria.ts", "./push.ts", "./_generated/*.js",
]);

const pagina = { numItems: 50, cursor: null };

/** Las dos cuentas nuevas del video, con el catálogo sembrado, y la demostración cargada. */
async function escenario() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.semillas.cargar, {});
  const docente = t.withIdentity({ subject: "andrea" });
  const familia = t.withIdentity({ subject: "rosa" });
  const andrea = await docente.mutation(api.nucleo.completarPerfil, {
    nombres: "Andrea", apellidos: "Salazar", tipoDocumento: "PASAPORTE", numeroDocumento: "ANDREA-1", roles: ["DOCENTE"],
  });
  const rosa = await familia.mutation(api.nucleo.completarPerfil, {
    nombres: "Rosa", apellidos: "Mendoza", tipoDocumento: "PASAPORTE", numeroDocumento: "ROSA-1", roles: ["REPRESENTANTE"],
  });
  const resumen = await t.mutation(internal.demo.cargar, {
    docentePerfilId: andrea.perfilUsuarioId, representantePerfilId: rosa.perfilUsuarioId,
  });
  const hijo = (await familia.query(api.nucleo.listarMisEstudiantes, { paginationOpts: pagina })).page[0];
  return { t, docente, familia, andrea, rosa, resumen, hijo };
}

describe("demo — los datos para grabar el video", () => {
  // Lunes 28 de septiembre de 2026, 10:00 en Guayaquil.
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-09-28T15:00:00Z")));
  afterEach(() => vi.useRealTimers());

  it("carga un curso de 20 estudiantes con una semana de clases detrás", async () => {
    const { docente, resumen } = await escenario();
    expect(resumen).toMatchObject({ estudiantes: 20, hijoDeLaFamilia: "Mateo Andrade Mendoza", reportes: 120 });
    expect(resumen.diasCargados).toHaveLength(6);
    expect(resumen.codigoInvitacion).toMatch(/^DEMO[2-9A-HJ-NP-Z]{8}$/);

    const cursos = await docente.query(api.nucleo.listarCursos, {});
    expect(cursos.cursos).toHaveLength(1);
    expect(cursos.cursos[0]).toMatchObject({ nombre: "Quinto de Básica A", totalEstudiantes: 20 });
    const estudiantes = await docente.query(api.nucleo.listarEstudiantes, { cursoId: resumen.cursoId, paginationOpts: pagina });
    expect(estudiantes.page).toHaveLength(20);
  });

  it("la docente ve su curso vivo: anotaciones, panorama, lecturas, avisos, citas y un reclamo", async () => {
    const { docente, resumen } = await escenario();
    const cursoId = resumen.cursoId;

    expect((await docente.query(api.conducta.anotacionesRecientesDelCurso, { cursoId })).length).toBeGreaterThan(15);
    const panorama = await docente.query(api.conducta.panoramaDelCurso, { cursoId });
    expect(panorama).toMatchObject({ hayPeriodo: true, totalEstudiantes: 20 });
    expect(panorama.topNegativos[0]).toMatchObject({ nombre: "Thiago Moreira Solís", cantidad: 3 });

    const lecturas = await docente.query(api.conducta.lecturasDeReportes, { cursoId });
    expect(lecturas.length).toBeGreaterThan(0);
    expect(JSON.stringify(lecturas)).toContain("abiertos");

    const avisos = await docente.query(api.conducta.comunicadosPublicados, { cursoId });
    expect(avisos.map((a: { titulo: string }) => a.titulo).sort()).toEqual(["Casa abierta de Ciencias", "Reunión de representantes"]);

    const citas = await docente.query(api.interaccion.misCitasDocente, {});
    expect(citas.map((c: { estado: string }) => c.estado).sort()).toEqual(["ATENDIDA", "CANCELADA", "CONFIRMADA", "SOLICITADA", "SOLICITADA"]);
    const reclamos = await docente.query(api.interaccion.inconformidadesDelDocente, {});
    expect(reclamos).toHaveLength(1);
    expect((await docente.query(api.interaccion.misBloquesLibres, { desde: "2026-09-28" })).length).toBeGreaterThanOrEqual(5);

    const novedades = await docente.query(api.interaccion.misNotificaciones, {});
    expect(novedades.map((n: { titulo: string }) => n.titulo).sort()).toEqual(["Nueva solicitud de cita", "Un representante abrió un reclamo"]);
  });

  it("la familia ve a su hijo con reportes, acumulado y a quién pedirle una cita, sin avisos pendientes", async () => {
    const { familia, hijo } = await escenario();
    expect(hijo).toMatchObject({ nombres: "Mateo", apellidos: "Andrade Mendoza", estadoVerificacion: "APROBADO" });
    const estudianteId = hijo.estudianteId;

    // Plan gratuito: dos reportes anteriores, y hay más detrás para mostrar el muro de pago.
    const anteriores = await familia.query(api.conducta.reportesAnteriores, { estudianteId });
    expect(anteriores).toMatchObject({ limite: 2, premium: false });
    expect(anteriores.reportes).toHaveLength(2);

    const acumulado = await familia.query(api.conducta.reporteAcumulado, { estudianteId });
    expect(JSON.stringify(acumulado)).toContain("Buen desempeño");
    expect(JSON.stringify(acumulado)).toContain("63");

    expect(await familia.query(api.interaccion.docenteACargo, { estudianteId })).toMatchObject({
      nombre: "Andrea Salazar", curso: "Quinto de Básica A", horarioAtencion: "Martes y jueves, de 10:00 a 11:00, en el aula.",
    });
    expect((await familia.query(api.interaccion.bloquesDisponibles, { estudianteId, desde: "2026-09-28" })).length).toBeGreaterThanOrEqual(5);
    expect(await familia.query(api.interaccion.misCitasRepresentante, {})).toEqual([]);
    expect(await familia.query(api.interaccion.misNotificaciones, {})).toEqual([]);
    await expect(familia.query(api.conducta.reporteDeHoy, { estudianteId })).resolves.toBeDefined();
  });

  it("la familia puede reclamar en vivo una anotación nueva, como en el video", async () => {
    const { docente, familia, hijo, t } = await escenario();
    const tipo = await t.run(async (ctx) => (await ctx.db.query("tipoAccion").collect()).find((x) => x.codigo === "NEG_INDISCIPLINA")!);
    const accionId = await docente.mutation(api.conducta.registrarAccion, {
      estudianteId: hijo.estudianteId, tipoAccionId: tipo._id, descripcion: "Conversó durante la evaluación.", puntosAplicados: -1,
    });
    await expect(familia.mutation(api.interaccion.abrirInconformidad, {
      accionRegistradaId: accionId, motivo: "CONTEXTO_INCOMPLETO", mensaje: "Me dijo que le preguntó algo a la profesora.",
    })).resolves.toBeDefined();
  });

  it("solo se carga en cuentas nuevas: una segunda vez en la misma cuenta se niega", async () => {
    const { t, andrea, rosa } = await escenario();
    await expect(t.mutation(internal.demo.cargar, {
      docentePerfilId: andrea.perfilUsuarioId, representantePerfilId: rosa.perfilUsuarioId,
    })).rejects.toThrow("ya tiene cursos");
  });
});
